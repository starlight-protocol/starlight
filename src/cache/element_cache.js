/**
 * Starlight Protocol - Element Cache
 * 
 * Phase 3.1: Performance Optimization
 * 
 * Caches DOM element lookups to avoid repeated full DOM scans
 * during semantic resolution.
 */

class ElementCache {
    /**
     * Create element cache.
     * @param {object} options - Configuration
     * @param {number} options.ttl - Cache entry TTL in ms (default: 5000)
     * @param {number} options.maxSize - Maximum cache entries (default: 100)
     */
    constructor(options = {}) {
        this.ttl = options.ttl || 5000;
        this.maxSize = options.maxSize || 100;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Get cached value.
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if not found/expired
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        // Check expiration
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.hits++;
        return entry.value;
    }

    /**
     * Set cached value.
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     */
    set(key, value) {
        // Enforce max size (LRU eviction)
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Invalidate entire cache.
     * Called after navigation or significant DOM changes.
     */
    invalidate() {
        this.cache.clear();
    }

    /**
     * Invalidate entries matching a pattern.
     * @param {string|RegExp} pattern - Key pattern to match
     */
    invalidatePattern(pattern) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get cache statistics.
     * @returns {object} Cache stats
     */
    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : 'N/A'
        };
    }

    /**
     * Clear cache and reset stats.
     */
    reset() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

module.exports = { ElementCache };
