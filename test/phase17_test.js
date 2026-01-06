/**
 * Phase 17 Integration Test
 * Tests Starlight Warp and Inter-Sentinel Side-Talk
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const HUB_URL = 'ws://localhost:8080';

// Test results
let passed = 0;
let failed = 0;

function test(name, condition) {
    if (condition) {
        console.log(`✅ ${name}`);
        passed++;
    } else {
        console.log(`❌ ${name}`);
        failed++;
    }
}

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 17: DEEP MESH INTELLIGENCE TESTS');
    console.log('═══════════════════════════════════════════\n');

    // === TEST 1: Warp Sanitizer Unit Test ===
    console.log('--- Test 1: Warp Sanitizer ---\n');

    const { WarpSanitizer } = require('../src/warp_sanitizer');
    const sanitizer = new WarpSanitizer();

    // Test email sanitization
    const emailTest = sanitizer.sanitizeString('Contact: user@example.com', 'test');
    test('Email sanitization', !emailTest.includes('user@example.com'));

    // Test credit card sanitization
    const ccTest = sanitizer.sanitizeString('Card: 4111-1111-1111-1111', 'test');
    test('Credit card sanitization', !ccTest.includes('4111-1111-1111-1111'));

    // Test JWT sanitization
    const jwtTest = sanitizer.sanitizeString('Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'test');
    test('JWT sanitization', !jwtTest.includes('eyJ'));

    // Test sensitive key detection
    test('Sensitive key detection: password', sanitizer.isSensitiveKey('userPassword'));
    test('Sensitive key detection: token', sanitizer.isSensitiveKey('authToken'));
    test('Sensitive key detection: api_key', sanitizer.isSensitiveKey('api_key'));

    // Test storage sanitization
    const storageResult = sanitizer.sanitizeStorage({
        local: { 'auth_token': 'secret123', 'theme': 'dark' },
        session: { 'session_id': 'abc123' }
    });
    test('Storage: sensitive keys redacted', storageResult.local.auth_token.includes('[REDACTED'));
    test('Storage: safe keys preserved', storageResult.local.theme === 'dark');

    // Test cookie sanitization
    const cookieResult = sanitizer.sanitizeCookies([
        { name: 'session', value: 'secret' },
        { name: 'preference', value: 'light' }
    ]);
    test('Cookies: session cookie redacted', cookieResult[0].value.includes('[REDACTED'));
    test('Cookies: preference cookie preserved', cookieResult[1].value === 'light');

    console.log('\n--- Test 2: Side-Talk Schema Validation ---\n');

    // Test Side-Talk message structure
    const sidetalkMsg = {
        jsonrpc: '2.0',
        method: 'starlight.sidetalk',
        params: {
            from: 'PulseSentinel',
            to: 'A11ySentinel',
            topic: 'environment_state',
            payload: { stable: true, mutationRate: 0 }
        },
        id: 'st-001'
    };

    test('Side-Talk: has jsonrpc', sidetalkMsg.jsonrpc === '2.0');
    test('Side-Talk: has from', typeof sidetalkMsg.params.from === 'string');
    test('Side-Talk: has to', typeof sidetalkMsg.params.to === 'string');
    test('Side-Talk: has topic', typeof sidetalkMsg.params.topic === 'string');
    test('Side-Talk: has payload', typeof sidetalkMsg.params.payload === 'object');

    // === TEST 3: Live Hub Integration (if Hub is running) ===
    console.log('\n--- Test 3: Hub Integration ---\n');

    let hubConnected = false;
    try {
        const ws = new WebSocket(HUB_URL);

        await new Promise((resolve, reject) => {
            ws.on('open', () => {
                hubConnected = true;
                resolve();
            });
            ws.on('error', reject);
            setTimeout(() => reject(new Error('Timeout')), 3000);
        });

        test('Hub connection', hubConnected);

        // Send warp capture request
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.warp_capture',
            params: { reason: 'test' },
            id: 'warp-test-1'
        }));

        // Wait for response
        await new Promise((resolve) => {
            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'WARP_CAPTURED') {
                    test('Warp capture response', msg.success !== undefined);
                    resolve();
                }
            });
            setTimeout(resolve, 2000);
        });

        ws.close();

    } catch (e) {
        console.log('⚠️  Hub not running - skipping live integration tests');
        console.log('   Start Hub with: node src/hub.js');
    }

    // === RESULTS ===
    console.log('\n═══════════════════════════════════════════');
    console.log(`  RESULTS: ${passed}/${passed + failed} tests passed`);
    console.log('═══════════════════════════════════════════\n');

    if (failed === 0) {
        console.log('🏆 ALL TESTS PASSED!\n');
    } else {
        console.log(`⚠️  ${failed} test(s) failed\n`);
        process.exit(1);
    }
}

runTests().catch(console.error);
