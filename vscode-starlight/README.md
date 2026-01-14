# Starlight Protocol VS Code Extension

🛰️ Visual Studio Code extension for the Starlight Protocol autonomous browser automation framework.

## Features

### 🎨 Syntax Highlighting
- `.warp` file syntax highlighting
- Starlight API method highlighting in JavaScript/TypeScript
- Semantic goal highlighting

### 📝 Snippets
- **JavaScript**: `starlightRunner`, `clickGoal`, `fillGoal`, `starlightMission`
- **Python**: `starlightSentinel`, `sendClear`, `sendHijack`, `onPreCheck`

### 🎛️ Commands
- **Starlight: Start Hub** - Start the Hub server
- **Starlight: Stop Hub** - Disconnect from Hub
- **Starlight: Run Mission** - Execute selected mission file
- **Starlight: Open Mission Control** - Open web UI
- **Starlight: Create New Sentinel** - Generate sentinel boilerplate
- **Starlight: Open Time-Travel Triage** - Debug missions

### 📊 Sidebar Views
- **Sentinels** - Browse and open sentinel files
- **Missions** - Browse and run mission files
- **Hub Status** - Connection and configuration status

### ⚙️ Configuration
```json
{
    "starlight.hubUrl": "ws://localhost:8080",
    "starlight.missionControlUrl": "http://localhost:3000",
    "starlight.autoStartHub": false,
    "starlight.headless": false,
    "starlight.browser": "chromium"
}
```

## Installation

### From VSIX (Local)
```bash
cd vscode-starlight
npm install
npm run compile
npm run package
code --install-extension starlight-protocol-0.1.0.vsix
```

### From Marketplace (Coming Soon)
Search for "Starlight Protocol" in the VS Code Extensions view.

## Usage

1. Open a Starlight project in VS Code
2. The extension activates automatically
3. Use the Starlight sidebar (🛰️ icon) to manage sentinels and missions
4. Right-click on `.intent.js` files to run missions
5. Use snippets by typing `starlight` + Tab

## Screenshots

[Coming soon]

## Requirements

- VS Code 1.85.0+
- Node.js 18+ (for Hub)
- Python 3.9+ (for Sentinels)

## License

MIT
