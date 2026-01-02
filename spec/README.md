# Starlight Protocol

<p align="center">
  <img src="assets/starlight-logo.png" alt="Starlight Protocol" width="200">
</p>

<p align="center">
  <strong>An Open Standard for Autonomous Browser Automation</strong>
</p>

<p align="center">
  <a href="spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md">📄 Specification</a> •
  <a href="spec/COMPLIANCE_TESTS.md">✅ Compliance Tests</a> •
  <a href="#implementations">🔧 Implementations</a> •
  <a href="#community">🌍 Community</a>
</p>

---

## What is the Starlight Protocol?

The Starlight Protocol is a **communication standard** for coordinating autonomous agents in browser automation. It separates **intent** (what you want to accomplish) from **environment management** (handling obstacles like popups, slow networks, and DOM instability).

Traditional automation:
```javascript
// You must handle EVERYTHING
if (await page.$('.cookie-banner')) {
    await page.click('.cookie-banner .dismiss');
}
if (await page.$('.newsletter-popup')) {
    await page.click('.newsletter-popup .close');
}
// ... finally do what you actually wanted
await page.click('#submit');
```

With Starlight Protocol:
```javascript
// You only express INTENT
await hub.send({ goal: 'Submit Form' });
// Sentinels handle the environment automatically
```

---

## Why a Protocol?

A protocol is not just a library—it's a **contract** that enables:

| Benefit | Description |
|---------|-------------|
| **Interoperability** | Different implementations can work together |
| **Language Agnostic** | Hub in Node.js, Sentinels in Python, Rust, Go... |
| **Extensibility** | Add new Sentinels without changing the Hub |
| **Standardization** | Common vocabulary, predictable behavior |

---

## Core Concepts

### The Hub
The central orchestrator that manages the browser and coordinates Sentinels.

### Sentinels
Autonomous agents that monitor specific aspects of the environment:
- **Pulse Sentinel**: Temporal stability (DOM/Network)
- **Janitor Sentinel**: Obstacle removal (popups, modals)
- **Vision Sentinel**: AI-powered visual detection
- **Data Sentinel**: Context extraction

### The Handshake
Before every action, the Hub consults ALL Sentinels:
1. Hub sends `starlight.pre_check`
2. Sentinels respond: `clear` | `wait` | `hijack`
3. Hub acts based on consensus

---

## Specification

The formal specification is available at:

📄 **[STARLIGHT_PROTOCOL_SPEC_v1.0.0.md](spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md)**

It defines:
- Message format (JSON-RPC 2.0)
- All protocol methods
- Lifecycle diagrams
- Compliance requirements

---

## Implementations

### Reference Implementation
| Component | Language | Location |
|-----------|----------|----------|
| Hub | Node.js | `src/hub.js` |
| Sentinel SDK | Python | `sdk/starlight_sdk.py` |
| Pulse Sentinel | Python | `sentinels/pulse_sentinel.py` |
| Janitor Sentinel | Python | `sentinels/janitor.py` |

### Community Implementations
*Coming soon! Build your own and submit a PR.*

---

## Compliance

Implementations can achieve compliance levels:

| Level | Requirements |
|-------|--------------|
| **Level 1 (Core)** | All required methods |
| **Level 2 (Extended)** | + Context, Entropy, Health |
| **Level 3 (Full)** | + Semantic Goals, Self-Healing |

See [COMPLIANCE_TESTS.md](spec/COMPLIANCE_TESTS.md) for details.

---

## Quick Start

### 1. Start the Hub
```bash
node src/hub.js
```

### 2. Start a Sentinel
```bash
python sentinels/pulse_sentinel.py
```

### 3. Run an Intent
```bash
node test/my_mission.js
```

---

## Community

- **GitHub**: https://github.com/godhiraj-code/cba
- **Author**: [Dhiraj Das](https://www.dhirajdas.dev)

### Contributing

We welcome contributions:
1. Fork the repository
2. Create your implementation
3. Submit a PR with compliance test results

---

## License

MIT License - See [LICENSE](LICENSE)

---

<p align="center">
  <em>The stars in the constellation are many, but the intent is one.</em>
</p>
