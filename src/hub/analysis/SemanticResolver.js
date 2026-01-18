/**
 * SemanticResolver - Intelligence Layer (v4.0)
 * ===========================================
 * 
 * Responsibilities:
 * 1. Intent Mapping: Translates natural language goals to stable CSS/XPath selectors.
 * 2. Healing Awareness: Tracks selector drift and suggests replacements.
 * 3. Cache Management: High-speed resolution of known successful paths.
 */

class SemanticResolver {
    constructor(historyEngine) {
        this.history = historyEngine;
        this.cache = new Map(); // Fast-path memory
    }

    /**
     * Resolves a goal to a concrete selector.
     * @param {string} goal - The natural language target (e.g., 'Submit Button')
     * @param {string} [contextUrl] - For URL-specific mappings
     * @returns {Promise<string|null>}
     */
    async resolve(goal, contextUrl = '*') {
        const key = `${contextUrl}:${goal}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // 1. Check History (EVID-003 Integration)
        let resolved = await this.history.lookup(goal, contextUrl);

        // 2. Pass-through for literal selectors
        if (!resolved && goal && (goal.startsWith('#') || goal.startsWith('.') || goal.includes('>>'))) {
            resolved = goal;
        }

        // 3. Primary Semantic Heuristics (Dynamic & Site-Agnostic v4.0)
        if (!resolved && goal) {
            const escaped = goal.replace(/"/g, '\\"');
            const lowerGoal = goal.toLowerCase();

            // Strategy: Prioritized search for goal in IDs, placeholders, data-test, names, labels, and text.
            const seekers = [
                `input#${escaped}`, `input[name="${escaped}"]`,
                `input[data-test*="${escaped}" i]`, `input[data-testid*="${escaped}" i]`,
                `input[placeholder*="${escaped}" i]`,
                `[aria-label*="${escaped}" i]`, `[name*="${escaped}" i]`, `[id*="${escaped}" i]`,
                `button:has-text("${escaped}")`, `a:has-text("${escaped}")`,
                `input[type="submit"][value*="${escaped}" i]`,
                `label:has-text("${escaped}") ~ input`, `label:has-text("${escaped}") ~ select`
            ];

            // Saucedemo/Standard Site Fallbacks (Safety Pins)
            if (lowerGoal.includes('username')) seekers.unshift('input#user-name', 'input[data-test="username"]', '#user-name');
            if (lowerGoal.includes('password')) seekers.unshift('input#password', 'input[data-test="password"]', '#password');
            if (lowerGoal.includes('login')) seekers.unshift('#login-button', 'input[data-test="login-button"]', 'input[type="submit"]', 'button:has-text("Login")');
            // High-precision login selectors
            if (lowerGoal.includes('username')) seekers.unshift('input[autocomplete="username"]', 'input[name="username"]', 'input[id*="user"][id*="name"]');
            if (lowerGoal.includes('password')) seekers.unshift('input[autocomplete="current-password"]', 'input[name="password"]', 'input[id*="pass"]');
            if (lowerGoal.includes('login')) seekers.unshift('button[type="submit"]:has-text("Log In")', 'button[type="submit"]:has-text("Sign In")', 'a:has-text("Log In")', 'a:has-text("Sign In")');


            resolved = seekers.join(', ');
        }

        if (resolved) {
            this.cache.set(key, resolved);
        }

        return resolved;
    }

    /**
     * Learns a new successful mapping.
     */
    async learn(goal, selector, contextUrl = '*') {
        const key = `${contextUrl}:${goal}`;
        this.cache.set(key, selector);
        await this.history.record(goal, selector, contextUrl);
    }
}

module.exports = { SemanticResolver };
