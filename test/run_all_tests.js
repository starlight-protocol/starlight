/**
 * STARLIGHT PROTOCOL - UNIFIED MASTER TEST RUNNER (v2.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * Orchestrates JS Unit Tests, Python Structural Tests, and Integration Tests.
 * Ensures 100% verified status for Zero-Defect Release.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const MockHub = require('./mock_hub');

const UNIT_TEST_DIR = path.join(__dirname, 'unit');

async function runAll() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('        STARLIGHT ZERO-DEFECT INTEGRITY AUDIT');
    console.log('═══════════════════════════════════════════════════════\n');

    const results = {
        js: [],
        python: [],
        integration: []
    };

    // 1. JS UNIT TESTS (In-Process for c8 coverage)
    console.log('[SECTION] JavaScript Structural Tests');
    const jsFiles = fs.readdirSync(UNIT_TEST_DIR).filter(f => f.endsWith('.js'));

    for (const file of jsFiles) {
        process.stdout.write(`  Running ${file}... `);
        try {
            const TestClass = require(path.join(UNIT_TEST_DIR, file));
            const tester = new TestClass();
            const passed = await tester.runTests();
            if (passed) {
                console.log('✓');
                results.js.push({ file, passed: true });
            } else {
                console.log('✗ (Failed logic)');
                results.js.push({ file, passed: false });
            }
        } catch (err) {
            console.log(`✗ (Error: ${err.message})`);
            results.js.push({ file, passed: false, error: err.message });
        }
    }

    // 2. PYTHON STRUCTURAL TESTS
    console.log('\n[SECTION] Python Structural Tests');
    process.stdout.write('  Running test_sentinels_structural.py... ');
    try {
        const pyPath = path.join(UNIT_TEST_DIR, 'test_sentinels_structural.py');
        execSync(`python \"${pyPath}\"`, { stdio: 'pipe' });
        console.log('✓');
        results.python.push({ file: 'test_sentinels_structural.py', passed: true });
    } catch (err) {
        console.log('✗');
        results.python.push({ file: 'test_sentinels_structural.py', passed: false, error: err.stdout?.toString() || err.message });
    }

    // 3. MOBILE INTEGRATION TEST (with Mock Hub)
    console.log('\n[SECTION] Mobile Emulation Integration');
    const hub = new MockHub();
    hub.start();

    process.stdout.write('  Running intent_mobile_test.js... ');
    try {
        const mobileTestPath = path.join(__dirname, 'intent_mobile_test.js');
        execSync(`node \"${mobileTestPath}\"`, { stdio: 'pipe' });
        console.log('✓');
        results.integration.push({ file: 'intent_mobile_test.js', passed: true });
    } catch (err) {
        console.log('✗');
        results.integration.push({ file: 'intent_mobile_test.js', passed: false, error: err.message });
    } finally {
        hub.stop();
    }

    // FINAL SUMMARY
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('                FINAL AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════════');

    const allJsPassed = results.js.every(r => r.passed);
    const allPyPassed = results.python.every(r => r.passed);
    const allIntPassed = results.integration.every(r => r.passed);

    console.log(`  JS Structural:    ${allJsPassed ? 'PASS ✓' : 'FAIL ✗'} (${results.js.filter(r => r.passed).length}/${results.js.length})`);
    console.log(`  Python Structural: ${allPyPassed ? 'PASS ✓' : 'FAIL ✗'} (${results.python.filter(r => r.passed).length}/${results.python.length})`);
    console.log(`  Mobile Emulation:  ${allIntPassed ? 'PASS ✓' : 'FAIL ✗'} (${results.integration.filter(r => r.passed).length}/${results.integration.length})`);

    console.log('═══════════════════════════════════════════════════════\n');

    process.exit((allJsPassed && allPyPassed && allIntPassed) ? 0 : 1);
}

runAll();
