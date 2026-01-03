# SIP-1: Protocol Governance

| Field | Value |
|-------|-------|
| **SIP** | 1 |
| **Title** | Protocol Governance |
| **Author** | Dhiraj Das (@godhiraj-code) |
| **Status** | Final |
| **Created** | 2026-01-03 |

## Summary

This SIP establishes the governance model for the Starlight Protocol, including the SIP process itself, versioning policy, and maintainer responsibilities.

## Motivation

As the Starlight Protocol matures toward industry standardization, a formal governance model is essential for:

1. **Predictability**: Implementers need to know how the protocol evolves
2. **Quality**: Changes should be reviewed by multiple experts
3. **Stability**: Breaking changes must be carefully managed
4. **Community**: Contributors need clear paths to participation

## Specification

### The SIP Process

1. **Proposal**: Any community member can propose changes via GitHub Issue with `[SIP]` prefix
2. **Draft**: Maintainers assign SIP number and status "Draft"
3. **Review**: 14-day public review period
4. **Vote**: Core maintainers vote (2/3 majority required)
5. **Implementation**: Accepted SIPs are implemented in reference code
6. **Finalization**: Merged to specification, status becomes "Final"

### Versioning

The protocol uses Semantic Versioning:
- **Major**: Breaking changes (require SIP, minimum 30-day notice)
- **Minor**: New features (require SIP)
- **Patch**: Bug fixes (may skip formal SIP)

### Core Methods (Locked)

The following methods are considered "locked" and require a Major version change to modify:

- `starlight.registration`
- `starlight.intent`
- `starlight.pre_check`
- `starlight.clear`
- `starlight.wait`
- `starlight.hijack`
- `starlight.resume`
- `starlight.finish`

## Backward Compatibility

This SIP establishes initial governance. No backward compatibility concerns as this is the first formal governance document.

## Security Considerations

The governance model includes provisions for emergency security patches that may bypass the full SIP process when necessary to protect users.

## Reference Implementation

- [GOVERNANCE.md](../GOVERNANCE.md) - Full governance document

## Copyright

This document is licensed under MIT.
