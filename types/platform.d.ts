import { Coordinator, Intent, IntentResult, Outcome, SentinelDefinition, SentinelDescription } from './core';

export type Mission = {
    goal: string;
    context?: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    steps?: Array<string | Omit<Intent, 'id'>>;
};

export type AgentExecution = Parameters<SentinelDefinition['execute']>[1];
export type NormalizedMission = Required<Omit<Mission, 'steps'>> & {
    steps: Array<Required<Omit<Intent, 'id'>>>;
};
export function validateMission(mission: string | Mission): NormalizedMission;
export function createHttpJsonAgent(options: {
    allowedOrigins: string[];
    name?: string;
    goal?: string;
    headers?: Record<string, string>;
    maxResponseBytes?: number;
    timeoutMs?: number;
    capacity?: number;
    validate?: (value: unknown, intent: Readonly<Intent>, execution: AgentExecution) => boolean | Promise<boolean>;
}): AgentDefinition;
export type AgentDefinition = Pick<SentinelDefinition, 'id' | 'name' | 'version' | 'priority' | 'capacity' | 'capabilities'> & {
    canHandle: SentinelDefinition['offer'];
    run: SentinelDefinition['execute'];
    verify?: (intent: Readonly<Intent>, outcome: Extract<Outcome, { status: 'completed' }>,
        execution: AgentExecution) => boolean | Promise<boolean>;
};

export type RunError = { code: string; message: string; details?: unknown };
export type RunStep = {
    index: number;
    intentId: string;
    goal: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    result?: IntentResult;
    error?: RunError;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
};
export type MissionRun = {
    id: string;
    goal: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: string;
    deadlineAt?: string;
    finishedAt?: string;
    durationMs?: number;
    mission: Mission;
    steps: RunStep[];
    error?: RunError;
};
export type RunHandle = {
    readonly id: string;
    readonly done: Promise<MissionRun>;
    cancel(): boolean;
};

export type RunOptions = { signal?: AbortSignal; timeoutMs?: number };
export type RunEvent = {
    type: 'run.started' | 'step.started' | 'step.finished' | 'run.finished' | 'run.persistence_failed';
    run: MissionRun;
};
export type RunStore = {
    create(report: MissionRun): void | Promise<void>;
    save(report: MissionRun): void | Promise<void>;
};
export type RunSummary = Pick<MissionRun, 'id' | 'goal' | 'status' | 'startedAt' | 'finishedAt'> & {
    completedSteps: number;
    totalSteps: number;
};
export class FileRunStore implements RunStore {
    constructor(directory?: string);
    readonly directory: string;
    pathFor(id: string): string;
    create(report: MissionRun): Promise<void>;
    save(report: MissionRun): Promise<void>;
    get(id: string): Promise<MissionRun | undefined>;
    list(options?: { status?: MissionRun['status']; limit?: number; offset?: number }): Promise<RunSummary[]>;
}

export class AgentPlatform {
    constructor(options?: {
        coordinator?: Coordinator;
        coordinatorOptions?: Omit<NonNullable<ConstructorParameters<typeof Coordinator>[0]>, 'fallbackOnError'>;
        maxRuns?: number;
        store?: RunStore;
    });
    readonly coordinator: Coordinator;
    register(agent: AgentDefinition): () => boolean;
    agents(): SentinelDescription[];
    submit(mission: string | Mission, options?: RunOptions): RunHandle;
    run(mission: string | Mission, options?: RunOptions): Promise<MissionRun>;
    subscribe(listener: (event: RunEvent) => unknown): () => boolean;
    getRun(id: string): MissionRun | undefined;
    listRuns(): MissionRun[];
    cancel(id: string): boolean;
}
