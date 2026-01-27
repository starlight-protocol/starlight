// test/stress_shutdown.js
const { spawn } = require('child_process');
const path = require('path');

async function runCycle(cycle) {
    console.log(`\n--- CYCLE ${cycle} START ---`);

    // 1. Start Hub
    console.log(`[Cycle ${cycle}] Launching Hub...`);
    const hub = spawn('node', ['src/hub.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_NO_WARNINGS: '1' }
    });

    let isReady = false;
    const readyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Hub startup timeout')), 15000);
        hub.stdout.on('data', (d) => {
            if (d.toString().includes('Starlight Protocol READY')) {
                isReady = true;
                clearTimeout(timeout);
                resolve();
            }
        });
        hub.on('exit', (code) => {
            if (!isReady) reject(new Error(`Hub exited prematurely with code ${code}`));
        });
    });

    try {
        await readyPromise;
        console.log(`[Cycle ${cycle}] Hub is READY.`);

        // Wait a bit to ensure everything is stable
        await new Promise(r => setTimeout(r, 2000));

        // 2. Stop Hub
        console.log(`[Cycle ${cycle}] Initiating SIGINT...`);
        hub.kill('SIGINT');

        await new Promise((resolve) => {
            hub.on('exit', () => {
                console.log(`[Cycle ${cycle}] Hub exited successfully.`);
                resolve();
            });
        });

        // 3. Grace period for port cleanup (matching server.js logic)
        console.log(`[Cycle ${cycle}] Waiting for port cleanup...`);
        await new Promise(r => setTimeout(r, 2500));

        console.log(`[Cycle ${cycle}] --- CYCLE ${cycle} SUCCESS ---`);
        return true;
    } catch (e) {
        console.error(`[Cycle ${cycle}] ❌ CYCLE FAILED:`, e.message);
        hub.kill('SIGKILL');
        return false;
    }
}

async function startStressTest() {
    const totalCycles = 5;
    let successfulCycles = 0;

    for (let i = 1; i <= totalCycles; i++) {
        const success = await runCycle(i);
        if (success) successfulCycles++;
        else break;
    }

    console.log(`\n--- STRESS TEST RESULT: ${successfulCycles}/${totalCycles} cycles passed ---`);
    process.exit(successfulCycles === totalCycles ? 0 : 1);
}

startStressTest();
