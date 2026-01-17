/**
 * CBA Mission: YouTube Robustness (Starlight Protocol v3.1)
 * 
 * Demonstration of:
 * - Cookie consent bypass (JanitorSentinel)
 * - Shadow DOM piercing for player controls (Hub/SmartBrowserAdapter)
 * - Semantic intent: Search and Play
 */

const IntentRunner = require('../src/intent_runner');

async function runYouTubeMission() {
    const runner = new IntentRunner('ws://127.0.0.1:8095');

    try {
        await runner.connect();
        console.log('[Mission] 🌌 Starting YouTube Robustness test...\n');

        // Step 1: Navigate to YouTube
        console.log('[Mission] Step 1: Navigating to YouTube...');
        await runner.goto('https://www.youtube.com');
        console.log('[Mission] ✅ YouTube loaded (or proceeding after consent bypass)\n');

        // Step 2: Search for Starlight Protocol
        console.log('[Mission] Step 2: Searching for "Starlight Protocol"...');
        await runner.fillGoal('Search', 'Starlight Protocol Constellation Automation');
        // Explicitly click the search button selector to avoid semantic ambiguity (Input vs Button)
        await runner.click('#search-icon-legacy');
        console.log('[Mission] ✅ Search executed\n');

        // Step 3: Click first result (Semantic)
        console.log('[Mission] Step 3: Clicking first video result...');
        await runner.clickGoal('Starlight', { stabilityHint: 2000 });
        console.log('[Mission] ✅ Video selected\n');

        // Step 4: Interact with Shadow-DOM controls
        console.log('[Mission] Step 4: Interacting with video controls (Shadow DOM Piercing)...');
        await runner.clickGoal('Play'); // Should pierce shadow root of ytd-player
        console.log('[Mission] ✅ Play/Pause toggle successful\n');

        await runner.screenshot('youtube_robustness_success');

        console.log('🏆 YOUTUBE CONQUERED!\n');
        await runner.finish('YouTube robustness test complete');

    } catch (error) {
        console.error('[Mission] ❌ Mission failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runYouTubeMission();
