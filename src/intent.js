const WebSocket = require('ws');
const { nanoid } = require('nanoid');
const path = require('path');

class IntentScript {
    constructor(uri = "ws://localhost:8080") {
        this.ws = new WebSocket(uri);
        this.pending = new Map();

        this.ws.on('open', () => this.run());
        this.ws.on('message', (data) => this.handleResponse(data));
    }

    send(cmd) {
        const id = nanoid();
        return new Promise((resolve, reject) => {
            console.log(`[Intent] Executing: ${cmd.cmd}...`);
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({
                type: 'INTENT_COMMAND',
                id,
                ...cmd
            }));
        });
    }

    handleResponse(data) {
        const msg = JSON.parse(data);
        if (msg.type === 'COMMAND_COMPLETE') {
            const promise = this.pending.get(msg.id);
            if (promise) {
                if (msg.success) promise.resolve();
                else promise.reject();
                this.pending.delete(msg.id);
            }
        }
    }

    async run() {
        console.log("[Intent] Starting Goal-Oriented Pathfinding (Milky Way Strategy)");

        try {
            // 1. Navigate
            const testPath = path.join(process.cwd(), 'test', 'chaos.html');
            await this.send({
                cmd: 'goto',
                url: `file:///${testPath.replace(/\\/g, '/')}`
            });

            // 2. The Patient Navigator: Allow chaos to emerge
            console.log("[Intent] Observing Terrain... (5s)");
            await new Promise(r => setTimeout(r, 5000));

            // 3. Click the Submit Button
            console.log("[Intent] Attempting Click. Navigating by the Stars.");
            await this.send({
                cmd: 'click',
                selector: '#submit-btn'
            });

            console.log("[Intent] GOAL ACHIEVED: The stars guided us.");

            // Signal completion to generate report
            this.ws.send(JSON.stringify({ type: 'TEST_FINISHED' }));
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error("[Intent] FAILED: Path blocked or system error.");
        }
    }
}

new IntentScript();
