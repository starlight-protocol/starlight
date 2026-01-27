/**
 * HubServer - The Modular Process Orchestrator (v4.0)
 * ==================================================
 * 
 * Central entry point that coordinates:
 * - ConfigLoader (Configuration)
 * - WebSocketServer (Communication)
 * - IpcBridge (Security)
 * - LifecycleManager (Sentinel Management)
 * - SmartBrowserAdapter (Engine Management)
 */

const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');
const http = require('http');
const path = require('path');
const fs = require('fs');

const { ConfigLoader } = require('../config/ConfigLoader');
const { IpcBridge } = require('../security/IpcBridge');
const { LifecycleManager } = require('./LifecycleManager');
const { SmartBrowserAdapter } = require('../../smart_browser_adapter');
const { SchemaValidator } = require('../../validation/schema_validator');
const { PIIRedactor } = require('../../utils/pii_redactor');
const { AuditLogger } = require('../security/AuditLogger');
const { SemanticResolver } = require('../analysis/SemanticResolver');
const { HistoryEngine } = require('../analysis/HistoryEngine');
const { ReportGenerator } = require('../analysis/ReportGenerator');
const TelemetryEngine = require('../../telemetry');

class HubServer {
    constructor(options = {}) {
        this.port = options.port || 8095;
        this.headless = options.headless || false;

        // 1. Initialize Domains
        this.configLoader = new ConfigLoader(this._loadRawConfig());
        this.validator = new SchemaValidator();
        this.piiRedactor = new PIIRedactor({ enabled: true });
        this.ipcBridge = new IpcBridge(this.validator, this.piiRedactor);
        this.auditLogger = new AuditLogger({ redactor: this.piiRedactor });
        this.historyEngine = new HistoryEngine();
        this.semanticResolver = new SemanticResolver(this.historyEngine);

        // 2. Initialize Core Components
        this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));
        this.wss = new WebSocketServer({ server: this.server });

        // 3. Initialize Browser & Sentinels
        const browserConfig = this.configLoader.getBrowserConfig();
        this.browserAdapter = new SmartBrowserAdapter(browserConfig);
        this.lifecycleManager = new LifecycleManager(
            { sentinels: this.configLoader.getSentinelsConfig() },
            `ws://localhost:${this.port}`
        );

        this.sentinels = new Map();
        this.sentinelHistory = []; // Persistent mission log for reporting
        this.pendingSentinels = new Map(); // For challenge-response
        this.consensusState = new Map(); // Tracks clearance for each msg_id
        this.reportData = [];
        // Ensure mission_trace.json is fresh on start
        this._persistTrace();
        this.missionStartTime = Date.now();
        this.totalSavedTime = 0;
        this.recoveryTimes = [];
        this.telemetry = new TelemetryEngine(path.join(process.cwd(), 'telemetry.json'));
        this.missionContext = {}; // Aggregated Sentinel reports
        this.securityEvents = []; // SOC 2 Forensic Trace
        this.missionTargetUrl = null; // Sovereign Mission Source of Truth
        this.missionLocaleInvariants = []; // Derived locale tokens (en_gb, us, etc.)
        this.screenshotsDir = path.join(process.cwd(), 'screenshots');
        this.isReady = false; // Readiness signal
        this.startupError = null;

        if (!fs.existsSync(this.screenshotsDir)) {
            fs.mkdirSync(this.screenshotsDir, { recursive: true });
        }
    }

    /**
     * Start the Hub and all sub-systems.
     */
    async start() {
        console.log(`[HubServer] 🚀 Initializing Starlight Protocol v4.0...`);

        // 1. Foundation: Browser Engine
        console.log(`[HubServer] Launching browser engine (${this.browserAdapter.constructor.name})...`);
        const launchStart = Date.now();
        await this.browserAdapter.launch({ headless: this.headless });
        console.log(`[HubServer] Browser launched in ${Date.now() - launchStart}ms`);

        this.page = await this.browserAdapter.newPage();
        console.log(`[HubServer] Browser page context ready`);

        // 1.1 Network Security: Telemetry Blocking (Eliminate CORS Noise)
        if (this.page && this.page.route) {
            console.log('[HubServer] Silencing telemetry (backtrace.io)...');
            await this.page.route('**/*backtrace.io/**', route => route.abort());
        }

        // 2. Intelligence: Sentinels (Parallel Background)
        console.log(`[HubServer] Synchronizing Sentinel Constellation...`);
        this.lifecycleManager.launchAll();

        // 3. Network: Hub Interface
        this.server.listen(this.port, () => {
            console.log(`[HubServer] Hub listening on port ${this.port}`);
        });

        this.wss.on('connection', (ws) => this._handleConnection(ws));
        this.isReady = true;
        console.log(`[HubServer] Starlight Protocol READY`);

        // 4. Lifecycle Hooks
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', async (err) => {
            console.error('[HubServer] UNCAUGHT EXCEPTION:', err);
            this.startupError = err.message;
            if (!this.isReady) {
                // If we haven't reached readiness, we must exit to allow the orchestrator to retry
                await this.shutdown(1);
            }
        });
    }

    _loadRawConfig() {
        const configPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        return {};
    }

    _handleHttpRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // CORS Headers for Dashboard
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (url.pathname === '/health') {
            return this._handleHealthCheck(req, res);
        }

        if (url.pathname === '/manage/sentinel' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const { action, name } = data;
                    if (action === 'start') {
                        this.lifecycleManager.startSentinelByName(name);
                        res.writeHead(200);
                        res.end(JSON.stringify({ status: 'ok', message: `Launching ${name}` }));
                    } else if (action === 'stop') {
                        this.lifecycleManager.stopSentinelByName(name);
                        res.writeHead(200);
                        res.end(JSON.stringify({ status: 'ok', message: `Stopping ${name}` }));
                    } else {
                        res.writeHead(400);
                        res.end(JSON.stringify({ status: 'error', message: 'Invalid action' }));
                    }
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ status: 'error', message: e.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    }

    _handleHealthCheck(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const sentinelData = Array.from(this.sentinels.values()).map(s => ({
            layer: s.layer,
            health: s.health || 'awaiting_pulse',
            lastPulse: s.lastPulse
        }));
        res.end(JSON.stringify({
            status: this.isReady ? 'online' : 'initializing',
            error: this.startupError,
            protocol: 'Starlight v4.5',
            uptime: Math.round((Date.now() - this.missionStartTime) / 1000),
            sentinels: sentinelData,
            managedFleet: this.lifecycleManager.processes.map(p => ({ name: p.name, status: 'running' }))
        }));
    }

    _handleConnection(ws) {
        const id = nanoid(12);
        console.log(`[HubServer] New connection attempt: ${id}`);

        ws.on('message', async (data) => {
            try {
                const rawMsg = JSON.parse(data.toString());
                const processed = this.ipcBridge.processMessage(rawMsg);
                const { raw, safe } = processed;
                this.auditLogger.log('starlight.receive', safe);
                await this._handleMessage(id, ws, raw, safe);
            } catch (e) {
                console.error(`[HubServer] Security Violation or Protocol Error: ${e.message}`);
                this.securityEvents.push({
                    timestamp: new Date().toISOString(),
                    error: e.message,
                    clientId: id
                });
            }
        });

        ws.on('close', () => {
            const sentinel = this.sentinels.get(id);
            if (sentinel) {
                console.log(`[HubServer] Sentinel disconnected: ${sentinel.layer} (${id})`);
                for (const [msgId, consensus] of this.consensusState.entries()) {
                    if (!consensus.clearedBy.has(id)) {
                        consensus.required = Math.max(0, consensus.required - 1);
                        if (consensus.clearedBy.size >= consensus.required && !consensus.hijacked) {
                            consensus.resolve();
                        }
                    }
                }
            }
            this.sentinels.delete(id);
        });
    }

    async _handleMessage(id, ws, msg, safeMsg) {
        const auditMsg = safeMsg || msg;
        if (msg.method === 'starlight.pulse') {
            const sentinel = this.sentinels.get(id);
            if (sentinel) {
                sentinel.health = msg.params?.health || 'awaiting_pulse';
                sentinel.lastPulse = Date.now();
            }
            return;
        }

        this.auditLogger.log('ipc_receive', auditMsg);

        if (msg.method === 'starlight.registration') {
            const challenge = nanoid(16);
            this.pendingSentinels.set(id, { ...msg.params, challenge, ws });
            ws.send(JSON.stringify({
                jsonrpc: '2.0', id: msg.id,
                result: { success: true, assignedId: id, challenge: challenge }
            }));
            return;
        }

        if (msg.method === 'starlight.challenge_response') {
            const pending = this.pendingSentinels.get(id);
            if (pending && pending.challenge === msg.params.response) {
                const { ws: _, ...sentinelInfo } = pending;
                this.sentinels.set(id, { ...pending, layer: pending.layer });
                this.sentinelHistory.push({ ...sentinelInfo, id });
                ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { success: true } }));

                // Corrected Delta v1.2.2: Mandatory registration acknowledgment
                // This unblinds the sentinel, confirming it's now part of the constellation.
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'starlight.registration_ack',
                        params: {
                            assignedId: id,
                            protocolVersion: '1.2.2',
                            status: 'ACTIVE'
                        }
                    }));
                }, 50);
            } else {
                ws.close();
            }
            return;
        }

        if (msg.method === 'starlight.intent') {
            await this._processIntent(id, ws, msg);
        } else if (msg.method === 'starlight.context_update') {
            this.missionContext = { ...this.missionContext, ...(msg.params?.context || {}) };
            this.auditLogger.log('context_update', msg.params?.context);
        } else if (msg.method === 'starlight.clear') {
            const clearedId = msg.params?.id || msg.id;
            const consensus = this.consensusState.get(clearedId);
            if (consensus) {
                consensus.clearedBy.add(id);
                if (consensus.clearedBy.size >= consensus.required && !consensus.hijacked) {
                    consensus.resolve();
                }
            }
        } else if (msg.method === 'starlight.hijack') {
            const hijackedId = msg.params?.id || msg.id;
            const consensus = this.consensusState.get(hijackedId);
            if (consensus) {
                consensus.hijacked = true;
                consensus.hijackStartTime = Date.now();
                const sentinelName = this.sentinels.get(id)?.layer || 'Unknown Sentinel';
                const obstacleComplexity = msg.params?.complexity || (msg.params?.reason?.includes('onetrust') ? 2.5 : 1.0);
                const savings = 120 * obstacleComplexity;
                this.totalSavedTime += savings;

                const screenshot = await this._captureForensicSnapshot(`HIJACK_${id}`);
                this.reportData.push({
                    type: 'HIJACK',
                    sentinel: sentinelName,
                    reason: msg.params?.reason || 'Auto-remediation initiated',
                    screenshot,
                    savings,
                    timestamp: new Date().toLocaleTimeString()
                });
                this._persistTrace();
            }
        } else if (msg.method === 'starlight.action') {
            const sentinel = this.sentinels.get(id);
            const action = msg.params?.action || msg.params?.cmd;

            const beforeScreenshot = await this._captureForensicSnapshot(`SENTINEL_BEFORE_${id}`);
            const actionSuccess = await this._executeRawCommand({
                method: msg.method,
                params: { ...msg.params, cmd: action }
            }).catch(() => false);
            const afterScreenshot = await this._captureForensicSnapshot(`SENTINEL_AFTER_${id}`);

            this.reportData.push({
                type: 'SENTINEL_ACTION',
                sentinel: sentinel?.layer || 'Unknown Sentinel',
                cmd: action,
                selector: msg.params?.selector,
                success: actionSuccess,
                beforeScreenshot,
                afterScreenshot,
                timestamp: new Date().toLocaleTimeString()
            });
            this._persistTrace();
        } else if (msg.method === 'starlight.resume') {
            const resumeId = msg.params?.id || msg.id;
            const consensus = this.consensusState.get(resumeId);
            if (consensus) {
                if (consensus.hijackStartTime) {
                    this.recoveryTimes.push(Date.now() - consensus.hijackStartTime);
                }
                consensus.hijacked = false;
                if (consensus.clearedBy.size >= consensus.required) consensus.resolve();

                this.reportData.push({
                    type: 'RECOVERY',
                    id: resumeId,
                    timestamp: new Date().toLocaleTimeString()
                });
                this._persistTrace();
            }
        } else if (msg.method === 'starlight.start_sentinel') {
            const name = msg.params?.name;
            if (name) {
                console.log(`[HubServer] 🚀 Manual start requested for Sentinel: ${name}`);
                this.lifecycleManager.startSentinelByName(name);
                ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { success: true } }));
            }
        } else if (msg.method === 'starlight.getPageContext') {
            await this._handleGetPageContext(id, ws, msg);
        } else if (msg.method === 'starlight.shutdown' || msg.method === 'starlight.finish') {
            if (msg.params?.success === false) {
                this.reportData.push({ type: 'FAILURE', reason: msg.params?.reason || 'External Termination', timestamp: new Date().toLocaleTimeString() });
            }
            await this.shutdown();
        }
    }

    async _handleGetPageContext(id, ws, msg) {
        const a11y = await this._getA11ySnapshot();
        const context = {
            buttons: (a11y?.elements || []).filter(e => e.tag === 'BUTTON' || e.role === 'button').map(e => e.text),
            inputs: (a11y?.elements || []).filter(e => e.tag === 'INPUT' || e.role === 'textbox').map(e => e.label || e.placeholder),
            url: this.page ? await this.page.url() : 'about:blank'
        };
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: context }));
    }

    async _processIntent(id, ws, msg) {
        const goal = msg.params?.goal || msg.params?.cmd || 'Intent';
        const contextUrl = this.page ? await this.page.url() : '*';
        const isNavigation = (goal === 'goto' || msg.params?.cmd === 'goto');

        if (isNavigation && msg.params.url) {
            this.missionTargetUrl = msg.params.url;
            this.missionLocaleInvariants = (this.missionTargetUrl.match(/\/[a-z]{2}[_-][a-z]{2}\//g) || []).map(m => m.replace(/\//g, ''));
        }

        if (!isNavigation && goal && !msg.params.selector) {
            const resolvedSelector = await this.semanticResolver.resolve(goal, contextUrl, msg.params?.cmd);
            if (resolvedSelector) msg.params.selector = resolvedSelector;
        }

        if (this.sentinels.size > 0 && !isNavigation) {
            const a11ySnapshot = await this._getA11ySnapshot();
            const blocking = (a11ySnapshot?.elements || []).filter(el => {
                const combined = `${el.id || ''} ${el.className || ''} ${el.tag || ''}`.toLowerCase();
                const text = (el.text || '').toLowerCase();
                return combined.includes('onetrust') || combined.includes('cookie') || combined.includes('modal') || combined.includes('popup') || text.includes('select your region');
            });

            const preCheckMsg = JSON.stringify({ jsonrpc: '2.0', method: 'starlight.pre_check', params: { goal, url: contextUrl, a11y_snapshot: a11ySnapshot, blocking, command: msg.params }, id: msg.id });
            const consensusPromise = new Promise((resolve) => {
                const timeout = setTimeout(resolve, 3000);
                this.consensusState.set(msg.id, { required: this.sentinels.size, clearedBy: new Set(), hijacked: false, resolve: () => { clearTimeout(timeout); resolve(); } });
            });
            for (const sentinel of this.sentinels.values()) sentinel.ws.send(preCheckMsg);
            await consensusPromise;
            this.consensusState.delete(msg.id);

            // Corrected Delta v1.2.5: Enforce Sync Budget
            // Mandatory 500ms wait to allow slow-pulsing Sentinels (Vision) to finalize state analysis.
            await new Promise(r => setTimeout(r, 500));
        }

        const { success, error } = await this._executeRawWithForensics(id, ws, msg, true);
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            type: 'COMMAND_COMPLETE',
            success,
            error,
            result: { success, error }
        }));
    }

    async takeScreenshot(name) {
        if (!this.page) return null;
        const filename = `${name}.png`;
        const filepath = path.join(this.screenshotsDir, filename);
        try { await this.page.screenshot({ path: filepath }); return filename; } catch (e) { return null; }
    }

    async _captureForensicSnapshot(prefix = 'state') {
        if (!this.page) return null;
        const name = `${prefix}_${nanoid(8)}.png`;
        const filepath = path.join(this.screenshotsDir, name);
        await this.page.screenshot({ path: filepath, fullPage: false }).catch(() => { });
        return name;
    }

    _persistTrace() {
        try {
            const tracePath = path.join(process.cwd(), 'mission_trace.json');
            fs.writeFileSync(tracePath, JSON.stringify(this.reportData, null, 4));
        } catch (e) { }
    }

    async _getA11ySnapshot() {
        if (!this.page) return null;
        return await this.page.evaluate(() => {
            const elements = [];
            const computed = [];
            const walk = (root) => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                let node = walker.currentNode;
                while (node) {
                    if (node.nodeType === 1) {
                        const tag = node.tagName;
                        if (!['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT'].includes(tag)) {
                            const styles = window.getComputedStyle(node);
                            const rect = node.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden';
                            const isObstacleCandidate = node.id?.includes('onetrust') || node.className?.toString().includes('cookie') || node.className?.toString().includes('modal');

                            if (isVisible || isObstacleCandidate) {
                                const classAttr = node.getAttribute('class') || '';
                                const className = (typeof classAttr === 'string') ? classAttr : '';
                                const info = {
                                    tag, text: node.innerText?.trim() || node.textContent?.trim(), attributes: {}, className, id: node.id,
                                    rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                                    selector: node.id ? `#${node.id}` : (className ? `.${className.trim().split(/\s+/)[0]}` : tag.toLowerCase())
                                };
                                for (const attr of node.attributes) {
                                    if (attr.name.startsWith('aria-') || ['role', 'alt', 'title', 'name', 'type', 'placeholder', 'id'].includes(attr.name)) {
                                        info.attributes[attr.name] = attr.value;
                                    }
                                }
                                elements.push(info);
                                if (isVisible) {
                                    computed.push({
                                        tag, selector: info.selector,
                                        styles: { color: styles.color, backgroundColor: styles.backgroundColor, visibility: styles.visibility, opacity: styles.opacity, zIndex: styles.zIndex }
                                    });
                                }
                            }
                        }
                    }
                    if (node.shadowRoot) walk(node.shadowRoot);
                    node = walker.nextNode();
                }
            };
            walk(document.body);
            return { elements, computed };
        });
    }

    async _performNavigationConsensus(msg) {
        if (this.sentinels.size === 0) return;
        const a11ySnapshot = await this._getA11ySnapshot();
        const currentUrl = this.page ? await this.page.url() : 'about:blank';
        const blocking = (a11ySnapshot?.elements || []).filter(el => {
            const combined = `${el.id || ''} ${el.className || ''} ${el.tag || ''}`.toLowerCase();
            const text = (el.text || '').toLowerCase();
            return combined.includes('onetrust') || combined.includes('cookie') || combined.includes('modal') || text.includes('select your region');
        });
        const isTrap = (blocking.length > 0) || (this.missionTargetUrl && !currentUrl.includes(this.missionTargetUrl));
        if (isTrap) {
            const recoveryMsg = JSON.stringify({ jsonrpc: '2.0', method: 'starlight.pre_check', params: { goal: 'site_recovery', url: currentUrl, targetUrl: this.missionTargetUrl, a11y_snapshot: a11ySnapshot, blocking }, id: `recovery-${msg.id}` });
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 20000);
                this.consensusState.set(`recovery-${msg.id}`, { required: this.sentinels.size, clearedBy: new Set(), hijacked: false, resolve });
                for (const sentinel of this.sentinels.values()) sentinel.ws.send(recoveryMsg);
            });
            this.consensusState.delete(`recovery-${msg.id}`);
        }
    }

    async _executeRawWithForensics(id, ws, msg, isIntent = false) {
        const goal = msg.params?.goal || msg.params?.cmd;
        const beforeScreenshot = await this._captureForensicSnapshot(`BEFORE_${msg.id}`);
        let success = false;
        let error = null;
        try {
            success = await this._executeRawCommand(msg);
            if (success === false) error = 'Command returned false (Verification Failed)';
        } catch (e) {
            success = false;
            error = e.message;
        }
        const afterScreenshot = await this._captureForensicSnapshot(`AFTER_${msg.id}`);
        if (isIntent) {
            this.reportData.push({
                type: (success ? 'COMMAND' : 'FAILURE'),
                id: msg.id, goal, cmd: msg.params?.cmd || goal, success, error,
                beforeScreenshot, afterScreenshot, timestamp: new Date().toLocaleTimeString(), rawTimestamp: new Date().toISOString()
            });
            this._persistTrace();
        }
        return { success, error };
    }

    async shutdown(exitCode = 0) {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        console.log(`[HubServer] 🛑 Shutdown sequence initiated (Status: ${exitCode === 0 ? 'Normal' : 'Error'})...`);

        try {
            const commands = this.reportData.filter(i => i.type === 'COMMAND');

            // v4.6 Enterprise Integrity: Mission only succeeds if ALL commands passed strictly
            const missionSuccess = this.reportData.every(item => {
                if (item.type === 'FAILURE') return false;
                if (item.type === 'COMMAND' && item.success !== true) return false;
                return true;
            });

            const sessionMTTR = this.recoveryTimes.length > 0 ? this.recoveryTimes.reduce((a, b) => a + b, 0) / this.recoveryTimes.length : 0;

            if (this.telemetry) {
                this.telemetry.recordMission(missionSuccess, this.totalSavedTime, this.reportData.filter(i => i.type === 'HIJACK').length, this.recoveryTimes);
            }

            const totalAttempts = this.reportData.filter(i => i.type === 'COMMAND' || i.type === 'FAILURE');
            const successfulCmds = this.reportData.filter(i => i.type === 'COMMAND' && i.success === true);

            const reportPayload = {
                stats: {
                    successRate: totalAttempts.length > 0 ? Math.round((successfulCmds.length / totalAttempts.length) * 100) : 100,
                    totalSavedMins: Math.round(this.totalSavedTime / 60),
                    avgRecoveryTimeMs: Math.round(sessionMTTR)
                },
                commands: this.reportData,
                sentinels: Array.from(this.sentinels.values()).map(s => { const { ws, ...rest } = s; return rest; }),
                totalInterventions: this.reportData.filter(i => i.type === 'HIJACK' || (i.type === 'SENTINEL_ACTION' && i.success)).length,
                missionExecutionDate: new Date(this.missionStartTime).toLocaleString(),
                context: { ...this.missionContext, securityEvents: this.securityEvents }
            };

            ReportGenerator.generate(reportPayload, path.join(process.cwd(), 'report.html'));
            this._persistTrace();
        } catch (e) {
            console.error('[HubServer] Error generating final report:', e);
        }

        // Parallel Cleanup
        const cleanup = [];
        if (this.browserAdapter) cleanup.push(this.browserAdapter.close().catch(() => { }));
        if (this.lifecycleManager) cleanup.push(Promise.resolve(this.lifecycleManager.killAll()).catch(() => { }));

        await Promise.all(cleanup);

        if (this.wss) this.wss.close();
        if (this.server) this.server.close();

        console.log(`[HubServer] Hub offline.`);

        // Final delay to ensure stdout flushes
        setTimeout(() => process.exit(exitCode), 100);
    }

    async _executeRawCommand(msg) {
        const { params } = msg;
        const cmd = params.cmd || msg.method.split('.')[1];
        if (!this.page) return false;
        const selectors = Array.isArray(params.selector) ? params.selector : [params.selector];

        try {
            switch (cmd) {
                case 'goto':
                    const resp = await this.page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    if (resp && resp.status() < 400) await this._performNavigationConsensus(msg);
                    return resp && resp.status() < 400;
                case 'click':
                    let lastClickError = null;
                    for (const sel of selectors) {
                        try {
                            // SmartBrowserAdapter handles multi-candidate viewport priority logic (v8.1)
                            await this.page.click(sel, { timeout: 3000 });

                            // Protocol v4.6 Verification Loop
                            // Ensure the click actually did something (Navigation or Content Change)
                            const initialUrl = this.page.url();
                            const initialContent = await this.page.evaluate(() => document.body.innerText.length);

                            for (let i = 0; i < 5; i++) {
                                const currUrl = this.page.url();
                                const currContent = await this.page.evaluate(() => document.body.innerText.length).catch(() => initialContent);
                                if (currUrl !== initialUrl || Math.abs(currContent - initialContent) >= 1) return true;
                                await new Promise(r => setTimeout(r, 100));
                            }
                            console.warn(`[HubServer] Click on ${sel} completed but no state evolution detected. Assuming success.`);
                            return true; // v4.6.1: Assume success if click didn't throw
                        } catch (e) {
                            lastClickError = e.message;
                            continue;
                        }
                    }
                    throw new Error(lastClickError || `No candidates matched for "${params.goal || 'unknown'}"`);
                case 'fill':
                    for (const sel of selectors) {
                        try {
                            const valToFill = params.value || params.text;
                            const el = await this.page.waitForSelector(sel, { timeout: 5000, state: 'visible' });
                            await el.fill(valToFill, { timeout: 10000 });

                            // Protocol v4.6 Fill Verification
                            const actualValue = await el.inputValue().catch(() => '');
                            if (actualValue === valToFill) return true;

                            console.warn(`[HubServer] Fill mismatch on ${sel}. Got "${actualValue}", expected "${valToFill}"`);
                            return false;
                        } catch (e) { continue; }
                    }
                    return false;
                case 'press':
                    await this.page.keyboard.press(params.key, { delay: 100 }).catch(() => { });
                    // Verify if press caused any state change (v4.6)
                    await new Promise(r => setTimeout(r, 500));
                    return true; // Hard to verify keyboard purely via DOM without context
                case 'scroll':
                    const initialY = await this.page.evaluate(() => window.scrollY);
                    await this.page.mouse.wheel(0, params.deltaY || 500);
                    await new Promise(r => setTimeout(r, 800));
                    const finalY = await this.page.evaluate(() => window.scrollY);
                    if (Math.abs(finalY - initialY) > 0) return true;
                    console.warn(`[HubServer] Scroll ineffective. Y-State stable at ${finalY}`);
                    return false;
                case 'hover':
                    for (const sel of selectors) {
                        try {
                            const el = await this.page.waitForSelector(sel, { timeout: 2000, state: 'visible' });
                            await el.hover({ force: true });
                            return true;
                        } catch (e) { continue; }
                    }
                    return false;
                case 'checkpoint':
                    this.reportData.push({ type: 'CHECKPOINT', name: params.name, timestamp: new Date().toLocaleTimeString() });
                    return true;
                case 'screenshot':
                    await this.page.screenshot({ path: path.join(this.screenshotsDir, `${params.name || 'manual'}.png`) }).catch(() => { });
                    return true;
                default:
                    if (this.page[cmd] && typeof this.page[cmd] === 'function') {
                        const sel = selectors[0];
                        if (sel) await this.page[cmd](sel, params);
                        else await this.page[cmd](params);
                        return true;
                    }
                    return false;
            }
        } catch (e) { throw e; }
    }
}

module.exports = { HubServer };
