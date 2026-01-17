/**
 * CBA Mission: Google Search (Fully Semantic - Starlight Protocol v3.1)
 * 
 * This mission demonstrates the COMPLETE Starlight Protocol on an external site:
 * - Uses `fillGoal()` for semantic form input resolution (NEW!)
 * - Uses `clickGoal()` for semantic button/link resolution
 * - Relies on Sentinels to handle any obstacles
 * 
 * NO HARDCODED SELECTORS - Pure semantic intent!
 * 
 * The Hub resolves:
 * - Form inputs by: label text, placeholder, aria-label, name attribute
 * - Buttons/links by: visible text, aria-label, data-goal
 * 
 * Usage: node test/intent_google_search.js
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner('ws://127.0.0.1:8095');

    try {
        await runner.connect();
        console.log('[Mission] 🌌 Starting Google Search test (Starlight Protocol v3.1)...\n');

        // Step 1: Navigate to Google
        console.log('[Mission] Step 1: Navigating to Google...');
        await runner.goto('https://www.google.com');
        await runner.checkpoint('GOOGLE_LOADED');
        console.log('[Mission] ✅ Google loaded\n');

        // Step 2: Fill the search box using SEMANTIC GOAL
        // The Hub will find input by: aria-label="Search", name="q", or title="Search"
        console.log('[Mission] Step 2: Filling search box (semantic form goal)...');
        await runner.fillGoal('Search', 'starlight protocol constellation based automation');
        console.log('[Mission] ✅ Search query entered\n');

        // Step 3: Submit using semantic goal
        // Google Search button has aria-label="Google Search"
        console.log('[Mission] Step 3: Submitting search (semantic goal)...');
        await runner.clickGoal('Google Search');
        console.log('[Mission] ✅ Search submitted\n');

        await runner.checkpoint('SEARCH_RESULTS_LOADED');

        // Step 4: Click first organic result
        // The semantic resolver will scan for links containing "starlight"
        console.log('[Mission] Step 4: Clicking first result about starlight...');
        await runner.clickGoal('starlight');
        console.log('[Mission] ✅ First result clicked\n');

        await runner.checkpoint('RESULT_PAGE_LOADED');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[Mission] 🎯 Google Search test completed successfully!');
        console.log('[Mission] 💡 No hardcoded selectors were used - pure semantic intent!');
        await runner.finish('Google search test complete');

    } catch (error) {
        console.error('[Mission] ❌ Mission failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
