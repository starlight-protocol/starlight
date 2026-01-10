/**
 * SauceDemo E2E Test - Starlight Protocol Demo
 * 
 * This test demonstrates the Starlight Protocol on a saucewebsite site.
 * It shows semantic goals, form filling, and the complete checkout flow.
 * 
 * Website: https://www.saucedemo.com (Sauce Labs test site)
 * 
 * Usage:
 *   node bin/starlight.js test/intent_saucedemo.js
 *   
 * Or from Mission Control:
 *   1. Start Mission Control: node launcher/server.js
 *   2. Open http://localhost:3000
 *   3. Select "intent_saucedemo.js" from the dropdown
 *   4. Click "Execute Mission"
 */

const IntentRunner = require('../src/intent_runner');

const SITE_URL = 'https://www.saucedemo.com';

// Test credentials (public test accounts from Sauce Labs)
const TEST_USER = 'standard_user';
const TEST_PASSWORD = 'secret_sauce';

async function runMission() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[SauceDemo] 🛒 Starting e-commerce checkout demo...\n');

        // ============================================================
        // STEP 1: Navigate to SauceDemo
        // ============================================================
        console.log('[SauceDemo] Step 1: Navigating to saucedemo.com...');
        await runner.goto(SITE_URL);
        console.log('[SauceDemo] ✅ Landed on login page\n');

        // ============================================================
        // STEP 2: Login with form filling
        // The Hub uses semantic resolution to find inputs by:
        //   - placeholder text
        //   - associated <label>
        //   - aria-label
        //   - name attribute
        // ============================================================
        console.log('[SauceDemo] Step 2: Logging in...');

        // Using fillGoal - the Hub finds input by placeholder/label text
        await runner.fillGoal('Username', TEST_USER);
        await runner.fillGoal('Password', TEST_PASSWORD);

        // Using clickGoal - the Hub finds button by text content
        await runner.clickGoal('Login');
        console.log('[SauceDemo] ✅ Logged in as standard_user\n');

        // ============================================================
        // STEP 3: Add first item to cart
        // Semantic goal: "Add to cart" matches button text
        // ============================================================
        console.log('[SauceDemo] Step 3: Adding item to cart...');
        await runner.clickGoal('Add to cart');
        console.log('[SauceDemo] ✅ Item added to cart\n');

        // ============================================================
        // STEP 4: Go to shopping cart
        // ============================================================
        console.log('[SauceDemo] Step 4: Opening shopping cart...');
        // The cart icon has aria-label "shopping cart" or similar accessible name
        await runner.clickGoal('shopping cart');
        console.log('[SauceDemo] ✅ Cart opened\n');

        // ============================================================
        // STEP 5: Proceed to checkout
        // ============================================================
        console.log('[SauceDemo] Step 5: Starting checkout...');
        await runner.clickGoal('Checkout');
        console.log('[SauceDemo] ✅ Checkout started\n');

        // ============================================================
        // STEP 6: Fill checkout information
        // Demonstrates fillGoal on multiple form fields
        // ============================================================
        console.log('[SauceDemo] Step 6: Filling checkout form...');
        await runner.fillGoal('First Name', 'John');
        await runner.fillGoal('Last Name', 'Doe');
        await runner.fillGoal('Zip/Postal Code', '12345');
        await runner.clickGoal('Continue');
        console.log('[SauceDemo] ✅ Checkout form completed\n');

        // ============================================================
        // STEP 7: Review and complete order
        // ============================================================
        console.log('[SauceDemo] Step 7: Completing order...');
        await runner.clickGoal('Finish');
        console.log('[SauceDemo] ✅ Order placed!\n');

        // ============================================================
        // MISSION COMPLETE
        // ============================================================
        console.log('='.repeat(60));
        console.log('[SauceDemo] 🎉 MISSION COMPLETE: Checkout flow verified!');
        console.log('='.repeat(60));
        console.log('\n📊 Check report.html for detailed execution trace');
        console.log('📸 Screenshots saved to screenshots/ directory\n');

        await runner.finish('SauceDemo checkout demo completed successfully');

    } catch (error) {
        console.error('\n[SauceDemo] ❌ Mission failed:', error.message);
        console.error('[SauceDemo] Check the Hub console for Sentinel activity\n');
        await runner.finish('SauceDemo mission failed: ' + error.message);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = runMission;

// Run if executed directly
if (require.main === module) {
    runMission();
}
