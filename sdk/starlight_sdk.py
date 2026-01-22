"""
Starlight Sentinel SDK (v1.2.2)
Standardizes the creation of autonomous agents for the CBA ecosystem.

Phase 18: Extended action methods for universal automation commands.
"""

import asyncio
import websockets
import json
import time
import os
import sys
import signal
import tempfile
import shutil
from datetime import datetime
from abc import ABC, abstractmethod

class SentinelBase(ABC):
    def __init__(self, layer_name, priority, uri=None):
        # Support HUB_URL environment variable for flexible Hub connection
        # Use .strip() to handle Windows cmd trailing whitespace
        self.uri = (uri or os.environ.get("HUB_URL", "ws://localhost:8080")).strip()
        self.layer = layer_name
        self.priority = priority
        self.selectors = []
        self.capabilities = []
        self.entropy = 0.0 # Default compliance value
        self._running = True
        self._websocket = None
        self._registered = asyncio.Event()
        self._assigned_id = None
        self.memory = {}
        self.last_action = None
        # Stability: Use absolute path in project root, not relative CWD
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.memory_file = os.path.join(project_root, f"{self.layer}_memory.json")
        
        # Load config
        self.config = self._load_config()

    def _load_config(self):
        """Load configuration from config.json."""
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config.json')
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"[{self.layer}] Warning: Could not load config: {e}")
        return {"sentinel": {"reconnectDelay": 3, "heartbeatInterval": 2}}

    def _load_memory(self):
        """Phase 7.3: Load persistent Sentinel experience."""
        try:
            if os.path.exists(self.memory_file):
                with open(self.memory_file, 'r') as f:
                    self.memory = json.load(f)
                print(f"[{self.layer}] Phase 7: Loaded {len(self.memory)} persistent patterns.")
        except json.JSONDecodeError as e:
            print(f"[{self.layer}] Warning: Memory file corrupted, starting fresh: {e}")
            self.memory = {}
        except Exception as e:
            print(f"[{self.layer}] Warning: Failed to load memory: {e}")

    def _save_memory(self):
        """Phase 7.3: Persist Sentinel experience with atomic write."""
        try:
            # Atomic write: write to temp file, then rename
            fd, temp_path = tempfile.mkstemp(suffix='.json', dir=os.path.dirname(self.memory_file) or '.')
            try:
                with os.fdopen(fd, 'w') as f:
                    json.dump(self.memory, f, indent=4)
                shutil.move(temp_path, self.memory_file)
            except Exception:
                os.unlink(temp_path)
                raise
        except Exception as e:
            print(f"[{self.layer}] Warning: Failed to save memory: {e}")

    async def start(self):
        """Main entry point for the sentinel."""
        self._load_memory()
        self._running = True
        
        # Setup graceful shutdown
        def handle_shutdown(sig, frame):
            print(f"\n[{self.layer}] Received shutdown signal, saving state...")
            self._save_memory()
            self._running = False
        
        signal.signal(signal.SIGINT, handle_shutdown)
        # Stability: SIGTERM doesn't exist on Windows
        if sys.platform != 'win32':
            signal.signal(signal.SIGTERM, handle_shutdown)
        
        reconnect_delay = self.config.get("sentinel", {}).get("reconnectDelay", 3)
        
        while self._running:
            try:
                print(f"[{self.layer}] Connecting to Starlight Hub...")
                async with websockets.connect(self.uri) as websocket:
                    self._websocket = websocket
                    
                    # 1. Register (Non-Blocking)
                    # We send the registration request but do NOT await the response.
                    # The response (challenge) will be handled by the main read loop below.
                    await self._register()
                    
                    # 2. Start Heartbeat
                    heartbeat_task = asyncio.create_task(self._heartbeat_loop())
                    
                    # 3. Main Read Loop (Handles Handshake + Protocol)
                    async for message in websocket:
                        if not self._running:
                            break
                        try:
                            data = json.loads(message)
                            
                            # Phase 1 Security: Handle Registration Guard (Challenge-Response)
                            msg_id_str = str(data.get("id", ""))
                            if "result" in data and "reg-" in msg_id_str:
                                if data["result"].get("success"):
                                    self._assigned_id = data["result"].get("assignedId")
                                    challenge = data["result"].get("challenge")
                                    print(f"[{self.layer}] Handshake Challenge Received (ID: {self._assigned_id})")
                                    
                                    # Send challenge response immediately
                                    response_msg = {
                                        "jsonrpc": "2.0",
                                        "method": "starlight.challenge_response",
                                        "params": {"response": challenge},
                                        "id": "chal-" + str(int(time.time()))
                                    }
                                    await self._websocket.send(json.dumps(response_msg))
                                else:
                                    print(f"[{self.layer}] !!! Handshake Aborted: {data['result'].get('message')}")

                            # Handle READY confirmation
                            if "result" in data and "chal-" in msg_id_str:
                                if data["result"].get("success"):
                                    print(f"[{self.layer}] Handshake Verified -> READY state achieved.")
                                    self._registered.set()
                            
                            asyncio.create_task(self._handle_protocol(data))
                        except json.JSONDecodeError as e:
                            print(f"[{self.layer}] Warning: Received malformed JSON, ignoring: {e}")
                        
            except websockets.exceptions.ConnectionClosed as e:
                print(f"[{self.layer}] Connection closed: {e}. Retrying in {reconnect_delay}s...")
            except ConnectionRefusedError:
                print(f"[{self.layer}] Hub not available. Retrying in {reconnect_delay}s...")
            except Exception as e:
                print(f"[{self.layer}] Connection error: {type(e).__name__}: {e}. Retrying in {reconnect_delay}s...")
            
            if self._running:
                await asyncio.sleep(reconnect_delay)
        
        # Final save on exit
        self._save_memory()
        print(f"[{self.layer}] Shutdown complete.")



    async def _register(self):
        # Security: Get auth token from config
        auth_token = self.config.get("hub", {}).get("security", {}).get("authToken")
        
        self._reg_id = "reg-" + str(int(time.time()))
        params = {
            "layer": self.layer,
            "priority": self.priority,
            "selectors": self.selectors,
            "capabilities": self.capabilities,
            "version": "1.0.0"
        }
        if auth_token:
            params["authToken"] = auth_token
            
        msg = {
            "jsonrpc": "2.0",
            "method": "starlight.registration",
            "params": params,
            "id": self._reg_id
        }
        await self._websocket.send(json.dumps(msg))
        # Non-blocking: We let the main loop handle the response
        print(f"[{self.layer}] Registration sent (ID: {self._reg_id}), awaiting challenge...")


    async def _heartbeat_loop(self):
        interval = self.config.get("sentinel", {}).get("heartbeatInterval", 2)
        while self._websocket and self._running:
            try:
                msg = {
                    "jsonrpc": "2.0",
                    "method": "starlight.pulse",
                    "params": {
                        "layer": self.layer,
                        "entropy": getattr(self, 'entropy', 0.0),
                        "health": await self.verify_health(),
                        "timestamp": datetime.now().isoformat()
                    },
                    "id": "pulse-" + str(int(time.time()))
                }
                await self._websocket.send(json.dumps(msg))
                await asyncio.sleep(interval)
            except websockets.exceptions.ConnectionClosed:
                break
            except Exception as e:
                print(f"[{self.layer}] Heartbeat error: {e}")
                break

    async def _handle_protocol(self, data):
        method = data.get("method")
        params = data.get("params", {})
        msg_id = data.get("id")



        if method == "starlight.pre_check":
            self._active_msg_id = msg_id
            try:
                await self.on_pre_check(params, msg_id)
            finally:
                self._active_msg_id = None
        elif method == "starlight.shutdown":
            print(f"[{self.layer}] SHUTDOWN signal received. Cleaning up...")
            self._running = False
            if self._websocket:
                await self._websocket.close()
            self._save_memory()
            sys.exit(0)
        elif method == "starlight.entropy_stream":
            await self.on_entropy(params)
        elif method == "starlight.sovereign_update":
            await self.on_context_update(params.get("context", {}))
        # Phase 17: Inter-Sentinel Side-Talk
        elif method == "starlight.sidetalk":
            await self.on_sidetalk(params)
        elif method == "starlight.sidetalk_ack":
            await self.on_sidetalk_ack(params)
        else:
            # Phase 7.3: For responses/broadcasts without method, pass full data
            await self.on_message(method, params if method else data, msg_id)

    # --- Communication Methods ---

    async def send_clear(self, confidence=1.0, msg_id=None):
        """Approve execution with an optional confidence score (0.0-1.0)."""
        target_id = msg_id or getattr(self, '_active_msg_id', None)
        await self._send_msg("starlight.clear", {"confidence": confidence}, msg_id=target_id)

    async def send_wait(self, retry_after_ms=1000, confidence=1.0, msg_id=None):
        """Veto execution with an optional confidence score (0.0-1.0)."""
        target_id = msg_id or getattr(self, '_active_msg_id', None)
        await self._send_msg("starlight.wait", {
            "retryAfterMs": retry_after_ms,
            "confidence": confidence
        }, msg_id=target_id)

    async def send_hijack(self, reason="Handshake hijack", msg_id=None):
        target_id = msg_id or getattr(self, '_active_msg_id', None)
        await self._send_msg("starlight.hijack", {"reason": reason}, msg_id=target_id)

    async def send_resume(self, re_check=True, msg_id=None):
        await self._send_msg("starlight.resume", {"re_check": re_check}, msg_id=msg_id)

    async def send_action(self, action, selector, text=None, value=None, key=None, msg_id=None):
        """Execute a healing action via the Hub."""
        params = {"action": action, "selector": selector}
        if text: params["text"] = text
        if value: params["value"] = value
        if key: params["key"] = key
        await self._send_msg("starlight.action", params, msg_id=msg_id)

    # === Extended Action Methods (v1.2.0) ===
    
    async def send_click(self, selector, msg_id=None):
        """Click an element."""
        await self.send_action("click", selector, msg_id=msg_id)
    
    async def send_fill(self, selector, text, msg_id=None):
        """Fill an input field."""
        await self.send_action("fill", selector, text=text, msg_id=msg_id)
    
    async def send_select(self, selector, value, msg_id=None):
        """Select a dropdown option by value."""
        await self.send_action("select", selector, value=value, msg_id=msg_id)
    
    async def send_hover(self, selector, msg_id=None):
        """Hover over an element."""
        await self.send_action("hover", selector, msg_id=msg_id)
    
    async def send_check(self, selector, msg_id=None):
        """Check a checkbox."""
        await self.send_action("check", selector, msg_id=msg_id)
    
    async def send_uncheck(self, selector, msg_id=None):
        """Uncheck a checkbox."""
        await self.send_action("uncheck", selector, msg_id=msg_id)
    
    async def send_scroll(self, selector=None, msg_id=None):
        """Scroll to an element, or scroll to bottom if no selector."""
        await self.send_action("scroll", selector or "", msg_id=msg_id)
    
    async def send_press(self, key, msg_id=None):
        """Press a keyboard key."""
        params = {"action": "press", "key": key}
        await self._send_msg("starlight.action", params, msg_id=msg_id)
    
    async def send_type(self, text, msg_id=None):
        """Type text using keyboard."""
        params = {"action": "type", "text": text}
        await self._send_msg("starlight.action", params, msg_id=msg_id)
    
    async def send_upload(self, selector, files, msg_id=None):
        """Upload file(s) to file input. Files can be single path or list of paths."""
        params = {
            "action": "upload",
            "selector": selector,
            "files": files
        }
        await self._send_msg("starlight.action", params, msg_id=msg_id)

    async def update_context(self, context_data):
        """Inject data into the Hub's sovereign state."""
        await self._send_msg("starlight.context_update", {"context": context_data})

    # Phase 17: Inter-Sentinel Side-Talk
    async def send_sidetalk(self, to, topic, payload, reply_to=None):
        """
        Send a side-talk message to another Sentinel.
        
        Args:
            to: Target Sentinel name (e.g., 'A11ySentinel') or '*' for broadcast
            topic: Message topic (e.g., 'environment_state', 'capability_query')
            payload: Dict with message data
            reply_to: Optional message ID to reply to
        """
        params = {
            "from": self.layer,
            "to": to,
            "topic": topic,
            "payload": payload
        }
        if reply_to:
            params["replyTo"] = reply_to
        await self._send_msg("starlight.sidetalk", params)
        print(f"[{self.layer}] Side-Talk → {to} (topic: {topic})")

    async def broadcast_state(self, stable=True, mutation_rate=0):
        """Convenience method to broadcast environment state to all Sentinels."""
        await self.send_sidetalk("*", "environment_state", {
            "stable": stable,
            "mutationRate": mutation_rate,
            "timestamp": time.time()
        })

    async def _send_msg(self, method, params, msg_id=None):
        if self._websocket:
            try:
                final_id = msg_id or str(int(time.time() * 1000))
                msg = self._format_message(method, params, final_id)
                await self._websocket.send(json.dumps(msg))
            except websockets.exceptions.ConnectionClosed:
                print(f"[{self.layer}] Cannot send {method}: connection closed")
            except Exception as e:
                print(f"[{self.layer}] Failed to send {method}: {e}")

    def _format_message(self, method, params, msg_id):
        """Phase 16.1: Extracted formatting for structural testability."""
        return {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": msg_id
        }

    # --- Lifecycle Hooks (Override These) ---

    async def verify_health(self):
        """Phase 8: Proactive dependency check. Override in subclasses."""
        return "online"

    @abstractmethod
    async def on_pre_check(self, params, msg_id):
        pass

    async def on_entropy(self, params):
        pass

    async def on_context_update(self, context):
        pass

    async def on_message(self, method, params, msg_id):
        pass

    # Phase 17: Side-Talk Hooks (Override in Sentinel for custom handling)
    async def on_sidetalk(self, params):
        """
        Called when a side-talk message is received from another Sentinel.
        Override in your Sentinel to handle inter-Sentinel communication.
        
        Args:
            params: {from, to, topic, payload, timestamp}
        """
        sender = params.get("from", "Unknown")
        topic = params.get("topic", "unknown")
        print(f"[{self.layer}] Side-Talk received from {sender} (topic: {topic})")

    async def on_sidetalk_ack(self, params):
        """
        Called when a side-talk delivery acknowledgment is received.
        Status can be 'delivered' or 'undeliverable'.
        
        Args:
            params: {originalId, status, reason, availableSentinels}
        """
        status = params.get("status", "unknown")
        if status == "undeliverable":
            reason = params.get("reason", "Unknown reason")
            available = params.get("availableSentinels", [])
            print(f"[{self.layer}] Side-Talk undeliverable: {reason}")
            print(f"[{self.layer}] Available Sentinels: {', '.join(available)}")
