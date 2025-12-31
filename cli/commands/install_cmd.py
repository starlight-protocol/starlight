"""
Starlight CLI - Install Command
Install Sentinels from GitHub or local paths.
"""

import os
import json
import shutil
import subprocess
import tempfile
import re


def load_registry():
    """Load the official plugin registry."""
    registry_path = os.path.join(os.path.dirname(__file__), '..', 'plugins.json')
    try:
        with open(registry_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[Starlight] Warning: Could not load registry: {e}")
        return {"plugins": []}


def find_plugin_in_registry(name: str):
    """Find a plugin by name in the registry."""
    registry = load_registry()
    for plugin in registry.get("plugins", []):
        if plugin.get("name") == name:
            return plugin
    return None


def is_github_url(source: str) -> bool:
    """Check if source is a GitHub URL."""
    return source.startswith("https://github.com/") or source.startswith("git@github.com:")


def clone_repo(url: str, dest: str) -> bool:
    """Clone a GitHub repository."""
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", url, dest],
            capture_output=True, text=True, timeout=60
        )
        return result.returncode == 0
    except FileNotFoundError:
        print("[Starlight] ERROR: Git is not installed.")
        return False
    except subprocess.TimeoutExpired:
        print("[Starlight] ERROR: Git clone timed out.")
        return False
    except Exception as e:
        print(f"[Starlight] ERROR: Clone failed: {e}")
        return False


def validate_plugin(plugin_dir: str) -> dict:
    """Validate a plugin directory has required files."""
    manifest_path = os.path.join(plugin_dir, "plugin.json")
    
    if not os.path.exists(manifest_path):
        return None
    
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        # Validate required fields
        required = ["name", "version", "main"]
        for field in required:
            if field not in manifest:
                print(f"[Starlight] ERROR: plugin.json missing required field: {field}")
                return None
        
        # Check main file exists
        main_file = os.path.join(plugin_dir, manifest["main"])
        if not os.path.exists(main_file):
            print(f"[Starlight] ERROR: Main file not found: {manifest['main']}")
            return None
        
        return manifest
    except json.JSONDecodeError as e:
        print(f"[Starlight] ERROR: Invalid plugin.json: {e}")
        return None


def get_installed_plugins_path():
    """Get path to installed plugins tracker."""
    return os.path.join(os.getcwd(), ".starlight_plugins.json")


def load_installed_plugins() -> dict:
    """Load list of installed plugins."""
    path = get_installed_plugins_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {"installed": []}


def save_installed_plugins(data: dict):
    """Save installed plugins list."""
    path = get_installed_plugins_path()
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def execute(source: str):
    """Install a plugin from GitHub or by name."""
    
    # Check if source is a registered plugin name
    if not is_github_url(source) and not os.path.isabs(source):
        plugin = find_plugin_in_registry(source)
        if plugin:
            print(f"[Starlight] Found '{source}' in registry: {plugin['description']}")
            source = plugin["source"]
        else:
            print(f"[Starlight] ERROR: Plugin '{source}' not found in registry.")
            print(f"  Use a GitHub URL or one of the registered plugins:")
            registry = load_registry()
            for p in registry.get("plugins", [])[:5]:
                print(f"    - {p['name']}: {p['description']}")
            return False
    
    print(f"[Starlight] Installing plugin from: {source}")
    
    # Create temp directory for cloning
    with tempfile.TemporaryDirectory() as temp_dir:
        clone_dest = os.path.join(temp_dir, "plugin")
        
        if is_github_url(source):
            print(f"  [*] Cloning repository...")
            if not clone_repo(source, clone_dest):
                print(f"[Starlight] ERROR: Failed to clone {source}")
                return False
        else:
            # Local path
            if os.path.isdir(source):
                clone_dest = source
            else:
                print(f"[Starlight] ERROR: Source not found: {source}")
                return False
        
        # Validate plugin
        print(f"  [*] Validating plugin...")
        manifest = validate_plugin(clone_dest)
        if not manifest:
            print(f"[Starlight] ERROR: Invalid plugin. Missing plugin.json or main file.")
            print(f"  Plugins must have a plugin.json with: name, version, main")
            return False
        
        # Check if already installed
        installed = load_installed_plugins()
        for p in installed.get("installed", []):
            if p["name"] == manifest["name"]:
                print(f"[Starlight] Plugin '{manifest['name']}' is already installed.")
                print(f"  Use 'starlight remove {manifest['name']}' first to reinstall.")
                return False
        
        # Copy sentinel file to sentinels/
        sentinels_dir = os.path.join(os.getcwd(), "sentinels")
        if not os.path.exists(sentinels_dir):
            os.makedirs(sentinels_dir)
        
        main_src = os.path.join(clone_dest, manifest["main"])
        main_dest = os.path.join(sentinels_dir, manifest["main"])
        
        print(f"  [*] Installing {manifest['main']} to sentinels/...")
        shutil.copy2(main_src, main_dest)
        
        # Register installation
        installed["installed"].append({
            "name": manifest["name"],
            "version": manifest["version"],
            "main": manifest["main"],
            "source": source,
            "description": manifest.get("description", "")
        })
        save_installed_plugins(installed)
        
        print(f"\n[Starlight] ✓ Plugin '{manifest['name']}' v{manifest['version']} installed!")
        print(f"  File: sentinels/{manifest['main']}")
        print(f"\n  To use: python sentinels/{manifest['main']}")
        
        return True
