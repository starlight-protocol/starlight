/**
 * BrowserAdapter - Abstract Base Class for Cross-Browser Support
 * Part of Phase 14.1: Multi-Browser Foundation
 * 
 * PURPOSE:
 * Abstracts browser-specific implementations (Chromium, Firefox, WebKit) behind
 * a unified interface, ensuring the Starlight Protocol and Sentinels remain
 * 100% browser-agnostic.
 * 
 * DESIGN PRINCIPLES:
 * 1. Protocol Integrity: All adapters implement identical interfaces
 * 2. Graceful Degradation: Browser-specific features fail with clear warnings
 * 3. Performance: Minimal overhead, direct Playwright API access where possible
 * 4. Extensibility: Easy to add new browser engines (e.g., Brave, Edge)
 * 
 * @version 1.0.0
 * @author Dhiraj Das
 */

const { chromium, firefox, webkit, devices } = require('playwright');

/**
 * Base class defining the contract for all browser adapters.
 * Subclasses MUST implement all abstract methods.
 */
class BrowserAdapter {
    constructor(config = {}) {
        this.config = config;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.browserType = 'unknown';
        this.capabilities = {
            shadowDomPiercing: false,
            cdpAccess: false,
            touchEvents: false,
            deviceEmulation: false
        };
    }

    /**
     * Factory method to create the appropriate adapter based on config.
     * 
     * @param {Object} hubConfig - Hub configuration object
     * @returns {BrowserAdapter} Concrete adapter instance
     * 
     * @example
     * const adapter = await BrowserAdapter.create({ engine: 'firefox' });
     */
    static async create(hubConfig = {}) {
        const engine = hubConfig.engine || process.env.HUB_BROWSER_ENGINE || 'chromium';

        console.log(`[BrowserAdapter] Creating adapter for engine: ${engine}`);

        switch (engine.toLowerCase()) {
            case 'chromium':
                return new ChromiumAdapter(hubConfig);
            case 'firefox':
                return new FirefoxAdapter(hubConfig);
            case 'webkit':
                return new WebKitAdapter(hubConfig);
            default:
                console.warn(`[BrowserAdapter] Unknown engine "${engine}", falling back to Chromium`);
                return new ChromiumAdapter(hubConfig);
        }
    }

    /**
     * Launch the browser with specified options.
     * 
     * @param {Object} options - Browser launch options
     * @returns {Promise<Browser>} Playwright browser instance
     */
    async launch(options = {}) {
        throw new Error('BrowserAdapter.launch() must be implemented by subclass');
    }

    /**
     * Create a new browser context with optional device emulation.
     * 
     * @param {Object} options - Context options
     * @returns {Promise<BrowserContext>}
     */
    async newContext(options = {}) {
        throw new Error('BrowserAdapter.newContext() must be implemented by subclass');
    }

    /**
     * Create a new page in the current context.
     * 
     * @returns {Promise<Page>}
     */
    async newPage() {
        throw new Error('BrowserAdapter.newPage() must be implemented by subclass');
    }

    /**
     * Normalize a selector for browser compatibility.
     * Handles shadow DOM piercing, custom pseudo-selectors, etc.
     * 
     * @param {string} selector - Original selector
     * @returns {string} Normalized selector
     */
    normalizeSelector(selector) {
        // Base implementation: no transformation
        return selector;
    }

    /**
     * Get browser-specific capabilities.
     * 
     * @returns {Object} Capabilities object
     */
    getCapabilities() {
        return { ...this.capabilities };
    }

    /**
     * Close the browser gracefully.
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}

/**
 * Chromium Adapter - Reference Implementation
 * 
 * FEATURES:
 * - Full CDP (Chrome DevTools Protocol) access
 * - Shadow DOM piercing via >>> combinator
 * - Device emulation support
 * - Network interception
 */
class ChromiumAdapter extends BrowserAdapter {
    constructor(config) {
        super(config);
        this.browserType = 'chromium';
        this.capabilities = {
            shadowDomPiercing: true,
            cdpAccess: true,
            touchEvents: true,
            deviceEmulation: true
        };
    }

    async launch(options = {}) {
        console.log('[ChromiumAdapter] Launching Chromium browser...');

        const launchOptions = {
            headless: options.headless !== undefined ? options.headless : true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                ...(options.args || [])
            ],
            ...options
        };

        this.browser = await chromium.launch(launchOptions);
        console.log('[ChromiumAdapter] ✓ Chromium launched successfully');
        return this.browser;
    }

    async newContext(options = {}) {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        // Mobile device emulation support
        if (options.mobile?.enabled && options.mobile?.device) {
            const deviceDescriptor = devices[options.mobile.device];
            if (deviceDescriptor) {
                console.log(`[ChromiumAdapter] Emulating device: ${options.mobile.device}`);
                this.context = await this.browser.newContext({
                    ...deviceDescriptor,
                    ...options
                });
            } else {
                console.warn(`[ChromiumAdapter] Unknown device: ${options.mobile.device}`);
                this.context = await this.browser.newContext(options);
            }
        } else {
            this.context = await this.browser.newContext(options);
        }

        return this.context;
    }

    async newPage() {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        // Use context if available, otherwise create default context
        if (this.context) {
            this.page = await this.context.newPage();
        } else {
            this.page = await this.browser.newPage();
        }

        return this.page;
    }

    /**
     * Chromium supports >>> shadow DOM piercing combinator natively.
     */
    normalizeSelector(selector) {
        // No transformation needed - Chromium supports >>> directly
        return selector;
    }

    /**
     * Access CDP session for advanced Chromium features.
     */
    async getCDPSession() {
        if (!this.page) {
            throw new Error('Page not created. Call newPage() first.');
        }

        return await this.page.context().newCDPSession(this.page);
    }
}

/**
 * Firefox Adapter
 * 
 * FEATURES:
 * - Mozilla engine support
 * - Standard DOM APIs
 * - Limited shadow DOM support (manual traversal required)
 */
class FirefoxAdapter extends BrowserAdapter {
    constructor(config) {
        super(config);
        this.browserType = 'firefox';
        this.capabilities = {
            shadowDomPiercing: false,  // Firefox doesn't support >>> combinator
            cdpAccess: false,
            touchEvents: true,
            deviceEmulation: true
        };
    }

    async launch(options = {}) {
        console.log('[FirefoxAdapter] Launching Firefox browser...');

        const launchOptions = {
            headless: options.headless !== undefined ? options.headless : true,
            firefoxUserPrefs: {
                'dom.webdriver.enabled': false,
                'useAutomationExtension': false,
                ...(options.firefoxUserPrefs || {})
            },
            ...options
        };

        try {
            this.browser = await firefox.launch(launchOptions);
            console.log('[FirefoxAdapter] ✓ Firefox launched successfully');
            return this.browser;
        } catch (error) {
            if (error.message.includes('Executable doesn\'t exist')) {
                throw new Error(
                    'Firefox browser not installed. Run: npx playwright install firefox'
                );
            }
            throw error;
        }
    }

    async newContext(options = {}) {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        // Firefox has limited mobile emulation compared to Chromium
        if (options.mobile?.enabled) {
            console.warn('[FirefoxAdapter] Mobile emulation support is limited on Firefox');
            const deviceDescriptor = devices[options.mobile.device];
            if (deviceDescriptor) {
                // Use only viewport and userAgent, not full descriptor
                this.context = await this.browser.newContext({
                    viewport: deviceDescriptor.viewport,
                    userAgent: deviceDescriptor.userAgent,
                    ...options
                });
            } else {
                this.context = await this.browser.newContext(options);
            }
        } else {
            this.context = await this.browser.newContext(options);
        }

        return this.context;
    }

    async newPage() {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        if (this.context) {
            this.page = await this.context.newPage();
        } else {
            this.page = await this.browser.newPage();
        }

        return this.page;
    }

    /**
     * Firefox doesn't support >>> combinator.
     * Log warning and return original selector (will fail if truly in shadow DOM).
     */
    normalizeSelector(selector) {
        if (selector.includes('>>>')) {
            console.warn(
                `[FirefoxAdapter] Shadow DOM piercing (>>>) not supported on Firefox. ` +
                `Selector "${selector}" may fail. Use manual shadow root traversal.`
            );
            // Remove >>> and hope for the best (will work if not actually in shadow DOM)
            return selector.replace(/\s*>>>\s*/g, ' ');
        }
        return selector;
    }
}

/**
 * WebKit Adapter (Safari Engine)
 * 
 * FEATURES:
 * - Apple Safari engine
 * - iOS Safari compatibility testing
 * - Limited shadow DOM support
 */
class WebKitAdapter extends BrowserAdapter {
    constructor(config) {
        super(config);
        this.browserType = 'webkit';
        this.capabilities = {
            shadowDomPiercing: false,  // WebKit doesn't support >>> combinator
            cdpAccess: false,
            touchEvents: true,
            deviceEmulation: true
        };
    }

    async launch(options = {}) {
        console.log('[WebKitAdapter] Launching WebKit browser...');

        const launchOptions = {
            headless: options.headless !== undefined ? options.headless : true,
            ...options
        };

        try {
            this.browser = await webkit.launch(launchOptions);
            console.log('[WebKitAdapter] ✓ WebKit launched successfully');
            return this.browser;
        } catch (error) {
            if (error.message.includes('Executable doesn\'t exist')) {
                throw new Error(
                    'WebKit browser not installed. Run: npx playwright install webkit'
                );
            }
            throw error;
        }
    }

    async newContext(options = {}) {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        // WebKit has good iOS device emulation
        if (options.mobile?.enabled && options.mobile?.device) {
            const deviceDescriptor = devices[options.mobile.device];
            if (deviceDescriptor) {
                console.log(`[WebKitAdapter] Emulating iOS device: ${options.mobile.device}`);
                this.context = await this.browser.newContext({
                    ...deviceDescriptor,
                    ...options
                });
            } else {
                this.context = await this.browser.newContext(options);
            }
        } else {
            this.context = await this.browser.newContext(options);
        }

        return this.context;
    }

    async newPage() {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        if (this.context) {
            this.page = await this.context.newPage();
        } else {
            this.page = await this.browser.newPage();
        }

        return this.page;
    }

    /**
     * WebKit doesn't support >>> combinator.
     * Log warning and strip it from selector.
     */
    normalizeSelector(selector) {
        if (selector.includes('>>>')) {
            console.warn(
                `[WebKitAdapter] Shadow DOM piercing (>>>) not supported on WebKit. ` +
                `Selector "${selector}" may fail. Consider manual shadow root traversal.`
            );
            return selector.replace(/\s*>>>\s*/g, ' ');
        }
        return selector;
    }
}

module.exports = {
    BrowserAdapter,
    ChromiumAdapter,
    FirefoxAdapter,
    WebKitAdapter
};
