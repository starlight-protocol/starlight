'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { AgentPlatform, FileRunStore, ProtocolHub, Sentinel, digestToken } = require('../..');

async function workspace(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starlight reliability '));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return directory;
}

const agent = { name: 'worker', canHandle: () => true, run: () => ({ status: 'completed', value: 7 }) };

test('checkpoints precede effects and include verified results before the next step', async t => {
    const store = new FileRunStore(await workspace(t));
    const platform = new AgentPlatform({ store, maxRuns: 1 });
    const events = [];
    platform.subscribe(event => { events.push(event); assert(Object.isFrozen(event.run.steps)); });
    platform.subscribe(() => { throw new Error('broken observer'); });
    platform.subscribe(async () => { throw new Error('broken asynchronous observer'); });
    platform.register({ ...agent, run: async intent => {
        const disk = await store.get(intent.context.mission.id);
        assert.equal(disk.steps.at(-1).status, 'running');
        if (intent.context.mission.step === 2) assert.equal(disk.steps[0].result.value, 7);
        return agent.run();
    } });
    const report = await platform.run({ goal: 'Checkpoint', steps: ['One', 'Two'] });
    assert.deepEqual(await store.get(report.id), report);
    assert.deepEqual(events.map(event => event.type), [
        'run.started', 'step.started', 'step.finished', 'step.started', 'step.finished', 'run.finished'
    ]);
    assert.equal(events[0].run.steps.length, 0, 'event snapshots do not change later');
    assert.equal(report.steps[0].durationMs >= 0, true);
    await platform.run('Evict from memory');
    assert.equal(platform.getRun(report.id), undefined);
    assert.equal((await new FileRunStore(store.directory).get(report.id)).status, 'completed');
});

test('store failures prevent new effects and expose partial progress without claiming persistence', async () => {
    for (const failAt of [1, 2, 3, 4, 6]) {
        let writes = 0;
        let effects = 0;
        const save = () => { if (++writes === failAt) throw new Error('disk full'); };
        const platform = new AgentPlatform({ store: { create: save, save } });
        platform.register({ ...agent, run: () => { effects++; return agent.run(); } });
        const handle = platform.submit({ goal: 'Write once', steps: ['One', 'Two'] });
        await assert.rejects(handle.done, error => error.code === 'STORE_ERROR' && error.details.runId === handle.id);
        assert.equal(effects, failAt < 3 ? 0 : failAt === 6 ? 2 : 1);
        const report = platform.getRun(handle.id);
        assert.equal(report.status, 'failed');
        assert.equal(report.error.code, 'STORE_ERROR');
        if (effects) assert.equal(report.steps[0].result.value, 7);
    }
});

test('a late result cannot beat the deadline by blocking the event loop', async () => {
    const platform = new AgentPlatform();
    platform.register({ ...agent, run: () => {
        const end = Date.now() + 25;
        while (Date.now() < end) { /* simulate a synchronous agent that ignores its signal */ }
        return agent.run();
    } });
    const report = await platform.run('Late result', { timeoutMs: 10 });
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'TIMEOUT');
    assert.equal(report.steps[0].result.value, 7, 'retain evidence of the late effect');
});

test('a terminal report remains active until its final write settles', async () => {
    let release;
    let ready;
    const writing = new Promise(resolve => { ready = resolve; });
    const platform = new AgentPlatform({ maxRuns: 1, store: {
        create() {}, save(report) {
            if (report.finishedAt) { ready(); return new Promise(resolve => { release = resolve; }); }
        }
    } });
    platform.register(agent);
    const handle = platform.submit('Persist');
    await writing;
    assert.throws(() => platform.submit('Cannot evict'), error => error.code === 'RESOURCE_EXHAUSTED');
    release();
    await handle.done;
});

test('mission deadlines cover multiple steps and abort remote execution', async t => {
    const platform = new AgentPlatform();
    platform.register({ ...agent, canHandle: intent => intent.goal === 'First' });
    const token = 'mission-timeout-test-token-1234567890';
    const hub = new ProtocolHub({ port: 0, coordinator: platform.coordinator, tokenDigests: [digestToken(token)] });
    const { url } = await hub.start();
    let cancelled;
    const aborted = new Promise(resolve => { cancelled = resolve; });
    const remote = new Sentinel({ url, token, name: 'remote', canHandle: intent => intent.goal !== 'First',
        handle: (_intent, { signal }) => new Promise(resolve => {
            signal.addEventListener('abort', () => { cancelled(); resolve(agent.run()); }, { once: true });
        }) });
    t.after(async () => { remote.close(); await hub.close(); });
    await remote.connect();
    const report = await platform.run({ goal: 'Bound whole mission', steps: ['First', 'Second', 'Never'] }, { timeoutMs: 200 });
    assert.equal(report.status, 'failed');
    assert.equal(report.error.code, 'TIMEOUT');
    assert.deepEqual(report.steps.map(step => step.status), ['completed', 'failed']);
    await aborted;
});

test('deadline includes checkpoint delay and invalid budgets fail before submission', async () => {
    let effects = 0;
    const platform = new AgentPlatform({ store: {
        create: () => new Promise(resolve => setTimeout(resolve, 30)), save() {}
    } });
    platform.register({ ...agent, run: () => { effects++; return agent.run(); } });
    for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, '100', 86_400_001]) {
        assert.throws(() => platform.submit('Invalid', { timeoutMs }), error => error.code === 'INVALID_REQUEST');
    }
    assert.deepEqual(platform.listRuns(), []);
    const report = await platform.run('Too late', { timeoutMs: 5 });
    assert.equal(report.error.code, 'TIMEOUT');
    assert.equal(report.steps.length, 0);
    assert.equal(effects, 0);
});

test('store preserves old snapshots on invalid writes, rejects collisions and traversal, and paginates summaries', async t => {
    const store = new FileRunStore(await workspace(t));
    assert.deepEqual(await store.list(), []);
    const platform = new AgentPlatform({ store });
    const failed = await platform.run('No agent');
    platform.register(agent);
    const completed = await platform.run('Work');
    assert.equal((await store.list({ status: 'failed' }))[0].id, failed.id);
    const listing = await store.list({ limit: 1 });
    assert.equal(listing.length, 1);
    assert.equal((await store.list({ offset: 1 })).length, 1);
    assert.equal((await store.list({ status: 'completed' }))[0].completedSteps, 1);
    await assert.rejects(store.create(completed), error => error.code === 'EEXIST');
    await assert.rejects(store.save({ ...completed, status: 'fiction' }));
    assert.deepEqual(await store.get(completed.id), completed);
    await assert.rejects(store.get('../secret'));
    await assert.rejects(store.list({ limit: 0 }));
    await assert.rejects(store.list({ status: 'fiction' }));
    assert.equal((await fs.readdir(store.directory)).some(name => name.endsWith('.tmp')), false);
    await fs.writeFile(store.pathFor(completed.id), '{corrupt');
    await assert.rejects(store.get(completed.id), /cannot read run/);
    await assert.rejects(store.list(), /cannot read run/);
});

test('readers see whole snapshots while the owner updates a checkpoint', async t => {
    const store = new FileRunStore(await workspace(t));
    const report = await new AgentPlatform({ store }).run('No agent');
    const writer = async () => {
        for (let revision = 0; revision < 20; revision++) await store.save({ ...report, revision });
    };
    const reader = async () => {
        for (let index = 0; index < 50; index++) {
            const saved = await store.get(report.id);
            assert.equal(saved.id, report.id);
            assert.equal(saved.status, 'failed');
            assert.deepEqual(saved.steps, report.steps);
        }
    };
    await Promise.all([writer(), reader()]);
    assert.equal((await store.get(report.id)).revision, 19);
});

test('a killed CLI process leaves a readable checkpoint with completed history and no automatic replay', { timeout: 15000 }, async t => {
    const directory = await workspace(t);
    await fs.writeFile(path.join(directory, 'agents.cjs'), `module.exports = {
        name: 'crash-worker', canHandle: () => true, run: intent => {
            if (intent.goal === 'First') return { status: 'completed', value: 'kept' };
            require('node:fs').writeFileSync('effect.txt', 'created');
            return new Promise(() => { setInterval(() => {}, 1000); });
        }
    };`);
    await fs.writeFile(path.join(directory, 'mission.json'), JSON.stringify({ goal: 'Crash', steps: ['First', 'Hang'] }));
    const child = spawn(process.execPath, [path.resolve(__dirname, '../../bin/starlight-platform.js'),
        'run', 'mission.json', '--agents', 'agents.cjs', '--events'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(child, 'exit');
    t.after(async () => { if (child.exitCode === null) child.kill('SIGKILL'); await exited; });
    let text = '';
    let id;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child did not reach second step')), 10000);
        child.stderr.on('data', data => {
            text += data;
            const lines = text.split('\n');
            text = lines.pop();
            for (const line of lines) {
                const event = JSON.parse(line);
                if (event.type === 'step.started' && event.run.steps.length === 2) {
                    id = event.run.id;
                    clearTimeout(timer);
                    resolve();
                }
            }
        });
        child.once('error', error => { clearTimeout(timer); reject(error); });
    });
    // Wait for the side effect itself, so the remaining 'running' step is truly ambiguous.
    for (let attempt = 0; ; attempt++) {
        try { await fs.access(path.join(directory, 'effect.txt')); break; }
        catch { if (attempt === 100) throw new Error('side effect did not occur'); }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    child.kill('SIGKILL');
    await exited;
    const store = new FileRunStore(path.join(directory, '.starlight/runs'));
    const report = await store.get(id);
    assert.equal(report.status, 'running');
    assert.deepEqual(report.steps.map(step => step.status), ['completed', 'running']);
    assert.equal(report.steps[0].result.value, 'kept');
    assert.equal((await store.list())[0].completedSteps, 1);
    assert.equal(await fs.readFile(path.join(directory, 'effect.txt'), 'utf8'), 'created');
});
