"""
Starlight CLI - Remove Command
Uninstall a plugin Sentinel.
"""

import os
import json


def load_installed_plugins() -> dict:
    """Load list of installed plugins."""
    path = os.path.join(os.getcwd(), ".starlight_plugins.json")
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {"installed": []}


def save_installed_plugins(data: dict):
    """Save installed plugins list."""
    path = os.path.join(os.getcwd(), ".starlight_plugins.json")
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def execute(name: str):
    """Remove an installed plugin."""
    
    installed = load_installed_plugins()
    
    # Find plugin by name
    plugin = None
    for p in installed.get("installed", []):
        if p["name"] == name:
            plugin = p
            break
    
    if not plugin:
        # Maybe it's a file name?
        sentinels_dir = os.path.join(os.getcwd(), "sentinels")
        if name.endswith('.py'):
            file_path = os.path.join(sentinels_dir, name)
        else:
            file_path = os.path.join(sentinels_dir, f"{name}_sentinel.py")
        
        if os.path.exists(file_path):
            print(f"[Starlight] Warning: '{name}' is not a registered plugin.")
            print(f"  Found file: {file_path}")
            print(f"  To delete manually: Remove-Item {file_path}")
            return False
        
        print(f"[Starlight] ERROR: Plugin '{name}' not found.")
        print(f"\nInstalled plugins:")
        for p in installed.get("installed", []):
            print(f"  - {p['name']}")
        return False
    
    # Remove the sentinel file
    sentinels_dir = os.path.join(os.getcwd(), "sentinels")
    file_path = os.path.join(sentinels_dir, plugin["main"])
    
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"  [*] Removed: sentinels/{plugin['main']}")
    else:
        print(f"  [!] Warning: File not found: {file_path}")
    
    # Remove from registry
    installed["installed"] = [p for p in installed["installed"] if p["name"] != name]
    save_installed_plugins(installed)
    
    print(f"\n[Starlight] ✓ Plugin '{name}' removed successfully.")
    
    return True
