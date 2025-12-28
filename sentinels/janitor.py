import asyncio
import websockets
import json
import time

class JanitorSentinel:
    def __init__(self, uri="ws://localhost:8080"):
        self.uri = uri
        self.layer = "JanitorSentinel"
        self.priority = 5
        self.blocking_patterns = [".modal", ".popup", "#overlay"]
        self.is_hijacking = False

    async def connect(self):
        async with websockets.connect(self.uri) as websocket:
            print(f"[{self.layer}] Connected to Starlight Hub.")
            
            # Registration
            registration = {
                "type": "REGISTRATION",
                "layer": self.layer,
                "priority": self.priority,
                "selectors": self.blocking_patterns
            }
            await websocket.send(json.dumps(registration))

            # Start Heartbeat Task
            heartbeat_task = asyncio.create_task(self.pulse(websocket))

            async for message in websocket:
                data = json.loads(message)
                await self.handle_message(websocket, data)
            
            heartbeat_task.cancel()

    async def pulse(self, ws):
        while True:
            await ws.send(json.dumps({"type": "HEARTBEAT"}))
            await asyncio.sleep(1)

    async def handle_message(self, ws, data):
        msg_type = data.get("type")

        if msg_type == "dom_mutation":
            target = data.get("target", {})
            for pattern in self.blocking_patterns:
                if pattern.replace('.', '') in target.get("className", "") or pattern.replace('#', '') == target.get("id", ""):
                    if target.get("visibility") != "none":
                        await self.hijack(ws, pattern, f"Mutation: detected visible {pattern}")
                        return
        
        elif msg_type == "PRE_CHECK":
            print(f"[{self.layer}] PRE_CHECK: Auditing environment for {data['command']['cmd']}...")
            
            # Check for blocking elements sent by Hub
            blocking = data.get("blocking", [])
            if blocking:
                for b in blocking:
                    # Target the specific obstacle found during audit
                    # The original code checked against self.blocking_patterns,
                    # but the new snippet implies 'b' itself contains the selector.
                    # Assuming 'b' is an object with 'selector', 'className', 'id'
                    # and we want to check if it matches any of our known patterns.
                    # The user's snippet for PRE_CHECK seems to assume 'b' has a 'selector' field
                    # and that we should pass that specific selector to hijack.
                    # I'll adapt to pass b['selector'] if it exists and matches our patterns.
                    matched_pattern = None
                    for pattern in self.blocking_patterns:
                        if pattern.replace('.', '') in b.get("className", "") or pattern.replace('#', '') == b.get("id", ""):
                            matched_pattern = pattern
                            break
                    
                    if matched_pattern:
                        # Use the specific selector from 'b' if available, otherwise the matched pattern
                        selector_to_hijack = b.get('selector', matched_pattern)
                        await self.hijack(ws, selector_to_hijack, f"Proactive Audit: detected visible {selector_to_hijack}")
                        return 
            
            # Fallback to general scan if no blocking provided but path not clear
            # The user's snippet introduced check_environment, which is not defined.
            # I'm retaining the original logic for clearing if no hijack occurred.
            if not self.is_hijacking:
                await ws.send(json.dumps({"type": "CLEAR"}))

    async def hijack(self, ws, selector, reason):
        if self.is_hijacking: return # Keep original guard
        
        print(f"[{self.layer}] !!! HIJACKING !!! Reason: {reason}")
        self.is_hijacking = True
        
        await ws.send(json.dumps({
            "type": "HIJACK",
            "reason": reason
        }))

        # Robust Clearing: Find the VISIBLE close button or modal
        print(f"[{self.layer}] Executing Sovereign Healing...")
        
        # We now use a simpler selector and let the Hub handle the visibility details
        # We append ' >> visible=true' to ensure Playwright doesn't target hidden zombies
        # The user's snippet for hijack:
        target_pattern = selector if "close" in selector else ".close-btn"
        await ws.send(json.dumps({
            "type": "SENTINEL_ACTION",
            "cmd": "click",
            "selector": f"{target_pattern} >> visible=true"
        }))
        
        await asyncio.sleep(1.5) # Even more settle time for Chaos Loops

        print(f"[{self.layer}] Requesting RE_CHECK for landscape stability...")
        await ws.send(json.dumps({
            "type": "RESUME",
            "re_check": True
        }))
        self.is_hijacking = False

if __name__ == "__main__":
    sentinel = JanitorSentinel()
    asyncio.run(sentinel.connect())
