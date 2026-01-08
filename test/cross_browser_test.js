/**
 * Cross-Browser Integration Test Suite
 * Phase 14.1: Multi-Browser Foundation
 * 
 * Tests the same intent script across Chromium, Firefox, and WebKit
 * to ensure protocol-level browser independence.
 * 
 * Usage:
 *   node test/cross_browser_test.js chromium
 *   node test/cross_browser_test.js firefox
 *   node test/cross_browser_test.js webkit
 */

const StarlightSDK = require('../sdk/starlight_sdk_node.js');

async function runCrossBrowserTest(engine = 'chromium') {
    console.log(`\n=== Cross-Browser Test: ${engine.toUpperCase()} ===\n`);

    const client = new StarlightSDK('ws://localhost:8080');
    await client.connect();

    try {
        // Test 1: Basic Navigation
        console.log('[Test 1] Basic Navigation');
        await client.goto('https://api.dhirajdas.dev');
        console.log('✓ Navigation successful');

        // Test 2: Click Interaction
        console.log('\n[Test 2] Click Interaction');
        await client.click('a', { timeout: 5000 });
        console.log('✓ Click successful');

        // Test 3: Shadow DOM Handling
        console.log('\n[Test 3] Shadow DOM Test');
        const capabilities = await client.send({
            method: 'starlight.query',
            params: { q: 'capabilities' }
        });
        console.log('Browser capabilities:', capabilities);

        if (capabilities.shadowDomPiercing) {
            console.log('✓ Shadow DOM piercing supported');
        } else {
            console.log('⚠ Shadow DOM piercing NOT supported (expected for Firefox/WebKit)');
        }

        // Test 4: Protocol Compliance
        console.log('\n[Test 4] Protocol Compliance');
        const response = await client.send({
            method: 'starlight.intent',
            params: { cmd: 'goto', url: 'about:blank' }
        });

        if (response.jsonrpc === '2.0') {
            console.log('✓ Protocol compliance verified');
        } else {
            throw new Error('Protocol violation detected!');
        }

        console.log(`\n=== ${engine.toUpperCase()} Test Suite: PASSED ===\n`);

    } catch (error) {
        console.error(`\n=== ${engine.toUpperCase()} Test Suite: FAILED ===`);
        console.error(error.message);
        process.exit(1);
    } finally {
        await client.finish();
        await client.close();
    }
}

// Get browser engine from command line args or env
const engine = process.argv[2] || process.env.HUB_BROWSER_ENGINE || 'chromium';
runCrossBrowserTest(engine);
