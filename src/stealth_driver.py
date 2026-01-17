"""
Stealth Driver for Starlight Protocol (Enterprise-Grade v8.0)
==============================================================
Uses SeleniumBase with undetected-chromedriver (uc=True) for sites with
aggressive bot detection (Akamai, Cloudflare, etc.).

Architecture:
- InputReader Thread: Non-blocking stdin reader
- PriorityQueue: SHUTDOWN > CANCEL > NORMAL commands  
- Protocol Error Codes: Strict Starlight compliance

Communicates with SmartBrowserAdapter.js via stdin/stdout JSON-RPC.
"""

import sys
import json
import time
import random
import base64
import logging
import threading
import queue
from enum import IntEnum
from dataclasses import dataclass, field
from typing import Any, Optional
from seleniumbase import SB
from selenium.common.exceptions import (
    TimeoutException, 
    NoSuchElementException, 
    ElementNotInteractableException,
    StaleElementReferenceException,
    WebDriverException
)

# Configure logging to stderr (stdout is for JSON-RPC)
logging.basicConfig(
    level=logging.INFO,
    format='[StealthDriver] %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# PROTOCOL ERROR CODES (Starlight Compliance)
# ═══════════════════════════════════════════════════════════════════════════════
class ProtocolError(IntEnum):
    NOT_FOUND = -32001
    STALE_INTENT = -32002
    TIMEOUT_EXCEEDED = -32003
    OBSTRUCTED = -32004
    DRIVER_CRASH = -32005


def make_error_response(code: int, message: str, request_id: Any) -> dict:
    """Create JSON-RPC 2.0 compliant error response."""
    return {
        "jsonrpc": "2.0",
        "error": {
            "code": code,
            "message": message
        },
        "id": request_id
    }


def make_success_response(result: dict, request_id: Any) -> dict:
    """Create JSON-RPC 2.0 compliant success response."""
    return {
        "jsonrpc": "2.0",
        "result": result,
        "id": request_id
    }


# ═══════════════════════════════════════════════════════════════════════════════
# COMMAND PRIORITY SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════
class CommandPriority(IntEnum):
    SHUTDOWN = 0    # Highest priority
    CANCEL = 1
    STATE_SYNC = 2  # Cookies/Storage operations
    NORMAL = 3      # Standard commands


@dataclass(order=True)
class PrioritizedCommand:
    priority: int
    request: dict = field(compare=False)


# ═══════════════════════════════════════════════════════════════════════════════
# INPUT READER THREAD
# ═══════════════════════════════════════════════════════════════════════════════
class InputReader(threading.Thread):
    """Dedicated thread for non-blocking stdin reading."""
    
    def __init__(self, cmd_queue: queue.PriorityQueue, stop_event: threading.Event):
        super().__init__(daemon=True)
        self.cmd_queue = cmd_queue
        self.stop_event = stop_event
        self.name = "InputReader"
    
    def run(self):
        logger.info("InputReader started.")
        while not self.stop_event.is_set():
            try:
                line = sys.stdin.readline()
                if not line:
                    logger.info("EOF received on stdin.")
                    self.stop_event.set()
                    break
                
                request = json.loads(line.strip())
                method = request.get("method", "")
                
                # Assign priority based on method
                if method in ("close", "shutdown", "force_kill"):
                    priority = CommandPriority.SHUTDOWN
                elif method == "cancel":
                    priority = CommandPriority.CANCEL
                elif method in ("get_cookies", "set_cookies", "get_storage", "set_storage"):
                    priority = CommandPriority.STATE_SYNC
                else:
                    priority = CommandPriority.NORMAL
                
                self.cmd_queue.put(PrioritizedCommand(priority, request))
                
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON received: {e}")
            except Exception as e:
                logger.error(f"InputReader error: {e}")
        
        logger.info("InputReader stopped.")


# ═══════════════════════════════════════════════════════════════════════════════
# STEALTH DRIVER (Enterprise-Grade)
# ═══════════════════════════════════════════════════════════════════════════════
class StealthDriver:
    """Enterprise-grade wrapper around SeleniumBase for Starlight Protocol."""
    
    def __init__(self):
        self.sb = None
        self._sb_cm = None
        self.driver_initialized = False
        self.lock = threading.Lock()
        self.is_running = True
        self.state = "IDLE"  # IDLE, EXECUTING, ZOMBIE
        
    def initialize(self, headless: bool = False) -> dict:
        """Launch browser with undetected-chromedriver."""
        with self.lock:
            if self.driver_initialized:
                return {"status": "ok", "message": "Already initialized"}
            
            logger.info(f"Initializing SeleniumBase (headless={headless})...")
            # Use headless2 for better stealth (mimics headed better)
            # Use a modern Chrome User-Agent
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            try:
                self._sb_cm = SB(uc=True, headless2=headless, page_load_strategy="normal", ad_block=True, agent=user_agent)
                self.sb = self._sb_cm.__enter__()
                self.driver_initialized = True
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                logger.error(f"Initialization failed: {e}")
                self.state = "ZOMBIE"
                raise

    def goto(self, url: str) -> dict:
        """Navigate to URL with verified completion."""
        with self.lock:
            self.state = "EXECUTING"
            # Random delay to mimic human reaction
            time.sleep(random.uniform(2.0, 5.0))
            try:
                self.sb.open(url)
                actual_url = "unknown"
                for _ in range(5):
                    actual_url = self.sb.get_current_url()
                    if actual_url.startswith("http"):
                        break
                    time.sleep(1)
                
                logger.info(f"Successfully arrived at: {actual_url}")
                self.state = "IDLE"
                if "permission denied" in self.sb.get_page_source().lower():
                    logger.error(f"Access Denied by CDN for: {url}")
                    return {"status": "error", "message": "Permission Denied by CDN (Akamai/Cloudflare)", "code": -32004}

                return {"status": "ok", "url": actual_url}
            except Exception as e:
                self.state = "IDLE"
                raise

    def click(self, selector: str) -> dict:
        """Click element with protocol-compliant error mapping."""
        with self.lock:
            self.state = "EXECUTING"
            logger.info(f"Clicking: {selector}")
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                self.sb.click(selector, by=by, timeout=10)
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                self.state = "IDLE"
                raise

    def fill(self, selector: str, value: str) -> dict:
        """Fill input with protocol-compliant error mapping."""
        with self.lock:
            self.state = "EXECUTING"
            logger.info(f"Filling: {selector}")
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                self.sb.type(selector, value, by=by, timeout=10)
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                self.state = "IDLE"
                raise

    def screenshot(self) -> dict:
        """Capture screenshot as base64."""
        with self.lock:
            try:
                screenshot_b64 = self.sb.driver.get_screenshot_as_base64()
                if not screenshot_b64:
                    return {"status": "error", "message": "Driver returned empty screenshot"}
                return {"status": "ok", "data": screenshot_b64}
            except Exception as e:
                raise

    def evaluate(self, script: str, args: list = None, encoding: str = None) -> dict:
        """Evaluate JS in page."""
        with self.lock:
            try:
                if encoding == 'base64':
                    script = base64.b64decode(script).decode('utf-8')
                
                args = args or []
                logger.info(f"Evaluating script with {len(args)} args: {args}")
                
                result = self.sb.execute_script(script, *args)
                return {"status": "ok", "result": result}
            except Exception as e:
                raise

    def press(self, key: str) -> dict:
        """Press keyboard key, targeting the active focused element."""
        with self.lock:
            logger.info(f"Pressing key: {key}")
            try:
                # Protocol Hardening: Target the *active* element, not just the body.
                # This ensures input fields that have focus receive the keystroke.
                active_element = self.sb.driver.switch_to.active_element
                if active_element:
                    logger.info(f"Targeting active element: {active_element.tag_name}")
                    if key == "Enter":
                        active_element.send_keys(Keys.ENTER)
                    else:
                        active_element.send_keys(key)
                else:
                    # Fallback to body/global if no specific focus
                    logger.info("No active element found, sending to body.")
                    self.sb.press_keys("body", key)
                
                return {"status": "ok"}
            except Exception as e:
                logger.error(f"Press failed: {e}")
                raise

    def scroll(self, selector: str = None) -> dict:
        """Scroll to element or bottom of page."""
        with self.lock:
            try:
                if selector:
                    by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                    self.sb.scroll_to(selector, by=by)
                else:
                    self.sb.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                return {"status": "ok"}
            except Exception as e:
                raise

    def dispatch_event(self, selector: str, event_type: str, detail: dict = None) -> dict:
        """Dispatch a custom event to an element."""
        with self.lock:
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                el = self.sb.get_element(selector, by=by)
                script = "arguments[0].dispatchEvent(new CustomEvent(arguments[1], { detail: arguments[2], bubbles: true }));"
                self.sb.execute_script(script, el, event_type, detail or {})
                return {"status": "ok"}
            except Exception as e:
                raise

    def get_page_text(self) -> dict:
        """Get the text content of the page."""
        with self.lock:
            try:
                text = self.sb.get_text("body")
                return {"status": "ok", "text": text}
            except Exception as e:
                raise

    def get_url(self) -> dict:
        """Get current URL."""
        with self.lock:
            try:
                url = self.sb.get_current_url()
                return {"status": "ok", "url": url}
            except Exception as e:
                raise

    # ═══════════════════════════════════════════════════════════════════════════
    # STATE SYNC COMMANDS (For Hot-Swap Context Bridge)
    # ═══════════════════════════════════════════════════════════════════════════
    def get_cookies(self) -> dict:
        """Extract all cookies for context sync."""
        with self.lock:
            try:
                cookies = self.sb.driver.get_cookies()
                return {"status": "ok", "cookies": cookies}
            except Exception as e:
                raise

    def set_cookies(self, cookies: list) -> dict:
        """Inject cookies for context sync."""
        with self.lock:
            try:
                for cookie in cookies:
                    # Ensure required fields
                    if 'sameSite' not in cookie:
                        cookie['sameSite'] = 'Lax'
                    try:
                        self.sb.driver.add_cookie(cookie)
                    except Exception as cookie_err:
                        logger.warning(f"Failed to set cookie {cookie.get('name')}: {cookie_err}")
                return {"status": "ok", "count": len(cookies)}
            except Exception as e:
                raise

    def get_storage(self) -> dict:
        """Extract localStorage and sessionStorage for context sync."""
        with self.lock:
            try:
                local_storage = self.sb.execute_script(
                    "return JSON.stringify(localStorage);"
                )
                session_storage = self.sb.execute_script(
                    "return JSON.stringify(sessionStorage);"
                )
                return {
                    "status": "ok",
                    "localStorage": json.loads(local_storage) if local_storage else {},
                    "sessionStorage": json.loads(session_storage) if session_storage else {}
                }
            except Exception as e:
                raise

    def set_storage(self, local_storage: dict = None, session_storage: dict = None) -> dict:
        """Inject storage for context sync."""
        with self.lock:
            try:
                if local_storage:
                    for key, value in local_storage.items():
                        self.sb.execute_script(
                            f"localStorage.setItem('{key}', '{value}');"
                        )
                if session_storage:
                    for key, value in session_storage.items():
                        self.sb.execute_script(
                            f"sessionStorage.setItem('{key}', '{value}');"
                        )
                return {"status": "ok"}
            except Exception as e:
                raise

    def close(self) -> dict:
        """Shutdown driver gracefully."""
        with self.lock:
            logger.info("Closing driver...")
            if self._sb_cm:
                try:
                    self._sb_cm.__exit__(None, None, None)
                except Exception as e:
                    logger.warning(f"Error during close: {e}")
            self.driver_initialized = False
            self.is_running = False
            self.state = "IDLE"
            return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# EXCEPTION TO PROTOCOL ERROR MAPPER
# ═══════════════════════════════════════════════════════════════════════════════
def map_exception_to_protocol(e: Exception, selector: str = None) -> tuple:
    """Map Selenium exceptions to Starlight Protocol error codes."""
    error_msg = str(e) or type(e).__name__
    context = f": {selector}" if selector else ""
    
    if isinstance(e, NoSuchElementException) or "no such element" in error_msg.lower():
        return ProtocolError.NOT_FOUND, f"NOT_FOUND{context}"
    
    if isinstance(e, StaleElementReferenceException) or "stale" in error_msg.lower():
        return ProtocolError.STALE_INTENT, f"STALE_INTENT{context}"
    
    if isinstance(e, TimeoutException) or "timeout" in error_msg.lower():
        return ProtocolError.TIMEOUT_EXCEEDED, f"TIMEOUT_EXCEEDED{context}"
    
    if isinstance(e, ElementNotInteractableException) or "not interactable" in error_msg.lower():
        return ProtocolError.OBSTRUCTED, f"OBSTRUCTED{context}"
    
    if isinstance(e, WebDriverException):
        return ProtocolError.DRIVER_CRASH, f"DRIVER_CRASH: {error_msg}"
    
    return ProtocolError.DRIVER_CRASH, error_msg


# ═══════════════════════════════════════════════════════════════════════════════
# COMMAND DISPATCHER
# ═══════════════════════════════════════════════════════════════════════════════
def dispatch_command(driver: StealthDriver, method: str, params: dict) -> dict:
    """Route commands to appropriate driver methods."""
    if method == "initialize":
        return driver.initialize(params.get("headless", False))
    elif method == "goto":
        return driver.goto(params.get("url", ""))
    elif method == "click":
        return driver.click(params.get("selector", ""))
    elif method == "fill":
        return driver.fill(params.get("selector", ""), params.get("value", ""))
    elif method == "screenshot":
        return driver.screenshot()
    elif method == "evaluate":
        return driver.evaluate(params.get("script", ""), params.get("args"), params.get("encoding"))
    elif method == "press":
        return driver.press(params.get("key", ""))
    elif method == "get_page_text":
        return driver.get_page_text()
    elif method == "get_url":
        return driver.get_url()
    elif method == "get_cookies":
        return driver.get_cookies()
    elif method == "set_cookies":
        return driver.set_cookies(params.get("cookies", []))
    elif method == "get_storage":
        return driver.get_storage()
    elif method == "set_storage":
        return driver.set_storage(
            params.get("localStorage"),
            params.get("sessionStorage")
        )
    elif method in ("close", "shutdown", "force_kill"):
        return driver.close()
    else:
        raise ValueError(f"Unknown method: {method}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN EXECUTION LOOP
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    """Enterprise-grade main loop with InputReader and PriorityQueue."""
    driver = StealthDriver()
    cmd_queue = queue.PriorityQueue()
    stop_event = threading.Event()
    
    # Start InputReader thread
    input_reader = InputReader(cmd_queue, stop_event)
    input_reader.start()
    
    logger.info("═" * 60)
    logger.info("Starlight Stealth Driver v8.0 (Enterprise-Grade) Ready.")
    logger.info("═" * 60)
    
    while driver.is_running and not stop_event.is_set():
        try:
            # Non-blocking get with timeout
            try:
                prioritized_cmd = cmd_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            
            request = prioritized_cmd.request
            method = request.get("method", "")
            params = request.get("params", {})
            request_id = request.get("id")
            
            logger.info(f"Executing [{prioritized_cmd.priority}]: {method}")
            
            # Handle shutdown immediately
            if method in ("close", "shutdown", "force_kill"):
                result = driver.close()
                response = make_success_response(result, request_id)
                sys.stdout.write(json.dumps(response) + "\n")
                sys.stdout.flush()
                stop_event.set()
                break
            
            # Execute command with exception handling
            try:
                result = dispatch_command(driver, method, params)
                response = make_success_response(result, request_id)
            except Exception as e:
                selector = params.get("selector")
                code, message = map_exception_to_protocol(e, selector)
                logger.error(f"Command failed: {message}")
                response = make_error_response(code, message, request_id)
            
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            cmd_queue.task_done()
            
        except Exception as e:
            logger.error(f"Main loop error: {e}")
    
    # Graceful shutdown
    logger.info("Draining command queue...")
    while not cmd_queue.empty():
        try:
            cmd_queue.get_nowait()
            cmd_queue.task_done()
        except queue.Empty:
            break
    
    logger.info("Stealth Driver Exit.")
    sys.exit(0)


if __name__ == "__main__":
    main()
