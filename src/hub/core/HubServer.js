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
        this.server = http.createServer((req, res) => this._handleHealthCheck(req, res));
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
        this.missionContext = {}; // Aggregated Sentinel reports
        this.securityEvents = []; // SOC 2 Forensic Trace
        this.screenshotsDir = path.join(process.cwd(), 'screenshots');
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
        console.log(`[HubServer] Launching browser engine...`);
        await this.browserAdapter.launch({ headless: this.headless });
        this.page = await this.browserAdapter.newPage();

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
            console.log(`[HubServer] ✓ Starlight Protocol READY.`);
        });

        this.wss.on('connection', (ws) => this._handleConnection(ws));

        // 4. Lifecycle Hooks
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', async (err) => {
            console.error('[HubServer] UNCAUGHT EXCEPTION:', err);
            await this.shutdown();
        });
    }

    _loadRawConfig() {
        const configPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        return {};
    }

    _handleHealthCheck(req, res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', protocol: 'Starlight v4.0' }));
    }

    _handleConnection(ws) {
        const id = nanoid(12);
        console.log(`[HubServer] New connection attempt: ${id}`);

        ws.on('message', async (data) => {
            try {
                const rawMsg = JSON.parse(data.toString());
                // Enhanced Security Bridge (IpcBridge v4.0)
                const safeMsg = this.ipcBridge.processMessage(rawMsg);
                if (!safeMsg) return;

                await this._handleMessage(id, ws, safeMsg);
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
            } else {
                console.log(`[HubServer] Client disconnected: ${id}`);
            }
            this.sentinels.delete(id);
        });
    }

    async _handleMessage(id, ws, msg) {
        if (msg.method === 'starlight.pulse') {
            return; // Heartbeat handled silently
        }

        this.auditLogger.log('ipc_receive', msg);

        if (msg.method === 'starlight.registration') {
            const challenge = nanoid(16);
            this.pendingSentinels.set(id, { ...msg.params, challenge, ws });

            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                result: {
                    success: true,
                    assignedId: id,
                    challenge: challenge
                }
            }));
            return;
        }

        if (msg.method === 'starlight.challenge_response') {
            const pending = this.pendingSentinels.get(id);
            if (pending && pending.challenge === msg.params.response) {
                // Sanitize sentinel object for history/report (remove ws)
                const { ws: _, ...sentinelInfo } = pending;
                const sentinelRecord = { ...sentinelInfo, id };

                this.sentinels.set(id, { ...pending, layer: pending.layer });
                this.sentinelHistory.push(sentinelRecord);

                console.log(`[HubServer] Verified Sentinel: ${pending.layer}`);

                ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    id: msg.id,
                    result: { success: true }
                }));
            } else {
                console.warn(`[HubServer] Handshake Failed for client ${id}`);
                ws.close();
            }
            return;
        }

        if (msg.method === 'starlight.intent') {
            await this._processIntent(id, ws, msg);
        } else if (msg.method === 'starlight.context_update') {
            // High-fidelity mission state tracking
            this.missionContext = { ...this.missionContext, ...(msg.params?.context || {}) };
            this.auditLogger.log('context_update', msg.params?.context);
        } else if (msg.method === 'starlight.clear') {
            // Consensus signaling from Sentinels (Multi-mode mapping v4.0)
            const clearedId = msg.params?.id || msg.id;
            const consensus = this.consensusState.get(clearedId);
            if (consensus) {
                consensus.clearedBy.add(id);
                if (consensus.clearedBy.size >= consensus.required) {
                    consensus.resolve();
                }
            }
        } else if (msg.method === 'starlight.shutdown' || msg.method === 'starlight.finish') {
            const reason = msg.params?.reason || 'Mission End';
            console.log(`[HubServer] Protocol Termination Trigger: ${reason}`);
            await this.shutdown();
        }
    }

    async _processIntent(id, ws, msg) {
        const goal = msg.params?.goal || msg.params?.cmd || 'Intent';
        const contextUrl = this.page ? await this.page.url() : '*';

        console.log(`[HubServer] Processing Intent: ${goal} (${msg.id})`);

        // 1. Resolve Semantic Goal (Skip for raw commands like GOTO)
        const isNavigation = (goal === 'goto' || msg.params?.cmd === 'goto');
        let resolvedSelector = null;

        if (!isNavigation && goal && !msg.params.selector) {
            resolvedSelector = await this.semanticResolver.resolve(goal, contextUrl, msg.params?.cmd);
            if (resolvedSelector) {
                msg.params.selector = resolvedSelector;
                console.log(`[HubServer] Resolved goal "${goal}" to ${resolvedSelector}`);
            }
        }

        // 2. Protocol Consensus (PRE-CHECK BROADCAST) - Skip for GOTO to reduce latency
        if (this.sentinels.size > 0 && !isNavigation) {
            console.log(`[HubServer] Broadcasting pre_check for consensus (N=${this.sentinels.size})...`);

            // Generate A11y Snapshot for Sentinels
            const a11ySnapshot = await this._getA11ySnapshot();

            const preCheckMsg = JSON.stringify({
                jsonrpc: '2.0',
                method: 'starlight.pre_check',
                params: {
                    goal,
                    url: contextUrl,
                    a11y_snapshot: a11ySnapshot,
                    command: msg.params
                },
                id: msg.id
            });

            const consensusPromise = new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log(`[HubServer] Consensus Timeout for ${msg.id}. Proceeding with partial clearance.`);
                    resolve();
                }, 2000); // Optimized Phase 8: 2s budget for consensus

                this.consensusState.set(msg.id, {
                    required: this.sentinels.size,
                    clearedBy: new Set(),
                    resolve: () => {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });

            // Broadcast to all Sentinels
            for (const sentinel of this.sentinels.values()) {
                sentinel.ws.send(preCheckMsg);
            }

            await consensusPromise;
            this.consensusState.delete(msg.id);
        }

        // 3. Visual Reporting: BEFORE State
        let beforeScreenshot = null;
        if (!isNavigation || contextUrl !== 'about:blank' || this.reportData.length === 0) {
            console.log(`[HubServer] Capturing BEFORE screenshot...`);
            beforeScreenshot = await this.takeScreenshot(`BEFORE_${msg.id}`);
        }

        // 4. Command Execution
        let success = false;
        let auditError = null;
        try {
            console.log(`[HubServer] Executing raw command: ${goal}`);
            success = await this._executeRawCommand(msg);
            if (success && msg.params?.selector) {
                await this.semanticResolver.learn(goal, msg.params.selector, contextUrl);
            }
        } catch (e) {
            console.error(`[HubServer] Execution Error:`, e.stack || e.message);
            success = false;
            auditError = e.message;
        }

        // 5. Visual Reporting: AFTER State
        console.log(`[HubServer] Capturing AFTER screenshot (waiting for stability)...`);
        // v4.0.28: Settlement Grace Period to ensure page is fully rendered
        await this.page.waitForTimeout(1000).catch(() => { });
        const afterScreenshot = await this.takeScreenshot(`AFTER_${msg.id}`);

        // 6. Build Report Entry
        const now = new Date();
        // Machines local time with AM/PM for forensics
        const localTimestamp = now.toLocaleTimeString('en-US', { hour12: true });
        const rawTimestamp = now.toISOString(); // Hidden for latency calc

        this.reportData.push({
            id: msg.id,
            goal: isNavigation ? null : goal, // Avoid showing 'goto' as a semantic goal
            cmd: msg.params?.cmd || goal,
            selector: resolvedSelector || msg.params?.selector,
            success,
            beforeScreenshot,
            afterScreenshot,
            timestamp: localTimestamp,
            rawTimestamp: rawTimestamp
        });

        // 7. Respond (SDK COMPLIANCE)
        if (success) {
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                type: 'COMMAND_COMPLETE',
                success: true,
                result: { success: true, beforeScreenshot, afterScreenshot, timestamp: localTimestamp }
            }));
        } else {
            const reason = auditError || `Command "${goal}" failed interaction verification or stability check.`;
            this.auditLogger.log('command_fail', { id: msg.id, error: reason }, 'error');
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                type: 'COMMAND_COMPLETE',
                success: false,
                error: { code: -32000, message: reason },
                result: { success: false, beforeScreenshot, afterScreenshot, timestamp: localTimestamp }
            }));
        }
    }

    async takeScreenshot(name) {
        if (!this.page) return null;
        const filename = `${name}.png`;
        const filepath = path.join(this.screenshotsDir, filename);
        await this.page.screenshot({ path: filepath });
        return filename;
    }

    async _getA11ySnapshot() {
        if (!this.page) return null;
        return await this.page.evaluate(() => {
            const elements = [];
            const computed = [];

            // Recursive walk to capture meaningful elements
            const walk = (root) => {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                let node = walker.currentNode;
                while (node) {
                    const tag = node.tagName;
                    const styles = window.getComputedStyle(node);
                    const rect = node.getBoundingClientRect();

                    if (rect.width > 0 && rect.height > 0) {
                        // Protocol Stabilization: Safely handle class names (SVG compatibility)
                        const classAttr = node.getAttribute('class') || '';
                        const className = (typeof classAttr === 'string') ? classAttr : '';

                        const info = {
                            tag,
                            text: node.innerText?.trim() || node.textContent?.trim(),
                            attributes: {},
                            selector: node.id ? `#${node.id}` : (className ? `.${className.trim().split(/\s+/).join('.')}` : tag.toLowerCase())
                        };

                        // Extract relevant attributes
                        for (const attr of node.attributes) {
                            if (attr.name.startsWith('aria-') || ['role', 'alt', 'title', 'name', 'type', 'placeholder', 'id'].includes(attr.name)) {
                                info.attributes[attr.name] = attr.value;
                            }
                        }

                        elements.push(info);

                        // Capture styles for contrast/visibility checks
                        computed.push({
                            tag,
                            selector: info.selector,
                            styles: {
                                color: styles.color,
                                backgroundColor: styles.backgroundColor,
                                fontSize: styles.fontSize,
                                outline: styles.outline,
                                boxShadow: styles.boxShadow,
                                visibility: styles.visibility,
                                opacity: styles.opacity
                            }
                        });
                    }

                    if (node.shadowRoot) walk(node.shadowRoot);
                    node = walker.nextNode();
                }
            };

            walk(document.body);
            return { elements, computed };
        });
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        console.log(`[HubServer] 🛑 Shutdown initiated...`);

        // 1. Generate Final Report (Truthful Mission Forensics)
        console.log(`[HubServer] Generating mission forensics...`);
        const reportPayload = {
            commands: this.reportData,
            sentinels: this.sentinelHistory,
            context: { ...this.missionContext, securityEvents: this.securityEvents }
        };
        const reportPath = path.join(process.cwd(), 'report.html');
        ReportGenerator.generate(reportPayload, reportPath);
        console.log(`[HubServer] ✓ Report successfully generated at: ${reportPath}`);

        // 2. Graceful Resource Cleanup
        if (this.browserAdapter) {
            await this.browserAdapter.close().catch(() => { });
        }

        if (this.lifecycleManager) {
            this.lifecycleManager.killAll();
        }

        // 3. Network Termination
        this.wss.close();
        this.server.close();

        console.log(`[HubServer] Shutdown complete. Exit code 0.`);
        process.exit(0);
    }

    async _processDirectCommand(id, ws, msg) {
        try {
            const success = await this._executeRawCommand(msg);
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                type: 'COMMAND_COMPLETE', // SDK COMPLIANCE
                success,
                result: { success }
            }));
        } catch (e) {
            console.error(`[HubServer] Direct Command Error:`, e.stack || e.message);
            ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: msg.id,
                type: 'COMMAND_COMPLETE',
                success: false,
                error: e.message
            }));
        }
    }

    async _executeRawCommand(msg) {
        const { method, params } = msg;
        const cmd = (method === 'starlight.intent') ? params.cmd : method.split('.')[1];
        const goal = params.goal || cmd;

        if (!this.page) return false;

        // v4.1: Handle Tiered Selectors (Prioritized Array)
        const selectors = Array.isArray(params.selector) ? params.selector : [params.selector];

        try {
            switch (cmd) {
                case 'goto':
                    console.log(`[HubServer] Navigating to: ${params.url}`);
                    const response = await this.page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    return response && response.status() < 400;

                case 'click':
                    for (const selector of selectors) {
                        try {
                            console.log(`[HubServer] Attempting click on tier: ${selector}`);
                            const el = await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });

                            const initialUrl = await this.page.url();
                            const initialContent = await this.page.evaluate(() => document.body.innerText.length);

                            await el.click({ timeout: 10000 });

                            // Phase 18: Sovereign Interaction Loop
                            const lowerGoal = goal.toLowerCase() || '';
                            const isSubmission = lowerGoal.includes('login') || lowerGoal.includes('submit') || lowerGoal.includes('continue') || lowerGoal.includes('finish') || lowerGoal.includes('add to cart') || lowerGoal.includes('checkout');

                            const checkState = async () => {
                                const norm = (u) => String(u || '').replace(/\/$/, '');
                                const finalUrl = await this.page.url();
                                const finalContent = await this.page.evaluate(() => document.body.innerText.length);
                                const hasInventory = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container, #checkout_summary_container, .checkout_complete_container')).catch(() => false);
                                return { hasInventory, urlChanged: norm(finalUrl) !== norm(initialUrl), contentChanged: Math.abs(finalContent - initialContent) > 20 };
                            };

                            let state = await checkState();
                            if (isSubmission && !state.hasInventory && !state.urlChanged && !state.contentChanged) {
                                console.log(`[HubServer] Interaction on tier "${selector}" ineffective. Initiating robust fallback sequence...`);

                                // 1. Stabilization + Retry Click
                                await this.page.waitForTimeout(1000);
                                await el.click({ timeout: 5000 }).catch(() => { });

                                state = await checkState();
                                if (!state.hasInventory && !state.urlChanged) {
                                    console.log(`[HubServer] Retried click failed on tier "${selector}". Attempting Keyboard Enter fallback...`);
                                    await el.press('Enter').catch(() => { });
                                    await this.page.waitForTimeout(2000);

                                    state = await checkState();
                                    if (!state.hasInventory && !state.urlChanged) {
                                        console.log(`[HubServer] Keyboard fallback failed. Attempting final dispatchEvent...`);
                                        await el.dispatchEvent('click').catch(() => { });
                                        await this.page.waitForTimeout(2000);
                                        state = await checkState();
                                    }
                                }
                            }

                            if (state.hasInventory || state.urlChanged || state.contentChanged || !isSubmission) {
                                console.log(`[HubServer] ✅ Click success on tier: ${selector}`);
                                return true;
                            }
                        } catch (e) {
                            const isTimeout = e.message.includes('timeout') || e.message.includes('Timeout');
                            console.warn(`[HubServer] Tier ${isTimeout ? 'TIMED OUT' : 'FAILED'}: ${selector} - ${e.message}`);
                            continue;
                        }
                    }
                    return false;

                case 'fill':
                    const valToFill = params.value ?? params.text;
                    if (valToFill === undefined) return false;

                    for (const selector of selectors) {
                        try {
                            console.log(`[HubServer] Attempting fill on tier: ${selector}`);
                            const fillEl = await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
                            await fillEl.fill(valToFill, { timeout: 10000 });

                            // Verification
                            let verifiedValue = '';
                            for (let i = 0; i < 5; i++) {
                                verifiedValue = await fillEl.inputValue().catch(() => '');
                                if (verifiedValue === valToFill) return true;
                                await this.page.waitForTimeout(200);
                            }
                        } catch (e) {
                            console.warn(`[HubServer] Fill tier failed: ${selector}`);
                            continue;
                        }
                    }
                    return false;

                case 'press':
                    const key = params.key || params.value;
                    if (!key) return false;

                    for (const selector of selectors) {
                        try {
                            console.log(`[HubServer] Attempting press on tier: ${selector}`);
                            await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
                            await this.page.press(selector, key, { timeout: 10000 });
                            return true;
                        } catch (e) {
                            console.warn(`[HubServer] Press tier failed: ${selector}`);
                            continue;
                        }
                    }
                    return false;

                default:
                    // Protocol Fallback: Generic Page Methods (Sovereign Engine v4.0)
                    if (this.page[cmd] && typeof this.page[cmd] === 'function') {
                        console.log(`[HubServer] Routing to generic page method: ${cmd}`);
                        const selector = selectors[0];
                        if (selector) {
                            await this.page[cmd](selector, params).catch(e => {
                                console.warn(`[HubServer] Generic command "${cmd}" failed on selector: ${e.message}`);
                                throw e;
                            });
                        } else {
                            await this.page[cmd](params).catch(e => {
                                console.warn(`[HubServer] Generic command "${cmd}" failed: ${e.message}`);
                                throw e;
                            });
                        }
                        return true;
                    }
                    console.warn(`[HubServer] Unhandled command: ${cmd}`);
                    return false;
            }
        } catch (e) {
            console.error(`[HubServer] Execution Error (${cmd}):`, e.stack || e.message);
            this.auditLogger.log('exec_fail', { cmd, error: e.message }, 'error');
            throw e;
        }
    }
}

module.exports = { HubServer };
