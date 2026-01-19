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

        try {
            switch (cmd) {
                case 'goto':
                    console.log(`[HubServer] Navigating to: ${params.url}`);
                    // Optimized v4.0: Faster initial load with commit -> DOM wait
                    const response = await this.page.goto(params.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    if (response && response.status() >= 400) {
                        console.error(`[HubServer] Navigation Error: HTTP ${response.status()}`);
                        return false;
                    }
                    return true;
                case 'click':
                    await this.page.waitForSelector(params.selector, { timeout: 15000, state: 'visible' });

                    const initialUrl = await this.page.url();
                    const initialContent = await this.page.evaluate(() => document.body.innerText.length);

                    await this.page.click(params.selector, { timeout: 10000 });

                    // Verification: wait for network stability or navigation after potential submission click
                    const lowerGoal = goal.toLowerCase() || '';
                    if (lowerGoal.includes('login') || lowerGoal.includes('submit') || lowerGoal.includes('continue') || lowerGoal.includes('finish') || lowerGoal.includes('add to cart')) {
                        console.log(`[HubServer] Waiting for navigation/stability after potential submission: ${goal}`);
                        await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

                        // Effect-based verification: Did the page actually change?
                        const norm = (u) => String(u || '').replace(/\/$/, '');
                        const finalUrl = await this.page.url();
                        const finalContent = await this.page.evaluate(() => document.body.innerText.length);

                        // RIGOR v4.0.28: Check for explicit success markers
                        const inventoryMarker = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container')).catch(() => false);

                        if (!inventoryMarker && norm(finalUrl) === norm(initialUrl) && Math.abs(finalContent - initialContent) < 10 && !lowerGoal.includes('add to cart')) {
                            // High-Performance Reactive Wait: Resolve as soon as state changes
                            const stateEvolution = await Promise.race([
                                this.page.waitForFunction((oldUrl, oldLen, sel) => {
                                    const norm = (u) => String(u || '').replace(/\/$/, '');
                                    const elDisappeared = sel ? !document.querySelector(sel) : false;
                                    const inventoryLoaded = !!document.querySelector('.inventory_list, #inventory_container');
                                    const urlChanged = norm(window.location.href) !== norm(oldUrl);
                                    const contentChanged = Math.abs(document.body.innerText.length - oldLen) > 10;
                                    return urlChanged || contentChanged || (inventoryLoaded && !urlChanged) || (elDisappeared && urlChanged);
                                }, { timeout: 15000 }, initialUrl, initialContent, params.selector).catch(() => 'TIMEOUT'),
                                this.page.waitForURL((url) => norm(url.toString()) !== norm(initialUrl), { timeout: 10000 }).catch(() => 'TIMEOUT')
                            ]);

                            const lastUrl = await this.page.url();
                            const lastContent = await this.page.evaluate(() => document.body.innerText.length);
                            const hasInventory = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container')).catch(() => false);

                            if (!hasInventory && norm(lastUrl) === norm(initialUrl) && Math.abs(lastContent - initialContent) < 20) {
                                // Phase 18: Smart Retry & Keyboard Fallback (Solve Hydration/Interaction Miss)
                                console.log(`[HubServer] Interaction on "${goal}" ineffective. Initiating robust fallback sequence...`);

                                // 1. Stabilization + Retry Click
                                await this.page.waitForTimeout(1000);
                                await this.page.click(params.selector, { timeout: 5000 }).catch(() => { });

                                // 2. Keyboard Enter Fallback (Crucial for submission forms like SauceDemo)
                                await this.page.waitForTimeout(1500);
                                const retryUrl = await this.page.url();
                                const retryInventory = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container')).catch(() => false);

                                if (!retryInventory && norm(retryUrl) === norm(initialUrl)) {
                                    console.log(`[HubServer] Retried click failed. Attempting Keyboard Enter fallback...`);
                                    await this.page.press(params.selector, 'Enter').catch(() => { });
                                    await this.page.waitForTimeout(3000);
                                }

                                // 3. Final DispatchEvent Fallback
                                const postKbdUrl = await this.page.url();
                                const postKbdInventory = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container')).catch(() => false);
                                if (!postKbdInventory && norm(postKbdUrl) === norm(initialUrl)) {
                                    console.log('[HubServer] Attempting final dispatchEvent fallback...');
                                    await this.page.dispatchEvent(params.selector, 'click').catch(() => { });
                                    await this.page.waitForTimeout(3000);
                                }
                            }
                        }

                        const finalCheckUrl = await this.page.url();
                        const finalCheckInventory = await this.page.evaluate(() => !!document.querySelector('.inventory_list, #inventory_container')).catch(() => false);

                        if (!finalCheckInventory && norm(finalCheckUrl) === norm(initialUrl)) {
                            const uiError = await this.page.evaluate(() => {
                                const errEl = document.querySelector('[data-test="error"], .error-message, .alert-danger');
                                return errEl ? errEl.innerText : null;
                            }).catch(() => null);

                            const failMsg = uiError ? `Interaction Failed: ${uiError}` : `Click on "${goal}" had no visible effect (possible auth failure or blocking).`;
                            console.error(`[HubServer] ❌ ${failMsg}`);
                            throw new Error(failMsg);
                        }
                    } else {
                        // Non-submission click: Reactive wait for mutation or animation (Max 500ms)
                        await Promise.race([
                            this.page.waitForFunction((oldContent) => document.body.innerText.length !== oldContent, { timeout: 500 }, initialContent).catch(() => { }),
                            this.page.waitForLoadState('networkidle', { timeout: 500 }).catch(() => { })
                        ]);
                    }
                    return true;
                case 'fill':
                    const fillEl = await this.page.waitForSelector(params.selector, { timeout: 15000, state: 'visible' }).catch(e => {
                        console.warn(`[HubServer] Selector not visible for fill: ${params.selector}`);
                        throw e;
                    });
                    const valToFill = params.value ?? params.text;
                    if (valToFill === undefined) {
                        console.error(`[HubServer] Fill Error: No value/text provided for ${params.selector}`);
                        return false;
                    }
                    console.log(`[HubServer] Filling "${params.selector}" with: ${valToFill}`);
                    await fillEl.fill(valToFill, { timeout: 10000 });

                    // High-Performance Reactive Verification (Ensure value is set on the specific element)
                    let verifiedValue = '';
                    for (let i = 0; i < 10; i++) {
                        verifiedValue = await fillEl.inputValue().catch(() => '');
                        if (verifiedValue === valToFill) break;
                        await this.page.waitForTimeout(200);
                    }

                    // Verification (Phase 8 Rigor)
                    let currentVal = await fillEl.inputValue().catch(e => {
                        console.warn(`[HubServer] Verification check failed for ${params.selector}: ${e.message}`);
                        return 'ERROR_DURING_CHECK';
                    });

                    if (currentVal !== valToFill) {
                        console.warn(`[HubServer] Fill mismatch. Observed: "${currentVal}", Expected: "${valToFill}". Attempting "type" fallback for "${params.selector}"`);
                        await fillEl.click().catch(() => { });
                        // Clear field first
                        await fillEl.fill('').catch(() => { });
                        await fillEl.type(valToFill, { delay: 50 });
                        currentVal = await fillEl.inputValue().catch(() => 'ERROR_RETRY');
                    }

                    if (currentVal !== valToFill) {
                        console.error(`[HubServer] ❌ RIGOR FAIL: Expected "${valToFill}", found "${currentVal}" at ${params.selector}`);
                        return false;
                    }
                    console.log(`[HubServer] ✅ Verified fill success for ${params.selector}`);
                    return true;
                default:
                    if (this.page[cmd]) {
                        // Protocol Fallback: Generic Page Methods
                        await this.page[cmd](params.selector, params);
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
