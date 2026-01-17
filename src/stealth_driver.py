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
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By

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
        self.last_filled_selector = None  # Protocol: Track for press orchestration
        
    @property
    def is_alive(self) -> bool:
        """Check if the driver connection is still active."""
        if not self.sb or not self.sb.driver:
            return False
        try:
            # Simple lightweight property access to check connection
            _ = self.sb.driver.current_url
            return True
        except Exception:
            return False

    def _safe_driver_call(self, func, *args, retries=2, **kwargs):
        """Execute a driver call with retries and autonomous recovery."""
        last_err = None
        for i in range(retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_err = e
                err_msg = str(e).upper()
                is_connection_error = (
                    "HTTPCONNECTIONPOOL" in err_msg or 
                    "MAX_RETRIES" in err_msg or 
                    "10061" in err_msg or
                    "REFUSED" in err_msg or
                    "BROKEN PIPE" in err_msg
                )
                
                if is_connection_error:
                    logger.warning(f"Driver connection issue (Attempt {i+1}/{retries+1}): {e}")
                    if i == retries: # Last retry failed - try recovery
                        logger.error("All retries failed. Attempting Autonomous Recovery...")
                        if self.recover():
                            # One final attempt after recovery
                            try:
                                return func(*args, **kwargs)
                            except Exception as re:
                                raise re
                    time.sleep(1.5 * (i + 1))
                    continue
                raise
        raise last_err

    def recover(self) -> bool:
        """Emergency autonomous recovery of driver context."""
        with self.lock:
            logger.warning("Initializing Autonomous Recovery Protocol...")
            try:
                # 1. Cleanup old context if possible
                if self._sb_cm:
                    try:
                        self._sb_cm.__exit__(None, None, None)
                    except:
                        pass
                
                # Force kill any dangling chromedriver/chrome processes for this specific port
                # (Optional: might be too risky, let's stick to clean object reset first)
                
                # 2. Reset state completely
                self.driver_initialized = False
                self.sb = None
                self._sb_cm = None
                
                # Small cooldown to allow process cleanup
                time.sleep(2.0)
                
                # 3. Re-initialize
                logger.info("Re-initializing Stealth context...")
                result = self.initialize(headless=self.headless)
                if result["status"] == "ok":
                    logger.info("Autonomous Recovery Successful.")
                    time.sleep(3.0) # Grace period for CP to stabilize
                    return True
                return False
            except Exception as e:
                logger.error(f"Autonomous Recovery Failed: {e}")
                return False

    # ═══════════════════════════════════════════════════════════════════════════════
    # SELF-HEALING DRIVER LIFECYCLE (Enterprise Phase 12)
    # ═══════════════════════════════════════════════════════════════════════════════
    def _sanitize_environment(self):
        """
        Aggressively cleans up zombie processes that lock ports.
        This is the 'Nuclear Option' for reliable startup.
        """
        import subprocess
        logger.warning("SANITIZER: Hunting for zombie processes...")
        
        # Kill Command List - Order matters (Driver first, then Browser)
        targets = ["chromedriver.exe", "chrome.exe"]
        
        for target in targets:
            try:
                # /F = Force, /IM = Image Name
                # We ignore errors because the process might not exist, which is fine.
                subprocess.run(
                    ["taskkill", "/F", "/IM", target], 
                    stdout=subprocess.DEVNULL, 
                    stderr=subprocess.DEVNULL
                )
                logger.info(f"SANITIZER: Terminated {target}")
            except Exception as e:
                logger.warning(f"SANITIZER: Failed to kill {target}: {e}")
        
        # Mandatory cool-down to allow OS to release TCP ports
        time.sleep(2.0)

    def initialize(self, headless: bool = False) -> dict:
        """Launch browser with robust retry & self-healing logic."""
        with self.lock:
            self.headless = headless
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            
            # ATTEMPT 1: Optimistic Launch
            try:
                logger.info(f"Initializing SeleniumBase (headless={headless})...")
                self._sb_cm = SB(uc=True, headless2=headless, page_load_strategy="normal", ad_block=True, agent=user_agent)
                self.sb = self._sb_cm.__enter__()
                self.driver_initialized = True
                self.state = "IDLE"
                logger.info("SeleniumBase Initialization Successful.")
                return {"status": "ok"}
            except Exception as e:
                err_str = str(e)
                if "10061" in err_str or "refused" in err_str.lower() or "timeout" in err_str.lower():
                    logger.warning(f"Initialization Failed (Port Conflict/Zombie): {e}")
                    
                    # ATTEMPT 2: Self-Healing Launch
                    logger.warning("TRIGGERING SELF-HEALING PROTOCOL...")
                    self._sanitize_environment()
                    
                    try:
                        logger.info("Retrying Initialization after Sanitation...")
                        self._sb_cm = SB(uc=True, headless2=headless, page_load_strategy="normal", ad_block=True, agent=user_agent)
                        self.sb = self._sb_cm.__enter__()
                        self.driver_initialized = True
                        self.state = "IDLE"
                        logger.info("Self-Healing Successful: Driver Initialized.")
                        return {"status": "ok"}
                    except Exception as retry_e:
                        logger.error(f"CRITICAL: Self-Healing Failed: {retry_e}")
                        self.state = "ZOMBIE"
                        return {"status": "error", "message": f"Critical Failure after Sanitation: {retry_e}"}
                else:
                    # Non-recoverable error
                    logger.error(f"Initialization failed (Non-Recoverable): {e}")
                    self.state = "ZOMBIE"
                    return {"status": "error", "message": str(e)}

    def goto(self, url: str) -> dict:
        """Navigate to URL with autonomous safety wrappers."""
        with self.lock:
            self.state = "EXECUTING"
            logger.info(f"Navigating to: {url}")
            try:
                self._safe_driver_call(self.sb.open, url)
                # YouTube specific: wait for settle
                time.sleep(2)
                self.state = "IDLE"
                return {"status": "ok", "url": url}
            except Exception as e:
                logger.error(f"Navigation failed: {e}")
                self.state = "IDLE"
                return {"status": "error", "message": str(e), "code": -32001}

    def click(self, selector: str) -> dict:
        """Click element with minimum driver overhead."""
        with self.lock:
            self.state = "EXECUTING"
            logger.info(f"Clicking: {selector}")
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                self._safe_driver_call(self.sb.click, selector, by=by, timeout=15)
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                self.state = "IDLE"
                return {"status": "error", "message": str(e), "code": -32002}

    def fill(self, selector: str, value: str) -> dict:
        """Fill input with robust focus and state preservation."""
        with self.lock:
            self.state = "EXECUTING"
            logger.info(f"Filling: {selector}")
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                # Robust Pattern: Focus -> Clear -> Type
                self._safe_driver_call(self.sb.click, selector, by=by, timeout=10)
                self._safe_driver_call(self.sb.update_text, selector, value, by=by, timeout=10)
                self.last_filled_selector = selector
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                self.state = "IDLE"
                return {"status": "error", "message": str(e), "code": -32003}

    def type(self, text: str, selector: str = None) -> dict:
        """Type text into element or active element if no selector."""
        with self.lock:
            self.state = "EXECUTING"
            try:
                if selector:
                    logger.info(f"Typing into {selector}: {text}")
                    by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                    self._safe_driver_call(self.sb.type, selector, text, by=by, timeout=15)
                    self.last_filled_selector = selector
                else:
                    logger.info(f"Typing into active element: {text}")
                    active_element = self._safe_driver_call(lambda: self.sb.driver.switch_to.active_element)
                    self._safe_driver_call(active_element.send_keys, text)
                
                self.state = "IDLE"
                return {"status": "ok"}
            except Exception as e:
                self.state = "IDLE"
                logger.error(f"Type failed: {e}")
                return {"status": "error", "message": str(e)}

    def screenshot(self) -> dict:
        """Capture screenshot with minimum overhead."""
        with self.lock:
            try:
                data = self._safe_driver_call(self.sb.driver.get_screenshot_as_base64)
                return {"status": "ok", "data": data}
            except Exception as e:
                logger.warning(f"Screenshot failed: {e}")
                dummy_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
                return {"status": "ok", "data": dummy_data} 

    def evaluate(self, script: str, args: list = None, encoding: str = None) -> dict:
        """Evaluate JS in page."""
        with self.lock:
            try:
                if encoding == 'base64':
                    script = base64.b64decode(script).decode('utf-8')
                args = args or []
                result = self._safe_driver_call(self.sb.execute_script, script, *args)
                return {"status": "ok", "result": result}
            except Exception as e:
                return {"status": "error", "message": str(e)}

    def _dispatch_keyboard_event(self, selector: str, event_type: str, key: str) -> bool:
        """Dispatch proper KeyboardEvent via JavaScript for maximum React compatibility."""
        script = """
        (function(sel, eventType, key) {
            const el = sel ? document.querySelector(sel) : document.activeElement;
            if (el) {
                const event = new KeyboardEvent(eventType, {
                    key: key,
                    code: key === 'Enter' ? 'Enter' : key,
                    keyCode: key === 'Enter' ? 13 : 0,
                    which: key === 'Enter' ? 13 : 0,
                    bubbles: true,
                    cancelable: true
                });
                el.dispatchEvent(event);
                return true;
            }
            return false;
        })(arguments[0], arguments[1], arguments[2]);
        """
        try:
            return self._safe_driver_call(self.sb.execute_script, script, selector, event_type, key)
        except:
            return False

    def press(self, key: str, selector: str = None) -> dict:
        """Press keyboard key with robust semantic verification and case-insensitivity."""
        logger.info(f"Executing press: {key} (Selector: {selector})")
        with self.lock:
            try:
                # Case-insensitive mapping for all common keys
                key_map = {
                    "enter": Keys.ENTER,
                    "return": Keys.RETURN,
                    "tab": Keys.TAB,
                    "space": Keys.SPACE,
                    "escape": Keys.ESCAPE,
                    "backspace": Keys.BACKSPACE,
                    "delete": Keys.DELETE,
                    "arrowup": Keys.ARROW_UP,
                    "arrowdown": Keys.ARROW_DOWN,
                    "arrowleft": Keys.ARROW_LEFT,
                    "arrowright": Keys.ARROW_RIGHT,
                }
                
                # Normalize key for mapping
                normalized_key = key.lower()
                selenium_key = key_map.get(normalized_key, key)
                
                # Identify Target Element
                if selector:
                    logger.info(f"Targeting specific selector for press: {selector}")
                    by = "xpath" if selector.startswith("//") else "css selector"
                    target_elem = self._safe_driver_call(self.sb.find_element, selector, by=by)
                else:
                    # Fallback to active element OR last filled element
                    target_elem = self._safe_driver_call(lambda: self.sb.driver.switch_to.active_element)
                    
                tag = target_elem.tag_name.lower()
                
                # If active element is body but we have a last filled, prefer that for Enter/Tab
                if not selector and tag in ['body', 'html'] and self.last_filled_selector:
                    logger.info(f"Active element is {tag}, targeting last filled: {self.last_filled_selector}")
                    by = "xpath" if self.last_filled_selector.startswith("//") else "css selector"
                    target_elem = self._safe_driver_call(self.sb.find_element, self.last_filled_selector, by=by)
                
                # Ensure focus before keypress
                try:
                    target_elem.click()
                except:
                    pass
                
                # Perform JS-based Event Dispatch for Enter (React/Vue compatibility)
                if normalized_key in ["enter", "return"]:
                    logger.info("Using JS keyboard event polyfill for Enter")
                    self._dispatch_keyboard_event(selector, 'keydown', 'Enter')
                    self._dispatch_keyboard_event(selector, 'keypress', 'Enter')
                    self._dispatch_keyboard_event(selector, 'keyup', 'Enter')
                    time.sleep(1.0) # Wait for processing
                else:
                    # Fallback to native send_keys for other keys
                    self._safe_driver_call(target_elem.send_keys, selenium_key)
                
                # Semantic Verification for Search Flow
                if normalized_key in ["enter", "return"] and (tag == "input" or selector and "search" in selector.lower()):
                    time.sleep(1.5) # Wait for animation/navigation
                    try:
                        # If still on same page and search button remains, click it
                        search_btns = self.sb.find_elements("#search-icon-legacy, button[aria-label*='search' i]")
                        if search_btns and search_btns[0].is_displayed():
                            logger.info("Universal Search Fallback: Clicking search button")
                            self._safe_driver_call(search_btns[0].click)
                    except:
                        pass
                
                return {"status": "ok"}
            except Exception as e:
                logger.error(f"Press failed: {e}")
                return {"status": "error", "message": str(e)}

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
                return {"status": "error", "message": str(e)}

    def dispatch_event(self, selector: str, event_type: str, detail: dict = None) -> dict:
        """Dispatch a custom event."""
        with self.lock:
            try:
                by = "xpath" if selector.startswith("//") or selector.startswith("(") else "css selector"
                el = self.sb.get_element(selector, by=by)
                self.sb.execute_script("arguments[0].dispatchEvent(new CustomEvent(arguments[1], { detail: arguments[2], bubbles: true }));", el, event_type, detail or {})
                return {"status": "ok"}
            except Exception as e:
                return {"status": "error", "message": str(e)}

    def get_page_text(self) -> dict:
        """Get page text."""
        with self.lock:
            try:
                return {"status": "ok", "text": self.sb.get_text("body")}
            except Exception as e:
                return {"status": "error", "message": str(e)}

    def get_url(self) -> dict:
        """Get current URL."""
        with self.lock:
            try:
                return {"status": "ok", "url": self.sb.get_current_url()}
            except Exception as e:
                return {"status": "error", "message": str(e)}

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
    elif method == "execute_script":
        return driver.execute_script(params.get("script", ""))
    elif method == "fill":
        return driver.fill(params.get("selector", ""), params.get("value", ""))
    elif method == "type":
        return driver.type(params.get("text", ""), params.get("selector"))
    elif method == "screenshot":
        return driver.screenshot()
    elif method == "evaluate":
        return driver.evaluate(params.get("script", ""), params.get("args"), params.get("encoding"))
    elif method == "press":
        return driver.press(params.get("key", ""), params.get("selector"))
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
