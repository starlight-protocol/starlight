# 🛰️ Constellation-Based Automation (CBA)
## Starlight Protocol v2.6 (GALAXY) — The Predictive Intelligence Era

**"Don't look at the ground; look at the Starlight."**

CBA is a philosophical shift in browser automation. Inspired by biological navigation (like the dung beetle using the Milky Way), this framework moves away from linear scripts that handle every possible UI obstacle. Instead, it uses a **Sovereign Constellation** of autonomous agents (Sentinels) that orient toward high-level goals.

## 🏗️ The Sovereign Constellation

![CBA Architecture](architecture.png)

CBA uses a **Decentralized Sidecar Architecture** communicating over a JSON-RPC message bus.

| Layer | Biological Equivalent | Role in CBA |
| :--- | :--- | :--- |
| **Intent Layer** | The Goal | High-level business intent. Now **Selector-Less** (e.g., `{ goal: 'Login' }`). |
| **The Hub** | The Brain | Orchestrates Playwright, resolves semantic goals, and manages the **Sovereign Context**. |
| **Vision (Sentinel)** | AI Perception | Uses local SLMs (Moondream) to visually detect and heal obstacles without selectors. |
| **Janitor (Sentinel)** | The Ground | Heuristic background process that clears modals, cookie banners, and overlays. |
| **Pulse (Sentinel)** | Entropy | Monitors network/DOM jitter to enforce **Wait-Less** temporal stability. |
| **Data (Sentinel)** | Intelligence | Passively extracts metadata (tokens, links) and injects it into the shared context. |

## 🛰️ The Starlight Protocol (v2.5)

Standardized signals for zero-wait, selector-less autonomy:

| Method | Initiator | Purpose |
| :--- | :--- | :--- |
| `starlight.intent` | Intent | Issues a high-level `goal` or `cmd`. |
| `starlight.pre_check` | Hub | Handshake broadcast with screenshot for **AI Vision** analysis. |
| `starlight.wait` | Sentinel | Veto due to environmental instability (Temporal Stability). |
| `starlight.hijack` | Sentinel | Request absolute browser lock for recovery/healing. |
| `starlight.context_update`| Sentinel | Inject intelligence into the Hub’s shared mission state. |

## 🛠️ The Starlight SDK (Python)
Build a sentinel in minutes using the provided base class:
```python
from sdk.starlight_sdk import SentinelBase

class MySentinel(SentinelBase):
    async def on_pre_check(self, params, msg_id):
        # Your custom healing logic here
        await self.send_clear()
```

- **Context Awareness**: Logs shared metadata discovered by the constellation.

## 🎞️ Phase 6: The "Omega" Standard
CBA has transitioned from a framework to a **Standard for Resilient Infrastructure**.

### ⏪ Time-Travel Triage
Every mission is now recorded with high-fidelity telemetry. Use the `triage.html` tool to:
- **Rewind** failed runs to the exact DOM state.
- **Inspect** every JSON-RPC handshake between the Hub and Sentinels.
- **Diagnose** environmental entropy through integrated visual context.

### 🌐 Cloud Orchestration
CBA is now Docker-native. Spin up a full constellation in seconds:
```bash
docker-compose up --build
```
This deploys a managed Hub and a mesh of Sentinels (Pulse, Janitor, Data) for ephemeral execution.

### 🛰️ The Starlight Standard (Compliance)
Formal protocol specifications are available in [STARLIGHT_STANDARD.md](file:///c:/cba/STARLIGHT_STANDARD.md).

## 🌌 Phase 7: The "Galaxy" Mesh
CBA is now evolving into a **Self-Learning Ecosystem**.

### 🧠 Predictive Memory (Self-Healing)
The Hub now learns from every mission. By indexing `mission_trace.json`, it builds a mapping of high-level goals to successful selectors.
- **Auto-Recovery**: If a selector fails, the Hub cross-references its memory to find a historical substitute.
- **Aura-Based Throttling**: The Hub learns "Environmental Auras" (temporal jitter clusters) and proactive slows down mission pacing to maintain stability.
- **Semantic Evolution**: The more missions you run, the smarter the Hub becomes.

### 📈 ROI Dashboard 2.0
The `report.html` now quantifies the business value of autonomy:
- **Triage Savings**: Automatically calculates minutes saved per obstacle cleared.
- **Healing Credits**: Tracks mission-saving "Self-Healing" events in real-time.
- **Predictive ROI**: Quantifies value of proactive "Aura Stabilization" events.
- **Visual Proof**: State-aware screenshots provide undeniable evidence of mission success.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) & Python (3.9+)
- [Ollama](https://ollama.ai/) (for Vision Sentinel)
- Playwright

### Setup
```bash
git clone <repo-url>
npm install
pip install websockets httpx
npx playwright install chromium
```

### The "Full Constellation" Demo
Run the world-class **Cosmic Challenge** or the **Self-Healing Demo**:
- **Easiest**: Run `run_cba.bat` and select your mission.
- **Manual**:
    1. **Start Hub**: `node src/hub.js`
    2. **Start Constellation**: Pulse, Janitor, Vision, Data sentinels.
    3. **Run Intent**: `node src/intent.js` or `node test/intent_self_heal.js`.

---
*Built with ❤️ by [Dhiraj Das](https://www.dhirajdas.dev)*
