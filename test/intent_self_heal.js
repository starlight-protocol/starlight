const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log("[Intent] Connected to Hub. Starting Self-Healing Test...");

    // 1. Navigate to test page
    ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'starlight.intent',
        params: {
            cmd: 'goto',
            url: 'file:///c:/cba/test/self_heal_test.html'
        },
        id: '1'
    }));

    // 2. Issuing a goal that doesn't match the current text but has historical memory
    setTimeout(() => {
        console.log("[Intent] Issuing 'INITIATE MISSION' goal...");
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                goal: 'INITIATE MISSION'
            },
            id: '2'
        }));
    }, 2000);

    // 3. Finish
    setTimeout(() => {
        console.log("[Intent] Mission complete. Signaling Hub to shutdown...");
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.finish',
            params: {},
            id: '3'
        }));
        process.exit(0);
    }, 5000);
});
