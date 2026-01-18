const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8080');

ws.on('open', () => {
    console.log('Connected to Hub');

    // 1. Goto YouTube
    send({
        cmd: 'goto',
        url: 'https://www.youtube.com'
    });
});

let msgId = 1;
function send(params) {
    const id = `debug-${msgId++}`;
    const msg = {
        jsonrpc: '2.0',
        method: 'starlight.intent',
        params: params,
        id: id
    };
    console.log('SEND:', JSON.stringify(msg));
    ws.send(JSON.stringify(msg));
    return id;
}

ws.on('message', (data) => {
    const response = JSON.parse(data); // Parse once
    console.log('RECV:', JSON.stringify(response, null, 2));

    if (response.error) {
        console.error('COMMAND FAILED:', JSON.stringify(response.error, null, 2));
        process.exit(1);
    }

    if ((response.result || response.success) && response.id && response.id.startsWith('debug-')) {
        // If goto finished, run evaluate
        if (response.id === 'debug-1') {
            console.log('Goto complete. Running DOM Probe...');
            runProbe();
        }
        // If probe finished, exit
        if (response.id === 'debug-2') {
            console.log('Probe complete.');
            process.exit(0);
        }
    }
});

function runProbe() {
    console.log('Taking screenshot...');
    send({
        cmd: 'screenshot',
        name: 'verification'
    });
}

// Add handler for screenshot result
ws.on('message', (data) => {
    const response = JSON.parse(data);
    if (response.result && response.result.data && response.id && response.id.startsWith('debug-')) {
        console.log('Screenshot received. Saving to file...');
        const fs = require('fs');
        const path = require('path');
        const buffer = Buffer.from(response.result.data, 'base64');
        const filePath = path.join(__dirname, '../screenshots/debug_stealth_fix_verified.png');
        fs.writeFileSync(filePath, buffer);
        console.log(`Saved screenshot to: ${filePath}`);
        process.exit(0);
    }
});
