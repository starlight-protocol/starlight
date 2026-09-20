# Reliable mission execution

Starlight can save progress before and after each mission step, limit the whole mission's
execution time, and publish progress events. These features are available in the CLI and SDK
starting with 5.0.0-alpha.3. The wire contract remains 1.0.

## Run and inspect from the CLI

```bash
starlight demo --timeout-ms 10000 --events
starlight runs --status completed --limit 10
starlight inspect <run-id>

starlight run ./mission.json --agents ./agents.cjs --output-dir ./runs --timeout-ms 60000
starlight runs --output-dir ./runs --status failed --limit 20 --offset 0
```

Use `node bin/starlight-platform.js` in place of `starlight` from a checkout. The default
directory is `.starlight/runs`. `--events` writes one JSON event per line to stderr while stdout
remains a single final JSON report. Reports for failed or cancelled missions accompany exit code 1.
SIGINT/SIGTERM requests cooperative cancellation and records the result when storage is available.

`runs` returns summaries ordered by newest start time, with the run ID as a tie breaker.
It supports `running`, `completed`, `failed`, and `cancelled` status filters. The default limit
is 50, maximum 1000; offset defaults to zero. Listing scans the local archive and reports corrupt
records as errors. Pagination is a view of the directory at read time, not a database snapshot.

## Embed persistence and progress

```js
const { AgentPlatform, FileRunStore } = require('@starlight-protocol/starlight');
const store = new FileRunStore('./runs');
const platform = new AgentPlatform({ store });
platform.register({
  name: 'counter',
  canHandle: intent => intent.goal === 'Count words',
  run: intent => ({
    status: 'completed',
    value: { words: String(intent.context.text).match(/\S+/g)?.length ?? 0 }
  })
});

const unsubscribe = platform.subscribe(event => {
  console.log(event.type, event.run.id, event.run.steps.at(-1)?.status);
});

async function main() {
  const report = await platform.run({
    goal: 'Count words', context: { text: 'Inspect every outcome' }
  }, { timeoutMs: 10000 });
  console.log(report.status);
  console.log(await store.get(report.id));
  console.log(await store.list({ status: 'completed', limit: 10 }));
  unsubscribe();
}
main().catch(console.error);
```

Without a store, the SDK keeps bounded in-memory history as before. With a store, evicting a
settled run from memory does not remove its file. Use `store.get(id)` to read it after a restart;
reading never executes or registers agents. `store.pathFor(id)` returns the report's absolute path.
Store reads and lifecycle event payloads are immutable snapshots.

## Checkpoint ordering and failure behavior

For each mission, the runtime:

1. Saves the initial mission before routing any work.
2. Saves a `running` step before dispatching it.
3. Saves the step's verified result or failure before dispatching the next step.
4. Saves the final report before resolving the run handle.

`FileRunStore` writes a uniquely named temporary file, flushes and closes it, then publishes
the complete snapshot. Initial creation uses an exclusive hard link; subsequent writes use
a rename in the same directory. Readers see the previous or new complete JSON record.
POSIX directory entries are flushed too. Use a local filesystem supporting these operations;
network filesystems and power-loss durability depend on the host and filesystem. A killed
writer can leave an ignored `.tmp` file. The runtime does not delete historical run files.
On Windows, transient rename locks are retried with a bounded backoff; persistent locks fail
the write while leaving the previous checkpoint intact.

A storage failure rejects `handle.done` with `code: 'STORE_ERROR'` and `details.runId`.
It prevents subsequent dispatches. `platform.getRun(id)` retains the observed in-memory
results and failure, but the disk record can be older. A failed final write also rejects;
it does not report durable success. Previously completed external effects are not undone.

Custom stores implement `create(report)` and `save(report)`, synchronously or asynchronously.
`create` must reject existing IDs; each resolved call must have committed its snapshot.
The runtime serializes writes for a run. Give each run one writer; the file adapter does not
provide a distributed lock, compare-and-swap updates, encryption, or retention policies.
Store directories are trusted host resources. Reports contain mission context and evidence,
so credentials belong in agent configuration.

## Deadlines and events

Pass `{ timeoutMs }` to `submit` or `run`, or use `--timeout-ms`. It must be an integer from
1 through 86400000. The budget starts at submission and covers routing, capacity waits,
execution, verification, and checkpoint waits between steps. Reports include `deadlineAt`;
expired missions have status `failed` with error code `TIMEOUT`. Per-intent Coordinator
deadlines still apply and may expire earlier. Steps include their start, finish, and duration.

Cancellation reaches local and remote agents through their execution signal. Agents must
cooperate; JavaScript cannot interrupt synchronous blocking code or undo external effects.
A late result is retained as evidence but does not turn an expired mission into success.
Storage calls are awaited and are not forcibly interrupted; final report persistence can
finish after the execution budget. Custom stores must bound their own I/O.

`platform.subscribe(listener)` returns an unsubscribe function. Events are `run.started`,
`step.started`, `step.finished`, and `run.finished`, delivered after their checkpoint commits
(or immediately at that boundary when no store is configured). `run.persistence_failed`
contains the in-memory failure and explicitly does not imply a committed checkpoint.
Listeners are observational: thrown errors and rejected promises are isolated. Asynchronous
listeners are not awaited; use the store for reliable records, not event delivery.

## Inspecting an interrupted mission

A saved `running` status means the last checkpoint was unfinished. It does **not** prove a
process is still alive. After a crash, inspect the saved report and the agent's external
artifacts or service logs. Completed steps retain their saved evidence. A running step may
not have started, may still be executing, or may have completed without its result being saved.

There is no automatic replay or resume. Reconcile that uncertainty before submitting a fresh
mission. Agents that can safely repeat effects should use domain-specific idempotency keys or
external transactions. Progress checkpoints do not provide exactly-once execution or rollback.
