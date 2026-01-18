
const { describe, it } = require('node:test');
const assert = require('node:assert');
// We will implement this class next
const { ConfigLoader } = require('../../../../src/hub/config/ConfigLoader');

describe('ConfigLoader (Phase 1 Fix)', () => {
    it('should flatten nested hub config for Browser Adapter', () => {
        const rawConfig = {
            hub: {
                allowStandby: true, // This was being lost
                browser: {
                    headless: true
                }
            }
        };

        const loader = new ConfigLoader(rawConfig);
        const browserConfig = loader.getBrowserConfig();

        // The bug was that browserConfig only had { headless: true }
        // We assert it MERGES the parent params
        assert.strictEqual(browserConfig.allowStandby, true, 'allowStandby should be passed to adapter');
        assert.strictEqual(browserConfig.headless, true, 'headless should be passed');
    });

    it('should apply Safe Defaults when config is missing', () => {
        const loader = new ConfigLoader({}); // Empty config
        const browserConfig = loader.getBrowserConfig();

        assert.strictEqual(browserConfig.allowStandby, true, 'Default AllowStandby should be true');
        assert.strictEqual(browserConfig.engine, 'playwright', 'Default Engine should be playwright');
    });
});
