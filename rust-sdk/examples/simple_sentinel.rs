//! Example: Simple Sentinel
//!
//! A basic Sentinel that demonstrates the Starlight Protocol SDK.
//! 
//! Run with: `cargo run --example simple_sentinel`

use std::collections::HashMap;
use std::env;

use starlight::{
    PreCheckParams, PreCheckResponse, Sentinel, SentinelConfig, SentinelHandler,
    EntropyParams,
};
use tracing::{info, warn};

/// Custom handler for our Sentinel.
struct JanitorHandler {
    /// CSS selectors to look for
    blocking_patterns: Vec<String>,
}

impl JanitorHandler {
    fn new() -> Self {
        Self {
            blocking_patterns: vec![
                ".popup".to_string(),
                ".modal".to_string(),
                ".overlay".to_string(),
                ".cookie-banner".to_string(),
                ".newsletter-popup".to_string(),
                "[role=\"dialog\"]".to_string(),
            ],
        }
    }
}

#[async_trait::async_trait]
impl SentinelHandler for JanitorHandler {
    async fn on_pre_check(&self, params: PreCheckParams) -> PreCheckResponse {
        info!(
            "Pre-check received - command: {}, selector: {:?}",
            params.command,
            params.selector
        );

        // Check if any blocking elements were detected
        if !params.blocking.is_empty() {
            let selectors: Vec<_> = params.blocking.iter()
                .map(|b| b.selector.as_str())
                .collect();
            
            warn!("Blocking elements detected: {:?}", selectors);
            
            return PreCheckResponse::Hijack {
                reason: format!("Detected {} blocking elements", params.blocking.len()),
            };
        }

        // All clear
        info!("No obstacles detected, clearing");
        PreCheckResponse::Clear
    }

    async fn on_entropy(&self, params: EntropyParams) {
        info!(
            "Page state - URL: {}, Mutations: {}, Network pending: {}",
            params.url, params.mutations, params.network_pending
        );
    }

    async fn on_context_update(&self, context: HashMap<String, serde_json::Value>) {
        info!("Context update: {:?}", context);
    }

    async fn on_connect(&self) {
        info!("🚀 JanitorSentinel connected and ready!");
    }

    async fn on_disconnect(&self) {
        warn!("⚠️ JanitorSentinel disconnected");
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("starlight=debug".parse()?)
                .add_directive("simple_sentinel=debug".parse()?)
        )
        .init();

    // Get Hub URL from environment or use default
    let hub_url = env::var("STARLIGHT_HUB_URL")
        .unwrap_or_else(|_| "ws://localhost:8080".to_string());

    info!("Starting JanitorSentinel (Rust SDK)");
    info!("Connecting to Hub at: {}", hub_url);

    // Create Sentinel configuration
    let config = SentinelConfig::new("RustJanitorSentinel", 5)
        .with_capabilities(vec!["detection", "healing"])
        .with_selectors(vec![
            ".popup",
            ".modal",
            ".overlay",
            ".cookie-banner",
            ".newsletter-popup",
            "[role=\"dialog\"]",
        ]);

    // Create handler
    let handler = JanitorHandler::new();

    // Create and run Sentinel
    let mut sentinel = Sentinel::new(config, handler);
    
    // Connect to Hub
    sentinel.connect(&hub_url).await?;
    
    // Run message loop (blocks until stopped)
    info!("Sentinel running. Press Ctrl+C to stop.");
    
    sentinel.run().await?;

    info!("JanitorSentinel stopped");
    Ok(())
}
