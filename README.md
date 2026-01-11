# 🛰️ Starlight Protocol

<p align="center">
  <img src="https://raw.githubusercontent.com/starlight-protocol/starlight/main/assets/starlight-logo.png" alt="Starlight Protocol" width="150">
</p>

<p align="center">
  <strong>An Open Standard for Autonomous Browser Automation</strong>
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-3.0.3-blue.svg" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"></a>
  <a href="https://github.com/starlight-protocol/starlight/actions/workflows/starlight_ci.yml"><img src="https://github.com/starlight-protocol/starlight/actions/workflows/starlight_ci.yml/badge.svg" alt="CI"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/python-%3E%3D3.9-blue.svg" alt="Python"></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md">Specification</a> •
  <a href="docs/book/THE_STARLIGHT_PROTOCOL_BOOK.md">Book</a> •
  <a href="docs/roadmap.md">Roadmap</a>
</p>

---

## What is the Starlight Protocol?

The Starlight Protocol decouples **intent** from **environment**. Your test scripts describe goals; autonomous Sentinels handle the chaos.

```javascript
// Traditional: Handle EVERYTHING yourself
if (await page.$('.cookie-banner')) await page.click('.dismiss');
if (await page.$('.popup')) await page.click('.close');
await page.click('#submit');

// Starlight: Express INTENT only
await hub.send({ goal: 'Submit Form' });
// Sentinels automatically clear obstacles
```

---

## 🏗️ Architecture

<p align="center">
  <img src="https://raw.githubusercontent.com/starlight-protocol/starlight/main/assets/architecture.png" alt="Architecture" width="600">
</p>

| Component | Role |
|-----------|------|
| **Hub** | Central orchestrator, manages Playwright browser |
| **JWT Handler** | Authentication & authorization system |
| **Schema Validator** | Input validation & message verification |
| **PII Redactor** | Data protection & privacy compliance |
| **Pulse Sentinel** | Monitors DOM/Network stability |
| **Janitor Sentinel** | Clears popups, modals, banners |
| **Vision Sentinel** | AI-powered obstacle detection (Moondream) |
| **Data Sentinel** | Context extraction & injection |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ & Python 3.9+
- [Ollama](https://ollama.ai/) (optional, for Vision)

### Install
```bash
git clone https://github.com/starlight-protocol/starlight.git
cd cba
npm install
pip install -r requirements.txt
npx playwright install chromium
```

### Run
```bash
# One command launches everything
node bin/starlight.js test/intent_portfolio_v2.js --headless
```

### Mission Control (GUI)
```bash
node launcher/server.js
# Open http://localhost:3000
```

### Multi-Browser Support (Phase 14.1)
```bash
# Run with Firefox
HUB_BROWSER_ENGINE=firefox node bin/starlight.js test/intent_portfolio_v2.js

# Run with WebKit (Safari engine)
HUB_BROWSER_ENGINE=webkit node bin/starlight.js test/intent_portfolio_v2.js

# Or configure in config.json:
{
  "hub": {
    "browser": { "engine": "firefox" }
  }
}
```

**Supported Browsers:**
- **Chromium** (default) - Full CDP access, shadow DOM piercing
- **Firefox** - Mozilla engine, standard DOM APIs
- **WebKit** - Safari engine, iOS compatibility testing

Install all browsers:
```bash
npx playwright install chromium firefox webkit
```

### Mobile Emulation (Phase 14.2)
```bash
# Run on iPhone 14 Pro Max
HUB_DEVICE="iPhone 14 Pro Max" node bin/starlight.js test/intent_saucedemo.js

# Run on Pixel 7
HUB_DEVICE="Pixel 7" node bin/starlight.js test/intent_saucedemo.js

# Or configure in config.json:
{
  "hub": {
    "device": "iPhone 14 Pro Max"
  }
}
```

**Verified:** Full 12-step SauceDemo checkout flow passes autonomously. See [test/intent_saucedemo.js](test/intent_saucedemo.js).

---

## 🛰️ The Protocol

All communication uses JSON-RPC 2.0:

| Method | Purpose |
|--------|---------|
| `starlight.intent` | Issue a goal or command |
| `starlight.pre_check` | Hub → Sentinels handshake |
| `starlight.clear` | Sentinel approves action |
| `starlight.wait` | Sentinel vetoes (retry later) |
| `starlight.hijack` | Sentinel takes browser control |
| `starlight.resume` | Sentinel releases control |

📄 **[Full Specification](spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md)**

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **JWT Authentication** | Secure token-based authentication with timing-safe verification |
| **Input Validation** | Comprehensive JSON schema validation for all protocol messages |
| **PII Protection** | Automatic detection and redaction of sensitive data (emails, passwords, credit cards) |
| **Self-Healing Selectors** | Learns alternatives when selectors fail |
| **Animation Tolerance** | Handles CSS animations without blocking |
| **No-Code Recorder** | Record tests by clicking through your site |
| **Visual Sentinel Editor** | Create custom Sentinels without code |
| **Shadow DOM Support** | Pierces web component boundaries |
| **Webhook Alerts** | Slack/Teams notifications |
| **Upload Automation** | Native file upload support (selector & semantic) |
| **ROI Dashboard** | Quantifies time saved |

---

## 🛠️ Build a Sentinel

```python
from sdk.starlight_sdk import SentinelBase

class MySentinel(SentinelBase):
    def __init__(self):
        super().__init__("MySentinel", priority=5)
        self.selectors = [".my-obstacle"]
    
    async def on_pre_check(self, params, msg_id):
        # Your detection logic
        await self.send_clear()

if __name__ == "__main__":
    import asyncio
    asyncio.run(MySentinel().start())
```

---

## 🛒 Sentinel Store

Install community Sentinels or create your own:

```bash
# List installed & available
python cli/main.py list --available

# Install from registry or GitHub
python cli/main.py install cookie-consent
python cli/main.py install captcha-detector
python cli/main.py install https://github.com/user/my-sentinel

# Create new Sentinel
python cli/main.py create "Cookie Blocker"

# Use Visual Editor (no-code)
# Open Mission Control → Click "Create Sentinel"
```

**Available Plugins:**
| Plugin | Description |
|--------|-------------|
| `cookie-consent` | Auto-dismiss cookie banners and GDPR popups |
| `captcha-detector` | Detect CAPTCHA and pause for manual intervention |
| `login-session` | Persist login sessions across test runs |

---

## ✅ Test Coverage

```bash
# Run all unit tests (100% coverage)
node test/run_all_tests.js
```

| Component | Test File | Status |
|-----------|-----------|--------|
| IntentRunner | test_intent_runner.js | ✅ |
| SentinelSDK | test_sentinel_sdk.js | ✅ |
| HubCore | test_hub_core.js | ✅ |
| BrowserAdapter | test_browser_adapter.js | ✅ |
| ShadowUtils | test_shadow_utils.js | ✅ |
| Warp | test_warp.js | ✅ |
| Telemetry | test_telemetry.js | ✅ |
| CLI | test_cli.js | ✅ |
| + 4 more | ... | ✅ |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [🔒 Security Guide](docs/SECURITY_GUIDE.md) | Security architecture & best practices |
| [📖 Book](docs/book/THE_STARLIGHT_PROTOCOL_BOOK.md) | Comprehensive guide |
| [📄 Specification](spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md) | Formal protocol standard |
| [📋 User Guide](docs/user_guide.md) | Getting started |
| [⚙️ Technical Guide](docs/technical_guide.md) | SDK & configuration |
| [🛡️ Security Configuration](docs/SECURITY_CONFIGURATION.md) | Security settings reference |
| [📊 Compliance Guide](docs/COMPLIANCE_GUIDE.md) | GDPR/HIPAA compliance |
| [🧪 Security Testing](docs/SECURITY_TESTING.md) | Security testing procedures |
| [🗺️ Roadmap](docs/roadmap.md) | Future plans |
| [📝 Changelog](CHANGELOG.md) | Version history |

---

## 🔒 Security Features

Starlight Protocol includes enterprise-grade security features:

### **Authentication & Authorization**
- ✅ JWT-based authentication with HS256 signing
- ✅ Configurable token expiration (default: 3600s)
- ✅ Timing-safe signature verification
- ✅ Token refresh mechanism

### **Input Validation & Protection**
- ✅ Comprehensive JSON schema validation for all protocol messages
- ✅ Field type checking, pattern matching, and length limits
- ✅ CSS selector injection prevention
- ✅ XSS protection with HTML escaping

### **Data Protection & Privacy**
- ✅ Automatic PII detection and redaction
- ✅ AES-256-GCM encryption for sensitive data
- ✅ Secure logging with automatic PII redaction
- ✅ Compliance modes: alert, block, or redact

### **Security Configuration**
```json
{
    "security": {
        "jwtSecret": "your-secret-key",
        "tokenExpiry": 3600,
        "piiRedaction": true,
        "ssl": {
            "enabled": false,
            "keyPath": null,
            "certPath": null
        }
    }
}
```

📄 **[Security Guide](docs/SECURITY_GUIDE.md)** - Complete security documentation

---

## 🐳 Docker

```bash
docker-compose up --build
```

---

## 📖 Blog Series

- [Part 1: The Inner Workings](https://www.dhirajdas.dev/blog/constellation-based-automation-starlight-protocol)
- [Part 2: Mission Control & ROI](https://www.dhirajdas.dev/blog/starlight-mission-control-observability-roi)
- [Part 3: The Autonomous Era](https://www.dhirajdas.dev/blog/starlight-part-3-autonomous-era)

---

## 📄 License

MIT License - [LICENSE](LICENSE)

---

<p align="center">
  <em>"Don't look at the ground; look at the Starlight."</em>
</p>

<p align="center">
  Built with ❤️ by <a href="https://www.dhirajdas.dev">Dhiraj Das</a>
</p>
