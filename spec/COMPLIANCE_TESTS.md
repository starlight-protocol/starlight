# Starlight Protocol Compliance Test Suite

**Version:** 1.0.0  
**Specification:** STARLIGHT_PROTOCOL_SPEC_v1.0.0

---

## Overview

This document defines the compliance tests required to verify that an implementation conforms to the Starlight Protocol Specification.

---

## Level 1: Core Compliance

### Hub Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| H1.1 | WebSocket Server | Hub accepts WebSocket connections |
| H1.2 | Registration Handling | Hub acknowledges `starlight.registration` |
| H1.3 | Sentinel Registry | Hub maintains list of connected Sentinels |
| H1.4 | Pre-Check Broadcast | Hub sends `starlight.pre_check` before actions |
| H1.5 | Clear Handling | Hub executes action when all Sentinels send `clear` |
| H1.6 | Wait Handling | Hub pauses when any Sentinel sends `wait` |
| H1.7 | Hijack Handling | Hub yields control when Sentinel sends `hijack` |
| H1.8 | Resume Handling | Hub regains control after `resume` |
| H1.9 | Priority Resolution | Hub processes higher-priority Sentinel responses first |
| H1.10 | Disconnect Cleanup | Hub removes Sentinel from registry on disconnect |

### Sentinel Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| S1.1 | WebSocket Connection | Sentinel connects to Hub |
| S1.2 | Registration | Sentinel sends valid `starlight.registration` |
| S1.3 | Heartbeat | Sentinel sends periodic `starlight.pulse` |
| S1.4 | Pre-Check Response | Sentinel responds to `pre_check` with valid message |
| S1.5 | Clear Response | Sentinel can send `starlight.clear` |
| S1.6 | Wait Response | Sentinel can send `starlight.wait` with retry delay |
| S1.7 | Hijack Flow | Sentinel can hijack, perform actions, and resume |
| S1.8 | Graceful Shutdown | Sentinel persists state on SIGINT |

---

## Level 2: Extended Compliance

### Hub Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| H2.1 | Entropy Stream | Hub broadcasts `starlight.entropy_stream` |
| H2.2 | Context Updates | Hub processes `starlight.context_update` |
| H2.3 | Sovereign State | Hub maintains shared state accessible to Sentinels |
| H2.4 | Health Endpoint | Hub provides `/health` HTTP endpoint |
| H2.5 | Mission Trace | Hub records all messages to trace file |

### Sentinel Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| S2.1 | Entropy Handling | Sentinel processes `entropy_stream` messages |
| S2.2 | Context Injection | Sentinel can update sovereign state |
| S2.3 | Configuration | Sentinel loads configuration from external file |

---

## Level 3: Full Compliance

### Hub Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| H3.1 | Semantic Goals | Hub resolves goals like "Login Button" to selectors |
| H3.2 | Self-Healing | Hub substitutes failed selectors from history |
| H3.3 | Stability Hints | Hub uses `stabilityHint` in pre-check |
| H3.4 | Report Generation | Hub generates execution report |
| H3.5 | Webhook Notifications | Hub sends webhooks on mission completion |

### Sentinel Tests

| Test ID | Description | Pass Criteria |
|---------|-------------|---------------|
| S3.1 | Persistent Memory | Sentinel remembers successful strategies |
| S3.2 | Learning | Sentinel learns from command completion feedback |
| S3.3 | Predictive Actions | Sentinel uses memory for faster remediation |

---

## Test Execution

### Prerequisites

1. Hub running on port 8080
2. Test Sentinel implementation available
3. Test Intent client available

### Running Tests

```bash
# Core compliance
starlight test --level 1

# Extended compliance
starlight test --level 2

# Full compliance
starlight test --level 3
```

### Pass Criteria

| Level | Required Pass Rate |
|-------|-------------------|
| Level 1 | 100% |
| Level 2 | 100% of Level 1 + 80% of Level 2 |
| Level 3 | 100% of Level 1 + 80% of Level 2 + 70% of Level 3 |

---

## Certification

Implementations that pass Level 1 compliance MAY display:

```
✅ Starlight Protocol Compliant (Level 1)
```

Implementations that pass Level 3 compliance MAY display:

```
🌟 Starlight Protocol Certified
```

---

## Appendix: Test Message Examples

### Valid Registration
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.registration",
    "params": {
        "layer": "TestSentinel",
        "priority": 5,
        "capabilities": ["test"],
        "selectors": []
    },
    "id": "test-001"
}
```

### Valid Pre-Check Response (Clear)
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.clear",
    "params": {},
    "id": "test-002"
}
```

### Valid Pre-Check Response (Wait)
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.wait",
    "params": {
        "retryAfterMs": 1000
    },
    "id": "test-003"
}
```

### Valid Hijack Sequence
```json
// Step 1: Hijack
{
    "jsonrpc": "2.0",
    "method": "starlight.hijack",
    "params": {
        "reason": "Detected obstacle"
    },
    "id": "test-004"
}

// Step 2: Action
{
    "jsonrpc": "2.0",
    "method": "starlight.action",
    "params": {
        "cmd": "click",
        "selector": ".close-btn"
    },
    "id": "test-005"
}

// Step 3: Resume
{
    "jsonrpc": "2.0",
    "method": "starlight.resume",
    "params": {
        "re_check": true
    },
    "id": "test-006"
}
```
