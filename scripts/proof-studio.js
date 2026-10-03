'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startStudio } = require('../src/studio/server');

async function main() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight studio proof '));
    let started;
    let sawAbort = false;
    const ready = new Promise(resolve => { started = resolve; });
    const studio = await startStudio({ outputDir: directory, agents: [{
        name: 'cancellable-worker', canHandle: intent => intent.goal === 'Wait for cancellation',
        run: (_intent, { signal }) => new Promise(resolve => {
            started();
            signal.addEventListener('abort', () => { sawAbort = true; resolve({ status: 'completed' }); }, { once: true });
        })
    }] });
    const launch = new URL(studio.url);
    const token = new URLSearchParams(launch.hash.slice(1)).get('token');
    const base = launch.origin;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    async function request(route, body) {
        const response = await fetch(base + route, {
            headers, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(10_000)
        });
        const value = await response.json();
        assert(response.ok, JSON.stringify(value));
        return value;
    }
    async function settled(id) {
        for (let attempt = 0; attempt < 200; attempt++) {
            const report = await request(`/api/runs/${id}`);
            if (report.status !== 'running') return report;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error('Studio run did not settle');
    }
    try {
        assert.equal((await fetch(`${base}/api/state`)).status, 401);
        for (const file of ['/', '/app.js', '/style.css']) {
            const asset = await fetch(base + file);
            assert.equal(asset.status, 200);
            assert((await asset.text()).length > 100);
        }
        const validation = await request('/api/validate', { mission: { goal: 'Check', steps: ['One', 'Two'] } });
        assert.equal(validation.stepCount, 2);
        const order = await settled((await request('/api/runs', { preset: 'data-report' })).id);
        assert.equal(order.status, 'completed');
        assert.deepEqual(order.steps[0].result.value, { count: 3, totalCents: 5500 });
        assert.match((await request(`/api/runs/${order.id}/artifact`)).text, /Total \(cents\): 5500/);
        const health = await settled((await request('/api/runs', { preset: 'service-health' })).id);
        assert.equal(health.status, 'completed');
        assert.equal(health.steps[1].result.value.services, 3);
        const pending = await request('/api/runs', { mission: 'Wait for cancellation' });
        let startTimer;
        try {
            await Promise.race([ready, new Promise((_, reject) => {
                startTimer = setTimeout(() => reject(new Error('Cancellation worker did not start')), 5000);
            })]);
        } finally { clearTimeout(startTimer); }
        await request(`/api/runs/${pending.id}/cancel`, {});
        assert.equal((await settled(pending.id)).status, 'cancelled');
        assert.equal(sawAbort, true);
        const state = await request('/api/state');
        assert(state.runs.some(run => run.id === order.id && run.status === 'completed'));
        process.stdout.write(JSON.stringify({ ok: true, proof: 'mission-studio', presets: 2,
            artifactPreview: true, cancellation: true, persistedHistory: true }) + '\n');
    } finally {
        await studio.close();
        await fs.rm(directory, { recursive: true, force: true });
    }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
