/**
 * Starlight Protocol v4.0 - Entry Point
 * =====================================
 * This file replaces the monolithic hub_main.js logic with the 
 * refined HubServer orchestrator.
 */

const { HubServer } = require('./hub/core/HubServer');

async function main() {
    const args = process.argv.slice(2);
    const portArg = args.find(a => a.startsWith('--port='));
    const port = portArg ? parseInt(portArg.split('=')[1]) : 8095;
    const headless = args.includes('--headless');

    const hub = new HubServer({ port, headless });

    process.on('SIGINT', () => hub.shutdown());
    process.on('SIGTERM', () => hub.shutdown());

    await hub.start();
}

main().catch(err => {
    console.error('[Starlight] Fatal startup error:', err);
    process.exit(1);
});
