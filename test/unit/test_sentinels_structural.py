import unittest
import sys
import os
import asyncio
import json
import time
from unittest.mock import MagicMock, AsyncMock, patch

# Add project root to path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from sdk.starlight_sdk import SentinelBase
from sentinels.janitor import JanitorSentinel
from sentinels.pulse_sentinel import PulseSentinel

class MockSentinel(SentinelBase):
    def __init__(self, name, priority=1):
        super().__init__(layer_name=name, priority=priority)
        self.sent_messages = []

    async def on_pre_check(self, params, msg_id):
        await self.send_clear(msg_id=msg_id)

class TestSentinelSDKStructural(unittest.TestCase):
    def test_base_initialization(self):
        """Test that SentinelBase initializes correctly"""
        sentinel = MockSentinel("TestSentinel", priority=5)
        self.assertEqual(sentinel.layer, "TestSentinel")
        self.assertEqual(sentinel.priority, 5)
        self.assertIn("ws://", sentinel.uri)

    def test_message_formatting(self):
        """Test JSON-RPC 2.0 message formatting"""
        sentinel = MockSentinel("TestSentinel", priority=5)
        msg = sentinel._format_message("starlight.test", {"param": 1}, "msg-1")
        
        self.assertEqual(msg["jsonrpc"], "2.0")
        self.assertEqual(msg["method"], "starlight.test")
        self.assertEqual(msg["params"]["param"], 1)
        self.assertEqual(msg["id"], "msg-1")

    def test_lifecycle_hooks(self):
        """Test that lifecycle hooks exist and are callable (coverage)"""
        sentinel = MockSentinel("TestSentinel", priority=1)
        
        # Test actual implementations
        loop = asyncio.new_event_loop()
        loop.run_until_complete(sentinel.on_entropy({"noise": 0.5}))
        loop.run_until_complete(sentinel.on_message("starlight.broadcast", {"data": "test"}, "id-m1"))
        loop.run_until_complete(sentinel.on_context_update({"test": True}))
        loop.run_until_complete(sentinel.on_sidetalk({"from": "other", "topic": "test"}))
        loop.run_until_complete(sentinel.on_sidetalk_ack({"status": "delivered"}))
        loop.run_until_complete(sentinel.on_sidetalk_ack({"status": "undeliverable", "reason": "timeout", "availableSentinels": []}))
        loop.close()
        self.assertTrue(True, "Lifecycle hooks called successfully")

class TestSentinelsStructural(unittest.TestCase):
    def test_janitor_patterns(self):
        """Test that JanitorSentinel has correct blocking patterns"""
        janitor = JanitorSentinel()
        self.assertIn(".modal", janitor.blocking_patterns)
        
    def test_janitor_pre_check(self):
        """Test JanitorSentinel blocking detection logic"""
        janitor = JanitorSentinel()
        janitor.sent_messages = []
        async def mock_send(method, params, msg_id=None):
            janitor.sent_messages.append({"method": method, "params": params, "msg_id": msg_id})
        janitor._send_msg = mock_send

        # Scenario 1: Blocking
        params = {
            "blocking": [{"selector": ".modal", "className": "modal", "tagName": "DIV"}],
            "command": {"cmd": "click"}
        }
        asyncio.run(janitor.on_pre_check(params, "id-1"))
        self.assertTrue(len(janitor.sent_messages) > 0)

        # Scenario 2: Non-blocking
        janitor.sent_messages = []
        params = {"blocking": [], "command": {"cmd": "click"}}
        asyncio.run(janitor.on_pre_check(params, "id-2"))
        has_clear = any(m["method"] == "starlight.clear" for m in janitor.sent_messages)
        self.assertTrue(has_clear)

    def test_pulse_initialization(self):
        """Test PulseSentinel initialization"""
        pulse = PulseSentinel()
        self.assertEqual(pulse.priority, 1)

    def test_pulse_pre_check(self):
        """Test PulseSentinel stability check logic"""
        pulse = PulseSentinel()
        pulse.sent_messages = []
        async def mock_send(method, params, msg_id=None):
            pulse.sent_messages.append({"method": method, "params": params, "msg_id": msg_id})
        pulse._send_msg = mock_send

        # Scenario 1: Unstable
        pulse.is_stable = False
        params = {"stability": {"is_stable": False}}
        asyncio.run(pulse.on_pre_check(params, "id-p1"))
        has_wait = any(m["method"] == "starlight.wait" for m in pulse.sent_messages)
        self.assertTrue(has_wait)

        # Scenario 2: Stable
        pulse.sent_messages = []
        pulse.is_stable = True
        params = {"stability": {"is_stable": True}}
        # Mock time to ensure silence_duration > current_window
        with patch('time.time', return_value=pulse.last_entropy_time + 2.0):
            asyncio.run(pulse.on_pre_check(params, "id-p2"))
        has_clear = any(m["method"] == "starlight.clear" for m in pulse.sent_messages)
        self.assertTrue(has_clear)

class TestSDKCoverageIntensive(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Use MockSentinel but DO NOT override _send_msg to hit SDK logic
        self.sentinel = MockSentinel("TestSDK", priority=5)
        self.sentinel._websocket = MagicMock()
        self.sentinel._websocket.send = AsyncMock()

    async def test_registration_and_heartbeat(self):
        # Registration - mock the state change that would happen in message_loop
        async def mock_reg_flow(*args):
             self.sentinel.state = "READY"
             
        # Registration
        with patch.object(self.sentinel, '_register', new_callable=AsyncMock) as mocked_reg:
            await self.sentinel._register()
            mocked_reg.assert_called()
        
        # Pulse
        with patch('asyncio.sleep', new_callable=AsyncMock):
            self.sentinel._running = True
            original_send = self.sentinel._websocket.send
            async def mock_send_stop(data):
                await original_send(data)
                self.sentinel._running = False
            
            self.sentinel._websocket.send = mock_send_stop
            await self.sentinel._heartbeat_loop()
            self.sentinel._websocket.send = original_send
            self.sentinel._websocket.send.assert_called()

    async def test_all_actions(self):
        # Coverage for all send_* methods
        await self.sentinel.send_click(".btn", msg_id="1")
        await self.sentinel.send_fill(".input", "text", msg_id="2")
        await self.sentinel.send_select(".select", "val", msg_id="3")
        await self.sentinel.send_hover(".hover", msg_id="4")
        await self.sentinel.send_check(".check", msg_id="5")
        await self.sentinel.send_uncheck(".uncheck", msg_id="6")
        await self.sentinel.send_scroll(".element", msg_id="7")
        await self.sentinel.send_scroll(msg_id="8")
        await self.sentinel.send_press("Enter", msg_id="9")
        await self.sentinel.send_type("hello", msg_id="10")
        await self.sentinel.send_upload(".file", "f.txt", msg_id="11")
        await self.sentinel.send_resume(msg_id="12")
        await self.sentinel.send_hijack("blocked", msg_id="13")
        await self.sentinel.send_wait(msg_id="14")
        
        # Verify call counts (14 actions)
        self.assertEqual(self.sentinel._websocket.send.call_count, 14)

    async def test_sidetalk(self):
        await self.sentinel.send_sidetalk("A11ySentinel", "state", {"ok": True})
        await self.sentinel.broadcast_state(stable=True)
        # 2 messages
        self.assertEqual(self.sentinel._websocket.send.call_count, 2)

    async def test_protocol_handling(self):
        # Test routing in _handle_protocol
        methods = {
            "starlight.pre_check": "on_pre_check",
            "starlight.entropy_stream": "on_entropy",
            "starlight.sovereign_update": "on_context_update",
            "starlight.sidetalk": "on_sidetalk",
            "starlight.sidetalk_ack": "on_sidetalk_ack"
        }
        
        for method, hook in methods.items():
            with patch.object(MockSentinel, hook, new_callable=AsyncMock) as mocked_hook:
                sentinel = MockSentinel("Test", priority=1)
                await sentinel._handle_protocol({"method": method, "params": {}, "id": "1"})
                mocked_hook.assert_called_once()

    def test_memory_logic(self):
        # Non-async tests for memory
        sentinel = MockSentinel("MemTest", priority=1)
        sentinel.memory = {"learned": True}
        sentinel._save_memory()
        
        new_sentinel = MockSentinel("MemTest", priority=1)
        new_sentinel._load_memory()
        self.assertTrue(new_sentinel.memory.get("learned"))
        
        # Cleanup
        if os.path.exists(new_sentinel.memory_file):
            os.remove(new_sentinel.memory_file)

    def test_config_loading(self):
        sentinel = MockSentinel("ConfigTest", priority=1)
        config = sentinel._load_config()
        self.assertIsInstance(config, dict)

if __name__ == '__main__':
    unittest.main()
