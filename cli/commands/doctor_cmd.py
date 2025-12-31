"""
Starlight CLI - Doctor Command
Validates the development environment for CBA.
"""

import subprocess
import sys
import shutil
import os


def check_command(cmd: list, version_flag: str = "--version") -> tuple:
    """Check if a command exists and get its version."""
    try:
        result = subprocess.run(
            cmd + [version_flag],
            capture_output=True, text=True, timeout=10
        )
        output = result.stdout.strip() or result.stderr.strip()
        # Extract first line (usually contains version)
        version = output.split('\n')[0] if output else "Unknown"
        return True, version
    except FileNotFoundError:
        return False, "Not installed"
    except subprocess.TimeoutExpired:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_npm_package(package: str) -> tuple:
    """Check if an npm package is installed."""
    try:
        result = subprocess.run(
            ["npm", "list", package, "--depth=0"],
            capture_output=True, text=True, timeout=10
        )
        if package in result.stdout:
            # Extract version
            for line in result.stdout.split('\n'):
                if package in line:
                    return True, line.strip()
            return True, "Installed"
        return False, "Not installed"
    except Exception as e:
        return False, str(e)


def check_pip_package(package: str) -> tuple:
    """Check if a pip package is installed."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", package],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            for line in result.stdout.split('\n'):
                if line.startswith("Version:"):
                    return True, line.split(":")[1].strip()
            return True, "Installed"
        return False, "Not installed"
    except Exception as e:
        return False, str(e)


def execute():
    """Run environment diagnostics."""
    print("[Starlight] Running Environment Diagnostics...\n")
    
    all_ok = True
    warnings = []
    
    # === Required Checks ===
    print("=== Required ===")
    
    # Node.js
    ok, version = check_command(["node"])
    status = "[OK]" if ok else "[FAIL]"
    print(f"  {status} Node.js: {version}")
    if ok:
        # Check version >= 18
        try:
            major = int(version.replace("v", "").split(".")[0])
            if major < 18:
                print(f"       [WARN] Node.js 18+ recommended, found {major}")
                warnings.append("Upgrade Node.js to version 18+")
        except:
            pass
    else:
        all_ok = False
    
    # Python
    ok, version = check_command([sys.executable])
    status = "[OK]" if ok else "[FAIL]"
    print(f"  {status} Python: {version}")
    if not ok:
        all_ok = False
    
    # npm
    ok, version = check_command(["npm"])
    status = "[OK]" if ok else "[FAIL]"
    print(f"  {status} npm: {version}")
    if not ok:
        all_ok = False
    
    # Playwright (npm)
    ok, version = check_npm_package("playwright")
    status = "[OK]" if ok else "[FAIL]"
    print(f"  {status} playwright (npm): {version}")
    if not ok:
        all_ok = False
        warnings.append("Run: npm install playwright && npx playwright install chromium")
    
    # websockets (pip)
    ok, version = check_pip_package("websockets")
    status = "[OK]" if ok else "[FAIL]"
    print(f"  {status} websockets (pip): {version}")
    if not ok:
        all_ok = False
        warnings.append("Run: pip install websockets")
    
    # === Optional Checks ===
    print("\n=== Optional ===")
    
    # Docker
    ok, version = check_command(["docker"])
    status = "[OK]" if ok else "[--]"
    print(f"  {status} Docker: {version}")
    
    # Ollama (for Vision Sentinel)
    ok, version = check_command(["ollama"])
    status = "[OK]" if ok else "[--]"
    print(f"  {status} Ollama: {version}")
    if ok:
        # Check for moondream model
        try:
            result = subprocess.run(
                ["ollama", "list"],
                capture_output=True, text=True, timeout=10
            )
            if "moondream" in result.stdout:
                print(f"       [OK] moondream model available")
            else:
                print(f"       [--] moondream model not found (run: ollama pull moondream)")
        except:
            pass
    
    # === Project Checks ===
    print("\n=== Project Structure ===")
    
    cwd = os.getcwd()
    required_files = [
        ("src/hub.js", "Hub"),
        ("sdk/starlight_sdk.py", "SDK"),
        ("config.json", "Config"),
        ("package.json", "Package"),
    ]
    
    for filepath, name in required_files:
        exists = os.path.exists(os.path.join(cwd, filepath))
        status = "[OK]" if exists else "[--]"
        print(f"  {status} {filepath}: {name}")
    
    # Sentinels count
    sentinels_dir = os.path.join(cwd, "sentinels")
    if os.path.exists(sentinels_dir):
        sentinel_count = len([f for f in os.listdir(sentinels_dir) if f.endswith('.py') and not f.startswith('__')])
        print(f"  [OK] sentinels/: {sentinel_count} sentinel(s) found")
    else:
        print(f"  [--] sentinels/: Directory not found")
    
    # === Summary ===
    print("\n" + "=" * 40)
    if all_ok:
        print("[Starlight] Environment is READY for CBA!")
    else:
        print("[Starlight] Some requirements are missing.")
    
    if warnings:
        print("\nSuggested actions:")
        for i, warn in enumerate(warnings, 1):
            print(f"  {i}. {warn}")
    
    return all_ok
