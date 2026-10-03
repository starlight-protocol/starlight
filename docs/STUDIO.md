# Mission Studio

Mission Studio is a local interface for running and inspecting Starlight missions. Start it
from a checkout:

```bash
npm ci
npm run studio
```

Open the private local URL printed in the terminal. No model account or API key is needed for
the bundled examples. From an installed package, the equivalent command is `starlight studio`.

## Your first mission

Choose **Order report** to read three orders, verify a total of 5500 cents, and write a checked
Markdown summary. Choose **Service health** to fetch three health records from a temporary
local HTTP fixture, verify them, and write a report. The fixture demonstrates real HTTP
transport against sample data; it does not inspect your deployed services.

Start a run to see actual step states, the selected agents, timings, results, and evidence.
The examples usually finish quickly. Studio does not add artificial delays or simulate work.
Saved run history uses the same atomic files as the CLI. Refreshing or reconnecting reads
current state; it never automatically submits another mission.

Open the artifact preview to read a completed built-in example's Markdown output. Preview
access is restricted to artifacts generated during this Studio session, up to 64 KiB. Older
reports still show their evidence and output paths; the browser cannot read arbitrary files.
Copy or download the JSON report to share a reproducible account of the run.

An active run can be cancelled. Cancellation is cooperative and cannot undo effects. A saved
`running` checkpoint without an active in-process run is shown as unfinished, not as a live job.
Inspect its evidence before submitting new work. There is no automatic resume or retry.

## Bring your agents

```bash
starlight studio --agents ./agents.cjs --output-dir ./runs --port 4174
```

The agent module is loaded at startup and must export an agent or array of agents. It is
trusted local code, just as with `starlight run`. The browser cannot load modules or install
tools. Built-in examples work independently of your configured agents.

Use the custom mission editor for explicit `{ goal, context, constraints, steps }` plans.
Validate the JSON before running it. Validation checks mission structure; it does not prove
agent availability, domain correctness, or eventual success. Your agents still supply tools,
models, planning, and optional verification. A completed custom step is not automatically
claimed to be verified.

## Local access and storage

Studio binds only to `127.0.0.1`. By default the OS assigns an available port; `--port` selects
a fixed port. The launch URL contains a random session token. The interface removes the token
from the visible address and retains it for that browser tab's reloads. API reads and writes
require the token, and the server rejects unexpected Host and Origin headers.

Keep the launch URL private: anyone with local access and that token can inspect reports and
run your configured agents. Studio is a single-user local tool, not a hosted multi-tenant
service. Do not expose it through a tunnel or reverse proxy. Agents retain the host process's
permissions; the interface does not sandbox them.

Reports default to `.starlight/runs/`; `--output-dir` chooses another directory. Context,
results, and evidence can contain sensitive data. Put credentials in agent configuration and
only run trusted agents. Stopping Studio requests cancellation of active missions and closes
its local connections. Stored reports remain available to `starlight inspect` and future sessions.

Runs have a 30-second default budget, configurable up to one hour. Studio accepts at most four
active runs, retains 50 recent reports in memory, and returns 50 saved summaries. API request
bodies are limited to 256 KiB and live event connections to 16. Shutdown requests cancellation
and gives asynchronous cleanup up to two seconds before closing local sockets; trusted agents
remain responsible for stopping their own work.

## Embedding

```js
const { startStudio } = require('@starlight-protocol/starlight/studio');

async function main() {
  const studio = await startStudio({ outputDir: './runs', agents: [] });
  console.log(studio.url); // Private URL for this local session.
  process.once('SIGINT', () => studio.close());
}
main().catch(console.error);
```

The Studio HTTP API serves its bundled interface; it is not a new wire-protocol revision.
The public GitHub Pages website remains a static presentation and recorded demo. Actual
missions run in your local Studio process.
