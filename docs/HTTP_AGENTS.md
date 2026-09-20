# Connecting missions to JSON APIs

`createHttpJsonAgent` turns an HTTP JSON read into a normal Starlight agent. It participates in
routing, capacity limits, mission deadlines, result handoff, and optional completion verification.
It uses Node.js's built-in HTTP client, so no extra package or model provider is required.

## Try a complete workflow

```bash
node bin/starlight-platform.js demo --example service-health --events --timeout-ms 10000
node bin/starlight-platform.js runs --status completed
```

The demo starts a temporary loopback HTTP endpoint returning health records for three fixture
services: `api`, `queue`, and `worker`. The HTTP agent fetches and verifies that each service is
healthy. A second agent writes a Markdown report and reads it back. Both agents' results and
HTTP evidence appear in the saved mission report. The fixture server closes when the run ends.
This demonstrates real HTTP transport against sample data; it does not check your deployed services.

The existing `starlight demo` remains the file-based order-report example. Both examples run
from an installed package and require no credentials.

## Configure an API agent

Save this as `agents.cjs`, replacing the example origin with your API's origin:

```js
const { createHttpJsonAgent } = require('@starlight-protocol/starlight');

module.exports = createHttpJsonAgent({
  name: 'service-health',
  goal: 'Check service health',
  allowedOrigins: ['https://api.example.com'],
  headers: process.env.SERVICE_TOKEN
    ? { authorization: `Bearer ${process.env.SERVICE_TOKEN}` }
    : {},
  timeoutMs: 5000,
  maxResponseBytes: 65536,
  validate: value => value !== null && typeof value === 'object' && value.healthy === true
});
```

A corresponding `mission.json`:

```json
{
  "goal": "Check service health",
  "context": { "url": "https://api.example.com/health" }
}
```

```bash
starlight validate ./mission.json
starlight run ./mission.json --agents ./agents.cjs --timeout-ms 10000
```

The URL and goal are explicit; the platform does not infer endpoints from prose. The agent's
claim checks only the configured goal and makes no request. Once selected, it validates the
URL and origin before fetching. Unsupported origins fail terminally rather than handing the
request to a less restrictive fallback agent.

## Configuration

| Option | Behavior |
| --- | --- |
| `allowedOrigins` | Required array of 1–100 HTTP(S) origins, including scheme and port; no paths, wildcards, query strings, or embedded credentials |
| `name` | Registration name; default `http-json` |
| `goal` | Exact goal to claim; default `Fetch JSON` |
| `headers` | Static string header map in trusted agent configuration; copied when the agent is created |
| `timeoutMs` | Request budget covering response headers and body; default 10000, range 1–3600000 |
| `maxResponseBytes` | Maximum decoded response bytes; default 1048576, range 1–16777216 |
| `capacity` | Concurrent requests for this registration; default 1, maximum 1000 |
| `validate(value, intent, execution)` | Optional sync/async verifier; exactly `true` is required to continue |

Use separate agent names/goals for different integrations. Headers apply to every configured
origin, so keep credential scopes narrow. Request headers are not copied to the run report or
agent listing. Response data is stored as the step result and can itself contain sensitive data.

## Outcomes and boundaries

- Requests use GET. Redirects are rejected, including redirects to another allowed origin.
- Only successful responses with `application/json` or an `application/*+json` content type are accepted.
- Streaming enforces the byte limit even without a Content-Length header and after decompression.
- Invalid UTF-8, malformed JSON, and non-finite values fail the step. Non-success response bodies are not included in errors.
- Results contain the parsed JSON as `value`. Evidence includes the HTTP status, content type,
  received bytes, and URL without query parameters or fragments. The original mission still
  contains its submitted URL; keep credentials in configured headers, not mission URLs.
- Optional verification runs through `AgentPlatform.register` after parsing. False or throwing
  verification stops downstream work and preserves the HTTP evidence. Without a verifier,
  completion means the response was acceptable JSON, not that its domain claims are true.
- Request cancellation follows the agent execution signal. Per-request and whole-mission
  deadlines both apply; verification remains inside the Coordinator's execution budget.
- HTTP, parsing, and policy failures are terminal. There are no automatic retries, mutations,
  cookie sessions, or credential discovery. GET endpoints must be appropriate for automated reads.

The allowlist restricts URL origins, not resolved IP addresses or path-level permissions.
DNS, TLS, proxies, deployment egress controls, and API authorization remain host responsibilities.
Agents are trusted code; this helper is not a network sandbox.

Typical causes inside `report.error.details.cause.code` include `ORIGIN_NOT_ALLOWED`,
`REDIRECT_REJECTED`, `HTTP_STATUS`, `INVALID_CONTENT_TYPE`, `RESPONSE_TOO_LARGE`, `INVALID_JSON`,
`HTTP_ERROR`, and `TIMEOUT`. A mission deadline can instead be the report's top-level `TIMEOUT`.

## Validate a mission before execution

`starlight validate <mission.json>` prints `{ valid: true, stepCount, mission }` with a normalized
plan, or exits 1 with a validation error. It does not load agent modules, make network requests,
or create run files. The SDK equivalent is `validateMission(input)`, returning an immutable
normalized mission and throwing `INVALID_REQUEST` for invalid input.

Validation uses the same rules as execution: 1–100 steps, finite JSON data, no caller-assigned
step IDs or reserved `context.mission`, and no redefinition of shared constraint keys.
It checks plan structure, not agent availability, future step results, credentials, endpoint
health, or domain-specific constraint enforcement.
