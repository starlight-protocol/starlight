/**
 * Simple Cross-Browser Verification Script
 * Phase 14.1: Multi-Browser Foundation
 * 
 * A minimal intent script to verify browser adapter is working
 */

const StarlightSDK = require('../sdk/starlight_sdk_node.js');

async function main() {
    const browser = process.env.HUB_BROWSER_ENGINE || 'chromium';
    console.log(`\n🌟 Testing with ${browser.toUpperCase()} browser\n`);

    const client = new StarlightSDK('ws://localhost:8080');
    await client.connect();

    try {
        // Simple navigation test
        await client.goto('https://example.com');
        console.log('✓ Navigation successful');

        // Click test
        await client.click('a', { timeout: 3000 });
        console.log('✓ Interaction successful');

        console.log(`\n✅ ${browser.toUpperCase()} - All tests passed!\n`);

    } catch (error) {
        console.error(`❌ ${browser.toUpperCase()} - Test failed:`, error.message);
        process.exit(1);
    } finally {
        await client.finish();
        await client.close();
    }
}

main();
