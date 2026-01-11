/**
 * Starlight NLI - Gherkin Bridge
 * 
 * Phase 13: Natural Language Intent
 * 
 * Parses Gherkin .feature files and converts to Starlight commands.
 * Supports standard Cucumber step patterns.
 */

const fs = require('fs');
const path = require('path');

class GherkinBridge {
    constructor() {
        // Step pattern definitions
        // Each pattern maps Gherkin syntax to Starlight commands
        this.stepPatterns = [
            // Navigation
            {
                pattern: /^(?:Given|When|And|But)\s+I\s+(?:am\s+on|navigate\s+to|go\s+to|open)\s+"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'goto', url: this._normalizeUrl(match[1]) })
            },

            // Fill/Type
            {
                pattern: /^(?:When|And|But)\s+I\s+(?:fill|enter|type)\s+"([^"]+)"\s+(?:with|as)\s+"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'fill', goal: match[1], text: match[2] })
            },
            {
                pattern: /^(?:When|And|But)\s+I\s+(?:fill|enter|type)\s+(?:the\s+)?"([^"]+)"\s+(?:field|input)\s+(?:with|as)\s+"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'fill', goal: match[1], text: match[2] })
            },

            // Click
            {
                pattern: /^(?:When|And|But)\s+I\s+click\s+(?:on\s+)?(?:the\s+)?"([^"]+)"(?:\s+button)?$/i,
                handler: (match) => ({ cmd: 'click', goal: match[1] })
            },
            {
                pattern: /^(?:When|And|But)\s+I\s+(?:press|tap)\s+(?:the\s+)?"([^"]+)"(?:\s+button)?$/i,
                handler: (match) => ({ cmd: 'click', goal: match[1] })
            },

            // Select
            {
                pattern: /^(?:When|And|But)\s+I\s+select\s+"([^"]+)"\s+(?:from|in)\s+(?:the\s+)?"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'select', goal: match[2], value: match[1] })
            },

            // Check/Uncheck
            {
                pattern: /^(?:When|And|But)\s+I\s+check\s+(?:the\s+)?"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'check', goal: match[1] })
            },
            {
                pattern: /^(?:When|And|But)\s+I\s+uncheck\s+(?:the\s+)?"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'uncheck', goal: match[1] })
            },

            // Hover
            {
                pattern: /^(?:When|And|But)\s+I\s+hover\s+(?:over\s+)?(?:the\s+)?"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'hover', goal: match[1] })
            },

            // Scroll
            {
                pattern: /^(?:When|And|But)\s+I\s+scroll\s+(?:to\s+)?(?:the\s+)?(top|bottom)$/i,
                handler: (match) => ({ cmd: 'scroll', direction: match[1].toLowerCase() })
            },

            // Wait/Checkpoint (Then assertions become checkpoints)
            {
                pattern: /^(?:Then)\s+I\s+should\s+see\s+"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'checkpoint', name: `Verify: ${match[1]}` })
            },
            {
                pattern: /^(?:Then)\s+(?:the\s+)?page\s+(?:should\s+)?(?:contains?|has|shows?)\s+"([^"]+)"$/i,
                handler: (match) => ({ cmd: 'checkpoint', name: `Verify: ${match[1]}` })
            },

            // Screenshot
            {
                pattern: /^(?:When|And|But)\s+I\s+(?:take\s+)?(?:a\s+)?screenshot(?:\s+(?:named?)?\s+"([^"]+)")?$/i,
                handler: (match) => ({ cmd: 'screenshot', name: match[1] || 'screenshot' })
            },

            // Press key
            {
                pattern: /^(?:When|And|But)\s+I\s+press\s+(?:the\s+)?"([^"]+)"\s+key$/i,
                handler: (match) => ({ cmd: 'press', key: match[1] })
            }
        ];
    }

    /**
     * Parse a .feature file and return Starlight commands.
     * @param {string} featurePath - Path to .feature file
     * @returns {object} - { feature, scenarios: [{ name, steps }] }
     */
    parseFile(featurePath) {
        const content = fs.readFileSync(featurePath, 'utf-8');
        return this.parse(content);
    }

    /**
     * Parse Gherkin content string.
     * @param {string} content - Gherkin content
     * @returns {object} - { feature, scenarios: [{ name, steps }] }
     */
    parse(content) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

        let feature = '';
        const scenarios = [];
        let currentScenario = null;

        for (const line of lines) {
            // Feature line
            if (line.startsWith('Feature:')) {
                feature = line.replace('Feature:', '').trim();
                continue;
            }

            // Scenario line
            if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
                if (currentScenario) {
                    scenarios.push(currentScenario);
                }
                currentScenario = {
                    name: line.replace(/^Scenario(?: Outline)?:/, '').trim(),
                    steps: []
                };
                continue;
            }

            // Skip Background, Examples, tags, etc.
            if (line.startsWith('Background:') || line.startsWith('Examples:') ||
                line.startsWith('@') || line.startsWith('|')) {
                continue;
            }

            // Step line
            if (currentScenario && (line.startsWith('Given') || line.startsWith('When') ||
                line.startsWith('Then') || line.startsWith('And') || line.startsWith('But'))) {
                const command = this._parseStep(line);
                if (command) {
                    currentScenario.steps.push(command);
                }
            }
        }

        // Don't forget the last scenario
        if (currentScenario) {
            scenarios.push(currentScenario);
        }

        return { feature, scenarios };
    }

    /**
     * Parse a single Gherkin step into a Starlight command.
     * @private
     */
    _parseStep(step) {
        for (const { pattern, handler } of this.stepPatterns) {
            const match = step.match(pattern);
            if (match) {
                return handler(match);
            }
        }

        // Unrecognized step - log warning
        console.warn(`[Gherkin] Unrecognized step: ${step}`);
        return null;
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

    /**
     * Convert all scenarios to flat array of commands.
     * @param {object} parsed - Output from parse()
     * @returns {object[]} - Flat array of Starlight commands
     */
    toCommands(parsed) {
        const commands = [];
        for (const scenario of parsed.scenarios) {
            // Add scenario checkpoint
            commands.push({ cmd: 'checkpoint', name: `Scenario: ${scenario.name}` });
            commands.push(...scenario.steps);
        }
        return commands;
    }
}

module.exports = { GherkinBridge };
