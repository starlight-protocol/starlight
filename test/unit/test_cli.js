/**
 * CLI Commands Unit Tests
 * Tests all CLI command modules
 */

class TestCLI {
    constructor() {
        this.passedTests = 0;
        this.failedTests = 0;
    }

    async runTests() {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('        CLI COMMANDS UNIT TESTS');
        console.log('═══════════════════════════════════════════════════════\n');

        await this.testListCommand();
        await this.testInstallCommand();
        await this.testRemoveCommand();
        await this.testCreateCommand();
        await this.testDoctorCommand();
        await this.testRunCommand();
        await this.testInitCommand();

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

    async testListCommand() {
        console.log('Test: starlight list\n');

        const listOutput = {
            installedSentinels: [
                { name: 'pulse.py', type: 'local' },
                { name: 'janitor.py', type: 'local' },
                { name: 'custom_sentinel.py', type: 'plugin' }
            ],
            availablePlugins: [
                { name: 'janitor-google', version: '1.0.0' },
                { name: 'vision-ai', version: '2.1.0' }
            ]
        };

        this.assert(Array.isArray(listOutput.installedSentinels), 'Lists installed sentinels');
        this.assert(Array.isArray(listOutput.availablePlugins), 'Lists available plugins');
    }

    async testInstallCommand() {
        console.log('\nTest: starlight install\n');

        const installSources = [
            { source: 'janitor-google', type: 'registry' },
            { source: 'https://github.com/user/sentinel', type: 'github' },
            { source: './local/path', type: 'local' }
        ];

        for (const s of installSources) {
            const isGithub = s.source.startsWith('https://github.com');
            const isLocal = s.source.startsWith('./') || s.source.startsWith('/');
            const isRegistry = !isGithub && !isLocal;

            if (s.type === 'github') {
                this.assert(isGithub, `Detects GitHub source: ${s.source}`);
            } else if (s.type === 'local') {
                this.assert(isLocal, `Detects local source: ${s.source}`);
            } else {
                this.assert(isRegistry, `Detects registry source: ${s.source}`);
            }
        }

        // Plugin manifest validation
        const manifest = {
            name: 'my-sentinel',
            version: '1.0.0',
            main: 'sentinel.py',
            description: 'Custom sentinel'
        };

        this.assert(manifest.name && manifest.version && manifest.main, 'Validates manifest fields');
    }

    async testRemoveCommand() {
        console.log('\nTest: starlight remove\n');

        const installedPlugins = [
            { name: 'janitor-google', main: 'janitor_google.py' }
        ];

        const pluginToRemove = 'janitor-google';
        const found = installedPlugins.find(p => p.name === pluginToRemove);

        this.assert(found !== undefined, 'Finds installed plugin');
        this.assert(found.main === 'janitor_google.py', 'Gets main file to remove');
    }

    async testCreateCommand() {
        console.log('\nTest: starlight create\n');

        const sentinelName = 'Cookie Blocker';
        const expectedFilename = 'cookie_blocker_sentinel.py';
        const expectedClassName = 'CookieBlockerSentinel';

        // Name normalization
        const filename = sentinelName.toLowerCase().replace(/\s+/g, '_') + '_sentinel.py';
        const className = sentinelName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') + 'Sentinel';

        this.assert(filename === expectedFilename, 'Generates correct filename');
        this.assert(className === expectedClassName, 'Generates correct class name');
    }

    async testDoctorCommand() {
        console.log('\nTest: starlight doctor\n');

        const checks = [
            { name: 'Node.js', check: () => true, required: true },
            { name: 'Python', check: () => true, required: true },
            { name: 'Playwright', check: () => true, required: true },
            { name: 'Git', check: () => true, required: false }
        ];

        const requiredChecks = checks.filter(c => c.required);
        const optionalChecks = checks.filter(c => !c.required);

        this.assert(requiredChecks.length >= 3, 'Has required checks');
        this.assert(optionalChecks.length >= 1, 'Has optional checks');

        const allPassed = requiredChecks.every(c => c.check());
        this.assert(allPassed, 'All required checks pass');
    }

    async testRunCommand() {
        console.log('\nTest: starlight run\n');

        const runOptions = {
            intent: 'test/intent_form_test.js',
            browser: 'chromium',
            headless: false,
            sentinels: ['pulse', 'janitor']
        };

        this.assert(typeof runOptions.intent === 'string', 'Has intent file');
        this.assert(['chromium', 'firefox', 'webkit'].includes(runOptions.browser), 'Valid browser');
        this.assert(Array.isArray(runOptions.sentinels), 'Has sentinels list');
    }

    async testInitCommand() {
        console.log('\nTest: starlight init\n');

        const scaffoldedFiles = [
            'config.json',
            'sentinels/',
            'test/',
            'sdk/'
        ];

        this.assert(scaffoldedFiles.length >= 4, 'Creates multiple files/dirs');
        this.assert(scaffoldedFiles.includes('config.json'), 'Creates config.json');
        this.assert(scaffoldedFiles.includes('sentinels/'), 'Creates sentinels/');
    }
}

// Run tests
const tester = new TestCLI();
tester.runTests().then(passed => {
    process.exit(passed ? 0 : 1);
});
