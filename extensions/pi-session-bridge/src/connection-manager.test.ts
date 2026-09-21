import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const bridge = vi.hoisted(() => ({
  send: vi.fn(),
  callbacks: null as null | { onMessage(msg: unknown): void },
}));

vi.mock("./bridge-connection.js", () => ({
  BridgeConnection: class {
    state = "connected" as const;
    constructor(callbacks: { onMessage(msg: unknown): void }) {
      bridge.callbacks = callbacks;
    }
    send = bridge.send;
    disconnect = vi.fn();
    startHeartbeat = vi.fn();
    register = vi.fn();
    pongReceived = vi.fn();
  },
}));

function makeContext(sessionFile: string, entries: unknown[] = [], overrides: Record<string, unknown> = {}): ExtensionContext {
  const sessionId = sessionFile.match(/_([^/_]+)\.jsonl$/)?.[1] ?? "session-id";
  return {
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => sessionFile,
      getEntries: () => entries,
    },
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
    },
    model: { provider: "openai", id: "gpt-5", name: "GPT-5" },
    modelRegistry: {
      getAvailable: () => [
        { provider: "openai", id: "gpt-5", name: "GPT-5" },
        { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" },
      ],
      find: (provider: string, modelId: string) =>
        provider === "anthropic" && modelId === "claude-sonnet"
          ? { provider, id: modelId, name: "Claude Sonnet" }
          : undefined,
    },
    isIdle: () => true,
    abort: vi.fn(),
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 1234, contextWindow: 128000, percent: 0.96 }),
    ...overrides,
  } as unknown as ExtensionContext;
}

describe("pi-session-bridge connection manager session identity", () => {
  beforeEach(() => {
    vi.resetModules();
    bridge.send.mockReset();
    bridge.callbacks = null;
  });

  it("uses the session entry id instead of the timestamped file stem", async () => {
    const connMgr = await import("./connection-manager.js");
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/2026-05-31T10-10-37-968Z_019e7d83-9d10-7554-a0e1-3238c9151aba.jsonl",
      [{ type: "session", id: "019e7d83-9d10-7554-a0e1-3238c9151aba" }],
    );

    connMgr.initSession(ctx);

    expect(connMgr.getSessionId()).toBe("019e7d83-9d10-7554-a0e1-3238c9151aba");
    expect(connMgr.getSessionPath()).toBe(ctx.sessionManager.getSessionFile());
  });

  it("uses SessionManager's canonical id even when it differs from the filename", async () => {
    const connMgr = await import("./connection-manager.js");
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/legacy-name.jsonl",
      [],
      {
        sessionManager: {
          getSessionId: () => "canonical-session-id",
          getSessionFile: () => "/Users/me/.pi/agent/sessions/project/legacy-name.jsonl",
          getEntries: () => [],
        },
      },
    );

    connMgr.initSession(ctx);

    expect(connMgr.getSessionId()).toBe("canonical-session-id");
  });

  it("serves real session state, models, commands, and RPC actions", async () => {
    const connMgr = await import("./connection-manager.js");
    const abort = vi.fn();
    let thinkingLevel = "high";
    let idle = true;
    const sendUserMessage = vi.fn();
    const setThinkingLevel = vi.fn((level: string) => { thinkingLevel = level; });
    const setModel = vi.fn(async () => true);
    const commands = [{
      name: "kanban",
      description: "Manage Kanban workflow metadata",
      source: "extension" as const,
      sourceInfo: { path: "/tmp/bridge.ts", source: "local", scope: "project", origin: "top-level" },
    }];
    const pi = {
      on: vi.fn(),
      sendUserMessage,
      getCommands: () => commands,
      getThinkingLevel: () => thinkingLevel,
      setThinkingLevel,
      setModel,
    } as unknown as ExtensionAPI;
    const ctx = makeContext(
      "/Users/me/.pi/agent/sessions/project/2026-05-31T10-10-37-968Z_019e7d83-9d10-7554-a0e1-3238c9151aba.jsonl",
      [],
      { abort, isIdle: () => idle },
    );

    connMgr.init(pi);
    connMgr.enableLiveMode();
    connMgr.initSession(ctx, pi);
    expect(bridge.callbacks).not.toBeNull();

    const rpc = async (msg: Record<string, unknown>) => {
      bridge.send.mockClear();
      bridge.callbacks!.onMessage(msg);
      await Promise.resolve();
      await Promise.resolve();
      return bridge.send.mock.calls.find(([payload]) => (payload as { type?: string }).type === "response")?.[0] as Record<string, unknown>;
    };

    const stateResponse = await rpc({ type: "get_state", id: "state-1" });
    expect(stateResponse).toMatchObject({
      id: "state-1",
      success: true,
      data: {
        model: { provider: "openai", id: "gpt-5", name: "GPT-5" },
        thinkingLevel: "high",
        contextUsage: { used: 1234, limit: 128000, unit: "tokens" },
        availableModels: [
          { provider: "openai", id: "gpt-5", name: "GPT-5" },
          { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" },
        ],
      },
    });

    await expect(rpc({ type: "get_commands", id: "commands-1" })).resolves.toMatchObject({
      success: true,
      data: { commands },
    });
    await expect(rpc({ type: "get_available_models", id: "models-1" })).resolves.toMatchObject({
      success: true,
      data: { models: [{ provider: "openai", id: "gpt-5" }, { provider: "anthropic", id: "claude-sonnet" }] },
    });

    await rpc({ type: "prompt", id: "prompt-1", message: "/kanban" });
    // Pi 0.85.1+ can dispatch extension commands and expand skills/templates from ExtensionAPI.
    expect(sendUserMessage).toHaveBeenLastCalledWith("/kanban", { expandPromptTemplates: true });
    await rpc({
      type: "prompt",
      id: "prompt-image-1",
      message: "inspect this",
      streamingBehavior: "steer",
      images: [{ type: "image", data: "YWJj", mimeType: "image/png" }],
    });
    expect(sendUserMessage).toHaveBeenLastCalledWith([
      { type: "text", text: "inspect this" },
      { type: "image", data: "YWJj", mimeType: "image/png" },
    ], { deliverAs: "steer", expandPromptTemplates: true });
    await rpc({ type: "follow_up", id: "follow-1", message: "next" });
    expect(sendUserMessage).toHaveBeenLastCalledWith("next", { deliverAs: "followUp", expandPromptTemplates: true });
    await rpc({ type: "steer", id: "steer-1", message: "change direction" });
    expect(sendUserMessage).toHaveBeenLastCalledWith("change direction", { deliverAs: "steer", expandPromptTemplates: true });

    idle = false;
    const sendCount = sendUserMessage.mock.calls.length;
    const busyResponse = await rpc({ type: "prompt", id: "busy-1", message: "queued?" });
    expect(sendUserMessage).toHaveBeenCalledTimes(sendCount);
    expect(busyResponse).toMatchObject({ success: false, error: "Agent is busy; streamingBehavior must be steer or followUp" });
    idle = true;

    const modelResponse = await rpc({ type: "set_model", id: "model-1", provider: "anthropic", modelId: "claude-sonnet" });
    expect(setModel).toHaveBeenCalledWith({ provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" });
    expect(modelResponse).toMatchObject({ success: true, data: { status: "set" } });

    const thinkingResponse = await rpc({ type: "set_thinking_level", id: "thinking-1", level: "medium" });
    expect(setThinkingLevel).toHaveBeenCalledWith("medium");
    expect(thinkingResponse).toMatchObject({ success: true, data: { status: "set", level: "medium" } });
    const invalidThinkingResponse = await rpc({ type: "set_thinking_level", id: "thinking-bad", level: "turbo" });
    expect(invalidThinkingResponse).toMatchObject({ success: false, error: "Invalid or missing thinking level" });

    const abortResponse = await rpc({ type: "abort", id: "abort-1" });
    expect(abort).toHaveBeenCalledOnce();
    expect(abortResponse).toMatchObject({ success: true, data: { status: "aborted" } });
  });
});
