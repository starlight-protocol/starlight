# Starlight Protocol Governance

This document defines how the Starlight Protocol evolves and how decisions are made.

## Core Principles

1. **Stability First**: The protocol prioritizes backward compatibility
2. **Community Driven**: Changes require community review
3. **Transparency**: All decisions are documented publicly
4. **Interoperability**: Changes must not break existing implementations

---

## Starlight Improvement Proposals (SIPs)

Any change to core protocol methods **MUST** follow the SIP process.

### SIP Lifecycle

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  DRAFT  │ -> │  REVIEW  │ -> │ ACCEPTED │ -> │  FINAL   │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
     │              │               │
     └──────────────┴───────────────┴─> REJECTED
```

### SIP Status Definitions

| Status | Description |
|--------|-------------|
| **Draft** | Initial proposal, open for feedback |
| **Review** | Under formal 14-day community review |
| **Accepted** | Approved, pending implementation |
| **Final** | Implemented and released |
| **Rejected** | Not accepted (with documented reasons) |

### Creating a SIP

1. **Open an Issue**: Use the `[SIP]` prefix in the title
   - Example: `[SIP] Add starlight.capabilities method`

2. **Required Sections**:
   - **Summary**: One-paragraph description
   - **Motivation**: Why is this change needed?
   - **Specification**: Exact message format and behavior
   - **Backward Compatibility**: Impact on existing implementations
   - **Security Considerations**: Any security implications

3. **Review Period**: 14 days minimum for community feedback

4. **Voting**: Core maintainers vote after review period
   - Requires 2/3 majority for acceptance
   - At least 2 maintainer reviews required

---

## Versioning

The protocol follows [Semantic Versioning](https://semver.org/):

| Version Type | When to Use | Example |
|--------------|-------------|---------|
| **Major** (X.0.0) | Breaking changes to message format | 2.0.0 |
| **Minor** (1.X.0) | New optional fields or methods | 1.1.0 |
| **Patch** (1.0.X) | Bug fixes, documentation | 1.0.1 |

### Deprecation Policy

1. Features are marked **deprecated** for at least one minor version
2. Deprecated features are removed in the next major version
3. Deprecation notices must be added to the specification

---

## Core Maintainers

| Name | GitHub | Role | Joined |
|------|--------|------|--------|
| Dhiraj Das | [@godhiraj-code](https://github.com/godhiraj-code) | Creator & Lead | 2025 |

### Becoming a Maintainer

1. Consistent, high-quality contributions over 6+ months
2. Nomination by existing maintainer
3. Approval by 2/3 of current maintainers

---

## Decision Making

### Consensus-Seeking

We aim for rough consensus on all decisions. If consensus cannot be reached:

1. Extended discussion period (7 days)
2. Formal vote by maintainers
3. Lead maintainer has tie-breaking authority

### Emergency Changes

Security vulnerabilities may be patched without the full SIP process:

1. Private disclosure to maintainers
2. Patch developed in private
3. Coordinated release with advisory
4. Post-release SIP for documentation

---

## Repository Organization

| Repository | Purpose |
|------------|---------|
| `starlight-protocol/starlight` | Reference implementation (Node.js Hub) |
| `starlight-protocol/starlight-python` | Python SDK |
| `starlight-protocol/starlight-spec` | Specification documents |
| `starlight-protocol/tck` | Technology Compatibility Kit |

---

## Code of Conduct

All participants must follow our [Code of Conduct](CODE_OF_CONDUCT.md).

We are committed to providing a welcoming and inclusive environment.

---

## License

The Starlight Protocol specification and reference implementation are licensed under **MIT License**.

This license:
- Allows commercial use
- Allows modification and distribution
- Requires attribution
- No warranty provided

---

## Contact

- **GitHub Discussions**: [starlight-protocol/starlight/discussions](https://github.com/starlight-protocol/starlight/discussions)
- **Issues**: [starlight-protocol/starlight/issues](https://github.com/starlight-protocol/starlight/issues)

---

*Last updated: January 2026*
