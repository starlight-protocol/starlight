/**
 * Mobile Emulation Intent Test
 * Tests responsive design and mobile-specific behavior
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * STARLIGHT PROTOCOL COMPLIANT
 * - Uses IntentRunner (event-driven, no setTimeout)
 * - Pure intent: only goals, no timing
 * - Mobile device configured via config.json or Mission Control
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IntentRunner = require('../src/intent_runner');
const path = require('path');

async function main() {
    const runner = new IntentRunner();

    try {
        await runner.connect();
        console.log('[Intent] 📱 Connected to Starlight Hub');
        console.log('[Intent] Mobile Emulation Test\n');

        // Goal 1: Navigate to a responsive test page
        console.log('[Intent] Goal 1: Navigate to responsive test page');
        const testPage = `file://${path.resolve(__dirname, 'mobile_test.html')}`;
        await runner.goto(testPage);
        console.log('[Intent] ✓ Navigation complete\n');

        // Goal 2: Click the mobile menu button (only visible in mobile view)
        console.log('[Intent] Goal 2: Click mobile menu button');
        await runner.click('#mobile-menu-btn');
        console.log('[Intent] ✓ Mobile menu opened\n');

        // Goal 3: Click a navigation link
        console.log('[Intent] Goal 3: Click navigation link');
        await runner.click('nav a[href="#features"]');
        console.log('[Intent] ✓ Navigation link clicked\n');

        // Goal 4: Fill contact form
        console.log('[Intent] Goal 4: Fill contact form');
        await runner.fill('#email-input', 'test@example.com');
        console.log('[Intent] ✓ Email filled\n');

        // Goal 5: Submit form
        console.log('[Intent] Goal 5: Submit form');
        await runner.click('#submit-btn');
        console.log('[Intent] ✓ Form submitted\n');

        // Complete mission
        console.log('[Intent] ═══════════════════════════════════════');
        console.log('[Intent] 🎯 Mobile Emulation Test COMPLETE');
        await runner.finish('Mobile emulation test complete');

    } catch (error) {
        console.error('[Intent] ❌ Mission failed:', error.message);
        await runner.finish('Mobile test failed: ' + error.message);
        process.exit(1);
    }
}

main();
