// Package starlight provides a Go SDK for the Starlight Protocol.
//
// The Starlight Protocol is a communication standard for coordinating
// autonomous agents in browser automation environments. This SDK enables
// building Sentinels (monitoring agents) in Go.
//
// # Quick Start
//
//	sentinel := starlight.NewSentinel("MySentinel", 5)
//	sentinel.OnPreCheck = func(params PreCheckParams) Response {
//	    // Your obstacle detection logic
//	    return sentinel.Clear()
//	}
//	sentinel.Start("ws://localhost:8080")
//
// # Protocol Overview
//
// All communication uses JSON-RPC 2.0 over WebSocket. The Hub orchestrates
// browser automation while Sentinels monitor environmental conditions.
//
// Key methods:
//   - starlight.registration: Register Sentinel with Hub
//   - starlight.pre_check: Hub queries Sentinel before action
//   - starlight.clear: Sentinel approves action
//   - starlight.wait: Sentinel vetoes action (retry later)
//   - starlight.hijack: Sentinel takes browser control
//   - starlight.resume: Sentinel releases control
package starlight

const (
	// Version is the current SDK version
	Version = "1.0.0"

	// ProtocolVersion is the Starlight Protocol version
	ProtocolVersion = "1.0.0"
)
