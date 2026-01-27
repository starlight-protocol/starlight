// Starlight Launch Server v4.2 - The "Forensic" Update
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const WS_PORT = 3001;

// Process registry
const processes = { hub: null, mission: null };
const processStatus = { hub: 'stopped', mission: 'stopped' };
let hubAutoSyncLastUpdate = 0;
let isShuttingDown = false; // v4.6 Flag to prevent status race conditions during shutdown

// v4.2: Session-Isolated Forensics Integration
function getSessionMetrics() {
    const reportPath = path.join(__dirname, '../mission_trace.json');
    try {
        if (!fs.existsSync(reportPath)) return null;
        const traceString = fs.readFileSync(reportPath, 'utf8');
        // Handle potentially malformed JSON if mission is in progress
        const trace = JSON.parse(traceString.endsWith(']') ? traceString : traceString + ']');

        // v4.6 Enterprise Metrics: Sync with HubServer truth
        const totalAttempts = trace.filter(e => e.type === 'COMMAND' || e.type === 'SUCCESS' || e.type === 'FAILURE');
        const successfulOnes = trace.filter(e => e.type === 'COMMAND' && e.success === true);
        const interventions = trace.filter(e => e.type === 'HIJACK').length;
        const sentinelActions = trace.filter(e => e.type === 'SENTINEL_ACTION' && e.success).length;

        const successRate = totalAttempts.length > 0
            ? Math.round((successfulOnes.length / totalAttempts.length) * 100)
            : 100;

        const durationMs = trace.length > 1 ? (new Date(trace[trace.length - 1].rawTimestamp || Date.now()) - new Date(trace[0].rawTimestamp || Date.now())) : 0;

        // Value = Remediation + Efficiency (Protocol 4.6 weighted)
        const savedMins = (interventions * 2) + Math.ceil(durationMs / 60000);

        return {
            successRate,
            totalSavedMins: savedMins,
            avgRecoveryTimeMs: interventions > 0 ? (durationMs / interventions / 2) : 0,
            totalInterventions: interventions + sentinelActions,
            a11yViolations: trace.filter(e => e.type === 'A11Y_VIOLATION').length
        };
    } catch (e) { return null; }
}

// Backend Dependency Monitor (v4.3 Factual Health)
async function checkOllamaHealth() {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.get('http://localhost:11434/api/tags', (res) => {
            resolve(res.statusCode === 200 ? 'online' : 'unhealthy');
        });
        req.on('error', () => resolve('offline'));
        req.setTimeout(1000, () => { req.destroy(); resolve('timeout'); });
    });
}

// Sentinel Fleet Manager: v4.2 Health Pulse
// Sentinel Fleet Manager: v4.3 Health Pulse
async function discoverSentinels() {
    const sentinelsDir = path.join(__dirname, '../sentinels');
    const results = [];

    // Fetch live data from Hub if available
    let liveSentinels = [];
    let managedFleet = [];
    let ollamaStatus = 'unknown';

    try {
        ollamaStatus = await checkOllamaHealth();
        const response = await fetch('http://localhost:8095/health').catch(() => null);
        if (response && response.ok) {
            const data = await response.json();
            liveSentinels = data.sentinels || [];
            managedFleet = data.managedFleet || [];
        }
    } catch (e) { }

    try {
        const files = fs.readdirSync(sentinelsDir);
        files.forEach(file => {
            if (file.endsWith('.py') && !file.startsWith('__') && !file.startsWith('test_')) {
                const id = file.replace('.py', '');
                const name = id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                // Match with live data (connected or managed) - Fuzzy normalization
                const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normId = normalize(id);

                const live = liveSentinels.find(s => normalize(s.layer).includes(normId));
                const managed = managedFleet && managedFleet.find(m => normalize(m.name).includes(normId));
                const isRunning = processStatus[id] === 'running' || !!live || !!managed;

                // Factual Health Override: If it depends on Ollama and Ollama is down, it's unhealthy
                let calculatedHealth = live ? live.health : (isRunning ? 'awaiting_registry' : 'offline');
                if (id.includes('vision') && ollamaStatus !== 'online') {
                    calculatedHealth = `backend_offline (Ollama: ${ollamaStatus})`;
                }

                results.push({
                    id,
                    name,
                    file,
                    status: isRunning ? 'running' : 'stopped',
                    health: calculatedHealth,
                    icon: getSentinelIcon(id)
                });
            }
        });

        // Sync Hub status if not manually started but health check works
        // v4.3: Added check to prevent "Zombies" staying green after manual stop
        // v4.6: Allow sync but respect shutdown flag for status logic

        if (liveSentinels.length > 0 || (hubAutoSyncLastUpdate > Date.now() - 10000 && hubAutoSyncLastUpdate !== 0)) {
            if (!isShuttingDown && processStatus.hub === 'stopped') {
                log('System', '🔗 Synchronized with external Hub instance.', 'info');
                processStatus.hub = 'running';
                broadcast({ type: 'status', status: processStatus });
            }
            if (liveSentinels.length > 0) hubAutoSyncLastUpdate = Date.now();
        } else if (processStatus.hub === 'running' && !processes.hub && !isShuttingDown) {
            // We thought it was running but it's not in our list and health failed
            processStatus.hub = 'stopped';
            broadcast({ type: 'status', status: processStatus });
        }
    } catch (e) { }
    return results;
}

function getSentinelIcon(id) {
    const icons = { pulse: '💚', janitor: '🧹', vision: '👁️', pii: '🔒', compliance: '⚖️' };
    for (const [key, icon] of Object.entries(icons)) { if (id.includes(key)) return icon; }
    return '🛡️';
}

// WebSocket server for Mission Control UI
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on('connection', async (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'status', status: processStatus }));
    ws.send(JSON.stringify({ type: 'telemetry', data: getSessionMetrics() }));
    ws.send(JSON.stringify({ type: 'sentinels', sentinels: await discoverSentinels() }));
    ws.send(JSON.stringify({ type: 'missionList', missions: discoverMissions() }));

    ws.on('message', (data) => {
        try { handleCommand(JSON.parse(data), ws); } catch (e) { }
    });
    ws.on('close', () => clients.delete(ws));
});

function broadcast(message) {
    const data = JSON.stringify(message);
    clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
}

function log(source, text, type = 'info') {
    broadcast({ type: 'log', source, text, logType: type, timestamp: new Date().toLocaleTimeString() });
}

function handleCommand(msg, ws) {
    switch (msg.cmd) {
        case 'startAll':
            startConstellation(msg.browser, msg.device, msg.network);
            break;
        case 'stopAll':
            stopConstellation();
            break;
        case 'launch':
            launchMission(msg.mission);
            break;
        case 'executeNLI':
            executeNLI(msg.instruction);
            break;
        case 'getNLIStatus':
            getNLIStatus();
            break;
        case 'toggleOllama':
            toggleOllama();
            break;
        case 'toggleSentinel':
            toggleSentinel(msg.id);
            break;
    }
}

async function toggleSentinel(id) {
    log('System', `🔄 Requesting sentinel toggle: ${id}`, 'info');

    // World-Class: Mapping IDs to Protocol Names from config.json
    const catalog = [
        { id: 'pulse', name: 'Pulse' },
        { id: 'vision', name: 'Vision' },
        { id: 'pii', name: 'PII' },
        { id: 'janitor', name: 'Janitor' },
        { id: 'a11y', name: 'A11y' },
        { id: 'data', name: 'Data' },
        { id: 'responsive', name: 'Responsive' },
        { id: 'stealth', name: 'Stealth' }
    ];
    const entry = catalog.find(c => id.toLowerCase().includes(c.id));
    const sentinelName = entry ? entry.name : id;

    const isRunning = processStatus[id] === 'running';
    const action = isRunning ? 'stop' : 'start';

    try {
        const response = await fetch('http://localhost:8095/manage/sentinel', {
            method: 'POST',
            body: JSON.stringify({ action, name: sentinelName }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            log('System', `✅ Hub acknowledged ${action} for ${sentinelName}`, 'success');
        } else {
            // Fallback to direct spawn if Hub is unreachable
            if (!isRunning) spawnSentinel(id);
            else stopSentinel(id);
        }
    } catch (e) {
        log('System', `⚠️ Hub Management Link Offline. Using direct orchestration.`, 'warn');
        if (!isRunning) spawnSentinel(id);
        else stopSentinel(id);
    }
}

function stopSentinel(id) {
    if (processes[id]) {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', processes[id].pid, '/f', '/t']);
        else processes[id].kill();
        delete processes[id];
        processStatus[id] = 'stopped';
        broadcast({ type: 'status', status: processStatus });
    }
}

function spawnSentinel(id) {
    const sentinelFile = path.join(__dirname, '../sentinels', `${id}.py`);
    if (fs.existsSync(sentinelFile)) {
        const proc = spawn('python', ['-u', sentinelFile], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, HUB_URL: 'ws://localhost:8095' }
        });
        processes[id] = proc;
        processStatus[id] = 'running';
        proc.stdout.on('data', d => log(id, d.toString(), 'hub'));
        proc.on('close', () => {
            processStatus[id] = 'stopped';
            broadcast({ type: 'status', status: processStatus });
        });
    } else {
        log('System', `Error: Sentinel file not found: ${sentinelFile}`, 'error');
    }
}

// v4.2 NLI Engine
function executeNLI(instruction) {
    log('NLI', `🗣️ Parsing: ${instruction}`, 'info');
    const proc = spawn('node', ['bin/starlight.js', '--intent', instruction], {
        cwd: path.join(__dirname, '..'),
        shell: false
    });
    proc.stdout.on('data', d => log('NLI', d.toString(), 'mission'));
}

let ollamaProc = null;
function toggleOllama() {
    if (ollamaProc) {
        log('System', '⏹️ Stopping Ollama...', 'info');
        if (process.platform === 'win32') spawn('taskkill', ['/pid', ollamaProc.pid, '/f', '/t']);
        else ollamaProc.kill();
        ollamaProc = null;
    } else {
        log('System', '🦙 Launching Ollama...', 'info');
        ollamaProc = spawn('ollama', ['serve'], { shell: false });
        ollamaProc.on('error', () => log('System', 'Error: Ollama not found.', 'error'));
    }
}

function getNLIStatus() {
    log('System', '🔍 Checking NLI Health...', 'info');
    // Simple check: is Ollama port 11434 open?
    const http = require('http');
    http.get('http://localhost:11434/api/tags', (res) => {
        log('System', '✅ Ollama is ONLINE', 'success');
    }).on('error', () => log('System', '❌ Ollama is OFFLINE', 'error'));
}

// v4.2: Unified CLI Orchestration (bin/starlight.js)
function startConstellation(browser = 'chromium', device = '', network = 'online') {
    isShuttingDown = false; // Reset shutdown flag
    if (processes.hub) return;

    log('System', `🚀 Assembling constellation via bin/starlight.js...`, 'info');

    // Update config.json (Mobile/Network)
    const configPath = path.join(__dirname, '../config.json');
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.browser = browser;
        config.device = device;
        config.network = network;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    } catch (e) { }

    // Use src/hub.js as the official protocol entry point (v4.5)
    const proc = spawn('node', ['src/hub.js'], {
        cwd: path.join(__dirname, '..'),
        shell: false,
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    proc.stderr.on('data', d => log('System', `ERR: ${d.toString()}`, 'error'));

    processes.hub = proc;
    processStatus.hub = 'running';
    broadcast({ type: 'status', status: processStatus });

    proc.stdout.on('data', d => {
        const lines = d.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => {
            let source = 'Hub';
            let text = line;

            // Forensic Routing: Detect sentinel name in [Name] bracket
            const match = line.match(/^\[([^\]]+)\]\s*(.*)/);
            if (match) {
                const candidate = match[1];
                if (candidate.toLowerCase().includes('hubserver')) {
                    source = 'Hub';
                    text = match[2];
                } else if (!candidate.includes('System') && !candidate.includes('Launcher')) {
                    source = candidate;
                    text = match[2];
                }
            }

            log(source, text, 'hub');
            if (line.includes('Starlight Protocol READY')) {
                log('System', '✨ Constellation synchronized. Ready for mission.', 'success');
            }
        });
    });

    proc.on('close', () => {
        processes.hub = null;
        processStatus.hub = 'stopped';
        broadcast({ type: 'status', status: processStatus });
    });
}

async function stopConstellation() {
    if (isShuttingDown) return; // Prevent double trigger
    isShuttingDown = true;
    log('System', '🛑 Initiating full constellation shutdown...', 'warn');

    // 1. Immediate status reset for UI responsiveness
    processStatus.hub = 'stopped';
    processStatus.mission = 'stopped';
    hubAutoSyncLastUpdate = 0;
    broadcast({ type: 'status', status: processStatus });

    // 2. Kill tracked processes by PID
    if (processes.hub) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', processes.hub.pid, '/f', '/t']);
        } else {
            processes.hub.kill();
        }
        processes.hub = null;
    }

    if (processes.mission) {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', processes.mission.pid, '/f', '/t']);
        } else {
            processes.mission.kill();
        }
        processes.mission = null;
    }

    // 3. Kill orphan Hub/Sentinel processes (Absolute Path & Port Match)
    if (process.platform === 'win32') {
        const cwd = process.cwd().replace(/\\/g, '\\\\');

        // Kill Hub orphans on 8095
        const killHub = `Get-NetTCPConnection -LocalPort 8095 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
        spawn('powershell.exe', ['-NoProfile', '-Command', killHub], { shell: false });

        // Kill ALL node/python orphans spawned from this codebase directory
        const killOrphans = `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq "node.exe" -or $_.Name -eq "python.exe") -and ($_.CommandLine -like "*${cwd}*") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
        spawn('powershell.exe', ['-NoProfile', '-Command', killOrphans], { shell: false });
    }

    // 4. Wipe health cache to prevent phantom status
    try {
        const healthFile = path.join(__dirname, '../sentinel_health.json');
        if (fs.existsSync(healthFile)) fs.writeFileSync(healthFile, '{}');
    } catch (e) { }

    // 5. Port Cleanup Buffer: Wait for OS to release sockets before allowing restart
    await new Promise(r => setTimeout(r, 2000));

    isShuttingDown = false;
    log('System', '✅ Fleet shutdown complete.', 'success');
}

function launchMission(mission) {
    if (!processes.hub) {
        log('System', 'Error: Hub is not running.', 'error');
        return;
    }

    log('System', `🛰️ Launching mission: ${mission}`, 'success');
    const proc = spawn('node', [`test/${mission}`], {
        cwd: path.join(__dirname, '..'),
        shell: false,
        env: { ...process.env, HUB_URL: 'ws://localhost:8095' }
    });

    processes.mission = proc;
    processStatus.mission = 'running';
    broadcast({ type: 'status', status: processStatus });

    proc.stdout.on('data', d => {
        const lines = d.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => log('Mission', line, 'mission'));
    });

    proc.on('close', code => {
        log('System', `Mission outcome: ${code === 0 ? 'SUCCESS' : 'FAILURE'}`, code === 0 ? 'success' : 'error');
        processes.mission = null;
        processStatus.mission = 'stopped';
        broadcast({ type: 'status', status: processStatus });

        // Refresh session-isolated metrics
        broadcast({ type: 'telemetry', data: getSessionMetrics() });
    });
}

function discoverMissions() {
    const testDir = path.join(__dirname, '../test');
    try {
        if (!fs.existsSync(testDir)) return [];
        return fs.readdirSync(testDir).filter(f => f.startsWith('intent_') && f.endsWith('.js'));
    } catch (e) { return []; }
}

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    if (req.url === '/sentinel-editor') filePath = path.join(__dirname, 'sentinel_editor.html');
    if (req.url === '/report.html') filePath = path.join(__dirname, '../report.html');
    if (req.url.startsWith('/screenshots/')) filePath = path.join(__dirname, '..', req.url);

    const ext = path.extname(filePath);
    const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png' };

    fs.readFile(filePath, (err, content) => {
        if (err) { res.writeHead(404); res.end('Not found'); }
        else { res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' }); res.end(content); }
    });
});

server.listen(PORT, () => {
    console.log(`🛰️ Mission Control UI: http://localhost:${PORT}`);

    // v4.3 Periodic Health Pulse
    setInterval(async () => {
        const sentinels = await discoverSentinels();
        broadcast({ type: 'sentinels', sentinels });
    }, 5000);
});
