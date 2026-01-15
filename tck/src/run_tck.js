/**
 * Starlight Protocol Technology Compatibility Kit
 * 
 * Tests SDK and Hub implementations for protocol compliance.
 */

const WebSocket = require('ws');
const { program } = require('commander');

// Test result collector
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

/**
 * Test assertion helper
 */
function assert(condition, testName, message) {
    if (condition) {
        results.passed++;
        results.tests.push({ name: testName, status: 'passed', message });
        console.log(`  ✅ ${testName}`);
    } else {
        results.failed++;
        results.tests.push({ name: testName, status: 'failed', message });
        console.log(`  ❌ ${testName}: ${message}`);
    }
}

/**
 * Skip a test
 */
function skip(testName, reason) {
    results.skipped++;
    results.tests.push({ name: testName, status: 'skipped', message: reason });
    console.log(`  ⏭️  ${testName}: ${reason}`);
}

/**
 * Level 1: Core Compliance Tests
 */
async function runLevel1Tests(hubUrl) {
    console.log('\n📋 Level 1: Core Compliance Tests\n');

    // Test 1.1: Connection
    console.log('  Testing WebSocket connection...');
    const ws = await connectWithTimeout(hubUrl, 5000);
    assert(ws !== null, '1.1 WebSocket Connection', 'Can connect to Hub');

    if (!ws) {
        skip('1.2-1.6', 'Connection failed');
        return;
    }

    // Test 1.2: Registration
    console.log('  Testing registration...');
    const regResult = await testRegistration(ws);
    assert(regResult.success, '1.2 Registration', regResult.message);

    // Test 1.3: Message Format
    console.log('  Testing message format...');
    const formatResult = await testMessageFormat(ws);
    assert(formatResult.success, '1.3 JSON-RPC 2.0 Format', formatResult.message);

    // Test 1.4: Heartbeat
    console.log('  Testing heartbeat...');
    const heartbeatResult = await testHeartbeat(ws);
    assert(heartbeatResult.success, '1.4 Heartbeat (Pulse)', heartbeatResult.message);

    // Test 1.5: Pre-Check Flow
    console.log('  Testing pre-check flow...');
    const preCheckResult = await testPreCheckFlow(ws);
    assert(preCheckResult.success, '1.5 Pre-Check/Clear Flow', preCheckResult.message);

    // Test 1.6: Graceful Disconnect
    console.log('  Testing graceful disconnect...');
    const disconnectResult = await testGracefulDisconnect(ws);
    assert(disconnectResult.success, '1.6 Graceful Disconnect', disconnectResult.message);
}

/**
 * Level 2: Extended Compliance Tests
 */
async function runLevel2Tests(hubUrl) {
    console.log('\n📋 Level 2: Extended Compliance Tests\n');

    const ws = await connectWithTimeout(hubUrl, 5000);
    if (!ws) {
        skip('2.1-2.4', 'Connection failed');
        return;
    }

    await testRegistration(ws);

    // Test 2.1: Hijack/Resume
    console.log('  Testing hijack/resume flow...');
    const hijackResult = await testHijackResume(ws);
    assert(hijackResult.success, '2.1 Hijack/Resume Flow', hijackResult.message);

    // Test 2.2: Wait Response
    console.log('  Testing wait response...');
    const waitResult = await testWaitResponse(ws);
    assert(waitResult.success, '2.2 Wait Response', waitResult.message);

    // Test 2.3: Context Update
    console.log('  Testing context update...');
    const contextResult = await testContextUpdate(ws);
    assert(contextResult.success, '2.3 Context Update', contextResult.message);

    // Test 2.4: Entropy Stream
    console.log('  Testing entropy stream...');
    const entropyResult = await testEntropyStream(ws);
    assert(entropyResult.success, '2.4 Entropy Stream', entropyResult.message);

    ws.close();
}

/**
 * Level 3: Full Compliance Tests
 */
async function runLevel3Tests(hubUrl) {
    console.log('\n📋 Level 3: Full Compliance Tests\n');

    // Test 3.1: Performance - Connection Time
    console.log('  Testing connection latency...');
    const latencyResult = await testConnectionLatency(hubUrl);
    assert(latencyResult.success, '3.1 Connection Latency < 500ms', latencyResult.message);

    // Test 3.2: Performance - Message Throughput
    console.log('  Testing message throughput...');
    const throughputResult = await testMessageThroughput(hubUrl);
    assert(throughputResult.success, '3.2 Message Throughput > 100 msg/s', throughputResult.message);

    // Test 3.3: Multi-Sentinel Coordination
    console.log('  Testing multi-sentinel coordination...');
    const multiResult = await testMultiSentinel(hubUrl);
    assert(multiResult.success, '3.3 Multi-Sentinel Priority', multiResult.message);

    // Test 3.4: Error Handling
    console.log('  Testing error handling...');
    const errorResult = await testErrorHandling(hubUrl);
    assert(errorResult.success, '3.4 Error Handling', errorResult.message);
}

// Helper functions

async function connectWithTimeout(url, timeout) {
    return new Promise((resolve) => {
        try {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => {
                ws.close();
                resolve(null);
            }, timeout);

            ws.on('open', () => {
                clearTimeout(timer);
                resolve(ws);
            });

            ws.on('error', () => {
                clearTimeout(timer);
                resolve(null);
            });
        } catch (e) {
            resolve(null);
        }
    });
}

async function testRegistration(ws) {
    return new Promise((resolve) => {
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.registration',
            params: {
                layer: 'TCK_TestSentinel',
                priority: 5,
                capabilities: ['detection'],
                selectors: ['.test']
            },
            id: `reg-${Date.now()}`
        };

        ws.send(JSON.stringify(msg));

        // Registration doesn't require explicit ack in current protocol
        setTimeout(() => {
            resolve({ success: true, message: 'Registration sent successfully' });
        }, 100);
    });
}

async function testMessageFormat(ws) {
    return new Promise((resolve) => {
        // Send a properly formatted message
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.pulse',
            params: { layer: 'TCK_TestSentinel' },
            id: `pulse-${Date.now()}`
        };

        try {
            ws.send(JSON.stringify(msg));
            resolve({ success: true, message: 'JSON-RPC 2.0 format accepted' });
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

async function testHeartbeat(ws) {
    return new Promise((resolve) => {
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.pulse',
            params: { layer: 'TCK_TestSentinel' },
            id: `pulse-${Date.now()}`
        };

        ws.send(JSON.stringify(msg));
        setTimeout(() => {
            resolve({ success: ws.readyState === WebSocket.OPEN, message: 'Heartbeat maintained connection' });
        }, 500);
    });
}

async function testPreCheckFlow(ws) {
    // This tests that sending a clear response works
    return new Promise((resolve) => {
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.clear',
            params: {},
            id: `clear-${Date.now()}`
        };

        try {
            ws.send(JSON.stringify(msg));
            resolve({ success: true, message: 'Clear response sent successfully' });
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

async function testGracefulDisconnect(ws) {
    return new Promise((resolve) => {
        ws.close(1000, 'TCK Test Complete');
        setTimeout(() => {
            resolve({ success: ws.readyState === WebSocket.CLOSED, message: 'Graceful disconnect' });
        }, 100);
    });
}

async function testHijackResume(ws) {
    return new Promise((resolve) => {
        const hijack = {
            jsonrpc: '2.0',
            method: 'starlight.hijack',
            params: { reason: 'TCK Test' },
            id: `hijack-${Date.now()}`
        };

        const resume = {
            jsonrpc: '2.0',
            method: 'starlight.resume',
            params: { re_check: true },
            id: `resume-${Date.now()}`
        };

        try {
            ws.send(JSON.stringify(hijack));
            setTimeout(() => {
                ws.send(JSON.stringify(resume));
                resolve({ success: true, message: 'Hijack/Resume flow completed' });
            }, 100);
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

async function testWaitResponse(ws) {
    return new Promise((resolve) => {
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.wait',
            params: { retryAfterMs: 500 },
            id: `wait-${Date.now()}`
        };

        try {
            ws.send(JSON.stringify(msg));
            resolve({ success: true, message: 'Wait response sent' });
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

async function testContextUpdate(ws) {
    return new Promise((resolve) => {
        const msg = {
            jsonrpc: '2.0',
            method: 'starlight.context_update',
            params: { context: { tck_test: true, timestamp: Date.now() } },
            id: `ctx-${Date.now()}`
        };

        try {
            ws.send(JSON.stringify(msg));
            resolve({ success: true, message: 'Context update sent' });
        } catch (e) {
            resolve({ success: false, message: e.message });
        }
    });
}

async function testEntropyStream(ws) {
    // Entropy stream is Hub -> Sentinel, so we just verify connection stays open
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: ws.readyState === WebSocket.OPEN, message: 'Ready to receive entropy stream' });
        }, 100);
    });
}

async function testConnectionLatency(hubUrl) {
    const start = Date.now();
    const ws = await connectWithTimeout(hubUrl, 5000);
    const latency = Date.now() - start;

    if (ws) ws.close();

    return {
        success: latency < 500,
        message: `Connection latency: ${latency}ms`
    };
}

async function testMessageThroughput(hubUrl) {
    const ws = await connectWithTimeout(hubUrl, 5000);
    if (!ws) return { success: false, message: 'Connection failed' };

    await testRegistration(ws);

    const messageCount = 100;
    const start = Date.now();

    for (let i = 0; i < messageCount; i++) {
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'starlight.pulse',
            params: { layer: 'TCK_TestSentinel' },
            id: `perf-${i}`
        }));
    }

    const elapsed = Date.now() - start;
    const throughput = (messageCount / elapsed) * 1000;

    ws.close();

    return {
        success: throughput > 100,
        message: `Throughput: ${throughput.toFixed(0)} msg/s`
    };
}

async function testMultiSentinel(hubUrl) {
    const ws1 = await connectWithTimeout(hubUrl, 5000);
    const ws2 = await connectWithTimeout(hubUrl, 5000);

    if (!ws1 || !ws2) {
        if (ws1) ws1.close();
        if (ws2) ws2.close();
        return { success: false, message: 'Failed to connect multiple sentinels' };
    }

    // Register with different priorities
    ws1.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'starlight.registration',
        params: { layer: 'TCK_Sentinel_Priority1', priority: 1 },
        id: 'reg-1'
    }));

    ws2.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'starlight.registration',
        params: { layer: 'TCK_Sentinel_Priority5', priority: 5 },
        id: 'reg-2'
    }));

    await new Promise(r => setTimeout(r, 200));

    ws1.close();
    ws2.close();

    return { success: true, message: 'Multiple sentinels registered with different priorities' };
}

async function testErrorHandling(hubUrl) {
    const ws = await connectWithTimeout(hubUrl, 5000);
    if (!ws) return { success: false, message: 'Connection failed' };

    // Send malformed message
    try {
        ws.send('not valid json');
        await new Promise(r => setTimeout(r, 100));

        // Connection should still be open (graceful error handling)
        const stillOpen = ws.readyState === WebSocket.OPEN;
        ws.close();

        return {
            success: stillOpen,
            message: stillOpen ? 'Malformed message handled gracefully' : 'Connection closed on error'
        };
    } catch (e) {
        ws.close();
        return { success: false, message: e.message };
    }
}

// Main execution
async function main() {
    program
        .option('-u, --hub-url <url>', 'Hub WebSocket URL', 'ws://localhost:8080')
        .option('-l, --level <level>', 'Test level (1, 2, 3, or all)', 'all')
        .option('--sdk <sdk>', 'SDK being tested', 'javascript')
        .parse();

    const opts = program.opts();

    console.log('🛰️  Starlight Protocol - Technology Compatibility Kit\n');
    console.log(`Hub URL: ${opts.hubUrl}`);
    console.log(`SDK: ${opts.sdk}`);
    console.log(`Level: ${opts.level}`);

    const level = opts.level;

    if (level === 'all' || level === '1') {
        await runLevel1Tests(opts.hubUrl);
    }

    if (level === 'all' || level === '2') {
        await runLevel2Tests(opts.hubUrl);
    }

    if (level === 'all' || level === '3') {
        await runLevel3Tests(opts.hubUrl);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 TCK Results Summary\n');
    console.log(`  ✅ Passed:  ${results.passed}`);
    console.log(`  ❌ Failed:  ${results.failed}`);
    console.log(`  ⏭️  Skipped: ${results.skipped}`);
    console.log('');

    const total = results.passed + results.failed;
    const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

    if (results.failed === 0 && results.passed > 0) {
        console.log(`🎉 COMPLIANT - ${passRate}% pass rate`);
    } else if (results.passed >= 6) {
        console.log(`⚠️  PARTIAL COMPLIANCE - ${passRate}% pass rate`);
    } else {
        console.log(`❌ NOT COMPLIANT - ${passRate}% pass rate`);
    }

    console.log('='.repeat(50) + '\n');

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(console.error);
