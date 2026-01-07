/**
 * Comprehensive Integration Test
 * Tests all extended commands end-to-end on a real form
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function runMission() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Integration Test] 🌌 Testing All Extended Commands...\n');

        // Load comprehensive test page
        console.log('[Integration Test] Loading comprehensive test page...');
        await runner.goto(`file://${path.join(__dirname, 'comprehensive_test.html')}`);
        await runner.checkpoint('PAGE_LOADED');
        console.log('[Integration Test] ✅ Page loaded\n');

        // Test 1: fillGoal
        console.log('[Integration Test] 1. Testing fillGoal...');
        await runner.fillGoal('Username', 'testuser');
        console.log('[Integration Test] ✅ fillGoal passed\n');

        // Test 2: selectGoal
        console.log('[Integration Test] 2. Testing selectGoal...');
        await runner.selectGoal('Country', 'usa');
        console.log('[Integration Test] ✅ selectGoal passed\n');

        // Test 3: checkGoal
        console.log('[Integration Test] 3. Testing checkGoal...');
        await runner.checkGoal('Terms');
        console.log('[Integration Test] ✅ checkGoal passed\n');

        // Test 4: uncheckGoal
        console.log('[Integration Test] 4. Testing uncheckGoal...');
        await runner.uncheckGoal('Newsletter');
        console.log('[Integration Test] ✅ uncheckGoal passed\n');

        // Test 5: hoverGoal
        console.log('[Integration Test] 5. Testing hoverGoal...');
        await runner.hoverGoal('Help');
        console.log('[Integration Test] ✅ hoverGoal passed\n');

        // Test 6: scrollToGoal (semantic scrolling - no hardcoded selectors!)
        console.log('[Integration Test] 6. Testing scrollToGoal...');
        await runner.scrollToGoal('Footer');
        console.log('[Integration Test] ✅ scrollToGoal passed\n');

        // Test 7: press
        console.log('[Integration Test] 7. Testing press(Tab)...');
        await runner.press('Tab');
        console.log('[Integration Test] ✅ press passed\n');

        // Test 8: type
        console.log('[Integration Test] 8. Testing type...');
        await runner.type('Additional text');
        console.log('[Integration Test] ✅ type passed\n');

        // Test 9: uploadGoal
        console.log('[Integration Test] 9. Testing uploadGoal...');
        await runner.uploadGoal('Resume', path.join(__dirname, 'test_file.txt'));
        console.log('[Integration Test] ✅ uploadGoal passed\n');

        await runner.checkpoint('ALL_TESTS_COMPLETE');

        console.log('='.repeat(50));
        console.log('[Integration Test] 🎯 ALL 9 COMMANDS PASSED!');
        await runner.finish('All integration tests passed');

    } catch (error) {
        console.error('[Integration Test] ❌ Test failed:', error.message);
        await runner.finish('Integration test failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
