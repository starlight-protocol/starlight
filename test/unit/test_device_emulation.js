/**
 * Phase 14.2: Device Emulation Unit Tests
 * 
 * Tests mobile device emulation, network presets, and device list.
 */

const path = require('path');
const { BrowserAdapter } = require(path.join(__dirname, '../../src/browser_adapter'));

console.log('=== Phase 14.2: Device Emulation Tests ===\n');

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

// Test 1: Network Presets
console.log('\n=== Testing Network Presets ===');
const presets = BrowserAdapter.NETWORK_PRESETS;

test('online preset exists', presets['online'] !== undefined);
test('4g preset exists', presets['4g'] !== undefined);
test('3g preset exists', presets['3g'] !== undefined);
test('3g-slow preset exists', presets['3g-slow'] !== undefined);
test('offline preset exists', presets['offline'] !== undefined);

test('online has no latency', presets['online'].latency === 0);
test('3g has 100ms latency', presets['3g'].latency === 100);
test('offline is offline', presets['offline'].offline === true);

// Test 2: Device List
console.log('\n=== Testing Device List ===');
const deviceList = BrowserAdapter.getDeviceList();

test('Device list is array', Array.isArray(deviceList));
test('Device list has items', deviceList.length > 0);
test('Device list includes iPhone', deviceList.some(d => d.includes('iPhone')));
test('Device list includes Pixel', deviceList.some(d => d.includes('Pixel')));
test('Device list includes iPad', deviceList.some(d => d.includes('iPad')));

console.log(`\n  Available devices (${deviceList.length}):`);
deviceList.slice(0, 10).forEach(d => console.log(`    - ${d}`));
if (deviceList.length > 10) {
    console.log(`    ... and ${deviceList.length - 10} more`);
}

// Test 3: Adapter Creation with Mobile Config
console.log('\n=== Testing Adapter Factory with Mobile Config ===');

(async () => {
    try {
        // Test Chromium adapter with device emulation capability
        const chromiumAdapter = await BrowserAdapter.create({ engine: 'chromium' });
        test('Chromium adapter created', chromiumAdapter !== null);
        test('Chromium supports device emulation', chromiumAdapter.capabilities.deviceEmulation === true);
        test('Chromium supports touch events', chromiumAdapter.capabilities.touchEvents === true);

        // Test Firefox adapter (limited emulation)
        const firefoxAdapter = await BrowserAdapter.create({ engine: 'firefox' });
        test('Firefox adapter created', firefoxAdapter !== null);

        // Test WebKit adapter (iOS emulation strength)
        const webkitAdapter = await BrowserAdapter.create({ engine: 'webkit' });
        test('WebKit adapter created', webkitAdapter !== null);

        console.log('\n=== Summary ===');
        console.log(`  Passed: ${passed}`);
        console.log(`  Failed: ${failed}`);

        if (failed === 0) {
            console.log('\n🎉 All Device Emulation Tests PASSED!\n');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed.\n');
            process.exit(1);
        }
    } catch (e) {
        console.error('Test error:', e.message);
        process.exit(1);
    }
})();
