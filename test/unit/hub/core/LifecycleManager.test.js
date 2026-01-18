
const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { LifecycleManager } = require('../../../../src/hub/core/LifecycleManager');

describe('LifecycleManager (Polyglot Orchestrator)', () => {
    let manager;
    let spawnMock;

    beforeEach(() => {
        // Mock Config
        const config = {
            sentinels: [
                { name: 'pulse', runtime: 'node', entry: 'sentinels/pulse.js' },
                { name: 'vision', runtime: 'python', entry: 'sentinels/vision.py' }
            ]
        };

        // Mock Spawn
        spawnMock = mock.fn(() => ({
            stdout: { on: () => { } },
            stderr: { on: () => { } },
            on: () => { },
            kill: () => { }
        }));

        manager = new LifecycleManager(config, spawnMock);
    });

    it('should launch NODE sentinels using "node" command', () => {
        manager.launchAll();

        // Find the node call
        const nodeCall = spawnMock.mock.calls.find(c => c.arguments[0] === 'node');
        assert.ok(nodeCall, 'Should spawn node process');
        assert.strictEqual(nodeCall.arguments[1][0], 'sentinels/pulse.js');
    });

    it('should launch PYTHON sentinels using "python" command', () => {
        manager.launchAll();

        // Find the python call
        const pythonCall = spawnMock.mock.calls.find(c => c.arguments[0] === 'python');
        assert.ok(pythonCall, 'Should spawn python process');
        assert.strictEqual(pythonCall.arguments[1][0], '-u'); // Unbuffered
        assert.strictEqual(pythonCall.arguments[1][1], 'sentinels/vision.py');
    });
});
