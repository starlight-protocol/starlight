const WebSocket = require('ws');

async function debugDOM() {
    const ws = new WebSocket('ws://127.0.0.1:8080');

    ws.on('open', async () => {
        console.log('[Debug] Connected to Hub');

        // 1. Goto YouTube
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "starlight.intent",
            params: { cmd: "goto", url: "https://www.youtube.com" },
            id: "debug-goto"
        }));
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log('[Hub] Received:', msg.id, msg.success ? '(Success)' : '(Error/Result)');

        if (msg.id === 'debug-goto' && msg.success) {
            console.log('[Debug] Page loaded, searching DOM...');
            ws.send(JSON.stringify({
                jsonrpc: "2.0",
                method: "starlight.intent",
                params: {
                    cmd: "evaluate", script: `
                    (function() {
                        const findBFS = (startNode) => {
                            const queue = [startNode];
                            const visited = new Set();
                            const log = [];
                            while (queue.length > 0) {
                                const root = queue.shift();
                                if (!root || visited.has(root)) continue;
                                visited.add(root);
                                const candidates = root.querySelectorAll('input, textarea, [role="searchbox"]');
                                for (const el of candidates) {
                                    const label = (el.placeholder || el.getAttribute('aria-label') || el.name || el.id || el.getAttribute('title') || el.innerText || '').toLowerCase();
                                    log.push('Candidate: ' + el.tagName + ' id=' + el.id + ' label=' + label);
                                    if (label.includes('search')) return { found: true, id: el.id, tagName: el.tagName, label: label, log };
                                }
                                const all = root.querySelectorAll('*');
                                for (const node of all) {
                                    if (node.shadowRoot) queue.push(node.shadowRoot);
                                }
                            }
                            return { found: false, log };
                        };
                        return findBFS(document);
                    })()
                ` },
                id: "debug-eval"
            }));
        } else if (msg.id === 'debug-eval') {
            console.log('[Debug] Result:', JSON.stringify(msg.success || msg.result, null, 2));
            process.exit(0);
        }
    });
}

debugDOM();
