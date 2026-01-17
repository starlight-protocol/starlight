
/**
 * Starlight Protocol - Schema Validator
 * 
 * Phase 1.2: Critical Security Fix
 * 
 * Validates all incoming WebSocket messages against JSON schemas.
 * Prevents malformed or malicious payloads from being processed.
 */

const fs = require('fs');
const path = require('path');

class SchemaValidator {
    /**
     * @param {string} [schemaDir] - Directory containing schema JSON files
     */
    constructor(schemaDir) {
        this.schemas = {};
        // Default to project root schemas if not provided
        const dir = schemaDir || path.resolve(__dirname, '../../schemas');
        this._loadSchemas(dir);
    }

    _loadSchemas(dir) {
        if (!fs.existsSync(dir)) {
            console.warn(`[SchemaValidator] Schema directory not found: ${dir}`);
            return;
        }

        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(dir, file), 'utf8');
                    const schema = JSON.parse(content);
                    // Map by both filename (starlight.intent) and explicit title
                    const key = file.replace('.schema.json', '');
                    this.schemas[key] = schema;
                    if (schema.title) {
                        this.schemas[schema.title] = schema;
                    }
                } catch (e) {
                    console.error(`[SchemaValidator] Failed to load ${file}:`, e);
                }
            }
        }
    }

    getSchema(method) {
        return this.schemas[method];
    }

    /**
     * Validate a message against its schema.
     * @param {object} msg - The message to validate
     * @returns {object} { valid: boolean, errors: string[] }
     */
    validate(msg) {
        if (!msg || !msg.method) {
            return { valid: false, errors: ['Message missing method field'] };
        }

        const schema = this.schemas[msg.method];
        if (!schema) {
            // If no schema found, strict security says REJECT (or warn if permissive)
            return { valid: false, errors: [`No schema definition found for method: ${msg.method}`] };
        }

        return this._validateAgainst(msg, schema);
    }

    /**
     * Validate an object against a schema.
     * @private
     */
    _validateAgainst(obj, schema) {
        const errors = [];

        // 1. Type Check
        if (schema.type) {
            if (schema.type === 'object' && (typeof obj !== 'object' || obj === null)) errors.push('Expected object');
            else if (schema.type === 'string' && typeof obj !== 'string') errors.push('Expected string');
            else if (schema.type === 'integer' && !Number.isInteger(obj)) errors.push('Expected integer');
            else if (schema.type === 'number' && typeof obj !== 'number') errors.push('Expected number');
            else if (schema.type === 'array' && !Array.isArray(obj)) errors.push('Expected array');
        }

        if (errors.length > 0) return { valid: false, errors };

        // 2. Required Fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in obj)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        // 3. Properties (Recursion)
        if (schema.properties && typeof obj === 'object' && obj !== null) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in obj) {
                    const result = this._validateAgainst(obj[key], propSchema);
                    if (!result.valid) {
                        // contextualize error path
                        errors.push(...result.errors.map(e => `${key}.${e}`));
                    }
                }
            }
        }

        // 4. Constants & Enums
        if (schema.const !== undefined && obj !== schema.const) errors.push(`Must be ${schema.const}`);
        if (schema.enum && !schema.enum.includes(obj)) errors.push(`Must be one of [${schema.enum.join(', ')}]`);

        // 5. String Constraints
        if (typeof obj === 'string') {
            if (schema.maxLength && obj.length > schema.maxLength) errors.push(`Exceeds max length ${schema.maxLength}`);
            if (schema.pattern && !new RegExp(schema.pattern).test(obj)) errors.push(`Pattern mismatch ${schema.pattern}`);
            if (schema.format === 'uri') { /* basic check */ }
        }

        // 6. oneOf Support (Critical for Intent Params)
        if (schema.oneOf) {
            let matched = false;
            for (const subSchema of schema.oneOf) {
                // We only check against the subSchema constraints
                const result = this._validateAgainst(obj, subSchema);
                if (result.valid) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                errors.push('Failed to match any oneOf conditions');
            }
        }

        return { valid: errors.length === 0, errors };
    }
}

module.exports = { SchemaValidator };
