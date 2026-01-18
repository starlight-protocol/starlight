
const { RpcError } = require('../utils/RpcError');

/**
 * Phase 1: IpcBridge
 * The Security Gatekeeper for all IPC traffic.
 * Mandates:
 * 1. PII Redaction (GDPR)
 * 2. Schema Validation (Security)
 */
class IpcBridge {
    constructor(validator, redactor) {
        this.validator = validator;
        this.redactor = redactor;
    }

    /**
     * Process an incoming message through the security pipeline.
     * @param {object} msg - Raw message object
     * @returns {object} - Validated and Sanitized message
     * @throws {RpcError} - If security check fails
     */
    processMessage(msg) {
        if (!msg) {
            throw RpcError.invalidRequest('Empty message');
        }

        // 1. PII Redaction (Compliance Mandate)
        // We redact BEFORE validation logs to ensure clean traces
        const safeMsg = this.redactor.redactObject(msg);

        // 2. Schema Validation (Security Mandate)
        const validation = this.validator.validate(safeMsg);
        if (!validation.valid) {
            console.error(`[IpcBridge] Validation Failed for ${safeMsg.method}:`, JSON.stringify(validation.errors, null, 2));
            throw RpcError.invalidRequest(validation.errors);
        }

        return safeMsg;
    }
}

module.exports = { IpcBridge };
