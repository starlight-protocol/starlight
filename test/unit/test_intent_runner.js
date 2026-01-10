/**
 * IntentRunner Unit Tests (Structural Verification)
 * Phase 16.1: Zero-Defect Line Coverage
 */

const path = require('path');

// Mock WebSocket class for Node environment
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 1; // OPEN
        this.handlers = {};
        this.sent = [];

        // Auto-emit 'open' in next tick
        setTimeout(() => {
            if (this.onopen) this.onopen();
            if (this.handlers['open']) this.handlers['open']();
        }, 0);
    }

    set onopen(cb) { this._onopen = cb; }
    get onopen() { return this._onopen; }
    set onmessage(cb) { this._onmessage = cb; }
    get onmessage() { return this._onmessage; }

    on(event, cb) {
        this.handlers[event] = cb;
        return this;
    }

    send(data) {
        this.sent.push(JSON.parse(data));
        return this;
    }

    close() {
        this.readyState = 3;
        return this;
    }

    // Helper to simulate Hub response
    mockResponse(id, result) {
        const msg = JSON.stringify({
            jsonrpc: '2.0',
            id: id,
            result: result
        });
        if (this.onmessage) this.onmessage({ data: msg });
        if (this.handlers['message']) this.handlers['message'](msg);
    }
}

// Inject Mock into require cache AND global
try {
    const wsPath = require.resolve('ws');
    require.cache[wsPath] = {
        id: wsPath,
        filename: wsPath,
        loaded: true,
        exports: MockWebSocket
    };
} catch (e) { }

global.WebSocket = MockWebSocket;
global.WebSocket.isMock = true;

const IntentRunner = require('../../src/intent_runner');

class TestIntentRunnerStructural {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        INTENTRUNNER STRUCTURAL TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testConnection();
        await this.testCommandIssuance();
        await this.testCheckpoint();

        console.log('\n═══════════════════════════════════════════════════════');
        console.log(`  RESULTS: ${this.passedTests} passed, ${this.failedTests} failed`);
        console.log('═══════════════════════════════════════════════════════\n');

        return this.failedTests === 0;
    }

    assert(condition, testName) {
        if (condition) {
            console.log(`  ✓ ${testName}`);
            this.passedTests++;
        } else {
            console.log(`  ✗ ${testName}`);
            this.failedTests++;
        }
    }

    async testConnection() {
        console.log('Test: Hub Connection\n');

        const runner = new IntentRunner();
        const connectPromise = runner.connect();

        // Wait for connection
        await connectPromise;

        this.assert(runner.ws !== null, 'WebSocket initialized');
        this.assert(runner.ws.url.includes('8080'), 'Connects to correct port');
    }

    async testCommandIssuance() {
        console.log('\nTest: Command Issuance (goto)\n');

        const runner = new IntentRunner();
        await runner.connect();

        const gotoPromise = runner.goto('https://example.com');

        // Capture sent message
        const sent = runner.ws.sent[0];
        this.assert(sent.method === 'starlight.intent', 'Sends starlight.intent method');
        this.assert(sent.params.cmd === 'goto', 'Command is goto');

        // Mock success response
        runner.ws.mockResponse(sent.id, { success: true });

        const result = await gotoPromise;
        this.assert(result.success === true, 'Command returns success from Hub');
    }

    async testCheckpoint() {
        console.log('\nTest: Checkpoint Protocol\n');

        const runner = new IntentRunner();
        await runner.connect();

        const cpPromise = runner.checkpoint('PAGE_LOADED');

        const sent = runner.ws.sent[0];
        this.assert(sent.params.cmd === 'checkpoint', 'Command is checkpoint');
        this.assert(sent.params.name === 'PAGE_LOADED', 'Checkpoint name is correct');

        runner.ws.mockResponse(sent.id, { acknowledged: true });
        await cpPromise;
        this.assert(true, 'Checkpoint completes after ACK');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new TestIntentRunnerStructural();
    tester.runTests().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}
module.exports = TestIntentRunnerStructural;
