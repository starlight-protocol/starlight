"""
Starlight CLI - List Command
List installed Sentinels and available plugins.
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


def load_registry():
    """Load the official plugin registry."""
    registry_path = os.path.join(os.path.dirname(__file__), '..', 'plugins.json')
    try:
        with open(registry_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"plugins": []}


def execute(show_available: bool = False):
    """List installed sentinels and optionally available plugins."""
    
    sentinels_dir = os.path.join(os.getcwd(), "sentinels")
    installed = load_installed_plugins()
    
    # List installed sentinels
    print("[Starlight] Installed Sentinels:")
    print("-" * 50)
    
    if os.path.exists(sentinels_dir):
        sentinel_files = [f for f in os.listdir(sentinels_dir) 
                         if f.endswith('.py') and not f.startswith('__')]
        
        if sentinel_files:
            # Check which are from plugins
            plugin_names = {p["main"]: p for p in installed.get("installed", [])}
            
            for f in sorted(sentinel_files):
                if f in plugin_names:
                    p = plugin_names[f]
                    print(f"  📦 {f}")
                    print(f"      Plugin: {p['name']} v{p['version']}")
                    if p.get('description'):
                        print(f"      {p['description']}")
                else:
                    print(f"  📄 {f} (local)")
            print()
        else:
            print("  (No sentinels installed)")
            print()
    else:
        print("  (sentinels/ directory not found)")
        print()
    
    # Show available plugins from registry
    if show_available:
        registry = load_registry()
        plugins = registry.get("plugins", [])
        
        if plugins:
            print("[Starlight] Available Plugins (from registry):")
            print("-" * 50)
            
            installed_names = {p["name"] for p in installed.get("installed", [])}
            
            for p in plugins:
                status = "✓ installed" if p["name"] in installed_names else ""
                print(f"  • {p['name']} v{p['version']} {status}")
                print(f"    {p['description']}")
                if p.get('tags'):
                    print(f"    Tags: {', '.join(p['tags'])}")
                print()
            
            print("Install with: starlight install <plugin-name>")
    else:
        print("Tip: Use 'starlight list --available' to see plugins from the registry.")
    
    return True
