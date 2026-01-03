/**
 * Starlight Mission Control - Client Script
 * Connects to launcher server and handles UI interactions
 */

// Logic Fix: Make WebSocket URL configurable via query parameter
const params = new URLSearchParams(window.location.search);
const WS_URL = params.get('ws') || 'ws://localhost:3001';
let ws = null;
let reconnectTimer = null;

// DOM Elements
const logOutput = document.getElementById('log-output');
const hubBtn = document.getElementById('hub-btn');
const pulseBtn = document.getElementById('pulse-btn');
const janitorBtn = document.getElementById('janitor-btn');
const launchBtn = document.getElementById('launch-btn');
const missionSelect = document.getElementById('mission-select');

// Status icons
const statusIcons = {
    hub: document.getElementById('hub-status'),
    pulse: document.getElementById('pulse-status'),
    janitor: document.getElementById('janitor-status')
};

// Status cards
const statusCards = {
    hub: document.getElementById('hub-card'),
    pulse: document.getElementById('pulse-card'),
    janitor: document.getElementById('janitor-card')
};

// Process state
let processStatus = {
    hub: 'stopped',
    pulse: 'stopped',
    janitor: 'stopped',
    mission: 'stopped'
};

// Connect to WebSocket server
function connect() {
    addLog('System', 'Connecting to launcher server...', 'info');

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        addLog('System', 'Connected to launcher server!', 'success');
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        addLog('System', 'Disconnected from server. Reconnecting...', 'error');
        scheduleReconnect();
    };

    ws.onerror = () => {
        addLog('System', 'Connection error. Is the server running?', 'error');
    };
}

function scheduleReconnect() {
    if (!reconnectTimer) {
        reconnectTimer = setInterval(() => {
            if (!ws || ws.readyState === WebSocket.CLOSED) {
                connect();
            }
        }, 3000);
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'log':
            addLog(msg.source, msg.text, msg.logType);
            break;
        case 'status':
            updateStatus(msg.status);
            break;
        case 'telemetry':
            updateVitals(msg.data);
            break;
        case 'missionList':
            updateMissionDropdown(msg.missions);
            break;
        case 'sentinels':
            renderSentinelCards(msg.sentinels);
            break;
        default:
            // Phase 13.5: Handle recording events
            if (msg.type?.startsWith('RECORDING_')) {
                handleRecordingEvent(msg);
            }
            break;
    }
}

function updateVitals(data) {
    if (!data) return;
    document.getElementById('success-rate').textContent = `${data.successRate}%`;
    document.getElementById('saved-effort').innerHTML = `${data.totalSavedMins}<span class="unit">min</span>`;
    document.getElementById('sovereign-mttr').innerHTML = `${Math.round(data.avgRecoveryTimeMs)}<span class="unit">ms</span>`;
    document.getElementById('interventions-count').textContent = data.totalInterventions;
}

function updateStatus(status) {
    processStatus = status;

    // Update all process statuses dynamically
    Object.keys(status).forEach(name => {
        if (name === 'mission') return; // Skip mission, handled separately
        updateProcessUI(name, status[name]);
    });

    // Update launch button
    if (status.mission === 'running') {
        launchBtn.textContent = '⏳ Running...';
        launchBtn.disabled = true;
    } else {
        launchBtn.textContent = '🚀 Launch Mission';
        launchBtn.disabled = false;
    }
}

function updateMissionDropdown(missions) {
    if (!missions) return;
    const select = document.getElementById('mission-select');
    const currentValue = select.value;

    // Clear existing
    select.innerHTML = '';

    // Add missions
    missions.forEach(mission => {
        const option = document.createElement('option');
        option.value = mission;
        option.textContent = mission;
        if (mission === currentValue) option.selected = true;
        select.appendChild(option);
    });

    if (missions.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No missions found';
        option.disabled = true;
        select.appendChild(option);
    }
}

function updateProcessUI(name, state) {
    // Get elements dynamically - they may not exist in statusIcons/statusCards
    const icon = document.getElementById(`${name}-status`);
    const card = document.getElementById(`${name}-card`);
    const btn = document.getElementById(`${name}-btn`);

    // Skip if elements don't exist (e.g., sentinel cards not yet rendered)
    if (!icon || !card || !btn) return;

    if (state === 'running') {
        icon.textContent = '🟢';
        card.classList.add('running');
        btn.textContent = 'Stop';
        btn.className = 'btn btn-stop';
    } else {
        icon.textContent = '⚫';
        card.classList.remove('running');
        btn.textContent = 'Start';
        btn.className = 'btn btn-start';
    }
}

function addLog(source, text, logType = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${logType}`;

    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `<span style="opacity: 0.5">[${timestamp}]</span> [${source}] ${text}`;

    logOutput.appendChild(entry);
    logOutput.scrollTop = logOutput.scrollHeight;

    // Limit log entries
    while (logOutput.children.length > 500) {
        logOutput.removeChild(logOutput.firstChild);
    }
}

function send(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(cmd));
    } else {
        addLog('System', 'Not connected to server!', 'error');
    }
}

// UI Actions
function toggleProcess(name) {
    const state = processStatus[name];
    if (state === 'running') {
        send({ cmd: 'stop', process: name });
    } else {
        send({ cmd: 'start', process: name });
    }
}

function startAll() {
    send({ cmd: 'startAll' });
}

function stopAll() {
    send({ cmd: 'stopAll' });
}

function launchMission() {
    const mission = missionSelect.value;
    send({ cmd: 'launch', mission });
}

function openReport() {
    // Open report.html from the project root (served at /report.html)
    window.open('/report.html', '_blank');
}

function clearLogs() {
    logOutput.innerHTML = '<div class="log-entry log-info">[System] Logs cleared.</div>';
}

// Phase 13.5: Recording
let isRecording = false;

function toggleRecording() {
    if (isRecording) {
        // Stop recording
        const name = prompt('Name for this test (leave empty for auto-generated):');
        send({ cmd: 'stopRecording', name: name || null });
        isRecording = false;
        document.getElementById('record-btn').textContent = '🔴 Record';
        document.getElementById('record-btn').classList.remove('recording');
        document.getElementById('recording-indicator').style.display = 'none';
        addLog('System', '⏹️ Recording stopped. Generating test file...', 'success');
    } else {
        // Start recording
        const urlInput = document.getElementById('record-url');
        const url = urlInput.value.trim() || 'https://google.com';
        send({ cmd: 'startRecording', url: url });
        isRecording = true;
        document.getElementById('record-btn').textContent = '⏹️ Stop';
        document.getElementById('record-btn').classList.add('recording');
        document.getElementById('recording-indicator').style.display = 'block';
        addLog('System', `🔴 Recording started on ${url}. Navigate and interact on the browser.`, 'success');
    }
}

// Handle recording events from server
function handleRecordingEvent(msg) {
    if (msg.type === 'RECORDING_STOPPED' && msg.fileName) {
        addLog('Recorder', `✅ Test file generated: ${msg.fileName}`, 'success');
        // Add new test to dropdown
        const option = document.createElement('option');
        option.value = msg.fileName;
        option.textContent = `📝 ${msg.fileName} (Recorded)`;
        option.selected = true;
        document.getElementById('mission-select').prepend(option);
    } else if (msg.type === 'RECORDING_ERROR') {
        addLog('Recorder', `❌ Error: ${msg.error}`, 'error');
        isRecording = false;
        document.getElementById('record-btn').textContent = '🔴 Record';
        document.getElementById('recording-indicator').style.display = 'none';
    }
}

// Sentinel Fleet Manager: Render dynamic sentinel cards
function renderSentinelCards(sentinels) {
    const grid = document.getElementById('fleet-grid');
    if (!grid) return;

    // Find the "Create Sentinel" card (we'll insert before it)
    const createCard = grid.querySelector('a[href="/sentinel-editor"]');

    // Remove any existing dynamic sentinel cards
    grid.querySelectorAll('.sentinel-card').forEach(card => card.remove());

    // Insert cards for each sentinel
    sentinels.forEach(sentinel => {
        const isRunning = processStatus[sentinel.id] === 'running';
        const card = document.createElement('div');
        card.className = 'status-card sentinel-card';
        card.id = `${sentinel.id}-card`;
        if (isRunning) card.classList.add('running');

        card.innerHTML = `
            <div class="status-header">
                <span class="status-icon" id="${sentinel.id}-status">${isRunning ? '🟢' : '⚫'}</span>
                <h3>${sentinel.icon} ${sentinel.name}</h3>
            </div>
            <p class="status-desc">${getDescription(sentinel.id)}</p>
            <button class="btn ${isRunning ? 'btn-stop' : 'btn-start'}" 
                    id="${sentinel.id}-btn" 
                    onclick="toggleProcess('${sentinel.id}')">
                ${isRunning ? 'Stop' : 'Start'}
            </button>
        `;

        // Insert before the create card
        if (createCard) {
            grid.insertBefore(card, createCard);
        } else {
            grid.appendChild(card);
        }
    });
}

// Get description based on sentinel name
function getDescription(id) {
    const descriptions = {
        'pulse_sentinel': 'Temporal Stability Monitor',
        'janitor': 'Obstacle Clearing Agent',
        'vision_sentinel': 'AI-Powered Visual Detection',
        'data_sentinel': 'Context Injection Engine',
        'pii_sentinel': 'Privacy Data Detection'
    };
    return descriptions[id] || 'Custom Sentinel';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connect();
});
