/**
 * Phase 9: Security Test Mission
 * Tests PII detection, Shadow DOM, and network interception
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STARLIGHT PROTOCOL COMPLIANT
 * - Uses IntentRunner (event-driven, no setTimeout)
 * - Pure intent: only goals, no timing
 * - PII Sentinel handles privacy checks
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function main() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Intent] 🌌 Connected to Hub');
        console.log('[Intent] Security Test Mission\n');

        // Goal 1: Navigate to security test page
        const testPage = 'file:///' + path.join(__dirname, 'security_test.html').replace(/\\/g, '/');
        console.log('[Intent] Goal 1: Navigate to security test page');
        await runner.goto(testPage);
        console.log('[Intent] ✓ Navigation complete\n');

        // Goal 2: Click the PII submit button - PII Sentinel should alert
        console.log('[Intent] Goal 2: Click PII submit button');
        console.log('[Intent] (PII Sentinel will detect and alert if privacy data present)');
        await runner.click('#pii-submit');
        console.log('[Intent] ✓ PII submit clicked\n');

        // Goal 3: Click Shadow DOM button using pierce selector
        console.log('[Intent] Goal 3: Click Shadow DOM button');
        await runner.click('#shadow-host >>> #shadow-button');
        console.log('[Intent] ✓ Shadow button clicked\n');

        // Goal 4: Test network request
        console.log('[Intent] Goal 4: Trigger fetch API call');
        await runner.click('#fetch-api');
        console.log('[Intent] ✓ Fetch triggered\n');

        // Complete
        console.log('[Intent] ═══════════════════════════════════════');
        console.log('[Intent] 🎯 Security test COMPLETE');
        await runner.finish('Security test complete');

    } catch (error) {
        console.error('[Intent] ❌ Test failed:', error.message);
        await runner.finish('Security test failed: ' + error.message);
        process.exit(1);
    }
}

main();
