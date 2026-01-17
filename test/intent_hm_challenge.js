/**
 * 🛰️ Starlight Challenge: H&M "Boss Level"
 * 
 * Protocol Mission: Express INTENT ONLY.
 * Zero hardcoded selectors. Zero environmental leakage.
 * 
 * Goals:
 * 1. Navigate to H&M UK
 * 2. Search for "linen shirt"
 * 3. Select first product
 * 4. Select a size
 * 5. Add to bag
 * 
 * Resilience:
 * - Janitor Sentinel handles the cookie wall autonomously.
 * - Pulse Sentinel ensures page stability.
 * - Hub resolves semantic goals using NLI/Heuristics.
 */

const IntentRunner = require('../src/intent_runner');

async function run() {
    const runner = new IntentRunner('ws://127.0.0.1:8095');

    try {
        await runner.connect();
        console.log("🚀 Starting H&M Starlight Challenge...");

        // Goal 1: Navigate
        console.log("📍 Goal: Land on H&M UK");
        await runner.goto('https://www.hm.com/en_gb/index.html');

        // Goal 2: Search (Protocol-compliant semantic goal)
        console.log("🔍 Goal: Search for 'linen shirt'");
        await runner.fillGoal('Search', 'linen shirt');
        await runner.press('Enter');

        // Goal 3: Select Product
        console.log("👕 Goal: Select Product Result");
        await runner.clickGoal('First Product Result', { context: 'search-results', priority: 'first' });

        // Goal 4: Size Selection
        console.log("📏 Goal: Select Size");
        await runner.clickGoal('Select Size', { context: 'product-options', requirement: 'any-available' });

        // Goal 5: Add to Bag
        console.log("🛒 Goal: Add to Bag");
        await runner.clickGoal('Add to Bag', { action: 'purchase' });

        console.log("🎯 Mission Accomplished: H&M Challenge Success!");
        await runner.finish('H&M Boss Level Challenge Complete');

    } catch (error) {
        console.error("❌ Challenge Failed:", error.message);
        await runner.finish('Challenge failed: ' + error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    run();
}
