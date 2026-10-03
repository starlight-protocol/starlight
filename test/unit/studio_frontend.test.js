'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const application = fs.readFileSync(path.resolve(__dirname, '../../src/studio/public/app.js'), 'utf8');

// Only DOM operations used by the application are modeled here. All state changes,
// HTTP handling, rendering decisions, and click handlers execute the shipped app.js.
class Element {
    constructor() {
        this.children = [];
        this.listeners = new Map();
        this.attributes = new Map();
        this.value = '';
        this.hidden = false;
        this.disabled = false;
        this.className = '';
        this.text = '';
    }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.text = String(value); this.children = []; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    get firstElementChild() { return this.children[0] ||= new Element(); }
    get childElementCount() { return this.children.length; }
    dispatch(name) { return this.listeners.get(name)?.(); }
}

function harness() {
    const nodes = new Map();
    const requests = [];
    const get = id => {
        if (!nodes.has(id)) nodes.set(id, new Element());
        return nodes.get(id);
    };
    get('history-filter').value = 'all';
    get('timeout').value = '30';
    const context = {
        document: { getElementById: get, createElement: () => new Element(),
            createTextNode: text => ({ textContent: text }) },
        window: { location: { hash: '', pathname: '/', search: '' }, addEventListener() {} },
        sessionStorage: { getItem: () => null },
        URLSearchParams, AbortSignal, AbortController, TextDecoder, setTimeout, clearTimeout,
        fetch: (route, options) => new Promise((resolve, reject) => {
            requests.push({ route, options, reject,
                reply(value, status = 200) { resolve({ ok: status >= 200 && status < 300, status, json: async () => value }); } });
        })
    };
    // Expose existing functions solely to drive HTTP/SSE ordering deterministically.
    // This leaves their implementations and the application's initialization intact.
    const ending = /\}\)\(\);\s*$/;
    assert(ending.test(application), 'the application must have its expected IIFE entry point');
    const source = application.replace(ending,
        'globalThis.review = { state, loadRun, renderRun, loadArtifact, acceptEvent, request };})();');
    vm.runInNewContext(source, context, { filename: 'studio/app.js' });
    // Initialization without a fragment deliberately avoids opening a real event stream.
    context.review.state.stopped = false;
    context.review.state.connected = true;
    get('notice').textContent = '';
    get('notice').hidden = true;
    return { ...context.review, get, requests };
}

function report(status, overrides = {}) {
    return {
        id: 'f1e8670f-e67f-4c22-8f14-4d6f16090f43', goal: 'Check the mission', status,
        startedAt: '2026-10-03T10:00:00.000Z',
        mission: { goal: 'Check the mission', steps: [{ goal: 'Run the check' }] }, steps: [],
        ...overrides
    };
}

test('Studio ignores an older report response after a newer request for the same run', async () => {
    const app = harness();
    const latest = report('failed', { error: { code: 'STORE_ERROR', message: 'Latest failure' } });
    app.state.active.add(latest.id);
    const first = app.loadRun(latest.id);
    const second = app.loadRun(latest.id);
    assert.equal(app.requests.length, 2);
    app.requests[1].reply(latest);
    await second;
    assert.equal(app.get('run-state').textContent, 'Failed');
    app.requests[0].reply(report('running'));
    await first;
    assert.equal(app.state.report.status, 'failed');
    assert.equal(app.get('run-state').textContent, 'Failed');
    assert.match(app.get('run-error').textContent, /Latest failure/);
});

test('Studio ignores an older report error after a newer request has succeeded', async () => {
    const app = harness();
    const latest = report('cancelled');
    const first = app.loadRun(latest.id);
    const second = app.loadRun(latest.id);
    app.requests[1].reply(latest);
    await second;
    app.requests[0].reply({ error: { code: 'INTERNAL', message: 'Old failed request' } }, 500);
    await first;
    assert.equal(app.get('run-state').textContent, 'Cancelled');
    assert.equal(app.get('notice').hidden, true);
});

test('Studio preserves a newer SSE report against delayed GET success or failure', async t => {
    for (const errorResponse of [false, true]) {
        await t.test(errorResponse ? 'delayed HTTP failure' : 'delayed running snapshot', async () => {
            const app = harness();
            const cancelled = report('cancelled');
            app.state.active.add(cancelled.id);
            const pending = app.loadRun(cancelled.id);
            app.acceptEvent({ type: 'run.finished', run: cancelled });
            if (errorResponse) app.requests[0].reply({ error: { message: 'Stale failure' } }, 500);
            else app.requests[0].reply(report('running'));
            await pending;
            assert.equal(app.state.report.status, 'cancelled');
            assert.equal(app.get('run-state').textContent, 'Cancelled');
            assert.equal(app.get('cancel-run').hidden, true);
            assert.equal(app.get('notice').hidden, true);
        });
    }
});

test('Studio marks unresolved steps in terminal persistence failures as unfinished', () => {
    const app = harness();
    app.renderRun(report('failed', {
        error: { code: 'STORE_ERROR', message: 'Could not save the step checkpoint' },
        steps: [{ index: 1, goal: 'Run the check', status: 'running' }]
    }));
    assert.equal(app.get('run-state').textContent, 'Failed');
    const step = app.get('timeline').children[0];
    assert.doesNotMatch(step.className, /\brunning\b/);
    assert.match(step.textContent, /Unfinished checkpoint/);
    assert.match(app.get('run-error').textContent, /STORE_ERROR/);
    assert.equal(app.get('run-warning').hidden, false);
    assert.match(app.get('run-warning').textContent, /side effects may be unknown/);
    assert.equal(app.get('cancel-run').hidden, true);
});

test('Studio artifact authorization errors do not invalidate the authenticated session', async () => {
    const app = harness();
    const id = report('completed').id;
    app.state.selected = id;
    const pending = app.loadArtifact(id);
    app.requests[0].reply({ error: { code: 'INVALID_ARTIFACT', message: 'Artifact is outside its allowed directory' } }, 403);
    await pending;
    assert.equal(app.state.stopped, false);
    assert.equal(app.state.connected, true);
    assert.match(app.get('announcement').textContent, /Artifact preview is unavailable/);
    const unauthenticated = app.request('/api/state');
    app.requests[1].reply({ error: { code: 'UNAUTHORIZED', message: 'Expired session' } }, 401);
    await assert.rejects(unauthenticated, /Expired session/);
    assert.equal(app.state.stopped, true);
    assert.equal(app.state.connected, false);
});

test('Studio bounds cached artifact previews even when old requests settle out of order', async () => {
    const app = harness();
    const pending = [];
    for (let index = 0; index < 150; index++) pending.push(app.loadArtifact(`run-${index}`));
    assert.equal(app.requests.length, 150);
    assert(app.state.artifacts.size <= 50, 'pending previews must be bounded');
    for (let index = app.requests.length - 1; index >= 0; index--) {
        app.requests[index].reply({ name: `${index}.md`, text: `Report ${index}` });
        await pending[index];
        assert(app.state.artifacts.size <= 50, 'settled previews must remain bounded');
    }
    assert.equal(app.state.artifacts.get('run-0').text, 'Report 0');
    assert.equal(app.state.artifacts.has('run-149'), false);
});

test('Studio sends one creation request for concurrent Run button clicks', async () => {
    const app = harness();
    const first = app.get('run-mission').dispatch('click');
    const second = app.get('run-mission').dispatch('click');
    await second;
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].route, '/api/runs');
    assert.equal(app.requests[0].options.method, 'POST');
    const failed = report('failed');
    app.requests[0].reply({ id: failed.id }, 202);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].route, `/api/runs/${failed.id}`);
    app.requests[1].reply(failed);
    await first;
    assert.equal(app.requests.filter(request => request.options.method === 'POST').length, 1);
    assert.equal(app.state.busy, false);
});

test('Studio does not retry mission creation after an ambiguous transport failure', async () => {
    const app = harness();
    const pending = app.get('run-mission').dispatch('click');
    app.requests[0].reject(new TypeError('Connection dropped'));
    await pending;
    assert.equal(app.requests.length, 1);
    assert.match(app.get('notice').textContent, /mission may have started/);
    assert.match(app.get('notice').textContent, /will not be repeated automatically/);
    assert.equal(app.state.busy, false);
});
