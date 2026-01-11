/**
 * Starlight Protocol - Schema Validator
 * 
 * Phase 1.2: Critical Security Fix
 * 
 * Validates all incoming WebSocket messages against JSON schemas.
 * Prevents malformed or malicious payloads from being processed.
 */

// JSON Schema definitions for Starlight Protocol messages
const SCHEMAS = {
    // Base JSON-RPC 2.0 message structure
    'starlight.base': {
        type: 'object',
        required: ['jsonrpc', 'method', 'id'],
        properties: {
            jsonrpc: { const: '2.0' },
            method: { type: 'string', pattern: '^starlight\\.[a-zA-Z_][a-zA-Z0-9_]*$' },
            id: { type: 'string', maxLength: 100 },
            params: { type: 'object' }
        },
        additionalProperties: false
    },

    // Registration message
    'starlight.registration': {
        type: 'object',
        required: ['layer', 'priority'],
        properties: {
            layer: { type: 'string', maxLength: 50, pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
            priority: { type: 'integer', minimum: 1, maximum: 10 },
            capabilities: { type: 'array', items: { type: 'string', maxLength: 50 } },
            selectors: { type: 'array', items: { type: 'string', maxLength: 500 } },
            authToken: { type: 'string', maxLength: 500 }
        }
    },

    // Intent message
    'starlight.intent': {
        type: 'object',
        properties: {
            cmd: {
                type: 'string',
                enum: ['goto', 'click', 'fill', 'select', 'hover', 'check', 'uncheck',
                    'scroll', 'press', 'type', 'upload', 'screenshot', 'checkpoint', 'clear']
            },
            goal: { type: 'string', maxLength: 200 },
            selector: { type: 'string', maxLength: 500 },
            url: { type: 'string', maxLength: 2000 },
            text: { type: 'string', maxLength: 5000 },
            value: { type: 'string', maxLength: 1000 },
            key: { type: 'string', maxLength: 50 },
            direction: { type: 'string', enum: ['top', 'bottom', 'left', 'right'] },
            stabilityHint: { type: 'integer', minimum: 0, maximum: 60000 }
        }
    },

    // Action message (Sentinel -> Hub during hijack)
    'starlight.action': {
        type: 'object',
        required: ['cmd', 'selector'],
        properties: {
            cmd: { type: 'string', enum: ['click', 'fill', 'hide', 'remove'] },
            selector: { type: 'string', maxLength: 500 },
            text: { type: 'string', maxLength: 5000 }
        }
    },

    // Context update
    'starlight.context_update': {
        type: 'object',
        required: ['context'],
        properties: {
            context: { type: 'object' }
        }
    },

    // Hijack message
    'starlight.hijack': {
        type: 'object',
        required: ['reason'],
        properties: {
            reason: { type: 'string', maxLength: 500 }
        }
    }
};

class SchemaValidator {
    constructor() {
        this.schemas = SCHEMAS;
    }

    /**
     * Validate a message against its schema.
     * @param {object} msg - The message to validate
     * @returns {object} { valid: boolean, errors: string[] }
     */
    validate(msg) {
        const errors = [];

        // Step 1: Validate base structure
        const baseResult = this._validateAgainst(msg, this.schemas['starlight.base']);
        if (!baseResult.valid) {
            return { valid: false, errors: baseResult.errors };
        }

        // Step 2: Validate method-specific params
        const methodSchema = this.schemas[msg.method];
        if (methodSchema && msg.params) {
            const paramsResult = this._validateAgainst(msg.params, methodSchema);
            if (!paramsResult.valid) {
                return { valid: false, errors: paramsResult.errors };
            }
        }

        return { valid: true, errors: [] };
    }

    /**
     * Validate an object against a schema.
     * @private
     */
    _validateAgainst(obj, schema) {
        const errors = [];

        // Check type
        if (schema.type === 'object' && (typeof obj !== 'object' || obj === null)) {
            return { valid: false, errors: ['Expected object'] };
        }

        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (!(field in obj)) {
                    errors.push(`Missing required field: ${field}`);
                }
            }
        }

        // Check properties
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in obj) {
                    const fieldErrors = this._validateField(obj[key], propSchema, key);
                    errors.push(...fieldErrors);
                }
            }
        }

        // Check additionalProperties
        if (schema.additionalProperties === false && schema.properties) {
            const allowedKeys = new Set(Object.keys(schema.properties));
            for (const key of Object.keys(obj)) {
                if (!allowedKeys.has(key)) {
                    errors.push(`Unexpected field: ${key}`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate a single field.
     * @private
     */
    _validateField(value, schema, fieldName) {
        const errors = [];

        // Skip validation for null/undefined optional fields
        if (value === null || value === undefined) {
            return errors;  // Optional field not provided - that's OK
        }

        // Type check
        if (schema.type === 'string' && typeof value !== 'string') {
            errors.push(`${fieldName}: expected string`);
        } else if (schema.type === 'integer' && (!Number.isInteger(value))) {
            errors.push(`${fieldName}: expected integer`);
        } else if (schema.type === 'array' && !Array.isArray(value)) {
            errors.push(`${fieldName}: expected array`);
        }

        // Const check
        if (schema.const !== undefined && value !== schema.const) {
            errors.push(`${fieldName}: must be "${schema.const}"`);
        }

        // Enum check
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`${fieldName}: must be one of [${schema.enum.join(', ')}]`);
        }

        // String constraints
        if (typeof value === 'string') {
            if (schema.maxLength && value.length > schema.maxLength) {
                errors.push(`${fieldName}: exceeds max length of ${schema.maxLength}`);
            }
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
                errors.push(`${fieldName}: does not match pattern ${schema.pattern}`);
            }
        }

        // Number constraints
        if (typeof value === 'number') {
            if (schema.minimum !== undefined && value < schema.minimum) {
                errors.push(`${fieldName}: below minimum of ${schema.minimum}`);
            }
            if (schema.maximum !== undefined && value > schema.maximum) {
                errors.push(`${fieldName}: above maximum of ${schema.maximum}`);
            }
        }

        return errors;
    }
}

module.exports = { SchemaValidator, SCHEMAS };
