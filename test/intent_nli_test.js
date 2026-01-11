/**
 * Starlight NLI End-to-End Test
 * 
 * Phase 13: Natural Language Intent with Context-Awareness
 * 
 * Demonstrates:
 * 1. Fallback parser for simple structured commands (fast, instant)
 * 2. Context-aware LLM parsing for complex/ambiguous commands
 * 3. Automatic parser selection based on command complexity
 * 4. Full integration with Hub and Sentinels
 */

const IntentRunner = require('../src/intent_runner');

// Test cases - NO expectedParser field, tests must actually pass
const TEST_CASES = [
    // Simple commands - Fallback parser handles these instantly
    {
        description: 'Navigate to SauceDemo',
        instruction: 'Go to https://www.saucedemo.com',
        minSteps: 1
    },
    {
        description: 'Login with credentials',
        instruction: 'Fill Username with standard_user and fill Password with secret_sauce and click Login',
        minSteps: 3
    },
    {
        description: 'Add item to cart',
        instruction: 'Click Add to cart',
        minSteps: 1
    },
    // Context-aware command - LLM with page context
    // This test MUST succeed now with context-aware NLI
    {
        description: 'Context-aware: Buy something (LLM with page context)',
        instruction: 'I want to buy something',
        isContextTest: true,
        minSteps: 2
    }
];

async function runNLITest() {
    console.log('\n' + '═'.repeat(60));
    console.log('  STARLIGHT NLI - CONTEXT-AWARE E2E TEST');
    console.log('  Phase 13: Natural Language Intent');
    console.log('═'.repeat(60) + '\n');

    const runner = new IntentRunner();

    try {
        // Connect to Hub
        console.log('[Test] Connecting to Hub...');
        await runner.connect();
        console.log('[Test] ✅ Connected!\n');

        // Check NLI status
        console.log('[Test] Checking NLI status...');
        const status = await runner.getNLIStatus();
        console.log('[Test] NLI Configuration:');
        console.log(`  - Ollama Available: ${status.ollamaAvailable ? '✅ Yes' : '❌ No'}`);
        console.log(`  - Model: ${status.model}`);
        console.log(`  - Fallback: ${status.fallbackEnabled ? 'Enabled' : 'Disabled'} (${status.fallbackMode})`);
        console.log();

        // Run test cases
        let passed = 0;
        let failed = 0;

        for (let i = 0; i < TEST_CASES.length; i++) {
            const test = TEST_CASES[i];
            console.log(`\n${'─'.repeat(60)}`);
            console.log(`[Test ${i + 1}/${TEST_CASES.length}] ${test.description}`);
            console.log(`[Instruction] "${test.instruction}"`);
            if (test.isContextTest) {
                console.log(`[Mode] Context-aware LLM (using page elements)`);
            }
            console.log(`${'─'.repeat(60)}`);

            try {
                const startTime = Date.now();
                const results = await runner.executeNL(test.instruction);
                const elapsed = Date.now() - startTime;

                if (test.minSteps && results.length < test.minSteps) {
                    throw new Error(`Incomplete execution: Expected at least ${test.minSteps} steps, got ${results.length}`);
                }

                console.log(`\n[Result] ✅ Success in ${elapsed}ms`);
                console.log(`[Steps Executed] ${results.length}`);

                results.forEach((r, idx) => {
                    console.log(`  Step ${idx + 1}: ${r.step.cmd} ${r.step.goal || r.step.url || ''} - ${r.success ? '✅' : '❌'}`);
                });

                passed++;
            } catch (error) {
                console.log(`\n[Result] ❌ Failed: ${error.message}`);
                if (test.isContextTest && !status.ollamaAvailable) {
                    console.log(`[Note] Context test failed - Ollama not available`);
                }
                failed++;
            }

            // Small delay between tests for Sentinel stability
            await new Promise(r => setTimeout(r, 1000));
        }

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('  TEST SUMMARY');
        console.log('═'.repeat(60));
        console.log(`  Passed: ${passed}/${TEST_CASES.length}`);
        console.log(`  Failed: ${failed}/${TEST_CASES.length}`);
        console.log(`  Context-Aware: ${status.ollamaAvailable ? '✅ Enabled' : '❌ Disabled'}`);
        console.log('═'.repeat(60) + '\n');

        // Finish mission
        await runner.finish('NLI E2E test complete');

        process.exit(failed === 0 ? 0 : 1);

    } catch (error) {
        console.error('\n[Test] ❌ Fatal error:', error.message);
        runner.close();
        process.exit(1);
    }
}

// Run if executed directly
runNLITest();
