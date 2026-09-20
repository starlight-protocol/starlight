#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { AgentPlatform, FileRunStore } = require('../src/platform');

function usage() {
    process.stdout.write(`Starlight agent platform

Usage:
  starlight demo [--output-dir <directory>]
  starlight run <mission.json> --agents <agents.js> [--output-dir <directory>]
  starlight agents --agents <agents.js>
  starlight inspect <run-id> [--output-dir <directory>]
  starlight runs [--status <status>] [--limit <count>] [--offset <count>] [--output-dir <directory>]

Run/demo options: --timeout-ms <milliseconds> (whole mission), --events (JSONL on stderr).

Agent modules export an agent or an array of agents (CommonJS or ESM).
Atomic progress reports default to .starlight/runs. Paths resolve from the working directory.
Saved 'running' means unfinished at the last checkpoint, not proof of a live process.
Agent modules execute trusted local code with this process's permissions.
`);
}

function parse(args) {
    const positional = [];
    const flags = {};
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (!arg.startsWith('--')) { positional.push(arg); continue; }
        if (arg === '--events') {
            if (flags[arg]) throw new Error('--events must appear once');
            flags[arg] = true;
            continue;
        }
        if (!['--agents', '--output-dir', '--timeout-ms', '--status', '--limit', '--offset'].includes(arg)) {
            throw new Error(`unknown option: ${arg}`);
        }
        if (!args[index + 1] || args[index + 1].startsWith('--') || flags[arg]) {
            throw new Error(`${arg} requires one value and must appear once`);
        }
        flags[arg] = args[++index];
    }
    return { positional, flags };
}

async function loadAgents(platform, filename) {
    const module = await import(pathToFileURL(path.resolve(filename)).href);
    const agents = Array.isArray(module.default) ? module.default : [module.default];
    if (!agents.length) throw new Error('agent module must export at least one agent');
    for (const agent of agents) platform.register(agent);
}

async function main(args = process.argv.slice(2)) {
    if (!args.length || args.includes('--help') || args.includes('-h')) { usage(); return; }
    const { positional, flags } = parse(args);
    const [command, input] = positional;
    const outputDir = path.resolve(flags['--output-dir'] || '.starlight/runs');
    const allowed = {
        demo: ['--output-dir', '--timeout-ms', '--events'],
        run: ['--agents', '--output-dir', '--timeout-ms', '--events'],
        agents: ['--agents'], inspect: ['--output-dir'],
        runs: ['--output-dir', '--status', '--limit', '--offset']
    };
    if (!Object.hasOwn(allowed, command)) throw new Error(`unknown command: ${command}`);
    if (positional.length !== (['run', 'inspect'].includes(command) ? 2 : 1)) {
        throw new Error(`invalid arguments for ${command}; see starlight --help`);
    }
    for (const flag of Object.keys(flags)) {
        if (!allowed[command].includes(flag)) throw new Error(`${command} does not accept ${flag}`);
    }
    const integer = flag => {
        if (flags[flag] === undefined) return undefined;
        if (!/^\d+$/.test(flags[flag]) || !Number.isSafeInteger(Number(flags[flag]))) {
            throw new Error(`${flag} requires an integer`);
        }
        return Number(flags[flag]);
    };
    const store = new FileRunStore(outputDir);
    if (command === 'inspect') {
        const report = await store.get(input);
        if (!report) throw new Error(`run not found: ${input}`);
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        return;
    }
    if (command === 'runs') {
        const reports = await store.list({ status: flags['--status'], limit: integer('--limit'), offset: integer('--offset') });
        process.stdout.write(JSON.stringify(reports, null, 2) + '\n');
        return;
    }
    const platform = new AgentPlatform({ store });
    if (flags['--events']) platform.subscribe(event => process.stderr.write(JSON.stringify(event) + '\n'));
    let mission;
    if (command === 'demo') {
        const example = path.resolve(__dirname, '../examples/data-report');
        await loadAgents(platform, path.join(example, 'agents.cjs'));
        const template = JSON.parse(await fs.readFile(path.join(example, 'mission.json'), 'utf8'));
        const artifactDir = path.join(outputDir, 'artifacts');
        await fs.mkdir(artifactDir, { recursive: true });
        mission = { ...template, context: {
            inputPath: path.join(example, 'orders.json'),
            outputPath: path.join(artifactDir, `${crypto.randomUUID()}.md`)
        } };
    } else {
        if (!flags['--agents']) throw new Error(`${command} requires --agents <agents.js>`);
        await loadAgents(platform, flags['--agents']);
        if (command === 'agents') {
            process.stdout.write(JSON.stringify(platform.agents(), null, 2) + '\n');
            return;
        }
        mission = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'));
    }
    const handle = platform.submit(mission, { timeoutMs: integer('--timeout-ms') });
    const reportPath = store.pathFor(handle.id);
    const cancel = () => handle.cancel();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
        const report = await handle.done;
        process.stdout.write(JSON.stringify({ ...report, reportPath }, null, 2) + '\n');
        if (report.status !== 'completed') process.exitCode = 1;
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}

if (require.main === module) main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});

module.exports = { main };
