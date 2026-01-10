/**
 * Shadow Utils Unit Tests (Structural Verification)
 * Phase 16.1: Zero-Defect Line Coverage
 * 
 * This test imports the actual shadow_utils file and exercises its core logic.
 */

const ShadowUtils = require('../../src/shadow_utils');

class TestShadowUtilsStructural {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        SHADOW UTILS STRUCTURAL TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testHelperSerialization();
        await this.testResolverBuilder();

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

    async testHelperSerialization() {
        console.log('Test: Helper Serialization\n');

        const helpers = ShadowUtils.ShadowDOMHelpers;
        this.assert(typeof helpers.collectElements === 'string', 'collectElements is serialized as string');
        this.assert(typeof helpers.generateShadowSelector === 'string', 'generateShadowSelector is serialized as string');

        const combined = ShadowUtils.getInjectableHelpers();
        this.assert(combined.includes('function collectElements'), 'Combined helpers contain function definitions');
    }

    async testResolverBuilder() {
        console.log('\nTest: Resolver Builder\n');

        const resolver = ShadowUtils.buildSemanticResolver('Login', true, 5);
        this.assert(typeof resolver === 'function', 'buildSemanticResolver returns a function');

        // The returned function is designed for page.evaluate
        // We can check its signature
        this.assert(resolver.toString().includes('goalText'), 'Resolver function accepts params');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new TestShadowUtilsStructural();
    tester.runTests().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}
module.exports = TestShadowUtilsStructural;
