/**
 * Phase 9: Security Test Mission
 * Tests PII detection, Shadow DOM, and network interception
 */

const WebSocket = require('ws');
const path = require('path');

const ws = new WebSocket('ws://localhost:8080');
let step = 0;

ws.on('open', () => {
    console.log("[Intent] Connected to Hub. Starting Security Test...");

    // Register as intent layer
    ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "starlight.registration",
        params: { layer: "SecurityTestIntent", priority: 100 },
        id: "reg-1"
    }));

    // Wait for sentinels to connect
    setTimeout(() => sendNext(), 3000);
});

function send(msg) {
    console.log(`[Intent] Sending: ${msg.method}`);
    ws.send(JSON.stringify(msg));
}

function sendNext() {
    step++;
    switch (step) {
        case 1:
            // Navigate to security test page
            const testPage = 'file:///' + path.join(__dirname, 'security_test.html').replace(/\\/g, '/');
            send({
                jsonrpc: "2.0",
                method: "starlight.intent",
                params: { cmd: "goto", url: testPage },
                id: "step-1"
            });
            break;

        case 2:
            // Click the PII submit button - PII Sentinel should alert
            send({
                jsonrpc: "2.0",
                method: "starlight.intent",
                params: { cmd: "click", selector: "#pii-submit" },
                id: "step-2"
            });
            break;

        case 3:
            // Try to click Shadow DOM button using pierce selector
            send({
                jsonrpc: "2.0",
                method: "starlight.intent",
                params: { cmd: "click", selector: "#shadow-host >>> #shadow-button" },
                id: "step-3"
            });
            break;

        case 4:
            // Test network request
            send({
                jsonrpc: "2.0",
                method: "starlight.intent",
                params: { cmd: "click", selector: "#fetch-api" },
                id: "step-4"
            });
            break;

        case 5:
            // Finish mission
            send({
                jsonrpc: "2.0",
                method: "starlight.finish",
                params: {},
                id: "finish"
            });
            break;
    }
}

ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.type === 'COMMAND_COMPLETE') {
        console.log(`[Intent] Command ${msg.id} completed: ${msg.success ? 'SUCCESS' : 'FAILED'}`);

        // Check for PII warnings in context
        if (msg.context?.security?.pii_detected) {
            console.log(`[Intent] ⚠️  PII WARNING: ${msg.context.security.pii_count} instances detected`);
            console.log(`[Intent]    Types: ${msg.context.security.pii_types.join(', ')}`);
        }

        setTimeout(sendNext, 1500);
    }
});

ws.on('error', (e) => console.log("[Intent] WS Error:", e.message));
ws.on('close', () => {
    console.log("[Intent] Connection closed.");
    process.exit(0);
});
