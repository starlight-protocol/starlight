'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../../bin/starlight-platform.js');
function workspace(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlight-cli-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}
function run(cwd, args) {
    return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 15_000 });
}

test('CLI demo produces a verified artifact and inspect reads the saved report', t => {
    const cwd = workspace(t);
    const demo = run(cwd, ['demo']);
    assert.equal(demo.status, 0, demo.stderr || demo.error?.message);
    const report = JSON.parse(demo.stdout);
    assert.equal(report.status, 'completed');
    assert.deepEqual(report.steps[0].result.value, { count: 3, totalCents: 5500 });
    assert.match(fs.readFileSync(report.steps[1].result.value.path, 'utf8'), /Orders: 3\nTotal \(cents\): 5500/);
    const inspect = run(cwd, ['inspect', report.id]);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.deepEqual(JSON.parse(inspect.stdout), JSON.parse(fs.readFileSync(report.reportPath, 'utf8')));
    assert.equal(run(cwd, ['demo']).status, 0, 'repeated demos use fresh paths');
});

test('CLI loads CommonJS and ESM agents and persists failed runs with partial history', t => {
    const cwd = workspace(t);
    for (const [extension, prefix] of [['cjs', 'module.exports ='], ['mjs', 'export default']]) {
        const agentPath = path.join(cwd, `agent.${extension}`);
        fs.writeFileSync(agentPath, `${prefix} {
            name: 'custom', canHandle: () => true,
            run: intent => intent.goal === 'first'
                ? { status: 'completed', value: 7 }
                : { status: 'failed', error: 'deliberate failure', evidence: ['reason'] }
        };`);
        const listing = run(cwd, ['agents', '--agents', agentPath]);
        assert.equal(listing.status, 0, listing.stderr);
        assert.equal(JSON.parse(listing.stdout)[0].name, 'custom');
        const missionPath = path.join(cwd, 'mission.json');
        fs.writeFileSync(missionPath, JSON.stringify({ goal: 'Check failure', steps: ['first', 'second', 'third'] }));
        const failed = run(cwd, ['run', missionPath, '--agents', agentPath, '--output-dir', 'reports']);
        assert.equal(failed.status, 1, failed.stderr);
        const report = JSON.parse(failed.stdout);
        assert.equal(report.status, 'failed');
        assert.deepEqual(report.steps.map(step => step.status), ['completed', 'failed']);
        assert.equal(report.steps[0].result.value, 7);
        assert.equal(JSON.parse(fs.readFileSync(report.reportPath)).error.message, 'deliberate failure');
    }
});

test('CLI rejects invalid commands, missing agents, and traversal in run IDs', t => {
    const cwd = workspace(t);
    for (const args of [['unknown'], ['run', 'mission.json'], ['demo', '--typo', 'x'],
        ['inspect', '../secret'], ['demo', 'extra'], ['runs', '--status', 'unknown'],
        ['runs', '--limit', '0'], ['runs', '--offset', '-1'], ['inspect', 'id', '--events'],
        ['demo', '--timeout-ms', 'Infinity'], ['demo', '--timeout-ms', '0']]) {
        const result = run(cwd, args);
        assert.equal(result.status, 1, `unexpected success: ${args.join(' ')}`);
        assert(result.stderr.trim());
    }
});

test('CLI emits progress separately from JSON output and lists persisted history', t => {
    const cwd = workspace(t);
    assert.deepEqual(JSON.parse(run(cwd, ['runs']).stdout), []);
    const result = run(cwd, ['demo', '--events', '--timeout-ms', '10000']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const events = result.stderr.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events[0].type, 'run.started');
    assert.equal(events.at(-1).type, 'run.finished');
    assert.equal(events.at(-1).run.id, report.id);
    assert(report.deadlineAt);
    const listing = run(cwd, ['runs', '--status', 'completed', '--limit', '1']);
    assert.equal(listing.status, 0, listing.stderr);
    assert.equal(JSON.parse(listing.stdout)[0].id, report.id);
    assert.equal(JSON.parse(listing.stdout)[0].completedSteps, 2);
    assert.deepEqual(JSON.parse(run(cwd, ['runs', '--offset', '1']).stdout), []);
});

test('CLI saves timed-out missions and exits unsuccessfully', t => {
    const cwd = workspace(t);
    fs.writeFileSync(path.join(cwd, 'agents.cjs'), `module.exports = {
        name: 'slow', canHandle: () => true, run: () => new Promise(() => {})
    };`);
    fs.writeFileSync(path.join(cwd, 'mission.json'), JSON.stringify({ goal: 'Deadline' }));
    const result = run(cwd, ['run', 'mission.json', '--agents', 'agents.cjs', '--timeout-ms', '100']);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'TIMEOUT');
    assert.equal(JSON.parse(fs.readFileSync(report.reportPath)).error.code, 'TIMEOUT');
});

test('CLI preflight validates plans without loading agents or creating reports', t => {
    const cwd = workspace(t);
    fs.writeFileSync(path.join(cwd, 'mission.json'), JSON.stringify({ goal: 'Check', steps: ['One', 'Two'] }));
    const valid = run(cwd, ['validate', 'mission.json']);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).stepCount, 2);
    assert.equal(fs.existsSync(path.join(cwd, '.starlight')), false);
    assert.equal(run(cwd, ['validate', 'mission.json', '--agents', 'untrusted.cjs']).status, 1);
    fs.writeFileSync(path.join(cwd, 'mission.json'), JSON.stringify({ goal: 'Invalid', steps: [] }));
    assert.equal(run(cwd, ['validate', 'mission.json']).status, 1);
});

test('service-health demo fetches a real endpoint and verifies a saved report', t => {
    const cwd = workspace(t);
    const demo = run(cwd, ['demo', '--example', 'service-health', '--timeout-ms', '10000']);
    assert.equal(demo.status, 0, demo.stderr || demo.error?.message);
    const report = JSON.parse(demo.stdout);
    assert.equal(report.status, 'completed');
    assert.equal(report.steps[0].result.sentinel.name, 'service-health-reader');
    assert.equal(report.steps[0].result.evidence[0].status, 200);
    assert.equal(report.steps[1].result.value.services, 3);
    assert.match(fs.readFileSync(report.steps[1].result.value.path, 'utf8'), /- api: healthy\n- queue: healthy\n- worker: healthy/);
    assert.equal(run(cwd, ['demo', '--example', 'unknown']).status, 1);
    assert.equal(run(cwd, ['demo', '--example', 'service-health', '--timeout-ms', '0']).status, 1);
});

test('CLI starts authenticated Studio on an ephemeral port and loads a relative agent module', { timeout: 20_000 }, async t => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'starlight studio cli-'));
    fs.writeFileSync(path.join(cwd, 'agents.cjs'), `module.exports = {
        name: 'studio-custom', canHandle: () => true,
        run: () => ({ status: 'completed', value: 'from the CLI agent' })
    };`);
    const child = spawn(process.execPath, [cli, 'studio', '--port', '0', '--agents', 'agents.cjs',
        '--output-dir', 'studio reports'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const closed = new Promise(resolve => child.once('close', resolve));
    t.after(async () => {
        child.kill();
        let timer;
        try {
            await Promise.race([closed, new Promise((_, reject) => {
                timer = setTimeout(() => {
                    child.kill('SIGKILL');
                    reject(new Error('Studio CLI did not stop within five seconds'));
                }, 5_000);
            })]);
        } finally {
            clearTimeout(timer);
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const launch = await new Promise((resolve, reject) => {
        let stdout = '';
        const finish = (error, value) => {
            clearTimeout(timer);
            child.stdout.removeListener('data', onData);
            child.removeListener('error', onError);
            child.removeListener('exit', onExit);
            if (error) reject(error); else resolve(value);
        };
        const onError = error => finish(error);
        const onExit = code => finish(new Error(`Studio CLI exited before startup (${code}): ${stderr}`));
        const onData = chunk => {
            stdout += chunk;
            const match = stdout.match(/^http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]{64}$/m);
            if (match && stdout.includes(`Reports: ${path.join(cwd, 'studio reports')}`)) {
                finish(undefined, { url: new URL(match[0]), stdout });
            }
        };
        const timer = setTimeout(() => finish(new Error(`Studio CLI startup timed out: ${stderr}`)), 10_000);
        child.once('error', onError);
        child.once('exit', onExit);
        child.stdout.setEncoding('utf8').on('data', onData);
    });
    assert.notEqual(launch.url.port, '0');
    assert(launch.stdout.includes(`Reports: ${path.join(cwd, 'studio reports')}`));
    const token = new URLSearchParams(launch.url.hash.slice(1)).get('token');
    const response = await fetch(`${launch.url.origin}/api/state`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000)
    });
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.deepEqual(state.agents.map(agent => agent.name), ['studio-custom']);
    assert.deepEqual(state.activeRuns, []);
    assert.deepEqual(state.runs, []);
});

test('CLI rejects malformed and out-of-range Studio ports', t => {
    const cwd = workspace(t);
    for (const port of ['invalid', '1.5', '-1', '65536']) {
        const result = run(cwd, ['studio', '--port', port]);
        assert.equal(result.status, 1, `unexpected success for port ${port}`);
        assert.match(result.stderr, /port.*integer/);
    }
});
