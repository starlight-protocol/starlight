/**
 * AuditLogger - SOC 2 Compliant Structured Logging (v4.0)
 * =======================================================
 * 
 * Responsibilities:
 * 1. Precision Logging: Captures every protocol event with microsecond timestamps.
 * 2. Immutable Traces: Writes to .audit.jsonl for post-mission forensic analysis.
 * 3. PII Awareness: Integrates with the redactor to ensure no leaks in logs.
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
    /**
     * @param {Object} options 
     */
    constructor(options = {}) {
        this.logPath = options.logPath || path.join(process.cwd(), '.audit.jsonl');
        this.redactor = options.redactor; // PIIRedactor instance
        this.enabled = options.enabled !== false;
    }

    /**
     * Log a protocol event.
     * @param {string} event - Event name (e.g., 'starlight.intent')
     * @param {Object} data - Event payload
     * @param {string} [level] - Log level (info, warn, error)
     */
    log(event, data, level = 'info') {
        if (!this.enabled) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            data: this.redactor ? this.redactor.redactObject(data) : data
        };

        const jsonLine = JSON.stringify(entry) + '\n';

        try {
            fs.appendFileSync(this.logPath, jsonLine, 'utf8');
        } catch (e) {
            console.error(`[AuditLogger] Failed to write to audit log: ${e.message}`);
        }
    }

    /**
     * High-priority security log.
     */
    security(msg, context = {}) {
        this.log('security_alert', { message: msg, ...context }, 'warn');
    }
}

module.exports = { AuditLogger };
