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

class SentinelState:
    IDLE = "IDLE"
    ANALYZING = "ANALYZING"
    HIJACKING = "HIJACKING"
    RESUMED = "RESUMED"
    ERROR = "ERROR"

class JanitorSentinel(SentinelBase):
    def __init__(self, uri=None):
        super().__init__(layer_name="JanitorSentinel", priority=5, uri=uri)
        self.capabilities = ["obstacle-removal"]
        # Load janitor config
        janitor_config = self.config.get("janitor", {})
        self.exploration_delay = janitor_config.get("explorationDelayMs", 300) / 1000.0
        self.remediation_delay = janitor_config.get("remediationDelayMs", 1000) / 1000.0
        # Comprehensive blocking patterns for common UI obstacles
        # Refined (v1.2.2): Simplified patterns for robust matching
        self.blocking_patterns = [
            # Modals and Popups
            ".modal", ".popup", "#overlay", ".obstacle", "#stabilize-btn",
            ".shadow-overlay", ".shadow-close-btn",
            # Newsletter/Subscribe
            ".newsletter", "#newsletter", ".subscribe-popup", "#subscribe-modal",
            # === Cookie Consent / GDPR (CRITICAL FIX) ===
            "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter",
            "#onetrust-pc-btn-handler", ".onetrust-banner-overlay",
            "#CybotCookiebotDialog", ".CybotCookiebotDialogActive",
            ".qc-cmp2-container", ".qc-cmp2-summary-section",
            "#truste-consent-track", ".truste-banner",
            "#didomi-host", ".didomi-popup-container",
            ".cookie-consent", "#cookie-consent", ".cookie-banner", "#cookie-banner",
            ".cookie-notice", "#cookie-notice", ".cookie-modal", "#cookie-modal",
            ".consent-banner", "#consent-banner", ".consent-modal", "#consent-modal",
            ".gdpr-banner", "#gdpr-banner", ".privacy-banner", "#privacy-banner",
            "ytd-consent-bump-v2-lightbox", "#consent-bump",
            # Wildcards
            "cookie-accept", "cookie-dismiss", "consent-accept", "consent-reject",
            # CAPTCHA
            ".g-recaptcha", "#recaptcha", ".recaptcha-checkbox",
            "data-sitekey", "#captcha", ".captcha", "#challenge-form"
        ]
        self.captcha_text_patterns = [
            "are you a robot", "i'm not a robot", "verify you're human",
            "unusual traffic", "automated queries", "captcha",
            "security check", "verify yourself", "prove you're human"
        ]
        self.locale_map = {
            "en_gb": ["United Kingdom", "UK", "Great Britain", "England"],
            "en_us": ["United States", "USA", "US", "America"],
            "en_in": ["India", "IN"],
            "en_ca": ["Canada", "CA"],
            "de_de": ["Germany", "Deutschland", "DE"],
            "fr_fr": ["France", "FR"]
        }
        self.selectors = self.blocking_patterns 
        self.state = SentinelState.IDLE
        self.metrics = {
            "pre_checks": 0,
            "hijacks": 0,
            "recoveries": 0,
            "failures": 0
        }
        self.tried_selectors = []  # Track ALL selectors tried during exploration
        self.current_action_selector = None  # Track most recent action for learning
        self.recovery_successful = False # v4.2 Traceability v2


    async def _emit_telemetry(self):
        """Report Sentinel health and activity to Hub context."""
        await self.update_context({
            "janitor_telemetry": {
                "state": self.state,
                "metrics": self.metrics,
                "layer": self.layer
            }
        })

    async def on_pre_check(self, params, msg_id):
        self.state = SentinelState.ANALYZING
        self.metrics["pre_checks"] += 1
        
        blocking = params.get("blocking", [])
        target_rect = params.get("targetRect")  # Target element's bounding rect
        command = params.get("command", {})
        goal = params.get("goal")

        # WORLD-CLASS: Site Recovery Protocol (Locale Alignment)
        if goal == "site_recovery":
            await self.handle_site_recovery(params, msg_id)
            return
        
        # Skip if no blocking elements or already hijacking
        if not blocking or self.state == SentinelState.HIJACKING:
            if not blocking:
                print(f"[{self.layer}] Clean Path: No obstacles reported by Hub.")
            if self.state != SentinelState.HIJACKING:
                self.state = SentinelState.IDLE
                await self.send_clear(msg_id=msg_id)
            return
        
        for b in blocking:
            matched_pattern = None
            # Extract element properties
            element_id = b.get("id", "")
            classes = b.get("className", "")
            combined = f"{element_id} {classes}".lower()
            
            for pattern in self.blocking_patterns:
                # Optimized regex-style matching for classes and IDs
                clean_p = pattern.lstrip('.#').lower()
                if clean_p in combined:
                    matched_pattern = pattern
                    break
            
            if matched_pattern:
                obstacle_id = b.get('selector', matched_pattern)
                
                # INTELLIGENT FILTER: Ignore non-blocking functional elements (Inputs, Selects)
                tag = b.get("tagName", "").upper()
                input_type = (b.get("inputType") or "").lower()
                if tag in ["INPUT", "SELECT", "TEXTAREA", "OPTION", "LABEL"]:
                    print(f"[{self.layer}] Skipping {obstacle_id} - Ignored Tag: {tag} (type={input_type})")
                    continue
                
                # SMART OVERLAP CHECK: Only clear if obstacle actually overlaps target or covers viewport
                if target_rect and b.get("rect"):
                    # Parse obstacle rect
                    try:
                        obs_dims = b["rect"].split("x")
                        obs_width, obs_height = int(obs_dims[0]), int(obs_dims[1])
                        
                        # Heuristic: Skip small generic elements, but ALWAYS catch specific obstacles
                        is_generic = matched_pattern in [".modal", ".popup", "#overlay", ".overlay", ".dialog"]
                        if is_generic and obs_width < 500 and obs_height < 500:
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
                
                await self.perform_remediation(obstacle_id, msg_id)
                return
        
        # No blocking elements matched or all were skipped
        self.state = SentinelState.IDLE
        await self.send_clear(msg_id=msg_id)

    async def perform_remediation(self, obstacle_id, msg_id):
        if self.state == SentinelState.HIJACKING: 
            return
        
        self.tried_selectors = []  # Reset for this remediation attempt
        best_action = self.memory.get(obstacle_id)
        if best_action:
            print(f"[{self.layer}] State: {self.state} -> HIJACKING (Predictive)")
            self.state = SentinelState.HIJACKING
            self.metrics["hijacks"] += 1
            await self._emit_telemetry()
            
            await self.send_hijack(msg_id=msg_id, reason=f"Predictive remediation for {obstacle_id}")
            await self.send_action("click", best_action, msg_id=msg_id)
            self.last_action = {"id": obstacle_id, "selector": best_action, "known": True}
        else:
            print(f"[{self.layer}] State: {self.state} -> HIJACKING (Heuristic)")
            self.state = SentinelState.HIJACKING
            self.metrics["hijacks"] += 1
            await self._emit_telemetry()
            
            await self.send_hijack(msg_id=msg_id, reason=f"Janitor heuristic healing for {obstacle_id}")
            
            # Heuristic exploration - try multiple selectors, including Shadow-Piercing
            fallback_selectors = [
                # === Shadow-DOM Piercing (World-Class support for modern retailers like H&M) ===
                "nth-child(1) >> #onetrust-accept-btn-handler",
                "internal:control=enter-frame >> #onetrust-accept-btn-handler",
                # === OneTrust ===
                "#onetrust-accept-btn-handler",
                "#onetrust-reject-all-handler", 
                "#onetrust-pc-btn-handler",
                ".onetrust-close-btn-handler",
                # === Cookiebot ===
                "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
                "#CybotCookiebotDialogBodyButtonDecline",
                # === Region Selection (Autonomy Fix) ===
                "button:has-text('United Kingdom')",
                "a:has-text('United Kingdom')",
                "a:has-text('UK')",
                ".region-link",
                # === Generic Cookie Dismiss ===
                "#cookie-accept", "#accept-cookies", ".cookie-accept",
                # === Shadow Close Buttons ===
                ".shadow-close-btn", "#close-btn", ".close-btn", ".btn-close",
                # === Text-based (Playwright format - most reliable for complex sites) ===
                "button:has-text('Accept All')",
                "button:has-text('Accept Cookies')",
                "button:has-text('Accept')",
                "button:has-text('Agree')",
                "button:has-text('Allow All')",
                "button:has-text('Reject All')",
                "button:has-text('Dismiss')",
                "button:has-text('Close')",
                "button:has-text('OK')",
                "button:has-text('Got It')",
                "button:has-text('×')",
            ]
            
            for selector in fallback_selectors:
                full_sel = f"{selector} >> visible=true"
                print(f"[{self.layer}] Trying heuristic: {full_sel}")
                await self.send_action("click", full_sel, msg_id=msg_id)
                self.tried_selectors.append(full_sel)
                self.current_action_selector = full_sel  # Track for learning
                await asyncio.sleep(self.exploration_delay)
            
            # Logic Fix: Do NOT learn from blind heuristics because we don't know which one worked.
            # Only learn if we have precise feedback (which we don't in this loop).
            self.last_action = None

        await asyncio.sleep(self.remediation_delay)
        await self.send_resume(re_check=True, msg_id=msg_id)
        print(f"[{self.layer}] Remediation complete. State: {self.state} -> RESUMED")
        self.state = SentinelState.RESUMED
        self.metrics["recoveries"] += 1
        await self._emit_telemetry()
        # After a brief pause, return to IDLE to accept new pre-checks
        self.state = SentinelState.IDLE

    async def handle_site_recovery(self, params, msg_id):
        """Autonomously resolve locale discrepancies based on mission intent."""
        invariants = params.get("localeInvariants", [])
        if not invariants:
            print(f"[{self.layer}] Site Recovery triggered but no locale invariants provided.")
            await self.send_clear(msg_id=msg_id)
            return

        self.state = SentinelState.HIJACKING
        self.recovery_successful = False
        await self.send_hijack(msg_id=msg_id, reason=f"Recovering mission locale for tokens: {invariants}")

        # Derive semantic targets from invariants
        semantic_targets = []
        for inv in invariants:
            semantic_targets.extend(self.locale_map.get(inv.lower(), []))
        
        if not semantic_targets:
            print(f"[{self.layer}] No semantic mapping found for invariants: {invariants}")
            await self.send_resume(re_check=True, msg_id=msg_id)
            self.state = SentinelState.IDLE
            return

        # Attempt remediation by matching semantic targets
        # We use Playwright-style :has-text for maximum robustness
        remediation_attempted = False
        for target in semantic_targets:
            # Strategies: Button, Link, or generic text match
            strategies = [
                f"button:has-text('{target}')",
                f"a:has-text('{target}')",
                f"[role='button']:has-text('{target}')",
                f"*:has-text('{target}')"
            ]
            
            for selector in strategies:
                if self.recovery_successful:
                    print(f"[{self.layer}] Site Recovery SUCCESS detected. Breaking heuristic loop.")
                    break

                full_sel = f"{selector} >> visible=true"
                print(f"[{self.layer}] Site Recovery heuristic: {full_sel}")
                await self.send_action("click", full_sel, msg_id=msg_id)
                remediation_attempted = True
                await asyncio.sleep(self.exploration_delay)
            
            if self.recovery_successful:
                break

        await asyncio.sleep(self.remediation_delay)
        await self.send_resume(re_check=True, msg_id=msg_id)
        self.state = SentinelState.IDLE
        print(f"[{self.layer}] Site Recovery complete. Resume signal sent.")

    async def on_message(self, method, params, msg_id):
        """Learn from command completion feedback and handle system signals."""
        if method == "starlight.shutdown":
            print(f"[{self.layer}] System shutdown signal received. Saving state...")
            self._save_memory()
            sys.exit(0)

        m_type = params.get("type") if isinstance(params, dict) else None
        
        if m_type == "COMMAND_COMPLETE":
            # If we are in Site Recovery, one success is enough to stop heuristics
            if self.state == SentinelState.HIJACKING and params.get("success", False):
                self.recovery_successful = True

            if self.last_action:
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
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub_url", default=None, help="Starlight Hub WebSocket URL")
    args = parser.parse_args()
    
    sentinel = JanitorSentinel(uri=args.hub_url)
    asyncio.run(sentinel.start())
