const test = require('node:test');
const assert = require('node:assert');
const { ConfigLoader } = require('../../../../src/hub/config/ConfigLoader');

test('ConfigLoader: Rigor & Prop-Drilling Prevention', async (t) => {
    const rawConfig = {
        hub: {
            browser: {
                engine: 'stealth',
                headless: false
            },
            allowStandby: false,
            sentinels: [{ name: 'Test' }]
        }
    };

    const loader = new ConfigLoader(rawConfig);

    await t.test('Should flatten browser config and inject root flags', () => {
        const browser = loader.getBrowserConfig();
        assert.strictEqual(browser.engine, 'stealth');
        assert.strictEqual(browser.allowStandby, false); // Injected from hub root
        assert.strictEqual(browser.headless, false);
    });

    await t.test('Should provide defaults for missing reporting config', () => {
        const reporting = loader.getReportingConfig();
        assert.strictEqual(reporting.enabled, true);
        assert.strictEqual(reporting.screenshots, true);
    });
});
