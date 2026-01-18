
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { IpcBridge } = require('../../../../src/hub/security/IpcBridge');

// Mock Dependencies
const mockValidator = {
    validate: (msg) => {
        if (!msg.jsonrpc) return { valid: false, errors: ['Missing jsonrpc'] };
        return { valid: true, errors: [] };
    }
};

const mockRedactor = {
    redactObject: (obj) => {
        if (obj.params?.secret) obj.params.secret = '[REDACTED]';
        return obj;
    }
};

describe('IpcBridge (Security Gatekeeper)', () => {
    let bridge;

    beforeEach(() => {
        bridge = new IpcBridge(mockValidator, mockRedactor);
    });

    it('should REJECT invalid JSON-RPC messages', () => {
        const invalidMsg = { method: 'test' }; // Missing jsonrpc

        try {
            bridge.processMessage(invalidMsg);
            assert.fail('Should have thrown error');
        } catch (e) {
            assert.strictEqual(e.code, -32600, 'Should throw Invalid Request code');
        }
    });

    it('should SANITIZE PII from logs/processing', () => {
        const sensitiveMsg = {
            jsonrpc: '2.0',
            method: 'login',
            params: { secret: 'pa$$w0rd' }
        };

        const result = bridge.processMessage(sensitiveMsg);

        assert.strictEqual(result.params.secret, '[REDACTED]', 'PII should be redacted');
    });

    it('should PASS valid messages', () => {
        const validMsg = { jsonrpc: '2.0', method: 'test' };
        const result = bridge.processMessage(validMsg);
        assert.deepStrictEqual(result, validMsg);
    });
});
