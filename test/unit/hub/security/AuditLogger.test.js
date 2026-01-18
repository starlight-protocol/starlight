const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { AuditLogger } = require('../../../../src/hub/security/AuditLogger');
const { PIIRedactor } = require('../../../../src/utils/pii_redactor');

test('AuditLogger: SOC 2 Compliant Logging (EVID-004)', async (t) => {
    const logPath = path.join(process.cwd(), '.test_audit.jsonl');
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

    const redactor = new PIIRedactor();
    const logger = new AuditLogger({ logPath, redactor });

    await t.test('Should log structured event with redaction', () => {
        logger.log('starlight.intent', { goal: 'Contact test@example.com' });

        const content = fs.readFileSync(logPath, 'utf8');
        const entry = JSON.parse(content.trim());

        assert.strictEqual(entry.event, 'starlight.intent');
        assert.ok(entry.data.goal.includes('[REDACTED]:email'));
        assert.ok(!entry.data.goal.includes('test@example.com'));
        assert.ok(entry.timestamp, 'Missing timestamp');
    });

    await t.test('Should handle security alerts', () => {
        logger.security('Potential PII Leak Detected', { origin: 'VisionSentinel' });

        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
        const lastEntry = JSON.parse(lines[lines.length - 1]);

        assert.strictEqual(lastEntry.event, 'security_alert');
        assert.strictEqual(lastEntry.level, 'warn');
    });

    // Cleanup
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});
