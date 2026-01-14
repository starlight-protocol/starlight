# 🛰️ Starlight Java SDK

Official Java SDK for the Starlight Protocol - An Open Standard for Autonomous Browser Automation.

[![Maven Central](https://img.shields.io/maven-central/v/io.starlight.protocol/starlight-sdk.svg)](https://search.maven.org/artifact/io.starlight.protocol/starlight-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Java Version](https://img.shields.io/badge/Java-17%2B-blue.svg)](https://openjdk.org)

## Installation

### Maven
```xml
<dependency>
    <groupId>io.starlight.protocol</groupId>
    <artifactId>starlight-sdk</artifactId>
    <version>1.0.0</version>
</dependency>
```

### Gradle
```groovy
implementation 'io.starlight.protocol:starlight-sdk:1.0.0'
```

## Quick Start

```java
import io.starlight.protocol.Sentinel;
import java.util.List;

public class MySentinel {
    public static void main(String[] args) throws Exception {
        Sentinel sentinel = new Sentinel("MySentinel", 5)
                .withSelectors(List.of(".modal", ".popup"))
                .withCapabilities(List.of("detection", "healing"))
                .onPreCheck((params, ctx) -> {
                    if (!params.getBlocking().isEmpty()) {
                        ctx.hijack("Clearing obstacles");
                    } else {
                        ctx.clear();
                    }
                });

        sentinel.start("ws://localhost:8080");
    }
}
```

## Features

- ✅ **Full Protocol Compliance** - Implements Starlight Protocol v1.0.0
- ✅ **Auto-Reconnection** - Automatic reconnection with configurable delay
- ✅ **JWT Authentication** - Built-in token generation and validation
- ✅ **Fluent Builder API** - Chain configuration methods
- ✅ **Async Support** - `startAsync()` returns `CompletableFuture`
- ✅ **Thread-Safe** - Synchronized WebSocket operations

## Configuration

```java
Sentinel sentinel = new Sentinel("MySentinel", 5)
        // Monitoring configuration
        .withSelectors(List.of(".modal", ".popup", ".cookie-banner"))
        .withCapabilities(List.of("detection", "healing", "vision"))
        
        // Authentication
        .withAuthSecret("your-shared-secret")  // Auto-generates JWT
        // or
        .withAuthToken("eyJhbGciOiJIUzI1NiI...")  // Use existing token
        
        // Connection timing
        .withHeartbeatInterval(Duration.ofSeconds(2))
        .withReconnectDelay(Duration.ofSeconds(3));
```

## Handling Pre-Check Requests

The `onPreCheck` callback receives:
- `PreCheckParams` - Information about the pending command and blocking elements
- `ResponseContext` - Methods to respond to the Hub

```java
sentinel.onPreCheck((params, ctx) -> {
    // Access command details
    System.out.println("Command: " + params.getCommand().getCmd());
    System.out.println("Goal: " + params.getCommand().getGoal());
    
    // Check for blocking elements
    for (BlockingElement elem : params.getBlocking()) {
        System.out.println("Blocking: " + elem.getSelector());
    }
    
    // Access screenshot if available (base64 encoded)
    if (params.getScreenshot() != null) {
        // Process screenshot for visual analysis
    }
    
    // Respond with one of:
    ctx.clear();                    // Approve execution
    ctx.wait(500);                  // Retry after 500ms
    ctx.hijack("reason");           // Take browser control
});
```

## Hijack Mode

When in hijack mode, you can send actions to the Hub:

```java
sentinel.onPreCheck((params, ctx) -> {
    if (!params.getBlocking().isEmpty()) {
        ctx.hijack("Clearing obstacles");
        
        // Clear each blocking element
        for (BlockingElement elem : params.getBlocking()) {
            sentinel.sendAction("hide", elem.getSelector());
        }
        
        // Release control
        sentinel.sendResume(true);  // true = re-run pre-check
    } else {
        ctx.clear();
    }
});
```

## Async Start

```java
CompletableFuture<Void> future = sentinel.startAsync("ws://localhost:8080");

// Do other work...

// Wait for completion or handle errors
future.exceptionally(e -> {
    System.err.println("Sentinel error: " + e.getMessage());
    return null;
});
```

## Shutdown

```java
// Graceful shutdown
Runtime.getRuntime().addShutdownHook(new Thread(sentinel::stop));

// Or call directly
sentinel.stop();
```

## Building from Source

```bash
cd java-sdk
mvn clean install
```

## Running the Example

```bash
# With Maven
mvn exec:java -Dexec.mainClass="io.starlight.protocol.examples.SimpleSentinel"

# Or after building
java -cp target/starlight-sdk-1.0.0.jar:target/dependency/* \
     io.starlight.protocol.examples.SimpleSentinel
```

## Protocol Specification

This SDK implements the [Starlight Protocol v1.0.0](https://github.com/starlight-protocol/starlight/blob/main/spec/STARLIGHT_PROTOCOL_SPEC_v1.0.0.md).

## Requirements

- Java 17 or higher
- Maven 3.6+ (for building)

## License

MIT License - see [LICENSE](./LICENSE)

---

Built with ❤️ for the Starlight Protocol
