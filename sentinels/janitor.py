"""
Janitor Sentinel - Obstacle Removal Agent (v2.7)
Part of the Starlight Protocol - Phase 8 Quality Fixes

Clears modals, popups, and overlays using heuristic pattern matching.
Features persistent memory for learned remediation strategies.
"""

import asyncio
import sys
import os

# Path boilerplate for local imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sdk.starlight_sdk import SentinelBase

class JanitorSentinel(SentinelBase):
    def __init__(self):
        super().__init__(layer_name="JanitorSentinel", priority=5)
        # Load janitor config
        janitor_config = self.config.get("janitor", {})
        self.exploration_delay = janitor_config.get("explorationDelayMs", 300) / 1000.0
        self.remediation_delay = janitor_config.get("remediationDelayMs", 1000) / 1000.0
        # Comprehensive blocking patterns for common UI obstacles
        self.blocking_patterns = [
            # Modals and Popups
            ".modal", ".popup", "#overlay", ".obstacle", "#stabilize-btn",
            ".shadow-overlay", ".shadow-close-btn",
            # Newsletter/Subscribe popups
            ".newsletter", "#newsletter", ".subscribe-popup", "#subscribe-modal",
            ".email-popup", ".signup-modal", ".newsletter-modal", ".newsletter-popup",
            # Cookie consent
            ".cookie-consent", "#cookie-banner", ".cookie-notice", ".gdpr-banner",
            # Generic overlays
            ".overlay", ".backdrop", ".lightbox", ".dialog",
            # Toast/notification dismissals
            ".toast", ".notification", ".snackbar", ".alert-dismissible",
            # Common close button patterns
            ".close-btn", ".dismiss-btn", "[data-dismiss]", ".btn-close"
        ]
        self.selectors = self.blocking_patterns 
        self.is_hijacking = False
        self.tried_selectors = []  # Track ALL selectors tried during exploration
        self.current_action_selector = None  # Track most recent action for learning

    async def on_pre_check(self, params, msg_id):
        blocking = params.get("blocking", [])
        target_rect = params.get("targetRect")  # Target element's bounding rect
        command = params.get("command", {})
        
        # Skip if no blocking elements or already hijacking
        if not blocking or self.is_hijacking:
            if not self.is_hijacking:
                await self.send_clear()
            return
        
        for b in blocking:
            matched_pattern = None
            for pattern in self.blocking_patterns:
                if pattern.replace('.', '') in b.get("className", "") or pattern.replace('#', '') == b.get("id", ""):
                    matched_pattern = pattern
                    break
            
            if matched_pattern:
                obstacle_id = b.get('selector', matched_pattern)
                
                # SMART OVERLAP CHECK: Only clear if obstacle actually overlaps target or covers viewport
                if target_rect and b.get("rect"):
                    # Parse obstacle rect
                    try:
                        obs_dims = b["rect"].split("x")
                        obs_width, obs_height = int(obs_dims[0]), int(obs_dims[1])
                        
                        # If obstacle is small and doesn't cover significant viewport, skip
                        # Large overlays (modal backdrops) typically cover full viewport
                        if obs_width < 500 and obs_height < 500:
                            print(f"[{self.layer}] Skipping {obstacle_id} - small element, unlikely to block target")
                            continue
                    except:
                        pass  # If parsing fails, proceed with clearing
                
                # DEDUPLICATION: Skip if we just cleared this same obstacle
                if hasattr(self, '_last_cleared') and self._last_cleared == obstacle_id:
                    if hasattr(self, '_clear_count') and self._clear_count > 2:
                        print(f"[{self.layer}] Giving up on {obstacle_id} after 3 attempts - proceeding anyway")
                        await self.send_clear()
                        return
                    self._clear_count = getattr(self, '_clear_count', 0) + 1
                else:
                    self._last_cleared = obstacle_id
                    self._clear_count = 1
                
                await self.perform_remediation(obstacle_id)
                return
        
        # No blocking elements matched or all were skipped
        await self.send_clear()

    async def perform_remediation(self, obstacle_id):
        if self.is_hijacking: 
            return
        self.is_hijacking = True
        self.tried_selectors = []  # Reset for this remediation attempt
        
        best_action = self.memory.get(obstacle_id)
        if best_action:
            print(f"[{self.layer}] Phase 7: Recalling best action for {obstacle_id} -> {best_action}")
            await self.send_hijack(f"Predictive remediation for {obstacle_id}")
            await self.send_action("click", best_action)
            self.last_action = {"id": obstacle_id, "selector": best_action, "known": True}
        else:
            print(f"[{self.layer}] !!! HIJACKING !!! Reason: Detected {obstacle_id}")
            await self.send_hijack(f"Janitor heuristic healing for {obstacle_id}")
            
            # Heuristic exploration - try multiple selectors
            fallback_selectors = [
                # ID-based (most specific)
                "#newsletter-close",
                "#cookie-accept", 
                "#cookie-decline",
                "#close-btn",
                "#custom-close",
                # Class-based
                f"{obstacle_id} .close", 
                f"{obstacle_id} .btn-close",
                f"{obstacle_id} button",
                ".modal-close", 
                ".close-btn",
                ".btn-close",
                ".btn-accept",
                ".btn-decline",
                # Text-based (Playwright format)
                "button:has-text('No Thanks')",
                "button:has-text('Close')",
                "button:has-text('OK')",
                "button:has-text('Accept')",
                "button:has-text('Decline')",
                "button:has-text('Got it')",
                "button:has-text('Dismiss')",
            ]
            
            for selector in fallback_selectors:
                full_sel = f"{selector} >> visible=true"
                print(f"[{self.layer}] Trying heuristic: {full_sel}")
                await self.send_action("click", full_sel)
                self.tried_selectors.append(full_sel)
                self.current_action_selector = full_sel  # Track for learning
                await asyncio.sleep(self.exploration_delay)
            
            # Logic Fix: Store the current selector being tried; on success, we learn it
            self.last_action = {"id": obstacle_id, "selector": self.current_action_selector, "known": False}

        await asyncio.sleep(self.remediation_delay)
        await self.send_resume(re_check=True)
        self.is_hijacking = False

    async def on_message(self, method, params, msg_id):
        """Learn from command completion feedback."""
        m_type = params.get("type") if isinstance(params, dict) else None
        
        if m_type == "COMMAND_COMPLETE" and self.last_action:
            if params.get("success", True):
                obs_id = self.last_action["id"]
                
                if self.last_action.get("known"):
                    # Already knew the right selector, nothing to learn
                    pass
                else:
                    # Logic Fix: Learn the selector that was used in last_action
                    sel = self.last_action.get("selector")
                    if sel and self.memory.get(obs_id) != sel:
                        print(f"[{self.layer}] LEARNING remediation! {obs_id} -> {sel}")
                        self.memory[obs_id] = sel
                        self._save_memory()
            
            self.last_action = None

if __name__ == "__main__":
    sentinel = JanitorSentinel()
    asyncio.run(sentinel.start())
