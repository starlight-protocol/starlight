const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('[Runner] Starting DomWalker Benchmark Runner...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Prepare Paths
    const walkerPath = path.resolve(__dirname, '../../src/hub/analysis/DomWalker.js');
    const benchmarkPath = path.resolve(__dirname, './DomWalker.benchmark.js');

    // 2. Load Content
    await page.setContent('<html><body><h1>Starlight Performance Lab</h1></body></html>');

    // 3. Inject DomWalker as a module string (or via exposeFunction)
    // For simplicity, we'll inject the code directly
    const walkerCode = fs.readFileSync(walkerPath, 'utf8')
        .replace('module.exports = { DomWalker };', 'window.DomWalker = DomWalker;');

    await page.evaluate(walkerCode);

    // 4. Run Benchmark
    const benchmarkCode = fs.readFileSync(benchmarkPath, 'utf8');
    await page.evaluate(benchmarkCode);

    console.log('[Runner] Executing benchmark in browser...');
    const result = await page.evaluate(async () => {
        // Mock the import for the benchmark
        window.__starlight_walker_path = 'data:text/javascript;base64,' + btoa('export const DomWalker = window.DomWalker;');
        return await window.runDomWalkerBenchmark();
    });

    console.log('================================================');
    console.log(`DomWalker (O(N)): ${result.count} nodes in ${result.duration.toFixed(2)}ms`);
    console.log(`Legacy (O(N^2)): ${result.count} nodes in ${result.lDuration.toFixed(2)}ms`);
    console.log(`Speedup: ${(result.lDuration / result.duration).toFixed(2)}x`);
    console.log(`Status: ${result.success ? 'PASS' : 'FAIL'}`);
    console.log('================================================');

    await browser.close();

    if (!result.success) process.exit(1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
