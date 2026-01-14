package io.starlight.protocol.examples;

import io.starlight.protocol.Sentinel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Example Sentinel implementation demonstrating SDK usage.
 */
public class SimpleSentinel {
    
    private static final Logger log = LoggerFactory.getLogger(SimpleSentinel.class);
    
    public static void main(String[] args) {
        // Get Hub URL from args or use default
        String hubUrl = args.length > 0 ? args[0] : "ws://localhost:8080";
        
        // Create and configure sentinel
        Sentinel sentinel = new Sentinel("JavaExampleSentinel", 5)
                .withCapabilities(List.of("detection", "healing"))
                .withSelectors(List.of(".modal", ".popup", ".cookie-banner"))
                // .withAuthSecret("your-shared-secret")  // Uncomment if Hub requires auth
                .onPreCheck((params, ctx) -> {
                    log.info("Received pre-check for command: {}", params.getCommand());
                    
                    // Check for blocking elements
                    if (params.getBlocking() != null && !params.getBlocking().isEmpty()) {
                        log.info("Found {} blocking elements", params.getBlocking().size());
                        
                        // Request hijack to handle obstacles
                        ctx.hijack("Clearing blocking elements");
                        
                        // In a real implementation, you would:
                        // 1. Send action to clear each obstacle
                        // 2. Send resume when done
                        // For demo, we just clear immediately
                    } else {
                        // No obstacles, approve execution
                        ctx.clear();
                    }
                })
                .onEntropyStream((params) -> {
                    if (params.isEntropy()) {
                        log.debug("Entropy detected: {} mutations, {} pending requests",
                                params.getMutationCount(), params.getNetworkPending());
                    }
                });
        
        // Set up shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("Shutting down sentinel...");
            sentinel.stop();
        }));
        
        // Start sentinel
        log.info("Starting {} sentinel, connecting to {}", sentinel.getClass().getSimpleName(), hubUrl);
        
        try {
            sentinel.start(hubUrl);
        } catch (Exception e) {
            log.error("Sentinel error", e);
            System.exit(1);
        }
    }
}
