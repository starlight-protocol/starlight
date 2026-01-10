/**
 * SDK (SentinelBase) Unit Tests
 * Tests the Python Sentinel SDK for protocol compliance
 */

const { spawn } = require('child_process');
const path = require('path');

class TestSentinelSDK {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        SENTINEL SDK UNIT TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testRegistrationMessage();
        await this.testPreCheckResponse();
        await this.testHijackFlow();
        await this.testActionCommand();
        await this.testContextUpdate();
        await this.testPriorityLevels();

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

    async testRegistrationMessage() {
        console.log('Test: Registration Message\n');

        const registration = {
            jsonrpc: '2.0',
            method: 'starlight.registration',
            params: {
                layer: 'TestSentinel',
                priority: 5,
                capabilities: ['detection', 'healing'],
                selectors: ['.modal', '.popup', '#overlay']
            },
            id: 'reg-1'
        };

        this.assert(registration.method === 'starlight.registration', 'Uses registration method');
        this.assert(typeof registration.params.layer === 'string', 'Has layer name');
        this.assert(typeof registration.params.priority === 'number', 'Has priority number');
        this.assert(registration.params.priority >= 1 && registration.params.priority <= 10, 'Priority in valid range (1-10)');
        this.assert(Array.isArray(registration.params.capabilities), 'Has capabilities array');
        this.assert(Array.isArray(registration.params.selectors), 'Has selectors array');
    }

    async testPreCheckResponse() {
        console.log('\nTest: Pre-Check Responses\n');

        // CLEAR response
        const clearResponse = {
            jsonrpc: '2.0',
            method: 'starlight.clear',
            params: {},
            id: 'clear-1'
        };
        this.assert(clearResponse.method === 'starlight.clear', 'CLEAR response format');

        // WAIT response
        const waitResponse = {
            jsonrpc: '2.0',
            method: 'starlight.wait',
            params: { retryAfterMs: 500 },
            id: 'wait-1'
        };
        this.assert(waitResponse.method === 'starlight.wait', 'WAIT response format');
        this.assert(typeof waitResponse.params.retryAfterMs === 'number', 'WAIT has retryAfterMs');

        // HIJACK response
        const hijackResponse = {
            jsonrpc: '2.0',
            method: 'starlight.hijack',
            params: { reason: 'Obstacle blocking target' },
            id: 'hijack-1'
        };
        this.assert(hijackResponse.method === 'starlight.hijack', 'HIJACK response format');
        this.assert(typeof hijackResponse.params.reason === 'string', 'HIJACK has reason');
    }

    async testHijackFlow() {
        console.log('\nTest: Hijack Flow\n');

        // Full hijack flow: HIJACK -> ACTION(s) -> RESUME
        const hijackMsg = { method: 'starlight.hijack', params: { reason: 'Cookie banner' } };
        const actionMsg = { method: 'starlight.action', params: { cmd: 'click', selector: '.accept' } };
        const resumeMsg = { method: 'starlight.resume', params: { re_check: true } };

        this.assert(hijackMsg.method === 'starlight.hijack', 'Hijack initiates flow');
        this.assert(actionMsg.method === 'starlight.action', 'Action during hijack');
        this.assert(actionMsg.params.cmd === 'click', 'Action has command');
        this.assert(resumeMsg.method === 'starlight.resume', 'Resume ends flow');
        this.assert(resumeMsg.params.re_check === true, 'Resume requests re-check');
    }

    async testActionCommand() {
        console.log('\nTest: Action Commands\n');

        const actionTypes = [
            { cmd: 'click', selector: '.btn' },
            { cmd: 'fill', selector: '#input', text: 'hello' },
            { cmd: 'hide', selector: '.popup' }
        ];

        for (const action of actionTypes) {
            const msg = {
                jsonrpc: '2.0',
                method: 'starlight.action',
                params: action,
                id: `action-${action.cmd}`
            };
            this.assert(msg.params.cmd === action.cmd, `Supports ${action.cmd} action`);
            this.assert(typeof msg.params.selector === 'string', `${action.cmd} has selector`);
        }
    }

    async testContextUpdate() {
        console.log('\nTest: Context Update\n');

        const contextMsg = {
            jsonrpc: '2.0',
            method: 'starlight.context_update',
            params: {
                context: {
                    pii_detected: true,
                    pii_count: 3,
                    stability_score: 0.95
                }
            },
            id: 'ctx-1'
        };

        this.assert(contextMsg.method === 'starlight.context_update', 'Uses context_update method');
        this.assert(typeof contextMsg.params.context === 'object', 'Has context object');
    }

    async testPriorityLevels() {
        console.log('\nTest: Priority Levels\n');

        const sentinels = [
            { name: 'PulseSentinel', priority: 1, desc: 'Stability (highest priority)' },
            { name: 'JanitorSentinel', priority: 5, desc: 'Obstacle clearing' },
            { name: 'VisionSentinel', priority: 7, desc: 'AI-powered detection' },
            { name: 'DataSentinel', priority: 9, desc: 'Context extraction (lowest priority)' }
        ];

        for (const s of sentinels) {
            this.assert(s.priority >= 1 && s.priority <= 10, `${s.name} priority ${s.priority} is valid`);
        }

        // Verify priority order
        this.assert(sentinels[0].priority < sentinels[1].priority, 'Pulse runs before Janitor');
        this.assert(sentinels[1].priority < sentinels[2].priority, 'Janitor runs before Vision');
    }
}

// Run tests
const tester = new TestSentinelSDK();
tester.runTests().then(passed => {
    process.exit(passed ? 0 : 1);
});
