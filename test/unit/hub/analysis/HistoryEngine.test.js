const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { HistoryEngine } = require('../../../../src/hub/analysis/HistoryEngine');

test('HistoryEngine: Learning & Persistence (EVID-003)', async (t) => {
    const historyPath = path.join(process.cwd(), '.test_history.json');
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);

    const engine = new HistoryEngine({ historyPath });

    await t.test('Should record and lookup mappings', async () => {
        await engine.record('Login Button', '#login-id', 'https://example.com');
        const resolved = await engine.lookup('Login Button', 'https://example.com');
        assert.strictEqual(resolved, '#login-id');
    });

    await t.test('Should persist to disk', () => {
        assert.ok(fs.existsSync(historyPath));
        const saved = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        assert.ok(saved.mappings['https://example.com']['Login Button']);
        assert.strictEqual(saved.metadata.version, '4.0');
    });

    // Cleanup
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
});
