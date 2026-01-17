/**
 * Shadow DOM Utilities
 * Shared helper functions for Shadow DOM traversal and selector generation.
 * Used by hub.js for semantic resolution and obstacle detection.
 */

/**
 * Browser-injectable Shadow DOM helpers.
 * These functions are designed to be serialized and passed to page.evaluate().
 */
const ShadowDOMHelpers = {
    /**
     * Recursively collect elements from shadow roots.
     * @param {Element|ShadowRoot} root - Starting root element
     * @param {string} selector - CSS selector to match
     * @param {boolean} shadowEnabled - Whether to traverse shadow roots
     * @param {number} maxDepth - Maximum shadow depth to traverse
     * @param {number} depth - Current depth (internal)
     * @returns {Element[]} Array of matching elements
     */
    collectElements: `function collectElements(root, selector, shadowEnabled, maxDepth, depth = 0) {
        if (depth > maxDepth) return [];
        let elements = [];
        try {
            elements = Array.from(root.querySelectorAll(selector));
        } catch (e) { /* invalid selector */ }

        if (shadowEnabled) {
            const allElements = root.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    elements = elements.concat(collectElements(el.shadowRoot, selector, shadowEnabled, maxDepth, depth + 1));
                }
            }
        }
        return elements;
    }`,

    /**
     * Generate a Playwright-compatible shadow-piercing selector.
     * @param {Element} element - Target element
     * @returns {string} Selector path with >>> combinators
     */
    generateShadowSelector: `function generateShadowSelector(element) {
        const path = [];
        let current = element;

        while (current && current !== document.body) {
            if (current.id) {
                path.unshift('#' + current.id);
                break;
            } else if (current.className && typeof current.className === 'string') {
                path.unshift('.' + current.className.split(' ').filter(c => c).join('.'));
            } else {
                path.unshift(current.tagName?.toLowerCase() || '*');
            }

            if (current.getRootNode() instanceof ShadowRoot) {
                const shadowHost = current.getRootNode().host;
                path.unshift('>>>');
                current = shadowHost;
            } else {
                current = current.parentElement;
            }
        }
        return path.join(' ');
    }`,

    /**
     * Get shadow selector only if element is in Shadow DOM.
     * @param {Element} element - Target element
     * @returns {string|null} Selector or null if not in shadow
     */
    getShadowSelector: `function getShadowSelector(element) {
        const isInShadow = element.getRootNode() instanceof ShadowRoot;
        if (!isInShadow) return null;
        return generateShadowSelector(element);
    }`,

    /**
     * Check if an element is visible.
     * @param {Element} element - Target element
     * @returns {boolean} True if element is visible
     */
    isElementVisible: `function isElementVisible(element) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               rect.width > 0 && rect.height > 0;
    }`
};

/**
 * Get the combined helper code to inject into page.evaluate()
 * @returns {string} Combined function definitions
 */
function getInjectableHelpers() {
    return Object.values(ShadowDOMHelpers).join('\n\n');
}

/**
 * Build page.evaluate code for semantic resolution
 * SECURITY: No eval() - functions are defined inline.
 * @param {string} goal - The semantic goal text
 * @param {boolean} shadowEnabled - Whether shadow DOM is enabled
 * @param {number} maxDepth - Max shadow traversal depth
 * @returns {Function} Function to pass to page.evaluate
 */
function buildSemanticResolver(goal, shadowEnabled, maxDepth) {
    return ({ goalText, shadowEnabled, maxDepth }) => {
        // SECURITY FIX: Inline function definitions instead of eval()
        function collectElements(root, selector, shadowEnabled, maxDepth, depth = 0) {
            if (depth > maxDepth) return [];
            let elements = [];
            try {
                elements = Array.from(root.querySelectorAll(selector));
            } catch (e) { /* invalid selector */ }

            if (shadowEnabled) {
                const allElements = root.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        elements = elements.concat(collectElements(el.shadowRoot, selector, shadowEnabled, maxDepth, depth + 1));
                    }
                }
            }
            return elements;
        }

        function generateShadowSelector(element) {
            const path = [];
            let current = element;

            while (current && current !== document.body) {
                if (current.id) {
                    path.unshift('#' + current.id);
                    break;
                } else if (current.className && typeof current.className === 'string') {
                    path.unshift('.' + current.className.split(' ').filter(c => c).join('.'));
                } else {
                    path.unshift(current.tagName?.toLowerCase() || '*');
                }

                if (current.getRootNode() instanceof ShadowRoot) {
                    const shadowHost = current.getRootNode().host;
                    path.unshift('>>>');
                    current = shadowHost;
                } else {
                    current = current.parentElement;
                }
            }
            return path.join(' ');
        }

        // SECURITY: Escape CSS special characters in text content
        function escapeCssText(text) {
            return text.replace(/["\\]/g, '\\$&').replace(/\n/g, ' ').trim();
        }

        const normalizedGoal = goalText.toLowerCase();
        const buttons = collectElements(document, 'button, a, input[type="button"]', shadowEnabled, maxDepth);

        // 1. Exact text match
        let match = buttons.find(b => (b.innerText || b.textContent || '').toLowerCase().includes(normalizedGoal));

        // 2. ARIA/ID fallback
        if (!match) {
            match = buttons.find(b =>
                (b.getAttribute('aria-label') || '').toLowerCase().includes(normalizedGoal) ||
                (b.id || '').toLowerCase().includes(normalizedGoal)
            );
        }

        if (match) {
            const isInShadow = match.getRootNode() instanceof ShadowRoot;
            if (isInShadow && shadowEnabled) {
                return { selector: generateShadowSelector(match), inShadow: true };
            }
            // Text-based selector for precision - SECURITY: escaped text
            const textContent = escapeCssText((match.innerText || match.textContent || '').trim());
            const tagName = match.tagName.toLowerCase();
            if ((tagName === 'a' || tagName === 'button') && textContent && textContent.length < 50) {
                return { selector: `${tagName}:has-text("${textContent}")`, inShadow: false, textMatch: true };
            }
            if (match.id) return { selector: `#${match.id}`, inShadow: false };
            if (match.className && typeof match.className === 'string') {
                return { selector: `.${match.className.split(' ').filter(c => c).join('.')}`, inShadow: false };
            }
            return { selector: match.tagName.toLowerCase(), inShadow: false };
        }
        return null;
    };
}

module.exports = {
    ShadowDOMHelpers,
    getInjectableHelpers,
    buildSemanticResolver
};
