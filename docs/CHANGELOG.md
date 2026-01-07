# Changelog

All notable changes to the Starlight Protocol.

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
