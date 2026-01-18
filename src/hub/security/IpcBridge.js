/**
 * IpcBridge - The Protocol Gatekeeper (v4.0)
 * =========================================
 * 
 * Responsibilities:
 * 1. PII Redaction: Scrubs sensitive data from raw payloads.
 * 2. Protocol Enforcement: Ensures JSON-RPC 2.0 compliance.
 * 3. Schema Validation: Verifies message structure against specification.
 */

const { redact } = require('../../utils/pii_redactor');

class IpcBridge {
    /**
     * @param {SchemaValidator} validator - Singleton validator instance
     * @param {PIIRedactor} redactor - Redactor instance (optional)
     */
    constructor(validator, redactor) {
        this.validator = validator;
        this.redactor = redactor;
    }

    /**
     * Process an incoming raw message.
     * @param {Object} msg - Parsed JSON message
     * @returns {Object} Validated and redacted message
     * @throws {Error} If protocol or schema validation fails
     */
    processMessage(msg) {
        // 1. JSON-RPC 2.0 Basic Check
        if (msg.jsonrpc !== '2.0') {
            throw new Error('Invalid Protocol: Expected jsonrpc: "2.0"');
        }

        if (!msg.method || !msg.id) {
            throw new Error('Malformed Message: Missing method or id');
        }

        // 2. PII Redaction (Atomic and Non-Destructive)
        const safeMsg = this._redactRecursive(msg);

        // 3. Strict Schema Validation (SOC 2 Compliant)
        const schemaName = msg.method.split('.').pop();
        if (this.validator) {
            const validation = this.validator.validate(msg); // Validate full message including params
            if (!validation.valid) {
                const errStr = validation.errors.join(', ');
                console.error(`[IpcBridge] SECURITY REJECT (Schema): ${msg.method} -> ${errStr}`);
                throw new Error(`Schema Validation Failure: ${errStr}`);
            }
        }

        return safeMsg;
    }

    /**
     * Recursively redact PII from an object.
     * @private
     */
    _redactRecursive(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;

        const result = Array.isArray(obj) ? [] : {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = redact(value);
            } else if (typeof value === 'object') {
                result[key] = this._redactRecursive(value);
            } else {
                result[key] = value;
            }
        }

        return result;
    }
}

module.exports = { IpcBridge };
