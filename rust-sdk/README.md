# Starlight Protocol SDK for Rust

A production-ready Rust SDK for building Sentinels that integrate with the Starlight Protocol for autonomous browser automation.

## Features

- 🦀 **Async-first**: Built on tokio for high-performance async I/O
- 🔒 **Type-safe**: Strong Rust typing for all protocol messages
- 🔄 **Auto-reconnect**: Automatic reconnection with exponential backoff
- 🔐 **JWT Authentication**: Secure token-based authentication
- ✅ **Protocol Compliant**: Full JSON-RPC 2.0 and Starlight Protocol v1.0.0 support

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
starlight = { path = "../rust-sdk" }  # Use crates.io version when published
tokio = { version = "1", features = ["full"] }
async-trait = "0.1"
```

## Quick Start

```rust
use starlight::{Sentinel, SentinelConfig, SentinelHandler, PreCheckParams, PreCheckResponse};

struct MyHandler;

#[async_trait::async_trait]
impl SentinelHandler for MyHandler {
    async fn on_pre_check(&self, params: PreCheckParams) -> PreCheckResponse {
        if params.blocking.is_empty() {
            PreCheckResponse::Clear
        } else {
            PreCheckResponse::Hijack {
                reason: "Detected obstacles".to_string()
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = SentinelConfig::new("MySentinel", 5)
        .with_capabilities(vec!["detection", "healing"])
        .with_selectors(vec![".popup", ".modal"]);

    let mut sentinel = Sentinel::new(config, MyHandler);
    sentinel.connect("ws://localhost:8080").await?;
    sentinel.run().await?;
    
    Ok(())
}
```

## SentinelConfig Options

```rust
let config = SentinelConfig::new("MySentinel", 5)
    // Add capabilities this Sentinel provides
    .with_capabilities(vec!["detection", "healing", "vision"])
    
    // CSS selectors to monitor for obstacles
    .with_selectors(vec![".popup", ".modal", ".cookie-banner"])
    
    // JWT secret for Hub authentication
    .with_jwt_secret("your-secret-key")
    
    // Disable auto-reconnect
    .without_auto_reconnect();
```

## Handling Pre-Checks

The `on_pre_check` method is called when the Hub is about to execute a command. You can:

### Clear (Allow Command)
```rust
PreCheckResponse::Clear
```

### Wait (Retry Later)
```rust
PreCheckResponse::Wait {
    retry_after_ms: 1000,
    reason: Some("Page still loading".to_string()),
}
```

### Hijack (Take Control)
```rust
PreCheckResponse::Hijack {
    reason: "Need to clear popup first".to_string(),
}
```

## Actions During Hijack

When your Sentinel hijacks control, you can execute actions:

```rust
// Click an element
sentinel.action(ActionCommand::Click, ".dismiss-btn", None).await?;

// Fill a text input
sentinel.action(ActionCommand::Fill, "#email", Some("test@example.com".to_string())).await?;

// Hide an element
sentinel.action(ActionCommand::Hide, ".popup", None).await?;

// Resume and request re-check
sentinel.resume(true).await?;
```

## JWT Authentication

```rust
use starlight::JwtHandler;

let jwt = JwtHandler::new("your-secret-key")
    .with_expiry(3600); // 1 hour

let token = jwt.generate_token("MySentinel")?;
let claims = jwt.verify_token(&token)?;
```

## Running the Example

1. Start the Starlight Hub:
```bash
cd .. && node src/hub.js
```

2. Run the example Sentinel:
```bash
cargo run --example simple_sentinel
```

3. Set a custom Hub URL:
```bash
STARLIGHT_HUB_URL=ws://192.168.1.100:8080 cargo run --example simple_sentinel
```

## Protocol Compliance

This SDK implements:

| Message Type | Direction | Supported |
|--------------|-----------|-----------|
| `starlight.registration` | Sentinel → Hub | ✅ |
| `starlight.pre_check` | Hub → Sentinel | ✅ |
| `starlight.clear` | Sentinel → Hub | ✅ |
| `starlight.wait` | Sentinel → Hub | ✅ |
| `starlight.hijack` | Sentinel → Hub | ✅ |
| `starlight.action` | Sentinel → Hub | ✅ |
| `starlight.resume` | Sentinel → Hub | ✅ |
| `starlight.entropy` | Hub → Sentinel | ✅ |
| `starlight.context_update` | Hub → Sentinel | ✅ |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please see the [Starlight Protocol repository](https://github.com/starlight-protocol/starlight) for guidelines.
