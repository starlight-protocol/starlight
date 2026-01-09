# Changelog

All notable changes to the Starlight Protocol.

## [1.4.0] - 2026-01-09

### 📱 Phase 14.2: Mobile Device Emulation

**New Feature: Mobile Device & Network Emulation**
- **Device Profiles**: Emulate iPhone, Pixel, Galaxy, iPad devices from Mission Control
- **Network Throttling**: 4G, 3G, Slow 3G, Offline network conditions (Chromium only)
- **ResponsiveSentinel**: New Sentinel for mobile viewport-aware obstacle detection
- **Config Schema**: `hub.browser.mobile` and `hub.network.emulation` settings

**Mission Control Updates:**
- Device selector dropdown (iPhone 14, Pixel 7, iPad Pro, etc.)
- Network condition dropdown (Online, 4G, 3G, Offline)
- Settings saved to config.json automatically

**Browser Capabilities:**
| Feature | Chromium | Firefox | WebKit |
|---------|----------|---------|--------|
| Device Emulation | ✅ Full | ⚠️ Limited | ✅ Full |
| Network Throttling | ✅ CDP | ❌ None | ❌ None |
| Touch Events | ✅ Full | ⚠️ Limited | ✅ Full |

## [1.3.0] - 2026-01-08

### 🌐 Phase 14.1: Multi-Browser Foundation

**New Feature: Cross-Browser Support**
- **Browser Adapter Pattern**: New `BrowserAdapter` architecture supporting Chromium, Firefox, and WebKit
- **Mission Control Integration**: Browser selector dropdown in Hub card for one-click browser switching
- **Zero Protocol Changes**: Sentinels remain 100% browser-agnostic (no breaking changes)

**Performance Benchmarks:**
- Chromium: ~715ms startup
- Firefox: ~1099ms startup
- WebKit: ~545ms startup

**Configuration:**
```json
{
  "hub": {
    "browser": {
      "engine": "chromium"  // or "firefox" or "webkit"
    }
  }
}
```

**Browser Capabilities:**
| Browser | Shadow DOM Piercing | CDP Access | Device Emulation |
|---------|---------------------|------------|------------------|
| Chromium | ✅ Full | ✅ Full | ✅ Full |
| Firefox | ⚠️ Limited | ❌ None | ⚠️ Limited |
| WebKit | ⚠️ Limited | ❌ None | ✅ Full (iOS) |

### 🐛 Bug Fixes
- Fixed deprecated `datetime.utcnow()` in A11ySentinel (Python 3.12+ compatible)

## [1.2.2] - 2026-01-07

### ⚡ Protocol Robustness
- **Strict Compliance**: Fixed Hub `broadcastToClients` to strictly adhere to JSON-RPC 2.0 (using `method` instead of `type`).
- **SDK Update**: Updated `IntentRunner` (JS SDK) to support strict JSON-RPC structure while maintaining backward compatibility.

### 🛡️ Sentinel Intelligence (Janitor)
- **Zero False Positives**: Implemented Intelligent Filter for `starlight.pre_check`. Now ignores non-blocking elements (Inputs, Selects) even if they have generic IDs like `#newsletter`.
- **Smart Remediation**: Refined Size Heuristics to exempt known obstacles (e.g., CAPTCHAs) from size checks, ensuring critical blockers are never ignored.
- **Null Safety**: Patched a critical crash where `inputType: null` from Hub metadata caused Sentinel failure.

### ✅ Certification
- **TCK Certified**: Passed Official TCK Validator (6/6 Tests) for Protocol Compliance.
- **Regression Verified**: Validated Core Integration, File Uploads, and Event Signaling.

## [1.2.1] - 2026-01-04
- Added `starlight.pre_check` metadata (tagName, inputType) to support Intelligent Filtering.
