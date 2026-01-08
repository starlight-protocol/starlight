/**
 * Phase 14.1 Complete End-to-End Test
 * 
 * This test simulates exactly what Mission Control does:
 * 1. Connects to launcher server via WebSocket
 * 2. Sends start command with browser selection
 * 3. Verifies config.json is updated
 * 4. Verifies correct browser is launched
 * 
 * Run: node test/test_mission_control_browser.js
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const LAUNCHER_WS = 'ws://localhost:3001';

async function test(browserToTest = 'firefox') {
    console.log(`\n=== Phase 14.1: Mission Control Browser Selection Test ===`);
    console.log(`Testing: ${browserToTest.toUpperCase()}\n`);

    // Save original config
    const originalConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
    const originalEngine = JSON.parse(originalConfig).hub?.browser?.engine || 'not set';
    console.log(`[1] Original config engine: "${originalEngine}"`);

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(LAUNCHER_WS);
        let hubStarted = false;
        let configUpdated = false;
        let correctBrowserLogged = false;

        const timeout = setTimeout(() => {
            ws.close();

            // Check if config was updated
            const finalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            const finalEngine = finalConfig.hub?.browser?.engine;

            console.log(`\n=== Results ===`);
            console.log(`Config updated: ${configUpdated ? '✅' : '❌'}`);
            console.log(`Final config engine: "${finalEngine}"`);
            console.log(`Hub started: ${hubStarted ? '✅' : '❌'}`);
            console.log(`Correct browser logged: ${correctBrowserLogged ? '✅' : '❌'}`);

            if (finalEngine === browserToTest && correctBrowserLogged) {
                console.log(`\n✅ SUCCESS: ${browserToTest.toUpperCase()} browser selection works!`);
                resolve(true);
            } else {
                console.log(`\n❌ FAIL: Browser selection not working`);
                reject(new Error('Browser selection failed'));
            }
        }, 10000);

        ws.on('open', () => {
            console.log(`[2] Connected to Mission Control`);

            // Wait for status messages, then send start command
            setTimeout(() => {
                console.log(`[3] Sending: { cmd: 'start', process: 'hub', browser: '${browserToTest}' }`);
                ws.send(JSON.stringify({
                    cmd: 'start',
                    process: 'hub',
                    browser: browserToTest
                }));
            }, 500);
        });

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);

                if (msg.type === 'log') {
                    console.log(`[Log] ${msg.source}: ${msg.text}`);

                    if (msg.text.includes('Config updated')) {
                        configUpdated = true;
                    }
                    if (msg.text.includes(`Starting Hub with ${browserToTest.toUpperCase()}`)) {
                        hubStarted = true;
                    }
                    if (msg.text.toLowerCase().includes(`${browserToTest}adapter`)) {
                        correctBrowserLogged = true;
                    }
                    // Also check for firefox/webkit in launch message
                    if (msg.text.includes(`Launching ${browserToTest.charAt(0).toUpperCase() + browserToTest.slice(1)} browser`)) {
                        correctBrowserLogged = true;
                    }
                }
            } catch (e) { }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            console.error('WebSocket error:', err.message);
            reject(err);
        });
    });
}

// Run test
test('firefox')
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
