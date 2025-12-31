/**
 * Shadow DOM Intent Script - Phase 9 Test
 * Tests CBA's ability to pierce Shadow DOM boundaries
 */

const WebSocket = require('ws');
const path = require('path');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log('[Intent] Connected to Starlight Hub');

    // Step 1: Navigate to shadow test page
    const testPage = `file://${path.resolve(__dirname, 'shadow_test.html')}`;
    console.log(`[Intent] Navigating to: ${testPage}`);

    ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'starlight.intent',
        params: { cmd: 'goto', url: testPage },
        id: 'nav-1'
    }));

    // Step 2: Wait for page load, then click the mission button
    setTimeout(() => {
        console.log('[Intent] Issuing semantic goal: ENTER THE VOID');
        console.log('[Intent] Shadow modal should be blocking - Janitor must pierce shadow root');

        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                cmd: 'click',
                goal: 'ENTER THE VOID',
                context: { missionType: 'shadow-penetration' }
            },
            id: 'goal-1'
        }));
    }, 3000);

    // Step 3: Close after mission
    setTimeout(() => {
        console.log('[Intent] Shadow DOM mission complete. Generating report...');
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.shutdown',
            params: { reason: 'Mission complete' },
            id: 'shutdown-1'
        }));
    }, 8000);
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.method === 'starlight.sovereign_update') {
        console.log('[Intent] Context Update:', JSON.stringify(msg.params.context, null, 2));
    } else if (msg.result) {
        console.log(`[Intent] Response: ${msg.result.status || 'OK'}`);
    }
});

ws.on('error', (err) => {
    console.error('[Intent] WebSocket error:', err.message);
});

ws.on('close', () => {
    console.log('[Intent] Connection closed');
    process.exit(0);
});
