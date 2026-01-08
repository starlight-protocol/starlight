/**
 * Phase 14.1 End-to-End Verification Test
 * 
 * This test verifies the COMPLETE data flow:
 * 1. Write config.json with firefox engine
 * 2. Start Hub
 * 3. Verify FirefoxAdapter is created
 * 
 * Run: node test/verify_browser_selection.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

async function test() {
    console.log('=== Phase 14.1 Browser Selection Verification ===\n');

    // Step 1: Read current config
    const originalConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
    console.log('[Step 1] Original config.json browser.engine:',
        JSON.parse(originalConfig).hub?.browser?.engine || 'NOT SET');

    // Step 2: Set browser engine to 'firefox'
    const config = JSON.parse(originalConfig);
    if (!config.hub) config.hub = {};
    if (!config.hub.browser) config.hub.browser = {};
    config.hub.browser.engine = 'firefox';
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf8');
    console.log('[Step 2] Updated config.json: browser.engine = "firefox"');

    // Step 3: Verify the write
    const verifyConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log('[Step 3] Verified config.json browser.engine:', verifyConfig.hub?.browser?.engine);

    if (verifyConfig.hub?.browser?.engine !== 'firefox') {
        console.error('❌ FAIL: Config was not updated correctly!');
        process.exit(1);
    }

    // Step 4: Start Hub and capture output
    console.log('\n[Step 4] Starting Hub to verify BrowserAdapter...\n');

    return new Promise((resolve, reject) => {
        const hub = spawn('node', ['src/hub.js'], {
            cwd: path.join(__dirname, '..'),
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let foundFirefox = false;
        let foundChromium = false;

        const timeout = setTimeout(() => {
            hub.kill();

            console.log('\n=== Hub Output Analysis ===');
            console.log('Output contains "FirefoxAdapter":', foundFirefox);
            console.log('Output contains "ChromiumAdapter":', foundChromium);

            // Restore original config
            fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf8');
            console.log('\n[Cleanup] Restored original config.json');

            if (foundFirefox && !foundChromium) {
                console.log('\n✅ SUCCESS: Firefox browser was correctly selected!');
                resolve(true);
            } else if (foundChromium) {
                console.log('\n❌ FAIL: Chromium was launched instead of Firefox!');
                console.log('--- Full Output ---');
                console.log(output);
                reject(new Error('Wrong browser launched'));
            } else {
                console.log('\n⚠️ INCONCLUSIVE: Could not determine which browser was launched');
                console.log('--- Full Output ---');
                console.log(output);
                reject(new Error('Inconclusive test'));
            }
        }, 8000);

        hub.stdout.on('data', (data) => {
            const line = data.toString();
            output += line;
            process.stdout.write(line);

            if (line.includes('FirefoxAdapter')) foundFirefox = true;
            if (line.includes('ChromiumAdapter')) foundChromium = true;

            // Hub is ready when WebSocket is listening
            if (line.includes('WebSocket/HTTP Server listening') && foundFirefox) {
                clearTimeout(timeout);
                hub.kill();

                // Restore original config
                fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf8');
                console.log('\n[Cleanup] Restored original config.json');
                console.log('\n✅ SUCCESS: Firefox browser was correctly selected!');
                resolve(true);
            }
        });

        hub.stderr.on('data', (data) => {
            const line = data.toString();
            output += line;
            process.stderr.write(line);
        });

        hub.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

test()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\nTest failed:', err.message);
        process.exit(1);
    });
