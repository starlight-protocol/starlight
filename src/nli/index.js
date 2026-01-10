/**
 * Starlight NLI - Module Index
 * 
 * Phase 13: Natural Language Intent
 * 
 * Exports all NLI components for easy consumption.
 */

const { NLIParser } = require('./parser');
const { OllamaClient } = require('./ollama');
const { FallbackParser } = require('./fallback');
const { GherkinBridge } = require('./gherkin');
const prompts = require('./prompts');

/**
 * Create a configured NLI parser from config.json settings.
 * @param {object} config - Full config object or just nli section
 * @returns {NLIParser}
 */
function createParser(config = {}) {
    const nliConfig = config.nli || config;
    return new NLIParser(nliConfig);
}

module.exports = {
    NLIParser,
    OllamaClient,
    FallbackParser,
    GherkinBridge,
    prompts,
    createParser
};
