/**
 * StealthBrowserAdapter - SeleniumBase Integration for Bot Detection Bypass
 * 
 * Uses SeleniumBase with undetected-chromedriver (uc=True) for sites with
 * aggressive bot detection (Akamai, Cloudflare, etc.).
 * 
 * Spawns Python subprocess and communicates via JSON-RPC over stdin/stdout.
 * 
 * @version 1.0.0
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { EventEmitter } = require('events');
const { nanoid } = require('nanoid');

/**
 * StealthBrowserAdapter - Wraps SeleniumBase Python driver
 * Implements same interface as Playwright adapters for seamless integration.
 */
class StealthBrowserAdapter extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.process = null;
        this.rl = null;
        this.pendingRequests = new Map();
        this.page = null; // Proxy object for page operations
        this.isReady = false;
        this.browserType = 'seleniumbase-uc'; // Required by Hub

        // Polyfill State
        this.exposedFunctions = new Map();
        this.initScripts = [];
        this.currentUrl = 'about:blank';
        this.pollingActive = false;
    }

    /**
     * Get browser capabilities (matches Playwright adapter interface)
     */
    getCapabilities() {
        return {
            shadowDomPiercing: false,  // SeleniumBase doesn't have native shadow piercing
            cdpAccess: false,
            touchEvents: true,
            deviceEmulation: true,
            stealthMode: true  // Key differentiator
        };
    }

    /**
     * Launch the stealth browser via Python subprocess
     */
    async launch(options = {}) {
        console.log('[StealthBrowserAdapter] Launching SeleniumBase UC driver...');

        const pythonPath = process.env.PYTHON_PATH || 'python';
        const driverPath = path.join(__dirname, 'stealth_driver.py');

        this.process = spawn(pythonPath, [driverPath], {
            cwd: path.join(__dirname, '..'),
            stdio: ['pipe', 'pipe', 'inherit'], // Inherit stderr to see Python logs
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1'
            }
        });

        // Ensure robust cleanup
        const cleanup = () => {
            if (this.process && !this.process.killed) {
                this.process.kill();
            }
        };
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(); });
        process.on('SIGTERM', () => { cleanup(); process.exit(); });

        // Handle stderr (logging from Python)
        // Stderr is inherited, so it logs directly to console
        // this.process.stderr.on('data', ...) is not needed and causes error because stderr is null

        // Setup readline for JSON-RPC responses
        this.rl = readline.createInterface({
            input: this.process.stdout,
            crlfDelay: Infinity
        });

        this.rl.on('line', (line) => {
            try {
                const response = JSON.parse(line);
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    this.pendingRequests.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message || response.error));
                    } else {
                        pending.resolve(response.result);
                    }
                }
            } catch (e) {
                console.error('[StealthBrowserAdapter] Failed to parse response:', line);
            }
        });

        this.process.on('exit', (code) => {
            console.log(`[StealthBrowserAdapter] Python driver exited with code ${code}`);
            this.isReady = false;
        });

        // Initialize the driver
        const headless = options.headless !== undefined ? options.headless : this.config.headless;
        const result = await this._sendCommand('initialize', { headless });

        console.log('[StealthBrowserAdapter] ✓ SeleniumBase ready:', result);
        this.isReady = true;

        return this;
    }

    async close() {
        if (this.process && !this.process.killed) {
            try {
                console.log('[StealthAdapter] Sending close command with 2s timeout...');
                // Give it 2 seconds to close gracefully
                await this._sendCommand('close', {}, 2000);
            } catch (e) {
                console.log('[StealthAdapter] Graceful close timed out or failed, killing process.');
            }

            try {
                this.process.kill('SIGKILL');
            } catch (e) { }
        }
        this.isReady = false;
    }

    /**
     * Top-level navigation (delegates to page proxy)
     */
    async goto(url) {
        if (!this.page) await this.newPage();
        return this.page.goto(url);
    }

    /**
     * Create page proxy object (matches Playwright interface)
     */
    async newPage() {
        // Create a proxy object that mimics Playwright's page interface
        this.page = {
            goto: async (url, options = {}) => {
                const result = await this._sendCommand('goto', { url });
                if (result && result.status === 'error') {
                    throw new Error(`[StealthDriver] goto failed: ${result.message || 'Unknown error'}`);
                }

                // Polyfill: Run init scripts after navigation
                for (const script of this.initScripts) {
                    await this.page.evaluate(script).catch(e => {
                        console.warn(`[StealthAdapter] Init script failed after goto: ${e.message}`);
                    });
                }

                // Ensure the RPC queue exists
                await this.page.evaluate(() => {
                    if (!window.__starlight_rpc_queue) window.__starlight_rpc_queue = [];
                });

                if (result && result.url) {
                    this.currentUrl = result.url;
                }
                return result;
            },
            url: () => this.currentUrl,

            click: async (selector, options = {}) => {
                const normalized = this.normalizeSelector(selector);

                // Shadow-Piercing Polyfill (Specialized for H&M)
                if (selector.includes('>>>')) {
                    console.log(`[StealthAdapter] 🛡️ Shadow-Piercing CLICK triggered: ${selector}`);
                    return await this.page.evaluate((sel) => {
                        function findInShadow(root, selector) {
                            const parts = selector.split('>>>').map(s => s.trim());
                            let current = root;

                            for (const part of parts) {
                                if (!current) return null;
                                // If current is a host, pierce into it
                                const searchRoot = current.shadowRoot || current;
                                current = searchRoot.querySelector(part);
                            }
                            return current;
                        }
                        const el = findInShadow(document, sel);
                        if (el) {
                            el.click();
                            return { status: 'ok', source: 'shadow-polyfill' };
                        }
                        throw new Error(`Element not found in shadow: ${sel}`);
                    }, selector);
                }

                const result = await this._sendCommand('click', { selector: normalized });
                if (result && result.status === 'error') {
                    throw new Error(`[StealthDriver] click failed: ${result.message || 'Unknown error'}`);
                }
                return result;
            },

            fill: async (selector, value, options = {}) => {
                const normalized = this.normalizeSelector(selector);
                console.log(`[StealthAdapter] fill ordered: "${value}" -> ${normalized}`);

                // Shadow-Piercing Polyfill
                if (selector.includes('>>>')) {
                    console.log(`[StealthAdapter] 🛡️ Shadow-Piercing FILL triggered: ${selector}`);
                    return await this.page.evaluate((sel, val) => {
                        function findInShadow(root, selector) {
                            const parts = selector.split('>>>').map(s => s.trim());
                            let current = root;
                            for (const part of parts) {
                                if (!current) return null;
                                const searchRoot = current.shadowRoot || current;
                                current = searchRoot.querySelector(part);
                            }
                            return current;
                        }
                        const el = findInShadow(document, sel);
                        if (el) {
                            el.value = val;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return { status: 'ok', source: 'shadow-polyfill' };
                        }
                        throw new Error(`Input not found in shadow: ${sel}`);
                    }, selector, value);
                }

                const result = await this._sendCommand('fill', { selector: normalized, value });
                console.log(`[StealthAdapter] fill result:`, result);
                if (result && result.status === 'error') {
                    throw new Error(`[StealthDriver] fill failed: ${result.message || 'Unknown error'}`);
                }
                return result;
            },

            type: async (selector, text, options = {}) => {
                const normalized = this.normalizeSelector(selector);
                const result = await this._sendCommand('type', { selector: normalized, text });
                if (result && result.status === 'error') {
                    throw new Error(`[StealthDriver] type failed: ${result.message || 'Unknown error'}`);
                }
                return result;
            },

            keyboard: {
                type: async (text) => {
                    // Pre-Action Focus Hook (Proxied to Python Driver)
                    await this._sendCommand('execute_script', {
                        script: `
                        const el = document.activeElement;
                        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.focus();
                            el.click();
                        }`
                    });
                    const result = await this._sendCommand('type', { text });
                    if (result && result.status === 'error') {
                        throw new Error(`[StealthDriver] keyboard.type failed: ${result.message || 'Unknown error'}`);
                    }
                    return result;
                },
                press: async (key) => {
                    // Pre-Action Focus Hook (Proxied to Python Driver)
                    await this._sendCommand('execute_script', {
                        script: `
                        const el = document.activeElement;
                        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                            el.focus();
                            el.click();
                        }`
                    });
                    const result = await this._sendCommand('press', { key });
                    if (result && result.status === 'error') {
                        throw new Error(`[StealthDriver] keyboard.press failed: ${result.message || 'Unknown error'}`);
                    }
                    return result;
                }
            },

            press: async (selector, key, options = {}) => {
                if (key === undefined) {
                    return this.page.keyboard.press(selector);
                }

                const normalized = this.normalizeSelector(selector);
                const result = await this._sendCommand('press', { selector: normalized, key });
                if (result && result.status === 'error') {
                    throw new Error(`[StealthDriver] press failed: ${result.message || 'Unknown error'}`);
                }
                return result;
            },

            screenshot: async (options = {}) => {
                const result = await this._sendCommand('screenshot', {});

                if (!result || !result.data) {
                    console.error('[StealthAdapter] Python driver returned empty screenshot data');
                    return null;
                }

                const buffer = Buffer.from(result.data, 'base64');

                // If path is provided (from Hub), save it to disk
                if (options.path) {
                    const fs = require('fs');
                    fs.writeFileSync(options.path, buffer);
                    console.log(`[StealthAdapter] Screenshot saved to: ${options.path}`);
                }

                return buffer;
            },

            url: () => this._sendCommand('get_url', {}).then(r => r.url),

            evaluate: async (fn, ...args) => {
                // Embed arguments directly into the script to bypass Selenium/CDP argument passing limitations
                // This assumes args are JSON-serializable (strings, numbers, objects), which holds true for Hub intents.
                const argsJson = JSON.stringify(args);

                const rawScript = typeof fn === 'function'
                    ? `(function() { 
                        var args = ${argsJson};
                        var f = ${fn.toString()}; 
                        return f.apply(null, args); 
                       })()`
                    : fn;

                // Encode to Base64 to safely transport complex scripts
                const script = Buffer.from(rawScript).toString('base64');

                console.log(`[StealthAdapter] DEBUG: Sending evaluate with ${args.length} args:`, JSON.stringify(args));
                const result = await this._sendCommand('evaluate', { script, args, encoding: 'base64' });
                return result.result;
            },

            title: async () => {
                const result = await this._sendCommand('evaluate', { script: 'document.title' });
                return result.result;
            },

            isClosed: () => !this.isReady,

            dispatchEvent: async (selector, type, eventInit, options) => {
                const normalized = this.normalizeSelector(selector);
                console.log(`[StealthBrowserAdapter] dispatchEvent: ${type} on ${normalized} (Original: ${selector})`);

                // If it's an XPath, we need different evaluate logic
                const isXPath = normalized.startsWith('//') || normalized.startsWith('(');

                return await this.page.evaluate((s, t, isX) => {
                    // Shadow-Piercing Finder
                    function findInShadow(root, sel, isXPath) {
                        try {
                            const found = isXPath
                                ? document.evaluate(sel, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
                                : root.querySelector(sel);
                            if (found) return found;

                            const children = root.querySelectorAll('*');
                            for (const child of children) {
                                if (child.shadowRoot) {
                                    const inShadow = findInShadow(child.shadowRoot, sel, isXPath);
                                    if (inShadow) return inShadow;
                                }
                            }
                        } catch (e) { }
                        return null;
                    }

                    const el = findInShadow(document, s, isX);

                    if (el) {
                        const ev = new Event(t, { bubbles: true, cancelable: true });
                        el.dispatchEvent(ev);
                        return true;
                    }
                    return false;
                }, normalized, type, isXPath);
            },

            close: async () => {
                await this.close();
            },

            waitForSelector: async (selector, options = {}) => {
                // SeleniumBase has built-in wait, just verify element exists
                await this._sendCommand('evaluate', {
                    script: `document.querySelector('${selector}')`
                });
                return true;
            },

            waitForTimeout: async (ms) => {
                await new Promise(r => setTimeout(r, ms));
            },

            // Event emitter compatibility (no-op stubs for Hub compatibility)
            // SeleniumBase handles dialogs/popups automatically
            _eventListeners: new Map(),

            on: (event, handler) => {
                // Store handler but SeleniumBase handles events internally
                if (!this.page._eventListeners.has(event)) {
                    this.page._eventListeners.set(event, []);
                }
                this.page._eventListeners.get(event).push(handler);
                console.log(`[StealthBrowserAdapter] Registered handler for '${event}' (no-op in stealth mode)`);
                return this.page;
            },

            off: (event, handler) => {
                if (this.page._eventListeners.has(event)) {
                    const handlers = this.page._eventListeners.get(event);
                    const idx = handlers.indexOf(handler);
                    if (idx > -1) handlers.splice(idx, 1);
                }
                return this.page;
            },

            once: (event, handler) => {
                const wrappedHandler = (...args) => {
                    this.page.off(event, wrappedHandler);
                    handler(...args);
                };
                return this.page.on(event, wrappedHandler);
            },

            // Playwright addInitScript compatibility (no-op in stealth mode)
            // SeleniumBase doesn't support pre-page-load script injection
            addInitScript: async (script) => {
                console.log('[StealthBrowserAdapter] addInitScript registered');
                this.initScripts.push(script);

                // If page is already active, try to run it now too
                if (this.isReady && this.page) {
                    await this.page.evaluate(script).catch(() => { });
                }
                return;
            },

            // Playwright exposeFunction compatibility (no-op in stealth mode)
            exposeFunction: async (name, fn) => {
                console.log(`[StealthBrowserAdapter] exposeFunction polyfill for '${name}'`);
                this.exposedFunctions.set(name, fn);

                // Inject shim on page
                if (this.isReady && this.page) {
                    await this.page.evaluate((name) => {
                        if (!window.__starlight_rpc_queue) window.__starlight_rpc_queue = [];
                        window[name] = function (data) {
                            window.__starlight_rpc_queue.push({ name: name, data: data });
                        };
                    }, name).catch(e => console.error(`[StealthAdapter] exposeFunction shim failed: ${e.message}`));
                }

                // Start poller if not active
                if (!this.pollingActive) {
                    this.startRPCPoller();
                }
                return;
            },

            // Context reference for CDP compatibility checks
            context: () => ({
                newCDPSession: async () => {
                    // CDP not available in SeleniumBase
                    throw new Error('CDP not available in stealth mode');
                }
            })
        };

        // Explicitly bind proxy methods to the adapter instance to ensure correct 'this'
        Object.keys(this.page).forEach(key => {
            if (typeof this.page[key] === 'function') {
                this.page[key] = this.page[key].bind(this);
            }
        });

        console.log('[StealthBrowserAdapter] ✓ Page proxy created');
        return this.page;
    }

    /**
     * Create browser context (no-op for SeleniumBase, included for interface compatibility)
     */
    async newContext(options = {}) {
        // SeleniumBase manages its own context
        return {};
    }

    /**
     * Close the browser
     */
    async close() {
        console.log('[StealthBrowserAdapter] Closing...');
        this.pollingActive = false;

        if (this.isReady) {
            try {
                await this._sendCommand('close', {});
            } catch (e) {
                // Ignore errors during close
            }
        }

        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }

        console.log('[StealthBrowserAdapter] ✓ Closed');
    }

    /**
     * Normalize selector (interface compatibility)
     * Converts Playwright-specific selectors to CSS or XPath
     * Complete implementation handling all Janitor patterns
     */
    normalizeSelector(selector) {
        if (!selector) return selector;

        // 0. Handle comma-separated lists (pick first for CSS, join with | for XPath)
        if (selector.includes(',') && !selector.match(/["'][^"']*,[^"']*["']/)) {
            const parts = selector.split(',').map(s => this.normalizeSelector(s.trim()));
            const hasXPath = parts.some(p => p.startsWith('//') || p.startsWith('('));
            return hasXPath ? parts.filter(p => p.startsWith('//')).join(' | ') || parts[0] : parts[0];
        }

        // 1. Remove Playwright visibility suffix
        let normalized = selector.replace(/\s*>>\s*visible=true/gi, '');

        // 2. Detect shadow pierce (Used by Click/Fill polyfills)
        // Note: We don't remove it here if we want to use the polyfill
        // But for commands that MUST go to Selenium, we collapse it
        const isShadow = selector.includes('>>>');

        // 3. Handle :has-text() → XPath (case-insensitive)
        const hasTextMatch = normalized.match(/^([a-zA-Z0-9*_-]*):has-text\(['"](.*?)['"]\)$/);
        if (hasTextMatch) {
            const tag = hasTextMatch[1] || '*';
            const txt = hasTextMatch[2].toLowerCase();
            const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', L = 'abcdefghijklmnopqrstuvwxyz';
            return `//${tag}[contains(translate(text(),'${U}','${L}'),"${txt}") or contains(translate(@value,'${U}','${L}'),"${txt}")]`;
        }

        // Collapse shadow pierce for standard Selenium commands
        if (isShadow) {
            normalized = normalized.replace(/\s*>>>\s*/g, ' ');
        }

        // 4. Handle nested parent + :has-text (e.g., ".modal button:has-text('Close')")
        const nestedMatch = normalized.match(/^(.+?)\s+([a-zA-Z0-9*_-]*):has-text\(['"](.*?)['"]\)$/);
        if (nestedMatch) {
            const parent = nestedMatch[1];
            const tag = nestedMatch[2] || '*';
            const txt = nestedMatch[3].toLowerCase();
            const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', L = 'abcdefghijklmnopqrstuvwxyz';
            // Convert parent CSS to basic XPath
            const parentXPath = parent.startsWith('#')
                ? `//*[@id="${parent.slice(1)}"]`
                : parent.startsWith('.')
                    ? `//*[contains(@class,"${parent.slice(1).replace(/\./g, ' ')}")]`
                    : `//${parent}`;
            return `${parentXPath}//${tag}[contains(translate(text(),'${U}','${L}'),"${txt}")]`;
        }

        // 5. Handle :text() → XPath
        const textMatch = normalized.match(/^:text\(['"](.*?)['"]\)$/i);
        if (textMatch) {
            const txt = textMatch[1].toLowerCase();
            const U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', L = 'abcdefghijklmnopqrstuvwxyz';
            return `//*[contains(translate(text(),'${U}','${L}'),"${txt}")]`;
        }

        // 6. Handle :first-of-type → XPath positional
        const firstMatch = normalized.match(/^([a-zA-Z0-9_-]+):first-of-type$/i);
        if (firstMatch) {
            return `(//${firstMatch[1]})[1]`;
        }

        // 7. Handle :nth-child(n) → XPath positional
        const nthMatch = normalized.match(/^([a-zA-Z0-9_-]+):nth-child\((\d+)\)$/i);
        if (nthMatch) {
            return `(//${nthMatch[1]})[${nthMatch[2]}]`;
        }

        // 8. Handle [role="..."] → XPath attribute
        const roleMatch = normalized.match(/^\[role=['"](.*?)['"]\]$/);
        if (roleMatch) {
            return `//*[@role="${roleMatch[1]}"]`;
        }

        // 9. Handle tag[role="..."] patterns
        const tagRoleMatch = normalized.match(/^([a-zA-Z]+)\[role=['"](.*?)['"]\]$/);
        if (tagRoleMatch) {
            return `//${tagRoleMatch[1]}[@role="${tagRoleMatch[2]}"]`;
        }

        return normalized;
    }

    /**
     * Send JSON-RPC command to Python driver
     * @private
     */
    _sendCommand(method, params, timeout = 60000) {
        return new Promise((resolve, reject) => {
            const id = nanoid();

            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Timeout waiting for ${method}`));
            }, timeout);

            this.pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timer);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            });

            const request = JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id
            });

            console.log(`[StealthAdapter] Writing to stdin: ${method}`);
            this.process.stdin.write(request + '\n');
        });
    }

    /**
     * Start the poll loop for exposed functions
     * @private
     */
    async startRPCPoller() {
        if (this.pollingActive) return;
        this.pollingActive = true;

        console.log('[StealthAdapter] Starting RPC poller for exposeFunction...');

        while (this.isReady && this.pollingActive) {
            try {
                // Check for queued calls from the page
                const calls = await this.page.evaluate(() => {
                    if (!window.__starlight_rpc_queue || window.__starlight_rpc_queue.length === 0) return [];
                    const items = window.__starlight_rpc_queue;
                    window.__starlight_rpc_queue = [];
                    return items;
                });

                if (calls && calls.length > 0) {
                    for (const call of calls) {
                        const fn = this.exposedFunctions.get(call.name);
                        if (fn) {
                            console.log(`[StealthAdapter] 📬 Received RPC: ${call.name}`);
                            try {
                                fn(call.data);
                            } catch (e) {
                                console.error(`[StealthAdapter] Error in exposed function '${call.name}':`, e);
                            }
                        }
                    }
                }
            } catch (e) {
                // Expected errors if page navigates or is closed
            }

            // Poll interval (500ms balance between latency and CPU)
            await new Promise(r => setTimeout(r, 500));
        }

        this.pollingActive = false;
    }
}

module.exports = { StealthBrowserAdapter };
