'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createHttpJsonAgent } = require('../../src/platform');

const health = { services: [
    { name: 'api', status: 'healthy' },
    { name: 'queue', status: 'healthy' },
    { name: 'worker', status: 'healthy' }
] };

function validHealth(value) {
    return value && Array.isArray(value.services) && value.services.length > 0 && value.services.length <= 20 &&
        value.services.every(service => service && typeof service.name === 'string' &&
            /^[a-z0-9-]{1,50}$/.test(service.name) && service.status === 'healthy');
}

function reportText(value) {
    if (!validHealth(value)) throw new Error('health data did not pass validation');
    return '# Service health\n\n' + value.services.map(service => `- ${service.name}: ${service.status}`).join('\n') + '\n';
}

async function createDemo(outputDir) {
    // A real local fixture endpoint makes the integration reproducible without credentials.
    const server = http.createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/health') { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(health));
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
        agents: [
            createHttpJsonAgent({ name: 'service-health-reader', goal: 'Read service health',
                allowedOrigins: [origin], maxResponseBytes: 8192, validate: validHealth }),
            {
                name: 'health-report-writer', capabilities: ['files', 'health-report'],
                canHandle: intent => intent.goal === 'Write the service health report',
                async run(intent, { signal }) {
                    const data = intent.context.mission.results.at(-1).value;
                    const output = intent.context.outputPath;
                    await fs.mkdir(path.dirname(output), { recursive: true });
                    await fs.writeFile(output, reportText(data), { flag: 'wx', signal });
                    return { status: 'completed', value: { path: output, services: data.services.length },
                        evidence: [{ type: 'file', path: output }] };
                },
                async verify(intent, outcome, { signal }) {
                    return await fs.readFile(outcome.value.path, { encoding: 'utf8', signal }) ===
                        reportText(intent.context.mission.results.at(-1).value);
                }
            }
        ],
        mission: {
            goal: 'Verify service health and save a report',
            context: { url: `${origin}/health`, outputPath: path.join(outputDir, 'artifacts', `health-${crypto.randomUUID()}.md`) },
            steps: ['Read service health', 'Write the service health report']
        },
        close: () => new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
            server.closeAllConnections();
        })
    };
}

module.exports = { createDemo };
