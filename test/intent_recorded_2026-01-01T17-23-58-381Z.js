/**
 * Auto-recorded Test: recorded_2026-01-01T17-23-58-381Z
 * Generated: 2026-01-01T17:23:58.381Z
 * Source URL: null
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();
    
    try {
        await runner.connect();
        console.log('[Mission] Starting recorded test: recorded_2026-01-01T17-23-58-381Z');
        
    console.log('[Mission] Step 1: Navigating to https://www.dhirajdas.dev/...');
    await runner.goto('https://www.dhirajdas.dev/');

    console.log('[Mission] Step 2: Navigating to https://www.dhirajdas.dev/blog...');
    await runner.goto('https://www.dhirajdas.dev/blog');

    await runner.clickGoal('Blog', { stabilityHint: 1895 });
    console.log('[Mission] Step 4: Navigating to https://www.dhirajdas.dev/blog/constellation-based-automation-starlight-protocol...');
    await runner.goto('https://www.dhirajdas.dev/blog/constellation-based-automation-starlight-protocol');

    await runner.clickGoal('h3', { stabilityHint: 2131 });
        
        console.log('[Mission] ✅ All recorded steps completed!');
        await runner.finish('Recorded test complete');
    } catch (error) {
        console.error('[Mission] ❌ Test failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
