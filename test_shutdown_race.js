const { CBAHub } = require('./src/hub');
const path = require('path');

async function testShutdown() {
    console.log('--- SHUTDOWN STRESS TEST ---');
    // CBAHub(port, headless)
    const hub = new CBAHub(8081, true);

    console.log('[Test] Initializing Hub...');
    await hub.init();

    console.log('[Test] Navigating to google.com...');
    await hub.page.goto('https://www.google.com');

    console.log('[Test] Taking a screenshot (to engage worker)...');
    // Don't await it, just trigger it and immediately shutdown
    hub.page.screenshot({ path: path.join(__dirname, 'temp_screenshot.jpg') });

    console.log('[Test] ⚡ IMMEDIATE SHUTDOWN ⚡');
    await hub.shutdown();

    console.log('[Test] ✅ Shutdown complete.');
    process.exit(0);
}

testShutdown().catch(e => {
    console.error('[Test] ❌ Test failed:', e);
    process.exit(1);
});
