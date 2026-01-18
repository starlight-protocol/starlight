const ws = require('ws');
const socket = new ws('ws://127.0.0.1:8095');

socket.on('open', () => {
    console.log('CONNECTED TO HUB');
    socket.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'starlight.intent',
        params: { cmd: 'checkpoint', name: 'probe' },
        id: 'probe-1'
    }));
});

socket.on('message', (data) => {
    console.log('RECV FROM HUB:', data.toString());
    process.exit(0);
});

socket.on('error', (err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(1);
}, 5000);
