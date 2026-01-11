/**
 * Starlight NLI - Fallback Parser
 * 
 * Phase 13: Natural Language Intent
 * 
 * Pattern-based fallback when Ollama is unavailable.
 * Uses regex patterns for common automation phrases.
 */

class FallbackParser {
    constructor() {
        // Ordered by specificity (most specific first)
        this.patterns = [
            // Navigation patterns
            {
                regex: /^(?:go\s+to|navigate\s+to|open|visit)\s+["']?([^\s"']+)["']?$/i,
                handler: (match) => ({ cmd: 'goto', url: this._normalizeUrl(match[1]) })
            },

            // Fill patterns with "with/as/to" separator
            {
                regex: /^(?:fill|enter|type|input)\s+(?:in\s+)?["']?([^"']+?)["']?\s+(?:with|as|to|:)\s+["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'fill', goal: match[1].trim(), text: match[2].trim() })
            },

            // Fill patterns with "set X to Y"
            {
                regex: /^set\s+["']?([^"']+?)["']?\s+(?:to|as|=)\s+["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'fill', goal: match[1].trim(), text: match[2].trim() })
            },

            // Login shortcut pattern
            {
                regex: /^login\s+(?:with\s+)?(?:username|user|email)?\s*["']?([^"']+?)["']?\s+(?:and\s+)?(?:password|pass)?\s*["']?([^"']+?)["']?$/i,
                handler: (match) => [
                    { cmd: 'fill', goal: 'username', text: match[1].trim() },
                    { cmd: 'fill', goal: 'password', text: match[2].trim() },
                    { cmd: 'click', goal: 'Login' }
                ]
            },

            // Select/choose patterns
            {
                regex: /^(?:select|choose)\s+["']?(.+?)["']?\s+(?:from|in)\s+["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'select', goal: match[2].trim(), value: match[1].trim() })
            },

            // Check/uncheck patterns
            {
                regex: /^check\s+(?:the\s+)?["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'check', goal: match[1].trim() })
            },
            {
                regex: /^uncheck\s+(?:the\s+)?["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'uncheck', goal: match[1].trim() })
            },

            // Hover patterns
            {
                regex: /^hover\s+(?:over\s+)?(?:on\s+)?["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'hover', goal: match[1].trim() })
            },

            // Scroll patterns
            {
                regex: /^scroll\s+(?:to\s+)?(?:the\s+)?(top|bottom|down|up)$/i,
                handler: (match) => ({
                    cmd: 'scroll',
                    direction: match[1].toLowerCase() === 'up' ? 'top' :
                        match[1].toLowerCase() === 'down' ? 'bottom' :
                            match[1].toLowerCase()
                })
            },

            // Screenshot pattern
            {
                regex: /^(?:take\s+)?(?:a\s+)?screenshot\s+(?:named?\s+)?["']?(.+?)["']?$/i,
                handler: (match) => ({ cmd: 'screenshot', name: match[1].trim() })
            },

            // Press key pattern
            {
                regex: /^press\s+(?:the\s+)?["']?(.+?)["']?(?:\s+key)?$/i,
                handler: (match) => ({ cmd: 'press', key: match[1].trim() })
            },

            // Click patterns (most generic, should be last)
            {
                regex: /^(?:click|tap|press|hit)\s+(?:on\s+)?(?:the\s+)?["']?(.+?)["']?(?:\s+button)?$/i,
                handler: (match) => ({ cmd: 'click', goal: match[1].trim() })
            }
        ];

        // Compound instruction separators
        this.separators = /\s+(?:and\s+then|then|and|,\s*then|,)\s+/i;
    }

    /**
     * Parse natural language text into Starlight commands.
     * @param {string} text - Natural language instruction
     * @returns {object[]} - Array of Starlight intent objects
     */
    parse(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const trimmed = text.trim();

        // Check for compound login pattern BEFORE splitting (contains "and password")
        // This prevents splitting "login with username X and password Y" on "and"
        const loginMatch = trimmed.match(/^login\s+(?:with\s+)?(?:username|user|email)?\s*["']?([^"']+?)["']?\s+and\s+password\s+["']?([^"']+?)["']?$/i);
        if (loginMatch) {
            return [
                { cmd: 'fill', goal: 'username', text: loginMatch[1].trim() },
                { cmd: 'fill', goal: 'password', text: loginMatch[2].trim() },
                { cmd: 'click', goal: 'Login' }
            ];
        }

        // Split compound instructions
        const steps = trimmed.split(this.separators);
        const results = [];

        for (const step of steps) {
            const stepTrimmed = step.trim();
            if (!stepTrimmed) continue;

            const parsed = this._parseStep(stepTrimmed);
            if (Array.isArray(parsed)) {
                results.push(...parsed);
            } else if (parsed) {
                results.push(parsed);
            }
        }

        return results;
    }

    /**
     * Parse a single instruction step.
     * @private
     */
    _parseStep(step) {
        for (const pattern of this.patterns) {
            const match = step.match(pattern.regex);
            if (match) {
                return pattern.handler(match);
            }
        }

        // Ultimate fallback: treat entire text as a click goal
        // This lets the semantic resolver handle it
        return { cmd: 'click', goal: step };
    }

    /**
     * Normalize URL by adding protocol if missing.
     * @private
     */
    _normalizeUrl(url) {
        if (!url.match(/^https?:\/\//i)) {
            return 'https://' + url;
        }
        return url;
    }
}

module.exports = { FallbackParser };
