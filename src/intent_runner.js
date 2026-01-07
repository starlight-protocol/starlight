/**
 * Starlight Intent Helper
 * Event-driven command execution for reliable test missions.
 * Replaces fragile setTimeout-based patterns with response-driven flow.
 */

const WebSocket = require('ws');

class IntentRunner {
    constructor(hubUrl = 'ws://localhost:8080') {
        this.hubUrl = hubUrl;
        this.ws = null;
        this.pendingCommands = new Map();
        this.commandIdCounter = 0;
        this.onContextUpdate = null;
    }

    /**
     * Connect to the Starlight Hub.
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.hubUrl);

            this.ws.on('open', () => {
                console.log('[IntentRunner] Connected to Starlight Hub');
                resolve();
            });

            this.ws.on('message', (data) => {
                const msg = JSON.parse(data);
                if (this.onMessage) {
                    this.onMessage(msg);
                }
                this._handleMessage(msg);
            });

            this.ws.on('error', (err) => {
                console.error('[IntentRunner] WebSocket error:', err.message);
                reject(err);
            });

            this.ws.on('close', () => {
                console.log('[IntentRunner] Connection closed');
            });
        });
    }

    _handleMessage(msg) {
        // Internal Protocol Tracking
        const msgType = msg.method || msg.type;

        if (msgType === 'starlight.hijack') {
            console.log(`[IntentRunner] 🛡️ Sentinel Hijack Detected: ${msg.params?.sentinel || msg.sentinel}`);
            this.lastActionHijacked = true;
            this.hijackDetails = msg;
        }

        if (msg.type === 'COMMAND_COMPLETE') {
            const pending = this.pendingCommands.get(msg.id);
            if (pending) {
                this.pendingCommands.delete(msg.id);
                if (msg.success) {
                    pending.resolve(msg);
                } else {
                    const desc = pending.cmdDesc || msg.id;
                    const reason = msg.error || 'Unknown error';
                    pending.reject(new Error(`Failed: ${desc} - ${reason}`));
                }
            }
        } else if (msg.method === 'starlight.sovereign_update' && this.onContextUpdate) {
            this.onContextUpdate(msg.params.context);
        }
    }

    /**
     * Navigate to a URL and wait for completion.
     * @param {string} url - Target URL
     * @returns {Promise<object>} Command result
     */
    async goto(url) {
        return this._sendCommand({ cmd: 'goto', url });
    }

    /**
     * Click an element by selector.
     * @param {string} selector - CSS selector
     * @returns {Promise<object>} Command result
     */
    async click(selector) {
        return this._sendCommand({ cmd: 'click', selector });
    }

    /**
     * Click an element by semantic goal (text/ARIA).
     * @param {string} goal - Semantic goal text
     * @param {object} context - Optional context metadata
     * @returns {Promise<object>} Command result
     */
    async clickGoal(goal, context = {}) {
        return this._sendCommand({ cmd: 'click', goal, context });
    }

    /**
     * Fill a text input.
     * @param {string} selector - CSS selector
     * @param {string} text - Text to fill
     * @returns {Promise<object>} Command result
     */
    async fill(selector, text) {
        return this._sendCommand({ cmd: 'fill', selector, text });
    }

    /**
     * Fill a form input by semantic goal (label text, placeholder, aria-label).
     * The Hub resolves the input selector automatically.
     * @param {string} goal - Semantic goal (e.g., 'Search', 'Email', 'Password')
     * @param {string} text - Text to fill
     * @param {object} context - Optional context metadata
     * @returns {Promise<object>} Command result
     */
    async fillGoal(goal, text, context = {}) {
        return this._sendCommand({ cmd: 'fill', goal, text, context });
    }

    // === SELECT (Dropdown) ===
    async select(selector, value) {
        return this._sendCommand({ cmd: 'select', selector, value });
    }
    async selectGoal(goal, value, context = {}) {
        return this._sendCommand({ cmd: 'select', goal, value, context });
    }

    // === HOVER ===
    async hover(selector) {
        return this._sendCommand({ cmd: 'hover', selector });
    }
    async hoverGoal(goal, context = {}) {
        return this._sendCommand({ cmd: 'hover', goal, context });
    }

    // === CHECK/UNCHECK (Checkbox) ===
    async check(selector) {
        return this._sendCommand({ cmd: 'check', selector });
    }
    async checkGoal(goal, context = {}) {
        return this._sendCommand({ cmd: 'check', goal, context });
    }
    async uncheck(selector) {
        return this._sendCommand({ cmd: 'uncheck', selector });
    }
    async uncheckGoal(goal, context = {}) {
        return this._sendCommand({ cmd: 'uncheck', goal, context });
    }

    // === SCROLL ===
    async scrollTo(selector) {
        return this._sendCommand({ cmd: 'scroll', selector });
    }
    async scrollToGoal(goal, context = {}) {
        return this._sendCommand({ cmd: 'scroll', goal, context });
    }
    async scrollToBottom() {
        return this._sendCommand({ cmd: 'scroll' });
    }

    // === KEYBOARD ===
    async press(key) {
        return this._sendCommand({ cmd: 'press', key });
    }
    async type(text) {
        return this._sendCommand({ cmd: 'type', text });
    }

    /**
     * Upload file(s) to a file input.
     * @param {string} selector - Direct CSS selector for file input
     * @param {string|string[]} files - File path(s) to upload
     * @returns {Promise<object>} Command result
     */
    async upload(selector, files) {
        return this._sendCommand({ cmd: 'upload', selector, files });
    }

    /**
     * Upload file(s) using semantic goal resolution.
     * @param {string} goal - Semantic goal (e.g., "Resume upload")
     * @param {string|string[]} files - File path(s) to upload
     * @returns {Promise<object>} Command result
     */
    async uploadGoal(goal, files) {
        return this._sendCommand({ cmd: 'upload', goal, files });
    }

    /**
     * Record a logical checkpoint in the mission trace.
     * @param {string} name - Checkpoint name
     * @returns {Promise<object>} Command result
     */
    async checkpoint(name, options = {}) {
        return this._sendCommand({ cmd: 'checkpoint', name }, options.timeout);
    }

    /**
     * Send a command and wait for completion.
     * @private
     */
    _sendCommand(params, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const id = `cmd-${++this.commandIdCounter}`;

            // Build human-readable description for error messages
            const cmdDesc = this._describeCommand(params);

            const timeoutId = setTimeout(() => {
                this.pendingCommands.delete(id);
                reject(new Error(`Timeout: ${cmdDesc} did not complete within ${timeout / 1000}s`));
            }, timeout);

            this.pendingCommands.set(id, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                },
                cmdDesc  // Store for better error messages
            });

            this.ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'starlight.intent',
                params,
                id
            }));
        });
    }

    /**
     * Create human-readable command description for error messages.
     * @private
     */
    _describeCommand(params) {
        if (params.cmd === 'goto') {
            return `Navigate to "${params.url}"`;
        } else if (params.goal) {
            return `Click goal "${params.goal}"`;
        } else if (params.selector) {
            return `Click "${params.selector}"`;
        } else if (params.cmd === 'fill') {
            return `Fill "${params.selector}"`;
        } else if (params.cmd === 'screenshot') {
            return `Take screenshot "${params.name || 'unnamed'}"`;
        } else if (params.cmd === 'checkpoint') {
            return `Checkpoint "${params.name}"`;
        }
        return `Command "${params.cmd || 'unknown'}"`;
    }

    /**
     * Signal mission completion and close connection.
     * @param {string} reason - Completion reason
     */
    async finish(reason = 'Mission complete') {
        this.ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.finish',
            params: { reason },
            id: 'shutdown-1'
        }));

        // Give Hub time to process
        await new Promise(r => setTimeout(r, 500));
        this.close();
    }

    /**
     * Close WebSocket connection.
     */
    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

module.exports = IntentRunner;
