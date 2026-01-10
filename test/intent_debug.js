/**
 * Full SauceDemo checkout test - step by step to identify failure point
 */
const IntentRunner = require('../src/intent_runner');

async function runTest() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[TEST] Connected');

        // Step 1: Navigate
        console.log('[TEST] Step 1: goto...');
        await runner.goto('https://www.saucedemo.com');
        console.log('[TEST] ✅ Step 1 done');

        // Step 2: Fill username
        console.log('[TEST] Step 2: fillGoal Username...');
        await runner.fillGoal('Username', 'standard_user');
        console.log('[TEST] ✅ Step 2 done');

        // Step 3: Fill password
        console.log('[TEST] Step 3: fillGoal Password...');
        await runner.fillGoal('Password', 'secret_sauce');
        console.log('[TEST] ✅ Step 3 done');

        // Step 4: Click login
        console.log('[TEST] Step 4: clickGoal Login...');
        await runner.clickGoal('Login');
        console.log('[TEST] ✅ Step 4 done');

        // Step 5: Add to cart
        console.log('[TEST] Step 5: clickGoal Add to cart...');
        await runner.clickGoal('Add to cart');
        console.log('[TEST] ✅ Step 5 done');

        // Step 6: Click cart
        console.log('[TEST] Step 6: clickGoal shopping cart...');
        await runner.clickGoal('shopping cart');
        console.log('[TEST] ✅ Step 6 done (PREVIOUSLY PASSED)');

        // Step 7: Checkout
        console.log('[TEST] Step 7: clickGoal Checkout...');
        await runner.clickGoal('Checkout');
        console.log('[TEST] ✅ Step 7 done');

        // Add checkpoint to ensure checkout form page loads
        console.log('[TEST] Waiting for checkout form page...');
        await runner.checkpoint('CHECKOUT_FORM_LOADED');

        // Step 8: Fill first name
        console.log('[TEST] Step 8: fillGoal First Name...');
        await runner.fillGoal('First Name', 'John');
        console.log('[TEST] ✅ Step 8 done');

        // Step 9: Fill last name
        console.log('[TEST] Step 9: fillGoal Last Name...');
        await runner.fillGoal('Last Name', 'Doe');
        console.log('[TEST] ✅ Step 9 done');

        // Step 10: Fill zip
        console.log('[TEST] Step 10: fillGoal Zip/Postal Code...');
        await runner.fillGoal('Zip/Postal Code', '12345');
        console.log('[TEST] ✅ Step 10 done');

        // Step 11: Continue
        console.log('[TEST] Step 11: clickGoal Continue...');
        await runner.clickGoal('Continue');
        console.log('[TEST] ✅ Step 11 done');

        // Step 12: Finish
        console.log('[TEST] Step 12: clickGoal Finish...');
        await runner.clickGoal('Finish');
        console.log('[TEST] ✅ Step 12 done');

        console.log('[TEST] 🎉 ALL 12 STEPS PASSED - FULL CHECKOUT COMPLETE!');
        await runner.finish('Complete checkout test passed');

    } catch (error) {
        console.error(`[TEST] ❌ FAILED at current step: ${error.message}`);
        await runner.finish('Failed: ' + error.message);
        process.exit(1);
    }
}

runTest();
