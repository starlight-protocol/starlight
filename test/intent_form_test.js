/**
 * CBA Mission: Form Test (Starlight Protocol v3.2)
 * 
 * Tests ALL form-related commands on a local test page:
 * - fillGoal: Text inputs
 * - selectGoal: Dropdown selection
 * - checkGoal: Checkbox interaction
 * - All new commands
 * 
 * Usage: node test/intent_form_test.js
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function runMission() {
    const runner = new IntentRunner();
    const testPageUrl = `file://${path.join(__dirname, 'form_test.html')}`;

    try {
        await runner.connect();
        console.log('[Mission] 🌌 Starting Form Test...\n');

        // Step 1: Navigate to test page
        console.log('[Mission] Step 1: Navigating to test page...');
        await runner.goto(testPageUrl);
        await runner.checkpoint('PAGE_LOADED');
        console.log('[Mission] ✅ Test page loaded\n');

        // Step 2: Fill name input
        console.log('[Mission] Step 2: Filling name (semantic goal)...');
        await runner.fillGoal('Name', 'John Doe');
        console.log('[Mission] ✅ Name filled\n');

        // Step 3: Fill email input
        console.log('[Mission] Step 3: Filling email (semantic goal)...');
        await runner.fillGoal('Email', 'john@example.com');
        console.log('[Mission] ✅ Email filled\n');

        // Step 4: Select dropdown
        console.log('[Mission] Step 4: Selecting country (semantic goal)...');
        await runner.selectGoal('Country', 'usa');
        console.log('[Mission] ✅ Country selected\n');

        // Step 5: Check checkbox
        console.log('[Mission] Step 5: Checking terms checkbox (semantic goal)...');
        await runner.checkGoal('I agree');
        console.log('[Mission] ✅ Terms checkbox checked\n');

        // Step 6: Click submit
        console.log('[Mission] Step 6: Clicking submit (semantic goal)...');
        await runner.clickGoal('Submit');
        console.log('[Mission] ✅ Submit clicked\n');

        await runner.checkpoint('FORM_SUBMITTED');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[Mission] 🎯 Form Test PASSED!');
        await runner.finish('Form test complete');

    } catch (error) {
        console.error('[Mission] ❌ Mission failed:', error.message);
        await runner.finish('Mission failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
