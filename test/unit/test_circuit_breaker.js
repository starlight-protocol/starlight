/**
 * Unit Tests: Circuit Breaker
 * ===========================
 * Verifies state transitions and resilience logic.
 */

const { CircuitBreaker } = require('../../src/smart_browser_adapter');

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
console.log('Circuit Breaker Unit Tests');
console.log('═══════════════════════════════════════════════════════════\n');

// Test 1: Initial state
console.log('Initial State:');
{
    const cb = new CircuitBreaker(3, 1000);
    test('Starts in CLOSED state', cb.state === 'CLOSED');
    test('Is available initially', cb.isAvailable() === true);
    test('Failure count is 0', cb.failures === 0);
}

// Test 2: Failure accumulation
console.log('\nFailure Accumulation:');
{
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    test('First failure recorded', cb.failures === 1);
    test('Still CLOSED after one failure', cb.state === 'CLOSED');

    cb.recordFailure();
    test('Second failure recorded', cb.failures === 2);
    test('Still CLOSED after two failures', cb.state === 'CLOSED');
}

// Test 3: Circuit opens at threshold
console.log('\nCircuit Opens at Threshold:');
{
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    test('Third failure triggers OPEN', cb.state === 'OPEN');
    test('Not available when OPEN', cb.isAvailable() === false);
}

// Test 4: Success resets failures
console.log('\nSuccess Resets:');
{
    const cb = new CircuitBreaker(3, 1000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();

    test('Success resets failure count', cb.failures === 0);
    test('State returns to CLOSED', cb.state === 'CLOSED');
}

// Test 5: Recovery timeout (async)
console.log('\nRecovery Timeout:');
{
    const cb = new CircuitBreaker(3, 100); // 100ms timeout for testing
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    test('Immediately OPEN after threshold', cb.state === 'OPEN');

    // Wait for recovery
    setTimeout(() => {
        test('Transitions to HALF_OPEN after timeout', cb.state === 'HALF_OPEN');
        test('Is available in HALF_OPEN', cb.isAvailable() === true);

        // Print results
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log('═══════════════════════════════════════════════════════════\n');

        process.exit(failed > 0 ? 1 : 0);
    }, 150);
}
