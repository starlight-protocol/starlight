# Starlight Protocol - Feature Verification Checklist

> **MANDATORY**: All items must pass before pushing any feature code.

---

## 1. Protocol Compliance Tests

### 1.1 Message Format (Spec §4)
- [ ] All messages use JSON-RPC 2.0 format
- [ ] All methods use `starlight.` prefix
- [ ] All messages have unique `id` field
- [ ] Verify with: `node validator/starlight_validator.js`

### 1.2 Registration (Spec §5.1.1)
- [ ] Sentinel registers with: `layer`, `priority` (1-10)
- [ ] Capabilities array declared correctly
- [ ] Test: Check Hub console for `Registered Sentinel: <name>`

### 1.3 Handshake Flow (Spec §5.3)
- [ ] Hub sends `starlight.pre_check` before each action
- [ ] Sentinel responds with `starlight.clear` OR `starlight.wait`

---

## 2. Pre-Push Commands

```powershell
# 1. Syntax check
node --check src/hub.js
python -m py_compile sentinels/<sentinel>.py

# 2. TCK validation
node validator/starlight_validator.js

# 3. Integration test
node src/intent_portfolio_v2.js --headless

# 4. Verify report
Test-Path report.html
```

---

## 3. Sign-Off

| Check | Status |
|-------|--------|
| Syntax check | ⬜ |
| TCK validator | ⬜ |
| Integration test | ⬜ |
| Report generated | ⬜ |

**Only push when ALL checks show ✅**
