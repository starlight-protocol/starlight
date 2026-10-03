'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { startStudio } = require('../../src/studio/server');
const { FileRunStore, validateMission } = require('../../src/platform');

async function workspace(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight-studio-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return directory;
}

async function start(t, options) {
    const studio = await startStudio(options);
    t.after(() => studio.close());
    const url = new URL(studio.url);
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    return {
        ...studio, origin: url.origin, token,
        async request(route, body, options = {}) {
            const response = await fetch(`${url.origin}${route}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options
            });
            const value = await response.json();
            return { status: response.status, value, headers: response.headers };
        }
    };
}

async function until(fn) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        const value = await fn();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('timed out waiting for Studio');
}

async function finished(studio, id) {
    return until(async () => {
        const response = await studio.request(`/api/runs/${id}`);
        assert.equal(response.status, 200, JSON.stringify(response.value));
        return response.value.status !== 'running' && response.value;
    });
}

async function events(t, studio) {
    const controller = new AbortController();
    const response = await fetch(`${studio.origin}/api/events`, {
        headers: { authorization: `Bearer ${studio.token}` }, signal: controller.signal
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const values = [];
    const reader = response.body.getReader();
    const done = (async () => {
        let buffer = '';
        const decoder = new TextDecoder();
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                buffer += decoder.decode(chunk.value, { stream: true });
                let boundary;
                while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                    const event = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    if (event.startsWith('data: ')) values.push(JSON.parse(event.slice(6)));
                }
            }
        } catch (error) { if (error.name !== 'AbortError') throw error; }
    })();
    t.after(async () => { controller.abort(); await done; });
    return { values, done };
}

test('Studio runs both real presets with live progress, verified artifacts, and persistent history', async t => {
    const outputDir = await workspace(t);
    const studio = await start(t, { outputDir });
    const initial = await studio.request('/api/state');
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.value.runs, []);
    assert.deepEqual(initial.value.presets.map(preset => preset.id), ['data-report', 'service-health']);
    const stream = await events(t, studio);
    const ids = [];
    for (const preset of ['data-report', 'service-health']) {
        const accepted = await studio.request('/api/runs', { preset });
        assert.equal(accepted.status, 202, JSON.stringify(accepted.value));
        const report = await finished(studio, accepted.value.id);
        assert.equal(report.status, 'completed');
        assert.equal(report.steps.length, 2);
        assert(report.steps.every(step => step.status === 'completed'));
        assert.equal(Date.parse(report.deadlineAt) - Date.parse(report.startedAt), 30000);
        const artifact = await studio.request(`/api/runs/${report.id}/artifact`);
        assert.equal(artifact.status, 200);
        assert.equal(artifact.value.text, await fs.readFile(report.steps[1].result.value.path, 'utf8'));
        assert.match(artifact.value.text, preset === 'data-report' ? /Total \(cents\): 5500/ : /- worker: healthy/);
        const cancel = await studio.request(`/api/runs/${report.id}/cancel`, {});
        assert.equal(cancel.status, 409);
        await until(() => stream.values.some(event => event.type === 'run.finished' && event.run.id === report.id));
        const progress = stream.values.filter(event => event.run.id === report.id);
        assert.deepEqual(progress.map(event => event.type), [
            'run.started', 'step.started', 'step.finished', 'step.started', 'step.finished', 'run.finished'
        ]);
        assert.equal(progress[0].run.steps.length, 0, 'event snapshots do not mutate with later steps');
        assert.equal(JSON.stringify(report).includes(studio.token), false);
        if (preset === 'service-health') {
            await until(async () => !(await studio.request('/api/state')).value.activeRuns.length);
            await assert.rejects(fetch(report.mission.context.url), /fetch failed/);
        }
        ids.push(report.id);
    }
    await studio.close();
    const reopened = await start(t, { outputDir });
    const history = await reopened.request('/api/state');
    assert.equal(history.value.activeRuns.length, 0);
    assert.deepEqual(new Set(history.value.runs.map(run => run.id)), new Set(ids));
    assert.equal((await reopened.request(`/api/runs/${ids[0]}`)).value.status, 'completed');
    assert.equal((await reopened.request(`/api/runs/${ids[0]}/artifact`)).status, 404,
        'reopened reports do not authorize arbitrary artifact file reads');
});

test('Studio authenticates every API route and rejects hostile Host, Origin, and file paths', async t => {
    const studio = await start(t, { outputDir: await workspace(t) });
    const id = crypto.randomUUID();
    for (const route of ['/api/state', '/api/events', `/api/runs/${id}`, `/api/runs/${id}/artifact`,
        '/api/validate', '/api/runs', `/api/runs/${id}/cancel`]) {
        const response = await fetch(`${studio.origin}${route}`, { headers: { authorization: 'Bearer wrong' } });
        assert.equal(response.status, 401, route);
        await response.arrayBuffer();
        assert.equal(response.headers.has('access-control-allow-origin'), false);
    }
    for (const route of ['/api/state', '/']) {
        const foreign = await fetch(`${studio.origin}${route}`, {
            headers: { authorization: `Bearer ${studio.token}`, origin: 'https://evil.example' }
        });
        assert.equal(foreign.status, 403);
        await foreign.arrayBuffer();
        const host = await new Promise((resolve, reject) => {
            const request = http.get(`${studio.origin}${route}`, { headers: { host: 'evil.example', authorization: `Bearer ${studio.token}` } }, response => {
                response.resume(); response.on('end', () => resolve(response.statusCode));
            });
            request.once('error', reject);
        });
        assert.equal(host, 403);
    }
    const crossSite = await studio.request('/api/state', undefined, {
        headers: { authorization: `Bearer ${studio.token}`, 'sec-fetch-site': 'cross-site' }
    });
    assert.equal(crossSite.status, 403);
    const sameOrigin = await studio.request('/api/state', undefined, {
        headers: { authorization: `Bearer ${studio.token}`, origin: studio.origin }
    });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get('cache-control'), 'no-store');
    assert.match(sameOrigin.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(sameOrigin.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const route of ['/package.json', '/%2e%2e/package.json', '/api/runs/not-a-uuid', `/api/runs/${id}/artifact?path=package.json`]) {
        assert.equal((await studio.request(route)).status, 404);
    }
});

test('Studio preflight is side-effect free and rejects invalid or oversized requests', async t => {
    let calls = 0;
    const directory = await workspace(t);
    const outputDir = path.join(directory, 'runs');
    const studio = await start(t, { outputDir, agents: [{ name: 'test', canHandle: () => true,
        run: () => { calls++; return { status: 'completed' }; } }] });
    const valid = await studio.request('/api/validate', { mission: { goal: 'Check', steps: ['one', 'two'] } });
    assert.equal(valid.status, 200);
    assert.equal(valid.value.stepCount, 2);
    assert.deepEqual(valid.value.mission.constraints, {});
    assert.equal(calls, 0);
    await assert.rejects(fs.stat(outputDir), { code: 'ENOENT' });
    for (const body of [{}, { mission: { goal: 'x', steps: [] } }, { mission: { goal: 'x' }, extra: true }]) {
        assert.equal((await studio.request('/api/validate', body)).status, 400);
    }
    for (const body of [{}, { preset: 'unknown' }, { preset: 'data-report', mission: { goal: 'x' } },
        { preset: 'data-report', timeoutMs: 0 }, { preset: 'data-report', timeoutMs: null },
        { preset: 'service-health', timeoutMs: 3600001 }, { mission: { goal: 'x', steps: [] } }]) {
        assert.equal((await studio.request('/api/runs', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await studio.request('/api/validate', { mission: { goal: 'x'.repeat(270000) } })).status, 413);
    assert.equal((await studio.request('/api/validate', undefined, { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await studio.request('/api/validate', {}, { body: '{invalid' })).status, 400);
    assert.equal(calls, 0);
    assert.deepEqual((await studio.request('/api/state')).value.runs, []);
    const noAgents = await start(t, { outputDir });
    assert.equal((await noAgents.request('/api/runs', { mission: { goal: 'x' } })).value.error.code, 'NO_AGENTS');
});

test('Studio bounds concurrent missions and cancellation reaches agents without duplicate events', async t => {
    let started = 0;
    let cancelled = 0;
    const studio = await start(t, { outputDir: await workspace(t), agents: [{
        name: 'waiting', capacity: 4, canHandle: () => true,
        run: (_intent, { signal }) => new Promise(resolve => {
            started++;
            signal.addEventListener('abort', () => { cancelled++; resolve({ status: 'completed' }); }, { once: true });
        })
    }] });
    const stream = await events(t, studio);
    const ids = [];
    for (let i = 0; i < 4; i++) {
        const response = await studio.request('/api/runs', { mission: { goal: 'Wait', steps: ['one', 'two'] } });
        assert.equal(response.status, 202);
        ids.push(response.value.id);
    }
    await until(() => started === 4);
    const full = await studio.request('/api/runs', { preset: 'service-health' });
    assert.equal(full.status, 429);
    assert.equal(full.value.error.code, 'RUN_LIMIT');
    assert.equal((await studio.request(`/api/runs/${ids[0]}/cancel`, {})).status, 202);
    const stopped = await finished(studio, ids[0]);
    assert.equal(stopped.status, 'cancelled');
    assert.equal(stopped.steps.length, 1);
    assert.equal(cancelled, 1);
    await until(() => stream.values.some(event => event.type === 'run.finished' && event.run.id === ids[0]));
    assert.equal(stream.values.filter(event => event.type === 'run.started').length, 4);
    const before = Date.now();
    await studio.close();
    assert(Date.now() - before < 3000, 'shutdown is bounded');
    await stream.done;
    assert.equal(cancelled, 4);
    await assert.rejects(fetch(`${studio.origin}/api/state`), /fetch failed/);
});

test('Studio deadline stops custom missions and saved running checkpoints are not treated as live', async t => {
    const outputDir = await workspace(t);
    const studio = await start(t, { outputDir, agents: [{ name: 'stuck', canHandle: () => true,
        run: () => new Promise(() => {}) }] });
    const accepted = await studio.request('/api/runs', { mission: { goal: 'Bounded wait' }, timeoutMs: 30 });
    const report = await finished(studio, accepted.value.id);
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'TIMEOUT');
    const store = new FileRunStore(outputDir);
    const id = crypto.randomUUID();
    await store.create({ id, goal: 'Interrupted', status: 'running', startedAt: new Date().toISOString(),
        mission: validateMission('Interrupted'), steps: [] });
    const state = await studio.request('/api/state');
    assert.equal(state.value.runs.find(run => run.id === id).status, 'running');
    assert.equal(state.value.activeRuns.some(run => run.id === id), false);
    const cancel = await studio.request(`/api/runs/${id}/cancel`, {});
    assert.equal(cancel.status, 409);
    assert.equal(cancel.value.error.code, 'NOT_ACTIVE');
    assert.equal((await studio.request(`/api/runs/${crypto.randomUUID()}/cancel`, {})).status, 404);
});

test('Studio observes persistence failures and prevents execution without a checkpoint', async t => {
    const directory = await workspace(t);
    const outputDir = path.join(directory, 'not-a-directory');
    await fs.writeFile(outputDir, 'occupied');
    let calls = 0;
    const studio = await start(t, { outputDir, agents: [{ name: 'effect', canHandle: () => true,
        run: () => { calls++; return { status: 'completed' }; } }] });
    const stream = await events(t, studio);
    const accepted = await studio.request('/api/runs', { mission: { goal: 'Must checkpoint first' } });
    assert.equal(accepted.status, 202);
    const report = await finished(studio, accepted.value.id);
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'STORE_ERROR');
    assert.equal(calls, 0);
    await until(() => stream.values.some(event => event.type === 'run.persistence_failed'));
    const state = await until(async () => {
        const response = await studio.request('/api/state');
        return !response.value.activeRuns.length && response;
    });
    assert.equal(state.status, 200);
    assert.equal(state.value.storageError.code, 'STORE_ERROR');
    assert.equal(state.value.runs[0].id, report.id);
    assert.equal(state.value.runs[0].status, 'failed');
});

test('Studio current reports override stale persisted history after a save failure', async t => {
    const directory = await workspace(t);
    const outputDir = path.join(directory, 'runs');
    const moved = path.join(directory, 'saved-before-failure');
    const studio = await start(t, { outputDir, agents: [{ name: 'disk-failure', canHandle: () => true,
        async run() {
            // Simulate storage disappearing after the running checkpoint, then restore that
            // stale checkpoint before history is read, without stubbing the store API.
            await fs.rename(outputDir, moved);
            await fs.writeFile(outputDir, 'occupied');
            return { status: 'completed' };
        }
    }] });
    const accepted = await studio.request('/api/runs', { mission: { goal: 'Disk changed' } });
    const report = await finished(studio, accepted.value.id);
    assert.equal(report.error.code, 'STORE_ERROR');
    assert.equal(report.steps[0].status, 'completed');
    await fs.unlink(outputDir);
    await fs.rename(moved, outputDir);
    assert.equal((await new FileRunStore(outputDir).get(report.id)).status, 'running');
    const state = await until(async () => {
        const response = await studio.request('/api/state');
        return !response.value.activeRuns.length && response.value;
    });
    assert.equal(state.runs.find(run => run.id === report.id).status, 'failed');
    assert.equal(state.runs.find(run => run.id === report.id).completedSteps, 1);
});

test('Studio artifact route cannot read custom-agent paths or oversized modified artifacts', async t => {
    const outputDir = await workspace(t);
    const secret = path.join(outputDir, 'secret.txt');
    await fs.writeFile(secret, 'do not serve');
    const studio = await start(t, { outputDir, agents: [{ name: 'arbitrary', canHandle: () => true,
        run: () => ({ status: 'completed', value: { path: secret }, evidence: [{ type: 'file', path: secret }] }) }] });
    const custom = await studio.request('/api/runs', { mission: { goal: 'Custom' } });
    await finished(studio, custom.value.id);
    assert.equal((await studio.request(`/api/runs/${custom.value.id}/artifact`)).status, 404);
    const builtin = await studio.request('/api/runs', { preset: 'data-report' });
    const report = await finished(studio, builtin.value.id);
    await fs.writeFile(report.steps[1].result.value.path, 'x'.repeat(65537));
    assert.equal((await studio.request(`/api/runs/${builtin.value.id}/artifact`)).status, 413);
});
