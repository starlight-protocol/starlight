
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:8095');

ws.on('open', () => {
    console.log('✅ Connected to Validator!');
    ws.close();
    process.exit(0);
});

ws.on('error', (e) => {
    console.error('❌ Connection failed:', e.message);
    process.exit(1);
});
