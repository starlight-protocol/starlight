'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { snapshot } = require('../core/json');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STATUSES = ['running', 'completed', 'failed', 'cancelled'];

function validateId(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('run ID must be a UUID');
}

function validateReport(report, id) {
    if (!report || report.id !== id || !STATUSES.includes(report.status) ||
        typeof report.goal !== 'string' || !Number.isFinite(Date.parse(report.startedAt)) ||
        !report.mission || report.mission.goal !== report.goal || !Array.isArray(report.steps) ||
        report.steps.some((step, index) => !step || step.index !== index + 1 ||
            !STATUSES.includes(step.status) || typeof step.goal !== 'string' || typeof step.intentId !== 'string')) {
        throw new Error(`invalid run report: ${id}`);
    }
    return snapshot(report);
}

async function replaceSnapshot(source, destination) {
    for (let attempt = 0; ; attempt++) {
        try { await fs.rename(source, destination); return; }
        catch (error) {
            // Windows readers/virus scanners can briefly hold a non-shareable handle.
            // Retry the atomic operation; never unlink the old checkpoint as a fallback.
            if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 6) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 10 * (2 ** attempt)));
        }
    }
}

/** Atomic progress records for a trusted, local directory. One writer owns each run. */
class FileRunStore {
    constructor(directory = '.starlight/runs') {
        if (typeof directory !== 'string' || !directory.trim()) throw new Error('store directory is required');
        this.directory = path.resolve(directory);
    }

    pathFor(id) {
        validateId(id);
        return path.join(this.directory, `${id}.json`);
    }

    async create(report) { await this.write(report, true); }
    async save(report) { await this.write(report, false); }

    async write(report, exclusive) {
        const destination = this.pathFor(report.id);
        const data = JSON.stringify(validateReport(report, report.id), null, 2) + '\n';
        await fs.mkdir(this.directory, { recursive: true });
        const temporary = path.join(this.directory, `.${report.id}.${crypto.randomUUID()}.tmp`);
        let file;
        try {
            file = await fs.open(temporary, 'wx', 0o600);
            await file.writeFile(data, 'utf8');
            await file.sync();
            await file.close();
            file = undefined;
            // Link publishes the first complete record without overwriting an existing run.
            // Rename replaces subsequent snapshots atomically within the same directory.
            if (exclusive) await fs.link(temporary, destination);
            else await replaceSnapshot(temporary, destination);
            if (process.platform !== 'win32') {
                const directory = await fs.open(this.directory, 'r');
                try { await directory.sync(); } finally { await directory.close(); }
            }
        } finally {
            if (file) await file.close();
            await fs.rm(temporary, { force: true });
        }
    }

    async get(id) {
        const filename = this.pathFor(id);
        let data;
        try { data = await fs.readFile(filename, 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
        try { return validateReport(JSON.parse(data), id); }
        catch (error) { throw new Error(`cannot read run ${id}: ${error.message}`, { cause: error }); }
    }

    async list(options = {}) {
        const { status, limit = 50, offset = 0 } = options;
        if (status !== undefined && !STATUSES.includes(status)) throw new Error('invalid run status filter');
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) {
            throw new Error('limit must be 1–1000 and offset must be a nonnegative integer');
        }
        let names;
        try { names = await fs.readdir(this.directory); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
        const reports = [];
        // Read sequentially to bound open file descriptors, including on large archives.
        for (const name of names) {
            if (!name.endsWith('.json') || !UUID.test(name.slice(0, -5))) continue;
            const report = await this.get(name.slice(0, -5));
            if (report && (status === undefined || report.status === status)) reports.push({
                id: report.id, goal: report.goal, status: report.status, startedAt: report.startedAt,
                ...(report.finishedAt === undefined ? {} : { finishedAt: report.finishedAt }),
                completedSteps: report.steps.filter(step => step.status === 'completed').length,
                totalSteps: report.mission.steps?.length ?? 1
            });
        }
        reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id));
        return snapshot(reports.slice(offset, offset + limit));
    }
}

module.exports = { FileRunStore };
