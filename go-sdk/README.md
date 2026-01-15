# 🛰️ Starlight Go SDK

Official Go SDK for the Starlight Protocol - An Open Standard for Autonomous Browser Automation.

[![Go Reference](https://pkg.go.dev/badge/github.com/starlight-protocol/starlight-go.svg)](https://pkg.go.dev/github.com/starlight-protocol/starlight-go)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
go get github.com/starlight-protocol/starlight-go
```

## Quick Start

```go
package main

import (
    "context"
    "log"
    
    "github.com/starlight-protocol/starlight-go/starlight"
)

func main() {
    // Create a new sentinel
    sentinel := starlight.NewSentinel("MySentinel", 5)
    
    // Configure what this sentinel monitors
    sentinel.Selectors = []string{".modal", ".popup", ".cookie-banner"}
    
    // Handle pre-check requests from Hub
    sentinel.OnPreCheck = func(params starlight.PreCheckParams, msgID string) error {
        if len(params.Blocking) > 0 {
            // Found obstacles - request hijack to clear them
            return sentinel.SendHijack(msgID, "Clearing obstacles")
        }
        // All clear - approve execution
        return sentinel.SendClear(msgID)
    }
    
    // Connect and run
    ctx := context.Background()
    if err := sentinel.Start(ctx, "ws://localhost:8080"); err != nil {
        log.Fatal(err)
    }
}
```

## Features

- ✅ **Full Protocol Compliance** - Implements Starlight Protocol v1.0.0
- ✅ **Auto-Reconnection** - Automatically reconnects on connection loss
- ✅ **JWT Authentication** - Built-in token generation and validation
- ✅ **Goroutine-Safe** - Thread-safe operations with proper locking
- ✅ **Context-Aware** - Supports graceful shutdown via context cancellation
- ✅ **Zero External Dependencies** - Only stdlib + gorilla/websocket

## Protocol Methods

| Method | Description |
|--------|-------------|
| `SendClear(msgID)` | Approve action execution |
| `SendWait(msgID, ms)` | Veto action, retry after delay |
| `SendHijack(msgID, reason)` | Request browser control |
| `SendResume(reCheck)` | Release browser control |
| `SendAction(cmd, selector, text)` | Execute browser action during hijack |
| `SendContextUpdate(ctx)` | Update sovereign state |

## Authentication

If the Hub requires authentication:

```go
// Using a shared secret (generates JWT automatically)
sentinel.WithAuth("your-shared-secret", true)

// Or using a pre-generated token
sentinel.WithAuth("eyJhbGciOiJIUzI1NiI...", false)
```

## Configuration

```go
sentinel := starlight.NewSentinel("MySentinel", 5)

// Set monitoring selectors
sentinel.Selectors = []string{".modal", ".popup"}

// Set capabilities
sentinel.Capabilities = []string{"detection", "healing", "vision"}

// Customize timing
sentinel.HeartbeatInterval = 2 * time.Second
sentinel.ReconnectDelay = 3 * time.Second

// Custom logger
sentinel.Logger = log.New(os.Stdout, "[Sentinel] ", log.LstdFlags)
```

## Handling Pre-Check

The `OnPreCheck` callback is where your sentinel logic lives:

```go
sentinel.OnPreCheck = func(params starlight.PreCheckParams, msgID string) error {
    // Access command details
    log.Printf("Command: %s, Goal: %s", params.Command.Cmd, params.Command.Goal)
    
    // Check for blocking elements
    for _, elem := range params.Blocking {
        log.Printf("Blocking: %s (%s)", elem.Selector, elem.Text)
    }
    
    // Access screenshot if vision processing needed
    if params.Screenshot != "" {
        // Base64-encoded screenshot available
    }
    
    // Decide response:
    // - SendClear(msgID) - approve execution
    // - SendWait(msgID, 500) - retry after 500ms
    // - SendHijack(msgID, "reason") - take control
    
    return sentinel.SendClear(msgID)
}
```

## Examples

See the [examples](./examples) directory for complete examples:

- `simple_sentinel/` - Basic sentinel with obstacle detection
- `vision_sentinel/` - AI-powered visual analysis (coming soon)
- `chaos_sentinel/` - Chaos engineering sentinel (coming soon)

## Protocol Specification

This SDK implements the [Starlight Protocol v1.0.0](https://github.com/starlight-protocol/starlight/blob/main/spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md).

## License

MIT License - see [LICENSE](./LICENSE)

---

Built with ❤️ for the Starlight Protocol
