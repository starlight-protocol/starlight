
const IntentRunner = require('../src/intent_runner');

async function run() {
    const runner = new IntentRunner();
    try {
        await runner.connect();
        console.log('Connected');
        await runner.goto('about:blank');
        console.log('Goto Passed');
        await runner.checkpoint('TEST_CHECKPOINT');
        console.log('Checkpoint Passed');
        await runner.finish();
    } catch (e) {
        console.error('FAILED:', e);
        process.exit(1);
    }
}
run();
