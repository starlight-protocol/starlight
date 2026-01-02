# The Starlight Protocol Specification

**Version:** 1.0.0  
**Status:** Standard  
**Date:** 2026-01-02  
**Author:** Dhiraj Das  

---

## Abstract

The Starlight Protocol is a communication standard for coordinating autonomous agents in browser automation environments. It defines a message-passing architecture where a central orchestrator (the Hub) coordinates with specialized monitoring agents (Sentinels) to ensure reliable execution of user intents in chaotic web environments.

This specification defines the protocol's message format, required methods, lifecycle events, and compliance requirements for implementations.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Terminology](#2-terminology)
3. [Architecture](#3-architecture)
4. [Message Format](#4-message-format)
5. [Protocol Methods](#5-protocol-methods)
6. [Lifecycle](#6-lifecycle)
7. [Compliance Requirements](#7-compliance-requirements)
8. [Security Considerations](#8-security-considerations)
9. [IANA Considerations](#9-iana-considerations)

---

## 1. Introduction

### 1.1 Purpose

Traditional browser automation frameworks suffer from environmental instability—popups, network delays, and DOM mutations cause test failures unrelated to application logic. The Starlight Protocol addresses this by separating **intent** (what the user wants to accomplish) from **environment management** (handling obstacles).

### 1.2 Scope

This specification defines:
- The message format for Hub-Sentinel communication
- Required and optional protocol methods
- The handshake lifecycle for action execution
- Compliance requirements for implementations

### 1.3 Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 2. Terminology

**Hub**: The central orchestrator that manages browser context and coordinates Sentinel responses.

**Sentinel**: An autonomous agent that monitors a specific aspect of the browser environment (e.g., DOM stability, visual obstacles, network activity).

**Intent**: A client that issues high-level goals or commands to the Hub.

**Handshake**: The pre-execution consultation process where the Hub queries all Sentinels before performing an action.

**Hijack**: The process by which a Sentinel temporarily takes control of the browser to perform corrective actions.

**Sovereign State**: The shared context maintained by the Hub, accessible to all connected clients.

**Entropy**: A measure of environmental instability (DOM mutations, network activity).

---

## 3. Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTENT LAYER                            │
│                    (Test Scripts, Users)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ starlight.intent
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                           HUB                                   │
│                   (Central Orchestrator)                        │
│  - Browser Management                                           │
│  - Message Routing                                              │
│  - Handshake Coordination                                       │
│  - Sovereign State                                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ starlight.pre_check
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Sentinel   │     │  Sentinel   │     │  Sentinel   │
│  (Pulse)    │     │  (Janitor)  │     │  (Vision)   │
│ Priority: 1 │     │ Priority: 5 │     │ Priority: 7 │
└─────────────┘     └─────────────┘     └─────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │ starlight.clear / wait / hijack
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
│                  (Managed by Hub)                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Transport

Implementations MUST use WebSocket as the transport layer. The Hub MUST listen on a configurable port (default: 8080).

### 3.3 Priority

Sentinels MUST declare a priority (1-10) during registration. Lower numbers indicate higher priority. The Hub SHOULD process responses in priority order when resolving conflicts.

---

## 4. Message Format

### 4.1 Base Format

All messages MUST conform to [JSON-RPC 2.0](https://www.jsonrpc.org/specification).

```json
{
    "jsonrpc": "2.0",
    "method": "starlight.<method_name>",
    "params": { ... },
    "id": "<unique_identifier>"
}
```

### 4.2 Method Naming

All Starlight methods MUST be prefixed with `starlight.` followed by the method name in snake_case.

### 4.3 Identifier

The `id` field MUST be a unique string. Implementations SHOULD use timestamps or UUIDs.

---

## 5. Protocol Methods

### 5.1 Registration Methods

#### 5.1.1 starlight.registration

**Direction:** Sentinel → Hub  
**Purpose:** Register a Sentinel with the Hub.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| layer | string | YES | Unique name of the Sentinel |
| priority | integer | YES | Priority level (1-10, lower = higher) |
| capabilities | array[string] | NO | List of capabilities |
| selectors | array[string] | NO | CSS selectors this Sentinel monitors |

**Example:**
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.registration",
    "params": {
        "layer": "JanitorSentinel",
        "priority": 5,
        "capabilities": ["detection", "healing"],
        "selectors": [".modal", ".popup", "#overlay"]
    },
    "id": "reg-1704215091"
}
```

#### 5.1.2 starlight.pulse

**Direction:** Sentinel → Hub  
**Purpose:** Heartbeat signal to indicate Sentinel is alive.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| layer | string | YES | Name of the Sentinel |

### 5.2 Intent Methods

#### 5.2.1 starlight.intent

**Direction:** Intent → Hub  
**Purpose:** Issue a command or goal to the Hub.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cmd | string | NO* | Command type: `goto`, `click`, `fill`, `clear` |
| goal | string | NO* | Semantic goal description |
| selector | string | NO | CSS/XPath selector for target element |
| value | string | NO | Value for `fill` commands |
| stabilityHint | integer | NO | Recorded stability time in milliseconds |

*At least one of `cmd` or `goal` MUST be provided.

**Example (Command):**
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.intent",
    "params": {
        "cmd": "click",
        "selector": "#submit-btn",
        "stabilityHint": 450
    },
    "id": "intent-1704215092"
}
```

**Example (Semantic Goal):**
```json
{
    "jsonrpc": "2.0",
    "method": "starlight.intent",
    "params": {
        "goal": "INITIATE CHECKOUT"
    },
    "id": "intent-1704215093"
}
```

### 5.3 Handshake Methods

#### 5.3.1 starlight.pre_check

**Direction:** Hub → Sentinel  
**Purpose:** Request environmental assessment before action execution.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| command | object | YES | The pending intent |
| blocking | array[object] | NO | Elements matching Sentinel's selectors |
| screenshot | string | NO | Base64-encoded screenshot |
| url | string | NO | Current page URL |

#### 5.3.2 starlight.clear

**Direction:** Sentinel → Hub  
**Purpose:** Approve action execution.  
**Required:** YES

**Parameters:** None required.

#### 5.3.3 starlight.wait

**Direction:** Sentinel → Hub  
**Purpose:** Veto action execution due to environmental instability.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| retryAfterMs | integer | NO | Suggested retry delay in milliseconds |

#### 5.3.4 starlight.hijack

**Direction:** Sentinel → Hub  
**Purpose:** Request exclusive browser control.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| reason | string | YES | Human-readable explanation |

#### 5.3.5 starlight.resume

**Direction:** Sentinel → Hub  
**Purpose:** Release browser control after hijack.  
**Required:** YES

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| re_check | boolean | NO | Whether Hub should re-run PRE_CHECK (default: true) |

### 5.4 Action Methods

#### 5.4.1 starlight.action

**Direction:** Sentinel → Hub  
**Purpose:** Request the Hub to perform a browser action during hijack.  
**Required:** NO (only during hijack)

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cmd | string | YES | Action: `click`, `fill`, `hide` |
| selector | string | YES | Target element selector |
| text | string | NO | Text for `fill` actions |

### 5.5 Context Methods

#### 5.5.1 starlight.context_update

**Direction:** Sentinel → Hub  
**Purpose:** Inject data into sovereign state.  
**Required:** NO

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| context | object | YES | Key-value pairs to merge into state |

#### 5.5.2 starlight.entropy_stream

**Direction:** Hub → Sentinel  
**Purpose:** Broadcast environmental entropy data.  
**Required:** NO

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| entropy | boolean | YES | Whether entropy was detected |
| mutationCount | integer | NO | Number of DOM mutations |
| networkPending | integer | NO | Number of pending network requests |

### 5.6 Lifecycle Methods

#### 5.6.1 starlight.finish

**Direction:** Intent → Hub  
**Purpose:** Signal mission completion.  
**Required:** NO

---

## 6. Lifecycle

### 6.1 Connection Lifecycle

1. Sentinel connects to Hub via WebSocket
2. Sentinel sends `starlight.registration`
3. Hub acknowledges and adds Sentinel to active registry
4. Sentinel begins sending `starlight.pulse` heartbeats
5. On disconnect, Hub removes Sentinel from registry

### 6.2 Handshake Lifecycle

```
Intent                    Hub                     Sentinels
   |                        |                          |
   |-- starlight.intent --> |                          |
   |                        |-- starlight.pre_check -->|
   |                        |                          |
   |                        |<-- starlight.clear ------|  (Pulse)
   |                        |<-- starlight.clear ------|  (Data)
   |                        |<-- starlight.hijack -----|  (Janitor)
   |                        |                          |
   |                        |   [Browser control       |
   |                        |    yielded to Janitor]   |
   |                        |                          |
   |                        |<-- starlight.action -----|
   |                        |<-- starlight.resume -----|
   |                        |                          |
   |                        |-- starlight.pre_check -->|  (Re-check)
   |                        |<-- starlight.clear ------|
   |                        |                          |
   |                        |   [Execute action]       |
   |                        |                          |
   |<-- result -------------|                          |
```

### 6.3 Priority Resolution

When multiple Sentinels respond:
1. If ANY Sentinel sends `starlight.hijack`, Hub MUST yield control (highest priority first)
2. If ANY Sentinel sends `starlight.wait` and none send `hijack`, Hub MUST pause
3. If ALL Sentinels send `starlight.clear`, Hub MUST proceed with execution

---

## 7. Compliance Requirements

### 7.1 Hub Requirements

A compliant Hub implementation MUST:
- Accept WebSocket connections on a configurable port
- Implement all REQUIRED protocol methods
- Maintain a registry of connected Sentinels
- Execute the handshake lifecycle before every action
- Support the priority resolution algorithm
- Maintain a mission trace for debugging

A compliant Hub SHOULD:
- Provide a `/health` HTTP endpoint
- Support semantic goal resolution
- Implement sovereign state management
- Generate execution reports

### 7.2 Sentinel Requirements

A compliant Sentinel implementation MUST:
- Connect to Hub via WebSocket
- Send `starlight.registration` on connect
- Send periodic `starlight.pulse` heartbeats
- Respond to `starlight.pre_check` with one of: `clear`, `wait`, `hijack`
- Release control via `starlight.resume` after hijack

A compliant Sentinel SHOULD:
- Implement graceful shutdown with state persistence
- Support configuration via external file

### 7.3 Compliance Levels

**Level 1 (Core):** Implements all REQUIRED methods  
**Level 2 (Extended):** Level 1 + context methods + entropy stream  
**Level 3 (Full):** Level 2 + semantic goals + self-healing

---

## 8. Security Considerations

### 8.1 Transport Security

Implementations SHOULD support WSS (WebSocket Secure) for production deployments.

### 8.2 Authentication

This specification does not define authentication. Implementations MAY add authentication tokens to the registration message.

### 8.3 Data Sensitivity

The `starlight.pre_check` message MAY contain screenshots. Implementations MUST handle these securely and SHOULD implement PII scrubbing.

---

## 9. IANA Considerations

This specification does not require any IANA registrations.

---

## Appendix A: Reference Implementation

The reference implementation is available at:
https://github.com/godhiraj-code/cba

Components:
- **Hub:** `src/hub.js` (Node.js)
- **Sentinel SDK:** `sdk/starlight_sdk.py` (Python)
- **Example Sentinels:** `sentinels/` directory

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-02 | Initial specification |

---

*The Starlight Protocol — Because the path should always be clear.*
