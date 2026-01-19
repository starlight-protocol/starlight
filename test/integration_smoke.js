const IntentRunner = require('../src/intent_runner');

async function runSmoke() {
    const runner = new IntentRunner('ws://127.0.0.1:8095');

    try {
        await runner.connect();
        console.log('[Smoke] 🚀 Starting DomWalker Integration Smoke Test...\n');

        console.log('[Smoke] Navigating to Google...');
        await runner.goto('https://www.google.com');

        console.log('[Smoke] Testing Semantic Fill (will use DomWalker)...');
        await runner.fillGoal('Search', 'Starlight Protocol');

        console.log('[Smoke] ✅ Fill Successful');
        await runner.finish('Smoke Test Passed');
        process.exit(0);

    } catch (error) {
        console.error('[Smoke] ❌ Failed:', error.message);
        await runner.finish('Smoke Failed');
        process.exit(1);
    }
}

runSmoke();
