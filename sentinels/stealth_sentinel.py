"""
Stealth Sentinel - Anti-Bot Detection & Evasion (v1.0)
Starlight Protocol - Phase 12: World-Class Autonomy

Detects and handles anti-bot systems like:
- Akamai Bot Manager
- Cloudflare Bot Management
- PerimeterX
- DataDome
- Generic challenge pages

Uses sb-stealth-wrapper concepts for evasion strategies.

Author: Dhiraj Das
License: MIT
"""

import asyncio
import sys
import os
import re

# Path boilerplate for local imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sdk.starlight_sdk import SentinelBase


class StealthSentinel(SentinelBase):
    """
    Anti-Bot Detection Sentinel.
    
    Detects challenge pages and bot detection systems, then either:
    1. Waits for challenge completion (if solvable)
    2. Alerts the mission that site is bot-protected
    3. Applies evasion strategies
    
    Capabilities: ["stealth", "anti-bot", "evasion"]
    Priority: 2 (High - security layer, runs early)
    """
    
    def __init__(self, uri=None):
        super().__init__(
            layer_name="StealthSentinel",
            priority=7,
            uri=uri
        )
        self.capabilities = ["stealth", "anti-bot", "evasion"]
        self.selectors = []  # Behavioral detection, not selector-based
        
        # Bot detection signatures (page text patterns)
        self.bot_detection_patterns = [
            # Akamai
            r"access[\s-]?denied",
            r"reference[\s-]?#?\d+",
            r"akamai",
            
            # Cloudflare
            r"checking your browser",
            r"just a moment",
            r"please wait while we verify",
            r"ray id",
            r"cloudflare",
            r"ddos protection",
            
            # PerimeterX
            r"press & hold",
            r"human verification",
            r"perimeterx",
            r"px-captcha",
            
            # DataDome
            r"datadome",
            r"security check",
            
            # Generic
            r"blocked",
            r"forbidden",
            r"access blocked",
            r"automated access",
            r"bot detected",
            r"please enable javascript",
            r"javascript required",
            r"enable cookies",
        ]
        
        # Compile patterns for efficiency
        self.compiled_patterns = [
            re.compile(p, re.IGNORECASE) for p in self.bot_detection_patterns
        ]
        
        # Challenge resolution selectors
        self.challenge_selectors = [
            # Cloudflare
            "#cf-please-wait",
            "#challenge-running",
            ".cf-browser-verification",
            
            # PerimeterX
            "#px-captcha",
            ".human-challenge",
            
            # DataDome
            ".datadome-captcha",
        ]
        
        self.detection_count = 0
        self.last_detection = None
        
    async def on_pre_check(self, params, msg_id):
        """
        Scan page content for anti-bot signatures.
        If detected, attempt to wait or adapt.
        """
        page_text = params.get("page_text", "")
        blocking = params.get("blocking", [])
        command = params.get("command", {})
        
        # Skip if no page text available
        if not page_text:
            await self.send_clear()
            return
        
        # Scan for bot detection patterns
        detected_system = self._detect_anti_bot(page_text)
        
        if detected_system:
            self.detection_count += 1
            self.last_detection = detected_system
            
            print(f"[{self.layer}] [WARNING] ANTI-BOT DETECTED: {detected_system}")
            print(f"[{self.layer}] Detection count: {self.detection_count}")
            
            # Check if this is a challenge page we can wait out
            is_challenge = self._is_waiting_challenge(page_text)
            
            if is_challenge and self.detection_count <= 3:
                print(f"[{self.layer}] Challenge page detected - waiting for resolution...")
                await self.send_hijack(f"Anti-bot challenge: {detected_system}")
                
                # Wait for challenge to complete (Cloudflare turnstile, etc.)
                await asyncio.sleep(5.0)
                
                # Reset and re-check
                await self.send_resume(re_check=True)
                return
            
            elif self.detection_count > 3:
                # Persistent block - alert mission
                print(f"[{self.layer}] ❌ PERSISTENT BLOCK: Site is actively blocking automation")
                await self.update_context({
                    "anti_bot": {
                        "detected": True,
                        "system": detected_system,
                        "detection_count": self.detection_count,
                        "status": "BLOCKED",
                        "recommendation": "Consider using stealth browser profile or manual intervention"
                    }
                })
                
                # Don't block indefinitely - let mission proceed (will likely fail)
                await self.send_clear()
                return
            
            else:
                # First detection - log and proceed cautiously
                await self.update_context({
                    "anti_bot": {
                        "detected": True,
                        "system": detected_system,
                        "detection_count": self.detection_count,
                        "status": "WARNING"
                    }
                })
        
        # No detection or handled - proceed
        await self.send_clear()
    
    def _detect_anti_bot(self, page_text: str) -> str:
        """Check page text for anti-bot system signatures."""
        text_lower = page_text.lower()
        
        for pattern in self.compiled_patterns:
            match = pattern.search(text_lower)
            if match:
                # Identify which system
                matched_text = match.group(0)
                
                if "cloudflare" in matched_text or "ray id" in matched_text:
                    return "Cloudflare"
                elif "akamai" in matched_text or "access denied" in matched_text:
                    return "Akamai"
                elif "perimeterx" in matched_text or "press & hold" in matched_text:
                    return "PerimeterX"
                elif "datadome" in matched_text:
                    return "DataDome"
                else:
                    return f"Generic ({matched_text[:30]})"
        
        return None
    
    def _is_waiting_challenge(self, page_text: str) -> bool:
        """Check if this is a 'please wait' challenge that may resolve."""
        waiting_patterns = [
            "just a moment",
            "checking your browser",
            "please wait",
            "verifying",
            "one moment",
        ]
        text_lower = page_text.lower()
        return any(p in text_lower for p in waiting_patterns)
    
    async def on_entropy(self, params):
        """Reset detection count on page navigation."""
        # If we see significant page change, reset detection
        if params.get("navigation"):
            self.detection_count = 0
            self.last_detection = None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub_url", default=None, help="Starlight Hub WebSocket URL")
    args = parser.parse_args()
    
    sentinel = StealthSentinel(uri=args.hub_url)
    asyncio.run(sentinel.start())
