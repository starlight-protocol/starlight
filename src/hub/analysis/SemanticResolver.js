/**
 * SemanticResolver - Intelligence Layer (v4.0)
 * ===========================================
 * 
 * Responsibilities:
 * 1. Intent Mapping: Translates natural language goals to stable CSS/XPath selectors.
 * 2. Healing Awareness: Tracks selector drift and suggests replacements.
 * 3. Cache Management: High-speed resolution of known successful paths.
 * 4. Intent-Awareness: Uses the target action (click/fill) to weight heuristics.
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
     * @param {string} [intent] - The intended action (e.g., 'fill', 'click')
     * @returns {Promise<string|null>}
     */
    async resolve(goal, contextUrl = '*', intent = null) {
        const key = `${contextUrl}:${goal}:${intent || 'any'}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // 1. Check History (Learning & Memory v4.0)
        let resolved = await this.history.lookup(goal, contextUrl);

        // 2. Pass-through for literal selectors
        if (!resolved && goal && (goal.startsWith('#') || goal.startsWith('.') || goal.includes('>>'))) {
            resolved = goal;
        }

        // 3. Primary Semantic Heuristics (Dynamic & Site-Agnostic v4.0)
        if (!resolved && goal) {
            const escaped = goal.replace(/"/g, '\\"');
            const normalized = goal.toLowerCase().trim();
            const camelCase = normalized.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
            const kebabCase = normalized.replace(/\s+/g, '-');
            const snakeCase = normalized.replace(/\s+/g, '_');

            // High-Class Strategy: Prioritize search based on Intent (Performance & Purity)
            let seekers = [];

            if (intent === 'fill') {
                seekers = [
                    // Precise Form Elements
                    `input[name="${normalized}"]`, `input[id="${normalized}"]`, `input[id="${kebabCase}"]`, `input[id="${camelCase}"]`,
                    `input[data-test*="${normalized}" i]`, `input[data-test*="${camelCase}" i]`,
                    `textarea[name*="${normalized}" i]`, `select[name*="${normalized}" i]`,
                    `label:has-text("${escaped}") ~ input`, `label:has-text("${escaped}") ~ select`,
                    `input[placeholder*="${escaped}" i]`, `input[aria-label*="${escaped}" i]`,
                    // Fallback to general attributes but strictly scoped to inputs
                    `input[id*="${kebabCase}" i]`, `input[name*="${kebabCase}" i]`,
                    `[contenteditable="true"]:has-text("${escaped}")`
                ];
            } else if (intent === 'click') {
                seekers = [
                    // Interactive Surfaces
                    `button:has-text("${escaped}")`, `a:has-text("${escaped}")`,
                    `input[type="submit"][value*="${escaped}" i]`, `input[type="button"][value*="${escaped}" i]`,
                    `[role="button"]:has-text("${escaped}")`, `[role="link"]:has-text("${escaped}")`,
                    `[id="${kebabCase}"]`, `[id="${snakeCase}"]`, `[id="${camelCase}"]`,
                    `[class*="${snakeCase}" i]`, // Matches icon classes like shopping_cart
                    `[aria-label*="${escaped}" i]`, `[title*="${escaped}" i]`,
                    `button[id*="${kebabCase}" i]`, `a[id*="${kebabCase}" i]`
                ];
            } else {
                // Generic Fallback (Purity Layer)
                seekers = [
                    `[id="${kebabCase}"]`, `[id="${snakeCase}"]`, `[id="${camelCase}"]`,
                    `[data-test*="${kebabCase}" i]`, `[data-test*="${camelCase}" i]`,
                    `label:has-text("${escaped}") ~ input`,
                    `[aria-label*="${escaped}" i]`, `button:has-text("${escaped}")`, `a:has-text("${escaped}")`
                ];
            }

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
