'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const { AgentPlatform, createHttpJsonAgent, validateMission } = require('../..');

async function endpoint(t, handle) {
    const server = http.createServer(handle);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return `http://127.0.0.1:${server.address().port}`;
}

function platformFor(origin, options = {}) {
    const platform = new AgentPlatform();
    platform.register(createHttpJsonAgent({ allowedOrigins: [origin], ...options }));
    return platform;
}

test('HTTP agent fetches JSON, verifies it and hands results forward without exposing configured credentials', async t => {
    let calls = 0;
    const origin = await endpoint(t, (request, response) => {
        calls++;
        assert.equal(request.method, 'GET');
        assert.equal(request.headers.authorization, 'Bearer private-test-token');
        response.writeHead(200, { 'content-type': 'application/vnd.health+json; charset=utf-8' });
        response.end('{"healthy":true}');
    });
    const options = { allowedOrigins: [origin], headers: { authorization: 'Bearer private-test-token' },
        validate: value => value.healthy === true };
    const agent = createHttpJsonAgent(options);
    options.headers.authorization = 'changed';
    options.allowedOrigins[0] = 'https://invalid.example';
    assert.equal(agent.canHandle({ goal: 'Fetch JSON' }), true);
    assert.equal(agent.canHandle({ goal: 'Other task' }), false);
    assert.equal(calls, 0, 'claims never make network requests');
    const platform = new AgentPlatform();
    platform.register(agent);
    platform.register({ name: 'consumer', canHandle: intent => intent.goal === 'Consume', run: intent => {
        assert.deepEqual(intent.context.mission.results[0].value, { healthy: true });
        return { status: 'completed' };
    } });
    const report = await platform.run({ goal: 'Fetch and consume', context: { url: `${origin}/health?internal=hidden` },
        steps: ['Fetch JSON', 'Consume'] });
    assert.equal(report.status, 'completed');
    assert.equal(calls, 1);
    assert.deepEqual(report.steps[0].result.evidence, [{ type: 'http', url: `${origin}/health`,
        status: 200, contentType: 'application/vnd.health+json', bytes: 16 }]);
    assert.equal(JSON.stringify(report).includes('private-test-token'), false);
    assert.equal(JSON.stringify(platform.agents()).includes('private-test-token'), false);
});

test('origin refusals and redirects never reach another destination or fallback agent', async t => {
    let targetCalls = 0;
    let fallbackCalls = 0;
    const target = await endpoint(t, (_request, response) => { targetCalls++; response.end('{}'); });
    const origin = await endpoint(t, (_request, response) => { response.writeHead(302, { location: target }).end(); });
    const platform = platformFor(origin);
    platform.register({ name: 'fallback', canHandle: () => 0.1,
        run: () => { fallbackCalls++; return { status: 'completed' }; } });
    for (const [url, code] of [[target, 'ORIGIN_NOT_ALLOWED'], [origin, 'REDIRECT_REJECTED'],
        ['file:///etc/passwd', 'INVALID_REQUEST'], [`http://user:password@127.0.0.1:${new URL(origin).port}`, 'INVALID_REQUEST']]) {
        const report = await platform.run({ goal: 'Fetch JSON', context: { url } });
        assert.equal(report.status, 'failed');
        assert.equal(report.error.details.cause.code, code);
    }
    assert.equal(targetCalls, 0);
    assert.equal(fallbackCalls, 0);
});

test('HTTP responses are bounded even when chunked or compressed, and malformed data stays terminal', async t => {
    const origin = await endpoint(t, (request, response) => {
        response.setHeader('content-type', 'application/json');
        switch (request.url) {
        case '/length': response.setHeader('content-length', '1000'); response.end(' '.repeat(1000)); break;
        case '/stream': response.write(' '.repeat(40)); response.end(' '.repeat(40)); break;
        case '/gzip': response.setHeader('content-encoding', 'gzip'); response.end(gzipSync(' '.repeat(1000))); break;
        case '/html': response.setHeader('content-type', 'text/html'); response.end('<html>'); break;
        case '/invalid': response.end('{wrong'); break;
        case '/infinity': response.end('{"value":1e400}'); break;
        case '/utf8': response.end(Buffer.from([0xff])); break;
        default: response.writeHead(429).end('{"secret":"do not copy failure bodies"}');
        }
    });
    const platform = platformFor(origin, { maxResponseBytes: 64 });
    for (const [route, code] of [
        ['/length', 'RESPONSE_TOO_LARGE'], ['/stream', 'RESPONSE_TOO_LARGE'], ['/gzip', 'RESPONSE_TOO_LARGE'],
        ['/html', 'INVALID_CONTENT_TYPE'], ['/invalid', 'INVALID_JSON'], ['/infinity', 'INVALID_JSON'],
        ['/utf8', 'INVALID_JSON'], ['/rate', 'HTTP_STATUS']
    ]) {
        const report = await platform.run({ goal: 'Fetch JSON', context: { url: origin + route } });
        assert.equal(report.status, 'failed', route);
        assert.equal(report.error.details.cause.code, code, route);
        assert.equal(report.steps[0].error.details.attempts.length, 1);
        assert.equal(JSON.stringify(report).includes('do not copy failure bodies'), false);
    }
});

test('failed API verification preserves response evidence and prevents downstream work', async t => {
    const origin = await endpoint(t, (_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' }).end('{"healthy":false}');
    });
    const platform = platformFor(origin, { validate: value => value.healthy === true });
    const report = await platform.run({ goal: 'Check health', context: { url: origin }, steps: ['Fetch JSON', 'Publish'] });
    assert.equal(report.status, 'failed');
    assert.equal(report.steps.length, 1);
    assert.equal(report.error.details.cause.code, 'VERIFICATION_FAILED');
    assert.equal(report.error.details.evidence[0].status, 200);
});

test('request deadlines and mission cancellation abort stalled HTTP response streams', { timeout: 5000 }, async t => {
    let received;
    let connectionClosed;
    const origin = await endpoint(t, (request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{');
        if (request.url === '/cancel') {
            response.on('close', () => connectionClosed?.());
            received?.();
        }
    });
    const timeout = await platformFor(origin, { timeoutMs: 100 }).run({ goal: 'Fetch JSON', context: { url: origin } });
    assert.equal(timeout.status, 'failed');
    assert.equal(timeout.error.details.cause.code, 'TIMEOUT');
    const ready = new Promise(resolve => { received = resolve; });
    const closed = new Promise(resolve => { connectionClosed = resolve; });
    const platform = platformFor(origin);
    const handle = platform.submit({ goal: 'Fetch JSON', context: { url: `${origin}/cancel` } });
    await ready;
    handle.cancel();
    assert.equal((await handle.done).status, 'cancelled');
    await closed;
});

test('HTTP agent configuration requires explicit limits and a finite origin allowlist', () => {
    for (const options of [{}, { allowedOrigins: [] }, { allowedOrigins: ['https://example.com/path'] },
        { allowedOrigins: ['https://*.example.com'] },
        { allowedOrigins: ['https://example.com'], timeoutMs: 0 },
        { allowedOrigins: ['https://example.com'], maxResponseBytes: 16777217 },
        { allowedOrigins: ['https://example.com'], headers: { Host: 'other.example' } },
        { allowedOrigins: ['https://example.com'], validate: true }]) {
        assert.throws(() => createHttpJsonAgent(options), error => error.code === 'INVALID_REQUEST');
    }
});

test('mission preflight normalizes an immutable plan without creating a run', () => {
    const input = { goal: '  Check service  ', context: { nested: { flag: true } }, steps: ['  Fetch JSON  '] };
    const plan = validateMission(input);
    assert.equal(plan.goal, 'Check service');
    assert.equal(plan.steps[0].goal, 'Fetch JSON');
    assert.deepEqual(plan.steps[0].constraints, {});
    assert.equal(Object.hasOwn(plan.steps[0], 'id'), false);
    input.context.nested.flag = false;
    assert.equal(plan.context.nested.flag, true);
    assert.throws(() => { plan.steps[0].goal = 'Changed'; });
    assert.throws(() => validateMission({ goal: 'Invalid', constraints: { budget: 1 },
        steps: [{ goal: 'Fetch', constraints: { budget: 2 } }] }), error => error.code === 'INVALID_REQUEST');
});
