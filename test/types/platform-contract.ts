import { AgentPlatform, AgentDefinition, Mission, MissionRun, FileRunStore, RunEvent, RunSummary } from '@starlight-protocol/starlight';
import { AgentPlatform as PlatformExport } from '@starlight-protocol/starlight/platform';

const agent: AgentDefinition = {
    name: 'typed-agent',
    canHandle: intent => intent.goal === 'Check',
    run: async (_intent, { signal }) => {
        signal.throwIfAborted();
        return { status: 'completed', value: 42 };
    },
    verify: (_intent, outcome) => outcome.value === 42
};
const platform: PlatformExport = new AgentPlatform({ coordinatorOptions: { maxAttempts: 2 } });
const unregister = platform.register(agent);
const mission: Mission = { goal: 'Check', steps: ['Check'] };
const handle = platform.submit(mission);
const result: Promise<MissionRun> = handle.done;
const store = new FileRunStore('./runs');
const durable = new AgentPlatform({ store });
const unsubscribe = durable.subscribe((event: RunEvent) => event.run.steps[0]?.durationMs);
durable.submit(mission, { timeoutMs: 5000, signal: new AbortController().signal });
const saved: Promise<MissionRun | undefined> = store.get(handle.id);
const summaries: Promise<RunSummary[]> = store.list({ status: 'failed', limit: 10, offset: 0 });
unsubscribe();
// @ts-expect-error deadlines must be numeric
durable.submit(mission, { timeoutMs: '5s' });
// @ts-expect-error unknown run status
store.list({ status: 'interrupted' });
// @ts-expect-error durable storage must reserve a new run before execution
new AgentPlatform({ store: { save: async () => {} } });
void saved;
void summaries;
platform.agents()[0].active;
platform.getRun(handle.id)?.steps[0].result?.sentinel.name;
handle.cancel();
unregister();
// @ts-expect-error agents must state what they can handle
platform.register({ name: 'missing-claim', run: () => ({ status: 'completed' }) });
// @ts-expect-error verification returns a boolean, not a fabricated outcome
const invalid: AgentDefinition = { ...agent, verify: () => ({ status: 'completed' }) };
void result;
void invalid;
