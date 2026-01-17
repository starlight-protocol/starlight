/**
 * Unit Tests: Detection Engine
 * ============================
 * Verifies DOM, Header, and Status code detection heuristics.
 */

const { DetectionEngine } = require('../../src/smart_browser_adapter');

// Test runner
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
console.log('Detection Engine Unit Tests');
console.log('═══════════════════════════════════════════════════════════\n');

const engine = new DetectionEngine();

// Test 1: Cloudflare DOM detection
console.log('Cloudflare Detection:');
{
    const result = engine.analyze({
        dom: '<div id="cf-wrapper"><div id="challenge-running">Please wait...</div></div>',
        headers: { 'cf-ray': '12345' },
        statusCode: 403
    });
    test('Detects Cloudflare wrapper in DOM', result.detected === true);
    test('Identifies type as cloudflare', result.type === 'cloudflare');
    test('Has high confidence', result.confidence >= 0.7);
}

// Test 2: Akamai detection
console.log('\nAkamai Detection:');
{
    const result = engine.analyze({
        dom: '<script>var _akamai_sensor_data = "test";</script>',
        headers: {},
        statusCode: 200
    });
    test('Detects Akamai sensor script', result.detected === true || result.signals.length > 0);
}

// Test 3: Generic CAPTCHA detection
console.log('\nGeneric CAPTCHA Detection:');
{
    const result = engine.analyze({
        dom: '<div class="g-recaptcha" data-sitekey="123"></div>',
        headers: {},
        statusCode: 200
    });
    test('Detects reCAPTCHA element', result.signals.some(s => s.selector?.includes('recaptcha')));
}

// Test 4: Status code detection
console.log('\nStatus Code Detection:');
{
    const result403 = engine.analyze({ dom: '', headers: {}, statusCode: 403 });
    const result429 = engine.analyze({ dom: '', headers: {}, statusCode: 429 });
    const result200 = engine.analyze({ dom: '', headers: {}, statusCode: 200 });

    test('Detects 403 Forbidden', result403.signals.some(s => s.code === 403));
    test('Detects 429 Too Many Requests', result429.signals.some(s => s.code === 429));
    test('Does not trigger on 200 OK', result200.signals.length === 0 || !result200.detected);
}

// Test 5: No false positives on clean page
console.log('\nFalse Positive Prevention:');
{
    const result = engine.analyze({
        dom: '<html><body><h1>Welcome</h1><p>Normal content</p></body></html>',
        headers: { 'content-type': 'text/html' },
        statusCode: 200
    });
    test('Clean page returns no detection', result.detected === false);
}

// Test 6: Confidence scoring requires multiple signals
console.log('\nConfidence Scoring:');
{
    // Single signal should not trigger swap
    const singleSignal = engine.analyze({
        dom: '',
        headers: { 'cf-ray': '12345' },
        statusCode: 200
    });

    // Multiple signals should trigger
    const multiSignal = engine.analyze({
        dom: '<div id="cf-wrapper"></div>',
        headers: { 'cf-ray': '12345' },
        statusCode: 403
    });

    test('Single signal has lower confidence', singleSignal.confidence < 0.8);
    test('Multiple signals trigger detection', multiSignal.detected === true);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
