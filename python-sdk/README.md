# Starlight Protocol Python SDK

[![PyPI version](https://img.shields.io/pypi/v/starlight-protocol.svg)](https://pypi.org/project/starlight-protocol/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Python SDK for building **Sentinels** that connect to the Starlight Protocol Hub.

## Installation

```bash
pip install starlight-protocol
```

## Quick Start

### 🚀 New in v1.3 Series: Protocol Resilience & Extended Actions
- **Protocol Resilience**: Support for Phase 14 Hub features (Generic Perception, Self-Healing).
- **Extended Commands**: Native support for scroll, hover, check/uncheck, select, press, type.
- **Enterprise Security**: JWT-ready Sentinel base class.

Create a custom Sentinel in just a few lines:

```python
from starlight_protocol import SentinelBase

class MySentinel(SentinelBase):
    def __init__(self):
        super().__init__(
            layer_name="MySentinel",
            priority=5,
            capabilities=["custom-detection"]
        )
    
    async def on_pre_check(self, params, msg_id):
        # Called before each Hub action
        blocking = params.get("blocking", [])
        
        if self.should_intervene(blocking):
            await self.send_hijack("Custom obstacle detected")
            await self.send_action("click", "#close-button")
            await self.send_resume()
        else:
            await self.send_clear()
    
    def should_intervene(self, blocking):
        # Your custom detection logic
        return any(b.get("className", "").find("custom-modal") >= 0 for b in blocking)

# Run the Sentinel
if __name__ == "__main__":
    sentinel = MySentinel()
    sentinel.run()
```

## Core Classes

### `SentinelBase`

Abstract base class for all Sentinels.

```python
class SentinelBase:
    def __init__(
        self,
        layer_name: str,      # Unique identifier (e.g., "JanitorSentinel")
        priority: int,        # 1-10, lower = higher priority
        uri: str = "ws://localhost:8080",  # Hub WebSocket URL
        capabilities: list = None,  # ["stability", "obstacle-removal", "vision"]
        selectors: list = None,     # CSS selectors to monitor
    )
```

### Methods to Override

| Method | When Called | Purpose |
|--------|-------------|---------|
| `on_pre_check(params, msg_id)` | Before each Hub action | Decide to clear, wait, or hijack |
| `on_message(msg)` | Any message received | Custom message handling |

### Methods to Call

| Method | Purpose |
|--------|---------|
| `send_clear()` | Signal all-clear to Hub |
| `send_wait(delay_ms, reason)` | Request Hub to wait |
| `send_hijack(reason)` | Take exclusive control |
| `send_action(action, selector, **kwargs)` | Execute browser action during hijack |
| `send_resume(re_check=False)` | Return control to Hub |

## Built-in Sentinels

The package includes reference Sentinel implementations:

```python
from starlight_protocol.sentinels import PulseSentinel, JanitorSentinel

# Stability monitoring
pulse = PulseSentinel()
pulse.run()

# Obstacle removal
janitor = JanitorSentinel()
janitor.run()
```

## Protocol Compliance

This SDK implements [Starlight Protocol v1.0.0](https://github.com/starlight-protocol/starlight/blob/main/spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md).

### Certification

Test your Sentinel with the TCK Validator:

```bash
# Start validator
node validator/starlight_validator.js

# Run your Sentinel
python -m starlight_protocol.my_sentinel
```

## Configuration

Sentinels automatically load `config.json` from the project root:

```json
{
  "sentinel": {
    "reconnectDelay": 3,
    "heartbeatInterval": 2
  },
  "security": {
    "authToken": "your-secret-token"
  }
}
```

## License

MIT - See [LICENSE](LICENSE)
