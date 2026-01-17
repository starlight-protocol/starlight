/**
 * Intent: Chaos Gauntlet - The Ultimate Starlight Protocol Stress Test
 * 
 * Uses IntentRunner for clean, protocol-compliant execution.
 * Intent only declares WHAT to do. Sentinels handle HOW.
 * 
 * Run: node test/intent_chaos_gauntlet.js
 */

const IntentRunner = require('../src/intent_runner');

async function runChaosGauntlet() {
    const runner = new IntentRunner('ws://127.0.0.1:8095');

    try {
        await runner.connect();
        console.log('\n🔥 CHAOS GAUNTLET - Starlight Protocol Test\n');

        // GOAL 1: Navigate to chaos gauntlet
        console.log('[Intent] Navigate to Chaos Gauntlet...');
        await runner.goto('file://' + process.cwd().replace(/\\/g, '/') + '/test/chaos_gauntlet.html');
        console.log('[Intent] ✅ Navigation complete\n');

        // GOAL 2: Start the gauntlet (Sentinels clear popups automatically)
        console.log('[Intent] Goal: INITIATE_CHAOS');
        await runner.clickGoal('INITIATE_CHAOS', { stabilityHint: 2000 });
        console.log('[Intent] ✅ Gauntlet started\n');

        // GOAL 3: Complete mission (Hub pierces Shadow DOM automatically)
        console.log('[Intent] Goal: COMPLETE_MISSION');
        await runner.clickGoal('COMPLETE_MISSION');
        console.log('[Intent] ✅ Mission complete\n');

        // GOAL 4: Capture proof
        console.log('[Intent] Screenshot...');
        await runner.screenshot('chaos_gauntlet_victory');
        console.log('[Intent] ✅ Screenshot captured\n');

        console.log('🏆 GAUNTLET CONQUERED!\n');
        await runner.finish('Chaos Gauntlet Complete');

    } catch (error) {
        console.error(`\n❌ FAILED: ${error.message}\n`);
        await runner.finish('Failed: ' + error.message);
        process.exit(1);
    }
}

runChaosGauntlet();
