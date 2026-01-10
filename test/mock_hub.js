/**
 * Mock Starlight Hub for Integration Testing
 * Minimal WebSocket server that handles starlight.intent and starlight.finish
 */

const { WebSocketServer } = require('ws');

class MockHub {
    constructor(port = 8080) {
        this.port = port;
        this.wss = null;
    }

    start() {
        this.wss = new WebSocketServer({ port: this.port });
        console.log(`[MockHub] Started on ws://localhost:${this.port}`);

        this.wss.on('connection', (ws) => {
            console.log('[MockHub] Client connected');

            ws.on('message', (data) => {
                const msg = JSON.parse(data);
                console.log(`[MockHub] Received: ${msg.method}`);

                if (msg.method === 'starlight.intent') {
                    // Simulate command processing
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            type: 'COMMAND_COMPLETE',
                            id: msg.id,
                            success: true,
                            result: { status: 'success' }
                        }));
                    }, 50);
                } else if (msg.method === 'starlight.finish') {
                    console.log(`[MockHub] Mission finish requested: ${msg.params.reason}`);
                }
            });

            ws.on('close', () => {
                console.log('[MockHub] Client disconnected');
            });
        });
    }

    stop() {
        if (this.wss) {
            this.wss.close();
            console.log('[MockHub] Stopped');
        }
    }
}

if (require.main === module) {
    const hub = new MockHub();
    hub.start();
}

module.exports = MockHub;
