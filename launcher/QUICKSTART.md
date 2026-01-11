# 🛰️ Mission Control Quick Start Guide

## Overview

Mission Control is the GUI for managing the Starlight Protocol constellation.

---

## Quick Start (3 Steps)

### Step 1: Start the Launcher
```bash
cd c:\cba
node launcher/server.js
```

### Step 2: Open Browser
Navigate to: **http://localhost:3000**

### Step 3: Launch Hub & Run a Test
1. Click **"Launch Hub"** (wait for green indicator)
2. Click **"Start All"** to launch all Sentinels
3. Select a mission from the dropdown → Click **"🚀 Launch Mission"**

---

## Running NLI (Natural Language) Tests

### Option A: Quick NLI Test
1. Click **"📝 Login Example"** in the NLI section
2. Click **"🚀 Execute NL"**
3. Watch the browser automation!

### Option B: Custom NLI Command
1. Type your command in the NLI text box, e.g.:
   ```
   Go to google.com and fill search with Starlight Protocol
   ```
2. Press **Enter** or click **"🚀 Execute NL"**

---

## UI Sections Explained

| Section | Purpose |
|---------|---------|
| **Fleet Grid** | Hub + Sentinels status (green = running) |
| **Vitals** | Success rate, saved effort, recovery time |
| **Mission Control** | Select and launch pre-built test scripts |
| **Natural Language** | Type commands in plain English |
| **Live Logs** | Real-time output from all processes |

---

## NLI Parser Selection (Automatic)

| Command Type | Parser Used | Speed |
|--------------|-------------|-------|
| Simple: `Go to X`, `Click Y` | Fallback (Regex) | <1ms |
| Complex: `Login and buy cheapest item` | LLM (Ollama) | ~5-10s |

The system **automatically** chooses the best parser. If Ollama isn't running, fallback is used.

---

## Button Reference

| Button | Action |
|--------|--------|
| **Launch Hub** | Start the browser orchestrator |
| **Start All** | Launch Hub + all Sentinels |
| **Stop All** | Stop everything |
| **🚀 Launch Mission** | Run selected test script |
| **🚀 Execute NL** | Run natural language command |
| **🔍 NLI Status** | Check Ollama and parser config |
| **🦙 Launch Ollama** | Start Ollama server (if not running) |
| **📊 View Report** | Open test report in new tab |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Hub won't start | Check if port 8080 is in use |
| NLI fails | Click "NLI Status" to check Ollama |
| Sentinel errors | Ensure Python dependencies installed |
| No browser opens | Check `config.json` → `hub.browser.engine` |

---

## Running from Command Line

```bash
# Run NLI E2E test
node bin/starlight.js test/intent_nli_test.js

# Run specific Gherkin feature
python cli/main.py feature test/features/saucedemo_checkout.feature

# Check NLI status
python cli/main.py nl --status "test"
```
