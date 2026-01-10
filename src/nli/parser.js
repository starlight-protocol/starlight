/**
 * Starlight NLI - Main Parser
 * 
 * Phase 13: Natural Language Intent
 * 
 * Central NLI parser that coordinates between Ollama LLM and fallback.
 * Converts natural language to structured Starlight commands.
 */

const { OllamaClient } = require('./ollama');
const { FallbackParser } = require('./fallback');
const { INTENT_PARSER_PROMPT, INTENT_PARSER_PROMPT_LITE } = require('./prompts');

class NLIParser {
    /**
     * Create NLI parser instance.
     * @param {object} config - NLI configuration from config.json
     */
    constructor(config = {}) {
        this.config = config;
        this.enabled = config.enabled !== false;
        this.ollama = new OllamaClient(config);
        this.fallback = new FallbackParser();
        this.fallbackMode = config.fallback?.mode || 'pattern';
        this.fallbackEnabled = config.fallback?.enabled !== false;

        // Use lite prompt for smaller models
        const model = this.ollama.model;
        this.useCompactPrompt = model.includes(':1b') || model.includes(':3b');
    }

    /**
     * Parse natural language instruction into Starlight commands.
     * @param {string} text - Natural language instruction
     * @returns {Promise<object[]>} - Array of Starlight intent objects
     */
    async parse(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const trimmed = text.trim();
        console.log(`[NLI] Parsing: "${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''}"`);

        // Check if Ollama is available
        const ollamaAvailable = await this.ollama.isAvailable();

        if (ollamaAvailable) {
            try {
                const result = await this._parseWithLLM(trimmed);
                console.log(`[NLI] LLM parsed ${result.length} step(s)`);
                return result;
            } catch (error) {
                console.warn(`[NLI] LLM parsing failed: ${error.message}`);
                if (this.fallbackEnabled) {
                    console.log(`[NLI] Falling back to pattern parser`);
                    return this._parseWithFallback(trimmed);
                }
                throw error;
            }
        } else {
            if (this.fallbackEnabled) {
                console.log(`[NLI] Ollama not available, using fallback parser`);
                return this._parseWithFallback(trimmed);
            }
            throw new Error('Ollama not available and fallback disabled');
        }
    }

    /**
     * Parse using Ollama LLM.
     * @private
     */
    async _parseWithLLM(text) {
        const systemPrompt = this.useCompactPrompt
            ? INTENT_PARSER_PROMPT_LITE
            : INTENT_PARSER_PROMPT;

        const startTime = Date.now();
        const response = await this.ollama.generate(text, systemPrompt);
        const elapsed = Date.now() - startTime;

        console.log(`[NLI] LLM response (${elapsed}ms): ${response.substring(0, 100)}...`);

        // Parse JSON from response
        const commands = this._extractJSON(response);

        // Validate commands
        return this._validateCommands(commands);
    }

    /**
     * Parse using fallback pattern matcher.
     * @private
     */
    _parseWithFallback(text) {
        if (this.fallbackMode === 'goal') {
            // Pass entire text as a semantic goal
            return [{ cmd: 'click', goal: text }];
        }

        if (this.fallbackMode === 'error') {
            throw new Error('NLI fallback mode is "error" - no LLM available');
        }

        // Default: pattern-based parsing
        return this.fallback.parse(text);
    }

    /**
     * Extract JSON array from LLM response.
     * Handles common LLM output quirks.
     * @private
     */
    _extractJSON(text) {
        // Try direct parse
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch { }

        // Try to find JSON array in response
        const arrayMatch = text.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch { }
        }

        // Try to find JSON object
        const objectMatch = text.match(/\{[\s\S]*?\}/);
        if (objectMatch) {
            try {
                return [JSON.parse(objectMatch[0])];
            } catch { }
        }

        // Fallback: treat as plain text and use pattern parser
        console.warn('[NLI] Could not parse JSON from LLM response, using fallback');
        return this.fallback.parse(text);
    }

    /**
     * Validate and normalize command objects.
     * @private
     */
    _validateCommands(commands) {
        const validCmds = ['goto', 'click', 'fill', 'select', 'hover',
            'check', 'uncheck', 'scroll', 'press',
            'screenshot', 'checkpoint', 'type', 'upload'];

        return commands
            .filter(cmd => cmd && typeof cmd === 'object')
            .map(cmd => {
                // Normalize command
                const normalized = { ...cmd };

                // Validate cmd field
                if (!normalized.cmd || !validCmds.includes(normalized.cmd)) {
                    // Try to infer cmd from other fields
                    if (normalized.url) normalized.cmd = 'goto';
                    else if (normalized.text && normalized.goal) normalized.cmd = 'fill';
                    else if (normalized.goal) normalized.cmd = 'click';
                    else return null;
                }

                // Normalize URL
                if (normalized.url && !normalized.url.match(/^https?:\/\//i)) {
                    normalized.url = 'https://' + normalized.url;
                }

                return normalized;
            })
            .filter(Boolean);
    }

    /**
     * Get parser status for diagnostics.
     */
    async getStatus() {
        const ollamaAvailable = await this.ollama.isAvailable();
        const models = ollamaAvailable ? await this.ollama.listModels() : [];

        return {
            enabled: this.enabled,
            ollamaAvailable,
            model: this.ollama.model,
            endpoint: this.ollama.endpoint,
            availableModels: models,
            fallbackEnabled: this.fallbackEnabled,
            fallbackMode: this.fallbackMode
        };
    }
}

module.exports = { NLIParser };
