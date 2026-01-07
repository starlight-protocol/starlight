/**
 * CAPTCHA Detection Test
 * 
 * Tests if JanitorSentinel detects CAPTCHA elements and signals HIJACK.
 * Expected: JanitorSentinel should detect CAPTCHA and signal HIJACK.
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function runMission() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[CAPTCHA Test] 🌌 Starting CAPTCHA Detection Test...\n');

        // Step 1: Navigate to CAPTCHA test page
        console.log('[CAPTCHA Test] Step 1: Loading CAPTCHA test page...');
        await runner.goto(`file://${path.join(__dirname, 'captcha_test.html')}`);
        await runner.checkpoint('PAGE_LOADED');
        console.log('[CAPTCHA Test] ✅ Test page loaded\n');

        // Step 2: Try to click button (should be blocked by CAPT CHA)
        console.log('[CAPTCHA Test] Step 2: Attempting to click button...');
        console.log('[CAPTCHA Test] Expected: JanitorSentinel should detect CAPTCHA and signal HIJACK\n');

        try {
            await runner.clickGoal('Click Me');
            console.log('[CAPTCHA Test] ✅ Click completed (Janitor may have cleared CAPTCHA)\n');
        } catch (error) {
            console.log(`[CAPTCHA Test] ⚠️ Click failed: ${error.message}\n`);
        }

        await runner.checkpoint('TEST_COMPLETE');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[CAPTCHA Test] 🎯 CAPTCHA Detection Test Complete');
        console.log('[CAPTCHA Test] Check Hub console for Janitor activity');
        await runner.finish('CAPTCHA test complete');

    } catch (error) {
        console.error('[CAPTCHA Test] ❌ Test failed:', error.message);
        await runner.finish('CAPTCHA test failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
