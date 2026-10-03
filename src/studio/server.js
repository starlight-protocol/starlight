'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AgentPlatform, FileRunStore, validateMission } = require('../platform');

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const RUN_PATH = new RegExp(`^/api/runs/(${UUID})(/(cancel|artifact))?$`, 'i');
const PRESETS = Object.freeze([
    { id: 'data-report', label: 'Verified order report', description: 'Analyze three orders, verify the total, and write a checked Markdown report.' },
    { id: 'service-health', label: 'Service health check', description: 'Fetch a local HTTP endpoint, validate three services, and save a checked health report.' }
]);
const STATIC = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);

function failure(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}

function json(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
}

function readBody(request) {
    if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw failure(415, 'INVALID_CONTENT_TYPE', 'send an application/json request body');
    }
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        const cleanup = () => {
            request.removeListener('data', data);
            request.removeListener('end', end);
            request.removeListener('error', error);
            request.removeListener('aborted', aborted);
        };
        const error = cause => { cleanup(); reject(cause); };
        const aborted = () => error(failure(400, 'ABORTED', 'request body was interrupted'));
        const data = chunk => {
            size += chunk.length;
            if (size > 256 * 1024) {
                error(failure(413, 'BODY_TOO_LARGE', 'request body exceeds 256 KiB'));
                request.resume();
            } else chunks.push(chunk);
        };
        const end = () => {
            cleanup();
            try {
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
                resolve(body);
            } catch { reject(failure(400, 'INVALID_JSON', 'request body must be a JSON object')); }
        };
        request.on('data', data);
        request.once('end', end);
        request.once('error', error);
        request.once('aborted', aborted);
    });
}

function fields(body, allowed) {
    if (Object.keys(body).some(key => !allowed.includes(key))) {
        throw failure(400, 'INVALID_REQUEST', `accepted fields: ${allowed.join(', ') || '(none)'}`);
    }
}

function summary(report) {
    return { id: report.id, goal: report.goal, status: report.status, startedAt: report.startedAt,
        ...(report.finishedAt === undefined ? {} : { finishedAt: report.finishedAt }),
        completedSteps: report.steps.filter(step => step.status === 'completed').length,
        totalSteps: report.mission.steps.length };
}

async function presetInput(id, outputDir) {
    if (id === 'service-health') return require('../../examples/service-health/demo.cjs').createDemo(outputDir);
    const directory = path.resolve(__dirname, '../../examples/data-report');
    const template = JSON.parse(await fs.readFile(path.join(directory, 'mission.json'), 'utf8'));
    return {
        agents: require('../../examples/data-report/agents.cjs'),
        mission: { ...template, context: {
            inputPath: path.join(directory, 'orders.json'),
            outputPath: path.join(outputDir, 'artifacts', `${crypto.randomUUID()}.md`)
        } },
        close: async () => {}
    };
}

/** Local operator interface. The URL fragment is a session capability, never a report field. */
async function startStudio({ port = 0, outputDir = '.starlight/runs', agents = [] } = {}) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be an integer from 0 to 65535');
    if (!Array.isArray(agents)) throw new Error('agents must be an array of trusted agent implementations');
    const store = new FileRunStore(outputDir);
    const custom = new AgentPlatform({ store, maxRuns: 50 });
    for (const agent of agents) custom.register(agent);
    const token = crypto.randomBytes(32).toString('hex');
    const expectedAuth = Buffer.from(`Bearer ${token}`);
    const active = new Map();
    const recent = new Map();
    const streams = new Set();
    const sockets = new Set();
    const preparing = new Set();
    let reservations = 0;
    let closing = false;
    let origin;
    let closePromise;

    const broadcast = event => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        for (const response of streams) {
            // A slow observer must never hold execution or grow an unbounded event queue.
            if (!response.write(data)) response.destroy();
        }
    };
    const unsubscribeCustom = custom.subscribe(broadcast);

    const getRun = async id => active.get(id)?.platform.getRun(id) || recent.get(id)?.report || await store.get(id);

    async function submit(body) {
        fields(body, ['preset', 'mission', 'timeoutMs']);
        if (Object.hasOwn(body, 'preset') === Object.hasOwn(body, 'mission')) {
            throw failure(400, 'INVALID_REQUEST', 'provide exactly one of preset or mission');
        }
        if (body.preset !== undefined && !PRESETS.some(preset => preset.id === body.preset)) {
            throw failure(400, 'INVALID_PRESET', 'preset must be data-report or service-health');
        }
        const timeoutMs = Object.hasOwn(body, 'timeoutMs') ? body.timeoutMs : 30_000;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) {
            throw failure(400, 'INVALID_REQUEST', 'timeoutMs must be an integer from 1 to 3600000');
        }
        let mission = body.mission === undefined ? undefined : validateMission(body.mission);
        if (mission && !agents.length) throw failure(400, 'NO_AGENTS', 'start Studio with --agents to run a custom mission');
        if (closing) throw failure(503, 'SHUTTING_DOWN', 'Studio is shutting down');
        if (active.size + reservations >= 4) throw failure(429, 'RUN_LIMIT', 'four missions are already active; wait or cancel one');
        reservations++;
        let preset;
        let cleanupPromise;
        const cleanup = () => cleanupPromise ||= Promise.resolve().then(() => preset?.close());
        let release;
        const preparation = new Promise(resolve => { release = resolve; });
        preparing.add(preparation);
        try {
            let platform = custom;
            if (body.preset) {
                preset = await presetInput(body.preset, store.directory);
                platform = new AgentPlatform({ store, maxRuns: 1 });
                for (const agent of preset.agents) platform.register(agent);
                mission = preset.mission;
            }
            if (closing) throw failure(503, 'SHUTTING_DOWN', 'Studio is shutting down');
            const unsubscribe = platform === custom ? () => {} : platform.subscribe(broadcast);
            let handle;
            try { handle = platform.submit(mission, { timeoutMs }); }
            catch (error) { unsubscribe(); throw error; }
            const entry = { platform, handle, done: null, cleanup, artifact: preset?.mission.context.outputPath };
            active.set(handle.id, entry);
            entry.done = handle.done.catch(() => platform.getRun(handle.id)).then(report => {
                recent.set(handle.id, { report, artifact: preset?.mission.context.outputPath });
                while (recent.size > 50) recent.delete(recent.keys().next().value);
            }).finally(async () => {
                unsubscribe();
                // Fixture cleanup must not create an unhandled rejection after a run settles.
                try { await cleanup(); } finally { active.delete(handle.id); }
            }).catch(() => {});
            return handle.id;
        } catch (error) {
            await cleanup();
            throw error;
        } finally {
            reservations--;
            preparing.delete(preparation);
            release();
        }
    }

    async function artifact(id) {
        const running = active.get(id);
        const entry = running ? { artifact: running.artifact, report: running.platform.getRun(id) } : recent.get(id);
        if (!entry?.artifact || entry.report.status !== 'completed') {
            throw failure(404, 'NO_ARTIFACT', 'no completed built-in artifact is available in this Studio session');
        }
        const filename = entry.artifact;
        const directory = await fs.realpath(path.join(store.directory, 'artifacts'));
        const resolved = await fs.realpath(filename);
        const relative = path.relative(directory, resolved);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) ||
            path.extname(resolved) !== '.md' || !(await fs.lstat(filename)).isFile()) {
            throw failure(403, 'INVALID_ARTIFACT', 'artifact is outside the built-in artifact directory');
        }
        const file = await fs.open(resolved, 'r');
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size > 64 * 1024) throw failure(413, 'ARTIFACT_TOO_LARGE', 'artifact preview exceeds 64 KiB');
            const bytes = Buffer.alloc(64 * 1024 + 1);
            const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
            if (bytesRead > 64 * 1024) throw failure(413, 'ARTIFACT_TOO_LARGE', 'artifact preview exceeds 64 KiB');
            return { name: path.basename(resolved), text: bytes.subarray(0, bytesRead).toString('utf8') };
        } finally { await file.close(); }
    }

    async function route(request, response) {
        response.setHeader('cache-control', 'no-store');
        response.setHeader('x-content-type-options', 'nosniff');
        response.setHeader('referrer-policy', 'no-referrer');
        response.setHeader('x-frame-options', 'DENY');
        response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        if (request.headers.host !== new URL(origin).host) throw failure(403, 'INVALID_HOST', 'use the exact Studio loopback URL');
        if ((request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') {
            throw failure(403, 'INVALID_ORIGIN', 'cross-origin access is not allowed');
        }
        const url = new URL(request.url, origin);
        if (url.origin !== origin) throw failure(403, 'INVALID_ORIGIN', 'cross-origin access is not allowed');
        if (url.pathname.startsWith('/api/')) {
            const supplied = Buffer.from(request.headers.authorization || '');
            if (supplied.length !== expectedAuth.length || !crypto.timingSafeEqual(supplied, expectedAuth)) {
                throw failure(401, 'UNAUTHORIZED', 'open the complete Studio launch URL to authenticate');
            }
            if (closing) throw failure(503, 'SHUTTING_DOWN', 'Studio is shutting down');
            if (request.method === 'GET' && url.pathname === '/api/state') {
                let persisted = [];
                let storageError;
                try { persisted = await store.list({ limit: 50 }); }
                catch (error) { storageError = { code: 'STORE_ERROR', message: `could not read saved history: ${error.message}` }; }
                const combined = new Map(persisted.map(run => [run.id, run]));
                // A failed checkpoint leaves disk behind the in-memory report. Preserve that
                // failure across UI refreshes instead of presenting a stale running snapshot.
                for (const entry of recent.values()) combined.set(entry.report.id, summary(entry.report));
                const runs = [...combined.values()].sort((a, b) =>
                    b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id)).slice(0, 50);
                json(response, 200, { agents: custom.agents(), presets: PRESETS,
                    activeRuns: [...active.values()].map(entry => entry.platform.getRun(entry.handle.id))
                        .filter(report => report.status === 'running'), runs,
                    ...(storageError ? { storageError } : {}) });
                return;
            }
            if (request.method === 'GET' && url.pathname === '/api/events') {
                if (streams.size >= 16) throw failure(429, 'STREAM_LIMIT', 'too many event connections');
                response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive', 'x-accel-buffering': 'no' });
                response.write(': connected\n\n');
                streams.add(response);
                const heartbeat = setInterval(() => { if (!response.write(': heartbeat\n\n')) response.destroy(); }, 15_000);
                heartbeat.unref();
                response.once('close', () => { clearInterval(heartbeat); streams.delete(response); });
                return;
            }
            if (request.method === 'POST' && url.pathname === '/api/validate') {
                const body = await readBody(request);
                fields(body, ['mission']);
                const mission = validateMission(body.mission);
                json(response, 200, { valid: true, stepCount: mission.steps.length, mission });
                return;
            }
            if (request.method === 'POST' && url.pathname === '/api/runs') {
                json(response, 202, { id: await submit(await readBody(request)) });
                return;
            }
            const match = RUN_PATH.exec(url.pathname);
            if (match) {
                const id = match[1].toLowerCase();
                if (request.method === 'GET' && !match[3]) {
                    const report = await getRun(id);
                    if (!report) throw failure(404, 'NOT_FOUND', 'run not found');
                    json(response, 200, report);
                    return;
                }
                if (request.method === 'GET' && match[3] === 'artifact') {
                    json(response, 200, await artifact(id));
                    return;
                }
                if (request.method === 'POST' && match[3] === 'cancel') {
                    fields(await readBody(request), []);
                    const entry = active.get(id);
                    if (!entry) {
                        if (!await getRun(id)) throw failure(404, 'NOT_FOUND', 'run not found');
                        throw failure(409, 'NOT_ACTIVE', 'run is not active in this Studio session');
                    }
                    if (!entry.handle.cancel()) throw failure(409, 'NOT_ACTIVE', 'run already settled or cancellation was requested');
                    json(response, 202, { id, cancelled: true });
                    return;
                }
            }
            throw failure(404, 'NOT_FOUND', 'API route not found');
        }
        const asset = STATIC.get(url.pathname);
        if (!asset || !['GET', 'HEAD'].includes(request.method)) throw failure(404, 'NOT_FOUND', 'page not found');
        const data = await fs.readFile(path.join(__dirname, 'public', asset[0]));
        response.writeHead(200, { 'content-type': asset[1], 'content-length': data.length });
        response.end(request.method === 'HEAD' ? undefined : data);
    }

    const server = http.createServer((request, response) => {
        route(request, response).catch(error => {
            if (response.headersSent) { response.destroy(); return; }
            response.setHeader('connection', 'close');
            json(response, error.status || (error.code === 'INVALID_REQUEST' ? 400 : 500), {
                error: { code: error.code || 'INTERNAL', message: error.message || 'Studio request failed' }
            });
        });
    });
    server.maxConnections = 64;
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
    const actualPort = server.address().port;
    origin = `http://127.0.0.1:${actualPort}`;
    return Object.freeze({
        url: `${origin}/#token=${token}`, port: actualPort,
        close() {
            if (closePromise) return closePromise;
            closing = true;
            unsubscribeCustom();
            closePromise = (async () => {
                const stopped = new Promise(resolve => server.close(resolve));
                for (const response of streams) response.end();
                for (const entry of active.values()) entry.handle.cancel();
                let timer;
                try {
                    await Promise.race([
                        Promise.allSettled([...preparing, ...[...active.values()].flatMap(entry => [entry.done, entry.cleanup()])]),
                        new Promise(resolve => { timer = setTimeout(resolve, 2_000); })
                    ]);
                } finally {
                    clearTimeout(timer);
                    for (const socket of sockets) socket.destroy();
                    await stopped;
                }
            })();
            return closePromise;
        }
    });
}

module.exports = { startStudio };
