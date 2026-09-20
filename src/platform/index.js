'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Coordinator, ProtocolError, ERROR_CODES } = require('../core');
const { normalizeIntent, normalizeOutcome } = require('../core/contract');
const { snapshot } = require('../core/json');
const { FileRunStore } = require('./store');

function invalid(message) {
    return new ProtocolError(ERROR_CODES.INVALID_REQUEST, message);
}

function normalizeMission(input) {
    const source = typeof input === 'string' ? { goal: input } : input;
    if (!source || typeof source !== 'object' || Array.isArray(source) ||
        Object.keys(source).some(key => !['goal', 'context', 'constraints', 'steps'].includes(key))) {
        throw invalid('mission accepts goal, context, constraints, and optional steps');
    }
    const { goal, context, constraints } = normalizeIntent({
        goal: source.goal, context: source.context, constraints: source.constraints
    });
    if (Object.hasOwn(context, 'mission')) throw invalid('context.mission is reserved for execution history');
    const inputs = source.steps === undefined ? [goal] : source.steps;
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
        throw invalid('mission.steps must contain between 1 and 100 intents');
    }
    const steps = inputs.map(input => {
        if (input && typeof input === 'object' && Object.hasOwn(input, 'id')) {
            throw invalid('step IDs are assigned by the platform');
        }
        const step = normalizeIntent(input);
        if (Object.hasOwn(step.context, 'mission')) throw invalid('context.mission is reserved for execution history');
        for (const key of Object.keys(step.constraints)) {
            if (Object.hasOwn(constraints, key)) throw invalid(`step cannot redefine mission constraint '${key}'`);
        }
        return { goal: step.goal, context: step.context, constraints: step.constraints };
    });
    return snapshot({ goal, context, constraints, steps });
}

function errorDetails(error) {
    const result = {
        code: typeof error?.code === 'string' ? error.code : ERROR_CODES.INTERNAL,
        message: error instanceof Error ? error.message : String(error)
    };
    if (error?.details !== undefined) result.details = error.details;
    // Agent exceptions may contain non-serializable data; reports still need to be readable.
    try { return snapshot(result); } catch { return snapshot({ code: result.code, message: result.message }); }
}

class AgentPlatform {
    constructor(options = {}) {
        this.coordinator = options.coordinator || new Coordinator({
            ...options.coordinatorOptions, fallbackOnError: false
        });
        this.maxRuns = options.maxRuns ?? 100;
        if (!Number.isInteger(this.maxRuns) || this.maxRuns < 1 || this.maxRuns > 100_000) {
            throw invalid('maxRuns must be an integer between 1 and 100000');
        }
        this.records = new Map();
        this.store = options.store;
        if (this.store !== undefined && (!this.store || typeof this.store.create !== 'function' || typeof this.store.save !== 'function')) {
            throw invalid('store must implement create() and save()');
        }
        this.listeners = new Set();
    }

    register(agent) {
        if (!agent || typeof agent.canHandle !== 'function' || typeof agent.run !== 'function' ||
            (agent.verify !== undefined && typeof agent.verify !== 'function')) {
            throw invalid('agent must implement canHandle() and run(), with optional verify()');
        }
        const { id, name, version, priority, capacity, capabilities } = agent;
        return this.coordinator.register({
            id, name, version, priority, capacity, capabilities,
            offer: (intent, execution) => agent.canHandle(intent, execution),
            execute: async (intent, execution) => {
                let completedOutcome;
                try {
                    const raw = normalizeOutcome(await agent.run(intent, execution));
                    const outcome = snapshot(Object.fromEntries(
                        Object.entries(raw).filter(([, value]) => value !== undefined)
                    ));
                    if (outcome.status === 'completed' && agent.verify) {
                        completedOutcome = outcome;
                        const verified = await agent.verify(intent, outcome, execution);
                        if (verified !== true) return {
                            status: 'failed',
                            error: { code: 'VERIFICATION_FAILED', message: `agent '${name}' failed completion verification` },
                            evidence: outcome.evidence
                        };
                    }
                    return outcome;
                } catch (error) {
                    // A thrown error may follow a side effect. Only an explicit unhandled/retry
                    // outcome authorizes fallback/retry; never silently repeat ambiguous work.
                    return {
                        status: 'failed',
                        ...(completedOutcome?.evidence === undefined ? {} : { evidence: completedOutcome.evidence }),
                        error: { code: typeof error?.code === 'string' ? error.code : 'AGENT_ERROR',
                            message: error instanceof Error ? error.message : String(error) }
                    };
                }
            }
        });
    }

    agents() { return this.coordinator.list(); }

    subscribe(listener) {
        if (typeof listener !== 'function') throw invalid('listener must be a function');
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(type, report) {
        const event = snapshot({ type, run: report });
        for (const listener of [...this.listeners]) {
            // Observers must not change mission outcomes, including asynchronous failures.
            try { Promise.resolve(listener(event)).catch(() => {}); } catch { /* observational */ }
        }
    }

    async checkpoint(record, type) {
        if (this.store) {
            const operation = type === 'run.started' ? 'create' : 'save';
            try { await this.store[operation](snapshot(record.report)); }
            catch (error) {
                throw new ProtocolError('STORE_ERROR', `could not ${operation} run checkpoint: ${errorDetails(error).message}`, {
                    runId: record.report.id, operation
                });
            }
        }
        this.notify(type, record.report);
    }

    submit(input, options = {}) {
        const mission = normalizeMission(input);
        const { timeoutMs, signal } = options;
        if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86_400_000)) {
            throw invalid('timeoutMs must be an integer between 1 and 86400000');
        }
        if (signal !== undefined && !(signal instanceof AbortSignal)) {
            throw invalid('signal must be an AbortSignal');
        }
        if (this.records.size >= this.maxRuns) {
            const settled = [...this.records].find(([, record]) => record.settled);
            if (!settled) throw new ProtocolError(ERROR_CODES.RESOURCE_EXHAUSTED, 'all retained runs are active');
            this.records.delete(settled[0]);
        }
        const id = crypto.randomUUID();
        const controller = new AbortController();
        const startedAt = Date.now();
        const startedTick = performance.now();
        const record = {
            controller, settled: false, startedTick,
            expiresAt: timeoutMs === undefined ? Infinity : startedTick + timeoutMs,
            report: { id, goal: mission.goal, status: 'running', startedAt: new Date(startedAt).toISOString(),
                ...(timeoutMs === undefined ? {} : { deadlineAt: new Date(startedAt + timeoutMs).toISOString() }),
                mission, steps: [] },
            done: null
        };
        this.records.set(id, record);
        const onAbort = () => this.cancel(id);
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
        const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
            controller.abort(new ProtocolError(ERROR_CODES.TIMEOUT, `mission exceeded its ${timeoutMs}ms deadline`));
        }, timeoutMs);
        // Defer execution until the caller has received its cancellation handle.
        record.done = Promise.resolve().then(() => this.execute(record)).finally(() => {
            record.settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        });
        return Object.freeze({ id, done: record.done, cancel: () => this.cancel(id) });
    }

    async run(input, options) { return this.submit(input, options).done; }

    getRun(id) {
        const record = this.records.get(id);
        return record ? snapshot(record.report) : undefined;
    }

    listRuns() { return [...this.records.keys()].map(id => this.getRun(id)); }

    cancel(id) {
        const record = this.records.get(id);
        if (!record || record.report.status !== 'running' || record.controller.signal.aborted) return false;
        record.controller.abort(new ProtocolError(ERROR_CODES.CANCELLED, `run '${id}' was cancelled`));
        return true;
    }

    async execute(record) {
        try { return await this.executeSteps(record); }
        catch (error) {
            // A failed write stops scheduling. Keep the last observed result in memory;
            // the saved checkpoint may still describe an ambiguous in-flight operation.
            record.report.status = 'failed';
            record.report.error = errorDetails(error);
            record.report.finishedAt = new Date().toISOString();
            record.report.durationMs = Math.round(performance.now() - record.startedTick);
            this.notify('run.persistence_failed', record.report);
            throw error;
        }
    }

    async executeSteps(record) {
        const { report, controller } = record;
        const { mission } = report;
        const abortStatus = () => controller.signal.reason?.code === ERROR_CODES.CANCELLED ? 'cancelled' : 'failed';
        const checkDeadline = () => {
            if (!controller.signal.aborted && performance.now() >= record.expiresAt) {
                controller.abort(new ProtocolError(ERROR_CODES.TIMEOUT, 'mission deadline expired'));
            }
        };
        await this.checkpoint(record, 'run.started');
        for (let index = 0; index < mission.steps.length; index++) {
            const step = mission.steps[index];
            const intent = {
                id: `${report.id}:${index + 1}`,
                goal: step.goal,
                context: { ...mission.context, ...step.context,
                    mission: { id: report.id, goal: mission.goal, step: index + 1,
                        results: report.steps.map(previous => previous.result) } },
                constraints: { ...mission.constraints, ...step.constraints }
            };
            checkDeadline();
            if (controller.signal.aborted) {
                report.status = abortStatus();
                report.error = errorDetails(controller.signal.reason);
                break;
            }
            const progress = { index: index + 1, intentId: intent.id, goal: step.goal, status: 'running',
                startedAt: new Date().toISOString() };
            const stepStarted = performance.now();
            report.steps.push(progress);
            await this.checkpoint(record, 'step.started');
            try {
                checkDeadline();
                if (controller.signal.aborted) throw controller.signal.reason;
                progress.result = await this.coordinator.dispatch(intent, { signal: controller.signal });
                checkDeadline();
                if (controller.signal.aborted) throw controller.signal.reason;
                progress.status = 'completed';
            } catch (error) {
                progress.status = controller.signal.aborted ? abortStatus() : 'failed';
                progress.error = errorDetails(error);
                report.status = progress.status;
                report.error = progress.error;
            }
            progress.finishedAt = new Date().toISOString();
            progress.durationMs = Math.round(performance.now() - stepStarted);
            await this.checkpoint(record, 'step.finished');
            if (report.status !== 'running') break;
        }
        checkDeadline();
        if (report.status === 'running') {
            report.status = controller.signal.aborted ? abortStatus() : 'completed';
            if (controller.signal.aborted) report.error = errorDetails(controller.signal.reason);
        }
        report.finishedAt = new Date().toISOString();
        report.durationMs = Math.round(performance.now() - record.startedTick);
        await this.checkpoint(record, 'run.finished');
        return snapshot(report);
    }
}

module.exports = { AgentPlatform, FileRunStore };
