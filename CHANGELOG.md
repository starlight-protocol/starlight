# 📜 Changelog

All notable changes to the CBA (Constellation-Based Automation) project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
