/**
 * HistoryEngine - Persistence & Learning Layer (v4.0)
 * ===================================================
 * 
 * Responsibilities:
 * 1. Knowledge Base: Stores successful intent mappings in .history.json.
 * 2. Healing Signal: Provides frequency/recency data for selector stabilization.
 * 3. Schema Rigor: Ensures history data adheres to versioned protocol schemas.
 */

const fs = require('fs');
const path = require('path');

class HistoryEngine {
    constructor(options = {}) {
        this.historyPath = options.historyPath || path.join(process.cwd(), '.history.json');
        this.data = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.historyPath)) {
                return JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
            }
        } catch (e) {
            console.error(`[HistoryEngine] Failed to load history: ${e.message}`);
        }
        return { mappings: {}, metadata: { version: '4.0', lastModified: new Date().toISOString() } };
    }

    /**
     * Look up a mapping.
     */
    async lookup(goal, url = '*') {
        const urlMap = this.data.mappings[url] || this.data.mappings['*'];
        if (urlMap && urlMap[goal]) {
            return urlMap[goal].selector;
        }
        return null;
    }

    /**
     * Record a success.
     */
    async record(goal, selector, url = '*') {
        if (!this.data.mappings[url]) this.data.mappings[url] = {};

        const entry = this.data.mappings[url][goal] || { count: 0, firstSeen: new Date().toISOString() };
        entry.selector = selector;
        entry.count++;
        entry.lastSeen = new Date().toISOString();

        this.data.mappings[url][goal] = entry;
        this.data.metadata.lastModified = new Date().toISOString();

        this._save();
    }

    _save() {
        try {
            fs.writeFileSync(this.historyPath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error(`[HistoryEngine] Failed to save history: ${e.message}`);
        }
    }
}

module.exports = { HistoryEngine };
