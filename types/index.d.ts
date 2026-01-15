/**
 * TypeScript type definitions for Starlight Protocol
 */

declare module '@starlight-protocol/starlight' {
    export class CBAHub {
        constructor(port?: number, headless?: boolean);
        init(): Promise<void>;
        resolveSemanticIntent(goal: string): Promise<string | null>;
        resolveFormIntent(goal: string): Promise<string | null>;
        executeCommand(cmd: string, selector?: string, value?: string, goal?: string): Promise<any>;
        broadcastPreCheck(params: PreCheckParams): Promise<void>;
        generateReport(status?: 'success' | 'failure'): Promise<void>;
        shutdown(): Promise<void>;
    }
}

declare module '@starlight-protocol/starlight/sdk' {
    export class IntentRunner {
        constructor(hubUrl?: string);
        ready(): Promise<void>;
        goto(url: string): Promise<void>;
        click(selector: string): Promise<void>;
        clickGoal(goal: string): Promise<void>;
        fill(selector: string, value: string): Promise<void>;
        fillGoal(goal: string, value: string): Promise<void>;
        select(selector: string, value: string): Promise<void>;
        selectGoal(goal: string, value: string): Promise<void>;
        hover(selector: string): Promise<void>;
        hoverGoal(goal: string): Promise<void>;
        check(selector: string): Promise<void>;
        checkGoal(goal: string): Promise<void>;
        uncheck(selector: string): Promise<void>;
        uncheckGoal(goal: string): Promise<void>;
        scrollTo(selector: string): Promise<void>;
        scrollToGoal(goal: string): Promise<void>;
        scrollToBottom(): Promise<void>;
        press(key: string): Promise<void>;
        type(text: string): Promise<void>;
        upload(selector: string, files: string | string[]): Promise<void>;
        uploadGoal(goal: string, files: string | string[]): Promise<void>;
        wait(ms: number): Promise<void>;
        finish(): Promise<void>;
    }
}

declare module '@starlight-protocol/starlight/observability' {
    export interface OTelConfig {
        enabled: boolean;
        serviceName?: string;
        endpoint?: string;
        headers?: Record<string, string>;
        exportIntervalMs?: number;
    }

    export class StarlightOTel {
        constructor(config?: OTelConfig);
        init(): boolean;
        startMissionSpan(missionId: string, attributes?: Record<string, any>): Span;
        startCommandSpan(command: string, attributes?: Record<string, any>): Span;
        startPreCheckSpan(intentId: string): Span;
        recordMission(durationMs: number, success: boolean, attributes?: Record<string, any>): void;
        recordPreCheck(durationMs: number, response: string): void;
        recordSentinelChange(delta: number, sentinelName: string): void;
        recordError(errorType: string, attributes?: Record<string, any>): void;
        recordHijack(sentinelName: string, reason: string): void;
    }

    export function getOTel(config?: OTelConfig): StarlightOTel;

    export interface Span {
        end(): void;
        setStatus(status: { code: number; message?: string }): void;
        setAttribute(key: string, value: any): void;
        addEvent(name: string, attributes?: Record<string, any>): void;
    }
}

declare module '@starlight-protocol/starlight/auth' {
    export class JwtHandler {
        constructor(secret: string);
        generateToken(subject: string, expiresIn?: number): string;
        verifyToken(token: string): { valid: boolean; payload?: any; error?: string };
        refreshToken(token: string, expiresIn?: number): string | null;
    }
}

// Common types
interface PreCheckParams {
    command: {
        cmd?: string;
        goal?: string;
        selector?: string;
        value?: string;
        stabilityHint?: number;
    };
    blocking?: BlockingElement[];
    screenshot?: string;
    url?: string;
}

interface BlockingElement {
    selector: string;
    tag?: string;
    classes?: string;
    text?: string;
}

interface Message {
    jsonrpc: '2.0';
    method?: string;
    params?: any;
    id?: string;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}
