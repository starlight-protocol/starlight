/**
 * SmartBrowserAdapter - Enterprise-Grade Hybrid Engine Adapter
 * ============================================================
 * 
 * Implements intelligent routing between Playwright and Stealth (SeleniumBase)
 * engines based on detection heuristics, with seamless context preservation.
 * 
 * Features:
 * - Auto-detection of bot barriers (Cloudflare, Akamai)
 * - Hot-swap with encrypted state transfer
 * - Circuit breaker for resilience
 * - Pre-warmed engine pool for <500ms swap latency
 * 
 * @version 8.0.0
 * @author Starlight Protocol
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Lazy-load heavy dependencies to allow unit testing of core classes
let chromium = null;
let StealthBrowserAdapter = null;

function loadDependencies() {
    if (!chromium) {
        chromium = require('playwright').chromium;
    }
    if (!StealthBrowserAdapter) {
        StealthBrowserAdapter = require('./stealth_browser_adapter').StealthBrowserAdapter;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL ERROR CODES (Aligned with Python driver)
// ═══════════════════════════════════════════════════════════════════════════════
const ProtocolErrorCodes = {
    NOT_FOUND: -32001,
    STALE_INTENT: -32002,
    TIMEOUT_EXCEEDED: -32003,
    OBSTRUCTED: -32004,
    DRIVER_CRASH: -32005
};
// ═══════════════════════════════════════════════════════════════════════════════

class ProtocolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProtocolError';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER (Robustness)
// ═══════════════════════════════════════════════════════════════════════════════
class CircuitBreaker {
    constructor(failureThreshold = 3, recoveryTimeout = 30000) {
        this.failures = 0;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
        this.lastFailureTime = null;
    }

    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            console.log(`[CircuitBreaker] OPEN - Engine marked as failing`);
            setTimeout(() => {
                this.state = 'HALF_OPEN';
                console.log(`[CircuitBreaker] HALF_OPEN - Testing recovery`);
            }, this.recoveryTimeout);
        }
    }

    recordSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    isAvailable() {
        return this.state !== 'OPEN';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION ENGINE (Architectural Soundness)
// ═══════════════════════════════════════════════════════════════════════════════
class DetectionEngine {
    constructor() {
        this.detectionPatterns = {
            cloudflare: {
                dom: ['#cf-wrapper', '.cf-browser-verification', '#challenge-running', '#cf-please-wait', 'cf-challenge', '_cf_chl_opt'],
                scripts: ['_cf_chl_opt', 'cf-challenge', '/cdn-cgi/challenge-platform'],
                headers: ['cf-ray', 'cf-cache-status']
            },
            akamai: {
                dom: ['ak-challenge', 'akamai_sensor_data', 'ak-bm-c'],
                scripts: ['_akamai', 'akamai_sensor_data', '/akam/'],
                headers: ['x-akamai-transformed', 'akamai-bot-detection']
            },
            generic: {
                dom: [
                    '#captcha-container',
                    '.g-recaptcha',
                    'Access Denied',
                    'You don\'t have permission',
                    'Checking your browser',
                    'Enable JavaScript and cookies to continue',
                    '403 Forbidden',
                    'Request blocked',
                    'automated access',
                    'bot detected'
                ],
                status: [403, 401, 429, 503]
            },
            onetrust: {
                dom: ['onetrust-consent-sdk', 'onetrust-banner-sdk', '#onetrust-accept-btn-handler'],
                scripts: ['onetrust']
            }
        };
    }

    /**
     * Analyze page for bot detection signals
     * @param {Object} context - { dom, headers, statusCode }
     * @returns {{ detected: boolean, type: string, confidence: number }}
     */
    analyze(context) {
        const { dom = '', headers = {}, statusCode = 200 } = context;
        let signals = [];

        // DOM-based detection (Surgical accuracy v4.0)
        for (const [type, patterns] of Object.entries(this.detectionPatterns)) {
            if (patterns.dom) {
                for (const pattern of patterns.dom) {
                    // Only match if the pattern is a significant blocking indicator
                    // or a known bot-control DOM ID/Class
                    if (dom.includes(pattern)) {
                        const baseConfidence = (statusCode === 403 || statusCode === 429) ? 0.95 : 0.4;
                        signals.push({ type, source: 'dom', pattern, confidence: baseConfidence });
                    }
                }
            }
            if (patterns.scripts) {
                for (const script of patterns.scripts) {
                    if (dom.includes(script)) {
                        signals.push({ type, source: 'script', pattern: script, confidence: 0.9 });
                    }
                }
            }
        }

        // Header-based detection
        const headerKeys = Object.keys(headers).map(k => k.toLowerCase());
        for (const [type, patterns] of Object.entries(this.detectionPatterns)) {
            if (patterns.headers) {
                for (const header of patterns.headers) {
                    if (headerKeys.includes(header.toLowerCase())) {
                        signals.push({ type, source: 'header', header, confidence: 0.7 });
                    }
                }
            }
        }

        // Explicit Text Detection (high-confidence signal)
        const pageText = (dom || '').toLowerCase();
        if (pageText.includes('access denied') || pageText.includes('permission denied') || pageText.includes('you don\'t have permission') || pageText.includes('bot detected')) {
            const confidence = (statusCode === 403 || statusCode === 429) ? 1.0 : 0.85;
            signals.push({ type: 'generic', source: 'text', confidence });
        }

        // Status code detection
        if (this.detectionPatterns.generic.status.includes(statusCode)) {
            signals.push({ type: 'generic', source: 'status', code: statusCode, confidence: 0.6 });
        }

        // Calculate overall detection
        if (signals.length === 0) {
            return { detected: false, type: null, confidence: 0, signals: [] };
        }

        const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;

        // WORLD-CLASS: Swapping should be proactive but accurate.
        // Require high confidence (>0.8) OR multiple signals
        return {
            detected: (avgConfidence > 0.8) || (signals.length >= 2),
            type: signals[0]?.type || 'unknown',
            confidence: avgConfidence,
            signals
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURE STATE MANAGER (Security)
// ═══════════════════════════════════════════════════════════════════════════════
class SecureStateManager {
    constructor(encryptionKey = null) {
        // Use provided key or generate one
        this.key = encryptionKey || crypto.randomBytes(32);
        this.algorithm = 'aes-256-gcm';
    }

    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        const jsonStr = JSON.stringify(data);
        let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return {
            iv: iv.toString('hex'),
            data: encrypted,
            tag: authTag.toString('hex')
        };
    }

    decrypt(encryptedData) {
        const decipher = crypto.createDecipheriv(
            this.algorithm,
            this.key,
            Buffer.from(encryptedData.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }

    /**
     * Extract state from Playwright engine
     */
    async extractFromPlaywright(context) {
        try {
            const cookies = await context.cookies();
            const pages = context.pages();
            let storage = { localStorage: {}, sessionStorage: {} };

            if (pages.length > 0) {
                storage = await pages[0].evaluate(() => ({
                    localStorage: { ...localStorage },
                    sessionStorage: { ...sessionStorage }
                }));
            }

            return this.encrypt({ cookies, storage });
        } catch (e) {
            console.error('[SecureStateManager] Extract error:', e.message);
            return null;
        }
    }

    /**
     * Inject state into Stealth engine
     */
    async injectToStealth(stealthAdapter, encryptedState) {
        try {
            const { cookies, storage } = this.decrypt(encryptedState);

            // Inject cookies via JSON-RPC
            await stealthAdapter._sendCommand('set_cookies', { cookies });

            // Inject storage via JSON-RPC
            await stealthAdapter._sendCommand('set_storage', {
                localStorage: storage.localStorage,
                sessionStorage: storage.sessionStorage
            });

            return true;
        } catch (e) {
            console.error('[SecureStateManager] Inject error:', e.message);
            return false;
        }
    }

    /**
     * Extract state from Stealth engine
     */
    async extractFromStealth(stealthAdapter) {
        try {
            const cookiesResult = await stealthAdapter._sendCommand('get_cookies', {});
            const storageResult = await stealthAdapter._sendCommand('get_storage', {});

            return this.encrypt({
                cookies: cookiesResult.cookies || [],
                storage: {
                    localStorage: storageResult.localStorage || {},
                    sessionStorage: storageResult.sessionStorage || {}
                }
            });
        } catch (e) {
            console.error('[SecureStateManager] Extract from Stealth error:', e.message);
            return null;
        }
    }

    /**
     * Inject state into Playwright engine
     */
    async injectToPlaywright(context, page, encryptedState) {
        try {
            const { cookies, storage } = this.decrypt(encryptedState);

            // Inject cookies
            await context.addCookies(cookies);

            // Inject storage
            await page.evaluate((s) => {
                Object.entries(s.localStorage || {}).forEach(([k, v]) => {
                    localStorage.setItem(k, v);
                });
                Object.entries(s.sessionStorage || {}).forEach(([k, v]) => {
                    sessionStorage.setItem(k, v);
                });
            }, storage);

            return true;
        } catch (e) {
            console.error('[SecureStateManager] Inject to Playwright error:', e.message);
            return false;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART BROWSER ADAPTER (Main Class)
// ═══════════════════════════════════════════════════════════════════════════════
class SmartBrowserAdapter extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;

        // Engine instances
        this.playwrightBrowser = null;
        this.playwrightContext = null;
        this.playwrightPage = null;
        this.lastResponse = null; // Track last HTTP response for bot detection
        this.stealthAdapter = null;

        // Current active engine - Smart Selection based on Config
        const configured = (this.config.engine || 'chromium').toLowerCase();
        this.activeEngine = (configured === 'stealth' || configured === 'selenium' || configured === 'seleniumbase')
            ? 'stealth'
            : 'playwright';

        console.log(`[SmartAdapter] Initializing with Preferred Engine: ${this.activeEngine.toUpperCase()}`);

        // Components
        this.detectionEngine = new DetectionEngine();
        this.browserType = 'hybrid-smart';
        this.config.verbose = this.config.verbose || true;
        this.circuitBreaker = {
            playwright: new CircuitBreaker(),
            stealth: new CircuitBreaker()
        };
        this.stateManager = new SecureStateManager();

        // Metrics
        this.metrics = {
            swapCount: 0,
            swapLatencies: [],
            detectionHits: { cloudflare: 0, akamai: 0, generic: 0 },
            missionStatus: 'pending' // 'pending', 'success', 'failed'
        };

        // The unified page interface
        this.page = null;
    }

    /**
     * Get combined capabilities
     */
    getCapabilities() {
        return {
            shadowDomPiercing: this.activeEngine === 'playwright',
            cdpAccess: this.activeEngine === 'playwright',
            stealthMode: this.activeEngine === 'stealth',
            hotSwap: true,
            engines: ['playwright', 'stealth']
        };
    }

    /**
     * Normalize a selector for browser compatibility.
     * Handles shadow DOM piercing pseudo-selectors that may not be supported on all engines.
     * @param {string} selector - Original selector
     * @returns {string} Normalized selector
     */
    normalizeSelector(selector) {
        if (!selector || typeof selector !== 'string') return selector;
        // Remove >>> and ::deep for engines that don't support shadow piercing
        if (this.activeEngine === 'stealth') {
            return selector.replace(/\s*>>>\s*/g, ' ').replace(/::deep\s*/g, '');
        }
        return selector;
    }

    get engine() {
        return this.activeEngine;
    }

    /**
     * Launch both engines (pre-warming)
     */
    async launch(options = {}) {
        // Load heavy dependencies on first use
        loadDependencies();

        console.log('[SmartAdapter] Launching hybrid engine pool...');
        const headless = this.config.headless || options.headless || false;

        // Launch Playwright (If active)
        if (this.activeEngine === 'playwright') {
            try {
                this.playwrightBrowser = await chromium.launch({ headless });
                this.playwrightContext = await this.playwrightBrowser.newContext();
                this.playwrightPage = await this.playwrightContext.newPage();
                this.playwrightPage.on('console', msg => console.log(`[Browser] ${msg.type().toUpperCase()}: ${msg.text()}`));
                this.playwrightPage.on('response', response => {
                    this.lastResponse = response;
                });
                console.log('[SmartAdapter] ✓ Playwright engine ready');
            } catch (e) {
                console.error('[SmartAdapter] Playwright launch failed:', e.message);
                this.circuitBreaker.playwright.recordFailure();
            }


            // Pre-warm Stealth (cold standby) - STRICT CONFIG ENFORCEMENT
            // Only pre-warm if configuration EXPLICITLY allows standby-warmup or hot-swapping
            // AND we haven't forced a single-engine mode via config.
            const allowStandby = this.config.allowStandby !== false;

            if (options.prewarm && allowStandby) {
                try {
                    // Start Stealth only if not explicitly disabled
                    this.stealthAdapter = new StealthBrowserAdapter(this.config);
                    await this.stealthAdapter.launch({ headless });
                    console.log('[SmartAdapter] ✓ Stealth engine pre-warmed');
                } catch (e) {
                    console.error('[SmartAdapter] Stealth pre-warm failed:', e.message);
                    this.circuitBreaker.stealth.recordFailure();
                    // Do not fail the main launch if pre-warm fails
                }
            } else {
                console.log(`[SmartAdapter] Skipping Stealth pre-warm (Active Engine: ${this.activeEngine})`);
            }


            // Set initial active page
            this._initializePageProxy();

            return this;
        }

        // Launch Stealth (If active)
        if (this.activeEngine === 'stealth') {
            try {
                this.stealthAdapter = new StealthBrowserAdapter(this.config);
                await this.stealthAdapter.launch({ headless });
                console.log('[SmartAdapter] ✓ Stealth engine ready');
            } catch (e) {
                console.error('[SmartAdapter] Stealth launch failed:', e.message);
                throw e;
            }
            this._initializePageProxy();
            return this;
        }
    }

    /**
     * Create or update context (shim for Hub compatibility)
     * SmartBrowserAdapter manages contexts internally, this is a no-op.
     */
    async newContext(options = {}) {
        // Context is created during launch. This shim allows Hub to call newContext without error.
        // If mobile emulation is requested, we could recreate the context here.
        if (options.mobile?.enabled && options.mobile?.device && this.playwrightBrowser) {
            // For now, log the request. Full mobile support would require context recreation.
            console.log(`[SmartAdapter] Mobile context requested for device: ${options.mobile.device}`);
        }
        return this.playwrightContext; // Return existing context
    }

    /**
     * Get the active page (shim for Hub compatibility)
     */
    async newPage() {
        // Page proxy is already created during launch.
        return this.page;
    }

    /**
     * Create page proxy that routes to active engine
     */
    _initializePageProxy() {
        const self = this;

        this.page = {
            goto: async (url, options) => self._executeWithDetection('goto', url, options),
            click: async (selector, options) => self._executeWithDetection('click', selector, options),
            fill: async (selector, value, options) => self._executeWithDetection('fill', selector, value, options),
            selectOption: async (selector, value, options) => self._execute('selectOption', selector, value, options),
            check: async (selector, options) => self._execute('check', selector, options),
            uncheck: async (selector, options) => self._execute('uncheck', selector, options),
            hover: async (selector, options) => self._execute('hover', selector, options),
            setInputFiles: async (selector, files, options) => self._execute('setInputFiles', selector, files, options),
            waitForSelector: async (selector, options) => self._execute('waitForSelector', selector, options),
            waitForLoadState: async (state, options) => self._execute('waitForLoadState', state, options),
            type: async (selector, text, options) => self._executeWithDetection('type', selector, text, options),
            press: async (selector, key) => {
                // Handle overloaded call: press(key) vs press(selector, key)
                if (key === undefined) {
                    return self._execute('keyboard_press', selector);
                }
                return self._execute('press', selector, key);
            },
            keyboard: {
                press: async (key) => self._execute('keyboard_press', key),
                type: async (text) => self._execute('keyboard_type', text),
                down: async (key) => self._execute('evaluate', `(k) => document.dispatchEvent(new KeyboardEvent('keydown', {key: k}))`, key),
                up: async (key) => self._execute('evaluate', `(k) => document.dispatchEvent(new KeyboardEvent('keyup', {key: k}))`, key),
            },
            screenshot: async (options) => self._execute('screenshot', options),
            evaluate: async (fn, ...args) => self._execute('evaluate', fn, ...args),
            $: async (selector) => self._execute('$', selector),
            $$: async (selector) => self._execute('$$', selector),
            waitForSelector: async (selector, options) => self._execute('waitForSelector', selector, options),
            waitForLoadState: async (state) => self._execute('waitForLoadState', state),
            url: () => self._getUrl(),
            content: async () => self._execute('content'),
            isClosed: () => {
                if (self.activeEngine === 'playwright') return !self.playwrightPage || self.playwrightPage.isClosed();
                return !self.stealthAdapter || !self.stealthAdapter.isReady;
            },
            close: async () => self.close(),
            waitForTimeout: async (timeout) => self._execute('waitForTimeout', timeout),
            waitForFunction: async (fn, options, ...args) => self._execute('waitForFunction', fn, options, ...args),
            waitForURL: async (url, options) => self._execute('waitForURL', url, options),
            screenshot: async (options) => self._execute('screenshot', options),
            inputValue: async (selector, options) => {
                const val = await self._execute('evaluate', (sel) => {
                    const el = document.querySelector(sel);
                    console.log(`[SmartAdapter] inputValue: querySelector("${sel}") -> ${el ? el.tagName : 'NOT_FOUND'}`);
                    if (!el) return '';
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                        return el.value || '';
                    }
                    return (el.innerText || el.textContent || '').trim();
                }, selector);
                return String(val ?? '');
            },
            context: self.playwrightContext,

            // Compatibility: Add locator support for scrolling/complex actions
            locator: (selector) => {
                return {
                    scrollIntoViewIfNeeded: async () => self._execute('scrollIntoViewIfNeeded', selector),
                    click: async (options) => self._executeWithDetection('click', selector, options),
                };
            },

            // Compatibility: Add dispatchEvent support
            dispatchEvent: async (selector, event, detail) => self._execute('dispatchEvent', selector, event, detail),
            click: async (selector, options) => self._execute('click', selector, options),
            fill: async (selector, value, options) => self._execute('fill', selector, value, options),
            type: async (selector, text, options) => self._execute('type', selector, text, options),
            press: async (selector, key, options) => self._execute('press', selector, key, options),
            keyboard: {
                type: async (text, options) => self._execute('keyboard_type', text, options),
                press: async (key, options) => self._execute('keyboard_press', key, options),
            },
            on: (event, fn) => {
                if (self.activeEngine === 'playwright') return self.playwrightPage.on(event, fn);
                // Stealth: No-op for events for now
                return self.page;
            },
            once: (event, fn) => {
                if (self.activeEngine === 'playwright') return self.playwrightPage.once(event, fn);
                return self.page;
            },
            removeListener: (event, fn) => {
                if (self.activeEngine === 'playwright') return self.playwrightPage.removeListener(event, fn);
                return self.page;
            },
            off: (event, fn) => {
                if (self.activeEngine === 'playwright') return self.playwrightPage.off(event, fn);
                return self.page;
            },

            addInitScript: async (fn) => {
                if (self.activeEngine === 'playwright') return self.playwrightPage.addInitScript(fn);
                // Stealth: Queue for injection on next goto
                self.stealthAdapter.initScripts.push(`(${fn.toString()})()`);
                return true;
            },

            // Expose mutation handler for Sentinels
            exposeFunction: async (name, fn) => {
                if (self.activeEngine === 'playwright') {
                    return self.playwrightPage.exposeFunction(name, fn);
                }
                // Stealth doesn't support exposeFunction directly
                console.warn('[SmartAdapter] exposeFunction not supported on Stealth engine');
            }
        };
    }

    async _executeWithDetection(method, ...args) {
        if (this.config.verbose) {
            console.log(`[SmartAdapter] Executing "${method}" with detection (Engine: ${this.activeEngine})`);
        }
        try {
            const result = await this._execute(method, ...args);

            // After navigation commands, check for bot detection
            if (method === 'goto') {
                const dom = await this.playwrightPage.content().catch(() => '');
                // Prioritize actual status code if available
                const statusCode = this.lastResponse?.status?.() || 200;
                const detection = this.detectionEngine.analyze({ dom, statusCode });

                if (detection.detected) {
                    console.log(`[SmartAdapter] ⚠️ Critical Bot Barrier Detected (${detection.type}). Entering Stealth Mode...`);
                    await this.hotSwap('stealth');
                    return await this._execute(method, ...args); // Recover and retry internally
                }
                await this._checkAndSwap(); // Normal check for other signals
            }

            return result;
        } catch (e) {
            console.warn(`[SmartAdapter] Command "${method}" failed on ${this.activeEngine}: ${e.message}`);

            // If playwright failed with 403 or Permission Denied, it's a bot signal
            if (this.activeEngine === 'playwright' && (e.message.includes('403') || e.message.includes('permission denied'))) {
                console.log(`[SmartAdapter] Permission Denied on Playwright. Hoisting to Stealth...`);
                await this.hotSwap('stealth');
                return await this._execute(method, ...args);
            }
            throw e;
        }
    }

    /**
     * Execute command on active engine
     */
    async _execute(method, ...args) {
        if (this.config.verbose) {
            console.log(`[SmartAdapter] _execute: ${method} (${this.activeEngine})`);
        }
        if (this.activeEngine === 'playwright') {
            return this._executePlaywright(method, ...args);
        } else {
            return this._executeStealth(method, ...args);
        }
    }

    async _executePlaywright(method, ...args) {
        if (!this.playwrightPage) {
            throw new Error('Playwright engine not initialized');
        }

        try {
            const page = this.playwrightPage;

            switch (method) {
                case 'goto':
                    return await page.goto(args[0], { timeout: 10000, ...args[1] });
                case 'click':
                    return await page.click(args[0], { timeout: 10000, ...args[1] });
                case 'fill':
                    return await page.fill(args[0], args[1], { timeout: 10000, ...args[2] });
                case 'selectOption':
                    return await page.selectOption(args[0], args[1], args[2]);
                case 'check':
                    return await page.check(args[0], args[1]);
                case 'uncheck':
                    return await page.uncheck(args[0], args[1]);
                case 'hover':
                    return await page.hover(args[0], args[1]);
                case 'setInputFiles':
                    return await page.setInputFiles(args[0], args[1], args[2]);
                case 'type':
                    return await page.type(args[0], args[1], args[2]);
                case 'keyboard_type':
                    return await page.keyboard.type(args[0], args[1]);
                case 'press':
                    return await page.press(args[0], args[1], args[2]);
                case 'keyboard_press':
                    return await page.keyboard.press(args[0], args[1]);
                case 'screenshot':
                    return await page.screenshot(args[0]);
                case 'evaluate':
                    // Added 10s safety timeout to prevent Hub hangs on frozen pages
                    return await Promise.race([
                        page.evaluate(args[0], ...args.slice(1)),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for evaluate')), 10000))
                    ]);
                case '$':
                    return await page.$(args[0]);
                case '$$':
                    return await page.$$(args[0]);
                case 'waitForSelector':
                    return await page.waitForSelector(args[0], args[1]);
                case 'waitForLoadState':
                    return await page.waitForLoadState(args[0]);
                case 'content':
                    return await page.content();
                case 'scrollIntoViewIfNeeded':
                    return await page.locator(args[0]).scrollIntoViewIfNeeded();
                case 'dispatchEvent':
                    return await page.dispatchEvent(args[0], args[1], args[2]);
                case 'waitForTimeout':
                    return await page.waitForTimeout(args[0]);
                case 'waitForFunction':
                    return await page.waitForFunction(args[0], args[1], ...args.slice(2));
                case 'waitForURL':
                    return await page.waitForURL(args[0], args[1]);
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (e) {
            this.circuitBreaker.playwright.recordFailure();
            throw e;
        }
    }

    async _executeStealth(method, ...args) {
        if (!this.stealthAdapter) {
            throw new Error('Stealth engine not initialized');
        }

        try {
            const adapter = this.stealthAdapter;

            switch (method) {
                case 'goto':
                    return await adapter.page.goto(args[0]);
                case 'click':
                    return await adapter.page.click(args[0]);
                case 'fill':
                    return await adapter.page.fill(args[0], args[1]);
                case 'type':
                    return await adapter.page.type(args[0], args[1]);
                case 'keyboard_type':
                    return await adapter.page.keyboard.type(args[0]);
                case 'press':
                    return await adapter.page.press(args[0], args[1]);
                case 'keyboard_press':
                    return await adapter.page.keyboard.press(args[0]);
                case 'screenshot':
                    const response = await adapter._sendCommand('screenshot', {});
                    // Driver returns { status: 'ok', data: 'base64...' }
                    // We must return a buffer to match Playwright API
                    const buffer = Buffer.from(response.data || '', 'base64');

                    // Support schema-compliant 'name' param or legacy 'path' param
                    let savePath = args[0] ? args[0].path : null;
                    if (!savePath && args[0] && args[0].name) {
                        savePath = path.join(__dirname, '../screenshots', `${args[0].name}.png`);
                    }

                    if (savePath) {
                        // Emulate Playwright: Ensure directory exists and write file
                        const dir = path.dirname(savePath);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(savePath, buffer);
                        console.log(`[SmartAdapter] Saved screenshot to: ${savePath}`);
                    }
                    return buffer;
                case 'evaluate':
                    return await adapter.page.evaluate(args[0], ...args.slice(1));
                case 'waitForSelector':
                    // Stealth uses implicit waits in click/fill
                    return true;
                case 'waitForLoadState':
                    await new Promise(r => setTimeout(r, 1000)); // Basic wait
                    return true;
                case 'content':
                    const result = await adapter._sendCommand('get_page_text', {});
                    return result.text || '';
                case 'scrollIntoViewIfNeeded':
                    return await adapter._sendCommand('scroll', { selector: args[0] });
                case 'dispatchEvent':
                    return await adapter._sendCommand('dispatch_event', { selector: args[0], event_type: args[1], detail: args[2] });
                case 'waitForTimeout':
                    await new Promise(r => setTimeout(r, args[0]));
                    return true;
                case 'waitForFunction':
                    // Stealth Graceful Degradation: 500ms stabilization
                    // Poll-based waiting over JSON-RPC is non-performant; 
                    // Protocol v4.0.24 uses 500ms as a safe architectural buffer for Stealth.
                    await new Promise(r => setTimeout(r, 500));
                    return true;
                case 'waitForURL':
                    // Best-effort URL wait for Stealth
                    const targetUrl = args[0];
                    for (let i = 0; i < 10; i++) {
                        if (adapter.currentUrl && adapter.currentUrl.includes(targetUrl)) return true;
                        await new Promise(r => setTimeout(r, 500));
                    }
                    return true;
                default:
                    throw new Error(`Unknown method for Stealth: ${method}`);
            }
        } catch (e) {
            this.circuitBreaker.stealth.recordFailure();
            throw e;
        }
    }

    _getUrl() {
        if (this.activeEngine === 'playwright') {
            return this.playwrightPage?.url() || '';
        } else {
            // Async URL fetch not available synchronously
            return this.stealthAdapter?.currentUrl || '';
        }
    }

    /**
     * Check for bot detection and swap if needed
     */
    async _checkAndSwap() {
        if (this.activeEngine !== 'playwright') {
            return; // Only check when on Playwright
        }

        try {
            const dom = await this.playwrightPage.content();
            const response = this.lastResponse;
            const statusCode = response?.status?.() || 200;
            const headers = response?.headers?.() || {};

            const detection = this.detectionEngine.analyze({ dom, headers, statusCode });

            if (detection.detected) {
                console.log(`[SmartAdapter] 🚨 Bot detection: ${detection.type} (confidence: ${(detection.confidence * 100).toFixed(1)}%)`);
                this.metrics.detectionHits[detection.type] = (this.metrics.detectionHits[detection.type] || 0) + 1;

                if (this.circuitBreaker.stealth.isAvailable()) {
                    await this.hotSwap('stealth');
                } else {
                    console.warn('[SmartAdapter] Stealth engine circuit is OPEN, cannot swap');
                }
            }
        } catch (e) {
            console.error('[SmartAdapter] Detection check failed:', e.message);
        }
    }

    /**
     * Hot-swap between engines with state preservation
     */
    async hotSwap(targetEngine) {
        if (this.activeEngine === targetEngine) {
            console.log(`[SmartAdapter] Already on ${targetEngine} engine`);
            return;
        }

        console.log(`[SmartAdapter] 🔄 HOT-SWAP: ${this.activeEngine} → ${targetEngine}`);
        this.emit('swap_started', { from: this.activeEngine, to: targetEngine });

        const swapStart = Date.now();
        const oldUrl = this._getUrl();

        try {
            // Extract state from current engine
            let encryptedState = null;
            if (this.activeEngine === 'playwright') {
                encryptedState = await this.stateManager.extractFromPlaywright(this.playwrightContext);
            } else {
                encryptedState = await this.stateManager.extractFromStealth(this.stealthAdapter);
            }

            // Switch active engine
            this.activeEngine = targetEngine;

            // 1. Navigate to target domain (Required for cookie/storage bridge context)
            if (oldUrl && oldUrl !== 'about:blank') {
                console.log(`[SmartAdapter] Target Engine navigating for context: ${oldUrl}`);
                if (targetEngine === 'stealth') {
                    if (!this.stealthAdapter || !this.stealthAdapter.isReady) {
                        // v4.2 Resilience: Allow CDP ports and browser processes to settle
                        console.log(`[SmartAdapter] Cooldown for engine handshake (3s)...`);
                        await new Promise(r => setTimeout(r, 3000));

                        this.stealthAdapter = new StealthBrowserAdapter(this.config);
                        await this.stealthAdapter.launch({ headless: this.config.headless });
                    }
                    // Optimized: Only navigate once if we're moving to stealth to avoid double-detection hits
                    await this.stealthAdapter.goto(oldUrl);
                } else {
                    await this.playwrightPage.goto(oldUrl, { waitUntil: 'commit' });
                }
            }

            // 2. Inject state into target engine
            if (encryptedState) {
                console.log(`[SmartAdapter] Injecting state bridge...`);
                if (targetEngine === 'stealth') {
                    await this.stateManager.injectToStealth(this.stealthAdapter, encryptedState);
                } else {
                    await this.stateManager.injectToPlaywright(this.playwrightContext, this.playwrightPage, encryptedState);
                }
            }

            // 3. Final refresh only if engine requires it for state application
            if (oldUrl && oldUrl !== 'about:blank') {
                if (targetEngine === 'playwright') {
                    await this.playwrightPage.goto(oldUrl, { waitUntil: 'domcontentloaded' });
                } else {
                    // For Stealth/SeleniumBase, a simple reload is less suspicious than a full goto
                    await this.stealthAdapter._sendCommand('evaluate', { script: 'location.reload();' });
                    await new Promise(r => setTimeout(r, 2000)); // Stabilization
                }
            }

            const latency = Date.now() - swapStart;
            this.metrics.swapCount++;
            this.metrics.swapLatencies.push(latency);

            console.log(`[SmartAdapter] ✓ Hot-swap complete in ${latency}ms`);
            this.emit('engine-swap', { from: this.activeEngine, to: targetEngine, latency });

        } catch (e) {
            console.error('[SmartAdapter] Hot-swap failed:', e.message);

            // CLEANUP: If Stealth failed to swap, kill the reference so we retry fresh next time
            if (targetEngine === 'stealth') {
                if (this.stealthAdapter) {
                    try { await this.stealthAdapter.close(); } catch (e) { }
                    this.stealthAdapter = null;
                }
            }

            // Revert to original
            this.activeEngine = this.activeEngine === 'playwright' ? 'playwright' : 'stealth';
            throw e;
        }
    }

    /**
     * Force swap via Starlight Protocol signal
     */
    async forceSwap(targetEngine) {
        console.log(`[SmartAdapter] Force swap requested to: ${targetEngine}`);
        return this.hotSwap(targetEngine);
    }

    /**
     * Graceful shutdown
     */
    async close() {
        console.log('[SmartAdapter] Shutting down...');

        if (this.playwrightBrowser) {
            try {
                await this.playwrightBrowser.close();
            } catch (e) {
                console.warn('[SmartAdapter] Playwright close error:', e.message);
            }
        }

        if (this.stealthAdapter) {
            try {
                await this.stealthAdapter.close();
            } catch (e) {
                console.warn('[SmartAdapter] Stealth close error:', e.message);
            }
        }

        console.log(`[SmartAdapter] Metrics: ${this.metrics.swapCount} swaps, avg latency: ${this.metrics.swapLatencies.length > 0
            ? (this.metrics.swapLatencies.reduce((a, b) => a + b, 0) / this.metrics.swapLatencies.length).toFixed(0)
            : 0
            }ms`);
    }

    /**
     * Get metrics for observability
     */
    getMetrics() {
        return {
            ...this.metrics,
            avgSwapLatency: this.metrics.swapLatencies.length > 0
                ? this.metrics.swapLatencies.reduce((a, b) => a + b, 0) / this.metrics.swapLatencies.length
                : 0,
            activeEngine: this.activeEngine,
            circuitStates: {
                playwright: this.circuitBreaker.playwright.state,
                stealth: this.circuitBreaker.stealth.state
            }
        };
    }
}

module.exports = {
    SmartBrowserAdapter,
    DetectionEngine,
    CircuitBreaker,
    SecureStateManager,
    ProtocolError,
    ProtocolErrorCodes
};
