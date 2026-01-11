/**
 * Interactive Element Cache
 * Part of Phase 8.5: Performance Optimization
 * 
 * Caches interactive elements to reduce DOM traversal overhead during
 * repeated semantic resolution attempts.
 */

class InteractiveElementCache {
    constructor(ttlMs = 2000) {
        this.cache = new Map(); // root element -> { items: [], timestamp: number }
        this.ttl = ttlMs;
    }

    /**
     * Get cached elements for a root node if valid
     * @param {Element} root - The root element (usually document or container)
     * @returns {Array|null} Array of elements or null if miss/expired
     */
    get(root) {
        // We can't use DOM elements as Map keys efficiently if they get GC'd, 
        // but for short lived cache within a single evaluation context it works.
        // NOTE: In Playwright evaluate(), this class runs inside the browser context,
        // so weak references or IDs are needed if persistent. 
        // If this runs in Node.js, it can't hold DOM elements.

        // Since this module likely runs INSIDE browser context (injected), 
        // we can use the element reference.

        const entry = this.cache.get(root);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(root);
            return null;
        }

        return entry.items;
    }

    /**
     * Set cache for a root node
     * @param {Element} root 
     * @param {Array} items 
     */
    set(root, items) {
        this.cache.set(root, {
            items: items,
            timestamp: Date.now()
        });
    }

    /**
     * Clear the cache
     */
    clear() {
        this.cache.clear();
    }
}

// Export for browser context injection if needed, or CommonJS for Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InteractiveElementCache };
} else {
    window.InteractiveElementCache = InteractiveElementCache;
}
