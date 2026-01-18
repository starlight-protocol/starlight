const test = require('node:test');
const assert = require('node:assert');
const { HubServer } = require('../../../../src/hub/core/HubServer');

test('HubServer: Professional Grade Orchestration', async (t) => {
    // We use a mock config to avoid launching a real browser/sentinels in unit tests
    const server = new HubServer({ port: 8096, headless: true });

    await t.test('Should initialize with correct sub-systems', () => {
        assert.ok(server.ipcBridge, 'IpcBridge missing');
        assert.ok(server.configLoader, 'ConfigLoader missing');
        assert.ok(server.lifecycleManager, 'LifecycleManager missing');
    });

    await t.test('Should handle health check', async () => {
        const mockRes = {
            writeHead: (status, headers) => {
                assert.strictEqual(status, 200);
            },
            end: (data) => {
                const body = JSON.parse(data);
                assert.strictEqual(body.status, 'healthy');
            }
        };
        server._handleHealthCheck({ url: '/health' }, mockRes);
    });

    // Cleanup
    if (server.server) server.server.close();
});
