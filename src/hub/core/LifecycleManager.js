
/**
 * Phase 3: LifecycleManager
 * Orchestrates Polyglot Sentinels based on manifest configuration.
 * Handles spawning, monitoring, and killing of child processes.
 */
class LifecycleManager {
    /**
     * @param {object} config - Hub configuration containing 'sentinels' array.
     * @param {Function} spawner - Injection for child_process.spawn (for testing)
     */
    constructor(config, spawner) {
        this.config = config || {};
        this.spawn = spawner || require('child_process').spawn;
        this.processes = [];
    }

    launchAll() {
        const sentinels = this.config.sentinels || [];

        for (const sentinel of sentinels) {
            this._launchSentinel(sentinel);
        }
    }

    _launchSentinel(manifest) {
        let cmd, args;

        switch (manifest.runtime) {
            case 'node':
                cmd = 'node';
                args = [manifest.entry];
                break;
            case 'python':
                cmd = 'python';
                // -u for unbuffered stdio (crucial for JSON-RPC over stdout)
                args = ['-u', manifest.entry];
                break;
            default:
                console.warn(`[LifecycleManager] Unknown runtime: ${manifest.runtime}`);
                return;
        }

        try {
            console.log(`[LifecycleManager] Launching ${manifest.name} (${cmd} ${args.join(' ')})`);
            const child = this.spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

            // Track process
            this.processes.push({ name: manifest.name, process: child });

            // Error handling (basic)
            child.stderr.on('data', (data) => {
                console.error(`[${manifest.name}] STDERR: ${data.toString()}`);
            });

        } catch (e) {
            console.error(`[LifecycleManager] Failed to launch ${manifest.name}:`, e);
        }
    }

    killAll() {
        this.processes.forEach(p => p.process.kill());
        this.processes = [];
    }
}

module.exports = { LifecycleManager };
