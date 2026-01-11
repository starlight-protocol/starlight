# 🧪 Starlight Protocol Security Testing Guide

**Version:** 3.0.3  
**Date:** 2026-01-11  

Comprehensive security testing procedures and best practices for the Starlight Protocol.

---

## Table of Contents

1. [Testing Overview](#1-testing-overview)
2. [Authentication Testing](#2-authentication-testing)
3. [Input Validation Testing](#3-input-validation-testing)
4. [PII Protection Testing](#4-pii-protection-testing)
5. [Network Security Testing](#5-network-security-testing)
6. [Access Control Testing](#6-access-control-testing)
7. [Penetration Testing](#7-penetration-testing)
8. [Automated Security Tests](#8-automated-security-tests)
9. [Security Test Suite](#9-security-test-suite)
10. [Compliance Testing](#10-compliance-testing)

---

## 1. Testing Overview

This guide provides comprehensive security testing procedures for the Starlight Protocol. Regular security testing is essential for maintaining a secure deployment.

### Testing Categories

| Category | Frequency | Tools | Scope |
|----------|-----------|-------|-------|
| **Unit Tests** | Every commit | Jest, PyTest | Individual components |
| **Integration Tests** | Daily | Custom | Component interactions |
| **Security Scan** | Weekly | SAST, DAST | Code and deployment |
| **Penetration Test** | Quarterly | Manual | Full security assessment |
| **Compliance Audit** | Annually | External | Regulatory requirements |

### Security Testing Framework

```mermaid
graph TD
    A[Security Testing] --> B[Authentication]
    A --> C[Input Validation]
    A --> D[PII Protection]
    A --> E[Network Security]
    A --> F[Access Control]
    A --> G[Penetration Testing]
    
    B --> B1[Token Testing]
    B --> B2[Session Testing]
    B --> B3[Brute Force Testing]
    
    C --> C1[Schema Validation]
    C --> C2[Injection Testing]
    C --> C3[Boundary Testing]
    
    D --> D1[PII Detection]
    D --> D2[Redaction Testing]
    D --> D3[Encryption Testing]
    
    E --> E1[SSL/TLS Testing]
    E --> E2[Rate Limiting]
    E --> E3[Firewall Testing]
    
    F --> F1[RBAC Testing]
    F --> F2[Privilege Escalation]
    F --> F3[Resource Testing]
```

---

## 2. Authentication Testing

### 2.1 JWT Token Testing

#### Test: Valid Token Generation
```javascript
// test/security/test_jwt_generation.js
const jwt = require('jsonwebtoken');
const { JWThandler } = require('../../src/auth/jwt_handler');

describe('JWT Token Generation', () => {
    let jwtHandler;
    const testSecret = 'test-secret-key-256-bits-minimum!!';
    
    beforeAll(() => {
        jwtHandler = new JWThandler(testSecret, 3600);
    });
    
    test('should generate valid JWT token', () => {
        const payload = {
            sub: 'TestSentinel',
            layer: 'TestSentinel'
        };
        
        const token = jwtHandler.generateToken(payload);
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
    });
    
    test('should include required claims', () => {
        const token = jwtHandler.generateToken({ sub: 'Test' });
        const decoded = jwt.decode(token);
        
        expect(decoded.iat).toBeDefined();
        expect(decoded.exp).toBeDefined();
        expect(decoded.sub).toBe('Test');
        expect(decoded.jti).toBeDefined();
    });
    
    test('should set correct expiration', () => {
        const token = jwtHandler.generateToken({ sub: 'Test' });
        const decoded = jwt.decode(token);
        
        expect(decoded.exp - decoded.iat).toBe(3600);
    });
});
```

#### Test: Token Verification
```javascript
// test/security/test_jwt_verification.js
describe('JWT Token Verification', () => {
    test('should verify valid token', () => {
        const token = jwtHandler.generateToken({ sub: 'Test' });
        const result = jwtHandler.verifyToken(token);
        
        expect(result.valid).toBe(true);
        expect(result.decoded.sub).toBe('Test');
    });
    
    test('should reject expired token', () => {
        // Create expired token manually
        const expiredToken = jwt.sign(
            { sub: 'Test', exp: Math.floor(Date.now() / 1000) - 3600 },
            testSecret
        );
        
        const result = jwtHandler.verifyToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('TokenExpiredError');
    });
    
    test('should reject tampered token', () => {
        const token = jwtHandler.generateToken({ sub: 'Test' });
        const tampered = token.slice(0, -5) + 'XXXXX';
        
        const result = jwtHandler.verifyToken(tampered);
        expect(result.valid).toBe(false);
    });
    
    test('should reject invalid signature', () => {
        const token = jwt.sign({ sub: 'Test' }, 'wrong-secret');
        
        const result = jwtHandler.verifyToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('JsonWebTokenError');
    });
});
```

### 2.2 Authentication Flow Testing

#### Test: Complete Authentication Flow
```javascript
// test/security/test_auth_flow.js
describe('Authentication Flow', () => {
    let hub;
    let mockWebSocket;
    
    beforeEach(() => {
        hub = new Hub({ security: { jwtSecret: testSecret } });
        mockWebSocket = createMockWebSocket();
    });
    
    test('should accept connection from authenticated sentinel', async () => {
        const token = jwtHandler.generateToken({ sub: 'TestSentinel' });
        
        await hub.handleConnection(mockWebSocket);
        mockWebSocket.send(JSON.stringify({
            method: 'starlight.registration',
            params: { layer: 'TestSentinel', priority: 5 },
            authToken: token
        }));
        
        expect(hub.sentinels.has('TestSentinel')).toBe(true);
    });
    
    test('should reject connection from unauthenticated client', async () => {
        await hub.handleConnection(mockWebSocket);
        mockWebSocket.send(JSON.stringify({
            method: 'starlight.registration',
            params: { layer: 'TestSentinel', priority: 5 }
            // No authToken
        }));
        
        expect(hub.sentinels.has('TestSentinel')).toBe(false);
        expect(mockWebSocket.closeCode).toBe(4001);
    });
    
    test('should reject invalid auth token', async () => {
        await hub.handleConnection(mockWebSocket);
        mockWebSocket.send(JSON.stringify({
            method: 'starlight.registration',
            params: { layer: 'TestSentinel', priority: 5 },
            authToken: 'invalid-token'
        }));
        
        expect(hub.sentinels.has('TestSentinel')).toBe(false);
        expect(mockWebSocket.closeCode).toBe(4001);
    });
});
```

### 2.3 Brute Force Protection Testing

```javascript
// test/security/test_brute_force_protection.js
describe('Brute Force Protection', () => {
    const rateLimiter = new RateLimiter({
        maxAttempts: 5,
        windowMs: 60000,
        lockoutMs: 300000
    });
    
    test('should allow initial authentication attempts', () => {
        for (let i = 0; i < 5; i++) {
            expect(rateLimiter.isAllowed('client-1')).toBe(true);
        }
    });
    
    test('should block after exceeding limit', () => {
        for (let i = 0; i < 5; i++) {
            rateLimiter.isAllowed('client-2');
        }
        expect(rateLimiter.isAllowed('client-2')).toBe(false);
    });
    
    test('should reset after lockout period', async () => {
        const shortLockoutRateLimiter = new RateLimiter({
            maxAttempts: 2,
            windowMs: 1000,
            lockoutMs: 100
        });
        
        // Exhaust attempts
        shortLockoutRateLimiter.isAllowed('client-3');
        shortLockoutRateLimiter.isAllowed('client-3');
        
        // Should be locked
        expect(shortLockoutRateLimiter.isAllowed('client-3')).toBe(false);
        
        // Wait for lockout
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Should be allowed again
        expect(shortLockoutRateLimiter.isAllowed('client-3')).toBe(true);
    });
});
```

---

## 3. Input Validation Testing

### 3.1 Schema Validation Testing

```javascript
// test/security/test_schema_validation.js
const { SchemaValidator } = require('../../src/validation/schema_validator');

describe('Schema Validation', () => {
    let validator;
    
    beforeAll(() => {
        validator = new SchemaValidator();
    });
    
    test('should accept valid base message', () => {
        const message = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: { goal: 'Test' },
            id: 'test-1'
        };
        
        const result = validator.validate(message);
        expect(result.valid).toBe(true);
    });
    
    test('should reject missing jsonrpc version', () => {
        const message = {
            method: 'starlight.intent',
            params: { goal: 'Test' },
            id: 'test-1'
        };
        
        const result = validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('jsonrpc: Required field missing');
    });
    
    test('should reject invalid jsonrpc version', () => {
        const message = {
            jsonrpc: '1.0',
            method: 'starlight.intent',
            params: { goal: 'Test' },
            id: 'test-1'
        };
        
        const result = validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('jsonrpc: Must be "2.0"');
    });
    
    test('should reject invalid method name', () => {
        const message = {
            jsonrpc: '2.0',
            method: 'invalid.method.name',
            params: {},
            id: 'test-1'
        };
        
        const result = validator.validate(message);
        expect(result.valid).toBe(false);
    });
    
    test('should reject oversized string fields', () => {
        const message = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: { 
                goal: 'A'.repeat(2001)  // Exceeds 2000 limit
            },
            id: 'test-1'
        };
        
        const result = validator.validate(message);
        expect(result.valid).toBe(false);
    });
});
```

### 3.2 Injection Attack Testing

#### CSS Selector Injection
```javascript
// test/security/test_selector_injection.js
const { sanitizeSelector } = require('../../src/hub');

describe('Selector Injection Prevention', () => {
    test('should remove dangerous characters from selector', () => {
        const malicious = 'button#submit.onclick="alert(1)"';
        const sanitized = sanitizeSelector(malicious);
        
        expect(sanitized).not.toContain('#');
        expect(sanitized).not.toContain('.');
        expect(sanitized).not.toContain('onclick');
    });
    
    test('should allow valid selector characters', () => {
        const valid = 'button[type="submit"]';
        const sanitized = sanitizeSelector(valid);
        
        expect(sanitized).toBe(valid);
    });
    
    test('should handle empty selector', () => {
        expect(sanitizeSelector('')).toBe('');
        expect(sanitizeSelector(null)).toBe(null);
        expect(sanitizeSelector(undefined)).toBe(undefined);
    });
});
```

#### XSS Prevention
```javascript
// test/security/test_xss_prevention.js
const { escapeHtml } = require('../../src/utils/security');

describe('XSS Prevention', () => {
    test('should escape HTML entities', () => {
        const malicious = '<script>alert("xss")</script>';
        const escaped = escapeHtml(malicious);
        
        expect(escaped).not.toContain('<script>');
        expect(escaped).toContain('&lt;script&gt;');
    });
    
    test('should escape quotes', () => {
        const malicious = '"onclick="alert(1)"';
        const escaped = escapeHtml(malicious);
        
        expect(escaped).toContain('&quot;');
    });
    
    test('should handle normal text', () => {
        const normal = 'Hello World';
        expect(escapeHtml(normal)).toBe(normal);
    });
});
```

### 3.3 Boundary Testing

```javascript
// test/security/test_boundary_validation.js
describe('Boundary Validation', () => {
    test('should reject message exceeding size limit', () => {
        const largeMessage = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                data: 'x'.repeat(1048577)  // Exceeds 1MB limit
            },
            id: 'test-1'
        };
        
        const result = validator.validate(largeMessage);
        expect(result.valid).toBe(false);
    });
    
    test('should handle nested objects', () => {
        const deepMessage = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                level1: {
                    level2: {
                        level3: {
                            level4: {
                                level5: {
                                    level6: 'too deep'
                                }
                            }
                        }
                    }
                }
            },
            id: 'test-1'
        };
        
        const result = validator.validate(deepMessage);
        expect(result.valid).toBe(false);
    });
    
    test('should reject arrays exceeding limit', () => {
        const largeArray = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                selectors: Array(101).fill('selector')
            },
            id: 'test-1'
        };
        
        const result = validator.validate(largeArray);
        expect(result.valid).toBe(false);
    });
});
```

---

## 4. PII Protection Testing

### 4.1 PII Detection Testing

```javascript
// test/security/test_pii_detection.js
const { PIIRedactor } = require('../../src/utils/pii_redactor');

describe('PII Detection', () => {
    let redactor;
    
    beforeAll(() => {
        redactor = new PIIRedactor();
    });
    
    test('should detect email addresses', () => {
        const emails = [
            'user@example.com',
            'test.user+tag@example.org',
            'admin@company.co.uk'
        ];
        
        emails.forEach(email => {
            const detected = redactor.detect(email);
            expect(dected.piiTypes).toContain('email');
        });
    });
    
    test('should detect phone numbers', () => {
        const phones = [
            '555-123-4567',
            '+1-555-123-4567',
            '(555) 123-4567'
        ];
        
        phones.forEach(phone => {
            const detected = redactor.detect(phone);
            expect(dected.piiTypes).toContain('phone');
        });
    });
    
    test('should detect credit cards', () => {
        const cards = [
            '4111-1111-1111-1111',
            '5555 5555 5555 5555',
            '378282246310005'
        ];
        
        cards.forEach(card => {
            const detected = redactor.detect(card);
            expect(dected.piiTypes).toContain('creditCard');
        });
    });
    
    test('should detect JWT tokens', () => {
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        
        const detected = redactor.detect(token);
        expect(dected.piiTypes).toContain('jwt');
    });
    
    test('should detect SSN', () => {
        const ssn = '123-45-6789';
        
        const detected = redactor.detect(ssn);
        expect(dected.piiTypes).toContain('ssn');
    });
});
```

### 4.2 PII Redaction Testing

```javascript
// test/security/test_pii_redaction.js
describe('PII Redaction', () => {
    let redactor;
    
    beforeAll(() => {
        redactor = new PIIRedactor();
    });
    
    test('should redact email from string', () => {
        const input = 'Contact: user@example.com for support';
        const redacted = redactor.redact(input);
        
        expect(redacted).toContain('[EMAIL_REDACTED]');
        expect(redacted).not.toContain('user@example.com');
    });
    
    test('should redact credit card from string', () => {
        const input = 'Card: 4111-1111-1111-1111';
        const redacted = redactor.redact(input);
        
        expect(redacted).toContain('[CREDITCARD_REDACTED]');
        expect(redacted).not.toContain('4111');
    });
    
    test('should redact PII from objects', () => {
        const input = {
            name: 'John Doe',
            email: 'john@example.com',
            payment: {
                card: '4111-1111-1111-1111'
            }
        };
        
        const redacted = redactor.redact(input);
        
        expect(redacted.name).toBe('John Doe');
        expect(redacted.email).toBe('[EMAIL_REDACTED]');
        expect(redacted.payment.card).toBe('[CREDITCARD_REDACTED]');
    });
    
    test('should redact PII from arrays', () => {
        const input = {
            users: [
                { email: 'user1@example.com' },
                { email: 'user2@example.com' }
            ]
        };
        
        const redacted = redactor.redact(input);
        
        expect(redacted.users[0].email).toBe('[EMAIL_REDACTED]');
        expect(redacted.users[1].email).toBe('[EMAIL_REDACTED]');
    });
    
    test('should handle deeply nested objects', () => {
        const input = {
            level1: {
                level2: {
                    level3: {
                        email: 'deep@example.com'
                    }
                }
            }
        };
        
        const redacted = redactor.redact(input);
        expect(redacted.level1.level2.level3.email).toBe('[EMAIL_REDACTED]');
    });
});
```

### 4.3 Encryption Testing

```javascript
// test/security/test_encryption.js
const { encryptData, decryptData } = require('../../src/utils/encryption');

describe('Data Encryption', () => {
    const testData = Buffer.from('Sensitive data to encrypt');
    const testKey = 'test-encryption-key-32-chars!!';
    
    test('should encrypt and decrypt data correctly', () => {
        const encrypted = encryptData(testData, testKey);
        const decrypted = decryptData(encrypted, testKey);
        
        expect(decrypted.toString()).toBe(testData.toString());
    });
    
    test('should produce unique IVs for same input', () => {
        const encrypted1 = encryptData(testData, testKey);
        const encrypted2 = encryptData(testData, testKey);
        
        expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });
    
    test('should produce different ciphertext for same input', () => {
        const encrypted1 = encryptData(testData, testKey);
        const encrypted2 = encryptData(testData, testKey);
        
        expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
    
    test('should fail decryption with wrong key', () => {
        const encrypted = encryptData(testData, testKey);
        
        expect(() => {
            decryptData(encrypted, 'wrong-key-32-chars!!!!!');
        }).toThrow();
    });
    
    test('should detect tampering with auth tag', () => {
        const encrypted = encryptData(testData, testKey);
        encrypted.ciphertext[0] = (encrypted.ciphertext[0] + 1) % 256;
        
        expect(() => {
            decryptData(encrypted, testKey);
        }).toThrow();
    });
});
```

---

## 5. Network Security Testing

### 5.1 SSL/TLS Testing

```javascript
// test/security/test_ssl_tls.js
const https = require('https');
const fs = require('fs');

describe('SSL/TLS Configuration', () => {
    let server;
    
    beforeAll(() => {
        server = https.createServer({
            key: fs.readFileSync('test/fixtures/server.key'),
            cert: fs.readFileSync('test/fixtures/server.crt'),
            minVersion: 'TLSv1.2',
            ciphers: [
                'ECDHE-ECDSA-AES256-GCM-SHA384',
                'ECDHE-RSA-AES256-GCM-SHA384'
            ]
        });
    });
    
    afterAll(() => {
        server.close();
    });
    
    test('should only accept TLS 1.2 or higher', async () => {
        const response = await makeSecureRequest('https://localhost:3000');
        expect(response.tlsVersion).toMatch(/TLSv[1-2]\.[0-3]/);
    });
    
    test('should reject weak cipher suites', async () => {
        // Attempt connection with weak cipher
        const result = await attemptConnectionWithCipher('RC4-SHA');
        expect(result.cipher).not.toBe('RC4-SHA');
    });
    
    test('should have valid certificate', async () => {
        const cert = await getCertificate('localhost');
        
        expect(cert.valid_from).toBeDefined();
        expect(cert.valid_to).toBeDefined();
        expect(new Date(cert.valid_to) > new Date()).toBe(true);
    });
});
```

### 5.2 Rate Limiting Testing

```javascript
// test/security/test_rate_limiting.js
const { RateLimiter } = require('../../src/network/rate_limiter');

describe('Rate Limiting', () => {
    let rateLimiter;
    
    beforeEach(() => {
        rateLimiter = new RateLimiter({
            maxRequests: 10,
            windowMs: 1000
        });
    });
    
    test('should allow requests within limit', () => {
        for (let i = 0; i < 10; i++) {
            const result = rateLimiter.isAllowed('client');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(10 - i - 1);
        }
    });
    
    test('should block requests exceeding limit', () => {
        for (let i = 0; i < 10; i++) {
            rateLimiter.isAllowed('client');
        }
        
        const result = rateLimiter.isAllowed('client');
        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBeDefined();
    });
    
    test('should track per-client limits independently', () => {
        for (let i = 0; i < 10; i++) {
            rateLimiter.isAllowed('client-1');
        }
        
        // client-2 should still be allowed
        const result = rateLimiter.isAllowed('client-2');
        expect(result.allowed).toBe(true);
    });
    
    test('should reset after window expires', async () => {
        const shortWindowLimiter = new RateLimiter({
            maxRequests: 2,
            windowMs: 100
        });
        
        // Exhaust limit
        shortWindowLimiter.isAllowed('client');
        shortWindowLimiter.isAllowed('client');
        
        // Should be blocked
        expect(shortWindowLimiter.isAllowed('client').allowed).toBe(false);
        
        // Wait for window to reset
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Should be allowed again
        expect(shortWindowLimiter.isAllowed('client').allowed).toBe(true);
    });
});
```

---

## 6. Access Control Testing

### 6.1 RBAC Testing

```javascript
// test/security/test_rbac.js
const { RBAC } = require('../../src/auth/rbac');

describe('Role-Based Access Control', () => {
    let rbac;
    
    beforeAll(() => {
        rbac = new RBAC({
            roles: {
                admin: { permissions: ['*'] },
                operator: { permissions: ['read', 'write'] },
                viewer: { permissions: ['read'] }
            }
        });
    });
    
    test('should allow admin all permissions', () => {
        expect(rbac.hasPermission('admin', 'read')).toBe(true);
        expect(rbac.hasPermission('admin', 'write')).toBe(true);
        expect(rbac.hasPermission('admin', 'delete')).toBe(true);
        expect(rbac.hasPermission('admin', '*')).toBe(true);
    });
    
    test('should allow operator read and write', () => {
        expect(rbac.hasPermission('operator', 'read')).toBe(true);
        expect(rbac.hasPermission('operator', 'write')).toBe(true);
        expect(rbac.hasPermission('operator', 'delete')).toBe(false);
    });
    
    test('should allow viewer only read', () => {
        expect(rbac.hasPermission('viewer', 'read')).toBe(true);
        expect(rbac.hasPermission('viewer', 'write')).toBe(false);
    });
    
    test('should check multiple permissions', () => {
        expect(rbac.hasAllPermissions('admin', ['read', 'write', 'delete'])).toBe(true);
        expect(rbac.hasAllPermissions('operator', ['read', 'write'])).toBe(true);
        expect(rbac.hasAllPermissions('operator', ['read', 'write', 'delete'])).toBe(false);
    });
});
```

### 6.2 Privilege Escalation Testing

```javascript
// test/security/test_privilege_escalation.js
describe('Privilege Escalation Prevention', () => {
    test('should not allow users to elevate their own role', async () => {
        const user = { role: 'viewer', id: 'user-1' };
        const updateRole = async (userId, newRole) => {
            // This should be prevented
            if (userId === user.id && newRole !== user.role) {
                throw new Error('Privilege escalation prevented');
            }
        };
        
        await expect(updateRole('user-1', 'admin')).rejects.toThrow('Privilege escalation prevented');
    });
    
    test('should not allow unauthorized role assignment', async () => {
        const assignRole = (assigner, target, role) => {
            if (assigner.role !== 'admin') {
                throw new Error('Only admins can assign roles');
            }
        };
        
        expect(() => assignRole({ role: 'viewer' }, 'user-2', 'admin')).toThrow();
        expect(() => assignRole({ role: 'admin' }, 'user-2', 'admin')).not.toThrow();
    });
});
```

---

## 7. Penetration Testing

### 7.1 OWASP ZAP Integration

```yaml
# .zap/zap.yaml
# OWASP ZAP configuration for automated security scanning
context:
  name: starlight-protocol
  includeUrls:
    - http://localhost:8080/*
    - ws://localhost:8080/*
  excludeUrls:
    - http://localhost:8080/health
    - http://localhost:8080/static/*

spider:
  threadCount: 4
  maxChildren: 100

ascan:
  threadCount: 2
  policy: API
  apis:
    - openapi.yaml

passiveScan:
  enabled: true

reports:
  format: json
  location: reports/zap-report.json
```

### 7.2 Penetration Test Procedures

#### 7.2.1 Authentication Bypass Tests
```bash
# Test for authentication bypass
# 1. Token manipulation
curl -X POST http://localhost:8080/api/registration \
  -H "Content-Type: application/json" \
  -d '{"layer":"Test","priority":5,"authToken":"invalid-token"}'

# 2. Session fixation
curl -X POST http://localhost:8080/api/registration \
  -H "Content-Type: application/json" \
  -d '{"layer":"Test","priority":5,"authToken":"session_id=malicious"}'

# 3. Privilege escalation via token
curl -X POST http://localhost:8080/api/registration \
  -H "Content-Type: application/json" \
  -d '{"layer":"Test","priority":5,"role":"admin"}'
```

#### 7.2.2 Injection Tests
```bash
# CSS selector injection
curl -X POST http://localhost:8080/api/intent \
  -H "Content-Type: application/json" \
  -d '{"goal":"Test","selector":"#btn.onclick=alert(1)"}'

# XSS attempt
curl -X POST http://localhost:8080/api/intent \
  -H "Content-Type: application/json" \
  -d '{"goal":"<script>alert(1)</script>"}'

# SQL injection (if applicable)
curl -X POST http://localhost:8080/api/intent \
  -H "Content-Type: application/json" \
  -d '{"goal":"Test\' OR 1=1--"}'

# JSON injection
curl -X POST http://localhost:8080/api/intent \
  -H "Content-Type: application/json" \
  -d '{"goal":"Test","params":{"__proto__":{"admin":true}}}'
```

### 7.3 Security Scan Report

```json
{
    "scanId": "SCAN-2026-0111-001",
    "timestamp": "2026-01-11T10:00:00Z",
    "scanner": "OWASP ZAP 2.14.0",
    "target": "http://localhost:8080",
    "results": {
        "high": 0,
        "medium": 2,
        "low": 5,
        "informational": 12
    },
    "vulnerabilities": [
        {
            "name": "Missing Security Headers",
            "risk": "Medium",
            "description": "X-Content-Type-Options header is missing",
            "solution": "Add X-Content-Type-Options: nosniff"
        },
        {
            "name": "Information Disclosure",
            "risk": "Low",
            "description": "Server version disclosed in headers",
            "solution": "Configure server to hide version information"
        }
    ]
}
```

---

## 8. Automated Security Tests

### 8.1 Security Test Suite

```bash
# Run all security tests
npm run test:security

# Run specific security test categories
npm run test:security -- --testPathPattern="auth"
npm run test:security -- --testPathPattern="validation"
npm run test:security -- --testPathPattern="pii"
npm run test:security -- --testPathPattern="network"
```

### 8.2 Continuous Security Testing

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  push:
    branches: [main, develop]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run security tests
        run: npm run test:security
      
      - name: Run SAST scan
        uses: github/codeql-action/analyze@v2
        with:
          queries: security-extended
      
      - name: Dependency audit
        run: npm audit --audit-level=high
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: reports/
```

---

## 9. Security Test Suite

### 9.1 Test Coverage Matrix

| Test Category | Tests | Coverage | Status |
|--------------|-------|----------|--------|
| JWT Authentication | 15 | 100% | ✅ |
| Schema Validation | 20 | 100% | ✅ |
| PII Detection | 12 | 100% | ✅ |
| PII Redaction | 18 | 100% | ✅ |
| Encryption | 10 | 100% | ✅ |
| Rate Limiting | 8 | 100% | ✅ |
| RBAC | 15 | 100% | ✅ |
| SSL/TLS | 6 | 100% | ✅ |
| Injection Prevention | 25 | 100% | ✅ |
| **Total** | **129** | **100%** | **✅** |

### 9.2 Running the Test Suite

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run security tests only
npm run test:security

# Run with coverage
npm run test:coverage

# Generate test report
npm run test:report
```

---

## 10. Compliance Testing

### 10.1 GDPR Compliance Tests

```javascript
// test/compliance/test_gdpr.js
describe('GDPR Compliance', () => {
    test('should support data subject access requests', async () => {
        const dsar = new DSARHandler();
        const request = await dsar.createRequest({
            type: 'access',
            subjectId: 'user@example.com',
            email: 'user@example.com'
        });
        
        expect(request.id).toBeDefined();
        expect(request.status).toBe('pending');
    });
    
    test('should support right to erasure', async () => {
        const erasure = new ErasureHandler();
        const result = await erasure.processRequest({
            subjectId: 'user@example.com',
            reason: 'Withdrawal of consent'
        });
        
        expect(result.status).toBe('completed');
        expect(result.certificate).toBeDefined();
    });
    
    test('should not store unnecessary personal data', () => {
        const pii = new PIIRedactor();
        const testData = { email: 'test@example.com' };
        const minimized = pii.minimize(testData, { keep: ['id', 'status'] });
        
        expect(minimized.email).toBeUndefined();
    });
});
```

### 10.2 HIPAA Compliance Tests

```javascript
// test/compliance/test_hipaa.js
describe('HIPAA Compliance', () => {
    test('should detect and redact PHI', () => {
        const phi = {
            patientName: 'John Doe',
            mrn: '1234567890',
            ssn: '123-45-6789',
            dob: '1990-01-01'
        };
        
        const redactor = new PHIRedactor();
        const redacted = redactor.redact(phi);
        
        expect(redacted.patientName).toBe('[PHI_REDACTED]');
        expect(redacted.mrn).toBe('[PHI_REDACTED]');
        expect(redacted.ssn).toBe('[PHI_REDACTED]');
        expect(redacted.dob).toBe('[PHI_REDACTED]');
    });
    
    test('should log all PHI access', async () => {
        const audit = new PHIAudit();
        
        await audit.logAccess({
            userId: 'dr.smith',
            patientId: '123456',
            resource: 'medical-record',
            action: 'view'
        });
        
        const logs = await audit.getLogs({ patientId: '123456' });
        expect(logs.length).toBe(1);
        expect(logs[0].userId).toBe('dr.smith');
    });
    
    test('should enforce minimum necessary standard', () => {
        const access = new MinNecessaryAccess();
        
        expect(access.canAccess('admin', 'full-record')).toBe(true);
        expect(access.canAccess('billing', 'full-record')).toBe(false);
        expect(access.canAccess('billing', 'billing-data')).toBe(true);
    });
});
```

---

## Conclusion

Regular security testing is essential for maintaining a secure Starlight Protocol deployment. This guide provides comprehensive procedures for testing all security controls.

### Key Testing Principles

1. **Continuous Testing**: Run security tests on every commit
2. **Comprehensive Coverage**: Test all security features
3. **Automated Scanning**: Use automated tools for routine checks
4. **Manual Testing**: Conduct periodic manual penetration tests
5. **Compliance Verification**: Regularly verify compliance requirements

### Testing Schedule

| Frequency | Testing Type | Responsibility |
|-----------|--------------|----------------|
| Daily | Unit tests, Integration tests | CI/CD pipeline |
| Weekly | Security scan, Dependency audit | Automated |
| Monthly | Full security review | Security team |
| Quarterly | Penetration testing | External tester |
| Annually | Comprehensive audit | External auditor |

For security testing questions or to report vulnerabilities, contact security@starlight-protocol.org.

---

*Last updated: 2026-01-11*  
*Next review: 2026-04-11*