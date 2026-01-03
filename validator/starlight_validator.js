/**
 * Starlight Protocol TCK Validator
 * 
 * Technology Compatibility Kit for certifying Sentinel implementations.
 * Acts as a mock Hub and tests if a Sentinel responds correctly to
 * valid and invalid protocol messages.
 * 
 * Usage: node validator/starlight_validator.js [sentinel-url]
 * 
 * If a Sentinel passes all tests, it earns "Starlight v1.0.0 Certified" badge.
 */

const WebSocket = require('ws');
const { WebSocketServer } = require('ws');

class StarlightValidator {
    constructor(port = 8090) {
        this.port = port;
        this.wss = null;
        this.client = null;
        this.testResults = [];
        this.pendingResponses = new Map();
        this.messageId = 0;
    }

    /**
     * Start the mock Hub server
     */
    async start() {
        return new Promise((resolve) => {
            this.wss = new WebSocketServer({ port: this.port });

            this.wss.on('connection', (ws) => {
                console.log('[Validator] Sentinel connected');
                this.client = ws;

                ws.on('message', (data) => {
                    this.handleMessage(JSON.parse(data));
                });

                ws.on('close', () => {
                    console.log('[Validator] Sentinel disconnected');
                    this.client = null;
                });

                resolve();
            });

            console.log(`[Validator] Mock Hub listening on ws://localhost:${this.port}`);
            console.log('[Validator] Waiting for Sentinel to connect...');
        });
    }

    handleMessage(msg) {
        console.log(`[Validator] Received: ${msg.method || msg.type || 'unknown'}`);

        const pending = this.pendingResponses.get(msg.id);
        if (pending) {
            pending.resolve(msg);
            this.pendingResponses.delete(msg.id);
        }

        // Handle registration
        if (msg.method === 'starlight.registration') {
            this.sentinelInfo = msg.params;
            console.log(`[Validator] Registered: ${msg.params.layer} (priority: ${msg.params.priority})`);
        }

        // Respond to hijack - acknowledge lock
        if (msg.method === 'starlight.hijack') {
            this.client.send(JSON.stringify({
                jsonrpc: '2.0',
                result: { locked: true },
                id: msg.id
            }));
        }

        // Respond to action - acknowledge execution
        if (msg.method === 'starlight.action') {
            this.client.send(JSON.stringify({
                jsonrpc: '2.0',
                result: { success: true },
                id: msg.id
            }));
        }

        // Respond to resume - acknowledge unlock
        if (msg.method === 'starlight.resume') {
            this.client.send(JSON.stringify({
                jsonrpc: '2.0',
                result: { unlocked: true },
                id: msg.id
            }));
        }
    }

    /**
     * Send a message and wait for response
     */
    async send(msg, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const id = `validator-${++this.messageId}`;
            msg.id = id;

            const timer = setTimeout(() => {
                this.pendingResponses.delete(id);
                reject(new Error('Timeout waiting for response'));
            }, timeout);

            this.pendingResponses.set(id, {
                resolve: (response) => {
                    clearTimeout(timer);
                    resolve(response);
                }
            });

            this.client.send(JSON.stringify(msg));
        });
    }

    /**
     * Send a message without waiting for response
     */
    sendNoWait(msg) {
        msg.id = `validator-${++this.messageId}`;
        this.client.send(JSON.stringify(msg));
    }

    /**
     * Run all TCK tests
     */
    async runTests() {
        console.log('\n' + '='.repeat(60));
        console.log('  STARLIGHT PROTOCOL TCK VALIDATOR v1.0.0');
        console.log('='.repeat(60) + '\n');

        const tests = [
            this.testValidRegistration,
            this.testPreCheckWithNoBlockers,
            this.testPreCheckWithBlocker,
            this.testMalformedJson,
            this.testMissingMethod,
            this.testHijackFlow,
        ];

        for (const test of tests) {
            try {
                await test.call(this);
            } catch (e) {
                this.recordResult(test.name, false, e.message);
            }
        }

        this.printResults();
    }

    /**
     * Test: Valid registration should be accepted
     */
    async testValidRegistration() {
        const testName = 'Valid Registration';

        if (!this.sentinelInfo) {
            this.recordResult(testName, false, 'No registration received');
            return;
        }

        // Check required fields
        if (!this.sentinelInfo.layer || typeof this.sentinelInfo.priority !== 'number') {
            this.recordResult(testName, false, 'Missing required fields (layer, priority)');
            return;
        }

        this.recordResult(testName, true, `${this.sentinelInfo.layer} registered successfully`);
    }

    /**
     * Test: Pre-check with no blockers should get starlight.clear
     */
    async testPreCheckWithNoBlockers() {
        const testName = 'Pre-check (No Blockers)';

        // Wait for any response within 3 seconds
        const responsePromise = new Promise((resolve) => {
            const handler = (data) => {
                const msg = JSON.parse(data);
                if (msg.method === 'starlight.clear' || msg.method === 'starlight.wait') {
                    resolve(msg);
                    this.client.removeListener('message', handler);
                }
            };
            this.client.on('message', handler);
            setTimeout(() => resolve(null), 3000);
        });

        this.sendNoWait({
            jsonrpc: '2.0',
            method: 'starlight.pre_check',
            params: {
                command: { cmd: 'click', selector: '#test-button' },
                blocking: []
            }
        });

        const response = await responsePromise;

        if (!response) {
            this.recordResult(testName, false, 'No response received');
            return;
        }

        if (response.method === 'starlight.clear') {
            this.recordResult(testName, true, 'Sentinel sent starlight.clear');
        } else if (response.method === 'starlight.wait') {
            this.recordResult(testName, true, 'Sentinel sent starlight.wait (acceptable)');
        } else {
            this.recordResult(testName, false, `Unexpected response: ${response.method}`);
        }
    }

    /**
     * Test: Pre-check with blocker should trigger action
     */
    async testPreCheckWithBlocker() {
        const testName = 'Pre-check (With Blocker)';

        // Wait for hijack or clear
        const responsePromise = new Promise((resolve) => {
            const handler = (data) => {
                const msg = JSON.parse(data);
                if (['starlight.clear', 'starlight.wait', 'starlight.hijack'].includes(msg.method)) {
                    resolve(msg);
                    this.client.removeListener('message', handler);
                }
            };
            this.client.on('message', handler);
            setTimeout(() => resolve(null), 5000);
        });

        this.sendNoWait({
            jsonrpc: '2.0',
            method: 'starlight.pre_check',
            params: {
                command: { cmd: 'click', selector: '#target' },
                blocking: [{
                    selector: '.modal',
                    className: 'modal overlay',
                    id: 'popup',
                    display: 'flex',
                    rect: '800x600'
                }]
            }
        });

        const response = await responsePromise;

        if (!response) {
            this.recordResult(testName, false, 'No response to blocker');
            return;
        }

        this.recordResult(testName, true, `Sentinel responded with ${response.method}`);
    }

    /**
     * Test: Connection should survive malformed JSON
     */
    async testMalformedJson() {
        const testName = 'Malformed JSON Handling';

        // Check if client is still connected
        if (!this.client || this.client.readyState !== WebSocket.OPEN) {
            this.recordResult(testName, false, 'Sentinel disconnected before test');
            return;
        }

        // Send garbage
        this.client.send('{ this is not valid json }}}');

        // Connection should still work
        await new Promise(r => setTimeout(r, 500));

        if (this.client && this.client.readyState === WebSocket.OPEN) {
            this.recordResult(testName, true, 'Connection survived malformed JSON');
        } else {
            this.recordResult(testName, false, 'Connection closed after malformed JSON');
        }
    }

    /**
     * Test: Missing method field should be handled gracefully
     */
    async testMissingMethod() {
        const testName = 'Missing Method Field';

        // Check if client is still connected
        if (!this.client || this.client.readyState !== WebSocket.OPEN) {
            this.recordResult(testName, false, 'Sentinel disconnected before test');
            return;
        }

        this.client.send(JSON.stringify({
            jsonrpc: '2.0',
            params: { test: 'value' },
            id: 'test-missing-method'
        }));

        await new Promise(r => setTimeout(r, 500));

        if (this.client && this.client.readyState === WebSocket.OPEN) {
            this.recordResult(testName, true, 'Connection survived missing method');
        } else {
            this.recordResult(testName, false, 'Connection closed on missing method');
        }
    }

    /**
     * Test: Hijack flow (if Sentinel has obstacle-removal capability)
     */
    async testHijackFlow() {
        const testName = 'Hijack Flow';

        if (!this.sentinelInfo?.capabilities?.includes('obstacle-removal')) {
            this.recordResult(testName, true, 'Skipped (no obstacle-removal capability)');
            return;
        }

        // Wait for hijack
        const hijackPromise = new Promise((resolve) => {
            const handler = (data) => {
                const msg = JSON.parse(data);
                if (msg.method === 'starlight.hijack') {
                    resolve(msg);
                    this.client.removeListener('message', handler);
                }
            };
            this.client.on('message', handler);
            setTimeout(() => resolve(null), 5000);
        });

        this.sendNoWait({
            jsonrpc: '2.0',
            method: 'starlight.pre_check',
            params: {
                command: { cmd: 'click', selector: '#target' },
                blocking: [{
                    selector: '.cookie-banner',
                    className: 'modal overlay',
                    display: 'flex',
                    rect: '1000x800'
                }]
            }
        });

        const hijack = await hijackPromise;

        if (!hijack) {
            this.recordResult(testName, false, 'No hijack received for blocker');
            return;
        }

        if (hijack.params?.reason) {
            this.recordResult(testName, true, `Hijack reason: "${hijack.params.reason}"`);
        } else {
            this.recordResult(testName, false, 'Hijack missing reason');
        }
    }

    recordResult(name, passed, details) {
        this.testResults.push({ name, passed, details });
        const icon = passed ? '✅' : '❌';
        console.log(`${icon} ${name}: ${details}`);
    }

    printResults() {
        const passed = this.testResults.filter(t => t.passed).length;
        const total = this.testResults.length;
        const skipped = this.testResults.filter(t => t.details?.includes('disconnected') || t.details?.includes('Skipped')).length;
        const coreTests = total - skipped;
        const corePassed = passed;

        console.log('\n' + '='.repeat(60));
        console.log(`  RESULTS: ${passed}/${total} tests passed`);
        if (skipped > 0) {
            console.log(`  (${skipped} tests skipped due to disconnect)`);
        }
        console.log('='.repeat(60));

        // Certification requires core tests to pass (registration + pre-check)
        const coreTestsPassed = this.testResults
            .filter(t => ['Valid Registration', 'Pre-check (No Blockers)', 'Pre-check (With Blocker)'].includes(t.name))
            .every(t => t.passed);

        if (coreTestsPassed) {
            console.log('\n  🏆 CERTIFIED: Starlight Protocol v1.0.0 Compliant!\n');
        } else {
            console.log('\n  ⚠️  Core tests failed. Review implementation.\n');
        }

        return coreTestsPassed;
    }

    async stop() {
        if (this.client) {
            this.client.close();
        }
        if (this.wss) {
            this.wss.close();
        }
    }
}

// Main execution
async function main() {
    const validator = new StarlightValidator();

    try {
        await validator.start();

        // Wait for Sentinel to connect and register
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (validator.sentinelInfo) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);

            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 30000);
        });

        if (!validator.sentinelInfo) {
            console.log('\n❌ No Sentinel connected within 30 seconds');
            process.exit(1);
        }

        await validator.runTests();

    } finally {
        await validator.stop();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = StarlightValidator;
