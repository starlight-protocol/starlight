
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
    constructor(config, hubUrl, spawner) {
        this.config = config || {};
        this.hubUrl = hubUrl || 'ws://localhost:8080';
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
            console.log(`[LifecycleManager] Launching ${manifest.name} (${cmd} ${args.join(' ')}) with HUB_URL=${this.hubUrl}`);
            const env = { ...process.env, HUB_URL: this.hubUrl };

            // Security: Avoid 'shell: true' on Windows to prevent concatenation vulnerabilities
            // Visibility: Pipe stdout/stderr to main Hub console
            const child = this.spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env });

            // Track process
            this.processes.push({ name: manifest.name, process: child });

            child.stdout.on('data', (data) => {
                const out = data.toString().trim();
                if (out) console.log(`[${manifest.name}] ${out}`);
            });

            child.stderr.on('data', (data) => {
                const err = data.toString().trim();
                if (err) console.error(`[${manifest.name}] ERROR: ${err}`);
            });

            child.on('error', (err) => {
                console.error(`[LifecycleManager] Failed to start ${manifest.name}: ${err.message}`);
            });

        } catch (e) {
            console.error(`[LifecycleManager] Spawn Exception for ${manifest.name}:`, e);
        }
    }

    killAll() {
        this.processes.forEach(p => p.process.kill());
        this.processes = [];
    }
}

module.exports = { LifecycleManager };
