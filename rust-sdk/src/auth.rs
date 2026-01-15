//! JWT authentication for Starlight Protocol.

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, TokenData, Validation};
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// JWT claims for Starlight authentication.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (Sentinel name)
    pub sub: String,
    
    /// Issued at (Unix timestamp)
    pub iat: i64,
    
    /// Expiration (Unix timestamp)
    pub exp: i64,
    
    /// Issuer
    #[serde(default)]
    pub iss: Option<String>,
    
    /// Additional claims
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

/// JWT handler for generating and validating tokens.
#[derive(Clone)]
pub struct JwtHandler {
    secret: String,
    expires_in_seconds: i64,
}

impl JwtHandler {
    /// Create a new JWT handler with the given secret.
    ///
    /// # Arguments
    /// * `secret` - Secret key for signing tokens (min 32 characters recommended)
    ///
    /// # Example
    /// ```
    /// use starlight::JwtHandler;
    ///
    /// let handler = JwtHandler::new("my-super-secret-key-at-least-32-chars");
    /// ```
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into(),
            expires_in_seconds: 3600, // 1 hour default
        }
    }

    /// Set token expiration time in seconds.
    pub fn with_expiry(mut self, seconds: i64) -> Self {
        self.expires_in_seconds = seconds;
        self
    }

    /// Generate a JWT token for the given subject (Sentinel name).
    ///
    /// # Arguments
    /// * `subject` - The Sentinel name to encode in the token
    ///
    /// # Returns
    /// A signed JWT token string
    ///
    /// # Example
    /// ```
    /// use starlight::JwtHandler;
    ///
    /// let handler = JwtHandler::new("secret");
    /// let token = handler.generate_token("MySentinel").unwrap();
    /// ```
    #[allow(clippy::result_large_err)]
    pub fn generate_token(&self, subject: impl Into<String>) -> Result<String> {
        let now = Utc::now();
        let exp = now + Duration::seconds(self.expires_in_seconds);

        let claims = Claims {
            sub: subject.into(),
            iat: now.timestamp(),
            exp: exp.timestamp(),
            iss: Some("starlight-rust-sdk".to_string()),
            extra: std::collections::HashMap::new(),
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )?;

        Ok(token)
    }

    /// Verify and decode a JWT token.
    ///
    /// # Arguments
    /// * `token` - The JWT token to verify
    ///
    /// # Returns
    /// The decoded claims if valid
    ///
    /// # Errors
    /// Returns an error if the token is invalid or expired
    #[allow(clippy::result_large_err)]
    pub fn verify_token(&self, token: &str) -> Result<Claims> {
        let mut validation = Validation::default();
        validation.set_required_spec_claims(&["exp", "sub"]);

        let token_data: TokenData<Claims> = decode(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &validation,
        )?;

        Ok(token_data.claims)
    }

    /// Refresh a token by generating a new one with the same subject.
    ///
    /// # Arguments
    /// * `token` - The existing token to refresh
    ///
    /// # Returns
    /// A new token with extended expiration
    #[allow(clippy::result_large_err)]
    pub fn refresh_token(&self, token: &str) -> Result<String> {
        let claims = self.verify_token(token)?;
        self.generate_token(claims.sub)
    }
}

impl Default for JwtHandler {
    fn default() -> Self {
        Self::new("starlight-default-secret-not-for-production")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_and_verify() {
        let handler = JwtHandler::new("test-secret-key-32-characters-long");
        let token = handler.generate_token("TestSentinel").unwrap();
        
        assert!(!token.is_empty());
        
        let claims = handler.verify_token(&token).unwrap();
        assert_eq!(claims.sub, "TestSentinel");
    }

    #[test]
    fn test_expired_token() {
        // Use -60 seconds to ensure the token is definitely expired
        // (jsonwebtoken has a default leeway of 60 seconds for clock skew)
        let handler = JwtHandler::new("test-secret").with_expiry(-120);
        let token = handler.generate_token("TestSentinel").unwrap();
        
        let result = handler.verify_token(&token);
        assert!(result.is_err(), "Expected expired token to fail verification");
    }

    #[test]
    fn test_refresh_token() {
        let handler = JwtHandler::new("test-secret-key-32-characters-long");
        let original = handler.generate_token("TestSentinel").unwrap();
        let refreshed = handler.refresh_token(&original).unwrap();
        
        // Both tokens should be valid
        let original_claims = handler.verify_token(&original).unwrap();
        let refreshed_claims = handler.verify_token(&refreshed).unwrap();
        
        // Both should have the same subject
        assert_eq!(original_claims.sub, "TestSentinel");
        assert_eq!(refreshed_claims.sub, "TestSentinel");
        
        // Refreshed token should have same or later expiration
        assert!(refreshed_claims.exp >= original_claims.exp);
    }
}
