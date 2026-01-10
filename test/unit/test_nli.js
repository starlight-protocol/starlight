/**
 * Unit Tests - NLI Parser
 * 
 * Phase 13: Natural Language Intent
 * 
 * Tests for the NLI parser, fallback, and Gherkin bridge.
 */

const assert = require('assert');

// Test data
const testCases = {
    fallback: [
        {
            input: "Go to google.com",
            expected: [{ cmd: 'goto', url: 'https://google.com' }]
        },
        {
            input: "Click Login",
            expected: [{ cmd: 'click', goal: 'Login' }]
        },
        {
            input: "Fill username with test@example.com",
            expected: [{ cmd: 'fill', goal: 'username', text: 'test@example.com' }]
        },
        {
            input: "Click Submit and then click Confirm",
            expected: [
                { cmd: 'click', goal: 'Submit' },
                { cmd: 'click', goal: 'Confirm' }
            ]
        },
        {
            input: "Select Medium from Size",
            expected: [{ cmd: 'select', goal: 'Size', value: 'Medium' }]
        },
        {
            input: "Login with username test and password secret123",
            expected: [
                { cmd: 'fill', goal: 'username', text: 'test' },
                { cmd: 'fill', goal: 'password', text: 'secret123' },
                { cmd: 'click', goal: 'Login' }
            ]
        },
        {
            input: "Navigate to saucedemo.com",
            expected: [{ cmd: 'goto', url: 'https://saucedemo.com' }]
        },
        {
            input: "Scroll to bottom",
            expected: [{ cmd: 'scroll', direction: 'bottom' }]
        },
        {
            input: "Take screenshot named checkout",
            expected: [{ cmd: 'screenshot', name: 'checkout' }]
        },
        {
            input: "Press Enter",
            expected: [{ cmd: 'press', key: 'Enter' }]
        }
    ],
    gherkin: `Feature: Test Feature
  Scenario: Basic test
    Given I am on "https://example.com"
    When I fill "email" with "test@test.com"
    And I click "Submit"
    Then I should see "Success"
`
};

async function testFallbackParser() {
    console.log('\n[Test] Fallback Parser');
    console.log('='.repeat(50));

    const { FallbackParser } = require('../../src/nli/fallback');
    const parser = new FallbackParser();

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases.fallback) {
        const result = parser.parse(testCase.input);

        try {
            // Compare key fields
            assert.strictEqual(result.length, testCase.expected.length,
                `Length mismatch for "${testCase.input}"`);

            for (let i = 0; i < result.length; i++) {
                const actual = result[i];
                const expected = testCase.expected[i];

                assert.strictEqual(actual.cmd, expected.cmd,
                    `cmd mismatch at index ${i}`);

                if (expected.goal) {
                    assert.strictEqual(actual.goal?.toLowerCase(), expected.goal.toLowerCase(),
                        `goal mismatch at index ${i}`);
                }
                if (expected.url) {
                    assert.strictEqual(actual.url, expected.url,
                        `url mismatch at index ${i}`);
                }
                if (expected.text) {
                    assert.strictEqual(actual.text, expected.text,
                        `text mismatch at index ${i}`);
                }
            }

            console.log(`  ✅ "${testCase.input.substring(0, 40)}..."`);
            passed++;
        } catch (error) {
            console.log(`  ❌ "${testCase.input.substring(0, 40)}..."`);
            console.log(`     Expected: ${JSON.stringify(testCase.expected)}`);
            console.log(`     Actual:   ${JSON.stringify(result)}`);
            console.log(`     Error:    ${error.message}`);
            failed++;
        }
    }

    console.log(`\n  Results: ${passed}/${passed + failed} passed`);
    return failed === 0;
}

async function testGherkinBridge() {
    console.log('\n[Test] Gherkin Bridge');
    console.log('='.repeat(50));

    const { GherkinBridge } = require('../../src/nli/gherkin');
    const bridge = new GherkinBridge();

    const parsed = bridge.parse(testCases.gherkin);

    console.log(`  Feature: ${parsed.feature}`);
    console.log(`  Scenarios: ${parsed.scenarios.length}`);

    const scenario = parsed.scenarios[0];
    console.log(`  Scenario: ${scenario.name}`);
    console.log(`  Steps: ${scenario.steps.length}`);

    // Verify expected steps
    const expectedSteps = [
        { cmd: 'goto', url: 'https://example.com' },
        { cmd: 'fill', goal: 'email', text: 'test@test.com' },
        { cmd: 'click', goal: 'Submit' },
        { cmd: 'checkpoint', name: 'Verify: Success' }
    ];

    let passed = 0;
    for (let i = 0; i < Math.min(scenario.steps.length, expectedSteps.length); i++) {
        const actual = scenario.steps[i];
        const expected = expectedSteps[i];

        if (actual.cmd === expected.cmd) {
            console.log(`  ✅ Step ${i + 1}: ${actual.cmd}`);
            passed++;
        } else {
            console.log(`  ❌ Step ${i + 1}: expected ${expected.cmd}, got ${actual.cmd}`);
        }
    }

    console.log(`\n  Results: ${passed}/${expectedSteps.length} correct`);
    return passed === expectedSteps.length;
}

async function testNLIParser() {
    console.log('\n[Test] NLI Parser (with Fallback)');
    console.log('='.repeat(50));

    const { NLIParser } = require('../../src/nli/parser');
    const parser = new NLIParser({
        enabled: true,
        fallback: { enabled: true, mode: 'pattern' }
    });

    // Test without Ollama (should use fallback)
    const instruction = "Go to example.com and click Login";
    const result = await parser.parse(instruction);

    console.log(`  Input: "${instruction}"`);
    console.log(`  Output: ${JSON.stringify(result)}`);
    console.log(`  Steps: ${result.length}`);

    const success = result.length >= 2 &&
        result[0].cmd === 'goto' &&
        result[1].cmd === 'click';

    if (success) {
        console.log('  ✅ Fallback mode working correctly');
    } else {
        console.log('  ❌ Fallback mode failed');
    }

    return success;
}

async function runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('  STARLIGHT NLI - UNIT TESTS');
    console.log('  Phase 13: Natural Language Intent');
    console.log('='.repeat(60));

    const results = [];

    try {
        results.push(await testFallbackParser());
    } catch (error) {
        console.error('  ❌ Fallback Parser tests failed:', error.message);
        results.push(false);
    }

    try {
        results.push(await testGherkinBridge());
    } catch (error) {
        console.error('  ❌ Gherkin Bridge tests failed:', error.message);
        results.push(false);
    }

    try {
        results.push(await testNLIParser());
    } catch (error) {
        console.error('  ❌ NLI Parser tests failed:', error.message);
        results.push(false);
    }

    // Summary
    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(60));
    console.log(`  SUMMARY: ${passed}/${total} test suites passed`);
    console.log('='.repeat(60) + '\n');

    process.exit(passed === total ? 0 : 1);
}

runAllTests();
