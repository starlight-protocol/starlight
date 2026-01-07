/**
 * Consensus Mesh (Quorum Protocol) Integration Test
 * Verifies that the Hub proceeds once quorum is reached.
 */

const WebSocket = require('ws');
const { CBAHub } = require('../src/hub');
const fs = require('fs');

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 17.3: CONSENSUS MESH TEST');
    console.log('═══════════════════════════════════════════\n');

    // 1. Create a Hub with 0.6 Quorum Threshold
    const hub = new CBAHub(8081, true); // Port 8081 for testing
    hub.config.hub.quorumThreshold = 0.6;
    hub.config.hub.syncBudget = 5000;
    hub.config.hub.consensusTimeout = 2000;

    await hub.init();
    console.log('✅ Hub initialized with 0.6 Quorum Threshold');

    const HUB_URL = 'ws://localhost:8081';
    const sentinels = [];

    async function registerSentinel(name) {
        const ws = new WebSocket(HUB_URL);
        await new Promise(resolve => ws.on('open', resolve));
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.registration',
            params: { layer: name, priority: 1 },
            id: `reg-${name}`
        }));
        sentinels.push(ws);
        console.log(`Registered Sentinel: ${name}`);
        return ws;
    }

    try {
        // 2. Register 3 Sentinels
        const s1 = await registerSentinel('Sentinel-1');
        const s2 = await registerSentinel('Sentinel-2');
        const s3 = await registerSentinel('Sentinel-3');

        // Test Helper: Mock responses
        const setupMockResponse = (ws, method, params = {}) => {
            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.method === 'starlight.pre_check') {
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            jsonrpc: '2.0',
                            method: method,
                            params: params,
                            id: msg.id
                        }));
                    }, 500); // 500ms delay
                }
            });
        };

        // TEST 1: Quorum with 2/3 Clear
        console.log('\n--- Test 1: Quorum 2/3 Clear ---');
        setupMockResponse(s1, 'starlight.clear', { confidence: 1.0 });
        setupMockResponse(s2, 'starlight.clear', { confidence: 1.0 });
        // Sentinel 3 stays silent or is slow

        const startTime = Date.now();
        const result = await hub.broadcastPreCheck({ cmd: 'test_quorum' });
        const duration = Date.now() - startTime;

        if (result && duration < 3000) {
            console.log(`✅ SUCCESS: Hub proceeded with 2/3 Sentinels in ${duration}ms`);
        } else {
            console.log(`❌ FAILURE: Hub did not proceed or timed out (Result: ${result}, Duration: ${duration}ms)`);
        }

        // TEST 2: Veto Supremacy
        console.log('\n--- Test 2: Veto Supremacy ---');
        // Reset listeners
        sentinels.forEach(ws => ws.removeAllListeners('message'));

        setupMockResponse(s1, 'starlight.clear', { confidence: 1.0 });
        setupMockResponse(s3, 'starlight.wait', { retryAfterMs: 500 });

        const result2 = await hub.broadcastPreCheck({ cmd: 'test_veto' });
        if (!result2) {
            console.log('✅ SUCCESS: Hub respected VETO even if other Sentinel said CLEAR');
        } else {
            console.log('❌ FAILURE: Hub ignored VETO');
        }

    } finally {
        sentinels.forEach(ws => ws.close());
        await hub.shutdown();
    }
}

runTest().catch(console.error);
