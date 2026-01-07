/**
 * Test for Upload Command
 * 
 * Tests both direct selector upload() and semantic uploadGoal().
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function runMission() {
    const runner = new IntentRunner();
    const testFilePath = path.join(__dirname, 'test_file.txt');

    try {
        await runner.connect();
        console.log('[Upload Test] 🌌 Starting Upload Command Test...\n');

        // Step 1: Navigate to test page
        console.log('[Upload Test] Step 1: Loading test page...');
        await runner.goto(`file://${path.join(__dirname, 'upload_test.html')}`);
        await runner.checkpoint('PAGE_LOADED');
        console.log('[Upload Test] ✅ Test page loaded\n');

        // Step 2: Test direct selector upload
        console.log('[Upload Test] Step 2: Testing upload(selector, file)...');
        await runner.upload('#direct-upload', testFilePath);
        await runner.checkpoint('DIRECT_UPLOAD');
        console.log('[Upload Test] ✅ Direct upload successful\n');

        // Step 3: Test semantic goal upload
        console.log('[Upload Test] Step 3: Testing uploadGoal(goal, file)...');
        await runner.uploadGoal('Resume', testFilePath);
        await runner.checkpoint('GOAL_UPLOAD');
        console.log('[Upload Test] ✅ Semantic upload successful\n');

        // Mission complete
        console.log('='.repeat(50));
        console.log('[Upload Test] 🎯 All upload tests PASSED!');
        await runner.finish('Upload test complete');

    } catch (error) {
        console.error('[Upload Test] ❌ Test failed:', error.message);
        await runner.finish('Upload test failed: ' + error.message);
        process.exit(1);
    }
}

runMission();
