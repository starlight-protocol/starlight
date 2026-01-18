/**
 * launch_sentinels.js - Starlight Constellation Orchestrator
 * =========================================================
 * Launches all 8 available sentinels to provide maximum autonomous 
 * coverage for missions.
 */

const { spawn } = require('child_process');
const path = require('path');

const HUB_URL = "ws://127.0.0.1:8095";
const SENTINELS_DIR = path.join(__dirname, '..', 'sentinels');

const SENTINELS = [
    { name: 'Pulse', script: 'pulse_sentinel.py' },
    { name: 'Janitor', script: 'janitor.py' },
    { name: 'Vision', script: 'vision_sentinel.py' },
    { name: 'Data', script: 'data_sentinel.py' },
    { name: 'PII', script: 'pii_sentinel.py' },
    { name: 'Stealth', script: 'stealth_sentinel.py' },
    { name: 'A11y', script: 'a11y_sentinel.py' },
    { name: 'Responsive', script: 'responsive_sentinel.py' }
];

const processes = [];

console.log(`[Orchestrator] Launching fleet of ${SENTINELS.length} sentinels...`);

(async () => {
    for (const s of SENTINELS) {
        const fullPath = path.join(SENTINELS_DIR, s.script);
        console.log(`[Orchestrator] Starting ${s.name} (${s.script})...`);

        // Launch each sentinel as a background process
        // FIX: Removed 'shell: true' to resolve [DEP0190] security warning
        const proc = spawn('python', [fullPath, '--hub_url', HUB_URL], {
            stdio: 'inherit', // Let them log to console
            shell: false
        });

        proc.on('error', (err) => {
            console.error(`[Orchestrator] FAILED to launch ${s.name}:`, err.message);
        });

        processes.push(proc);

        // Wait 2s between launches to allow handshake completion
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log("[Orchestrator] All sentinels launched. Keep this window open.");
})();

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log("\n[Orchestrator] Shutting down constellation...");
    processes.forEach(p => p.kill());
    process.exit();
});

// Avoid immediate exit
setInterval(() => { }, 1000);
