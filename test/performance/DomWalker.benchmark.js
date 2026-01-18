/**
 * DomWalker Performance Benchmark (v4.0)
 * =====================================
 * This script runs in the browser and measures the time taken to traverse 
 * a simulated complex DOM (10,000 nodes) with Shadow DOM nesting.
 */

async function runBenchmark() {
    console.log('[DomWalker Benchmark] Initializing heavy DOM (10k nodes)...');

    const container = document.createElement('div');
    container.id = 'benchmark-container';
    document.body.appendChild(container);

    // Create 100 components, each with 5 levels of shadow nesting
    // querySelectorAll('*') cannot see inside these natively.
    function buildShadowTree(root, depth) {
        if (depth === 0) return;
        const host = document.createElement('div');
        root.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const inner = document.createElement('span');
        inner.textContent = 'leaf';
        shadow.appendChild(inner);
        buildShadowTree(shadow, depth - 1);
    }

    for (let i = 0; i < 50; i++) buildShadowTree(container, 20); // 1000 nodes, 1000 shadow roots

    const start = performance.now();
    let count = 0;

    // The Algorithm under test
    const { DomWalker } = await import(window.__starlight_walker_path);

    DomWalker.walk(container, (node) => {
        count++;
    });

    const end = performance.now();
    const duration = end - start;

    // Legacy Comparison (Truly Legacy: No Shadow Knowledge)
    function legacyWalk(root, callback) {
        const nodes = root.querySelectorAll('*');
        for (const node of nodes) {
            callback(node);
        }
    }

    const lStart = performance.now();
    let lCount = 0;
    legacyWalk(container, (n) => lCount++);
    const lEnd = performance.now();
    const lDuration = lEnd - lStart;

    console.log(`[DomWalker Benchmark] Discoveries: ${count}`);
    console.log(`[Legacy Benchmark] Discoveries: ${lCount}`);

    // Debug: What is legacy finding?
    const legacyNodes = container.querySelectorAll('*');
    for (let i = 0; i < Math.min(5, legacyNodes.length); i++) {
        console.log(`[Debug] Legacy Node ${i}: ${legacyNodes[i].tagName} (Host? ${!!legacyNodes[i].shadowRoot})`);
    }

    // Rigor: Success IF DomWalker finds more nodes than legacy (due to shadow) 
    // AND performance is reasonable (sub-20ms for complex tree).
    const success = count > lCount && duration < 20;
    return { count, lCount, duration, lDuration, success };
}

window.runDomWalkerBenchmark = runBenchmark;
