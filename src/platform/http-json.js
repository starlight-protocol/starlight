'use strict';

const { ProtocolError, ERROR_CODES } = require('../core/errors');
const { snapshot } = require('../core/json');

function invalid(message) { return new ProtocolError(ERROR_CODES.INVALID_REQUEST, message); }
function bounded(value, label, maximum) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
        throw invalid(`${label} must be an integer between 1 and ${maximum}`);
    }
    return value;
}

function httpUrl(input) {
    if (typeof input !== 'string') throw invalid('context.url must be an HTTP(S) URL');
    let url;
    try { url = new URL(input); } catch { throw invalid('context.url must be an HTTP(S) URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw invalid('only HTTP(S) URLs without embedded credentials are supported');
    }
    return url;
}

function createHttpJsonAgent(options = {}) {
    const { name = 'http-json', goal = 'Fetch JSON', allowedOrigins, headers = {}, validate } = options;
    if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
        typeof goal !== 'string' || !goal.trim() || goal.length > 10000) throw invalid('agent name and goal are required');
    if (!Array.isArray(allowedOrigins) || allowedOrigins.length < 1 || allowedOrigins.length > 100) {
        throw invalid('allowedOrigins must contain 1–100 explicit HTTP(S) origins');
    }
    const origins = new Set(allowedOrigins.map(origin => {
        const url = httpUrl(origin);
        if (url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
            throw invalid('allowedOrigins accepts exact origins, not paths, queries, or wildcards');
        }
        return url.origin;
    }));
    const maxResponseBytes = bounded(options.maxResponseBytes ?? 1_048_576, 'maxResponseBytes', 16_777_216);
    const timeoutMs = bounded(options.timeoutMs ?? 10_000, 'timeoutMs', 3_600_000);
    const capacity = bounded(options.capacity ?? 1, 'capacity', 1000);
    if (validate !== undefined && typeof validate !== 'function') throw invalid('validate must be a function');
    if (!headers || typeof headers !== 'object' || Array.isArray(headers) ||
        Object.values(headers).some(value => typeof value !== 'string')) throw invalid('headers must map names to strings');
    const requestHeaders = new Headers({ accept: 'application/json', ...headers });
    for (const header of requestHeaders.keys()) {
        if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade'].includes(header)) {
            throw invalid(`header '${header}' is managed by the HTTP client`);
        }
    }
    const expectedGoal = goal.trim();
    return {
        name: name.trim(), capacity, capabilities: ['http', 'json'],
        canHandle: intent => intent.goal === expectedGoal,
        async run(intent, execution) {
            let response;
            let reader;
            let timer;
            const evidence = [];
            const controller = new AbortController();
            const onAbort = () => controller.abort(execution.signal.reason);
            try {
                const url = httpUrl(intent.context?.url);
                if (!origins.has(url.origin)) throw new ProtocolError('ORIGIN_NOT_ALLOWED', 'URL origin is not allowed by this agent');
                if (execution.signal.aborted) onAbort();
                else execution.signal.addEventListener('abort', onAbort, { once: true });
                timer = setTimeout(() => controller.abort(new ProtocolError(ERROR_CODES.TIMEOUT, 'HTTP request deadline expired')), timeoutMs);
                response = await fetch(url, { method: 'GET', headers: requestHeaders, redirect: 'manual', signal: controller.signal });
                const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
                const receipt = { type: 'http', url: `${url.origin}${url.pathname}`, status: response.status, contentType, bytes: 0 };
                evidence.push(receipt);
                if (response.status >= 300 && response.status < 400) {
                    throw new ProtocolError('REDIRECT_REJECTED', 'HTTP redirects are not followed');
                }
                if (!response.ok) throw new ProtocolError('HTTP_STATUS', `HTTP request returned status ${response.status}`);
                if (contentType !== 'application/json' && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType)) {
                    throw new ProtocolError('INVALID_CONTENT_TYPE', 'HTTP response must use an application JSON content type');
                }
                const length = response.headers.get('content-length');
                if (!response.headers.get('content-encoding') && length && /^\d+$/.test(length) && Number(length) > maxResponseBytes) {
                    throw new ProtocolError('RESPONSE_TOO_LARGE', `HTTP response exceeds ${maxResponseBytes} bytes`);
                }
                const chunks = [];
                if (response.body) {
                    reader = response.body.getReader();
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        receipt.bytes += value.byteLength;
                        if (receipt.bytes > maxResponseBytes) throw new ProtocolError('RESPONSE_TOO_LARGE', `HTTP response exceeds ${maxResponseBytes} bytes`);
                        chunks.push(value);
                    }
                }
                if (controller.signal.aborted) throw controller.signal.reason;
                let value;
                try {
                    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
                    value = snapshot(JSON.parse(text));
                } catch { throw new ProtocolError('INVALID_JSON', 'HTTP response is not valid finite UTF-8 JSON'); }
                return { status: 'completed', value, evidence };
            } catch (error) {
                const reason = controller.signal.aborted ? controller.signal.reason : error;
                return { status: 'failed', error: {
                    code: reason instanceof ProtocolError ? reason.code : 'HTTP_ERROR',
                    // Network errors can contain headers or URL query credentials in their cause.
                    message: reason instanceof ProtocolError ? reason.message : 'HTTP request failed'
                }, evidence };
            } finally {
                clearTimeout(timer);
                execution.signal.removeEventListener('abort', onAbort);
                if (reader) { try { await reader.cancel(); } catch { /* already aborted */ } reader.releaseLock(); }
                else if (response?.body) { try { await response.body.cancel(); } catch { /* already aborted */ } }
            }
        },
        ...(validate === undefined ? {} : { verify: (intent, outcome, execution) => validate(outcome.value, intent, execution) })
    };
}

module.exports = { createHttpJsonAgent };
