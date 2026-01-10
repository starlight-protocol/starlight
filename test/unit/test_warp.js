/**
 * Warp (Structural Verification)
 * Phase 16.1: Zero-Defect Line Coverage
 * 
 * This test imports the actual StarlightWarp class and exercises its core logic.
 */

const { StarlightWarp } = require('../../src/warp');

class TestWarpStructural {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        WARP STRUCTURAL TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testInitialization();
        await this.testCaptureConfig();

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

        // Mock page object
        const mockPage = {
            on: () => { },
            evaluate: async () => 'test-user-agent',
            viewportSize: async () => ({ width: 1280, height: 720 })
        };

        const warp = new StarlightWarp(mockPage);
        this.assert(warp.page === mockPage, 'Page correctly assigned');
        this.assert(warp.config.outputDir === './warps', 'Default output directory assigned');
        this.assert(warp.sanitizer !== undefined, 'Sanitizer initialized');
    }

    async testCaptureConfig() {
        console.log('\nTest: Capture Configuration\n');

        const warp = new StarlightWarp({}, { sanitize: false, captureScreenshot: false });
        this.assert(warp.config.sanitize === false, 'Sanitize flag correctly overridden');
        this.assert(warp.config.captureScreenshot === false, 'Screenshot flag correctly overridden');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new TestWarpStructural();
    tester.runTests().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}
module.exports = TestWarpStructural;
