"""
Starlight CLI - Init Command
Scaffolds a new CBA project directory with all required files.
"""

import os
import shutil
import json


# Templates embedded directly to avoid external file dependencies
TEMPLATES = {
    "config.json": """{
    "hub": {
        "port": 8080,
        "syncBudget": 30000,
        "missionTimeout": 180000,
        "heartbeatTimeout": 5000,
        "lockTTL": 5000,
        "entropyThrottle": 100,
        "screenshotMaxAge": 86400000,
        "traceMaxEvents": 500
    },
    "aura": {
        "predictiveWaitMs": 1500,
        "bucketSizeMs": 500
    },
    "sentinel": {
        "settlementWindow": 1.0,
        "reconnectDelay": 3,
        "heartbeatInterval": 2
    },
    "vision": {
        "model": "moondream",
        "timeout": 25,
        "ollamaUrl": "http://localhost:11434/api/generate"
    },
    "pii": {
        "mode": "alert",
        "patterns": {}
    },
    "network": {
        "chaos": {
            "enabled": false,
            "latencyMs": 0,
            "blockPatterns": []
        }
    }
}""",

    "package.json": """{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "description": "CBA Project - Constellation Based Automation",
  "main": "src/hub.js",
  "scripts": {
    "start": "node src/hub.js",
    "test": "echo \\"Run your intent scripts with node test/intent.js\\""
  },
  "keywords": ["automation", "browser", "playwright", "self-healing", "AI", "sentinel"],
  "license": "MIT",
  "type": "commonjs",
  "dependencies": {
    "nanoid": "^5.1.6",
    "playwright": "^1.57.0",
    "ws": "^8.18.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}""",

    "requirements.txt": """websockets>=12.0
""",

    "docker-compose.yml": """version: '3.8'

services:
  hub:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./mission_trace.json:/app/mission_trace.json
      - ./report.html:/app/report.html
      - ./screenshots:/app/screenshots
    environment:
      - PWDEBUG=0
    restart: always
""",

    "README.md": """# {{PROJECT_NAME}}

A CBA (Constellation Based Automation) project using the Starlight Protocol.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   pip install -r requirements.txt
   npx playwright install chromium
   ```

2. Start the Hub:
   ```bash
   npm start
   ```

3. In a separate terminal, start your Sentinels:
   ```bash
   python sentinels/your_sentinel.py
   ```

4. Run your intent script:
   ```bash
   node test/intent.js
   ```

## Structure

- `src/hub.js` - The central Hub orchestrator
- `sdk/` - Starlight SDK for building Sentinels
- `sentinels/` - Your custom Sentinel agents
- `test/` - Intent scripts and test HTML pages
- `config.json` - Centralized configuration

## Documentation

See the [CBA Documentation](https://github.com/godhiraj-code/cba) for more details.
""",

    ".gitignore": """node_modules/
__pycache__/
*.pyc
screenshots/
mission_trace.json
report.html
*.log
.env
"""
}


def execute(name: str):
    """Create a new CBA project directory."""
    project_path = os.path.abspath(name)
    
    if os.path.exists(project_path):
        print(f"[Starlight] ERROR: Directory '{name}' already exists.")
        return False
    
    print(f"[Starlight] Initializing new CBA project: {name}")
    
    # Create directory structure
    dirs = [
        project_path,
        os.path.join(project_path, "src"),
        os.path.join(project_path, "sdk"),
        os.path.join(project_path, "sentinels"),
        os.path.join(project_path, "test"),
        os.path.join(project_path, "screenshots"),
    ]
    
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        print(f"  [+] Created: {os.path.relpath(d, os.getcwd())}/")
    
    # Write template files
    for filename, content in TEMPLATES.items():
        filepath = os.path.join(project_path, filename)
        content = content.replace("{{PROJECT_NAME}}", name)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  [+] Created: {filename}")
    
    # Copy SDK from current project (if running from CBA root)
    current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sdk_source = os.path.join(current_dir, "sdk", "starlight_sdk.py")
    
    if os.path.exists(sdk_source):
        sdk_dest = os.path.join(project_path, "sdk", "starlight_sdk.py")
        shutil.copy2(sdk_source, sdk_dest)
        
        # Also copy __init__.py
        init_dest = os.path.join(project_path, "sdk", "__init__.py")
        with open(init_dest, "w") as f:
            f.write("# Starlight SDK\n")
        
        print(f"  [+] Copied: sdk/starlight_sdk.py")
    else:
        print(f"  [!] Warning: Could not find SDK source to copy. Run from CBA root.")
    
    # Copy Hub from current project
    hub_source = os.path.join(current_dir, "src", "hub.js")
    if os.path.exists(hub_source):
        hub_dest = os.path.join(project_path, "src", "hub.js")
        shutil.copy2(hub_source, hub_dest)
        print(f"  [+] Copied: src/hub.js")
    else:
        print(f"  [!] Warning: Could not find hub.js source to copy.")
    
    print(f"\n[Starlight] Project '{name}' initialized successfully!")
    print(f"\nNext steps:")
    print(f"  cd {name}")
    print(f"  npm install")
    print(f"  pip install -r requirements.txt")
    print(f"  npx playwright install chromium")
    print(f"  python -m cli.main create my_sentinel")
    
    return True
