/**
 * Simple Cross-Browser Verification Script
 * Phase 14.1: Multi-Browser Foundation
 * 
 * A minimal intent script to verify browser adapter is working
 * 
 * Usage:
 *   HUB_BROWSER_ENGINE=chromium node test/intent_cross_browser_verify.js
 *   HUB_BROWSER_ENGINE=firefox node test/intent_cross_browser_verify.js
 *   HUB_BROWSER_ENGINE=webkit node test/intent_cross_browser_verify.js
 */

const IntentRunner = require('../src/intent_runner');

async function main() {
    const browser = process.env.HUB_BROWSER_ENGINE || 'chromium';
    console.log(`\n🌟 Testing with ${browser.toUpperCase()} browser\n`);

    const runner = new IntentRunner();

    try {
        await runner.connect();

        // Simple navigation test
        console.log('[Test 1] Navigation to example.com');
        await runner.goto('https://example.com');
        console.log('✓ Navigation successful');

        // Test 2: Navigate to another page
        console.log('\n[Test 2] Navigation to httpbin.org');
        await runner.goto('https://httpbin.org/html');
        console.log('✓ Second navigation successful');

        console.log(`\n✅ ${browser.toUpperCase()} - All tests passed!\n`);
        await runner.finish('Cross-browser test complete');

    } catch (error) {
        console.error(`❌ ${browser.toUpperCase()} - Test failed:`, error.message);
        await runner.finish(`Cross-browser test failed: ${error.message}`);
        process.exit(1);
    }
}

main();
