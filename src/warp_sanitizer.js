/**
 * Starlight Warp Sanitizer
 * Phase 17: Deep Mesh Intelligence
 * 
 * Sanitizes browser context data to remove PII and sensitive information
 * before serialization to .warp files.
 * 
 * Security First: All data is sanitized by DEFAULT.
 * 
 * @author Dhiraj Das
 * @license MIT
 */

const crypto = require('crypto');

class WarpSanitizer {
    constructor(config = {}) {
        // Encryption settings
        this.encryptionEnabled = config.encrypt || false;
        this.encryptionKey = config.encryptionKey || null;

        // Whitelist: Keys that should NOT be sanitized (use with caution)
        this.whitelist = new Set(config.whitelist || []);

        // Track what was sanitized for audit
        this.sanitizationLog = [];

        // PII Detection Patterns
        this.patterns = {
            // Email addresses
            email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

            // Phone numbers (various formats)
            phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,

            // Credit card numbers
            creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

            // SSN (US)
            ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,

            // API Keys / Tokens (common patterns)
            apiKey: /\b(sk_live_|pk_live_|sk_test_|pk_test_)[a-zA-Z0-9]{20,}\b/g,
            bearer: /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g,
            jwt: /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g,

            // AWS Keys
            awsKey: /AKIA[0-9A-Z]{16}/g,
            awsSecret: /[a-zA-Z0-9/+=]{40}/g,

            // Private Keys
            privateKey: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,

            // IP Addresses (optional - can be whitelisted)
            ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

            // Passwords in common formats
            password: /"password"\s*:\s*"[^"]+"/gi,
            passwordField: /password=([^&\s]+)/gi,

            // Session/Auth tokens in URLs
            sessionUrl: /[?&](token|session|auth|key|api_key|apikey|secret)=([^&\s]+)/gi
        };

        // Sensitive storage keys (always sanitized unless whitelisted)
        this.sensitiveKeys = new Set([
            'token', 'auth', 'session', 'password', 'secret', 'key', 'apiKey',
            'api_key', 'access_token', 'refresh_token', 'id_token', 'jwt',
            'cookie', 'authorization', 'bearer', 'credentials', 'private'
        ]);

        // Sensitive cookie names
        this.sensitiveCookies = new Set([
            'session', 'sessionid', 'sid', 'ssid', 'auth', 'token',
            'access_token', 'refresh_token', 'jwt', 'csrf', 'xsrf',
            '__stripe_mid', '__stripe_sid', '_ga', '_gid'
        ]);
    }

    /**
     * Sanitize an entire warp data object
     * @param {Object} warpData - Raw browser context data
     * @returns {Object} Sanitized data safe for storage
     */
    sanitize(warpData) {
        this.sanitizationLog = [];

        const sanitized = {
            ...warpData,
            storage: this.sanitizeStorage(warpData.storage || {}),
            cookies: this.sanitizeCookies(warpData.cookies || []),
            dom: this.sanitizeDOM(warpData.dom || ''),
            console: this.sanitizeConsole(warpData.console || []),
            network: this.sanitizeNetwork(warpData.network || {}),
            url: this.sanitizeUrl(warpData.url || ''),
            // Metadata
            _sanitized: true,
            _sanitizedAt: new Date().toISOString(),
            _piiRemoved: this.sanitizationLog.length,
            _sanitizationSummary: this.getSummary()
        };

        // Optional encryption
        if (this.encryptionEnabled && this.encryptionKey) {
            return this.encrypt(sanitized);
        }

        return sanitized;
    }

    /**
     * Sanitize localStorage/sessionStorage
     */
    sanitizeStorage(storage) {
        const sanitized = { local: {}, session: {} };

        for (const type of ['local', 'session']) {
            const data = storage[type] || {};

            for (const [key, value] of Object.entries(data)) {
                // Check whitelist
                if (this.whitelist.has(key)) {
                    sanitized[type][key] = value;
                    continue;
                }

                // Check if key is sensitive
                const isSensitiveKey = this.isSensitiveKey(key);

                if (isSensitiveKey) {
                    sanitized[type][key] = '[REDACTED_STORAGE]';
                    this.log('storage', key, type);
                } else {
                    // Sanitize the value for PII
                    sanitized[type][key] = this.sanitizeString(value, `storage.${type}.${key}`);
                }
            }
        }

        return sanitized;
    }

    /**
     * Sanitize cookies
     */
    sanitizeCookies(cookies) {
        return cookies.map(cookie => {
            const name = cookie.name?.toLowerCase() || '';

            // Check whitelist
            if (this.whitelist.has(cookie.name)) {
                return cookie;
            }

            // Check if sensitive cookie
            const isSensitive = this.sensitiveCookies.has(name) ||
                Array.from(this.sensitiveKeys).some(k => name.includes(k));

            if (isSensitive) {
                this.log('cookie', cookie.name);
                return {
                    ...cookie,
                    value: '[REDACTED_COOKIE]'
                };
            }

            // Sanitize value for PII
            return {
                ...cookie,
                value: this.sanitizeString(cookie.value, `cookie.${cookie.name}`)
            };
        });
    }

    /**
     * Sanitize DOM HTML
     */
    sanitizeDOM(dom) {
        if (!dom) return '';

        let sanitized = dom;

        // Remove script contents (may contain secrets)
        sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,
            '<script>[SCRIPT_CONTENT_REDACTED]</script>');

        // Remove inline event handlers (may contain secrets)
        sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '');

        // Sanitize input values
        sanitized = sanitized.replace(/(<input[^>]*value=")[^"]*(")/gi, '$1[REDACTED]$2');

        // Sanitize for PII patterns
        sanitized = this.sanitizeString(sanitized, 'dom');

        return sanitized;
    }

    /**
     * Sanitize console logs
     */
    sanitizeConsole(logs) {
        return logs.map((log, index) => {
            if (typeof log === 'string') {
                return this.sanitizeString(log, `console[${index}]`);
            }
            if (typeof log === 'object') {
                return this.sanitizeObject(log, `console[${index}]`);
            }
            return log;
        });
    }

    /**
     * Sanitize network data
     */
    sanitizeNetwork(network) {
        const sanitized = {
            pending: [],
            completed: []
        };

        for (const type of ['pending', 'completed']) {
            const requests = network[type] || [];

            sanitized[type] = requests.map((req, i) => ({
                ...req,
                url: this.sanitizeUrl(req.url, `network.${type}[${i}].url`),
                headers: this.sanitizeHeaders(req.headers || {}, `network.${type}[${i}]`),
                body: req.body ? '[BODY_REDACTED]' : undefined,
                response: req.response ? this.sanitizeString(
                    typeof req.response === 'string' ? req.response : JSON.stringify(req.response),
                    `network.${type}[${i}].response`
                ) : undefined
            }));
        }

        return sanitized;
    }

    /**
     * Sanitize URL (query params may contain secrets)
     */
    sanitizeUrl(url, context = 'url') {
        if (!url) return '';

        // Sanitize sensitive query params
        let sanitized = url.replace(this.patterns.sessionUrl, (match, key) => {
            this.log('url_param', key, context);
            return `${key}=[REDACTED]`;
        });

        // Sanitize for PII
        sanitized = this.sanitizeString(sanitized, context);

        return sanitized;
    }

    /**
     * Sanitize HTTP headers
     */
    sanitizeHeaders(headers, context) {
        const sensitiveHeaders = new Set([
            'authorization', 'cookie', 'set-cookie', 'x-api-key',
            'x-auth-token', 'x-csrf-token', 'x-xsrf-token'
        ]);

        const sanitized = {};

        for (const [key, value] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase();

            if (sensitiveHeaders.has(lowerKey)) {
                sanitized[key] = '[REDACTED_HEADER]';
                this.log('header', key, context);
            } else {
                sanitized[key] = this.sanitizeString(value, `${context}.headers.${key}`);
            }
        }

        return sanitized;
    }

    /**
     * Sanitize a string for PII patterns
     */
    sanitizeString(value, context = '') {
        if (typeof value !== 'string') {
            return value;
        }

        let sanitized = value;

        // Apply all PII patterns
        for (const [patternName, pattern] of Object.entries(this.patterns)) {
            const matches = sanitized.match(pattern);
            if (matches) {
                for (const match of matches) {
                    this.log(patternName, match.substring(0, 20) + '...', context);
                }
                sanitized = sanitized.replace(pattern, `[${patternName.toUpperCase()}_REDACTED]`);
            }
        }

        return sanitized;
    }

    /**
     * Recursively sanitize an object
     */
    sanitizeObject(obj, context = '') {
        if (typeof obj !== 'object' || obj === null) {
            return this.sanitizeString(String(obj), context);
        }

        if (Array.isArray(obj)) {
            return obj.map((item, i) => this.sanitizeObject(item, `${context}[${i}]`));
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (this.isSensitiveKey(key)) {
                sanitized[key] = '[REDACTED]';
                this.log('sensitive_key', key, context);
            } else if (typeof value === 'object') {
                sanitized[key] = this.sanitizeObject(value, `${context}.${key}`);
            } else {
                sanitized[key] = this.sanitizeString(String(value), `${context}.${key}`);
            }
        }
        return sanitized;
    }

    /**
     * Check if a key name suggests sensitive data
     */
    isSensitiveKey(key) {
        const lowerKey = key.toLowerCase();
        return Array.from(this.sensitiveKeys).some(k => lowerKey.includes(k));
    }

    /**
     * Log sanitization action
     */
    log(type, value, context = '') {
        this.sanitizationLog.push({
            type,
            preview: String(value).substring(0, 30),
            context,
            timestamp: Date.now()
        });
    }

    /**
     * Get summary of what was sanitized
     */
    getSummary() {
        const summary = {};
        for (const entry of this.sanitizationLog) {
            summary[entry.type] = (summary[entry.type] || 0) + 1;
        }
        return summary;
    }

    /**
     * Encrypt sanitized data (optional layer of security)
     */
    encrypt(data) {
        if (!this.encryptionKey) {
            console.warn('[WarpSanitizer] Encryption requested but no key provided');
            return data;
        }

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm',
            Buffer.from(this.encryptionKey, 'hex'), iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            _encrypted: true,
            _algorithm: 'aes-256-gcm',
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted
        };
    }

    /**
     * Decrypt warp data
     */
    static decrypt(encryptedData, key) {
        if (!encryptedData._encrypted) {
            return encryptedData;
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm',
            Buffer.from(key, 'hex'),
            Buffer.from(encryptedData.iv, 'hex'));

        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }

    /**
     * Generate a secure encryption key
     */
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = { WarpSanitizer };
