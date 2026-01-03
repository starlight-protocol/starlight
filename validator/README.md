# Starlight Protocol TCK Validator

**Technology Compatibility Kit** for certifying Sentinel implementations.

## Purpose

The TCK Validator acts as a mock Hub to verify that Sentinel implementations correctly follow the Starlight Protocol v1.0.0 specification.

If a Sentinel passes all tests, it earns the **"Starlight v1.0.0 Certified"** badge.

## Usage

### 1. Start the Validator
```bash
node validator/starlight_validator.js
```

The validator starts a mock Hub on port 8090.

### 2. Connect Your Sentinel
Configure your Sentinel to connect to `ws://localhost:8090` and run it.

```bash
# Example: Test the Janitor Sentinel
HUB_URL=ws://localhost:8090 python sentinels/janitor.py
```

### 3. View Results
The validator automatically runs all tests once a Sentinel registers.

```
============================================================
  STARLIGHT PROTOCOL TCK VALIDATOR v1.0.0
============================================================

✅ Valid Registration: JanitorSentinel registered successfully
✅ Pre-check (No Blockers): Sentinel sent starlight.clear
✅ Pre-check (With Blocker): Sentinel responded with starlight.hijack
✅ Malformed JSON Handling: Connection survived malformed JSON
✅ Missing Method Field: Connection survived missing method
✅ Hijack Flow: Hijack reason: "Detected .modal"

============================================================
  RESULTS: 6/6 tests passed
============================================================

  🏆 CERTIFIED: Starlight Protocol v1.0.0 Compliant!
```

## Test Cases

| Test | Description | Pass Criteria |
|------|-------------|---------------|
| Valid Registration | Sentinel sends registration | Has `layer` and `priority` |
| Pre-check (No Blockers) | Hub sends empty blocking array | Sentinel sends `clear` or `wait` |
| Pre-check (With Blocker) | Hub sends blocking element | Sentinel responds appropriately |
| Malformed JSON | Hub sends invalid JSON | Connection remains open |
| Missing Method | Message without `method` field | Connection remains open |
| Hijack Flow | Obstacle-removal capable | Sentinel hijacks with reason |

## Certification Badge

Sentinels that pass all tests can display:

```
✅ Starlight Protocol v1.0.0 Certified
```

## Adding to CI/CD

```yaml
# Example GitHub Actions workflow
test-sentinel:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Start Validator
      run: node validator/starlight_validator.js &
    - name: Run Sentinel
      run: HUB_URL=ws://localhost:8090 python sentinels/your_sentinel.py
```

## License

MIT - See [LICENSE](../LICENSE)
