/**
 * Starlight Protocol - Atomic Lock
 * 
 * Phase 2.1: Architecture Improvement
 * 
 * Provides atomic locking to prevent race conditions.
 * Replaces non-atomic boolean locking with proper queue-based system.
 */

class AtomicLock {
    /**
     * Create atomic lock.
     * @param {object} options - Configuration
     * @param {number} options.ttl - Default lock timeout in ms (default: 10000)
     * @param {number} options.maxWaiters - Maximum queue length (default: 100)
     */
    constructor(options = {}) {
        this.ttl = options.ttl || 10000;
        this.maxWaiters = options.maxWaiters || 100;

        this.locks = new Map();      // key -> { owner, acquiredAt, ttl }
        this.waiters = new Map();    // key -> [{ resolve, reject, timeout }]

        // Periodic cleanup of expired locks
        this.cleanupInterval = setInterval(() => this._cleanup(), 5000);
    }

    /**
     * Acquire a lock.
     * @param {string} key - Lock key
     * @param {string} owner - Owner identifier
     * @param {number} ttl - Override default TTL
     * @returns {Promise<boolean>} True when lock acquired
     */
    async acquire(key, owner = 'anonymous', ttl = null) {
        const lockTTL = ttl || this.ttl;

        // Check if already locked
        const existing = this.locks.get(key);
        if (existing) {
            // Check if same owner (re-entrant)
            if (existing.owner === owner) {
                existing.acquiredAt = Date.now();  // Refresh
                return true;
            }

            // Check if expired
            if (Date.now() - existing.acquiredAt > existing.ttl) {
                // Expired - can acquire
                this._doAcquire(key, owner, lockTTL);
                return true;
            }

            // Must wait
            return this._waitForLock(key, owner, lockTTL);
        }

        // Not locked - acquire immediately
        this._doAcquire(key, owner, lockTTL);
        return true;
    }

    /**
     * Release a lock.
     * @param {string} key - Lock key
     * @param {string} owner - Owner identifier
     * @returns {boolean} True if released
     */
    release(key, owner = 'anonymous') {
        const existing = this.locks.get(key);

        if (!existing) {
            return false;  // Not locked
        }

        if (existing.owner !== owner) {
            console.warn(`[AtomicLock] Cannot release lock "${key}" - not owner`);
            return false;  // Not the owner
        }

        // Release the lock
        this.locks.delete(key);

        // Wake up first waiter
        this._wakeNextWaiter(key);

        return true;
    }

    /**
     * Force release a lock (for timeout/cleanup).
     * @param {string} key - Lock key
     */
    forceRelease(key) {
        this.locks.delete(key);
        this._wakeNextWaiter(key);
    }

    /**
     * Check if a key is locked.
     * @param {string} key - Lock key
     * @returns {boolean}
     */
    isLocked(key) {
        const existing = this.locks.get(key);
        if (!existing) return false;

        // Check expiration
        if (Date.now() - existing.acquiredAt > existing.ttl) {
            this.forceRelease(key);
            return false;
        }

        return true;
    }

    /**
     * Get lock info.
     * @param {string} key - Lock key
     * @returns {object|null}
     */
    getLockInfo(key) {
        const lock = this.locks.get(key);
        if (!lock) return null;

        return {
            owner: lock.owner,
            acquiredAt: lock.acquiredAt,
            ttl: lock.ttl,
            remainingMs: Math.max(0, lock.ttl - (Date.now() - lock.acquiredAt)),
            waitersCount: (this.waiters.get(key) || []).length
        };
    }

    /**
     * Internal: Actually acquire the lock.
     * @private
     */
    _doAcquire(key, owner, ttl) {
        this.locks.set(key, {
            owner,
            acquiredAt: Date.now(),
            ttl
        });
    }

    /**
     * Internal: Wait for a lock to be released.
     * @private
     */
    _waitForLock(key, owner, ttl) {
        return new Promise((resolve, reject) => {
            // Check waiter limit
            if (!this.waiters.has(key)) {
                this.waiters.set(key, []);
            }

            const queue = this.waiters.get(key);
            if (queue.length >= this.maxWaiters) {
                reject(new Error(`Lock queue full for "${key}"`));
                return;
            }

            // Set timeout
            const timeout = setTimeout(() => {
                // Remove from queue
                const idx = queue.findIndex(w => w.owner === owner);
                if (idx !== -1) queue.splice(idx, 1);
                reject(new Error(`Lock timeout for "${key}"`));
            }, ttl);

            // Add to queue
            queue.push({ owner, ttl, resolve, reject, timeout });
        });
    }

    /**
     * Internal: Wake up next waiter.
     * @private
     */
    _wakeNextWaiter(key) {
        const queue = this.waiters.get(key);
        if (!queue || queue.length === 0) return;

        const waiter = queue.shift();
        clearTimeout(waiter.timeout);

        // Acquire for waiter
        this._doAcquire(key, waiter.owner, waiter.ttl);
        waiter.resolve(true);
    }

    /**
     * Internal: Cleanup expired locks.
     * @private
     */
    _cleanup() {
        const now = Date.now();

        for (const [key, lock] of this.locks.entries()) {
            if (now - lock.acquiredAt > lock.ttl) {
                console.log(`[AtomicLock] Expired lock released: ${key}`);
                this.forceRelease(key);
            }
        }
    }

    /**
     * Shutdown the lock manager.
     */
    shutdown() {
        clearInterval(this.cleanupInterval);
        this.locks.clear();

        // Reject all waiters
        for (const [key, queue] of this.waiters.entries()) {
            for (const waiter of queue) {
                clearTimeout(waiter.timeout);
                waiter.reject(new Error('Lock manager shutdown'));
            }
        }
        this.waiters.clear();
    }
}

module.exports = { AtomicLock };
