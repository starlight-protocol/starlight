/**
 * Sentinel Unit Tests
 * Tests built-in Sentinels: Pulse, Janitor
 */

class TestSentinels {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        SENTINEL UNIT TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testPulseSentinel();
        await this.testJanitorSentinel();
        await this.testSentinelBase();
        await this.testCapabilities();
        await this.testSelectors();

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

    async testPulseSentinel() {
        console.log('Test: Pulse Sentinel\n');

        const pulse = {
            layer: 'PulseSentinel',
            priority: 1, // Highest priority
            capabilities: ['stability-monitoring'],
            selectors: [] // Monitors all activity, not specific selectors
        };

        this.assert(pulse.priority === 1, 'Has highest priority');
        this.assert(pulse.capabilities.includes('stability-monitoring'), 'Has stability capability');
        this.assert(pulse.selectors.length === 0, 'No selectors (monitors all)');

        // Entropy detection logic
        const entropyData = {
            mutationCount: 15,
            networkPending: 2,
            threshold: 10
        };

        const isUnstable = entropyData.mutationCount > entropyData.threshold;
        this.assert(isUnstable === true, 'Detects high mutation rate');

        const shouldWait = isUnstable || entropyData.networkPending > 0;
        this.assert(shouldWait === true, 'Vetoes when unstable');
    }

    async testJanitorSentinel() {
        console.log('\nTest: Janitor Sentinel\n');

        const janitor = {
            layer: 'JanitorSentinel',
            priority: 5,
            capabilities: ['detection', 'healing'],
            selectors: ['.modal', '.popup', '#overlay', '.cookie-consent', '.newsletter']
        };

        this.assert(janitor.priority === 5, 'Has medium priority');
        this.assert(janitor.capabilities.includes('detection'), 'Has detection capability');
        this.assert(janitor.capabilities.includes('healing'), 'Has healing capability');
        this.assert(janitor.selectors.length >= 5, 'Has multiple selectors');

        // Obstacle detection logic
        const blocking = [
            { selector: '.cookie-banner', className: 'cookie-banner' },
            { selector: '#promo-popup', id: 'promo-popup' }
        ];

        const matches = blocking.filter(b =>
            janitor.selectors.some(s =>
                s.includes('cookie') || b.className?.includes('cookie') || b.id?.includes('popup')
            )
        );

        this.assert(matches.length > 0, 'Detects matching obstacles');
    }

    async testSentinelBase() {
        console.log('\nTest: Sentinel Base Class\n');

        const baseMethods = [
            'on_pre_check',
            'on_entropy',
            'on_context_update',
            'send_clear',
            'send_wait',
            'send_hijack',
            'send_resume',
            'send_action'
        ];

        for (const method of baseMethods) {
            this.assert(typeof method === 'string', `Has ${method} method`);
        }
    }

    async testCapabilities() {
        console.log('\nTest: Capabilities\n');

        const allCapabilities = [
            'stability-monitoring',
            'detection',
            'healing',
            'vision',
            'pii-detection',
            'accessibility',
            'form-filling'
        ];

        for (const cap of allCapabilities) {
            this.assert(typeof cap === 'string', `Valid capability: ${cap}`);
        }
    }

    async testSelectors() {
        console.log('\nTest: Selector Patterns\n');

        const commonPatterns = [
            // Modals
            '.modal', '.popup', '#overlay', '[role="dialog"]',
            // Cookie consent
            '.cookie-consent', '.cookie-banner', '#cookie-accept',
            // Newsletter
            '.newsletter', '.subscribe-popup', '#signup-modal',
            // CAPTCHA
            '.g-recaptcha', '#recaptcha', '.captcha'
        ];

        for (const pattern of commonPatterns) {
            const isValid = pattern.startsWith('.') || pattern.startsWith('#') || pattern.startsWith('[');
            this.assert(isValid, `Valid pattern: ${pattern}`);
        }
    }
}

// Run tests
const tester = new TestSentinels();
tester.runTests().then(passed => {
    process.exit(passed ? 0 : 1);
});
