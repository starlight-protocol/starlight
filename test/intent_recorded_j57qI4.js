/**
 * Auto-recorded Test: recorded_j57qI4
 * Generated: 2026-01-01T17:29:47.755Z
 * Source URL: null
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();
    
    try {
        await runner.connect();
        console.log('[Mission] Starting recorded test: recorded_j57qI4');
        
    console.log('[Mission] Step 1: Navigating to https://www.dhirajdas.dev/...');
    await runner.goto('https://www.dhirajdas.dev/');

    console.log('[Mission] Step 2: Navigating to https://www.dhirajdas.dev/blog...');
    await runner.goto('https://www.dhirajdas.dev/blog');

    await runner.clickGoal('Blog', { stabilityHint: 2006 });
    console.log('[Mission] Step 4: Checkpoint - CHECKPOINT: blog page');
    await runner.checkpoint('CHECKPOINT: blog page');

    console.log('[Mission] Step 5: Navigating to https://www.dhirajdas.dev/blog/starlight-mission-control-observability-roi...');
    await runner.goto('https://www.dhirajdas.dev/blog/starlight-mission-control-observability-roi');

    await runner.clickGoal('Latest', { stabilityHint: 2096 });
        
        console.log('[Mission] ✅ All recorded steps completed!');
        await runner.finish('Recorded test complete');
    } catch (error) {
        console.error('[Mission] ❌ Test failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
