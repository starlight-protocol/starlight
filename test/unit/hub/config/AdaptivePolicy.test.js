
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { AdaptivePolicy } = require('../../../../src/hub/config/AdaptivePolicy');

describe('AdaptivePolicy (Phase 4 Intelligence)', () => {

    it('should default to Playwright (Fast Mode)', () => {
        const decision = AdaptivePolicy.decide({});
        assert.strictEqual(decision.engine, 'playwright');
        assert.strictEqual(decision.reason, 'default');
    });

    it('should HOIST to Stealth when Anti-Bot detected', () => {
        const signals = {
            hasCloudflare: true,
            hasAkamai: false
        };
        const decision = AdaptivePolicy.decide(signals);
        assert.strictEqual(decision.engine, 'stealth');
        assert.strictEqual(decision.reason, 'anti-bot-detected');
    });

    it('should PREFER Playwright for Deep Shadow DOM if no bot protection (Performance)', () => {
        const signals = {
            maxShadowDepth: 5,
            hasCloudflare: false
        };
        const decision = AdaptivePolicy.decide(signals);
        assert.strictEqual(decision.engine, 'playwright');
        assert.strictEqual(decision.reason, 'shadow-dom-performance');
    });
});
