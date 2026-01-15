//! # Starlight Protocol SDK for Rust
//!
//! A production-ready SDK for building Sentinels that integrate with the
//! Starlight Protocol for autonomous browser automation.
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use starlight::{Sentinel, SentinelConfig, PreCheckParams, PreCheckResponse};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = SentinelConfig::new("MySentinel", 5)
//!         .with_selectors(vec![".popup", ".modal"]);
//!
//!     let sentinel = Sentinel::new(config);
//!     sentinel.connect("ws://localhost:8080").await?;
//!     sentinel.run().await?;
//!     Ok(())
//! }
//! ```
//!
//! ## Features
//!
//! - **Async-first**: Built on tokio for high-performance async I/O
//! - **Type-safe**: Strong typing for all protocol messages
//! - **Auto-reconnect**: Automatic reconnection with exponential backoff
//! - **JWT Authentication**: Secure token-based authentication
//! - **Protocol Compliant**: Full JSON-RPC 2.0 and Starlight Protocol support

pub mod auth;
pub mod client;
pub mod error;
pub mod messages;
pub mod sentinel;

// Re-export main types for convenience
pub use auth::JwtHandler;
pub use client::WebSocketClient;
pub use error::{Error, Result};
pub use messages::{
    JsonRpcRequest, JsonRpcResponse, PreCheckParams, PreCheckResponse,
    RegistrationParams, ActionParams, HijackParams, EntropyParams, ActionCommand,
};
pub use sentinel::{Sentinel, SentinelConfig, SentinelHandler};

/// Protocol version
pub const PROTOCOL_VERSION: &str = "1.0.0";

/// SDK version
pub const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");
