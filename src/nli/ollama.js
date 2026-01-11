/**
 * Starlight NLI - Ollama Client
 * 
 * Phase 13: Natural Language Intent
 * 
 * Handles communication with local Ollama server for LLM inference.
 * Supports multiple models with configurable endpoints.
 */

const https = require('https');
const http = require('http');

class OllamaClient {
    /**
     * Create an Ollama client instance.
     * @param {object} config - NLI configuration from config.json
     */
    constructor(config = {}) {
        this.endpoint = process.env.NLI_ENDPOINT || config.endpoint || 'http://localhost:11434';
        this.model = process.env.NLI_MODEL || config.model || 'llama3.2:1b';
        this.timeout = config.timeout || 60000;
        this.available = null; // Cached availability status
    }

    /**
     * Check if Ollama server is running.
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        if (this.available !== null) {
            return this.available;
        }

        try {
            const response = await this._request('GET', '/api/tags', null, 5000);
            this.available = response && response.models;
            return this.available;
        } catch (error) {
            console.log(`[NLI] Ollama not available at ${this.endpoint}: ${error.message}`);
            this.available = false;
            return false;
        }
    }

    /**
     * List available models on the Ollama server.
     * @returns {Promise<string[]>}
     */
    async listModels() {
        try {
            const response = await this._request('GET', '/api/tags');
            return (response.models || []).map(m => m.name);
        } catch (error) {
            return [];
        }
    }

    /**
     * Generate a completion using the configured model.
     * @param {string} prompt - The prompt to send to the model
     * @param {string} systemPrompt - System prompt for context
     * @returns {Promise<string>} - Generated text
     */
    async generate(prompt, systemPrompt = '') {
        const body = {
            model: this.model,
            prompt: prompt,
            system: systemPrompt,
            stream: false,
            options: {
                temperature: 0.1,  // Low temperature for consistent output
                num_predict: 2048  // Max tokens
            }
        };

        try {
            const response = await this._request('POST', '/api/generate', body);
            return response.response || '';
        } catch (error) {
            throw new Error(`Ollama generation failed: ${error.message}`);
        }
    }

    /**
     * Chat completion (for models that support it).
     * @param {object[]} messages - Array of {role, content} messages
     * @returns {Promise<string>}
     */
    async chat(messages) {
        const body = {
            model: this.model,
            messages: messages,
            stream: false,
            options: {
                temperature: 0.1
            }
        };

        try {
            const response = await this._request('POST', '/api/chat', body);
            return response.message?.content || '';
        } catch (error) {
            throw new Error(`Ollama chat failed: ${error.message}`);
        }
    }

    /**
     * Make HTTP request to Ollama server.
     * @private
     */
    async _request(method, path, body = null, timeout = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.endpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 11434),
                path: url.pathname,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: timeout || this.timeout
            };

            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(data);
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
}

module.exports = { OllamaClient };
