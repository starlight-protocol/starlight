
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
// We are testing the existing file, refactoring it
const { SchemaValidator } = require('../../../../src/validation/schema_validator');

describe('SchemaValidator (SSOT)', () => {
    it('should load schemas from JSON files instead of hardcoded objects', () => {
        const schemaDir = path.resolve(__dirname, '../../../../schemas');
        const validator = new SchemaValidator(schemaDir);

        // Verify it loaded 'starlight.intent' which definitely exists in schemas/
        const intentSchema = validator.getSchema('starlight.intent');
        assert.ok(intentSchema, 'Should have loaded starlight.intent schema');
        assert.strictEqual(intentSchema.description, 'Command from Intent layer to Hub requesting an action', 'Should match JSON content');
    });

    it('should validate a correct Intent message', () => {
        const schemaDir = path.resolve(__dirname, '../../../../schemas');
        const validator = new SchemaValidator(schemaDir);

        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.intent',
            params: {
                cmd: 'click',
                selector: '#btn'
            },
            id: '1'
        };

        const result = validator.validate(msg);
        assert.strictEqual(result.valid, true, `Validation failed: ${result.errors}`);
    });
});
