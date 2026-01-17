"""
Pulse Sentinel - Temporal Stability Monitor (v2.8)
Part of the Starlight Protocol - Phase 9 Animation Tolerance

Monitors "Environmental Entropy" (Network/DOM noise) to ensure 
the browser is settled before allowing Intent execution.

v2.8: Added animation tolerance with max veto count to handle
sites with continuous CSS animations.
"""

import asyncio
import sys
import os
import time

# Path boilerplate for local imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sdk.starlight_sdk import SentinelBase

class SentinelState:
    IDLE = "IDLE"
    ANALYZING = "ANALYZING"
    VETOING = "VETOING"
    CLEARED = "CLEARED"

class PulseSentinel(SentinelBase):
    def __init__(self, uri=None):
        super().__init__(layer_name="PulseSentinel", priority=1, uri=uri)
        self.capabilities = ["temporal-stability", "settling", "network-idle"]
        self.settlement_window = self.config.get("sentinel", {}).get("settlementWindow", 0.5)
        self.max_veto_count = self.config.get("sentinel", {}).get("maxVetoCount", 3)
        self.state = SentinelState.IDLE
        self.metrics = {
            "pre_checks": 0,
            "vetoes": 0,
            "clearances": 0
        }
        self.last_entropy_time = time.time()
        self.current_command_id = None

    async def _emit_telemetry(self):
        """Report Sentinel health and activity to Hub context."""
        await self.update_context({
            "pulse_telemetry": {
                "state": self.state,
                "metrics": self.metrics,
                "layer": self.layer
            }
        })

    async def on_entropy(self, params):
        """Handle entropy stream events from Hub."""
        entropy_detected = params.get("entropy", False)
        if entropy_detected:
            now = time.time()
            self.last_entropy_time = now
            
            # Phase 8.5: Rhythmic Animation Detection (Issue 14)
            if not hasattr(self, 'entropy_history'):
                self.entropy_history = []
            
            self.entropy_history.append(now)
            if len(self.entropy_history) > 10:
                self.entropy_history.pop(0)

            if self.state == SentinelState.CLEARED:
                print(f"[{self.layer}] Jitter Detected! Environment is UNSTABLE.")
            self.state = SentinelState.IDLE

    def _is_rhythmic_animation(self):
        """Detect if entropy is periodic (e.g., CSS animation loop)."""
        if not hasattr(self, 'entropy_history') or len(self.entropy_history) < 5:
            return False
            
        intervals = []
        for i in range(1, len(self.entropy_history)):
            intervals.append(self.entropy_history[i] - self.entropy_history[i-1])
            
        avg_interval = sum(intervals) / len(intervals)
        if avg_interval < 0.1: return False # Too fast (noise)
        
        # Calculate variance
        variance = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
        
        # If variance is very low (< 0.05s), it's likely a timer/loop
        return variance < 0.005

    async def on_pre_check(self, params, msg_id):
        """Verify temporal stability before allowing command execution."""
        self.state = SentinelState.ANALYZING
        self.metrics["pre_checks"] += 1
        await self._emit_telemetry()
        cmd = params.get("command", {}).get("cmd", "unknown")
        
        # Use goal or selector as stable command identifier (stays same across retries)
        goal = params.get("command", {}).get("goal", "")
        selector = params.get("command", {}).get("selector", "")
        url = params.get("command", {}).get("url", "")
        cmd_key = goal or selector or url or cmd
        
        # Reset veto count for new commands
        if cmd_key != self.current_command_id:
            self.veto_count = 0
            self.current_command_id = cmd_key
        
        # Phase 16: Dynamic Settlement Adjustment
        stability_hint = params.get("command", {}).get("stabilityHint", 0)
        base_window = self.config.get("sentinel", {}).get("settlementWindow", 0.5)
        
        # Calculate dynamic window (Hint is in ms, SDK uses seconds)
        # We use the hint as a weight, adding it to the baseline but capping at 2.0s
        dynamic_window = max(base_window, min(2.0, (stability_hint / 1000.0) + 0.1))
        
        if stability_hint > 0:
             # Only use hint if it's significantly different from baseline
             current_window = dynamic_window
        else:
             current_window = base_window

        # Phase 8.5: Check for Rhythmic Animation (Issue 14)
        is_rhythmic = self._is_rhythmic_animation()

        # Proactively check stability
        silence_duration = time.time() - self.last_entropy_time
        
        if silence_duration >= current_window:
            if self.state != SentinelState.CLEARED:
                print(f"[{self.layer}] Environment SETTLED for {cmd} ({silence_duration:.1f}s silence, Target: {current_window:.1f}s).")
            self.state = SentinelState.CLEARED
        elif is_rhythmic:
            if self.state != SentinelState.CLEARED:
                 print(f"[{self.layer}] Rhythmic Animation Detected. Treating as STABLE.")
            self.state = SentinelState.CLEARED
        
        if self.state == SentinelState.CLEARED:
            print(f"[{self.layer}] Stability Verified for: {cmd}")
            self.veto_count = 0
            self.metrics["clearances"] += 1
            await self._emit_telemetry()
            await self.send_clear()
        elif self.veto_count >= self.max_veto_count:
            # Animation tolerance: force clear after max retries
            print(f"[{self.layer}] ANIMATION TOLERANCE: Max vetoes reached, force clearing for: {cmd}")
            self.veto_count = 0
            self.state = SentinelState.CLEARED
            await self.send_clear()
        else:
            self.state = SentinelState.VETOING
            self.veto_count += 1
            self.metrics["vetoes"] += 1
            await self._emit_telemetry()
            wait_time = max(0.2, (current_window - silence_duration)) 
            print(f"[{self.layer}] VETO ({self.veto_count}/{self.max_veto_count}): Environment settling. Retry in {wait_time:.1f}s")
            await self.send_wait(int(wait_time * 1000))

    async def on_message(self, method, params, msg_id):
        """Handle system signals."""
        if method == "starlight.shutdown":
            print(f"[{self.layer}] System shutdown signal received.")
            sys.exit(0)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub_url", default=None, help="Starlight Hub WebSocket URL")
    args = parser.parse_args()

    sentinel = PulseSentinel(uri=args.hub_url)
    asyncio.run(sentinel.start())

