/**
 * Temporal Ghosting Integration Test
 * Verifies that the Hub correctly records UI latency in Ghost Mode.
 */

const WebSocket = require('ws');
const { CBAHub } = require('../src/hub');
const fs = require('fs');
const path = require('path');

async function runTest() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 17.4: TEMPORAL GHOSTING TEST');
    console.log('═══════════════════════════════════════════\n');

    // 1. Create a Hub with Ghost Mode enabled
    const hub = new CBAHub(8082, true);
    hub.config.hub.ghostMode = true;
    hub.config.hub.syncBudget = 5000;

    await hub.init();
    console.log('✅ Hub initialized in GHOST MODE');

    const HUB_URL = 'ws://localhost:8082';
    const ws = new WebSocket(HUB_URL);
    await new Promise(resolve => ws.on('open', resolve));

    try {
        // 2. Run a "Ghost" mission
        console.log('Running Ghost Mission...');

        const commands = [
            { method: 'starlight.intent', params: { goal: 'NAVIGATE', cmd: 'goto', url: 'https://example.com' }, id: 'g1' },
            { method: 'starlight.intent', params: { goal: 'CLICK_ACTION', cmd: 'click', selector: 'h1' }, id: 'g2' },
            { method: 'starlight.checkpoint', params: { name: 'GHOST_CHECKPOINT' }, id: 'g3' }
        ];

        for (const cmd of commands) {
            ws.send(JSON.stringify({ ...cmd, jsonrpc: '2.0' }));
            // Wait for Hub to process
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log('Mission complete. Shutting down Hub to save metrics...');
        await hub.shutdown();

        // 3. Verify Metrics File
        const metricsFile = path.join(process.cwd(), 'temporal_ghosting.json');
        if (fs.existsSync(metricsFile)) {
            const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
            console.log(`✅ SUCCESS: temporal_ghosting.json created with ${metrics.length} entries`);

            const clickMetric = metrics.find(m => m.command === 'click');
            if (clickMetric && clickMetric.latency_ms > 0) {
                console.log(`✅ SUCCESS: Click latency recorded: ${clickMetric.latency_ms}ms`);
            } else {
                console.log('❌ FAILURE: Click metric missing or invalid');
            }
        } else {
            console.log('❌ FAILURE: temporal_ghosting.json not found');
        }

    } finally {
        ws.close();
        if (!hub.isShuttingDown) await hub.shutdown();
    }
}

runTest().catch(console.error);
