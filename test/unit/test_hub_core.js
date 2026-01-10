/**
 * Hub Core Unit Tests (Structural Verification)
 * Phase 16.1: Zero-Defect Line Coverage
 */

const path = require('path');
const { CBAHub } = require('../../src/hub');

// Manual mock for BrowserAdapter
class MockBrowserAdapter {
    static async create() { return new MockBrowserAdapter(); }
    constructor() {
        this.browserType = 'chromium';
    }
    getCapabilities() { return { shadowDomPiercing: true }; }
    on() { }
    async launch() { return { on: () => { } }; }
    async newContext() { }
    async newPage() {
        return {
            on: () => { },
            exposeFunction: async () => { },
            addInitScript: async () => { },
            route: async () => { },
            evaluate: async (fn, args) => {
                // Return dummy data based on goalText for semantic resolution tests
                if (args && args.goalText === 'ShadowTarget') return { selector: '>>> #shadow-btn', inShadow: true };
                if (args && args.goalText === 'TextTarget') return { selector: 'button:has-text("Target")', inShadow: false, textMatch: true };
                if (args && args.goalText === 'FormTarget') return { selector: '#target-input' };
                return null;
            }
        };
    }
}

class TestHubCoreStructural {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        HUB CORE STRUCTURAL TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testInitialization();
        await this.testConfigLoading();
        await this.testProtocolValidation();
        await this.testHistoricalMemory();
        await this.testSemanticResolution();
        await this.testFormResolution();
        await this.testEntropyBroadcasting();
        await this.testErrorHandling();

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

    async testInitialization() {
        console.log('Test: Initialization\n');

        try {
            const hub = new CBAHub(9999, true);
            this.assert(hub.port === 9999, 'Port correctly assigned');
            this.assert(hub.headless === true, 'Headless flag correctly assigned');
            this.assert(typeof hub.config === 'object', 'Config object initialized');
        } catch (e) {
            this.assert(false, `Initialization failed: ${e.message}`);
        }
    }

    async testConfigLoading() {
        console.log('\nTest: Config Loading\n');

        const hub = new CBAHub(8080);
        const config = hub.loadConfig();

        this.assert(config !== null, 'Config loads from file');
        this.assert(config.hub !== undefined, 'Config contains hub settings');
    }

    async testProtocolValidation() {
        console.log('\nTest: Protocol Validation\n');

        const hub = new CBAHub(8080);

        const validMsg = { jsonrpc: '2.0', method: 'starlight.intent', params: { cmd: 'click' }, id: 1 };
        const result = hub.validateProtocol(validMsg);
        if (!result) console.log('DEBUG: Hub rejected valid message:', validMsg);
        this.assert(!!result, 'Validates correct JSON-RPC');

        const invalidMsg = { method: 'invalid' };
        this.assert(hub.validateProtocol(invalidMsg) === false, 'Rejects invalid protocol');
    }

    async testHistoricalMemory() {
        console.log('\nTest: Historical Memory\n');

        const hub = new CBAHub(8080);
        hub.loadHistoricalMemory();

        this.assert(hub.historicalMemory instanceof Map, 'Historical memory is a Map');

        hub.learnMapping('Login', '#login-btn');
        this.assert(hub.historicalMemory.get('Login') === '#login-btn', 'Learns and stores new mapping');
    }

    async testSemanticResolution() {
        console.log('\nTest: Semantic Resolution (Shadow DOM & Text)\n');

        const hub = new CBAHub(8080);
        hub.browserAdapter = new MockBrowserAdapter();
        hub.page = await hub.browserAdapter.newPage();

        const res1 = await hub.resolveSemanticIntent('ShadowTarget');
        this.assert(res1.selector === '>>> #shadow-btn' && res1.shadowPierced, 'Resolves Shadow DOM target');

        const res2 = await hub.resolveSemanticIntent('TextTarget');
        this.assert(res2.selector.includes('has-text'), 'Resolves text-based target');

        hub.historicalMemory.set('GhostTarget', '#ghost');
        const res3 = await hub.resolveSemanticIntent('GhostTarget');
        this.assert(res3.selfHealed === true, 'Resolves from predictive memory');
    }

    async testFormResolution() {
        console.log('\nTest: Form Intent Resolution\n');

        const hub = new CBAHub(8080);
        hub.browserAdapter = new MockBrowserAdapter();
        hub.page = await hub.browserAdapter.newPage();

        const res1 = await hub.resolveFormIntent('FormTarget');
        this.assert(res1.selector === '#target-input', 'Resolves form input by goal');

        hub.historicalMemory.set('fill:StoredInput', '#stored');
        const res2 = await hub.resolveFormIntent('StoredInput');
        this.assert(res2.selfHealed === true, 'Resolves form from memory');
    }

    async testEntropyBroadcasting() {
        console.log('\nTest: Entropy Stream Broadcasting\n');

        const hub = new CBAHub(8080);
        hub.wss = { clients: [{ readyState: 1, send: () => { } }] };

        hub.broadcastEntropy();
        this.assert(hub.lastEntropyBroadcast > 0, 'Updates last entropy timestamp');

        // Test throttling
        const first = hub.lastEntropyBroadcast;
        hub.broadcastEntropy();
        this.assert(hub.lastEntropyBroadcast === first, 'Throttles entropy broadcast');
    }

    async testErrorHandling() {
        console.log('\nTest: Hub Error Handling\n');

        const hub = new CBAHub(8080);

        // Malformed config load
        const badConfig = hub.loadConfig(); // Should use default {} if file missing or corrupt
        this.assert(typeof badConfig === 'object', 'Gracefully handles config load');

        // Screenshot cleanup failure (non-existent dir)
        hub.screenshotsDir = '/non/existent/path/never/ever';
        hub.cleanupScreenshots(); // Should log warning but not crash
        this.assert(true, 'Cleanup failure handled gracefully');

        // Disconnect handler
        hub.handleDisconnect('unknown-id');
        this.assert(true, 'Disconnect handled for unknown sentinel');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new TestHubCoreStructural();
    tester.runTests().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}
module.exports = TestHubCoreStructural;
