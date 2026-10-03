import { AgentDefinition } from './platform';

export type StudioOptions = {
    port?: number;
    outputDir?: string;
    agents?: AgentDefinition[];
};

export type StudioServer = {
    readonly url: string;
    readonly port: number;
    close(): Promise<void>;
};

/** Start a private loopback Mission Studio. The returned URL contains its session token. */
export function startStudio(options?: StudioOptions): Promise<StudioServer>;
