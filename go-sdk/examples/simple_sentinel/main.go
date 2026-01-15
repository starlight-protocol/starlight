// Package main demonstrates a simple Sentinel using the Starlight Go SDK.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/starlight-protocol/starlight-go/starlight"
)

func main() {
	// Create a new sentinel
	sentinel := starlight.NewSentinel("GoExampleSentinel", 5)

	// Configure capabilities and selectors
	sentinel.Capabilities = []string{"detection", "healing"}
	sentinel.Selectors = []string{".modal", ".popup", ".cookie-banner"}

	// Optional: Set authentication if Hub requires it
	// sentinel.WithAuth("your-jwt-secret", true)

	// Set up the pre-check handler
	sentinel.OnPreCheck = func(params starlight.PreCheckParams, msgID string) error {
		log.Printf("Received pre-check for command: %+v", params.Command)

		// Check for blocking elements
		if len(params.Blocking) > 0 {
			log.Printf("Found %d blocking elements", len(params.Blocking))

			// Request hijack to handle obstacles
			return sentinel.SendHijack(msgID, "Clearing blocking elements")
		}

		// No obstacles, approve execution
		return sentinel.SendClear(msgID)
	}

	// Optional: Handle entropy stream
	sentinel.OnEntropyStream = func(params starlight.EntropyStreamParams) {
		if params.Entropy {
			log.Printf("Entropy detected: %d mutations, %d pending requests",
				params.MutationCount, params.NetworkPending)
		}
	}

	// Set up graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Received shutdown signal")
		cancel()
	}()

	// Connect to Hub and start
	hubURL := "ws://localhost:8080"
	if url := os.Getenv("STARLIGHT_HUB_URL"); url != "" {
		hubURL = url
	}

	log.Printf("Starting %s, connecting to %s", sentinel.Name, hubURL)

	if err := sentinel.Start(ctx, hubURL); err != nil {
		if err != context.Canceled {
			log.Fatalf("Sentinel error: %v", err)
		}
	}

	log.Println("Sentinel stopped gracefully")
}
