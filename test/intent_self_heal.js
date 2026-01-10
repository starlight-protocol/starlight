/**
 * Self-Healing Intent Script
 * Tests CBA's semantic goal resolution with historical memory
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STARLIGHT PROTOCOL COMPLIANT
 * - Uses IntentRunner (event-driven, no setTimeout)
 * - Pure intent: only goals, no timing
 * - Hub's historical memory handles self-healing
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IntentRunner = require('../src/intent_runner');

async function main() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Intent] 🌌 Connected to Hub');
        console.log('[Intent] Self-Healing Test\n');

        // Goal 1: Navigate to test page
        console.log('[Intent] Goal 1: Navigate to self-heal test page');
        await runner.goto('file:///c:/cba/test/self_heal_test.html');
        console.log('[Intent] ✓ Navigation complete\n');

        // Goal 2: Issue semantic goal - Hub uses historical memory
        console.log('[Intent] Goal 2: Click "INITIATE MISSION"');
        console.log('[Intent] (If selector changed, Hub will use memory to self-heal)');
        await runner.clickGoal('INITIATE MISSION');
        console.log('[Intent] ✓ Mission initiated\n');

        // Complete
        console.log('[Intent] ═══════════════════════════════════════');
        console.log('[Intent] 🎯 Self-Healing test COMPLETE');
        await runner.finish('Self-healing test complete');

    } catch (error) {
        console.error('[Intent] ❌ Test failed:', error.message);
        await runner.finish('Self-heal test failed: ' + error.message);
        process.exit(1);
    }
}

main();
