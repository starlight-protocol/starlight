"""
Vision Sentinel - AI-Powered Obstacle Detection (v2.7)
Part of the Starlight Protocol - Phase 8 Quality Fixes

Uses local SLMs (Ollama/Moondream) for visual, selector-free obstacle detection.
Features persistent memory for learned remediation strategies.
"""

import asyncio
import sys
import os
import httpx

# Path boilerplate for local imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sdk.starlight_sdk import SentinelBase

class VisionSentinel(SentinelBase):
    def __init__(self, uri=None):
        super().__init__(layer_name="VisionSentinel", priority=7, uri=uri)
        self.capabilities = ["vision"]
        
        # Load from config
        vision_config = self.config.get("vision", {})
        self.model = vision_config.get("model", "moondream")
        self.timeout = vision_config.get("timeout", 25)
        self.ollama_url = vision_config.get("ollamaUrl", "http://localhost:11434/api/generate")

    async def start(self):
        """Phase 8: Check for AI backend in background after registering."""
        asyncio.create_task(self._health_check_loop())
        await super().start()

    async def _health_check_loop(self):
        """Wait for registration then check Ollama health."""
        await self._registered.wait()
        print(f"[{self.layer}] Verifying AI dependencies (Ollama)...")
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                # Use base URL to check if service is up
                base_url = self.ollama_url.replace('/api/generate', '')
                response = await client.get(base_url)
                if response.status_code == 200:
                    print(f"[{self.layer}] AI Backend Online. Initializing...")
                    await self.update_context({"vision_health": "online"})
                else:
                    print(f"[{self.layer}] WARNING: AI Backend degraded (Status: {response.status_code})")
                    await self.update_context({"vision_health": "degraded"})
        except Exception:
            print(f"[{self.layer}] CRITICAL: AI Backend OFFLINE. Model '{self.model}' will not be available.")
            await self.update_context({"vision_health": "offline"})

    async def on_pre_check(self, params, msg_id):
        screenshot_b64 = params.get("screenshot")
        
        if not screenshot_b64:
            await self.send_clear()
            return

        print(f"[{self.layer}] Starting AI Analysis ({self.timeout}s Budget)...")
        obstacle = await self.analyze_screenshot(screenshot_b64)
        
        if obstacle:
            print(f"[{self.layer}] AI Success: Detected {obstacle}")
            
            target_selector = self.memory.get(obstacle)
            if target_selector:
                print(f"[{self.layer}] Phase 7: Recalling resolution for {obstacle} -> {target_selector}")
            else:
                target_selector = "button:has-text('Close') >> visible=true"
            
            await self.send_hijack(f"AI Vision detected: {obstacle}")
            await self.send_action("click", target_selector)
            self.last_action = {"id": obstacle, "selector": target_selector}
            
            await asyncio.sleep(1.0)
            await self.send_resume(re_check=True)
        else:
            await self.send_clear()

    async def on_message(self, method, params, msg_id):
        """Learn from command completion feedback."""
        m_type = params.get("type") if isinstance(params, dict) else None
        
        if m_type == "COMMAND_COMPLETE" and self.last_action:
            if params.get("success", True):
                obs_id = self.last_action["id"]
                sel = self.last_action["selector"]
                if self.memory.get(obs_id) != sel:
                    print(f"[{self.layer}] Phase 7: Learning AI remediation! {obs_id} -> {sel}")
                    self.memory[obs_id] = sel
                    self._save_memory()
            self.last_action = None

    async def analyze_screenshot(self, screenshot_b64):
        prompt = "What is the main obstacle in this image? (popup, modal, banner, or none)"
        try:
            async with httpx.AsyncClient(timeout=float(self.timeout)) as client:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "images": [screenshot_b64],
                        "stream": False
                    }
                )
                
                if response.status_code == 200:
                    answer = response.json().get("response", "").strip().lower()
                    print(f"[{self.layer}] AI Raw Response: '{answer}'")
                    
                    keywords = ["popup", "modal", "banner", "overlay", "cookie", "dialog", "alert", "window", "obstacle"]
                    for kw in keywords:
                        if kw in answer: 
                            return kw
                    return None
        except httpx.TimeoutException:
            print(f"[{self.layer}] AI Analysis timed out after {self.timeout}s")
            await self.update_context({"vision_status": "TIMEOUT", "reason": f"Analysis exceeded {self.timeout}s"})
        except httpx.ConnectError:
            print(f"[{self.layer}] ERROR: Cannot connect to Ollama at {self.ollama_url}")
            print(f"[{self.layer}] HINT: Run 'ollama serve' to start the AI backend")
            await self.update_context({"vision_status": "OFFLINE", "reason": "Ollama unavailable"})
        except Exception as e:
            print(f"[{self.layer}] AI Analysis failed: {e}")
            await self.update_context({"vision_status": "ERROR", "reason": str(e)})
        return None

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub_url", default=None, help="Starlight Hub WebSocket URL")
    args = parser.parse_args()
    
    sentinel = VisionSentinel(uri=args.hub_url)
    asyncio.run(sentinel.start())
