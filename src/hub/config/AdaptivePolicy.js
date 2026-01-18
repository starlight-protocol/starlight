
/**
 * Phase 4: AdaptivePolicy
 * Intelligent Engine Selection Logic.
 * 
 * Rules:
 * 1. Security/Evasion is P0. If anti-bot is detected, MUST use Stealth.
 * 2. Performance is P1. If Shadow DOM is heavy, PREFER Playwright (O(N) Walker).
 * 3. Default is Playwright (Fastest).
 */
class AdaptivePolicy {
    /**
     * Decides which browser engine to use based on environmental signals.
     * @param {object} signals - Detected environment flags
     * @returns {object} { engine: 'playwright'|'stealth', reason: string }
     */
    static decide(signals) {
        // P0: Anti-Bot Evasion
        // If we detect Cloudflare, Akamai, or strict bot checks, we MUST hoist to Stealth
        if (signals.hasCloudflare || signals.hasAkamai || signals.scriptProtection) {
            return {
                engine: 'stealth',
                reason: 'anti-bot-detected'
            };
        }

        // P1: Shadow DOM Performance
        // Playwright's native C++ traversal + our DomWalker is faster than Selenium for deep trees
        if (signals.maxShadowDepth > 0) {
            return {
                engine: 'playwright',
                reason: 'shadow-dom-performance'
            };
        }

        // Default: Speed
        return {
            engine: 'playwright',
            reason: 'default'
        };
    }
}

module.exports = { AdaptivePolicy };
