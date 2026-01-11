/**
 * Starlight Launch Server - Backend for Mission Control
 * Manages Hub and Sentinel processes via WebSocket
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const TelemetryEngine = require('../src/telemetry');

const PORT = 3000;
const WS_PORT = 3001;

// Process registry (dynamic for sentinels)
const processes = {
    hub: null,
    mission: null
};

const processStatus = {
    hub: 'stopped',
    mission: 'stopped'
};

// Sentinel Fleet Manager: Auto-discover all sentinels
function discoverSentinels() {
    const sentinelsDir = path.join(__dirname, '../sentinels');
    const results = [];

    try {
        const files = fs.readdirSync(sentinelsDir);
        files.forEach(file => {
            if (file.endsWith('.py') && !file.startsWith('__') && !file.startsWith('test_')) {
                const id = file.replace('.py', '');
                const name = formatSentinelName(file);
                results.push({
                    id,
                    name,
                    file,
                    path: `sentinels/${file}`,
                    status: processStatus[id] || 'stopped',
                    icon: getSentinelIcon(id)
                });
            }
        });
    } catch (e) {
        console.error('[Launcher] Error discovering sentinels:', e.message);
    }

    return results;
}

function formatSentinelName(filename) {
    // pulse_sentinel.py -> Pulse Sentinel
    return filename
        .replace('.py', '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getSentinelIcon(id) {
    const icons = {
        'pulse_sentinel': '💚',
        'janitor': '🧹',
        'vision_sentinel': '👁️',
        'data_sentinel': '📊',
        'pii_sentinel': '🔒',
        'cookie': '🍪',
        'modal': '🪟',
        'popup': '💬'
    };
    for (const [key, icon] of Object.entries(icons)) {
        if (id.includes(key)) return icon;
    }
    return '🛡️'; // Default sentinel icon
}

// Phase 13.5: Hub WebSocket connection for recording
let hubWs = null;

function connectToHub() {
    if (hubWs && hubWs.readyState === WebSocket.OPEN) return;

    try {
        hubWs = new WebSocket('ws://localhost:8080');
        hubWs.on('open', () => console.log('[Launcher] Connected to Hub'));
        hubWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                // Forward recording events to UI clients
                if (msg.type?.startsWith('RECORDING_')) {
                    broadcast(msg);
                    if (msg.type === 'RECORDING_STOPPED') {
                        broadcast({ type: 'missionList', missions: discoverMissions() });
                    }
                }
            } catch (e) { }
        });
        hubWs.on('close', () => {
            hubWs = null;
            console.log('[Launcher] Hub connection closed');
        });
        hubWs.on('error', () => hubWs = null);
    } catch (e) {
        hubWs = null;
    }
}

function forwardToHub(message, retries = 0) {
    const maxRetries = 5;
    if (!hubWs || hubWs.readyState !== WebSocket.OPEN) {
        if (retries >= maxRetries) {
            log('System', 'Could not connect to Hub - is it running?', 'error');
            return;
        }
        connectToHub();
        setTimeout(() => forwardToHub(message, retries + 1), 500);
        return;
    }
    hubWs.send(JSON.stringify({ jsonrpc: '2.0', ...message, id: 'launcher-' + Date.now() }));
}

const telemetry = new TelemetryEngine(path.join(__dirname, '../telemetry.json'));

// WebSocket server for real-time logs
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[Launcher] Client connected');

    // Send current status, telemetry, sentinels, and missions
    ws.send(JSON.stringify({ type: 'status', status: processStatus }));
    ws.send(JSON.stringify({ type: 'telemetry', data: telemetry.getStats() }));
    ws.send(JSON.stringify({ type: 'sentinels', sentinels: discoverSentinels() }));
    ws.send(JSON.stringify({ type: 'missionList', missions: discoverMissions() }));

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleCommand(msg, ws);
        } catch (e) {
            console.error('[Launcher] Parse error:', e.message);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('[Launcher] Client disconnected');
    });
});

function broadcast(message) {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

function log(source, text, type = 'info') {
    const entry = {
        type: 'log',
        source,
        text,
        logType: type,
        timestamp: new Date().toLocaleTimeString()
    };
    broadcast(entry);
    console.log(`[${source}] ${text}`);
}

function handleCommand(msg, ws) {
    switch (msg.cmd) {
        case 'start':
            startProcess(msg.process, msg.browser, msg.device, msg.network);
            break;
        case 'stop':
            stopProcess(msg.process);
            break;
        case 'startAll':
            startProcess('hub', msg.browser, msg.device, msg.network);
            // Start ALL discovered sentinels
            const sentinels = discoverSentinels();
            sentinels.forEach((s, i) => {
                setTimeout(() => startProcess(s.id), 1000 + (i * 500));
            });
            log('System', `Starting constellation with ${sentinels.length} sentinels...`, 'info');
            break;
        case 'stopAll':
            stopProcess('mission');
            // Stop ALL discovered sentinels
            discoverSentinels().forEach(s => stopProcess(s.id));
            setTimeout(() => stopProcess('hub'), 500);
            break;
        case 'launch':
            launchMission(msg.mission);
            break;
        case 'refreshMissions':
            broadcast({ type: 'missionList', missions: discoverMissions() });
            break;
        // Phase 13.5: Recording commands
        case 'startRecording':
            // Auto-start Hub if not running
            if (!processes.hub) {
                log('System', 'Starting Hub for recording...', 'info');
                startProcess('hub');
                // Wait for Hub to be ready before forwarding
                setTimeout(() => {
                    forwardToHub({ method: 'starlight.startRecording', params: { url: msg.url } });
                    log('System', `🔴 Recording started on ${msg.url} - Browser will open!`, 'success');
                }, 2000);
            } else {
                forwardToHub({ method: 'starlight.startRecording', params: { url: msg.url } });
                log('System', `🔴 Recording started on ${msg.url}`, 'success');
            }
            break;
        case 'stopRecording':
            forwardToHub({ method: 'starlight.stopRecording', params: { name: msg.name } });
            log('System', '⏹️ Recording stopped', 'success');
            break;

        // Phase 13: Natural Language Intent commands
        case 'executeNLI':
            executeNLI(msg.instruction);
            break;
        case 'getNLIStatus':
            getNLIStatus();
            break;
        case 'startOllama':
            startOllama();
            break;
        case 'stopOllama':
            stopOllama();
            break;
    }
}

function startProcess(name, browserEngine = null, device = null, network = 'online') {
    if (processes[name]) {
        log('System', `${name} already running`, 'info');
        return;
    }

    let cmd, args;
    const cwd = path.join(__dirname, '..');

    // Hub is special - needs browser/mobile/network configuration
    if (name === 'hub') {
        // Phase 14.2: Update config.json with browser, mobile, and network settings
        const configPath = path.join(cwd, 'config.json');
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            if (!config.hub) config.hub = {};
            if (!config.hub.browser) config.hub.browser = {};

            // Browser engine
            if (browserEngine) {
                config.hub.browser.engine = browserEngine;
                log('System', `✓ Config updated: browser.engine = "${browserEngine}"`, 'success');
            }

            // Mobile device emulation
            if (device) {
                config.hub.browser.mobile = {
                    enabled: true,
                    device: device
                };
                log('System', `✓ Config updated: mobile.device = "${device}"`, 'success');
            } else {
                config.hub.browser.mobile = {
                    enabled: false,
                    device: null
                };
            }

            // Network emulation
            if (!config.hub.network) config.hub.network = {};
            config.hub.network.emulation = network || 'online';
            if (network && network !== 'online') {
                log('System', `✓ Config updated: network.emulation = "${network}"`, 'success');
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');

            const selectedBrowser = config.hub?.browser?.engine || 'chromium';
            const mobileInfo = device ? ` with ${device} emulation` : '';
            const networkInfo = network !== 'online' ? ` (${network} network)` : '';
            log('System', `🚀 Starting Hub with ${selectedBrowser.toUpperCase()}${mobileInfo}${networkInfo}...`, 'info');
        } catch (e) {
            log('System', `Warning: Could not update config: ${e.message}`, 'info');
        }

        cmd = 'node';
        args = ['src/hub.js'];
    } else {
        // Dynamic sentinel - find the file
        const sentinels = discoverSentinels();
        const sentinel = sentinels.find(s => s.id === name);

        if (sentinel) {
            cmd = 'python';
            args = [sentinel.path];
        } else {
            log('System', `Unknown process: ${name}`, 'error');
            return;
        }

        log('System', `Starting ${name}...`, 'info');
    }

    const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    processes[name] = proc;
    processStatus[name] = 'running';
    broadcast({ type: 'status', status: processStatus });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log(name, line, name));
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log(name, line, 'error'));
    });

    proc.on('close', (code) => {
        log('System', `${name} exited with code ${code}`, code === 0 ? 'info' : 'error');
        processes[name] = null;
        processStatus[name] = 'stopped';
        broadcast({ type: 'status', status: processStatus });

        // Phase 10: Refresh and broadcast telemetry if the Hub just finished
        if (name === 'hub') {
            telemetry.refresh();
            broadcast({ type: 'telemetry', data: telemetry.getStats() });
        }
    });
}

function stopProcess(name) {
    const proc = processes[name];
    if (!proc) {
        log('System', `${name} is not running`, 'info');
        return;
    }

    log('System', `Stopping ${name}...`, 'info');

    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t']);
    } else {
        proc.kill('SIGTERM');
    }

    processes[name] = null;
    processStatus[name] = 'stopped';
    broadcast({ type: 'status', status: processStatus });
}

function launchMission(missionFile) {
    if (!processes.hub) {
        log('System', 'Hub is not running! Start Hub first.', 'error');
        return;
    }

    if (processes.mission) {
        log('System', 'A mission is already running!', 'error');
        return;
    }

    const cwd = path.join(__dirname, '..');
    const missionPath = path.join('test', missionFile);

    log('System', `Launching mission: ${missionFile}`, 'success');

    const proc = spawn('node', [missionPath], {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    processes.mission = proc;
    processStatus.mission = 'running';
    broadcast({ type: 'status', status: processStatus });

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log('mission', line, 'intent'));
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log('mission', line, 'error'));
    });

    proc.on('close', (code) => {
        log('System', `Mission completed with code ${code}`, code === 0 ? 'success' : 'error');
        processes.mission = null;
        processStatus.mission = 'stopped';
        broadcast({ type: 'status', status: processStatus });
    });
}

// ═══════════════════════════════════════════════════════════════
// Phase 13: Natural Language Intent (NLI)
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a natural language instruction via generated temp script
 */
function executeNLI(instruction) {
    if (!instruction) {
        log('NLI', 'No instruction provided', 'error');
        return;
    }

    // Auto-start Hub if not running
    if (!processes.hub) {
        log('NLI', 'Starting Hub for NLI execution...', 'info');
        startProcess('hub');
        // Wait for Hub to be ready
        setTimeout(() => executeNLI(instruction), 2500);
        return;
    }

    log('NLI', `🗣️ Parsing: "${instruction.substring(0, 50)}${instruction.length > 50 ? '...' : ''}"`, 'info');

    // Generate temp script
    const scriptContent = `
const IntentRunner = require('./src/intent_runner');

async function run() {
    const runner = new IntentRunner();
    
    try {
        await runner.connect();
        console.log('[NLI] Connected to Hub');
        
        const results = await runner.executeNL(${JSON.stringify(instruction)});
        
        console.log('\\n[NLI] ✅ Execution complete!');
        console.log('[NLI] Steps executed:', results.length);
        
        await runner.finish('NLI execution complete');
    } catch (error) {
        console.error('[NLI] ❌ Execution failed:', error.message);
        runner.close();
        process.exit(1);
    }
}

run();
`;

    const cwd = path.join(__dirname, '..');
    const scriptPath = path.join(cwd, '_nli_temp_mission.js');

    try {
        fs.writeFileSync(scriptPath, scriptContent, 'utf8');

        // Launch as a mission
        const proc = spawn('node', [scriptPath], {
            cwd,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        processes.mission = proc;
        processStatus.mission = 'running';
        broadcast({ type: 'status', status: processStatus });

        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            lines.forEach(line => log('NLI', line, 'intent'));
        });

        proc.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            lines.forEach(line => log('NLI', line, 'error'));
        });

        proc.on('close', (code) => {
            // Cleanup temp script
            try { fs.unlinkSync(scriptPath); } catch { }

            log('NLI', `Execution ${code === 0 ? 'completed successfully' : 'failed with code ' + code}`,
                code === 0 ? 'success' : 'error');
            processes.mission = null;
            processStatus.mission = 'stopped';
            broadcast({ type: 'status', status: processStatus });
        });

    } catch (e) {
        log('NLI', `Failed to create script: ${e.message}`, 'error');
    }
}

/**
 * Get NLI status (config, Ollama availability)
 */
function getNLIStatus() {
    const configPath = path.join(__dirname, '..', 'config.json');

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const nliConfig = config.nli || {};

        log('NLI', `Model: ${nliConfig.model || 'llama3.2:1b'}`, 'info');
        log('NLI', `Endpoint: ${nliConfig.endpoint || 'http://localhost:11434'}`, 'info');
        log('NLI', `Fallback: ${nliConfig.fallback?.enabled !== false ? 'Enabled' : 'Disabled'} (${nliConfig.fallback?.mode || 'pattern'})`, 'info');

        // Check Ollama availability via HTTP
        const http = require('http');
        const url = new URL(nliConfig.endpoint || 'http://localhost:11434');

        const req = http.get({ hostname: url.hostname, port: url.port, path: '/api/tags', timeout: 3000 }, (res) => {
            if (res.statusCode === 200) {
                log('NLI', '✅ Ollama is available', 'success');
            } else {
                log('NLI', `⚠️ Ollama responded with status ${res.statusCode}`, 'info');
            }
        });

        req.on('error', () => {
            log('NLI', '❌ Ollama not available (will use fallback)', 'info');
        });

        req.on('timeout', () => {
            req.destroy();
            log('NLI', '❌ Ollama connection timeout', 'info');
        });

    } catch (e) {
        log('NLI', `Error reading config: ${e.message}`, 'error');
    }
}

/**
 * Start Ollama server
 */
let ollamaProcess = null;

function startOllama() {
    if (ollamaProcess) {
        log('NLI', 'Ollama is already running', 'info');
        return;
    }

    log('NLI', '🦙 Starting Ollama server...', 'info');

    // Try to start Ollama
    ollamaProcess = spawn('ollama', ['serve'], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
    });

    ollamaProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log('Ollama', line, 'info'));
    });

    ollamaProcess.stderr.on('data', (data) => {
        const text = data.toString();
        // Ollama logs to stderr but it's not always an error
        if (text.includes('listening') || text.includes('Listening')) {
            log('NLI', '✅ Ollama server is ready at http://localhost:11434', 'success');
        } else {
            log('Ollama', text.trim(), 'info');
        }
    });

    ollamaProcess.on('error', (err) => {
        log('NLI', `❌ Failed to start Ollama: ${err.message}`, 'error');
        log('NLI', 'Install Ollama: https://ollama.ai', 'info');
        ollamaProcess = null;
    });

    ollamaProcess.on('close', (code) => {
        log('NLI', `Ollama exited with code ${code}`, code === 0 ? 'info' : 'error');
        ollamaProcess = null;
    });
}

function stopOllama() {
    if (!ollamaProcess) {
        log('NLI', 'Ollama is not running', 'info');
        return;
    }

    log('NLI', '⏹️ Stopping Ollama...', 'info');

    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', ollamaProcess.pid, '/f', '/t']);
    } else {
        ollamaProcess.kill('SIGTERM');
    }

    ollamaProcess = null;
    log('NLI', 'Ollama stopped', 'success');
}



// HTTP server for static files
const projectRoot = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
    let filePath;

    // API: Export sentinel
    if (req.method === 'POST' && req.url === '/api/sentinel/export') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { filename, code } = JSON.parse(body);

                if (!filename || !code) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Missing filename or code' }));
                    return;
                }

                // Sanitize filename
                const safeName = filename.replace(/[^a-z0-9_\-\.]/gi, '_');
                const sentinelsDir = path.join(projectRoot, 'sentinels');
                const filePath = path.join(sentinelsDir, safeName);

                // Ensure sentinels directory exists
                if (!fs.existsSync(sentinelsDir)) {
                    fs.mkdirSync(sentinelsDir, { recursive: true });
                }

                // Write the file
                fs.writeFileSync(filePath, code, 'utf8');

                console.log(`[Launcher] Sentinel exported: ${safeName}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: `sentinels/${safeName}` }));
            } catch (e) {
                console.error('[Launcher] Export error:', e.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // API: List available sentinels
    if (req.method === 'GET' && req.url === '/api/sentinels') {
        const sentinels = discoverSentinels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sentinels));
        return;
    }

    // Serve sentinel editor
    if (req.url === '/sentinel-editor' || req.url === '/sentinel-editor.html') {
        filePath = path.join(__dirname, 'sentinel_editor.html');
    }
    // Serve launcher UI files from launcher/ directory
    else if (req.url === '/' || req.url.startsWith('/client.js') || req.url.startsWith('/styles.css')) {
        filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    } else {
        // Serve other files (report.html, screenshots/) from project root
        filePath = path.join(projectRoot, req.url);
    }

    const ext = path.extname(filePath);

    // Security: Prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(projectRoot) && !normalizedPath.startsWith(__dirname)) {
        console.warn(`[Launcher] SECURITY: Blocked path traversal attempt: ${req.url}`);
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp'
    };

    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found: ' + req.url);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║      🛰️  Starlight Mission Control               ║
╠══════════════════════════════════════════════════╣
║  UI:        http://localhost:${PORT}               ║
║  WebSocket: ws://localhost:${WS_PORT}                ║
╚══════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Launcher] Shutting down...');
    Object.keys(processes).forEach(name => stopProcess(name));
    setTimeout(() => {
        wss.close();
        server.close();
        process.exit(0);
    }, 1000);
});
function discoverMissions() {
    const testDir = path.join(__dirname, '../test');
    try {
        if (!fs.existsSync(testDir)) return [];
        const files = fs.readdirSync(testDir);
        return files.filter(f => f.startsWith('intent_') && f.endsWith('.js'));
    } catch (e) {
        console.error('[Launcher] Discovery error:', e.message);
        return [];
    }
}

// Start discovery on load
const missions = discoverMissions();
console.log(`[Launcher] Discovered ${missions.length} mission scripts.`);
