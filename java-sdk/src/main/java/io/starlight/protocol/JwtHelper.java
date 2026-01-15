package io.starlight.protocol;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Date;

/**
 * JWT helper for generating and validating authentication tokens.
 */
public class JwtHelper {
    
    private static final String ALGORITHM = "HmacSHA256";
    
    /**
     * Generate a JWT token for authentication.
     *
     * @param secret The shared secret key
     * @param subject The subject (typically sentinel name)
     * @param expirySeconds Token validity in seconds
     * @return The generated JWT token
     */
    public static String generateToken(String secret, String subject, long expirySeconds) {
        SecretKey key = Keys.hmacShaKeyFor(padSecret(secret).getBytes(StandardCharsets.UTF_8));
        
        Date now = new Date();
        Date expiry = new Date(now.getTime() + (expirySeconds * 1000));
        
        return Jwts.builder()
                .subject(subject)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }
    
    /**
     * Validate a JWT token and return the subject.
     *
     * @param token The JWT token to validate
     * @param secret The shared secret key
     * @return The subject from the token
     * @throws Exception If the token is invalid or expired
     */
    public static String validateToken(String token, String secret) throws Exception {
        SecretKey key = Keys.hmacShaKeyFor(padSecret(secret).getBytes(StandardCharsets.UTF_8));
        
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }
    
    /**
     * Check if a token is expired without full validation.
     */
    public static boolean isExpired(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return true;
            
            String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            // Simple check - in production, use proper JSON parsing
            if (payload.contains("\"exp\":")) {
                int expStart = payload.indexOf("\"exp\":") + 6;
                int expEnd = payload.indexOf(",", expStart);
                if (expEnd == -1) expEnd = payload.indexOf("}", expStart);
                long exp = Long.parseLong(payload.substring(expStart, expEnd).trim());
                return System.currentTimeMillis() / 1000 > exp;
            }
            return true;
        } catch (Exception e) {
            return true;
        }
    }
    
    /**
     * Pad secret to minimum 256 bits for HMAC-SHA256.
     */
    private static String padSecret(String secret) {
        if (secret.length() >= 32) {
            return secret;
        }
        StringBuilder sb = new StringBuilder(secret);
        while (sb.length() < 32) {
            sb.append(secret);
        }
        return sb.substring(0, 32);
    }
}
