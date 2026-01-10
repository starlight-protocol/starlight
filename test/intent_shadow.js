/**
 * Shadow DOM Intent Script - Phase 9 Test
 * Tests CBA's ability to pierce Shadow DOM boundaries
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STARLIGHT PROTOCOL COMPLIANT
 * - Uses IntentRunner (event-driven, no setTimeout)
 * - Pure intent: only goals, no timing
 * - PulseSentinel handles stability, JanitorSentinel handles obstacles
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function main() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Intent] 🌌 Connected to Starlight Hub');
        console.log('[Intent] Shadow DOM Piercing Test\n');

        // Goal 1: Navigate to shadow test page
        const testPage = `file://${path.resolve(__dirname, 'shadow_test.html')}`;
        console.log(`[Intent] Goal 1: Navigate to ${testPage}`);
        await runner.goto(testPage);
        console.log('[Intent] ✓ Navigation complete\n');

        // Goal 2: Click the mission button (Hub will pierce Shadow DOM)
        console.log('[Intent] Goal 2: Click "ENTER THE VOID"');
        console.log('[Intent] (Shadow modal may be blocking - JanitorSentinel will handle it)');
        await runner.clickGoal('ENTER THE VOID', { missionType: 'shadow-penetration' });
        console.log('[Intent] ✓ Shadow DOM button clicked\n');

        // Complete mission
        console.log('[Intent] ═══════════════════════════════════════');
        console.log('[Intent] 🎯 Shadow DOM mission COMPLETE');
        await runner.finish('Shadow DOM test complete');

    } catch (error) {
        console.error('[Intent] ❌ Mission failed:', error.message);
        await runner.finish('Shadow DOM test failed: ' + error.message);
        process.exit(1);
    }
}

main();
