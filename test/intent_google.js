/**
 * CBA Mission: Google Search (Starlight Protocol v3.2)
 * 
 * Tests semantic goal resolution on an external site:
 * - fillGoal: Find search input by aria-label/placeholder
 * - clickGoal: Find submit button by text
 * - clickGoal: Find search result by text content
 * - press: Submit form with Enter key
 * 
 * Validation: This test MUST pass for protocol to be considered working.
 * 
 * Usage: node test/intent_google.js
 */

const IntentRunner = require('../src/intent_runner');

async function runMission() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Mission] 🌌 Starting Google Search test...\n');

        // Step 1: Navigate to Google
        console.log('[Mission] Step 1: Navigating to Google...');
        await runner.goto('https://www.google.com');
        await runner.checkpoint('GOOGLE_LOADED');
        console.log('[Mission] ✅ Google loaded\n');

        // Step 2: Fill the search box using semantic goal
        // Hub will find by: aria-label="Search", title="Search", name="q"
        console.log('[Mission] Step 2: Filling search box (semantic goal)...');
        await runner.fillGoal('Search', 'starlight protocol automation testing');
        console.log('[Mission] ✅ Search query entered\n');

        // Step 3: Submit using Enter key (more reliable than clicking button)
        console.log('[Mission] Step 3: Submitting with Enter key...');
        await runner.press('Enter');
        console.log('[Mission] ✅ Search submitted\n');

        await runner.checkpoint('SEARCH_RESULTS');

        // Step 4: Scroll to see more results
        console.log('[Mission] Step 4: Scrolling page...');
        await runner.scrollToBottom();
        console.log('[Mission] ✅ Scrolled to bottom\n');

        await runner.checkpoint('SCROLLED');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[Mission] 🎯 Google Search test PASSED!');
        await runner.finish('Google search test complete');

    } catch (error) {
        console.error('[Mission] ❌ Mission failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
