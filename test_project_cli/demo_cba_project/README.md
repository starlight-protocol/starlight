# test_project_cli\demo_cba_project

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
