// Starlight Mission Control Client v4.2
const params = new URLSearchParams(window.location.search);
const WS_URL = params.get('ws') || 'ws://localhost:3001';
let ws = null;
let processStatus = { hub: 'stopped', mission: 'stopped' };

function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => addLog('System', '🚀 Core Link Established', 'success');
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(connect, 3000);
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'log': addLog(msg.source, msg.text, msg.logType); break;
        case 'status': updateStatus(msg.status); break;
        case 'telemetry': updateVitals(msg.data); break;
        case 'missionList': updateMissionDropdown(msg.missions); break;
        case 'sentinels': renderSentinelCards(msg.sentinels); break;
    }
}

function updateVitals(data) {
    if (!data) return;
    document.getElementById('success-rate').textContent = `${data.successRate}%`;
    document.getElementById('saved-effort').innerHTML = `${data.totalSavedMins}<span class="unit">min</span>`;
    document.getElementById('sovereign-mttr').innerHTML = `${Math.round(data.avgRecoveryTimeMs)}<span class="unit">ms</span>`;

    // Update A11y Feed if data contains violations
    const feed = document.getElementById('a11y-feed');
    if (data.a11yViolations > 0) {
        feed.innerHTML = `<span style="color:var(--accent-red)">🚨 ${data.a11yViolations} violations detected in current session.</span>`;
    } else {
        feed.innerHTML = `No accessibility violations found.`;
    }
}

function updateStatus(status) {
    processStatus = status;
    const isRunning = status.hub === 'running';

    // Toggle main constellation buttons
    const startBtn = document.getElementById('start-all-btn');
    const stopBtn = document.getElementById('stop-all-btn');

    startBtn.style.display = isRunning ? 'none' : 'block';
    stopBtn.style.display = isRunning ? 'block' : 'none';

    // Reset stop button state if it was loading
    if (!isRunning) {
        stopBtn.innerHTML = '⏹️ Stop All';
        stopBtn.classList.remove('btn-loading');
    }

    // Update Hub Card
    const hubBtn = document.getElementById('hub-btn');
    const hubStatus = document.getElementById('hub-status');
    const hubCard = document.getElementById('hub-card');

    if (isRunning) {
        hubBtn.textContent = 'Stop Hub';
        hubStatus.textContent = '🟢';
        hubCard.classList.add('running');
    } else {
        hubBtn.textContent = 'Start Hub';
        hubStatus.textContent = '⚫';
        hubCard.classList.remove('running');
    }

    // Update mission button
    const launchBtn = document.getElementById('launch-btn');
    if (status.mission === 'running') {
        launchBtn.textContent = '⏳ Running';
        launchBtn.disabled = true;
    } else {
        launchBtn.textContent = '🚀 Launch';
        launchBtn.disabled = false;
    }
}

function renderSentinelCards(sentinels) {
    const grid = document.getElementById('fleet-grid');
    grid.querySelectorAll('.sentinel-card').forEach(c => c.remove());

    sentinels.forEach(s => {
        const card = document.createElement('div');
        const isRunning = s.status === 'running';
        card.className = `status-card sentinel-card ${isRunning ? 'running' : ''}`;
        card.innerHTML = `
            <div class="status-header">
                <h3>${s.icon} ${s.name}</h3>
                <span class="status-icon">${isRunning ? '🟢' : '⚫'}</span>
            </div>
            <p class="status-desc">Status: <span style="color:${s.health === 'online' ? 'var(--accent-emerald)' : 'var(--accent-red)'}">${s.health.toUpperCase()}</span></p>
            <button class="btn btn-secondary" style="width:100%" onclick="toggleSentinel('${s.id}')">${isRunning ? 'Stop' : 'Start'}</button>
        `;
        grid.insertBefore(card, grid.lastElementChild);
    });
}

function updateMissionDropdown(missions) {
    const select = document.getElementById('mission-select');
    select.innerHTML = '<option value="">Load Mission Script...</option>';
    missions.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });
}

function addLog(source, text, logType = 'info') {
    const output = document.getElementById('log-output');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${logType.toLowerCase()}`;
    entry.innerHTML = `<span class="log-source">[${source}]</span> <span class="log-text">${text}</span>`;
    output.appendChild(entry);
    output.scrollTop = output.scrollHeight;
}

// UI Triggers
function startAll() {
    const browser = document.getElementById('browser-select').value;
    const device = document.getElementById('device-select').value;
    const network = document.getElementById('network-select').value;
    ws.send(JSON.stringify({ cmd: 'startAll', browser, device, network }));
}

function stopAll() {
    const btn = document.getElementById('stop-all-btn');
    btn.innerHTML = '⌛ Stopping...';
    btn.classList.add('btn-loading');
    ws.send(JSON.stringify({ cmd: 'stopAll' }));
}

function launchMission() {
    const mission = document.getElementById('mission-select').value;
    if (mission) ws.send(JSON.stringify({ cmd: 'launch', mission }));
}

function toggleProcess(name) {
    if (processStatus[name] === 'running') ws.send(JSON.stringify({ cmd: 'stopAll' }));
    else startAll();
}

function toggleSentinel(id) {
    ws.send(JSON.stringify({ cmd: 'toggleSentinel', id }));
}

function openReport() { window.open('/report.html', '_blank'); }
function clearLogs() { document.getElementById('log-output').innerHTML = ''; }

function executeNLI() {
    const input = document.getElementById('nli-input').value.trim();
    if (input) ws.send(JSON.stringify({ cmd: 'executeNLI', instruction: input }));
}

function checkNLIStatus() {
    ws.send(JSON.stringify({ cmd: 'getNLIStatus' }));
}

function toggleOllama() {
    ws.send(JSON.stringify({ cmd: 'toggleOllama' }));
}

document.addEventListener('DOMContentLoaded', connect);
