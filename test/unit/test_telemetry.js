/**
 * Telemetry Unit Tests (Structural Verification)
 * Phase 16.1: Zero-Defect Line Coverage
 */

const fs = require('fs');
const path = require('path');
const TelemetryEngine = require('../../src/telemetry');

class TestTelemetryStructural {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
        // Use a unique file for this test run
        this.testFilePath = path.join(process.cwd(), 'test/unit/temp_telemetry_' + Date.now() + '.json');
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        TELEMETRY STRUCTURAL TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        try {
            await this.testInitialization();
            await this.testMissionRecording();
            await this.testStatsCalculation();
            await this.testErrorHandling();
            await this.testHistoryRolling();
            await this.testMTTRCalculation();
        } finally {
            // Cleanup temp file
            if (fs.existsSync(this.testFilePath)) {
                try { fs.unlinkSync(this.testFilePath); } catch (e) { }
            }
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log(`  RESULTS: ${this.passedTests} passed, ${this.failedTests} failed`);
        console.log('═══════════════════════════════════════════════════════\n');

        return this.failedTests === 0;
    }

    assert(condition, testName) {
        if (condition) {
            console.log(`  ✓ ${testName}`);
            this.passedTests++;
        } else {
            console.log(`  ✗ ${testName}`);
            this.failedTests++;
        }
    }

    async testInitialization() {
        console.log('Test: Initialization\n');

        const telemetry = new TelemetryEngine(this.testFilePath);
        this.assert(telemetry.data !== undefined, 'Data object initialized');
        this.assert(telemetry.data.totalMissions === 0, 'Starts with zero missions');
    }

    async testMissionRecording() {
        console.log('\nTest: Mission Recording\n');

        const telemetry = new TelemetryEngine(this.testFilePath);

        telemetry.recordMission(true, 30, 1, [500]);
        this.assert(telemetry.data.totalMissions === 1, 'Increments total missions');
        this.assert(telemetry.data.successfulMissions === 1, 'Increments success count');
        this.assert(telemetry.data.totalSavedSeconds === 30, 'Accumulates saved seconds');
    }

    async testStatsCalculation() {
        console.log('\nTest: Stats Calculation\n');

        // Use a fresh engine instance pointing to the same file
        const telemetry = new TelemetryEngine(this.testFilePath);
        // Refresh to be sure
        telemetry.refresh();

        // Record 2 more missions (total 3)
        telemetry.recordMission(true, 60, 0); // success
        telemetry.recordMission(false, 0, 1); // failure

        const stats = telemetry.getStats();
        // 1 success from previous test + 1 success here = 2 successes
        // 1 failure here = 1 failure
        // Total = 3
        this.assert(stats.totalMissions === 3, `Stats has total count (expected 3, got ${stats.totalMissions})`);

        // 2/3 = 66.7%
        this.assert(stats.successRate === 66.7, `Calculates correct success rate (expected 66.7, got ${stats.successRate})`);
    }

    async testErrorHandling() {
        console.log('\nTest: Error Handling\n');

        // 1. Malformed JSON refresh
        fs.writeFileSync(this.testFilePath, 'INVALID_JSON');
        const telemetry = new TelemetryEngine(this.testFilePath);
        // refresh is called in constructor
        this.assert(telemetry.data.totalMissions === 0, 'Falls back to defaults on malformed JSON');

        // 2. Refresh non-existent file (already default, but hit the branch)
        if (fs.existsSync(this.testFilePath)) fs.unlinkSync(this.testFilePath);
        telemetry.refresh();
        this.assert(telemetry.data.totalMissions === 0, 'Falls back to defaults on missing file');

        // 3. Save error (simulate by using directory name as file path if possible, or just mock fs)
        // Creating a directory with same name to cause writeFileSync error
        const dirPath = this.testFilePath + '_dir';
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
        const badTelemetry = new TelemetryEngine(dirPath);
        badTelemetry.save(); // Should log error and not crash
        this.assert(true, 'Save failure handled gracefully');
        fs.rmdirSync(dirPath);
    }

    async testHistoryRolling() {
        console.log('\nTest: History Rolling\n');
        const telemetry = new TelemetryEngine(this.testFilePath);
        // Fill history (max 10)
        for (let i = 0; i < 12; i++) {
            telemetry.recordMission(true, 10);
        }
        this.assert(telemetry.data.missionHistory.length === 10, 'History shifts correctly (max 10)');
    }

    async testMTTRCalculation() {
        console.log('\nTest: MTTR Moving Average\n');
        const telemetry = new TelemetryEngine(this.testFilePath);
        // First mission sets baseline
        telemetry.recordMission(true, 10, 1, [1000]); // MTTR = 1000
        this.assert(telemetry.data.avgRecoveryTimeMs === 1000, 'Sets baseline MTTR');

        // Second mission calculates moving average (0.7 * 1000 + 0.3 * 2000 = 700 + 600 = 1300)
        telemetry.recordMission(true, 10, 1, [2000]);
        this.assert(telemetry.data.avgRecoveryTimeMs === 1300, 'Calculates moving MTTR');
    }
}

// Run tests if executed directly
if (require.main === module) {
    const tester = new TestTelemetryStructural();
    tester.runTests().then(passed => {
        process.exit(passed ? 0 : 1);
    });
}
module.exports = TestTelemetryStructural;
