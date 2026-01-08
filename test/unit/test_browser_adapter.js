/**
 * BrowserAdapter Unit Tests
 * Phase 14.1: Multi-Browser Foundation
 * 
 * Validates that all adapters implement the same interface
 * and handle edge cases correctly.
 */

const { BrowserAdapter, ChromiumAdapter, FirefoxAdapter, WebKitAdapter } = require('../../src/browser_adapter');

async function testAdapterInterface() {
    console.log('\n=== Testing Adapter Interface ===\n');

    const adapters = [
        { name: 'Chromium', instance: new ChromiumAdapter({}) },
        { name: 'Firefox', instance: new FirefoxAdapter({}) },
        { name: 'WebKit', instance: new WebKitAdapter({}) }
    ];

    for (const { name, instance } of adapters) {
        console.log(`Testing ${name}Adapter...`);

        // Test 1: Capabilities
        const caps = instance.getCapabilities();
        console.log(`  Capabilities:`, caps);

        if (name === 'Chromium') {
            if (!caps.shadowDomPiercing) {
                throw new Error(`${name}: shadowDomPiercing should be true`);
            }
            if (!caps.cdpAccess) {
                throw new Error(`${name}: cdpAccess should be true`);
            }
        } else {
            if (caps.shadowDomPiercing) {
                throw new Error(`${name}: shadowDomPiercing should be false`);
            }
            if (caps.cdpAccess) {
                throw new Error(`${name}: cdpAccess should be false`);
            }
        }

        // Test 2: Selector Normalization
        const shadowSelector = 'button >>> .inner-element';
        const normalized = instance.normalizeSelector(shadowSelector);

        if (name === 'Chromium') {
            if (normalized !== shadowSelector) {
                throw new Error(`${name}: Should preserve >>> combinator`);
            }
        } else {
            // Firefox/WebKit should strip >>>
            if (normalized.includes('>>>')) {
                throw new Error(`${name}: Should remove >>> combinator`);
            }
        }

        console.log(`  ✓ ${name}Adapter interface validated\n`);
    }

    console.log('=== All Adapter Interfaces: PASSED ===\n');
}

async function testFactoryMethod() {
    console.log('\n=== Testing Factory Method ===\n');

    const configs = [
        { engine: 'chromium', expectedType: 'chromium' },
        { engine: 'firefox', expectedType: 'firefox' },
        { engine: 'webkit', expectedType: 'webkit' },
        { engine: 'UNKNOWN', expectedType: 'chromium' } // fallback test
    ];

    for (const { engine, expectedType } of configs) {
        const adapter = await BrowserAdapter.create({ engine });

        if (adapter.browserType !== expectedType) {
            throw new Error(`Factory failed: expected ${expectedType}, got ${adapter.browserType}`);
        }

        console.log(`  ✓ Factory created ${adapter.browserType} for engine="${engine}"`);
    }

    console.log('\n=== Factory Method: PASSED ===\n');
}

async function testErrorHandling() {
    console.log('\n=== Testing Error Handling ===\n');

    const adapter = new ChromiumAdapter({});

    // Test: newPage before launch
    try {
        await adapter.newPage();
        throw new Error('Should have thrown error');
    } catch (e) {
        if (e.message.includes('not launched')) {
            console.log('  ✓ Correctly throws error when page created before launch');
        } else {
            throw e;
        }
    }

    // Test: newContext before launch  
    try {
        await adapter.newContext();
        throw new Error('Should have thrown error');
    } catch (e) {
        if (e.message.includes('not launched')) {
            console.log('  ✓ Correctly throws error when context created before launch');
        } else {
            throw e;
        }
    }

    console.log('\n=== Error Handling: PASSED ===\n');
}

async function runAllTests() {
    try {
        await testAdapterInterface();
        await testFactoryMethod();
        await testErrorHandling();

        console.log('\n🎉 All Unit Tests PASSED!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Unit Tests FAILED:\n', error.message);
        process.exit(1);
    }
}

runAllTests();
