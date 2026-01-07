/**
 * Starlight Warp - Browser Context Serialization
 * Phase 17: Deep Mesh Intelligence
 * 
 * Captures complete browser state for instant failure triage.
 * All data is sanitized by default to protect PII and secrets.
 * 
 * Security: Data is sanitized before write, optionally encrypted.
 * 
 * @author Dhiraj Das
 * @license MIT
 */

const fs = require('fs').promises;
const path = require('path');
const { WarpSanitizer } = require('./warp_sanitizer');

class StarlightWarp {
    constructor(page, config = {}) {
        this.page = page;
        this.config = {
            outputDir: config.outputDir || './warps',
            sanitize: config.sanitize !== false, // Default: true
            encrypt: config.encrypt || false,
            encryptionKey: config.encryptionKey || null,
            whitelist: config.whitelist || [],
            maxDomSize: config.maxDomSize || 5 * 1024 * 1024, // 5MB limit
            captureScreenshot: config.captureScreenshot !== false,
            captureConsole: config.captureConsole !== false,
            captureNetwork: config.captureNetwork !== false
        };

        this.sanitizer = new WarpSanitizer({
            encrypt: this.config.encrypt,
            encryptionKey: this.config.encryptionKey,
            whitelist: this.config.whitelist
        });

        // Console log buffer
        this.consoleLogs = [];
        this.networkRequests = [];

        // Warning flags
        this.warnings = [];
    }

    /**
     * Initialize warp capture (call early in session)
     */
    async initialize() {
        if (!this.page) {
            throw new Error('[Warp] No page provided');
        }

        // Capture console logs
        if (this.config.captureConsole) {
            this.page.on('console', msg => {
                this.consoleLogs.push({
                    type: msg.type(),
                    text: msg.text(),
                    timestamp: new Date().toISOString()
                });

                // Limit buffer size
                if (this.consoleLogs.length > 500) {
                    this.consoleLogs.shift();
                }
            });
        }

        // Capture network requests
        if (this.config.captureNetwork) {
            this.page.on('request', request => {
                this.networkRequests.push({
                    id: request.url(),
                    method: request.method(),
                    url: request.url(),
                    headers: request.headers(),
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });

                if (this.networkRequests.length > 200) {
                    this.networkRequests.shift();
                }
            });

            this.page.on('response', response => {
                const req = this.networkRequests.find(r => r.url === response.url());
                if (req) {
                    req.status = response.status();
                    req.statusText = response.statusText();
                }
            });
        }

        console.log('[Warp] Initialized - capturing console and network');
    }

    /**
     * Capture current browser state to a .warp file
     * @param {string} reason - Why the warp was captured (e.g., "mission_failure")
     * @returns {string} Path to the saved warp file
     */
    async capture(reason = 'manual') {
        console.log(`[Warp] Capturing browser state (reason: ${reason})...`);

        const startTime = Date.now();
        this.warnings = [];

        try {
            // Collect all browser data
            const rawData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                reason: reason,
                url: this.page.url(),

                // Browser context
                storage: await this.captureStorage(),
                cookies: await this.captureCookies(),
                dom: await this.captureDOM(),
                screenshot: await this.captureScreenshot(),
                console: this.consoleLogs.slice(-100), // Last 100 logs
                network: this.captureNetworkState(),

                // Metadata
                viewportSize: await this.page.viewportSize(),
                userAgent: await this.page.evaluate(() => navigator.userAgent)
            };

            // Security: Sanitize all data
            let processedData;
            if (this.config.sanitize) {
                processedData = this.sanitizer.sanitize(rawData);
                console.log(`[Warp] Sanitized: ${processedData._piiRemoved} items redacted`);
            } else {
                // SECURITY WARNING
                this.warnings.push('⚠️ UNSANITIZED WARP - May contain PII/secrets');
                console.warn('[Warp] ⚠️ WARNING: Creating unsanitized warp file!');
                processedData = {
                    ...rawData,
                    _sanitized: false,
                    _securityWarning: 'This file may contain sensitive data'
                };
            }

            // Add capture metadata
            processedData._captureMs = Date.now() - startTime;
            processedData._warnings = this.warnings;

            // Save to file
            const filepath = await this.save(processedData, reason);

            console.log(`[Warp] Captured in ${processedData._captureMs}ms: ${filepath}`);
            return filepath;

        } catch (error) {
            console.error(`[Warp] Capture failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Capture localStorage and sessionStorage
     */
    async captureStorage() {
        try {
            return await this.page.evaluate(() => {
                const local = {};
                const session = {};

                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    local[key] = localStorage.getItem(key);
                }

                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    session[key] = sessionStorage.getItem(key);
                }

                return { local, session };
            });
        } catch (e) {
            this.warnings.push(`Storage capture failed: ${e.message}`);
            return { local: {}, session: {} };
        }
    }

    /**
     * Capture cookies
     */
    async captureCookies() {
        try {
            const context = this.page.context();
            return await context.cookies();
        } catch (e) {
            this.warnings.push(`Cookie capture failed: ${e.message}`);
            return [];
        }
    }

    /**
     * Capture DOM snapshot
     */
    async captureDOM() {
        try {
            const html = await this.page.content();

            if (html.length > this.config.maxDomSize) {
                this.warnings.push(`DOM truncated (${html.length} > ${this.config.maxDomSize})`);
                return html.substring(0, this.config.maxDomSize) + '\n<!-- TRUNCATED -->';
            }

            return html;
        } catch (e) {
            this.warnings.push(`DOM capture failed: ${e.message}`);
            return '';
        }
    }

    /**
     * Capture screenshot
     */
    async captureScreenshot() {
        if (!this.config.captureScreenshot) {
            return null;
        }

        try {
            const buffer = await this.page.screenshot({ type: 'png' });
            return buffer.toString('base64');
        } catch (e) {
            this.warnings.push(`Screenshot failed: ${e.message}`);
            return null;
        }
    }

    /**
     * Get current network state
     */
    captureNetworkState() {
        const pending = this.networkRequests.filter(r => r.status === 'pending');
        const completed = this.networkRequests.filter(r => r.status !== 'pending').slice(-50);

        return { pending, completed };
    }

    /**
     * Save warp data to file
     */
    async save(data, reason) {
        // Ensure output directory exists
        await fs.mkdir(this.config.outputDir, { recursive: true });

        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `warp_${reason}_${timestamp}.warp`;
        const filepath = path.join(this.config.outputDir, filename);

        // Write file
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));

        return filepath;
    }

    /**
     * Restore browser state from a .warp file
     * @param {string} filepath - Path to .warp file
     * @param {Object} options - Restore options
     */
    async restore(filepath, options = {}) {
        console.log(`[Warp] Restoring from: ${filepath}`);

        const content = await fs.readFile(filepath, 'utf8');
        let data = JSON.parse(content);

        // Handle encrypted files
        if (data._encrypted) {
            if (!this.config.encryptionKey) {
                throw new Error('[Warp] File is encrypted but no decryption key provided');
            }
            data = WarpSanitizer.decrypt(data, this.config.encryptionKey);
        }

        // Warning if restoring sanitized data
        if (data._sanitized) {
            console.warn('[Warp] Restoring sanitized warp - some values are redacted');
        }

        // Restore navigation
        if (options.restoreUrl !== false && data.url) {
            await this.page.goto(data.url, { waitUntil: 'domcontentloaded' });
        }

        // Restore cookies
        if (options.restoreCookies !== false && data.cookies?.length) {
            const context = this.page.context();
            // Filter out redacted cookies
            const validCookies = data.cookies.filter(c =>
                !c.value?.includes('[REDACTED')
            );
            if (validCookies.length > 0) {
                await context.addCookies(validCookies);
            }
        }

        // Restore storage
        if (options.restoreStorage !== false && data.storage) {
            await this.page.evaluate((storage) => {
                // Restore localStorage
                for (const [key, value] of Object.entries(storage.local || {})) {
                    if (!value?.includes('[REDACTED')) {
                        try {
                            localStorage.setItem(key, value);
                        } catch (e) { }
                    }
                }

                // Restore sessionStorage
                for (const [key, value] of Object.entries(storage.session || {})) {
                    if (!value?.includes('[REDACTED')) {
                        try {
                            sessionStorage.setItem(key, value);
                        } catch (e) { }
                    }
                }
            }, data.storage);
        }

        console.log('[Warp] Restore complete');
        return data;
    }

    /**
     * List available warp files
     */
    async listWarps() {
        try {
            const files = await fs.readdir(this.config.outputDir);
            return files
                .filter(f => f.endsWith('.warp'))
                .map(f => path.join(this.config.outputDir, f))
                .sort()
                .reverse();
        } catch (e) {
            return [];
        }
    }

    /**
     * Delete old warp files (cleanup)
     * @param {number} maxAge - Max age in hours
     */
    async cleanup(maxAge = 24) {
        const files = await this.listWarps();
        const cutoff = Date.now() - (maxAge * 60 * 60 * 1000);
        let deleted = 0;

        for (const filepath of files) {
            const stat = await fs.stat(filepath);
            if (stat.mtimeMs < cutoff) {
                await fs.unlink(filepath);
                deleted++;
            }
        }

        console.log(`[Warp] Cleanup: deleted ${deleted} old files`);
        return deleted;
    }
}

module.exports = { StarlightWarp };
