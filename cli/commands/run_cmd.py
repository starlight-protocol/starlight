"""
Starlight CLI - Run Command
Launches the full CBA constellation (Hub + Sentinels).
"""

import os
import sys
import subprocess
import signal
import time
import socket


def is_port_in_use(port: int) -> bool:
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def kill_process_on_port(port: int):
    """Kill any process using the specified port (Windows-specific)."""
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                f'netstat -aon | findstr :{port}',
                shell=True, capture_output=True, text=True
            )
            for line in result.stdout.strip().split('\n'):
                if f':{port}' in line:
                    parts = line.split()
                    if len(parts) >= 5:
                        pid = parts[-1]
                        if pid.isdigit():
                            subprocess.run(f'taskkill /f /pid {pid}', shell=True, capture_output=True)
                            print(f"  [*] Killed process {pid} on port {port}")
        except Exception as e:
            print(f"  [!] Could not kill process on port {port}: {e}")
    else:
        # Unix-like systems
        try:
            subprocess.run(f'lsof -ti:{port} | xargs kill -9', shell=True, capture_output=True)
        except Exception:
            pass


def discover_sentinels(sentinels_dir: str) -> list:
    """Find all Python sentinel files in the sentinels directory."""
    sentinels = []
    if os.path.exists(sentinels_dir):
        for filename in os.listdir(sentinels_dir):
            if filename.endswith('.py') and not filename.startswith('__') and not filename.startswith('test'):
                sentinels.append(os.path.join(sentinels_dir, filename))
    return sentinels


def execute(intent: str = None, no_sentinels: bool = False):
    """Launch the CBA constellation."""
    print("[Starlight] Launching Constellation...")
    
    # Check for required files
    hub_path = os.path.join(os.getcwd(), "src", "hub.js")
    if not os.path.exists(hub_path):
        print("[Starlight] ERROR: src/hub.js not found. Are you in a CBA project directory?")
        return False
    
    # Clean up port 8080
    if is_port_in_use(8080):
        print("  [*] Port 8080 in use, cleaning up...")
        kill_process_on_port(8080)
        time.sleep(1)
    
    processes = []
    
    try:
        # 1. Launch Hub
        print("  [+] Starting Hub (node src/hub.js)...")
        if sys.platform == "win32":
            hub_process = subprocess.Popen(
                ["node", "src/hub.js"],
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            hub_process = subprocess.Popen(
                ["node", "src/hub.js"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
        processes.append(("Hub", hub_process))
        time.sleep(2)  # Wait for Hub to initialize
        
        # 2. Launch Sentinels (unless --no-sentinels)
        if not no_sentinels:
            sentinels_dir = os.path.join(os.getcwd(), "sentinels")
            sentinel_files = discover_sentinels(sentinels_dir)
            
            for sentinel_path in sentinel_files:
                sentinel_name = os.path.basename(sentinel_path)
                print(f"  [+] Starting Sentinel: {sentinel_name}...")
                
                if sys.platform == "win32":
                    sentinel_process = subprocess.Popen(
                        ["python", sentinel_path],
                        creationflags=subprocess.CREATE_NEW_CONSOLE
                    )
                else:
                    sentinel_process = subprocess.Popen(
                        ["python", sentinel_path],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE
                    )
                processes.append((sentinel_name, sentinel_process))
                time.sleep(1)  # Stagger sentinel launches
        
        # 3. Run Intent (if provided)
        if intent:
            intent_path = intent if os.path.isabs(intent) else os.path.join(os.getcwd(), intent)
            if not os.path.exists(intent_path):
                print(f"[Starlight] ERROR: Intent script not found: {intent}")
            else:
                print(f"  [+] Executing Intent: {intent}...")
                time.sleep(2)  # Wait for Sentinels to register
                subprocess.run(["node", intent_path])
        
        # If no intent, keep constellation running
        if not intent:
            print("\n[Starlight] Constellation is running. Press Ctrl+C to stop.")
            try:
                while True:
                    time.sleep(1)
                    # Check if Hub is still running
                    if hub_process.poll() is not None:
                        print("[Starlight] Hub has stopped.")
                        break
            except KeyboardInterrupt:
                print("\n[Starlight] Shutting down constellation...")
        
    except Exception as e:
        print(f"[Starlight] ERROR: {e}")
    finally:
        # Cleanup: terminate all processes
        for name, proc in processes:
            if proc.poll() is None:
                proc.terminate()
                print(f"  [-] Stopped: {name}")
    
    print("[Starlight] Constellation stopped.")
    return True
