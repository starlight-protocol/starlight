/**
 * Starlight Protocol - Phase 1 Security Module Tests
 * 
 * Tests for:
 * 1. JWT Handler - Token generation and verification
 * 2. Schema Validator - Message validation
 * 3. PII Redactor - Sensitive data redaction
 * 4. Selector Sanitizer - CSS injection prevention
 */

const { JWTHandler } = require('../../src/auth/jwt_handler');
const { SchemaValidator } = require('../../src/validation/schema_validator');
const { PIIRedactor, redact } = require('../../src/utils/pii_redactor');

console.log('\n' + '═'.repeat(60));
console.log('  STARLIGHT SECURITY - PHASE 1 TESTS');
console.log('═'.repeat(60) + '\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected "${expected}", got "${actual}"`);
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message);
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message);
    }
}

// ══════════════════════════════════════════════════════════
// JWT Handler Tests
// ══════════════════════════════════════════════════════════
console.log('[Test] JWT Handler');
console.log('─'.repeat(50));

const jwt = new JWTHandler({ secret: 'test-secret-key', expiresIn: 60 });

test('Generate token returns string', () => {
    const token = jwt.generateToken({ userId: '123' });
    assertTrue(typeof token === 'string', 'Token should be string');
    assertTrue(token.split('.').length === 3, 'Token should have 3 parts');
});

test('Verify valid token returns payload', () => {
    const token = jwt.generateToken({ userId: '456' });
    const payload = jwt.verifyToken(token);
    assertEqual(payload.userId, '456', 'Payload mismatch');
});

test('Reject invalid signature', () => {
    const token = jwt.generateToken({ userId: '789' });
    const tamperedToken = token.slice(0, -5) + 'xxxxx';
    let threw = false;
    try {
        jwt.verifyToken(tamperedToken);
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should reject tampered token');
});

test('Reject malformed token', () => {
    let threw = false;
    try {
        jwt.verifyToken('not-a-jwt');
    } catch (e) {
        threw = true;
    }
    assertTrue(threw, 'Should reject malformed token');
});

console.log();

// ══════════════════════════════════════════════════════════
// Schema Validator Tests
// ══════════════════════════════════════════════════════════
console.log('[Test] Schema Validator');
console.log('─'.repeat(50));

const validator = new SchemaValidator();

test('Accept valid starlight.intent', () => {
    const msg = {
        jsonrpc: '2.0',
        method: 'starlight.intent',
        params: { cmd: 'click', goal: 'Login' },
        id: 'test-1'
    };
    const result = validator.validate(msg);
    assertTrue(result.valid, 'Should be valid');
});

test('Reject missing jsonrpc', () => {
    const msg = {
        method: 'starlight.intent',
        params: {},
        id: 'test-1'
    };
    const result = validator.validate(msg);
    assertFalse(result.valid, 'Should be invalid');
});

test('Reject wrong jsonrpc version', () => {
    const msg = {
        jsonrpc: '1.0',
        method: 'starlight.intent',
        params: {},
        id: 'test-1'
    };
    const result = validator.validate(msg);
    assertFalse(result.valid, 'Should reject wrong version');
});

test('Reject non-starlight method', () => {
    const msg = {
        jsonrpc: '2.0',
        method: 'malicious.method',
        params: {},
        id: 'test-1'
    };
    const result = validator.validate(msg);
    assertFalse(result.valid, 'Should reject non-starlight method');
});

console.log();

// ══════════════════════════════════════════════════════════
// PII Redactor Tests
// ══════════════════════════════════════════════════════════
console.log('[Test] PII Redactor');
console.log('─'.repeat(50));

const redactor = new PIIRedactor();

test('Redact email addresses', () => {
    const text = 'User email is user@example.com';
    const redacted = redactor.redact(text);
    assertFalse(redacted.includes('user@example.com'), 'Email should be redacted');
    assertTrue(redacted.includes('[REDACTED]'), 'Should contain redaction marker');
});

test('Redact password in JSON format', () => {
    const text = '{"username": "test", "password": "secret123"}';
    const redacted = redactor.redact(text);
    assertFalse(redacted.includes('secret123'), 'Password should be redacted');
});

test('Redact credit card numbers', () => {
    const text = 'Card: 4111-1111-1111-1111';
    const redacted = redactor.redact(text);
    assertFalse(redacted.includes('4111'), 'CC should be redacted');
});

test('Redact JWT tokens', () => {
    const token = jwt.generateToken({ userId: '123' });
    const text = `Auth: ${token}`;
    const redacted = redactor.redact(text);
    assertFalse(redacted.includes(token), 'JWT should be redacted');
});

console.log();

// ══════════════════════════════════════════════════════════
// Selector Sanitizer Tests (inline function test)
// ══════════════════════════════════════════════════════════
console.log('[Test] Selector Sanitizer');
console.log('─'.repeat(50));

// Inline sanitizer (same as in hub.js)
function sanitizeSelector(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/[#\.\[\]:;\\\/\(\)'"<>{}\@\$%\^&\*\+=\|`~]/g, '')
        .trim()
        .substring(0, 200);
}

test('Remove CSS selectors from input', () => {
    const malicious = '#id .class [attr] :nth-child(1)';
    const sanitized = sanitizeSelector(malicious);
    assertFalse(sanitized.includes('#'), 'Should remove #');
    assertFalse(sanitized.includes('.'), 'Should remove .');
    assertFalse(sanitized.includes('['), 'Should remove [');
});

test('Allow normal button text', () => {
    const normal = 'Add to cart';
    const sanitized = sanitizeSelector(normal);
    assertEqual(sanitized, 'Add to cart', 'Should allow normal text');
});

test('Block script injection', () => {
    const malicious = '<script>alert("xss")</script>';
    const sanitized = sanitizeSelector(malicious);
    assertFalse(sanitized.includes('<'), 'Should remove <');
    assertFalse(sanitized.includes('>'), 'Should remove >');
});

test('Limit length to 200', () => {
    const long = 'A'.repeat(500);
    const sanitized = sanitizeSelector(long);
    assertEqual(sanitized.length, 200, 'Should limit to 200');
});

console.log();

// ══════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════
console.log('═'.repeat(60));
console.log('  SUMMARY');
console.log('═'.repeat(60));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('═'.repeat(60) + '\n');

process.exit(failed === 0 ? 0 : 1);
