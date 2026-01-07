"""
Test for Starlight SDK v1.2.0 Extended Action Methods

Verifies that all new action methods can be called without errors.
This is a unit test that mocks the WebSocket connection.
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sdk.starlight_sdk import SentinelBase


class TestSentinel(SentinelBase):
    """Concrete implementation for testing."""
    
    def __init__(self):
        # Skip parent __init__ to avoid loading config
        self.layer = "TestSentinel"
        self.priority = 1
        self.selectors = []
        self.capabilities = []
        self._websocket = None
        self.memory = {}
        
    async def on_pre_check(self, params, msg_id):
        pass


class TestExtendedActions(unittest.TestCase):
    """Test all extended action methods."""
    
    def setUp(self):
        self.sentinel = TestSentinel()
        # Mock the websocket
        self.sentinel._websocket = MagicMock()
        self.sentinel._websocket.send = AsyncMock()
    
    def test_send_click(self):
        """Test send_click method."""
        asyncio.run(self.sentinel.send_click("#button"))
        self.sentinel._websocket.send.assert_called_once()
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "click"', call_args)
        self.assertIn('"selector": "#button"', call_args)
    
    def test_send_fill(self):
        """Test send_fill method."""
        asyncio.run(self.sentinel.send_fill("#input", "test text"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "fill"', call_args)
        self.assertIn('"text": "test text"', call_args)
    
    def test_send_select(self):
        """Test send_select method."""
        asyncio.run(self.sentinel.send_select("#dropdown", "option1"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "select"', call_args)
        self.assertIn('"value": "option1"', call_args)
    
    def test_send_hover(self):
        """Test send_hover method."""
        asyncio.run(self.sentinel.send_hover("#menu"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "hover"', call_args)
    
    def test_send_check(self):
        """Test send_check method."""
        asyncio.run(self.sentinel.send_check("#checkbox"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "check"', call_args)
    
    def test_send_uncheck(self):
        """Test send_uncheck method."""
        asyncio.run(self.sentinel.send_uncheck("#checkbox"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "uncheck"', call_args)
    
    def test_send_scroll(self):
        """Test send_scroll method with selector."""
        asyncio.run(self.sentinel.send_scroll("#footer"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "scroll"', call_args)
        self.assertIn('"selector": "#footer"', call_args)
    
    def test_send_scroll_no_selector(self):
        """Test send_scroll method without selector (scroll to bottom)."""
        asyncio.run(self.sentinel.send_scroll())
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "scroll"', call_args)
    
    def test_send_press(self):
        """Test send_press method."""
        asyncio.run(self.sentinel.send_press("Enter"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "press"', call_args)
        self.assertIn('"key": "Enter"', call_args)
    
    def test_send_type(self):
        """Test send_type method."""
        asyncio.run(self.sentinel.send_type("Hello World"))
        call_args = self.sentinel._websocket.send.call_args[0][0]
        self.assertIn('"cmd": "type"', call_args)
        self.assertIn('"text": "Hello World"', call_args)


if __name__ == "__main__":
    print("=" * 50)
    print("Starlight SDK v1.2.0 - Extended Actions Test")
    print("=" * 50)
    
    # Run tests with verbosity
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestExtendedActions)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Summary
    print("\n" + "=" * 50)
    if result.wasSuccessful():
        print("✅ All SDK tests PASSED!")
    else:
        print(f"❌ {len(result.failures)} test(s) FAILED")
    print("=" * 50)
    
    sys.exit(0 if result.wasSuccessful() else 1)
