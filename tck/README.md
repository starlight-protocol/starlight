# Starlight Protocol Technology Compatibility Kit (TCK)

The TCK provides a standardized test suite for validating compliance with the Starlight Protocol specification.

## Purpose

The TCK ensures that all implementations of the Starlight Protocol behave consistently according to the specification. It tests:

1. **Protocol Compliance** - JSON-RPC 2.0 message format
2. **Lifecycle Events** - Registration, heartbeat, shutdown
3. **Handshake Behavior** - Pre-check, clear, wait, hijack, resume
4. **Security** - JWT authentication, token validation
5. **Performance** - Latency requirements, throughput

## Test Categories

### Level 1: Core Compliance (Required)
- Message format validation
- Registration handshake
- Pre-check/clear flow
- Heartbeat mechanism

### Level 2: Extended Compliance
- Hijack/resume flow
- Context updates
- Entropy stream handling
- Semantic goal resolution

### Level 3: Full Compliance
- Self-healing selectors
- Multi-sentinel coordination
- Security features
- Performance benchmarks

## Running the TCK

### Against JavaScript SDK
```bash
cd tck
npm install
npm run test:js -- --hub-url ws://localhost:8080
```

### Against Python SDK
```bash
cd tck
pip install -r requirements.txt
python run_tck.py --sdk python --hub-url ws://localhost:8080
```

### Against Go SDK
```bash
cd tck
go run ./cmd/tck --sdk go --hub-url ws://localhost:8080
```

### Against Java SDK
```bash
cd tck
mvn test -Dsdk=java -Dhub.url=ws://localhost:8080
```

## Test Results

The TCK generates a compliance report in JSON and HTML format:

```
tck/
├── results/
│   ├── compliance-report.json
│   ├── compliance-report.html
│   └── performance-metrics.json
```

## Certification

Implementations that pass all Level 1 tests are considered "Starlight Protocol Compliant".

Implementations that pass all Level 3 tests are eligible for "Starlight Certified" status.
