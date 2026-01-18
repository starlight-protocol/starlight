
/**
 * Phase 1: ConfigLoader
 * Handles robust configuration parsing and merging.
 * Eliminates "Prop Drilling" bugs by flattening config for specific adapters.
 */
class ConfigLoader {
    constructor(config) {
        this.config = config || {};
    }

    /**
     * Returns the fully resolved configuration for the Browser Adapter.
     * Merges 'hub.browser' with root-level hub settings like 'allowStandby'.
     * @returns {object}
     */
    getBrowserConfig() {
        // 1. Get Base Configs
        const hubConfig = this.config.hub || {};
        const browserConfig = hubConfig.browser || {};

        // 2. Resolve Critical Flags (with Defaults)
        // If allowStandby is undefined, default to true (unless explicitly false)
        const allowStandby = hubConfig.allowStandby !== false;

        // 3. Resolve Engine
        const engine = browserConfig.engine || this.config.engine || 'playwright';

        // 4. Merge and Return (Flattened)
        return {
            ...browserConfig,
            allowStandby, // Explicitly injected from parent
            engine,
            // Ensure other root flags are passed if needed
            headless: browserConfig.headless !== false
        };
    }

    /**
     * Get validated Sentinel configuration for LifecycleManager.
     */
    getSentinelsConfig() {
        const hubConfig = this.config.hub || {};
        return hubConfig.sentinels || [];
    }

    /**
     * Get Reporting configuration.
     */
    getReportingConfig() {
        const hubConfig = this.config.hub || {};
        return hubConfig.reporting || {
            enabled: true,
            screenshots: true,
            roi: true
        };
    }
}

module.exports = { ConfigLoader };
