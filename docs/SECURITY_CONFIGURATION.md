# 🔧 Starlight Protocol Security Configuration Reference

**Version:** 3.0.3  
**Date:** 2026-01-11  

Complete reference for all security-related configuration options in Starlight Protocol.

---

## Table of Contents

1. [Configuration Overview](#1-configuration-overview)
2. [Authentication Configuration](#2-authentication-configuration)
3. [Input Validation Settings](#3-input-validation-settings)
4. [Data Protection Options](#4-data-protection-options)
5. [Network Security Settings](#5-network-security-settings)
6. [Access Control Configuration](#6-access-control-configuration)
7. [Monitoring & Logging](#7-monitoring--logging)
8. [Environment-Specific Configs](#8-environment-specific-configs)
9. [Configuration Examples](#9-configuration-examples)
10. [Security Checklist](#10-security-checklist)

---

## 1. Configuration Overview

Starlight Protocol security configuration is centralized in `config.json` under the `security` section:

### Basic Structure
```json
{
    "security": {
        "authentication": { ... },
        "validation": { ... },
        "dataProtection": { ... },
        "network": { ... },
        "accessControl": { ... },
        "monitoring": { ... }
    },
    "hub": { ... },
    "sentinel": { ... }
}
```

### Configuration Priority
1. **Environment Variables** (highest priority)
2. **Configuration File** (`config.json`)
3. **Default Values** (lowest priority)

---

## 2. Authentication Configuration

### 2.1 JWT Settings

```json
{
    "security": {
        "authentication": {
            "enabled": true,
            "type": "jwt",
            "jwt": {
                "secret": "${JWT_SECRET}",
                "algorithm": "HS256",
                "expiresIn": 3600,
                "issuer": "starlight-protocol",
                "audience": "starlight-clients",
                "refreshEnabled": true,
                "refreshThreshold": 300,
                "clockSkewTolerance": 30,
                "jtiEnabled": true
            }
        }
    }
}
```

#### JWT Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable authentication |
| `type` | string | "jwt" | Authentication type (currently JWT only) |
| `secret` | string | null | JWT signing secret (256-bit minimum) |
| `algorithm` | string | "HS256" | JWT signing algorithm |
| `expiresIn` | integer | 3600 | Token expiration time (seconds) |
| `issuer` | string | "starlight-protocol" | JWT issuer claim |
| `audience` | string | "starlight-clients" | JWT audience claim |
| `refreshEnabled` | boolean | true | Enable token refresh |
| `refreshThreshold` | integer | 300 | Refresh before expiration (seconds) |
| `clockSkewTolerance` | integer | 30 | Clock skew tolerance (seconds) |
| `jtiEnabled` | boolean | true | Enable JWT ID claim |

### 2.2 Environment Variables

```bash
# JWT Configuration
export JWT_SECRET="your-256-bit-secret-here"
export JWT_EXPIRES_IN="3600"
export JWT_ALGORITHM="HS256"

# Alternative: File-based secret
export JWT_SECRET_FILE="/path/to/secret.txt"
```

### 2.3 Secret Generation

```bash
# Generate cryptographically secure secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using OpenSSL
openssl rand -hex 32

# Store in environment (recommended)
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

---

## 3. Input Validation Settings

### 3.1 Schema Validation Configuration

```json
{
    "security": {
        "validation": {
            "enabled": true,
            "strictMode": true,
            "schemas": {
                "base": {
                    "jsonrpc": { "type": "string", "enum": ["2.0"] },
                    "method": { "type": "string", "pattern": "^starlight\\.[a-z_]+$" },
                    "id": { "type": ["string", "number"] }
                },
                "limits": {
                    "maxStringLength": 2000,
                    "maxArrayLength": 100,
                    "maxObjectDepth": 10,
                    "maxMessageSize": 1048576
                }
            },
            "sanitization": {
                "escapeHtml": true,
                "removeScriptTags": true,
                "sanitizeSelectors": true,
                "normalizeUnicode": true
            }
        }
    }
}
```

#### Validation Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | true | Enable input validation |
| `strictMode` | boolean | true | Reject unknown properties |
| `maxStringLength` | integer | 2000 | Maximum string length |
| `maxArrayLength` | integer | 100 | Maximum array elements |
| `maxObjectDepth` | integer | 10 | Maximum object nesting |
| `maxMessageSize` | integer | 1048576 | Maximum message size (bytes) |
| `escapeHtml` | boolean | true | Escape HTML entities |
| `removeScriptTags` | boolean | true | Remove script tags |
| `sanitizeSelectors` | boolean | true | Sanitize CSS selectors |
| `normalizeUnicode` | boolean | true | Normalize Unicode strings |

### 3.2 Custom Validation Rules

```json
{
    "security": {
        "validation": {
            "customRules": [
                {
                    "method": "starlight.intent",
                    "field": "selector",
                    "pattern": "^[a-zA-Z0-9_\\-\\s#\\.\\[\\]>]+$",
                    "message": "Invalid selector format"
                },
                {
                    "method": "starlight.registration",
                    "field": "priority",
                    "min": 1,
                    "max": 10,
                    "message": "Priority must be between 1 and 10"
                }
            ]
        }
    }
}
```

---

## 4. Data Protection Options

### 4.1 PII Redaction Configuration

```json
{
    "security": {
        "dataProtection": {
            "piiRedaction": {
                "enabled": true,
                "mode": "redact",
                "patterns": {
                    "email": {
                        "enabled": true,
                        "pattern": "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
                        "replacement": "[EMAIL_REDACTED]"
                    },
                    "phone": {
                        "enabled": true,
                        "patterns": [
                            "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
                            "\\b\\+1[-.]?\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
                        ],
                        "replacement": "[PHONE_REDACTED]"
                    },
                    "creditCard": {
                        "enabled": true,
                        "pattern": "\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
                        "replacement": "[CREDITCARD_REDACTED]"
                    },
                    "ssn": {
                        "enabled": true,
                        "pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b",
                        "replacement": "[SSN_REDACTED]"
                    },
                    "jwt": {
                        "enabled": true,
                        "pattern": "eyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]*",
                        "replacement": "[JWT_REDACTED]"
                    },
                    "apiKey": {
                        "enabled": true,
                        "patterns": [
                            "(api[_-]?key|token)['\":\\s]*['\"]?([a-zA-Z0-9_-]{16,})",
                            "(bearer\\s+)([a-zA-Z0-9._-]+)"
                        ],
                        "replacement": "[API_KEY_REDACTED]"
                    }
                },
                "customPatterns": [
                    {
                        "name": "customId",
                        "pattern": "\\bID\\d{6,}\\b",
                        "replacement": "[ID_REDACTED]"
                    }
                ]
            }
        }
    }
}
```

#### PII Redaction Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | true | Enable PII redaction |
| `mode` | string | "redact" | Operation mode: "redact", "alert", "block" |
| `patterns.*.enabled` | boolean | true | Enable specific pattern |
| `patterns.*.replacement` | string | - | Replacement text for matches |
| `customPatterns` | array | [] | Custom redaction patterns |

### 4.2 Encryption Configuration

```json
{
    "security": {
        "dataProtection": {
            "encryption": {
                "enabled": true,
                "algorithm": "aes-256-gcm",
                "keyRotation": {
                    "enabled": true,
                    "interval": 86400000,
                    "keepOldKeys": 3
                },
                "storage": {
                    "encryptedFields": ["ssn", "creditCard", "password"],
                    "encryptedFiles": ["*.warp", "*.trace"],
                    "keyDerivation": {
                        "algorithm": "pbkdf2",
                        "iterations": 100000,
                        "saltLength": 32
                    }
                }
            }
        }
    }
}
```

---

## 5. Network Security Settings

### 5.1 SSL/TLS Configuration

```json
{
    "security": {
        "network": {
            "ssl": {
                "enabled": false,
                "certPath": "${SSL_CERT_PATH}",
                "keyPath": "${SSL_KEY_PATH}",
                "caPath": "${SSL_CA_PATH}",
                "passphrase": "${SSL_PASSPHRASE}",
                "rejectUnauthorized": true,
                "requestCert": false,
                "minVersion": "TLSv1.2",
                "maxVersion": "TLSv1.3",
                "ciphers": [
                    "ECDHE-ECDSA-AES256-GCM-SHA384",
                    "ECDHE-RSA-AES256-GCM-SHA384",
                    "ECDHE-ECDSA-CHACHA20-POLY1305",
                    "ECDHE-RSA-CHACHA20-POLY1305"
                ],
                "honorCipherOrder": true,
                "ecdhCurve": "secp384r1",
                "dhparam": {
                    "enabled": true,
                    "size": 2048
                }
            }
        }
    }
}
```

#### SSL Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | false | Enable SSL/TLS |
| `certPath` | string | null | Path to SSL certificate |
| `keyPath` | string | null | Path to SSL private key |
| `caPath` | string | null | Path to CA certificate |
| `passphrase` | string | null | Private key passphrase |
| `rejectUnauthorized` | boolean | true | Reject unauthorized certs |
| `requestCert` | boolean | false | Request client certs |
| `minVersion` | string | "TLSv1.2" | Minimum TLS version |
| `maxVersion` | string | "TLSv1.3" | Maximum TLS version |
| `ciphers` | array | [] | Allowed cipher suites |

### 5.2 Rate Limiting Configuration

```json
{
    "security": {
        "network": {
            "rateLimiting": {
                "enabled": true,
                "global": {
                    "maxRequests": 1000,
                    "windowMs": 60000,
                    "skipSuccessfulRequests": false,
                    "skipFailedRequests": false
                },
                "perClient": {
                    "maxRequests": 100,
                    "windowMs": 60000,
                    "maxConnections": 10,
                    "connectionWindowMs": 300000
                },
                "endpoints": {
                    "starlight.intent": {
                        "maxRequests": 50,
                        "windowMs": 60000
                    },
                    "starlight.registration": {
                        "maxRequests": 5,
                        "windowMs": 300000
                    }
                },
                "whitelist": [
                    "127.0.0.1",
                    "::1"
                ]
            }
        }
    }
}
```

---

## 6. Access Control Configuration

### 6.1 Role-Based Access Control (RBAC)

```json
{
    "security": {
        "accessControl": {
            "enabled": true,
            "type": "rbac",
            "defaultRole": "sentinel",
            "roles": {
                "admin": {
                    "permissions": ["*"],
                    "description": "Full system access",
                    "ipRestrictions": [],
                    "timeRestrictions": {}
                },
                "operator": {
                    "permissions": [
                        "starlight.intent",
                        "starlight.context_update",
                        "starlight.finish",
                        "starlight.entropy_stream"
                    ],
                    "description": "Intent execution access",
                    "ipRestrictions": ["192.168.1.0/24"],
                    "timeRestrictions": {
                        "allowedHours": ["09:00-17:00"],
                        "allowedDays": ["Mon", "Tue", "Wed", "Thu", "Fri"]
                    }
                },
                "viewer": {
                    "permissions": [
                        "starlight.pulse",
                        "starlight.entropy_stream",
                        "starlight.context_update"
                    ],
                    "description": "Read-only access",
                    "ipRestrictions": ["10.0.0.0/8"]
                },
                "sentinel": {
                    "permissions": [
                        "starlight.registration",
                        "starlight.pulse",
                        "starlight.pre_check",
                        "starlight.clear",
                        "starlight.wait",
                        "starlight.hijack",
                        "starlight.resume",
                        "starlight.action",
                        "starlight.context_update"
                    ],
                    "description": "Sentinel protocol access",
                    "ipRestrictions": []
                }
            }
        }
    }
}
```

### 6.2 Resource-Based Access Control

```json
{
    "security": {
        "accessControl": {
            "resources": {
                "domains": {
                    "test-sentinel": ["*.test.example.com", "localhost"],
                    "prod-sentinel": ["*.example.com", "*.api.example.com"],
                    "admin-sentinel": ["*"]
                },
                "methods": {
                    "restricted": {
                        "allowedRoles": ["admin", "operator"],
                        "methods": ["starlight.shutdown", "starlight.config"]
                    },
                    "public": {
                        "allowedRoles": ["*"],
                        "methods": ["starlight.pulse", "starlight.entropy_stream"]
                    }
                },
                "quota": {
                    "maxMissionDuration": 3600000,
                    "maxScreenshots": 100,
                    "maxTraceEvents": 1000,
                    "maxFileSize": 52428800
                }
            }
        }
    }
}
```

---

## 7. Monitoring & Logging

### 7.1 Security Monitoring Configuration

```json
{
    "security": {
        "monitoring": {
            "enabled": true,
            "events": {
                "authentication": {
                    "logAttempts": true,
                    "logSuccesses": true,
                    "logFailures": true,
                    "includeMetadata": true
                },
                "validation": {
                    "logErrors": true,
                    "logWarnings": true,
                    "includeStackTraces": false
                },
                "pii": {
                    "logDetections": true,
                    "logRedactions": true,
                    "includeCounts": true,
                    "includeTypes": true
                },
                "authorization": {
                    "logDenials": true,
                    "logGrants": false,
                    "includeResourceDetails": true
                }
            },
            "alerts": {
                "enabled": true,
                "channels": ["email", "slack", "webhook"],
                "thresholds": {
                    "failedAuthRate": 0.05,
                    "validationErrorRate": 0.01,
                    "rateLimitHitRate": 0.001,
                    "piiDetectionRate": 0.1
                },
                "email": {
                    "enabled": true,
                    "to": ["admin@example.com"],
                    "from": "security@starlight-protocol.org",
                    "smtp": {
                        "host": "${SMTP_HOST}",
                        "port": 587,
                        "secure": true,
                        "auth": {
                            "user": "${SMTP_USER}",
                            "pass": "${SMTP_PASS}"
                        }
                    }
                },
                "slack": {
                    "enabled": false,
                    "webhook": "${SLACK_WEBHOOK}",
                    "channel": "#security-alerts"
                },
                "webhook": {
                    "enabled": false,
                    "url": "${WEBHOOK_URL}",
                    "headers": {
                        "Authorization": "Bearer ${WEBHOOK_TOKEN}"
                    }
                }
            }
        }
    }
}
```

### 7.2 Audit Logging Configuration

```json
{
    "security": {
        "monitoring": {
            "audit": {
                "enabled": true,
                "retention": {
                    "days": 90,
                    "maxSize": "10GB"
                },
                "format": "json",
                "compression": true,
                "encryption": {
                    "enabled": true,
                    "key": "${AUDIT_ENCRYPTION_KEY}"
                },
                "fields": {
                    "timestamp": true,
                    "eventType": true,
                    "userId": true,
                    "sentinelId": true,
                    "ipAddress": true,
                    "userAgent": true,
                    "method": true,
                    "resource": true,
                    "result": true,
                    "details": true
                }
            }
        }
    }
}
```

---

## 8. Environment-Specific Configs

### 8.1 Development Configuration

```json
{
    "security": {
        "authentication": {
            "enabled": false,
            "jwt": {
                "secret": "dev-secret-do-not-use-in-production"
            }
        },
        "network": {
            "ssl": { "enabled": false },
            "rateLimiting": { "enabled": false }
        },
        "validation": {
            "strictMode": false,
            "maxMessageSize": 10485760
        },
        "dataProtection": {
            "piiRedaction": { "enabled": false },
            "encryption": { "enabled": false }
        },
        "monitoring": {
            "enabled": true,
            "alerts": { "enabled": false }
        }
    }
}
```

### 8.2 Production Configuration

```json
{
    "security": {
        "authentication": {
            "enabled": true,
            "jwt": {
                "secret": "${JWT_SECRET}",
                "expiresIn": 1800,
                "refreshEnabled": true
            }
        },
        "network": {
            "ssl": { 
                "enabled": true,
                "certPath": "/etc/ssl/certs/server.crt",
                "keyPath": "/etc/ssl/private/server.key",
                "minVersion": "TLSv1.2"
            },
            "rateLimiting": {
                "enabled": true,
                "global": {
                    "maxRequests": 10000,
                    "windowMs": 60000
                }
            }
        },
        "validation": {
            "enabled": true,
            "strictMode": true
        },
        "dataProtection": {
            "piiRedaction": { "enabled": true },
            "encryption": { "enabled": true }
        },
        "accessControl": {
            "enabled": true,
            "type": "rbac"
        },
        "monitoring": {
            "enabled": true,
            "alerts": {
                "enabled": true,
                "channels": ["email", "slack"]
            }
        }
    }
}
```

---

## 9. Configuration Examples

### 9.1 Minimal Secure Configuration

```json
{
    "security": {
        "authentication": {
            "enabled": true,
            "jwt": {
                "secret": "${JWT_SECRET}",
                "expiresIn": 3600
            }
        },
        "validation": {
            "enabled": true,
            "strictMode": true
        },
        "dataProtection": {
            "piiRedaction": {
                "enabled": true,
                "mode": "redact"
            }
        },
        "network": {
            "rateLimiting": {
                "enabled": true,
                "perClient": {
                    "maxRequests": 100,
                    "windowMs": 60000
                }
            }
        }
    }
}
```

### 9.2 Enterprise Configuration

```json
{
    "security": {
        "authentication": {
            "enabled": true,
            "jwt": {
                "secret": "${JWT_SECRET}",
                "expiresIn": 1800,
                "refreshEnabled": true,
                "clockSkewTolerance": 30
            }
        },
        "validation": {
            "enabled": true,
            "strictMode": true,
            "schemas": {
                "limits": {
                    "maxStringLength": 1000,
                    "maxMessageSize": 524288
                }
            }
        },
        "dataProtection": {
            "piiRedaction": {
                "enabled": true,
                "mode": "redact"
            },
            "encryption": {
                "enabled": true,
                "keyRotation": {
                    "enabled": true,
                    "interval": 86400000
                }
            }
        },
        "network": {
            "ssl": {
                "enabled": true,
                "certPath": "/etc/ssl/certs/server.crt",
                "keyPath": "/etc/ssl/private/server.key",
                "minVersion": "TLSv1.2"
            },
            "rateLimiting": {
                "enabled": true,
                "global": {
                    "maxRequests": 10000,
                    "windowMs": 60000
                }
            }
        },
        "accessControl": {
            "enabled": true,
            "type": "rbac",
            "defaultRole": "sentinel"
        },
        "monitoring": {
            "enabled": true,
            "alerts": {
                "enabled": true,
                "channels": ["email", "slack"],
                "thresholds": {
                    "failedAuthRate": 0.01,
                    "validationErrorRate": 0.005
                }
            }
        }
    }
}
```

---

## 10. Security Checklist

### 10.1 Pre-Deployment Checklist

- [ ] **Authentication**
  - [ ] JWT secret generated (256-bit minimum)
  - [ ] Secret not stored in version control
  - [ ] Token expiration configured
  - [ ] Token refresh enabled (production)

- [ ] **Input Validation**
  - [ ] Schema validation enabled
  - [ ] Strict mode enabled (production)
  - [ ] Size limits configured
  - [ ] Custom validation rules added

- [ ] **Data Protection**
  - [ ] PII redaction enabled
  - [ ] Encryption enabled for sensitive data
  - [ ] Key rotation configured
  - [ ] Data retention policies set

- [ ] **Network Security**
  - [ ] SSL/TLS enabled (production)
  - [ ] Valid certificates installed
  - [ ] Rate limiting configured
  - [ ] IP restrictions set if needed

- [ ] **Access Control**
  - [ ] RBAC enabled
  - [ ] Default role configured
  - [ ] Resource restrictions set
  - [ ] Time-based restrictions if needed

- [ ] **Monitoring**
  - [ ] Security logging enabled
  - [ ] Alert channels configured
  - [ ] Thresholds set appropriately
  - [ ] Audit retention configured

### 10.2 Runtime Verification

```bash
# Test authentication
curl -X POST http://localhost:8080/api/auth/test \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-secret"}'

# Test SSL configuration
openssl s_client -connect localhost:8080 -servername localhost

# Check rate limiting
for i in {1..150}; do
  curl -s http://localhost:8080/health || echo "Rate limited"
done

# Verify PII redaction
echo '{"email":"user@test.com"}' | curl -X POST \
  -H "Content-Type: application/json" \
  -d @- http://localhost:8080/api/redact
```

### 10.3 Monitoring Commands

```bash
# View authentication logs
tail -f logs/security.log | grep AUTH

# Monitor rate limiting
tail -f logs/security.log | grep RATE_LIMIT

# Check PII redaction
tail -f logs/security.log | grep PII

# SSL certificate validation
openssl x509 -in /etc/ssl/certs/server.crt -text -noout
```

---

## Conclusion

This configuration reference provides comprehensive options for securing Starlight Protocol deployments. Start with the minimal secure configuration and gradually enable additional features based on your security requirements and operational needs.

For production deployments, always use the enterprise configuration as a baseline and adjust according to your specific security policies and compliance requirements.

---

*Last updated: 2026-01-11*  
*Configuration schema version: 3.0.3*