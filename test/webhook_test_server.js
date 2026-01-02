/**
 * Webhook Test Server - Starlight Protocol
 * 
 * A simple HTTP server to receive and display webhook notifications locally.
 * Use this to test webhook integration before connecting to Slack/Teams.
 * 
 * Usage:
 *   1. Start this server: node test/webhook_test_server.js
 *   2. Update config.json: webhooks.enabled = true, webhooks.urls = ["http://localhost:9999"]
 *   3. Run a mission
 *   4. See webhook payloads printed to this console
 */

const http = require('http');

const PORT = 9999;

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                console.log('\n' + '='.repeat(60));
                console.log('📬 WEBHOOK RECEIVED @ ' + new Date().toISOString());
                console.log('='.repeat(60));
                console.log('\nText:', payload.text);

                if (payload.attachments && payload.attachments[0]) {
                    const att = payload.attachments[0];
                    console.log('Color:', att.color);
                    console.log('\nFields:');
                    att.fields?.forEach(f => {
                        console.log(`  ${f.title}: ${f.value}`);
                    });
                }
                console.log('\n' + '='.repeat(60));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                console.error('Failed to parse webhook:', e.message);
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Starlight Webhook Test Server. Send POST to receive webhooks.');
    }
});

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║   🎯 Starlight Webhook Test Server                      ║
╠════════════════════════════════════════════════════════╣
║   Listening on: http://localhost:${PORT}                  ║
║                                                        ║
║   To test:                                             ║
║   1. Set config.json → webhooks.enabled = true         ║
║   2. Set config.json → webhooks.urls = ["http://localhost:${PORT}"] ║
║   3. Run a Starlight mission                           ║
║   4. Watch this console for webhook payloads           ║
╚════════════════════════════════════════════════════════╝
`);
});
