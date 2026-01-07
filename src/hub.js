const { chromium } = require('playwright');
const { WebSocketServer, WebSocket } = require('ws');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');
const TelemetryEngine = require('./telemetry');
const ActionRecorder = require('./recorder');
const WebhookNotifier = require('./webhook');
const http = require('http');
const https = require('https');

// Security: HTML escaping to prevent XSS
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
class CBAHub {
    constructor(port = 8080, headless = false) {
        // Load configuration
        this.config = this.loadConfig();
        this.headless = headless || this.config.hub?.headless || false;

        this.port = port || this.config.hub?.port || 8080;
        this.authToken = this.config.hub?.security?.authToken || null;

        // Create HTTP or HTTPS server based on SSL config
        const sslConfig = this.config.hub?.security?.ssl;
        const requestHandler = (req, res) => {
            if (req.url === '/health') {
                const status = {
                    status: 'healthy',
                    version: '3.0.3',
                    protocol: 'starlight/1.0.0',
                    uptime: process.uptime(),
                    sentinels: Array.from(this.sentinels?.values() || []).map(s => ({
                        layer: s.layer,
                        priority: s.priority,
                        capabilities: s.capabilities
                    })),
                    mission: {
                        active: (this.commandQueue?.length || 0) > 0 || this.isProcessing,
                        queueLength: this.commandQueue?.length || 0,
                        isLocked: this.isLocked || false
                    },
                    security: {
                        authEnabled: !!this.authToken,
                        sslEnabled: sslConfig?.enabled || false
                    }
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status, null, 2));
            } else {
                res.writeHead(404);
                res.end();
            }
        };

        if (sslConfig?.enabled && sslConfig.keyPath && sslConfig.certPath) {
            const sslOptions = {
                key: fs.readFileSync(sslConfig.keyPath),
                cert: fs.readFileSync(sslConfig.certPath)
            };
            this.server = https.createServer(sslOptions, requestHandler);
            console.log('[CBA Hub] SSL enabled - using WSS (secure WebSocket)');
        } else {
            this.server = http.createServer(requestHandler);
        }

        this.wss = new WebSocketServer({ server: this.server });
        this.browser = null;
        this.page = null;
        this.sentinels = new Map();
        this.isLocked = false;
        this.lockOwner = null;
        this.lockTimeout = null;
        this.commandQueue = [];
        this.pendingRequests = new Map();
        this.heartbeatTimeout = this.config.hub?.heartbeatTimeout || 5000;
        this.systemHealthy = true;
        this.reportData = [];
        this.screenshotsDir = path.join(process.cwd(), 'screenshots');
        this.totalSavedTime = 0;
        this.hijackStarts = new Map();
        this.lastEntropyBroadcast = 0;
        this.sovereignState = {};
        this.missionTrace = [];
        this.historicalMemory = new Map();
        this.historicalAuras = new Set();
        this.missionStartTime = null;
        this.isProcessing = false;
        this.isShuttingDown = false;
        this.recorder = new ActionRecorder();  // Phase 13.5: Test Recorder

        if (!fs.existsSync(this.screenshotsDir)) fs.mkdirSync(this.screenshotsDir);

        this.cleanupScreenshots();
        this.loadHistoricalMemory();
        this.telemetry = new TelemetryEngine(path.join(process.cwd(), 'telemetry.json'));
        this.webhooks = new WebhookNotifier(this.config.webhooks);
        this.recoveryTimes = []; // Track recovery times for MTTR
        this.temporalMetrics = []; // Phase 17.4: Temporal Ghosting metrics
    }

    loadConfig() {
        const configPath = path.join(process.cwd(), 'config.json');
        try {
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (e) {
            console.warn('[CBA Hub] Warning: Could not load config.json:', e.message);
        }
        return {};
    }

    cleanupScreenshots() {
        const maxAge = this.config.hub?.screenshotMaxAge || 86400000; // 24h default
        const now = Date.now();
        try {
            const files = fs.readdirSync(this.screenshotsDir);
            let cleaned = 0;
            for (const file of files) {
                const filepath = path.join(this.screenshotsDir, file);
                const stat = fs.statSync(filepath);
                if (now - stat.mtimeMs > maxAge) {
                    fs.unlinkSync(filepath);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.log(`[CBA Hub] Cleanup: Removed ${cleaned} old screenshots.`);
            }
        } catch (e) {
            console.warn('[CBA Hub] Screenshot cleanup failed:', e.message);
        }
    }

    async setupNetworkInterception() {
        const networkConfig = this.config.network?.chaos || {};

        if (!networkConfig.enabled) {
            return;
        }

        console.log('[CBA Hub] Phase 9: Traffic Sovereign ENABLED');

        // Extract config values outside the callback to avoid scope issues
        const blockPatterns = networkConfig.blockPatterns || [];
        const latency = networkConfig.latencyMs || 0;

        await this.page.route('**/*', async (route) => {
            const url = route.request().url();

            // Check block patterns
            for (const pattern of blockPatterns) {
                if (url.includes(pattern)) {
                    console.log(`[CBA Hub] BLOCKED: ${url}`);
                    await route.abort('blockedbyclient');
                    return;
                }
            }

            // Apply latency if configured
            if (latency > 0) {
                await new Promise(r => setTimeout(r, latency));
            }

            // Continue with request
            await route.continue();
        });

        console.log(`[CBA Hub] Traffic rules: block=${blockPatterns.length} patterns, latency=${latency}ms`);
    }

    async init() {
        // Mission Safety Timeout from config
        const missionTimeout = this.config.hub?.missionTimeout || 180000;
        setTimeout(() => {
            console.warn("[CBA Hub] MISSION TIMEOUT REACHED. Closing browser...");
            this.shutdown();
        }, missionTimeout);

        // Initialize HTTP server
        this.server.listen(this.port, () => {
            console.log(`[CBA Hub] Starting Starlight Hub: The Hero's Journey...`);
            console.log(`[CBA Hub] WebSocket/HTTP Server listening on port ${this.port}`);
        });

        this.browser = await chromium.launch({ headless: this.headless });
        this.page = await this.browser.newPage();

        // Phase 9: Traffic Sovereign - Network Interception
        await this.setupNetworkInterception();

        this.wss.on('connection', (ws) => {
            const id = nanoid();
            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (!this.validateProtocol(msg)) {
                        console.error(`[CBA Hub] RECV INVALID PROTOCOL from ${id}:`, msg);
                        return;
                    }
                    if (msg.method !== 'starlight.pulse') {
                        console.log(`[CBA Hub] RECV: ${msg.method} from ${this.sentinels.get(id)?.layer || 'Unknown'}`);
                    }
                    await this.recordTrace('RECV', id, msg, msg.method === 'starlight.intent'); // Record snapshot for intents
                    await this.handleMessage(id, ws, msg);
                } catch (e) {
                    console.error(`[CBA Hub] Parse Error from ${id}:`, e.message);
                }
            });
            ws.on('close', () => this.handleDisconnect(id));
        });

        setInterval(() => this.checkSystemHealth(), 1000);

        // Setup the initial page with all handlers
        await this.setupPage();
    }

    /**
     * Setup page with all required handlers, observers, and exposed functions.
     * This is called both in init() and when creating a new page for recording.
     */
    async setupPage() {
        if (!this.page) return;

        this.page.on('dialog', async dialog => {
            console.log(`[CBA Hub] Auto-dismissing dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });

        // v2.0 Phase 3: Network Entropy Tracking
        this.page.on('request', () => this.broadcastEntropy());
        this.page.on('requestfinished', () => this.broadcastEntropy());
        this.page.on('requestfailed', () => this.broadcastEntropy());

        await this.page.addInitScript(() => {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    const node = mutation.target;
                    if (node.nodeType === 1) {
                        window.onMutation({
                            type: 'dom_mutation',
                            target: {
                                tagName: node.tagName,
                                className: node.className,
                                id: node.id,
                                visibility: window.getComputedStyle(node).display
                            }
                        });
                    }
                }
            });
            window.addEventListener('load', () => {
                observer.observe(document.body, {
                    childList: true, subtree: true, attributes: true,
                    attributeFilter: ['style', 'class']
                });
            });
        });

        try {
            await this.page.exposeFunction('onMutation', (mutation) => {
                // v2.0 Phase 3: Broadcast entropy on mutation
                this.broadcastEntropy();
                this.broadcastMutation(mutation);
            });
        } catch (e) {
            // Function might already be exposed in this context
        }
    }

    broadcastEntropy() {
        const now = Date.now();
        const throttle = this.config.hub?.entropyThrottle || 100;
        if (now - this.lastEntropyBroadcast < throttle) return;
        this.lastEntropyBroadcast = now;

        const msgObj = {
            jsonrpc: '2.0',
            method: 'starlight.entropy_stream',
            params: { entropy: true },
            id: nanoid()
        };
        const msg = JSON.stringify(msgObj);
        for (const ws of this.wss.clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
        // Record entropy for Phase 7.2 learning (Sync-safe fire and forget)
        this.recordTrace('SEND', 'System', msgObj);
    }
    async resolveSemanticIntent(goal) {
        // v2.1 Semantic Resolver: Scans for text matches or ARIA labels
        // Phase 9: Added Shadow DOM traversal support
        const shadowEnabled = this.config.hub?.shadowDom?.enabled !== false;
        const maxDepth = this.config.hub?.shadowDom?.maxDepth || 5;

        const target = await this.page.evaluate(({ goalText, shadowEnabled, maxDepth }) => {
            const normalizedGoal = goalText.toLowerCase();

            // Helper: Recursively collect elements from shadow roots
            function collectElements(root, selector, depth = 0) {
                if (depth > maxDepth) return [];
                let elements = Array.from(root.querySelectorAll(selector));

                if (shadowEnabled) {
                    // Find all elements that might have shadow roots
                    const allElements = root.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            elements = elements.concat(collectElements(el.shadowRoot, selector, depth + 1));
                        }
                    }
                }
                return elements;
            }

            // Helper: Generate a selector that pierces shadow DOM
            function generateShadowSelector(element) {
                const path = [];
                let current = element;

                while (current && current !== document.body) {
                    if (current.id) {
                        path.unshift(`#${current.id}`);
                        break;
                    } else if (current.className && typeof current.className === 'string') {
                        path.unshift(`.${current.className.split(' ').filter(c => c).join('.')}`);
                    } else {
                        path.unshift(current.tagName?.toLowerCase() || '*');
                    }

                    // Check if we're crossing a shadow boundary
                    if (current.getRootNode() instanceof ShadowRoot) {
                        const shadowHost = current.getRootNode().host;
                        path.unshift('>>>'); // Playwright shadow-piercing combinator
                        current = shadowHost;
                    } else {
                        current = current.parentElement;
                    }
                }
                return path.join(' ');
            }

            const buttons = collectElements(document, 'button, a, input[type="button"]');

            // 1. Exact text match
            let match = buttons.find(b => (b.innerText || b.textContent || '').toLowerCase().includes(normalizedGoal));

            // 2. data-goal attribute match (for semantic goals)
            if (!match) {
                match = buttons.find(b =>
                    (b.getAttribute('data-goal') || '').toLowerCase() === normalizedGoal
                );
            }

            // 3. Fuzzy ARIA match
            if (!match) {
                match = buttons.find(b =>
                    (b.getAttribute('aria-label') || '').toLowerCase().includes(normalizedGoal) ||
                    (b.id || '').toLowerCase().includes(normalizedGoal)
                );
            }

            if (match) {
                // Check if element is inside shadow DOM
                const isInShadow = match.getRootNode() instanceof ShadowRoot;

                if (isInShadow && shadowEnabled) {
                    console.log('[CBA Debug] Element found in Shadow DOM, generating pierce selector');
                    return { selector: generateShadowSelector(match), inShadow: true };
                }

                // Generate a unique selector - prefer text-based for links/buttons
                const textContent = (match.innerText || match.textContent || '').trim();
                const tagName = match.tagName.toLowerCase();

                // For links and buttons with text, use text-based selector for precision
                if ((tagName === 'a' || tagName === 'button') && textContent && textContent.length < 50) {
                    return { selector: `${tagName}:has-text("${textContent}")`, inShadow: false, textMatch: true };
                }

                // Standard CSS selector fallback
                if (match.id) return { selector: `#${match.id}`, inShadow: false };
                if (match.className && typeof match.className === 'string') {
                    // Generate a more specific selector with nth-child if possible
                    const classList = match.className.split(' ').filter(c => c);
                    return { selector: `.${classList.join('.')}`, inShadow: false };
                }
                return { selector: match.tagName.toLowerCase(), inShadow: false };
            }
            return null;
        }, { goalText: goal, shadowEnabled, maxDepth });

        if (target) {
            if (target.inShadow) {
                console.log(`[CBA Hub] Phase 9: Shadow DOM element resolved for "${goal}" -> ${target.selector}`);
            }
            return { selector: target.selector, selfHealed: false, shadowPierced: target.inShadow };
        }

        if (this.historicalMemory.has(goal)) {
            console.log(`[CBA Hub] Phase 7: Semantic resolution failed. Using Predictive Memory for "${goal}" -> ${this.historicalMemory.get(goal)}`);
            return { selector: this.historicalMemory.get(goal), selfHealed: true };
        }

        return null;
    }

    /**
     * Resolve a form input by semantic goal (label text, placeholder, aria-label).
     * This enables fillGoal('Search') to find inputs without hardcoded selectors.
     */
    async resolveFormIntent(goal) {
        const shadowEnabled = this.config.hub?.shadowDom?.enabled !== false;
        const maxDepth = this.config.hub?.shadowDom?.maxDepth || 5;

        const target = await this.page.evaluate(({ goalText, shadowEnabled, maxDepth }) => {
            const normalizedGoal = goalText.toLowerCase();

            // Collect all form inputs including shadow DOM
            function collectInputs(root, depth = 0) {
                if (depth > maxDepth) return [];
                let inputs = Array.from(root.querySelectorAll('input, textarea, select'));

                if (shadowEnabled) {
                    const allElements = root.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            inputs = inputs.concat(collectInputs(el.shadowRoot, depth + 1));
                        }
                    }
                }
                return inputs;
            }

            const inputs = collectInputs(document);

            // 1. Match by associated <label> text
            let match = inputs.find(input => {
                if (input.id) {
                    const label = document.querySelector(`label[for="${input.id}"]`);
                    if (label && (label.innerText || label.textContent || '').toLowerCase().includes(normalizedGoal)) {
                        return true;
                    }
                }
                return false;
            });

            // 2. Match by placeholder attribute
            if (!match) {
                match = inputs.find(input =>
                    (input.getAttribute('placeholder') || '').toLowerCase().includes(normalizedGoal)
                );
            }

            // 3. Match by aria-label
            if (!match) {
                match = inputs.find(input =>
                    (input.getAttribute('aria-label') || '').toLowerCase().includes(normalizedGoal)
                );
            }

            // 4. Match by name attribute
            if (!match) {
                match = inputs.find(input =>
                    (input.getAttribute('name') || '').toLowerCase().includes(normalizedGoal)
                );
            }

            // 5. Match by title attribute
            if (!match) {
                match = inputs.find(input =>
                    (input.getAttribute('title') || '').toLowerCase().includes(normalizedGoal)
                );
            }

            if (match) {
                // Generate selector
                if (match.id) return { selector: `#${match.id}` };
                if (match.name) return { selector: `[name="${match.name}"]` };
                if (match.placeholder) return { selector: `[placeholder="${match.placeholder}"]` };
                if (match.className && typeof match.className === 'string') {
                    return { selector: `.${match.className.split(' ').filter(c => c).join('.')}` };
                }
                return { selector: match.tagName.toLowerCase() };
            }
            return null;
        }, { goalText: goal, shadowEnabled, maxDepth });

        if (target) {
            console.log(`[CBA Hub] Form input resolved for "${goal}" -> ${target.selector}`);
            return { selector: target.selector, selfHealed: false };
        }

        // Fallback: Check historical memory for form fills
        const formKey = `fill:${goal}`;
        if (this.historicalMemory.has(formKey)) {
            console.log(`[CBA Hub] Phase 7: Form resolution failed. Using Predictive Memory for "${goal}" -> ${this.historicalMemory.get(formKey)}`);
            return { selector: this.historicalMemory.get(formKey), selfHealed: true };
        }

        return null;
    }

    /**
     * Resolve a select dropdown by semantic goal (label text, name, aria-label).
     */
    async resolveSelectIntent(goal) {
        const target = await this.page.evaluate((goalText) => {
            const normalizedGoal = goalText.toLowerCase();
            const selects = Array.from(document.querySelectorAll('select'));

            // Match by associated label
            let match = selects.find(select => {
                if (select.id) {
                    const label = document.querySelector(`label[for="${select.id}"]`);
                    if (label && (label.innerText || label.textContent || '').toLowerCase().includes(normalizedGoal)) {
                        return true;
                    }
                }
                return false;
            });

            // Match by aria-label
            if (!match) {
                match = selects.find(s => (s.getAttribute('aria-label') || '').toLowerCase().includes(normalizedGoal));
            }

            // Match by name
            if (!match) {
                match = selects.find(s => (s.getAttribute('name') || '').toLowerCase().includes(normalizedGoal));
            }

            if (match) {
                if (match.id) return { selector: `#${match.id}` };
                if (match.name) return { selector: `[name="${match.name}"]` };
                return { selector: 'select' };
            }
            return null;
        }, goal);

        if (target) {
            console.log(`[CBA Hub] Select resolved for "${goal}" -> ${target.selector}`);
            return { selector: target.selector, selfHealed: false };
        }

        const formKey = `select:${goal}`;
        if (this.historicalMemory.has(formKey)) {
            return { selector: this.historicalMemory.get(formKey), selfHealed: true };
        }
        return null;
    }

    /**
     * Resolve a checkbox by semantic goal (label text, aria-label).
     */
    async resolveCheckboxIntent(goal) {
        const target = await this.page.evaluate((goalText) => {
            const normalizedGoal = goalText.toLowerCase();
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));

            // Match by associated label text (label wrapping or for= attribute)
            let match = checkboxes.find(cb => {
                // Check parent label
                const parentLabel = cb.closest('label');
                if (parentLabel && (parentLabel.innerText || parentLabel.textContent || '').toLowerCase().includes(normalizedGoal)) {
                    return true;
                }
                // Check for= label
                if (cb.id) {
                    const label = document.querySelector(`label[for="${cb.id}"]`);
                    if (label && (label.innerText || label.textContent || '').toLowerCase().includes(normalizedGoal)) {
                        return true;
                    }
                }
                return false;
            });

            // Match by aria-label
            if (!match) {
                match = checkboxes.find(cb => (cb.getAttribute('aria-label') || '').toLowerCase().includes(normalizedGoal));
            }

            if (match) {
                if (match.id) return { selector: `#${match.id}` };
                if (match.name) return { selector: `[name="${match.name}"]` };
                return { selector: `input[type="${match.type}"]` };
            }
            return null;
        }, goal);

        if (target) {
            console.log(`[CBA Hub] Checkbox resolved for "${goal}" -> ${target.selector}`);
            return { selector: target.selector, selfHealed: false };
        }

        const formKey = `check:${goal}`;
        if (this.historicalMemory.has(formKey)) {
            return { selector: this.historicalMemory.get(formKey), selfHealed: true };
        }
        return null;
    }

    loadHistoricalMemory() {
        // Load persistent memory file (from previous sessions)
        const memoryFile = path.join(process.cwd(), 'starlight_memory.json');
        if (fs.existsSync(memoryFile)) {
            try {
                const memory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
                Object.entries(memory).forEach(([goal, selector]) => {
                    this.historicalMemory.set(goal, selector);
                });
                console.log(`[CBA Hub] 🧠 Loaded ${Object.keys(memory).length} learned mappings from starlight_memory.json`);
            } catch (e) {
                console.warn('[CBA Hub] Could not load starlight_memory.json:', e.message);
            }
        }

        // Also load from mission trace (for backward compatibility)
        const traceFile = path.join(process.cwd(), 'mission_trace.json');
        if (fs.existsSync(traceFile)) {
            try {
                const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
                if (trace.length === 0) return;

                const firstIntent = trace.find(e => e.method === 'starlight.intent');
                const traceStart = firstIntent ? firstIntent.timestamp : trace[0].timestamp;

                trace.forEach(event => {
                    // 1. Learn Selectors (From Intents OR Recordings)
                    const isLearnable = event.method === 'starlight.intent' ||
                        event.method === 'starlight.click' ||
                        event.method === 'starlight.fill' ||
                        event.method?.startsWith('starlight.action');

                    if (isLearnable && event.params?.goal && event.params?.selector) {
                        this.historicalMemory.set(event.params.goal, event.params.selector);
                    }

                    // 2. Learn Checkpoints for ROI and MTTR
                    if (event.method === 'starlight.checkpoint') {
                        console.log(`  [✓] Verified Milestone: ${event.params.name || event.params.goal}`);
                    }

                    // 3. Learn Entropy Auras (Phase 7.2)
                    if (event.method === 'starlight.entropy_stream' || event.method === 'starlight.stability') {
                        const relTime = event.timestamp - traceStart;
                        const bucket = Math.floor(relTime / 500);
                        this.historicalAuras.add(bucket);
                    }
                });
                console.log(`[CBA Hub] Phase 7 Intelligence Audit:`);
                console.log(`  - Learned Selectors: ${this.historicalMemory.size}`);
                console.log(`  - Temporal Auras: ${this.historicalAuras.size}`);
            } catch (e) {
                console.warn("[CBA Hub] Failed to load historical memory:", e.message);
            }
        }

        // Phase 17.4: Load Temporal Ghosting Metrics
        const ghostFile = path.join(process.cwd(), 'temporal_ghosting.json');
        if (fs.existsSync(ghostFile)) {
            try {
                const metrics = JSON.parse(fs.readFileSync(ghostFile, 'utf8'));
                metrics.forEach(m => {
                    const key = `${m.command}:${m.selector || ''}`;
                    // Store the max latency seen for this target to use as a stability hint
                    const existing = this.historicalMemory.get(`ghost:${key}`) || 0;
                    this.historicalMemory.set(`ghost:${key}`, Math.max(existing, m.latency_ms));
                });
                console.log(`  - Temporal Ghosting: ${metrics.length} observations loaded.`);
            } catch (e) {
                console.warn("[CBA Hub] Failed to load temporal ghosting metrics:", e.message);
            }
        }
    }

    /**
     * Save learned goal→selector mappings to persistent storage.
     * Called on shutdown to ensure learning persists across sessions.
     */
    async saveHistoricalMemory() {
        if (this.historicalMemory.size === 0) {
            console.log('[CBA Hub] No learned mappings to save.');
            return;
        }

        const memoryFile = path.join(process.cwd(), 'starlight_memory.json');

        // Load existing memory and merge with current session
        let existingMemory = {};
        if (fs.existsSync(memoryFile)) {
            try {
                existingMemory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
            } catch (e) {
                console.warn('[CBA Hub] Could not load existing memory file:', e.message);
            }
        }

        // Merge: current session overwrites existing (newer mappings win)
        const allMappings = { ...existingMemory };
        this.historicalMemory.forEach((selector, goal) => {
            // Skip ghost metrics (they're saved separately)
            if (!goal.startsWith('ghost:')) {
                allMappings[goal] = selector;
            }
        });

        // Atomic write
        const tempFile = memoryFile + '.tmp';
        try {
            fs.writeFileSync(tempFile, JSON.stringify(allMappings, null, 2));
            fs.renameSync(tempFile, memoryFile);
            console.log(`[CBA Hub] 🧠 Memory saved: ${Object.keys(allMappings).length} learned mappings`);
        } catch (e) {
            console.error('[CBA Hub] Failed to save memory:', e.message);
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        }
    }

    /**
     * Learn a successful goal→selector mapping.
     * Called after successful command execution with semantic goal.
     */
    learnMapping(goal, selector, cmd = null) {
        if (!goal || !selector) return;

        // Store with command prefix for more specific recall
        const key = cmd ? `${cmd}:${goal}` : goal;
        const existing = this.historicalMemory.get(key);

        if (existing !== selector) {
            this.historicalMemory.set(key, selector);
            // Also store without prefix for backward compatibility
            if (cmd) {
                this.historicalMemory.set(goal, selector);
            }
            console.log(`[CBA Hub] 🧠 LEARNED: ${key} -> ${selector}`);
        }
    }

    isHistoricallyUnstable() {
        if (!this.missionStartTime) return false;
        const relTime = Date.now() - this.missionStartTime;
        const bucket = Math.floor(relTime / 500);
        // Check current, next, and previous bucket for a predictive buffer
        return this.historicalAuras.has(bucket) ||
            this.historicalAuras.has(bucket + 1) ||
            this.historicalAuras.has(bucket - 1);
    }

    broadcastToClients(msg) {
        const payload = JSON.stringify(msg);
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        }
    }

    broadcastContextUpdate() {
        const msg = JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.sovereign_update',
            params: { context: this.sovereignState },
            id: nanoid()
        });
        for (const ws of this.wss.clients) {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
    }

    async recordTrace(type, sentinelId, data, includeSnapshot = false) {
        if (data.method === 'starlight.pulse') return;
        const sentinel = this.sentinels.get(sentinelId);
        const snapshot = includeSnapshot ? await this.takeDOMSnapshot() : null;

        this.missionTrace.push({
            timestamp: Date.now(),
            humanTime: new Date().toLocaleTimeString(),
            method: data.method || type,
            params: data.params || data,
            snapshot
        });

        // Immediate learning from recordings:
        if (type === 'RECORDER' && data.params?.goal && data.params?.selector) {
            this.historicalMemory.set(data.params.goal, data.params.selector);
        }

        // Trace rotation: keep only the last N events
        const maxEvents = this.config.hub?.traceMaxEvents || 500;
        if (this.missionTrace.length > maxEvents) {
            this.missionTrace = this.missionTrace.slice(-maxEvents);
        }
    }

    async takeDOMSnapshot() {
        if (!this.page || this.page.isClosed()) return null;
        // Stability: Opt-in snapshots with size limit to prevent OOM
        if (!this.config.hub?.enableSnapshots) return null;
        try {
            const html = await this.page.content();
            const maxSize = this.config.hub?.snapshotMaxBytes || 100000; // 100KB default
            if (html.length > maxSize) {
                return html.substring(0, maxSize) + '\n<!-- [TRUNCATED] -->';
            }
            return html;
        } catch (e) { return null; }
    }

    validateProtocol(msg) {
        // Starlight v2.0: JSON-RPC 2.0 Validation
        return msg.jsonrpc === '2.0' && msg.method && msg.method.startsWith('starlight.') && msg.params;
    }

    handleDisconnect(id) {
        const s = this.sentinels.get(id);
        if (s) {
            console.log(`[CBA Hub] Sentinel Disconnected: ${s.layer}`);
            this.sentinels.delete(id);
            if (this.lockOwner === id) this.releaseLock('Sentinel disconnected');
        }
    }

    async handleMessage(id, ws, msg) {
        const sentinel = this.sentinels.get(id);
        const params = msg.params;

        switch (msg.method) {
            case 'starlight.registration':
                // Security: Validate auth token if enabled
                if (this.authToken && params.authToken !== this.authToken) {
                    console.warn(`[CBA Hub] Rejected registration from ${params.layer}: Invalid auth token`);
                    ws.close(4001, 'Unauthorized: Invalid auth token');
                    return;
                }
                this.sentinels.set(id, {
                    ws,
                    lastSeen: Date.now(),
                    layer: params.layer,
                    priority: params.priority,
                    selectors: params.selectors,
                    capabilities: params.capabilities,
                    protocolVersion: params.version || '1.0.0'
                });
                console.log(`[CBA Hub] Registered Sentinel: ${params.layer} (Priority: ${params.priority})`);
                break;
            case 'starlight.pulse':
                if (sentinel) {
                    sentinel.lastSeen = Date.now();
                    sentinel.currentAura = params.data?.currentAura || [];
                }
                break;
            case 'starlight.context_update':
                // Phase 4: Context Injection from Sentinels
                // Phase 12: Also handles A11y Sentinel accessibility reports
                if (params.context) {
                    console.log(`[CBA Hub] Context Injection from ${sentinel?.layer || 'Unknown'}:`, Object.keys(params.context));
                    this.sovereignState = { ...this.sovereignState, ...params.context };

                    // Phase 12: Store accessibility data for report generation
                    if (params.context.accessibility) {
                        console.log(`[CBA Hub] A11y Report: Score ${params.context.accessibility.score}, Violations: ${params.context.accessibility.violations?.length || 0}`);
                        this.a11yReport = params.context.accessibility;
                    }

                    this.broadcastContextUpdate();
                }
                break;
            case 'starlight.clear':
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.get(id).resolve(msg);
                    this.pendingRequests.delete(id);
                }
                break;
            case 'starlight.wait':
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.get(id).resolve(msg);
                    this.pendingRequests.delete(id);
                }
                break;
            case 'starlight.hijack':
                await this.handleHijack(id, params);
                break;
            case 'starlight.resume':
                this.handleResume(id, params);
                break;
            case 'starlight.intent':
                // Phase 5: Handle Semantic Intent (Goal-based)
                // Only run default click resolver if cmd is 'click' or not set
                if (msg.params.goal && (!msg.params.cmd || msg.params.cmd === 'click')) {
                    console.log(`[CBA Hub] Resolving Click Goal: "${msg.params.goal}"`);
                    const result = await this.resolveSemanticIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        msg.params.cmd = 'click'; // Default semantic action

                        // Propagate hint from semantic context if available
                        if (result.stabilityHint) {
                            msg.params.stabilityHint = result.stabilityHint;
                        }

                        // ROI: If semantic resolution used history, count it as saved triage time
                        if (result.selfHealed) {
                            this.totalSavedTime += 120; // ROI: 2 mins triage avoided
                        }
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve semantic goal: ${msg.params.goal}`);
                        // CRITICAL FIX: Record failed semantic goals in report
                        this.reportData.push({
                            type: 'COMMAND',
                            id: msg.id,
                            cmd: 'click',
                            goal: msg.params.goal,
                            selector: null,
                            url: null,
                            success: false,
                            forcedProceed: false,
                            selfHealed: false,
                            predictiveWait: false,
                            timestamp: new Date().toLocaleTimeString(),
                            beforeScreenshot: null,
                            afterScreenshot: null,
                            error: `Failed to resolve semantic goal: ${msg.params.goal}`
                        });
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE',
                            id: msg.id,
                            success: false,
                            error: `Could not find element matching goal "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                // Handle goal-based fill commands (semantic form resolution)
                if (msg.params.cmd === 'fill' && msg.params.goal && !msg.params.selector) {
                    console.log(`[CBA Hub] Resolving Form Goal: "${msg.params.goal}"`);
                    const result = await this.resolveFormIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        if (result.selfHealed) {
                            this.totalSavedTime += 120; // ROI: 2 mins triage avoided
                        }
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve form goal: ${msg.params.goal}`);
                        this.reportData.push({
                            type: 'COMMAND',
                            id: msg.id,
                            cmd: 'fill',
                            goal: msg.params.goal,
                            selector: null,
                            url: null,
                            success: false,
                            forcedProceed: false,
                            selfHealed: false,
                            predictiveWait: false,
                            timestamp: new Date().toLocaleTimeString(),
                            beforeScreenshot: null,
                            afterScreenshot: null,
                            error: `Failed to resolve form goal: ${msg.params.goal}`
                        });
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE',
                            id: msg.id,
                            success: false,
                            error: `Could not find form input matching "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                // Handle goal-based select commands
                if (msg.params.cmd === 'select' && msg.params.goal && !msg.params.selector) {
                    console.log(`[CBA Hub] Resolving Select Goal: "${msg.params.goal}"`);
                    const result = await this.resolveSelectIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        if (result.selfHealed) this.totalSavedTime += 120;
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve select goal: ${msg.params.goal}`);
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE', id: msg.id, success: false,
                            error: `Could not find dropdown matching "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                // Handle goal-based check/uncheck commands
                if ((msg.params.cmd === 'check' || msg.params.cmd === 'uncheck') && msg.params.goal && !msg.params.selector) {
                    console.log(`[CBA Hub] Resolving Checkbox Goal: "${msg.params.goal}"`);
                    const result = await this.resolveCheckboxIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        if (result.selfHealed) this.totalSavedTime += 120;
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve checkbox goal: ${msg.params.goal}`);
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE', id: msg.id, success: false,
                            error: `Could not find checkbox matching "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                // Handle goal-based hover/scroll commands (use click resolver)
                if ((msg.params.cmd === 'hover' || msg.params.cmd === 'scroll') && msg.params.goal && !msg.params.selector) {
                    console.log(`[CBA Hub] Resolving ${msg.params.cmd} Goal: "${msg.params.goal}"`);
                    const result = await this.resolveSemanticIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        if (result.selfHealed) this.totalSavedTime += 120;
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve ${msg.params.cmd} goal: ${msg.params.goal}`);
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE', id: msg.id, success: false,
                            error: `Could not find element matching "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                // Handle goal-based upload commands (use form resolver for file inputs)
                if (msg.params.cmd === 'upload' && msg.params.goal && !msg.params.selector) {
                    console.log(`[CBA Hub] Resolving Upload Goal: "${msg.params.goal}"`);
                    const result = await this.resolveFormIntent(msg.params.goal);
                    if (result) {
                        msg.params.selector = result.selector;
                        msg.params.selfHealed = result.selfHealed;
                        if (result.selfHealed) this.totalSavedTime += 120;
                    } else {
                        console.error(`[CBA Hub] FAILED to resolve upload goal: ${msg.params.goal}`);
                        this.broadcastToClient(id, {
                            type: 'COMMAND_COMPLETE', id: msg.id, success: false,
                            error: `Could not find file input matching "${msg.params.goal}"`
                        });
                        return;
                    }
                }
                this.enqueueCommand(id, { ...msg.params, id: msg.id });
                break;
            case 'starlight.action':
                await this.executeSentinelAction(id, params);
                break;
            case 'starlight.finish':
                await this.shutdown(params.reason || params.error);
                break;
            // Phase 13.5: Recording Protocol
            case 'starlight.startRecording':
                await this.handleStartRecording(id, params?.url);
                break;
            case 'starlight.stopRecording':
                await this.handleStopRecording(id, params);
                break;
            case 'starlight.getRecordedSteps':
                this.broadcastToClient(id, { type: 'RECORDED_STEPS', steps: this.recorder.getSteps() });
                break;

            // Phase 17: Inter-Sentinel Side-Talk
            case 'starlight.sidetalk':
                await this.handleSideTalk(id, params, sentinel);
                break;

            // Phase 17: Warp Context Capture
            case 'starlight.warp_capture':
                await this.handleWarpCapture(id, params);
                break;
            case 'starlight.warp_restore':
                await this.handleWarpRestore(id, params);
                break;
        }
    }

    // Phase 13.5: Recording Handlers
    async handleStartRecording(clientId, url = null) {
        try {
            console.log(`[CBA Hub] handleStartRecording called with URL: ${url}`);

            // Hard Reset: Ensure clean state for new recording
            if (this.page) {
                await this.page.close().catch(() => { });
                this.page = null;
            }

            // Close existing browser and create fresh one for recording (visible)
            if (this.browser) {
                await this.browser.close().catch(() => { });
                this.browser = null;
            }

            console.log('[CBA Hub] Launching NEW browser for recording session...');
            this.browser = await chromium.launch({ headless: false });
            const context = await this.browser.newContext();
            this.page = await context.newPage();

            const targetUrl = url || 'https://example.com';

            // Setup recorder callbacks
            this.recorder.onStopRequest = () => {
                console.log('[CBA Hub] HUD Stop Signal received');
                this.handleStopRecording(clientId, { name: `recorded_${nanoid(6)}` });
            };

            this.recorder.onStep = (step) => {
                console.log(`[CBA Hub] Learning [Live]: ${step.action} -> ${step.goal || step.url}`);
                this.recordTrace('RECORDER', 'Recorder', {
                    method: `starlight.${step.action}`,
                    params: step
                });
                this.saveMissionTrace();
            };

            // STEP 1: Expose functions BEFORE navigation (required by Playwright)
            await this.recorder.exposeFunctions(this.page);
            console.log('[CBA Hub] Recording functions exposed');

            // STEP 1.5: Add dialog handler that ACCEPTS dialogs (doesn't dismiss them)
            // This is critical for checkpoint prompts and stop confirms to work
            this.page.on('dialog', async dialog => {
                console.log(`[CBA Hub] Dialog detected: ${dialog.type()} - "${dialog.message()}"`);
                // Accept all dialogs with default value (prompts get empty string, confirms get true)
                await dialog.accept();
            });

            // STEP 2: Navigate to URL
            console.log(`[CBA Hub] Recording: Navigating to ${targetUrl}...`);
            await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log(`[CBA Hub] Navigation complete: ${this.page.url()}`);

            // STEP 3: Inject HUD script (now page has document.body)
            await this.recorder.injectHUD(this.page);
            console.log('[CBA Hub] HUD injected');

            this.broadcastToClient(clientId, { type: 'RECORDING_STARTED' });
            console.log('[CBA Hub] Recording Session Active:', this.page.url());
        } catch (e) {
            console.error('[CBA Hub] Recording Launch Failed:', e.message);
            console.error(e.stack);
            this.broadcastToClient(clientId, { type: 'RECORDING_ERROR', error: e.message });
        }
    }

    async handleStopRecording(clientId, params) {
        try {
            this.recorder.stopRecording();
            await this.saveMissionTrace();
            const testDir = path.join(process.cwd(), 'test');
            const fileName = this.recorder.generateTestFile(testDir, params?.name);
            this.broadcastToClient(clientId, {
                type: 'RECORDING_STOPPED',
                fileName,
                steps: this.recorder.getSteps()
            });
        } catch (e) {
            console.error('[CBA Hub] Stop recording error:', e.message);
            this.broadcastToClient(clientId, { type: 'RECORDING_ERROR', error: e.message });
        }
    }

    async shutdown(reason = null) {
        if (this.isShuttingDown) return; // Prevent double shutdown
        console.log(`[CBA Hub] Shutdown initiated. Reason: ${reason || 'Normal'}`);
        this.isShuttingDown = true;

        // Only log as FAILURE if it actually contains failure markers or is an Error object
        const isActualFailure = reason && (
            reason.toLowerCase().includes('failed') ||
            reason.toLowerCase().includes('error') ||
            reason.toLowerCase().includes('timeout') ||
            reason.toLowerCase().includes('aborted')
        );

        if (isActualFailure) {
            console.log(`[CBA Hub] Mission Failure Recorded: ${reason}`);
            this.reportData.push({
                type: 'FAILURE',
                reason: reason,
                timestamp: new Date().toLocaleTimeString()
            });

            // Record in-progress command as failed
            if (this.currentCommand) {
                console.log(`[CBA Hub] Recording in-progress command as failed: ${this.currentCommand.goal || this.currentCommand.cmd}`);

                // Try to capture final state screenshot
                let interruptedScreenshot = null;
                if (this.page) {
                    try {
                        interruptedScreenshot = await this.takeScreenshot('INTERRUPTED_STATE');
                    } catch (e) {
                        console.warn('[CBA Hub] Could not capture interrupted state screenshot:', e.message);
                    }
                }

                this.reportData.push({
                    type: 'COMMAND',
                    id: this.currentCommand.id,
                    cmd: this.currentCommand.cmd,
                    goal: this.currentCommand.goal,
                    selector: this.currentCommand.selector,
                    url: this.currentCommand.url,
                    success: false,
                    forcedProceed: false,
                    selfHealed: false,
                    predictiveWait: false,
                    timestamp: new Date().toLocaleTimeString(),
                    beforeScreenshot: interruptedScreenshot, // Show state at interruption
                    afterScreenshot: interruptedScreenshot,  // Same screenshot for both
                    error: `Command interrupted: ${reason}`
                });
                this.currentCommand = null;
            }
        }

        console.log("[CBA Hub] Closing gracefully...");

        // Clear the queue - no more processing
        this.commandQueue = [];

        // Wait for any in-flight processing to finish
        let waitCount = 0;
        while (this.isProcessing && waitCount < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitCount++;
        }

        // Phase 12: Wait for pending context updates (A11y reports) to arrive
        await new Promise(r => setTimeout(r, 500));

        console.log("[CBA Hub] Generating Hero Story Report...");
        await this.generateReport();
        await this.saveMissionTrace();
        await this.saveTemporalMetrics(); // Phase 17.4: Temporal Ghosting

        // Phase 10: Record Mission Telemetry
        const missionSuccess = this.reportData.every(item => item.type !== 'COMMAND' || item.success);
        this.telemetry.recordMission(
            missionSuccess,
            this.totalSavedTime,
            this.reportData.filter(i => i.type === 'HIJACK').length,
            this.recoveryTimes
        );

        // Phase 10: Send Webhook Notification
        await this.webhooks.notify(missionSuccess ? 'success' : 'failure', {
            mission: this.currentMissionName || 'Unknown',
            durationMs: Date.now() - (this.missionStartTime || Date.now()),
            interventions: this.reportData.filter(i => i.type === 'HIJACK').length,
            mttr: this.telemetry.getStats().avgRecoveryTimeMs,
            error: missionSuccess ? null : 'Mission had failures'
        });

        // Save learned memory before shutdown
        await this.saveHistoricalMemory();
        await this.saveTemporalMetrics();

        if (this.page) await this.page.close();
        if (this.browser) await this.browser.close();
        this.server.close(() => {
            this.wss.close(() => {
                console.log("[CBA Hub] Hub shutdown complete.");
                if (require.main === module) {
                    process.exit(0);
                }
            });
        });
    }

    async takeScreenshot(name) {
        const filename = `${Date.now()}_${name}.png`;
        const filepath = path.join(this.screenshotsDir, filename);
        if (this.page && !this.page.isClosed()) {
            try {
                await this.page.screenshot({ path: filepath });
                return filename;
            } catch (e) { return null; }
        }
        return null;
    }

    checkSystemHealth() {
        const now = Date.now();
        let healthy = true;
        for (const [id, s] of this.sentinels.entries()) {
            if (s.priority <= 5 && (now - s.lastSeen > this.heartbeatTimeout)) {
                console.error(`[CBA Hub] ERROR: Critical Sentinel ${s.layer} is UNRESPONSIVE.`);
                healthy = false;
            }
        }
        this.systemHealthy = healthy;
    }

    async handleHijack(id, msg) {
        if (!this.systemHealthy) return;
        const requested = this.sentinels.get(id);

        if (this.isLocked) {
            const current = this.sentinels.get(this.lockOwner);
            if (requested.priority < current.priority) {
                this.releaseLock('Preempted by higher priority');
            } else return;
        }

        console.log(`[CBA Hub] Locking for ${requested.layer}. Reason: ${msg.reason}`);
        this.isLocked = true;
        this.lockOwner = id;

        if (this.lockTimeout) clearTimeout(this.lockTimeout);
        const lockTTL = this.config.hub?.lockTTL || 5000;
        this.lockTimeout = setTimeout(() => this.releaseLock('TTL Expired'), lockTTL);

        const screenshot = await this.takeScreenshot(`HIJACK_${requested.layer}`);

        this.hijackStarts.set(id, Date.now()); // ROI Tracking: Mark start

        this.reportData.push({
            type: 'HIJACK',
            sentinel: requested.layer,
            reason: msg.reason,
            timestamp: new Date().toLocaleTimeString(),
            screenshot
        });

        // Broadcast HIJACK event to clients for test verification
        this.broadcastToClients({
            jsonrpc: '2.0',
            method: 'starlight.hijack',
            params: {
                sentinel: requested.layer,
                reason: msg.reason
            }
        });

        for (const req of this.pendingRequests.values()) req.reject();
        this.pendingRequests.clear();
    }

    handleResume(id, msg) {
        if (this.lockOwner === id) {
            console.log(`[CBA Hub] RESUME from ${this.sentinels.get(id).layer}`);

            // ROI Tracking: Calculate duration
            const start = this.hijackStarts.get(id);
            if (start) {
                const durationMs = Date.now() - start;
                this.recoveryTimes.push(durationMs); // Track for MTTR
                const savedSeconds = 300 + Math.floor(durationMs / 1000); // 5 mins baseline + duration
                this.totalSavedTime += savedSeconds;
                console.log(`[CBA Hub] ROI Update: Sentinel cleared obstacle in ${durationMs}ms. Estimated ${savedSeconds}s manual effort saved.`);
            }

            this.releaseLock('Resume requested');
            if (msg.re_check) this.commandQueue.unshift({ cmd: 'nop', internal: true });
        }
    }

    releaseLock(reason) {
        this.isLocked = false;
        this.lockOwner = null;
        if (this.lockTimeout) clearTimeout(this.lockTimeout);
        this.processQueue();
    }

    enqueueCommand(clientId, msg) {
        this.commandQueue.push({ clientId, ...msg });
        this.processQueue();
    }

    async processQueue() {
        // Don't process if shutting down
        if (this.isShuttingDown) return;
        if (this.isLocked || this.commandQueue.length === 0 || !this.systemHealthy || this.isProcessing) return;

        if (!this.missionStartTime) this.missionStartTime = Date.now();

        this.isProcessing = true;
        try {
            const msg = this.commandQueue.shift();
            this.currentCommand = msg; // Track for failure reporting on shutdown
            if (msg.internal && msg.cmd === 'nop') {
                console.log("[CBA Hub] Processing RE_CHECK settling (500ms)...");
                await new Promise(r => setTimeout(r, 500));
                this.isProcessing = false;
                this.processQueue();
                return;
            }

            // Phase 17.4: Temporal Optimization (Ghost-Based Pacing)
            const ghostKey = `ghost:${msg.cmd}:${msg.selector || ''}`;
            if (this.historicalMemory.has(ghostKey)) {
                const ghostLatency = this.historicalMemory.get(ghostKey);
                msg.stabilityHint = Math.max(msg.stabilityHint || 0, ghostLatency);
                console.log(`[CBA Hub] TEMPORAL OPTIMIZATION: Applying Ghost Hint (${ghostLatency}ms) for ${msg.cmd}`);
            }

            // Phase 7.2: Aura-Based Throttling (Predictive Pacing)
            let predictiveWait = false;
            if (this.isHistoricallyUnstable()) {
                const auraWait = this.config.aura?.predictiveWaitMs || 1500;
                console.log(`[CBA Hub] Aura Detected: Proactively slowing down for historical jitter...`);
                await new Promise(r => setTimeout(r, auraWait));
                predictiveWait = true;
                this.totalSavedTime += 30;
            }

            const clear = await this.broadcastPreCheck(msg);
            let forcedProceed = false;
            if (!clear) {
                // Track pre-check retries for animation tolerance
                msg._preCheckRetries = (msg._preCheckRetries || 0) + 1;
                const maxRetries = this.config.hub?.maxPreCheckRetries || 3;

                if (msg._preCheckRetries >= maxRetries) {
                    console.log(`[CBA Hub] ANIMATION TOLERANCE: Max pre-check retries (${maxRetries}) reached. Force proceeding with ${msg.cmd}...`);
                    forcedProceed = true;
                    // Continue execution despite veto (animation tolerance)
                } else {
                    console.log(`[CBA Hub] Pre-check failed (${msg._preCheckRetries}/${maxRetries}) for ${msg.cmd}. Retrying in 1s...`);
                    this.commandQueue.unshift(msg);
                    // Stability: Reset isProcessing before scheduling retry
                    // (early exit before try/finally completes)
                    this.isProcessing = false;
                    setTimeout(() => {
                        if (this.isShuttingDown) return;
                        this.processQueue();
                    }, 1000);
                    return;
                }
            }

            // v2.1: Robust Screenshot Timing (Wait for settlement)
            const beforeScreenshot = await this.takeScreenshot(`BEFORE_${msg.cmd}`);
            const originalSelector = msg.selector;
            let success = false;
            let commandError = null;
            try {
                success = await this.executeCommand(msg);
            } catch (e) {
                success = false;
                commandError = e.message;
                console.error(`[CBA Hub] Command execution error: ${commandError}`);
            }
            const selfHealed = originalSelector !== msg.selector;

            // Learn successful goal→selector mappings
            if (success && msg.goal && msg.selector) {
                this.learnMapping(msg.goal, msg.selector, msg.cmd);
            }

            // Brief wait for UI to reflect change before "AFTER" capture
            await new Promise(r => setTimeout(r, 500));
            const afterScreenshot = await this.takeScreenshot(`AFTER_${msg.cmd}`);

            this.reportData.push({
                type: 'COMMAND',
                id: msg.id,
                cmd: msg.cmd,
                goal: msg.goal,
                selector: msg.selector,
                url: msg.url,
                success,
                forcedProceed,
                selfHealed: selfHealed || msg.selfHealed,
                learned: success && msg.goal && msg.selector, // Track that we learned from this
                predictiveWait,
                timestamp: new Date().toLocaleTimeString(),
                beforeScreenshot,
                afterScreenshot,
                error: commandError
            });

            this.broadcastToClient(null, {
                type: 'COMMAND_COMPLETE',
                id: msg.id,
                success,
                error: commandError || (success ? null : `Command "${msg.cmd}" failed on ${msg.goal || msg.selector}`),
                context: this.sovereignState // Phase 4: Return shared context to Intent
            });
        } finally {
            this.currentCommand = null; // Clear tracking
            this.isProcessing = false;
        }
        this.processQueue();
    }

    async broadcastPreCheck(msg) {
        // Exit early if shutting down to prevent page.evaluate after browser closes
        if (this.isShuttingDown) return true;

        const syncBudget = this.config.hub?.syncBudget || 30000;
        const hint = msg.stabilityHint ? ` (Hint: ${msg.stabilityHint}ms)` : '';
        console.log(`[CBA Hub] Awaiting Handshake for ${msg.cmd}${hint} (Budget: ${syncBudget / 1000}s)...`);

        const relevantSentinels = Array.from(this.sentinels.entries())
            .filter(([id, s]) => s.priority <= 10);

        if (relevantSentinels.length === 0) return true;

        const allSelectors = [...new Set(relevantSentinels.flatMap(([id, s]) => s.selectors || []))];

        // v2.0 Phase 2: Add AI context (screenshot) if deep analysis is capability-flagged
        let screenshotB64 = null;
        if (relevantSentinels.some(([id, s]) => s.capabilities?.includes('vision'))) {
            try {
                const screenshotBuffer = await this.page.screenshot({ type: 'jpeg', quality: 80 });
                screenshotB64 = screenshotBuffer.toString('base64');
                console.log(`[CBA Hub] Screenshot captured for AI analysis (${Math.round(screenshotB64.length / 1024)}KB)`);
            } catch (e) {
                console.warn('[CBA Hub] Screenshot capture failed:', e.message);
            }
        }

        // Phase 9: Enhanced obstacle detection with Shadow DOM support
        const shadowEnabled = this.config.hub?.shadowDom?.enabled !== false;
        const maxDepth = this.config.hub?.shadowDom?.maxDepth || 5;

        const blockingElements = await this.page.evaluate(({ selectors, shadowEnabled, maxDepth }) => {
            const results = [];

            // Helper: Recursively search elements including shadow roots
            function findElements(root, selector, depth = 0) {
                if (depth > maxDepth) return [];
                let elements = [];
                try {
                    elements = Array.from(root.querySelectorAll(selector));
                } catch (e) { /* invalid selector for this context */ }

                if (shadowEnabled) {
                    const allElements = root.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            elements = elements.concat(findElements(el.shadowRoot, selector, depth + 1));
                        }
                    }
                }
                return elements;
            }

            // Helper: Generate shadow-piercing selector
            function getShadowSelector(element) {
                const isInShadow = element.getRootNode() instanceof ShadowRoot;
                if (!isInShadow) return null;

                const path = [];
                let current = element;
                while (current && current !== document.body) {
                    if (current.id) {
                        path.unshift(`#${current.id}`);
                        break;
                    } else if (current.className && typeof current.className === 'string') {
                        path.unshift(`.${current.className.split(' ').filter(c => c).join('.')}`);
                    } else {
                        path.unshift(current.tagName?.toLowerCase() || '*');
                    }

                    if (current.getRootNode() instanceof ShadowRoot) {
                        const host = current.getRootNode().host;
                        path.unshift('>>>');
                        current = host;
                    } else {
                        current = current.parentElement;
                    }
                }
                return path.join(' ');
            }

            selectors.forEach(s => {
                const elements = findElements(document, s);
                elements.forEach(el => {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    const isVisible = style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        rect.width > 0 && rect.height > 0;

                    if (isVisible) {
                        const shadowSelector = getShadowSelector(el);
                        results.push({
                            selector: shadowSelector || s,
                            id: el.id,
                            tagName: el.tagName,
                            inputType: el.getAttribute('type'),
                            className: typeof el.className === 'string' ? el.className : '',
                            display: style.display,
                            rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                            inShadow: !!shadowSelector
                        });
                    }
                });
            });
            return results;
        }, { selectors: allSelectors, shadowEnabled, maxDepth });

        // Phase 9: Extract page text for PII detection
        let pageText = '';
        if (relevantSentinels.some(([id, s]) => s.capabilities?.includes('pii-detection'))) {
            try {
                pageText = await this.page.evaluate(() => document.body.innerText || '');
                console.log(`[CBA Hub] Page text extracted for PII scan (${pageText.length} chars)`);
            } catch (e) {
                console.warn('[CBA Hub] Page text extraction failed:', e.message);
            }
        }

        // Phase 12: Collect A11y snapshot for accessibility-capable Sentinels
        let a11ySnapshot = null;
        if (relevantSentinels.some(([id, s]) => s.capabilities?.includes('accessibility'))) {
            try {
                a11ySnapshot = await this.getA11ySnapshot();
                console.log(`[CBA Hub] A11y snapshot collected (${a11ySnapshot.elements?.length || 0} elements)`);
            } catch (e) {
                console.warn('[CBA Hub] A11y snapshot failed:', e.message);
            }
        }

        // Get target element rect if we have a selector (for overlap checking)
        let targetRect = null;
        if (msg.selector) {
            try {
                targetRect = await this.page.evaluate((selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const rect = el.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }, msg.selector);
            } catch (e) {
                // Selector might not be valid yet, that's ok
            }
        }

        // Standardize broadcast
        this.broadcast({
            jsonrpc: '2.0',
            method: 'starlight.pre_check',
            params: {
                command: msg,
                blocking: blockingElements,
                targetRect: targetRect,  // For obstacle overlap checking
                screenshot: screenshotB64,
                page_text: pageText,
                a11y_snapshot: a11ySnapshot  // Phase 12: For accessibility auditing
            },
            id: nanoid()
        });

        const quorumThreshold = this.config.hub?.quorumThreshold || 1.0;
        const consensusTimeout = this.config.hub?.consensusTimeout || 5000;
        const totalSentinels = relevantSentinels.length;
        const requiredConfidence = totalSentinels * quorumThreshold;

        let receivedConfidence = 0;
        let receivedVeto = null;
        let responsesCount = 0;

        return new Promise((resolve) => {
            const cleanup = () => {
                relevantSentinels.forEach(([id]) => this.pendingRequests.delete(id));
                clearTimeout(budgetTimer);
                clearTimeout(consensusTimer);
            };

            const budgetTimer = setTimeout(() => {
                const missing = relevantSentinels
                    .filter(([id]) => this.pendingRequests.has(id))
                    .map(([_, s]) => s.layer);
                if (missing.length > 0) {
                    console.warn(`[CBA Hub] Handshake TIMEOUT: Missing signals from [${missing.join(', ')}] after ${syncBudget}ms.`);
                }
                cleanup();
                resolve(false);
            }, syncBudget);

            let consensusTimer = null;

            relevantSentinels.forEach(([id, s]) => {
                this.pendingRequests.set(id, {
                    layer: s.layer,
                    resolve: (response) => {
                        responsesCount++;
                        const confidence = response.params?.confidence ?? 1.0;

                        if (response.method === 'starlight.wait') {
                            receivedVeto = response;
                            console.log(`[CBA Hub] Stability VETO from ${s.layer} (Confidence: ${confidence}).`);
                            cleanup();
                            setTimeout(async () => {
                                const delay = response.params?.retryAfterMs || 1000;
                                await new Promise(r => setTimeout(r, delay));
                                resolve(false);
                            }, 0);
                            return;
                        }

                        if (response.method === 'starlight.clear') {
                            receivedConfidence += confidence;
                        }

                        // Check if quorum reached
                        if (receivedConfidence >= requiredConfidence && !receivedVeto) {
                            console.log(`[CBA Hub] Consensus MET (${receivedConfidence.toFixed(1)}/${requiredConfidence.toFixed(1)}). Proceeding...`);
                            cleanup();
                            resolve(true);
                        } else if (responsesCount === totalSentinels) {
                            // All responded but quorum not reached (shouldn't happen with default 1.0 unless confidence < 1)
                            console.log(`[CBA Hub] Handshake COMPLETED. Final confidence: ${receivedConfidence.toFixed(1)}/${requiredConfidence.toFixed(1)}`);
                            cleanup();
                            resolve(receivedConfidence >= requiredConfidence);
                        } else if (quorumThreshold < 1.0 && !consensusTimer) {
                            // Start consensus timeout once we have at least one response
                            consensusTimer = setTimeout(() => {
                                console.log(`[CBA Hub] Consensus TIMEOUT (${receivedConfidence.toFixed(1)}/${requiredConfidence.toFixed(1)}).`);
                                cleanup();
                                resolve(receivedConfidence >= requiredConfidence);
                            }, consensusTimeout);
                        }
                    },
                    reject: () => {
                        responsesCount++;
                        if (responsesCount === totalSentinels && !receivedVeto) {
                            cleanup();
                            resolve(receivedConfidence >= requiredConfidence);
                        }
                    }
                });
            });
        });
    }

    async executeCommand(msg, retry = true) {
        const startTime = Date.now();
        try {
            // Lazy launch browser if needed
            if (!this.page) {
                console.log('[CBA Hub] Launching browser for mission execution...');
                this.browser = await chromium.launch({ headless: this.headless });
                const context = await this.browser.newContext();
                this.page = await context.newPage();
            }

            if (this.config.hub?.ghostMode && msg.cmd !== 'goto' && msg.cmd !== 'checkpoint') {
                console.log(`[CBA Hub] GHOST MODE: Timed ${msg.cmd} on ${msg.selector || 'target'}. Observation only.`);
                await new Promise(r => setTimeout(r, 50));
            } else {
                if (msg.cmd === 'goto') await this.page.goto(msg.url);
                else if (msg.cmd === 'click') await this.page.click(msg.selector);
                else if (msg.cmd === 'fill') await this.page.fill(msg.selector, msg.text);
                else if (msg.cmd === 'select') await this.page.selectOption(msg.selector, msg.value);
                else if (msg.cmd === 'hover') await this.page.hover(msg.selector);
                else if (msg.cmd === 'check') await this.page.check(msg.selector);
                else if (msg.cmd === 'uncheck') await this.page.uncheck(msg.selector);
                else if (msg.cmd === 'scroll') {
                    if (msg.selector) {
                        await this.page.locator(msg.selector).scrollIntoViewIfNeeded();
                    } else {
                        await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    }
                }
                else if (msg.cmd === 'press') await this.page.keyboard.press(msg.key);
                else if (msg.cmd === 'type') await this.page.keyboard.type(msg.text);
                else if (msg.cmd === 'upload') {
                    // Handle file upload - msg.files can be single path string or array of paths
                    const files = Array.isArray(msg.files) ? msg.files : [msg.files];
                    await this.page.setInputFiles(msg.selector, files);
                }
                else if (msg.cmd === 'checkpoint') {
                    console.log(`[CBA Hub] 🚩 Checkpoint reached: ${msg.name}`);
                    this.recordTrace('CHECKPOINT', 'System', {
                        method: 'starlight.checkpoint',
                        params: { name: msg.name }
                    });
                }
            }

            // Phase 17.4: Track temporal ghosting metrics
            if (this.config.hub?.ghostMode) {
                this.recordTemporalGhosting(msg, Date.now() - startTime);
            }

            return true;
        } catch (e) {
            console.warn(`[CBA Hub] Command failure on ${msg.selector}: ${e.message}`);

            // Phase 7: Predictive Self-Healing
            if (retry && msg.goal && this.historicalMemory.has(msg.goal)) {
                const altSelector = this.historicalMemory.get(msg.goal);
                if (altSelector !== msg.selector) {
                    console.log(`[CBA Hub] SELF-HEALING: Attempting historical substitute for "${msg.goal}" -> ${altSelector}`);
                    msg.selector = altSelector;
                    const success = await this.executeCommand(msg, false);
                    if (success) {
                        this.totalSavedTime += 180; // ROI: 3 mins manual debugging avoided
                    }
                    return success;
                }
            }

            if (retry) {
                await new Promise(r => setTimeout(r, 100));
                return await this.executeCommand(msg, false);
            }
            return false;
        }
    }

    async executeSentinelAction(id, msg) {
        if (this.lockOwner !== id) return;
        console.log(`[CBA Hub] Sentinel Action: ${msg.cmd} ${msg.selector} `);
        try {
            if (msg.cmd === 'click') {
                console.log(`[CBA Hub]Force - clicking Sentinel target: ${msg.selector} `);
                try {
                    await this.page.click(msg.selector, { timeout: 2000, force: true });
                } catch (clickErr) {
                    console.warn(`[CBA Hub] Standard click failed, using dispatchEvent fallback...`);
                    await this.page.dispatchEvent(msg.selector, 'click');
                }
                console.log(`[CBA Hub] Sentinel Action SUCCESS: ${msg.selector} `);
            }

            // Phase 12: A11y Sentinel DOM Snapshot
            if (msg.cmd === 'get_a11y_snapshot') {
                console.log(`[CBA Hub] A11y Snapshot requested...`);
                const snapshot = await this.getA11ySnapshot();
                const sentinel = this.sentinels.get(id);
                if (sentinel?.ws?.readyState === 1) {
                    sentinel.ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'starlight.a11y_snapshot',
                        params: snapshot,
                        id: msg.id
                    }));
                }
                return;
            }
        } catch (e) {
            console.error(`[CBA Hub] Sentinel action failed: ${e.message} `);
        }

        // ABSOLUTE SOVEREIGN REMEDIATION: Definitively clear the obstacle via JS
        // Phase 9: Enhanced to traverse Shadow DOM
        if (msg.selector.includes('modal') || msg.selector.includes('overlay') || msg.selector.includes('close') || msg.selector.includes('shadow')) {
            console.log(`[CBA Hub] SOVEREIGN REMEDIATION: Definitively hiding elements matching ${msg.selector}...`);
            await this.page.evaluate(() => {
                // Helper: recursively find and hide elements in shadow roots
                function hideObstacles(root) {
                    const selectors = '.modal, .overlay, .popup, .shadow-overlay';
                    const elements = root.querySelectorAll(selectors);
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.display !== 'none') el.style.display = 'none';
                    });

                    // Traverse shadow roots
                    const allElements = root.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.shadowRoot) {
                            hideObstacles(el.shadowRoot);
                        }
                    }
                }
                hideObstacles(document);
            });
        }
    }

    /**
     * Phase 12: Get DOM snapshot for A11y Sentinel accessibility auditing.
     * Extracts elements with their attributes and computed styles.
     */
    async getA11ySnapshot() {
        if (!this.page) return { elements: [], computed: [] };

        try {
            const snapshot = await this.page.evaluate(() => {
                const elements = [];
                const computed = [];

                // Collect all relevant elements
                const allElements = document.querySelectorAll('*');
                let count = 0;
                const maxElements = 500; // Limit for performance

                for (const el of allElements) {
                    if (count >= maxElements) break;

                    const tag = el.tagName;

                    // Handle SVG elements where className is SVGAnimatedString
                    const classStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');

                    // Collect element data
                    const elementData = {
                        tag: tag,
                        selector: el.id ? `#${el.id}` : (classStr ? `.${classStr.split(' ')[0]}` : tag.toLowerCase()),
                        text: (el.innerText || el.textContent || '').slice(0, 100).trim(),
                        hasLabel: !!el.labels?.length,
                        attributes: {
                            id: el.id || null,
                            className: classStr || null,
                            alt: el.getAttribute('alt'),
                            role: el.getAttribute('role'),
                            'aria-label': el.getAttribute('aria-label'),
                            'aria-labelledby': el.getAttribute('aria-labelledby'),
                            'aria-hidden': el.getAttribute('aria-hidden'),
                            href: el.getAttribute('href'),
                            type: el.getAttribute('type'),
                            for: el.getAttribute('for'),
                            title: el.getAttribute('title'),
                            tabindex: el.getAttribute('tabindex'),
                            width: el.getAttribute('width'),
                            height: el.getAttribute('height'),
                            src: el.getAttribute('src')?.slice(0, 100)
                        }
                    };

                    elements.push(elementData);

                    // Collect computed styles for text elements and interactive elements
                    if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LABEL', 'DIV'].includes(tag)) {
                        const styles = window.getComputedStyle(el);
                        computed.push({
                            tag: tag,
                            selector: elementData.selector,
                            text: elementData.text,
                            styles: {
                                color: styles.color,
                                backgroundColor: styles.backgroundColor,
                                fontSize: styles.fontSize,
                                fontWeight: styles.fontWeight,
                                outline: styles.outline,
                                outlineStyle: styles.outlineStyle,
                                boxShadow: styles.boxShadow
                            }
                        });
                    }

                    count++;
                }

                return { elements, computed };
            });

            console.log(`[CBA Hub] A11y snapshot collected: ${snapshot.elements.length} elements, ${snapshot.computed.length} with styles`);
            return snapshot;
        } catch (e) {
            console.error(`[CBA Hub] A11y snapshot failed: ${e.message}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Phase 17: Inter-Sentinel Side-Talk
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handle side-talk messages between Sentinels.
     * Routes messages without requiring direct Sentinel connections.
     * Handles Sentinel availability (offline/unavailable scenarios).
     */
    async handleSideTalk(senderId, params, senderSentinel) {
        const { from, to, topic, payload, replyTo, ttl = 5000 } = params;

        console.log(`[CBA Hub] Side-Talk: ${from} → ${to} (topic: ${topic})`);

        // Validate sender
        if (!senderSentinel || senderSentinel.layer !== from) {
            console.warn(`[CBA Hub] Side-Talk rejected: sender mismatch (${from})`);
            return;
        }

        // Build the side-talk envelope
        const envelope = {
            jsonrpc: '2.0',
            method: 'starlight.sidetalk',
            params: {
                from,
                to,
                topic,
                payload,
                replyTo,
                timestamp: new Date().toISOString()
            },
            id: `sidetalk-${nanoid(8)}`
        };

        // Track delivery status
        const deliveryStatus = {
            sent: 0,
            delivered: 0,
            unavailable: []
        };

        // Broadcast or direct message
        if (to === '*') {
            // Broadcast to all Sentinels except sender
            for (const [id, sentinel] of this.sentinels.entries()) {
                if (sentinel.layer !== from) {
                    const success = this.deliverSideTalk(sentinel, envelope);
                    deliveryStatus.sent++;
                    if (success) {
                        deliveryStatus.delivered++;
                    } else {
                        deliveryStatus.unavailable.push(sentinel.layer);
                    }
                }
            }
            console.log(`[CBA Hub] Side-Talk broadcast: ${deliveryStatus.delivered}/${deliveryStatus.sent} delivered`);
        } else {
            // Direct message to specific Sentinel
            const targetSentinel = Array.from(this.sentinels.entries())
                .find(([id, s]) => s.layer === to)?.[1];

            if (!targetSentinel) {
                console.warn(`[CBA Hub] Side-Talk: Target Sentinel '${to}' not found/unavailable`);

                // Notify sender of failed delivery
                this.deliverSideTalk(senderSentinel, {
                    jsonrpc: '2.0',
                    method: 'starlight.sidetalk_ack',
                    params: {
                        originalId: envelope.id,
                        status: 'undeliverable',
                        reason: `Sentinel '${to}' is not available`,
                        availableSentinels: Array.from(this.sentinels.values()).map(s => s.layer)
                    },
                    id: `sidetalk-ack-${nanoid(8)}`
                });
                return;
            }

            const success = this.deliverSideTalk(targetSentinel, envelope);
            if (!success) {
                console.warn(`[CBA Hub] Side-Talk: Failed to deliver to '${to}'`);
            }
        }

        // Log side-talk for debugging
        this.missionTrace.push({
            type: 'SIDETALK',
            from,
            to,
            topic,
            deliveryStatus,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Attempt to deliver a side-talk message to a Sentinel.
     * Returns true if sent successfully, false if Sentinel is unavailable.
     */
    deliverSideTalk(sentinel, envelope) {
        try {
            if (!sentinel.ws || sentinel.ws.readyState !== WebSocket.OPEN) {
                return false;
            }
            sentinel.ws.send(JSON.stringify(envelope));
            return true;
        } catch (e) {
            console.error(`[CBA Hub] Side-Talk delivery error: ${e.message}`);
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Phase 17: Starlight Warp (Context Serialization)
    // ─────────────────────────────────────────────────────────────────

    /**
     * Capture current browser context to a .warp file.
     * Security: All data is sanitized by default.
     */
    async handleWarpCapture(clientId, params) {
        const { reason = 'manual', sanitize = true, encrypt = false } = params;

        console.log(`[CBA Hub] Warp Capture requested (reason: ${reason}, sanitize: ${sanitize})`);

        // Security warning for unsanitized captures
        if (!sanitize) {
            console.warn('[CBA Hub] ⚠️ SECURITY WARNING: Creating unsanitized warp file!');
        }

        try {
            // Lazy-load warp module
            if (!this.warp) {
                const { StarlightWarp } = require('./warp');
                this.warp = new StarlightWarp(this.page, {
                    outputDir: this.config.warp?.outputDir || './warps',
                    sanitize,
                    encrypt,
                    encryptionKey: this.config.warp?.encryptionKey
                });
                await this.warp.initialize();
            }

            const filepath = await this.warp.capture(reason);

            this.broadcastToClient(clientId, {
                type: 'WARP_CAPTURED',
                success: true,
                filepath,
                sanitized: sanitize
            });

            // Add to mission trace
            this.missionTrace.push({
                type: 'WARP_CAPTURE',
                reason,
                filepath,
                sanitized: sanitize,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`[CBA Hub] Warp capture failed: ${error.message}`);
            this.broadcastToClient(clientId, {
                type: 'WARP_CAPTURED',
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Restore browser context from a .warp file.
     */
    async handleWarpRestore(clientId, params) {
        const { filepath, restoreUrl = true, restoreCookies = true, restoreStorage = true } = params;

        console.log(`[CBA Hub] Warp Restore requested: ${filepath}`);

        try {
            if (!this.warp) {
                const { StarlightWarp } = require('./warp');
                this.warp = new StarlightWarp(this.page, {
                    outputDir: this.config.warp?.outputDir || './warps'
                });
            }

            const data = await this.warp.restore(filepath, {
                restoreUrl,
                restoreCookies,
                restoreStorage
            });

            this.broadcastToClient(clientId, {
                type: 'WARP_RESTORED',
                success: true,
                url: data.url,
                sanitized: data._sanitized
            });

        } catch (error) {
            console.error(`[CBA Hub] Warp restore failed: ${error.message}`);
            this.broadcastToClient(clientId, {
                type: 'WARP_RESTORED',
                success: false,
                error: error.message
            });
        }
    }

    broadcastMutation(mutation) {
        for (const [id, s] of this.sentinels.entries()) {
            if (!s.selectors || s.selectors.some(sel =>
                mutation.target.className.includes(sel.replace('.', '')) ||
                mutation.target.id === sel.replace('#', '')
            )) {
                s.ws.send(JSON.stringify(mutation));
            }
        }
    }

    async broadcast(msg) {
        const data = JSON.stringify(msg);
        await this.recordTrace('SEND', 'All', msg, msg.method === 'starlight.pre_check');
        for (const s of this.sentinels.values()) {
            if (s.ws.readyState === WebSocket.OPEN) s.ws.send(data);
        }
    }

    async broadcastToClient(clientId, msg) {
        const data = JSON.stringify(msg);
        await this.recordTrace('SEND', clientId, msg);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(data);
        });
    }

    async generateReport() {
        console.log("[CBA Hub] Generating Hero Story Report...");
        const totalSavedMins = Math.floor(this.totalSavedTime / 60);

        // Calculate overall mission success from reportData
        const failedCommands = this.reportData.filter(i => i.type === 'COMMAND' && !i.success);
        const hasFailure = this.reportData.some(i => i.type === 'FAILURE') || failedCommands.length > 0;
        const statusEmoji = hasFailure ? '❌' : '✅';
        const statusText = hasFailure ? 'Mission Failed' : 'Mission Complete';
        const statusColor = hasFailure ? '#f43f5e' : '#10B981';

        const html = `
    <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CBA Hero Story: ${statusText}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
                    
                    :root {
                        --bg-primary: #0A0A0A;
                        --bg-secondary: #111111;
                        --bg-card: #141414;
                        --accent: #10B981;
                        --border: #222222;
                        --text-primary: #F9FAFB;
                        --text-secondary: #9CA3AF;
                    }

                    body { 
                        font-family: 'Inter', -apple-system, sans-serif; 
                        background: var(--bg-primary); 
                        color: var(--text-primary); 
                        padding: 3rem 1.5rem; 
                        max-width: 1000px; 
                        margin: auto; 
                        line-height: 1.6;
                    }

                    .hero-header { 
                        text-align: center; 
                        padding: 4rem 2rem; 
                        background: var(--bg-secondary); 
                        border-radius: 20px; 
                        margin-bottom: 3rem; 
                        border: 1px solid var(--border); 
                        position: relative;
                        overflow: hidden;
                    }

                    .hero-header::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.1), transparent 70%);
                        pointer-events: none;
                    }

                    .hero-header h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 1rem; letter-spacing: -0.02em; }
                    .hero-header p { color: var(--text-secondary); font-size: 1.1rem; }

                    .card { 
                        background: var(--bg-card); 
                        border-radius: 16px; 
                        padding: 2rem; 
                        margin-bottom: 2rem; 
                        border: 1px solid var(--border); 
                        position: relative; 
                        transition: border-color 0.3s ease;
                    }

                    .card:hover { border-color: var(--accent); }

                    .hijack { border-left: 6px solid #f43f5e; }
                    .command { border-left: 6px solid var(--accent); }

                    .tag { 
                        position: absolute; 
                        top: 1.5rem; 
                        right: 1.5rem; 
                        padding: 0.4rem 1rem; 
                        border-radius: 20px; 
                        font-size: 0.75rem; 
                        font-weight: 700; 
                        text-transform: uppercase; 
                        letter-spacing: 0.05em;
                    }
                    .tag-hijack { background: #f43f5e; color: white; }
                    .tag-command { background: var(--accent); color: var(--bg-primary); }

                    img { 
                        max-width: 100%; 
                        border-radius: 12px; 
                        margin-top: 1.5rem; 
                        border: 1px solid var(--border); 
                        transition: transform 0.3s ease;
                    }
                    img:hover { transform: scale(1.02); }

                    .flex { display: flex; gap: 2rem; margin-top: 1.5rem; }
                    .flex > div { flex: 1; }

                    .roi-dashboard { 
                        margin-top: 5rem; 
                        padding: 4rem; 
                        background: var(--bg-secondary); 
                        border-radius: 24px; 
                        border: 1px solid var(--accent); 
                        text-align: center; 
                        position: relative;
                        overflow: hidden;
                    }

                    .roi-value { 
                        font-size: 4rem; 
                        font-weight: 800; 
                        color: var(--accent); 
                        margin: 1.5rem 0; 
                        letter-spacing: -0.03em;
                    }

                    /* Phase 12: Accessibility Dashboard */
                    .a11y-dashboard {
                        margin-top: 3rem;
                        padding: 2rem;
                        background: var(--bg-secondary);
                        border-radius: 16px;
                        border: 1px solid var(--border);
                    }
                    .a11y-header {
                        display: flex;
                        align-items: center;
                        gap: 1.5rem;
                        margin-bottom: 1.5rem;
                    }
                    .a11y-score {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.5rem;
                        font-weight: 800;
                        border: 4px solid;
                    }
                    .a11y-score.good { border-color: var(--accent); color: var(--accent); }
                    .a11y-score.acceptable { border-color: #3b82f6; color: #3b82f6; }
                    .a11y-score.needs-work { border-color: #f59e0b; color: #f59e0b; }
                    .a11y-score.critical { border-color: #f43f5e; color: #f43f5e; }
                    .a11y-info h3 { margin: 0 0 0.5rem 0; font-size: 1.2rem; }
                    .a11y-violations {
                        display: grid;
                        gap: 0.5rem;
                        margin-top: 1rem;
                    }
                    .a11y-violation {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        padding: 0.75rem;
                        background: rgba(255,255,255,0.03);
                        border-radius: 8px;
                    }
                    .violation-rule { font-weight: 600; min-width: 120px; }
                    .violation-wcag { color: var(--text-secondary); font-size: 0.8rem; min-width: 60px; }
                    .violation-msg { flex: 1; color: var(--text-secondary); font-size: 0.9rem; }

                    .meta { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem; font-family: 'JetBrains Mono', monospace; }
                    .card-title { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; font-size: 1.3rem; font-weight: 700; }
                    
                    .badge { padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; }
                    .badge-success { background: var(--accent); color: var(--bg-primary); }
                    .badge-danger { background: #f43f5e; color: white; }
                    .badge-warning { background: #f59e0b; color: #0a0a0a; }
                    .badge-info { background: #3b82f6; color: white; }

                    code { background: rgba(255,255,255,0.05); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
                    h1, h3 { margin: 0; }
                    p { color: var(--text-secondary); line-height: 1.8; }
                    i { opacity: 0.7; font-size: 0.9em; }
                </style>
            </head>
            <body>
                <div class="hero-header" style="border-color: ${statusColor};">
                    <h1>${statusEmoji} Starlight Protocol: ${statusText}</h1>
                    <p>Evidence-based automation for the modern web.</p>
                    ${hasFailure ? `<p style="color: ${statusColor}; font-weight: 700; margin-top: 1rem;">⚠️ ${failedCommands.length} command(s) failed during this mission.</p>` : ''}
                </div>

                <div id="timeline">
                    ${this.reportData.map(item => {
            if (item.type === 'HIJACK') {
                return `
                                <div class="card hijack">
                                    <span class="tag tag-hijack">Sentinel Intervention</span>
                                    <div class="meta">${escapeHtml(item.timestamp)}</div>
                                    <h3>Sovereign Correction: ${escapeHtml(item.sentinel)}</h3>
                                    <p><strong>Reason:</strong> ${escapeHtml(item.reason)}</p>
                                    <img src="screenshots/${escapeHtml(item.screenshot)}" alt="Obstacle Detected" />
                                </div>
                            `;
            } else if (item.type === 'FAILURE') {
                return `
                                <div class="card command" style="border-left: 4px solid #f43f5e; background: rgba(244, 63, 94, 0.05);">
                                    <span class="tag" style="background: #f43f5e; color: white;">Mission Failure</span>
                                    <div class="meta">${escapeHtml(item.timestamp)}</div>
                                    <h3 style="color: #f43f5e;">⚠️ Termination Reason</h3>
                                    <p style="font-size: 1.1rem; font-weight: 600;">${escapeHtml(item.reason)}</p>
                                </div>
                            `;
            } else {
                const status = item.success ? (item.forcedProceed ? 'FORCED' : 'SUCCESS') : 'FAILED';
                const badgeClass = item.success ? (item.forcedProceed ? 'badge-warning' : 'badge-success') : 'badge-danger';

                return `
                                <div class="card command">
                                    <div class="tag tag-command">Intent</div>
                                    <div class="meta">${escapeHtml(item.timestamp)} | ID: ${escapeHtml(item.id)}</div>
                                    <div class="card-title">
                                        <span>${escapeHtml(item.cmd).toUpperCase()}: ${item.cmd === 'goto' ? escapeHtml(item.url) : escapeHtml(item.goal || item.selector)}</span>
                                        <span class="badge ${badgeClass}">${status}</span>
                                    </div>
                                    <p>Resolved Selector: <code>${escapeHtml(item.selector) || 'N/A'}</code></p>
                                    ${item.selfHealed ? '<p>🛡️ <i>Self-Healed: Predictive anchor used due to DOM drift.</i></p>' : ''}
                                    ${item.predictiveWait ? '<p>⏳ <i>Aura Throttling: Slowed down for historical jitter.</i></p>' : ''}
                                    ${item.forcedProceed ? '<p>⚠️ <i>Forced Proceed: Handshake timed out or vetoed, proceeding anyway.</i></p>' : ''}
                                    <div class="flex">
                                        <div>
                                            <div class="meta">Before State</div>
                                            <img src="screenshots/${item.beforeScreenshot}" alt="Before State">
                                        </div>
                                        <div>
                                            <div class="meta">After State</div>
                                            <img src="screenshots/${item.afterScreenshot}" alt="After State">
                                        </div>
                                    </div>
                                </div>
                            `;
            }
        }).join('')}
                </div>

                ${this.a11yReport ? (() => {
                // Group violations by rule type for summary
                const violationsByRule = {};
                (this.a11yReport.violations || []).forEach(v => {
                    if (!violationsByRule[v.rule]) {
                        violationsByRule[v.rule] = { count: 0, wcag: v.wcag, impact: v.impact, samples: [] };
                    }
                    violationsByRule[v.rule].count++;
                    if (violationsByRule[v.rule].samples.length < 3) {
                        violationsByRule[v.rule].samples.push(v.message);
                    }
                });

                return `
                <div class="a11y-dashboard">
                    <h2>♿ Accessibility Audit</h2>
                    <div class="a11y-header">
                        <div class="a11y-score ${this.a11yReport.score >= 0.9 ? 'good' : this.a11yReport.score >= 0.7 ? 'acceptable' : this.a11yReport.score >= 0.5 ? 'needs-work' : 'critical'}">
                            ${Math.round(this.a11yReport.score * 100)}%
                        </div>
                        <div class="a11y-info">
                            <h3>${this.a11yReport.level || 'Unknown Level'}</h3>
                            <p>${this.a11yReport.violations?.length || 0} violations found | ${this.a11yReport.passes || 0} checks passed</p>
                        </div>
                    </div>
                    
                    ${Object.keys(violationsByRule).length > 0 ? `
                    <h4 style="margin-top: 1.5rem; margin-bottom: 1rem;">Violations by Category</h4>
                    <div class="a11y-violations">
                        ${Object.entries(violationsByRule).map(([rule, data]) => `
                            <div class="a11y-violation" style="flex-direction: column; align-items: flex-start;">
                                <div style="display: flex; gap: 0.75rem; align-items: center; width: 100%;">
                                    <span class="badge ${data.impact === 'critical' ? 'badge-danger' : data.impact === 'serious' ? 'badge-warning' : 'badge-info'}">${data.impact}</span>
                                    <span class="violation-rule">${rule}</span>
                                    <span class="violation-wcag">${data.wcag || ''}</span>
                                    <span style="margin-left: auto; font-weight: 700; color: var(--accent);">${data.count} issues</span>
                                </div>
                                <div style="margin-top: 0.5rem; padding-left: 0.5rem; border-left: 2px solid var(--border);">
                                    ${data.samples.map(s => `<div class="violation-msg" style="font-size: 0.85rem;">${s}</div>`).join('')}
                                    ${data.count > 3 ? `<div class="meta" style="margin-top: 0.25rem;">...and ${data.count - 3} more</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : '<p class="meta">No accessibility violations detected! 🎉</p>'}
                </div>
                `;
            })() : ''}

                <div class="roi-dashboard">
                    <h2>📈 Business Value Dashboard</h2>
                    <div class="roi-value">~${totalSavedMins} Minutes Saved</div>
                    <p>By automating obstacle clearance and environment stability, Starlight prevented manual reproduction and debugging efforts for your engineering team.</p>
                    <p class="meta">ROI Calculation: 5 mins triage baseline + actual intervention duration per obstacle.</p>
                </div>
            </body>
        </html>`;
        fs.writeFileSync(path.join(process.cwd(), 'report.html'), html);
        console.log("[CBA Hub] Hero Story saved to report.html");
    }

    async saveMissionTrace() {
        console.log(`[CBA Hub]Saving Mission Trace(${this.missionTrace.length} events)...`);
        const traceFile = path.join(process.cwd(), 'mission_trace.json');
        fs.writeFileSync(traceFile, JSON.stringify(this.missionTrace, null, 2));
        console.log("[CBA Hub] Mission Trace saved to mission_trace.json");
    }

    // Phase 17.4: Temporal Ghosting
    recordTemporalGhosting(msg, latency) {
        this.temporalMetrics.push({
            timestamp: new Date().toISOString(),
            command: msg.cmd,
            selector: msg.selector || null,
            latency_ms: latency,
            type: 'settlement_observation'
        });
        console.log(`[CBA Hub] 🌀 Ghost Observation: ${msg.cmd} latency = ${latency}ms`);
    }

    async saveTemporalMetrics() {
        if (this.temporalMetrics.length === 0) return;
        const metricsFile = path.join(process.cwd(), 'temporal_ghosting.json');
        fs.writeFileSync(metricsFile, JSON.stringify(this.temporalMetrics, null, 2));
        console.log(`[CBA Hub] Temporal Ghosting metrics saved to temporal_ghosting.json (${this.temporalMetrics.length} samples)`);
    }
}

module.exports = { CBAHub };

if (require.main === module) {
    const args = process.argv.slice(2);
    const headless = args.includes('--headless');
    const port = args.find(a => a.startsWith('--port='))?.split('=')[1] || 8080;

    const hub = new CBAHub(parseInt(port), headless);
    hub.init();
}
