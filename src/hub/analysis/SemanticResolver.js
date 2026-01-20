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

            // High-Class Strategy: Multi-Tier Prioritized Resolution (v4.1)
            let tiers = [];

            if (intent === 'fill') {
                tiers = [
                    // Tier 1: Explicit Matches
                    [`input[name="${normalized}"]`, `input[id="${normalized}"]`, `input[id="${kebabCase}"]`, `input[id="${camelCase}"]`],
                    [`input[data-test*="${normalized}" i]`, `input[data-test-id*="${normalized}" i]`, `input[data-test*="${camelCase}" i]`],
                    // Tier 2: Proximal Labels & Placeholders
                    [`label:has-text("${escaped}") ~ input`, `input[placeholder*="${escaped}" i]`, `input[aria-label*="${escaped}" i]`],
                    // Tier 3: Fuzzy Fallbacks
                    [`input[id*="${kebabCase}" i]`, `input[name*="${kebabCase}" i]`, `[contenteditable="true"]:has-text("${escaped}")`]
                ];
            } else if (intent === 'click') {
                tiers = [
                    // Tier 1: High-Fidelity Interactive Elements (Text-based)
                    [`button:has-text("${escaped}")`, `a:has-text("${escaped}")`],
                    // Tier 2: High-Fidelity Attributes (Explicit interactivity)
                    [`input[type="submit"][value*="${escaped}" i]`, `input[type="button"][value*="${escaped}" i]`, `[role="button"]:has-text("${escaped}")`, `[role="link"]:has-text("${escaped}")`],
                    // Tier 3: Targeted Accessibility Attributes & Playback
                    [`button[aria-label*="${escaped}" i]`, `a[aria-label*="${escaped}" i]`, `input[aria-label*="${escaped}" i]`, `[title*="${escaped}" i]`],
                    // Tier 4: Identification/Test Hooks & Class-based semantic (High-fidelity)
                    [`[data-test*="${normalized}" i]`, `[data-test-id*="${normalized}" i]`, `button[id*="${kebabCase}" i]`, `a[id*="${kebabCase}" i]`, `button[class*="${kebabCase}" i]`, `a[class*="${kebabCase}" i]`],
                    // Tier 5: Generic Semantic Fallbacks (Excluding structural noise)
                    [`[id="${kebabCase}"]`, `[id="${snakeCase}"]`, `[id="${camelCase}"]`],
                    [`[class*="${snakeCase}" i]:not(link, script, style, meta, div, section, span, ytd-miniplayer)`, `[aria-label*="${escaped}" i]:not(link, script, style, meta, div, section, span, ytd-miniplayer)`]
                ];
            } else {
                // Tiered Generic Fallback
                tiers = [
                    [`[id="${kebabCase}"]`, `[id="${snakeCase}"]`, `[id="${camelCase}"]`],
                    [`[data-test*="${kebabCase}" i]`, `[data-test*="${camelCase}" i]`],
                    [`label:has-text("${escaped}") ~ input`, `[aria-label*="${escaped}" i]`, `button:has-text("${escaped}")`, `a:has-text("${escaped}")`]
                ];
            }

            resolved = tiers.map(t => t.join(', ')).filter(s => s.length > 0);
        }

        if (resolved) {
            this.cache.set(key, resolved);
        }

        return resolved;

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
