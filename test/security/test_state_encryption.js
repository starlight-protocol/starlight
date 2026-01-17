/**
 * Security Tests: State Encryption
 * =================================
 * Verifies AES-256-GCM encryption for context sync.
 */

const { SecureStateManager } = require('../../src/smart_browser_adapter');

let passed = 0;
let failed = 0;

function test(name, condition) {
    if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
    } else {
        console.log(`  ✗ ${name}`);
        failed++;
    }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('Secure State Manager Tests');
console.log('═══════════════════════════════════════════════════════════\n');

// Test 1: Basic encryption/decryption
console.log('Encryption/Decryption:');
{
    const manager = new SecureStateManager();
    const testData = {
        cookies: [{ name: 'session', value: 'abc123' }],
        storage: { localStorage: { token: 'xyz789' } }
    };

    const encrypted = manager.encrypt(testData);
    test('Encrypted data has IV', typeof encrypted.iv === 'string');
    test('Encrypted data has ciphertext', typeof encrypted.data === 'string');
    test('Encrypted data has auth tag', typeof encrypted.tag === 'string');
    test('Ciphertext is not plaintext', !encrypted.data.includes('abc123'));

    const decrypted = manager.decrypt(encrypted);
    test('Decrypted matches original', JSON.stringify(decrypted) === JSON.stringify(testData));
}

// Test 2: No plaintext leakage
console.log('\nNo Plaintext Leakage:');
{
    const manager = new SecureStateManager();
    const sensitiveData = {
        cookies: [{ name: 'auth', value: 'SuperSecretPassword123!' }],
        storage: {
            localStorage: {
                apiKey: 'sk-secret-key-12345',
                email: 'user@example.com'
            }
        }
    };

    const encrypted = manager.encrypt(sensitiveData);
    const encryptedStr = JSON.stringify(encrypted);

    test('Password not in encrypted output', !encryptedStr.includes('SuperSecretPassword123!'));
    test('API key not in encrypted output', !encryptedStr.includes('sk-secret-key-12345'));
    test('Email not in encrypted output', !encryptedStr.includes('user@example.com'));
}

// Test 3: Unique IVs per encryption
console.log('\nUnique IVs:');
{
    const manager = new SecureStateManager();
    const data = { test: 'data' };

    const enc1 = manager.encrypt(data);
    const enc2 = manager.encrypt(data);

    test('Different IVs for same data', enc1.iv !== enc2.iv);
    test('Different ciphertext for same data', enc1.data !== enc2.data);
}

// Test 4: Tamper detection
console.log('\nTamper Detection:');
{
    const manager = new SecureStateManager();
    const data = { cookies: [] };
    const encrypted = manager.encrypt(data);

    // Tamper with ciphertext
    encrypted.data = encrypted.data.replace(/[a-f]/g, '0');

    let tamperedDetected = false;
    try {
        manager.decrypt(encrypted);
    } catch (e) {
        tamperedDetected = true;
    }

    test('Tampered data throws error', tamperedDetected);
}

// Test 5: Wrong key fails
console.log('\nKey Validation:');
{
    const manager1 = new SecureStateManager();
    const manager2 = new SecureStateManager(); // Different key

    const encrypted = manager1.encrypt({ secret: 'data' });

    let wrongKeyDetected = false;
    try {
        manager2.decrypt(encrypted);
    } catch (e) {
        wrongKeyDetected = true;
    }

    test('Decryption with wrong key fails', wrongKeyDetected);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
