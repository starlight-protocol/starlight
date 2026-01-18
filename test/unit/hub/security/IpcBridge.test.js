const test = require('node:test');
const assert = require('node:assert');
const { IpcBridge } = require('../../../../src/hub/security/IpcBridge');
const { SchemaValidator } = require('../../../../src/validation/schema_validator');
const { PIIRedactor } = require('../../../../src/utils/pii_redactor');

test('IpcBridge: Protocol & Security Rigor', async (t) => {
    const validator = new SchemaValidator();
    const redactor = new PIIRedactor();
    const bridge = new IpcBridge(validator, redactor);

    await t.test('Should reject non-JSON-RPC 2.0 messages', () => {
        const malformed = { id: 1, method: 'starlight.intent' }; // missing jsonrpc
        assert.throws(() => bridge.processMessage(malformed), /Invalid Protocol/);
    });

    await t.test('Should redact PII from deep objects', () => {
        const sensitiveMsg = {
            jsonrpc: '2.0',
            id: 'test-1',
            method: 'starlight.intent',
            params: {
                goal: 'My email is test@example.com and my SSN is 123-44-5678',
                selector: '#login'
            }
        };

        const processed = bridge.processMessage(sensitiveMsg);
        assert.ok(processed.params.goal.includes('[REDACTED]:email'));
        assert.ok(processed.params.goal.includes('[REDACTED]:ssn'));
        assert.ok(!processed.params.goal.includes('test@example.com'));
    });

    await t.test('Should handle schema validation warnings for intent', () => {
        // malformed intent params (missing goal/selector)
        const invalidIntent = {
            jsonrpc: '2.0',
            id: 'test-2',
            method: 'starlight.intent',
            params: {
                // empty
            }
        };

        // We currently warn in Phase 1, so it shouldn't throw but return processed message
        const processed = bridge.processMessage(invalidIntent);
        assert.strictEqual(processed.id, 'test-2');
    });
});
