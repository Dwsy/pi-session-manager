/**
 * Type declarations for pi extension environment.
 *
 * pi extensions run in Node.js where:
 * - @mariozechner/pi-coding-agent is provided by pi runtime
 */

// Stub for pi runtime types (provided at runtime by pi agent)
declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    registerTool(def: ToolDefinition): void;
    registerCommand(name: string, opts: CommandOptions): void;
    on(event: "input", handler: (event: { source?: string; text?: string }, ctx: ExtensionContext) => unknown): void;
    on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
    on(event: "session_shutdown", handler: () => unknown): void;
    on(event: "agent_start", handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
    on(event: "agent_end", handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
    on(event: "turn_start", handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
    on(event: "turn_end", handler: (event: unknown, ctx: ExtensionContext) => unknown): void;
    on(event: "message_start", handler: (event: unknown) => unknown): void;
    on(event: "message_update", handler: (event: unknown) => unknown): void;
    on(event: "message_end", handler: (event: unknown) => unknown): void;
    on(event: "tool_execution_start", handler: (event: unknown) => unknown): void;
    on(event: "tool_execution_update", handler: (event: unknown) => unknown): void;
    on(event: "tool_execution_end", handler: (event: unknown) => unknown): void;
    on(event: "tool_call", handler: (event: unknown) => unknown): void;
    on(event: "tool_result", handler: (event: unknown) => unknown): void;
    on(event: "model_select", handler: (event: unknown) => unknown): void;
    on(event: string, handler: (...args: unknown[]) => unknown): void;

    // Message injection
    sendUserMessage(content: string | (TextContent | ImageContent)[], options?: { deliverAs?: "steer" | "followUp"; expandPromptTemplates?: boolean }): void;
    sendMessage(msg: CustomMessage): void;

    // Runtime discovery + model/thinking
    getCommands(): SlashCommandInfo[];
    getThinkingLevel(): ThinkingLevel;
    setModel(model: PiModel): Promise<boolean>;
    setThinkingLevel(level: ThinkingLevel): void;

    // Events bus
    events: { emit(event: string, data?: unknown): void };
  }

  export interface CustomMessage {
    role: "custom";
    customType: string;
    content: string | { type: string; text: string }[];
    display: boolean;
    details?: unknown;
  }

  export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

  export interface PiModel {
    provider: string;
    id: string;
    name?: string;
  }

  export interface TextContent {
    type: "text";
    text: string;
  }

  export interface ImageContent {
    type: "image";
    data: string;
    mimeType: string;
  }

  export interface SlashCommandInfo {
    name: string;
    description?: string;
    source: "extension" | "prompt" | "skill";
    sourceInfo: Record<string, unknown>;
  }

  export interface ExtensionContext {
    ui: {
      notify(message: string, level: "info" | "warning" | "error" | "success"): void;
      setStatus(key: string, value: string | undefined): void;
      select(title: string, options: string[]): Promise<string | undefined>;
      confirm(title: string, message: string, opts?: { timeout?: number }): Promise<boolean>;
      input(prompt: string): Promise<string | undefined>;
      custom(factory: (tui: unknown, theme: unknown, kb: unknown, done: (result: unknown) => void) => unknown, opts?: { overlay?: boolean }): Promise<unknown>;
    };
    sessionManager: {
      getSessionFile(): string | null;
      getEntries(): unknown[];
      rename(name: string): Promise<void>;
      list(): unknown[];
    };
    model?: PiModel;
    modelRegistry: {
      getAvailable(): PiModel[];
      find(provider: string, modelId: string): PiModel | undefined;
    };
    thinkingLevel?: ThinkingLevel;
    isIdle(): boolean;
    abort(): void;
    hasPendingMessages(): boolean;
    getContextUsage(): { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
  }

  export interface ToolDefinition {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    execute(toolCallId: string, params: Record<string, unknown>, ctx?: ExtensionContext): Promise<ToolResult>;
  }

  export interface ToolResult {
    content: { type: string; text: string }[];
    isError?: boolean;
  }

  export interface CommandOptions {
    description: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void>;
    getArgumentCompletions?: (prefix: string) => { value: string; label: string }[];
  }
}
