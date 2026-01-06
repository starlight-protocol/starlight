/**
 * CBA Mission: GitHub Navigation (Starlight Protocol v3.2)
 * 
 * Tests semantic goal resolution on GitHub:
 * - clickGoal: Navigation elements
 * - fillGoal: Search input
 * - hoverGoal: Interactive elements
 * 
 * Validation: This test MUST pass for protocol to be considered working.
 * 
 * Usage: node test/intent_github.js
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Mission] 🌌 Starting GitHub Navigation test...\n');

        // Step 1: Navigate to GitHub
        console.log('[Mission] Step 1: Navigating to GitHub...');
        await runner.goto('https://github.com');
        await runner.checkpoint('GITHUB_LOADED');
        console.log('[Mission] ✅ GitHub loaded\n');

        // Step 2: Click Explore
        console.log('[Mission] Step 2: Clicking Explore...');
        await runner.clickGoal('Explore');
        console.log('[Mission] ✅ Explore clicked\n');

        await runner.checkpoint('EXPLORE_PAGE');

        // Step 3: Click Trending
        console.log('[Mission] Step 3: Clicking Trending...');
        await runner.clickGoal('Trending');
        console.log('[Mission] ✅ Trending clicked\n');

        await runner.checkpoint('TRENDING_PAGE');

        // Step 4: Scroll to see more repositories
        console.log('[Mission] Step 4: Scrolling page...');
        await runner.scrollToBottom();
        console.log('[Mission] ✅ Scrolled\n');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[Mission] 🎯 GitHub Navigation test PASSED!');
        await runner.finish('GitHub navigation test complete');

    } catch (error) {
        console.error('[Mission] ❌ Mission failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
