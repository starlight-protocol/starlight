/**
 * Starlight Protocol - PII Redactor
 * 
 * Phase 1.4: Critical Security Fix
 * 
 * Redacts Personally Identifiable Information (PII) from log messages.
 * Prevents sensitive data from being exposed in logs.
 */

// PII detection patterns
const PII_PATTERNS = {
    // Email addresses
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,

    // Passwords in common formats
    password: /"(password|pwd|passwd|secret|token|key)"\s*:\s*"[^"]+"/gi,
    passwordValue: /(password|pwd|passwd|secret)[\s=:]+['"]?[^\s,'"}{)]+/gi,

    // Credit card numbers (basic pattern)
    creditCard: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,

    // SSN
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

    // Phone numbers (US format)
    phone: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

    // IP addresses
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

    // JWT tokens
    jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,

    // API keys (common patterns)
    apiKey: /\b(?:api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/gi,

    // Authorization headers
    authHeader: /Authorization:\s*(?:Bearer|Basic)\s+[A-Za-z0-9_.-]+/gi
};

class PIIRedactor {
    constructor(options = {}) {
        this.patterns = { ...PII_PATTERNS, ...options.additionalPatterns };
        this.enabled = options.enabled !== false;
        this.placeholder = options.placeholder || '[REDACTED]';
    }

    /**
     * Redact PII from text.
     * @param {string} text - Text to redact
     * @returns {string} Redacted text
     */
    redact(text) {
        if (!this.enabled || typeof text !== 'string') {
            return text;
        }

        let result = text;

        for (const [type, pattern] of Object.entries(this.patterns)) {
            result = result.replace(pattern, `${this.placeholder}:${type}`);
        }

        return result;
    }

    /**
     * Redact PII from an object (recursively).
     * @param {object} obj - Object to redact
     * @returns {object} Redacted object copy
     */
    redactObject(obj) {
        if (!this.enabled) {
            return obj;
        }

        if (typeof obj === 'string') {
            return this.redact(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.redactObject(item));
        }

        if (typeof obj === 'object' && obj !== null) {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                // Redact sensitive field names entirely
                if (this._isSensitiveKey(key)) {
                    result[key] = `${this.placeholder}:${key}`;
                } else {
                    result[key] = this.redactObject(value);
                }
            }
            return result;
        }

        return obj;
    }

    /**
     * Check if a key name indicates sensitive data.
     * @private
     */
    _isSensitiveKey(key) {
        const sensitiveKeys = [
            'password', 'passwd', 'pwd', 'secret', 'token', 'apikey',
            'api_key', 'accesstoken', 'access_token', 'refreshtoken',
            'refresh_token', 'authorization', 'auth', 'credential',
            'ssn', 'creditcard', 'credit_card', 'cardnumber', 'cvv'
        ];
        return sensitiveKeys.includes(key.toLowerCase());
    }

    /**
     * Create a safe logger that auto-redacts PII.
     * @returns {object} Logger with redacting console methods
     */
    createSafeLogger() {
        const self = this;
        return {
            log: (...args) => console.log(...args.map(a =>
                typeof a === 'string' ? self.redact(a) : self.redactObject(a)
            )),
            warn: (...args) => console.warn(...args.map(a =>
                typeof a === 'string' ? self.redact(a) : self.redactObject(a)
            )),
            error: (...args) => console.error(...args.map(a =>
                typeof a === 'string' ? self.redact(a) : self.redactObject(a)
            )),
            debug: (...args) => console.debug(...args.map(a =>
                typeof a === 'string' ? self.redact(a) : self.redactObject(a)
            ))
        };
    }
}

// Singleton instance for easy import
const defaultRedactor = new PIIRedactor();

/**
 * Quick redact function.
 * @param {string} text - Text to redact
 * @returns {string} Redacted text
 */
function redact(text) {
    return defaultRedactor.redact(text);
}

module.exports = { PIIRedactor, redact };
