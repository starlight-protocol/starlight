# 📜 Changelog

All notable changes to the CBA (Constellation-Based Automation) project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.4] - 2026-01-11

### 🚑 Critical Hotfixes

#### Fixed
- **Navigation Delay (Handshake Timeout)**: Fixed a critical bug where `broadcastPreCheck` called a missing method, causing a 30s timeout on every mission start. Navigation is now instantaneous.
- **Vision Sentinel Blocking**: Reduced `vision.timeout` from 25s to 3s. Prevents AI latency or outages from hanging the entire Hub.
- **WebSocket Stability**: Added comprehensive Heartbeat (Ping/Pong) system to detect and reap dead Sentinels.
- **Sentinel Priority**: Restored proper priority-based broadcasting (`broadcastToSentinels`) to ensure high-priority security sentinels run first.
- **Schema Validation**: Fixed `schema_validator.js` to properly handle optional fields and allow camelCase methods.

#### Security
- **Eval Removal**: Replaced dangerous `eval()` calls in `shadow_utils.js` with safer inline functions.
- **Selector Hardening**: Added auto-escaping for CSS selectors (`escapeCssString`) to prevent injection attacks.

---

## [3.0.5] - 2026-01-11

### 🛡️ Phase 14: Protocol Resilience & Integrity
Successfully verified the "Holy Trinity" of Starlight Protocol capabilities:

#### Added
- **Generic Semantic Perception**: `hub.js` now implements generic class-name semantic extraction. It correctly identifies icon-only elements (like "Shopping Cart") even when they contain dynamic badges (e.g., "2"), eliminating the need for hardcoded selectors.
- **Reporting Integrity**: `intent_nli_test.js` now strictly enforces `minSteps` verification. Partial execution (e.g., LLM stopping after one step) is now correctly flagged as a failure.
- **True Self-Healing**: Verified that the Hub learns selecting mappings on the fly (`click:Shopping Cart` -> `a:has-text("2")`) and persists them to `starlight_memory.json`, making subsequent runs instantaneous.

#### Fixed
- **NLI Parser**: Implemented fuzzy matching (`includes`) for context validation, allowing `fill Shopping Cart` (LLM) to be correctly auto-corrected to `click` when the Hub perceives "shopping cart link".
- **Hub Perception**: `getPageContext` aligned with `resolveSemanticIntent` to ensure consistent element discovery for the LLM.

---

## [UNRELEASED] Phase 14.3 - Enterprise Security Hardening

### 🔒 Comprehensive Security Infrastructure

#### Added
- **JWT Authentication System** (`src/auth/jwt_handler.js`)
  - Industry-standard JWT token generation and verification
  - HMAC-SHA256 signing with timing-safe comparison
  - Configurable token expiration (default: 3600s)
  - Token refresh capability for long-running sessions
  - Secure random secret generation

- **Input Validation Pipeline** (`src/validation/schema_validator.js`)
  - Comprehensive JSON schema validation for all message types
  - Method-specific validation with strict patterns
  - Field type checking, length limits, and pattern matching
  - Prevention of malformed or malicious payloads

- **PII Protection System** (`src/utils/pii_redactor.js`)
  - Automatic detection and redaction of sensitive data
  - Email addresses, phone numbers, credit cards, SSNs
  - JWT tokens and API keys
  - Recursive object sanitization
  - Compliance modes: alert, block, or redact

- **Encryption Layer** (`src/warp_sanitizer.js`)
  - AES-256-GCM encryption for sensitive data
  - Secure key generation and management
  - Optional encryption for warp files
  - Key rotation support

#### Security Documentation
- **SECURITY_GUIDE.md**: Comprehensive security architecture documentation
  - JWT authentication flow and configuration
  - Input validation pipeline details
  - PII protection and compliance features
  - Threat model and mitigation strategies
  - Incident response procedures

- **SECURITY_CONFIGURATION.md**: Complete configuration reference
  - Authentication settings (JWT, token expiration)
  - Input validation parameters
  - PII redaction configuration
  - SSL/TLS setup
  - Rate limiting settings
  - Environment-specific configurations

- **COMPLIANCE_GUIDE.md**: Regulatory compliance documentation
  - GDPR compliance (DSARs, right to erasure)
  - HIPAA compliance (PHI protection, audit logging)
  - PCI-DSS considerations (credit card redaction)
  - SOC 2 controls (TSC criteria support)

- **SECURITY_TESTING.md**: Testing procedures and best practices
  - Authentication testing (JWT, brute force)
  - Input validation testing (injection prevention)
  - PII protection testing (detection, redaction)
  - Network security testing (SSL/TLS, rate limiting)
  - Penetration testing procedures
  - Automated security test suite

#### Protocol Specification Updates
- **Security Considerations Section** (`spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md`)
  - JWT authentication requirements (Section 8.2)
  - Input validation requirements (Section 8.3)
  - Data protection requirements (Section 8.4)
  - Authorization and RBAC (Section 8.5)
  - Compliance considerations (Section 8.6)
  - Security configuration options (Section 8.7)
  - Security monitoring (Section 8.8)
  - Threat model (Section 8.9)

#### Hub Security Enhancements
- Token validation on registration
- Message schema validation before processing
- CSS selector injection prevention
- XSS protection with HTML escaping
- Rate limiting per client
- Resource limits (memory, screenshots, traces)

#### Documentation Updates
- **README.md**: Security features section, updated version to 3.0.3
- **Technical Guide**: Security architecture chapter, configuration tables
- **User Guide**: Security setup and troubleshooting section
- **CHANGELOG.md**: Security improvements documented

---

## [UNRELEASED] Phase 14.2 - Universal Semantic Resolver

### 🔍 Semantic Resolution Overhaul

#### Fixed
- **Invalid CSS Selectors**: Removed `[@click]`, `[v-on:click]`, `[ng-click]`, `i[class*="fa-"]`, `i[class*="material-"]` from `INTERACTIVE_SELECTORS` that caused `querySelectorAll` to throw `SyntaxError` and crash semantic resolution
- **Checkout Button Mismatch**: Fixed fuzzy matcher incorrectly resolving `clickGoal('Checkout')` to `#cart_contents_container` instead of the actual `button#checkout`
- **Input Button Selectors**: Added `input[type="submit"][value="..."]` selector generation for submit buttons that use `value` attribute instead of inner text

#### Added
- **Primary Tag Prioritization**: Buttons, inputs, links, and selects with exact text matches now score higher (110) than container divs with partial matches
- **Debug Logging**: Added performance timing logs for semantic resolution (`Semantic resolution for "X" took Yms`)
- **SauceDemo E2E Test**: Full 12-step checkout flow verification (`test/intent_saucedemo.js`)
  - Login with semantic goals (`fillGoal('Username')`, `fillGoal('Password')`)
  - Cart interaction (`clickGoal('Add to cart')`, `clickGoal('shopping cart')`)
  - Checkout form (`fillGoal('First Name')`, `fillGoal('Last Name')`, `fillGoal('Zip/Postal Code')`)
  - Order completion (`clickGoal('Checkout')`, `clickGoal('Continue')`, `clickGoal('Finish')`)

#### Changed
- **Fuzzy Matcher**: Now breaks early only when score >= 110 (exact text match on primary element), not at 95
- **Element Discovery**: Enhanced to prefer visible interactive elements over hidden containers

#### Verified
- **SauceDemo Checkout**: 12/12 steps pass autonomously
- **Resolution Performance**: Average 5-10ms per semantic goal
- **Self-Healing**: Correctly identifies shifted selectors on dynamic forms

---

## [UNRELEASED] Phase 14.1 - Multi-Browser Foundation

### 🌐 Cross-Browser Support (Chromium / Firefox / WebKit)

#### Added
- **BrowserAdapter Architecture**: Abstraction layer for cross-browser support
  - `BrowserAdapter` base class defining unified interface
  - `ChromiumAdapter` - Full CDP access, shadow DOM piercing (>>>) combinator
  - `FirefoxAdapter` - Mozilla engine with graceful shadow DOM degradation
  - `WebKitAdapter` - Safari/iOS compatibility testing
- **Configuration**: New `hub.browser.engine` setting in `config.json`
  - Supports: `"chromium"` (default), `"firefox"`, `"webkit"`
  - Environment variable override: `HUB_BROWSER_ENGINE`
- **Capability Reporting**: Adapters expose browser-specific capabilities
  - `shadowDomPiercing`: Whether >>> combinator is supported
  - `cdpAccess`: Chrome DevTools Protocol availability
  - `touchEvents`: Mobile touch event support
  - `deviceEmulation`: Device emulation capabilities
- **Test Suite**: Comprehensive cross-browser validation
  - `test/unit/test_browser_adapter.js` - Adapter interface compliance tests
  - `test/cross_browser_test.js` - Protocol-level browser independence tests
  - `test/intent_cross_browser_verify.js` - Real Hub verification script

#### Changed
- **Hub Launch**: Replaced direct `chromium.launch()` with adapter pattern
  - Hub now uses `BrowserAdapter.create()` factory method
  - All browser references abstracted through adapter interface
- **Selector Normalization**: Browser-specific selector handling
  - Chromium preserves >>> shadow combinator
  - Firefox/WebKit log warnings and strip >>> for graceful degradation
- **Recording Sessions**: Now use adapter for browser launch (cross-browser compatible)

#### Documentation
- **README.md**: Added multi-browser quick start guide
- **User Guide**: Browser configuration examples
- **Technical Guide**: Adapter architecture explained

#### Protocol Compliance
- **Zero Breaking Changes**: Starlight Protocol v1.0.0 unchanged
- **Sentinel Independence**: All Sentinels remain browser-agnostic
- **Message Format**: JSON-RPC 2.0 identical across all browsers


---

## [1.2.2] - 2026-01-07

### Documentation
- **PyPI Page**: Fixed missing documentation for Upload command.

## [1.2.1] - 2026-01-07

### Fixed
- **PyPI Display**: README images now use absolute GitHub URLs for proper display on PyPI
- **README Version Badge**: Updated from 3.0.3 to 1.2.1

### Added
- **Upload Command** (missing from v1.2.0):
  - `hub.js`: Upload command using Playwright's `setInputFiles`
  - `IntentRunner`: `upload(selector, files)` and `uploadGoal(goal, files)` methods
  - `Python SDK`: `send_upload(selector, files)` method
  - Goal resolution for semantic upload via `resolveFormIntent`
  - Schema updated with `upload` command enum and `files` parameter
  - Comprehensive test suite: `intent_upload.js` ✅ PASSED

### Verified
- All commands in schema match implementation (11 total)
- Integration tests for all extended commands created
- CAPTCHA detection patterns added to JanitorSentinel

---

## [1.2.0] - 2026-01-07

### 🧠 Phase 18: Universal Protocol (Learning Persistence & Extended Commands)

#### Added
- **Learning Persistence**: Hub saves successful goal→selector mappings to `starlight_memory.json`
  - Automatic load on startup for instant self-healing
  - `learnMapping()` records successful resolutions in real-time
  - `saveHistoricalMemory()` persists on shutdown
- **Extended Commands**: 7 new automation commands in `executeCommand`
  - `select` - Dropdown selection
  - `hover` - Mouse hover
  - `check` / `uncheck` - Checkbox interaction
  - `scroll` - Scroll to element or bottom
  - `press` - Keyboard key press
  - `type` - Keyboard text input
- **IntentRunner API**: New semantic goal methods
  - `selectGoal()`, `hoverGoal()`, `checkGoal()`, `uncheckGoal()`
  - `scrollTo()`, `scrollToGoal()`, `scrollToBottom()`
  - `press()`, `type()`
- **CAPTCHA Detection**: JanitorSentinel detects robot challenges (reCAPTCHA, verification prompts)
- **Python SDK v1.2.0**: Extended action methods for all new commands
  - `send_select()`, `send_hover()`, `send_check()`, `send_uncheck()`
  - `send_scroll()`, `send_press()`, `send_type()`

#### Fixed
- **Goal Resolution Order**: Command-specific resolvers now run before default click resolver
- **Failure Reporting**: In-progress commands properly recorded as failed on shutdown
- **Interrupted Command Screenshots**: Timed-out commands now show final state in report

#### Changed
- **Schema**: `starlight.intent.schema.json` updated with new command enums
- **Documentation**: User guide updated with Phase 18 features

---

## [3.0.3] - 2026-01-02

### 🛠️ Phase 15: Visual Sentinel Editor & Fleet Manager

#### Added
- **Visual Sentinel Editor**: No-code UI for creating custom Sentinels
  - Template library (Cookie Banner, Modal Popup, Login Wall, Rate Limiter)
  - Live Python code preview
  - One-click export to `sentinels/` directory
  - Access at `/sentinel-editor` or via Mission Control
- **Sentinel Fleet Manager**: Dynamic sentinel discovery and management
  - Auto-discovers all `*.py` files in `sentinels/`
  - Dynamic cards with start/stop controls for each sentinel
  - "Start All" now launches ALL discovered sentinels
  - Emoji icons per sentinel type

#### Changed
- Mission Control now shows all available sentinels dynamically
- "Start All" starts the full constellation (Hub + all sentinels)
- "Stop All" stops all running processes

---

## [3.0.2] - 2026-01-02

### 🔔 Phase 10: Webhook Alerting

#### Added
- **WebhookNotifier Module**: `src/webhook.js` for sending Slack/Teams/Discord notifications
- **Config Integration**: New `webhooks` section in `config.json` with `enabled`, `urls`, and `notifyOn` options
- **Mission Notifications**: Hub sends webhook on mission completion with success/failure status
- **Test Infrastructure**: `test/webhook_test_server.js` for local webhook testing

#### How to Use
1. Set `webhooks.enabled: true` in config.json
2. Add your webhook URL(s) to `webhooks.urls` array
3. Run a mission — notifications will be sent automatically

---

## [3.0.1] - 2026-01-01

### 🔧 No-Code Marker HUD Fixes

#### Fixed
- **Checkpoint Button**: Now uses in-HUD text input instead of browser `prompt()` which was intercepted by Playwright
- **Stop Recording Button**: Now works directly without `confirm()` dialog for seamless recording termination
- **Function Exposure Order**: Recording functions are now exposed BEFORE page navigation to ensure they're available in the page context
- **Browser Isolation**: Recording now launches a completely fresh browser instance to avoid dialog handler conflicts

#### Changed
- **HUD Design**: Added dedicated checkpoint name input field directly in the HUD panel
- **Recording Flow**: Restructured into three steps: (1) Expose functions, (2) Navigate, (3) Inject HUD
- **Mission Control Integration**: Recording sessions now correctly capture checkpoints and stop signals

---

## [3.0.0] - 2026-01-01

### 🌌 Phase 16: The Autonomous Era (World-Class Recorder)

#### Added
- **Mutation Fingerprinting**: Test Recorder now captures environmental "stability signatures"
  - Injected `MutationObserver` measures DOM settle time after every user interaction
  - Encodes `stabilityHint` metadata into generated intent scripts
- **Autonomous CLI Orchestrator (`starlight.js`)**: Zero-touch lifecycle management
  - Single command `node bin/starlight.js <mission>` launches Hub and all Sentinels
  - Automatic process cleanup and standardized exit codes (0 for success, 1 for failure)
  - Headless mode support for CI/CD environments
- **Hub Health Check**: New `http://localhost:8080/health` endpoint for orchestration polling
- **GitHub Actions Integration**: Sample workflow for automated Starlight missions
- **Failure-Safe Reporting**: Hub now generates a "Mission Failure" report immediately on error, ensuring evidence is captured even in catastrophic runs.

#### Changed
- **PulseSentinel**: Now context-aware; dynamically adjusts settlement windows based on `stabilityHint`
- **IntentRunner**: Automatically closes WebSocket connections on mission finish, preventing process hanging
- **Mission Control UI**: Now dynamically discovers new recording scripts and hydrates the mission dropdown in real-time.

---

## [2.8.0] - 2024-12-31

### 🛡️ Phase 9: Sovereign Security & Compliance (Shadow DOM)

#### Added
- **Shadow DOM Penetration**: Deep-piercing selectors for encapsulated web components
  - Hub `resolveSemanticIntent` now recursively traverses shadow roots
  - Hub `broadcastPreCheck` detects obstacles inside shadow boundaries
  - `executeSentinelAction` clears obstacles across shadow DOM
- **`config.json` → `shadowDom`**: New configuration section
  - `enabled`: Toggle shadow DOM traversal (default: true)
  - `maxDepth`: Maximum shadow root traversal depth (default: 5)
- **`test/shadow_test.html`**: Test page with custom web component
- **`test/intent_shadow.js`**: Intent script for shadow DOM missions

#### Changed
- **JanitorSentinel**: Added shadow-piercing patterns (`>>> .modal`, `>>> .popup`)
- **Sovereign Remediation**: Now traverses shadow roots when clearing obstacles

---

### 🛠️ Phase 8: Codebase Hardening & Quality Fixes

#### Added
- **`config.json`**: Centralized configuration file for all hardcoded values
  - Hub settings: port, syncBudget, missionTimeout, heartbeatTimeout, lockTTL
  - Aura settings: predictiveWaitMs, bucketSizeMs
  - Sentinel settings: settlementWindow, reconnectDelay, heartbeatInterval
  - Vision settings: model, timeout, ollamaUrl
- **`requirements.txt`**: Python dependencies with pinned versions
- **Screenshot Cleanup**: Auto-removes screenshots older than 24 hours at Hub startup
- **Trace Rotation**: Mission trace limited to 500 events (configurable)
- **Graceful Shutdown**: Sentinels now handle SIGINT/SIGTERM, saving memory before exit

#### Changed
- **PulseSentinel**: Migrated to inherit from `SentinelBase` (SDK consistency)
- **Sync Budget**: Reduced default from 90s to 30s (configurable)
- **Exception Handling**: Replaced bare `except:` blocks with proper error handling
- **File Persistence**: Memory files now use atomic writes (temp file + rename)
- **DataSentinel**: Now extracts real command/goal data instead of fake tokens

#### Fixed
- **Janitor Learning Race Condition**: Now tracks all tried selectors correctly
- **SDK Message Handling**: Non-blocking protocol processing with `asyncio.create_task`
- **Path Handling**: Standardized `sys.path` approach across all sentinels

---

## [2.6.0] - 2024-12-29

### 🛰️ Phase 7: The Galaxy Mesh (Predictive Intelligence)

#### Added
- **Self-Healing Selectors**: Hub learns DOM patterns from `mission_trace.json`
- **Aura-Based Throttling**: Dynamic pacing based on historical entropy windows
- **Sentinel Learning**: Persistent memory for Janitor and Vision sentinels
- **`JanitorSentinel_memory.json`**: Stores learned remediation selectors
- **`test/intent_learning.js`**: Demo mission for Sentinel learning
- **`test/learning_test.html`**: Test page with stubborn modal

#### Changed
- **ROI Dashboard**: Now includes "AURA STABILIZED" badge and predictive ROI
- **Hub Memory**: Loads historical selectors and auras on startup

---

## [2.5.0] - 2024-12-28

### 🛡️ Phase 6: The Omega Standard

#### Added
- **Time-Travel Triage**: Full DOM snapshots on every intent
- **`triage.html`**: Interactive mission replay tool
- **`mission_trace.json`**: High-fidelity event logging
- **Docker Support**: `Dockerfile` and `docker-compose.yml`
- **STARLIGHT_STANDARD.md**: Formal protocol specification

---

## [2.4.0] - 2024-12-27

### 🎯 Phase 5: Semantic Intent

#### Added
- **Semantic Resolver**: Goals like "INITIATE MISSION" auto-resolve to selectors
- **Aria Label Support**: Accessibility-first element discovery
- **Cosmic Challenge**: Stress test with multiple obstacles

---

## [2.3.0] - 2024-12-26

### 🌐 Phase 4: Decentralized Sentinel Mesh

#### Added
- **Starlight SDK**: `SentinelBase` class for rapid agent development
- **Sovereign Context**: Shared state across the constellation
- **DataSentinel**: Passive intelligence extraction agent

---

## [2.2.0] - 2024-12-25

### ⏱️ Phase 3: Temporal Stability

#### Added
- **PulseSentinel**: Network/DOM entropy monitoring
- **Auto-Wait Handshake**: No more `setTimeout` in intent scripts
- **Entropy Stream**: Real-time stability signaling

---

## [2.1.0] - 2024-12-24

### 👁️ Phase 2: AI Visionary Layer

#### Added
- **VisionSentinel**: Local SLM (Moondream) integration
- **Screenshot Analysis**: Visual obstacle detection
- **Hybrid Healing**: 25s AI budget with heuristic fallback

---

## [2.0.0] - 2024-12-23

### 🚀 Phase 1: The Core Protocol

#### Added
- **CBA Hub**: Central orchestrator with Playwright
- **JSON-RPC 2.0**: Standardized message bus
- **JanitorSentinel**: Heuristic obstacle removal
- **Priority Handshaking**: Multi-sentinel coordination
- **Hero Story Report**: Business ROI visualization

---

## [1.0.0] - 2024-12-22

### 🌟 Initial Release

- Proof of concept for Constellation-Based Automation
- Basic Hub with WebSocket communication
- Single sentinel prototype
