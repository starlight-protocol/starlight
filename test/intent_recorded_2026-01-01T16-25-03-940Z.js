/**
 * Auto-recorded Test: recorded_2026-01-01T16-25-03-940Z
 * Generated: 2026-01-01T16:25:03.940Z
 * Source URL: https://www.dhirajdas.dev/
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();
    
    try {
        await runner.connect();
        console.log('[Mission] Starting recorded test: recorded_2026-01-01T16-25-03-940Z');
        
    console.log('[Mission] Step 1: Navigating to https://www.dhirajdas.dev/blog...');
    await runner.goto('https://www.dhirajdas.dev/blog');

    await runner.clickGoal('Blog', { stabilityHint: 1159 });
    console.log('[Mission] Step 3: Navigating to https://www.dhirajdas.dev/blog/starlight-mission-control-observability-roi...');
    await runner.goto('https://www.dhirajdas.dev/blog/starlight-mission-control-observability-roi');

    await runner.clickGoal('h3', { stabilityHint: 2010 });
        
        console.log('[Mission] ✅ All recorded steps completed!');
        await runner.finish('Recorded test complete');
    } catch (error) {
        console.error('[Mission] ❌ Test failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
