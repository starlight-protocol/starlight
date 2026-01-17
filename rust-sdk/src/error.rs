//! Error types for the Starlight SDK.

use thiserror::Error;

/// Result type for Starlight SDK operations.
pub type Result<T> = std::result::Result<T, Error>;

/// Errors that can occur in the Starlight SDK.
#[derive(Error, Debug)]
pub enum Error {
    /// WebSocket connection error
    #[error("WebSocket connection error: {0}")]
    Connection(#[from] tokio_tungstenite::tungstenite::Error),

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// JWT error
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    /// Protocol error from Hub
    #[error("Protocol error: {message}")]
    Protocol { code: i32, message: String },

    /// Connection closed unexpectedly
    #[error("Connection closed: {0}")]
    ConnectionClosed(String),

    /// Timeout waiting for response
    #[error("Timeout waiting for response")]
    Timeout,

    /// Not connected to Hub
    #[error("Not connected to Hub")]
    NotConnected,

    /// Invalid configuration
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    /// Sentinel already running
    #[error("Sentinel already running")]
    AlreadyRunning,

    /// Channel send error
    #[error("Internal channel error")]
    ChannelError,

    /// Mutual handshake failure
    #[error("Handshake error: {0}")]
    Handshake(String),
}
