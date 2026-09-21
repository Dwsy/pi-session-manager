/**
 * Connection Manager — owns the BridgeConnection singleton.
 *
 * Manages:
 * - Live mode toggle (on/off)
 * - Session lifecycle (connect on session_start, disconnect on shutdown)
 * - UI status indicators and notification cooldown
 * - WS message routing (ping/pong, RPC commands from PSM)
 * - Event forwarding (pi agent events → PSM via WS)
 * - Session state sync (model, thinking level → PSM)
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model, TextContent } from "@earendil-works/pi-ai";
import { BridgeConnection } from "./bridge-connection.js";
import { NOTIFY_COOLDOWN } from "./config.js";
import type { BridgeState } from "./types.js";

// ── Module state ──────────────────────────────────────

let conn: BridgeConnection | null = null;
let latestCtx: ExtensionContext | null = null;
let piApi: ExtensionAPI | null = null;
let sessionId = "";
let sessionPath = "";
let liveModeEnabled = false;
let lastNotifyState = "";
let notifyCooldown = 0;
let isStreaming = false;

// ── Notification throttle ─────────────────────────────

function shouldNotify(newState: string): boolean {
  const now = Date.now();
  if (now - notifyCooldown < NOTIFY_COOLDOWN) return false;
  if (newState === lastNotifyState) return false;
  lastNotifyState = newState;
  notifyCooldown = now;
  return true;
}

// ── Status badge mapping ──────────────────────────────

function applyStatus(ctx: ExtensionContext, state: BridgeState, attempt: number) {
  switch (state) {
    case "connected":
      ctx.ui.setStatus("psm", "[psm]");
      break;
    case "reconnecting":
      ctx.ui.setStatus("psm", `[retry ${attempt}]`);
      break;
    case "disconnected":
      ctx.ui.setStatus("psm", "[timeout]");
      break;
  }
}

// ── Event forwarding (pi agent events → PSM) ──────────

function forwardEvent(eventType: string, data?: unknown) {
  if (!conn || conn.state !== "connected" || !sessionId) return;
  const payload = data && typeof data === "object" ? data : {};
  conn.send({ type: eventType, sessionId, sessionPath, ...payload });
}

function handleForwardedEvent(eventType: string, event: unknown, ctx: ExtensionContext) {
  latestCtx = ctx;
  // Agent lifecycle is the stable boundary for the whole streamed response;
  // message/turn boundaries may occur multiple times while tools are running.
  if (eventType === "agent_start") isStreaming = true;
  else if (eventType === "agent_end") isStreaming = false;

  forwardEvent(eventType, event);
  if (
    eventType === "agent_start" ||
    eventType === "agent_end" ||
    eventType === "turn_end" ||
    eventType === "model_select" ||
    eventType === "thinking_level_select"
  ) {
    sendSessionState();
  }
}

function registerEventForwarding(pi: ExtensionAPI) {
  pi.on("agent_start", (event, ctx) => handleForwardedEvent("agent_start", event, ctx));
  pi.on("agent_end", (event, ctx) => handleForwardedEvent("agent_end", event, ctx));
  pi.on("turn_start", (event, ctx) => handleForwardedEvent("turn_start", event, ctx));
  pi.on("turn_end", (event, ctx) => handleForwardedEvent("turn_end", event, ctx));
  pi.on("message_start", (event, ctx) => handleForwardedEvent("message_start", event, ctx));
  pi.on("message_update", (event, ctx) => handleForwardedEvent("message_update", event, ctx));
  pi.on("message_end", (event, ctx) => handleForwardedEvent("message_end", event, ctx));
  pi.on("tool_execution_start", (event, ctx) => handleForwardedEvent("tool_execution_start", event, ctx));
  pi.on("tool_execution_update", (event, ctx) => handleForwardedEvent("tool_execution_update", event, ctx));
  pi.on("tool_execution_end", (event, ctx) => handleForwardedEvent("tool_execution_end", event, ctx));
  pi.on("tool_call", (event, ctx) => handleForwardedEvent("tool_call", event, ctx));
  pi.on("tool_result", (event, ctx) => handleForwardedEvent("tool_result", event, ctx));
  pi.on("model_select", (event, ctx) => handleForwardedEvent("model_select", event, ctx));
  pi.on("thinking_level_select", (event, ctx) => handleForwardedEvent("thinking_level_select", event, ctx));
}

// ── Session state sync (model/thinking → PSM) ─────────

function serializeModel(model: Model<any> | undefined) {
  if (!model) return undefined;
  return { provider: model.provider, id: model.id, ...(model.name ? { name: model.name } : {}) };
}

function getAvailableModels() {
  return (latestCtx?.modelRegistry?.getAvailable?.() ?? []).map(serializeModel).filter(Boolean);
}

function getThinkingLevel(): ThinkingLevel | undefined {
  return piApi?.getThinkingLevel();
}

function getContextUsage() {
  const usage = latestCtx?.getContextUsage?.();
  if (!usage || usage.tokens == null) return undefined;
  return { used: usage.tokens, limit: usage.contextWindow, unit: "tokens" };
}

function getSessionStatePayload() {
  return {
    sessionId,
    sessionPath,
    model: serializeModel(latestCtx?.model),
    availableModels: getAvailableModels(),
    thinkingLevel: getThinkingLevel(),
    contextUsage: getContextUsage(),
    isStreaming,
  };
}

function sendSessionState() {
  if (!conn || conn.state !== "connected" || !sessionId) return;
  conn.send({ type: "session_state", payload: getSessionStatePayload() });
}

// ── RPC command handler (PSM → extension) ─────────────

function getMessageContent(msg: Record<string, unknown>): string | (TextContent | ImageContent)[] {
  const message = typeof msg.message === "string" ? msg.message : "";
  const images = Array.isArray(msg.images)
    ? msg.images.filter((image): image is ImageContent => {
        if (!image || typeof image !== "object") return false;
        const value = image as Record<string, unknown>;
        return value.type === "image" && typeof value.data === "string" && typeof value.mimeType === "string";
      })
    : [];
  if (images.length === 0) return message;
  return [{ type: "text", text: message }, ...images];
}

function hasMessageContent(content: string | (TextContent | ImageContent)[]): boolean {
  if (typeof content === "string") return content.length > 0;
  return content.some((part) => part.type === "image" || (part.type === "text" && part.text.length > 0));
}

async function handleRpcCommand(msg: Record<string, unknown>) {
  const type = msg.type as string;
  const sid = (msg.sessionId as string) || sessionId;

  const respond = (success: boolean, data?: unknown, error?: string) => {
    conn?.send({
      type: "response",
      sessionId: sid,
      id: typeof msg.id === "string" ? msg.id : null,
      success,
      data,
      error,
    });
  };

  try {
    switch (type) {
      case "prompt": {
        const content = getMessageContent(msg);
        if (!hasMessageContent(content) || !piApi) {
          respond(false, undefined, "No message/images or pi API unavailable");
          break;
        }
        const requestedDelivery = msg.streamingBehavior;
        const deliverAs = requestedDelivery === "steer" || requestedDelivery === "followUp" ? requestedDelivery : undefined;
        if (!deliverAs && latestCtx && !latestCtx.isIdle()) {
          respond(false, undefined, "Agent is busy; streamingBehavior must be steer or followUp");
          break;
        }
        // Pi 0.85.1+ can dispatch extension commands and expand skills/templates from ExtensionAPI.
        piApi.sendUserMessage(content, { ...(deliverAs ? { deliverAs } : {}), expandPromptTemplates: true });
        respond(true, { status: "sent" });
        break;
      }

      case "follow_up": {
        const content = getMessageContent(msg);
        if (hasMessageContent(content) && piApi) {
          piApi.sendUserMessage(content, { deliverAs: "followUp", expandPromptTemplates: true });
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "No message/images or pi API unavailable");
        }
        break;
      }

      case "steer": {
        const content = getMessageContent(msg);
        if (hasMessageContent(content) && piApi) {
          piApi.sendUserMessage(content, { deliverAs: "steer", expandPromptTemplates: true });
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "No message/images or pi API unavailable");
        }
        break;
      }

      case "set_model": {
        const provider = msg.provider as string;
        const modelId = msg.modelId as string;
        if (!provider || !modelId || !piApi || !latestCtx) {
          respond(false, undefined, "Missing provider/modelId or Pi context unavailable");
          break;
        }
        const model = latestCtx.modelRegistry.find(provider, modelId);
        if (!model) {
          respond(false, undefined, `Model not available: ${provider}/${modelId}`);
          break;
        }
        const changed = await piApi.setModel(model);
        if (!changed) {
          respond(false, undefined, `Model has no configured auth: ${provider}/${modelId}`);
          break;
        }
        sendSessionState();
        respond(true, { status: "set", model: serializeModel(model) });
        break;
      }

      case "set_thinking_level": {
        const level = msg.level;
        const validLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
        if (typeof level !== "string" || !validLevels.includes(level as ThinkingLevel) || !piApi) {
          respond(false, undefined, "Invalid or missing thinking level");
          break;
        }
        piApi.setThinkingLevel(level as ThinkingLevel);
        sendSessionState();
        respond(true, { status: "set", level: getThinkingLevel() });
        break;
      }

      case "get_state": {
        respond(true, getSessionStatePayload());
        break;
      }

      case "get_commands": {
        respond(true, { commands: piApi?.getCommands?.() ?? [] });
        break;
      }

      case "get_available_models": {
        respond(true, { models: getAvailableModels() });
        break;
      }

      case "abort": {
        if (!latestCtx) {
          respond(false, undefined, "Pi context unavailable");
          break;
        }
        latestCtx.abort();
        respond(true, { status: "aborted" });
        break;
      }

      default:
        respond(false, undefined, `Unknown RPC command: ${type}`);
    }
  } catch (err) {
    respond(false, undefined, String(err));
  }
}

// ── WS message handler ────────────────────────────────

function handleMessage(msg: unknown) {
  const m = msg as Record<string, unknown>;

  // Ping/pong
  if (m.type === "ping" || m.ping === true) {
    conn?.send({ type: "pong" });
    return;
  }
  if (m.type === "pong" || m.pong === true) {
    conn?.pongReceived();
    return;
  }

  // RPC commands from PSM
  if (typeof m.type === "string") {
    const rpcTypes = [
      "prompt", "steer", "follow_up",
      "set_model", "set_thinking_level",
      "get_state", "get_commands", "get_available_models",
      "abort",
    ];
    if (rpcTypes.includes(m.type)) {
      handleRpcCommand(m);
      return;
    }
  }

  // Ack messages from PSM
  if (m.type === "ack") return;
}

// ── Public API ────────────────────────────────────────

export function getSessionId() {
  return sessionId;
}

export function getSessionPath() {
  return sessionPath;
}

export function getConnection() {
  return conn;
}

export function isLiveEnabled() {
  return liveModeEnabled;
}

export function getContext() {
  return latestCtx;
}

export function enableLiveMode(ctx?: ExtensionContext) {
  liveModeEnabled = true;
  if (ctx) latestCtx = ctx;
  if (sessionId && conn?.state !== "connected") {
    doConnect();
  }
}

export function disableLiveMode() {
  liveModeEnabled = false;
  doDisconnect();
}

export function initSession(ctx: ExtensionContext, pi?: ExtensionAPI) {
  latestCtx = ctx;
  if (pi) piApi = pi;
  const sf = ctx.sessionManager.getSessionFile() || "";
  sessionPath = sf;
  sessionId = ctx.sessionManager.getSessionId();
  lastNotifyState = "";

  if (!liveModeEnabled) return;

  if (conn?.state === "connected") {
    conn.register(sessionId, sessionPath, ctx.sessionManager.getEntries());
  } else {
    doConnect();
  }
}

export function init(pi: ExtensionAPI) {
  piApi = pi;
  registerEventForwarding(pi);
}

export function shutdown() {
  doDisconnect();
}

export function doConnect() {
  if (conn?.state === "connected") return;
  if (conn) conn.disconnect();
  lastNotifyState = "";

  conn = new BridgeConnection({
    onState(state, attempt) {
      if (!latestCtx) return;
      applyStatus(latestCtx, state, attempt);

      if (state === "connected") {
        if (shouldNotify("connected")) {
          latestCtx.ui.notify(
            attempt > 0 ? "Reconnected to psm" : "Connected to psm",
            "info",
          );
        }
        conn?.startHeartbeat();
        if (sessionId) {
          conn?.register(
            sessionId,
            sessionPath,
            latestCtx.sessionManager.getEntries(),
          );
          sendSessionState();
        }
      } else if (state === "reconnecting") {
        if (shouldNotify("reconnecting")) {
          latestCtx.ui.notify(
            `PSM disconnected, reconnecting (${attempt})...`,
            "warning",
          );
        }
      } else if (state === "disconnected") {
        if (shouldNotify("disconnected")) {
          latestCtx.ui.notify("PSM heartbeat timeout", "error");
        }
      }
    },
    onMessage: handleMessage,
  });
}

export function doDisconnect() {
  conn?.disconnect();
  conn = null;
  if (latestCtx) latestCtx.ui.setStatus("psm", undefined);
}

export function notifyPsmStatusChange(sid: string) {
  if (conn?.state !== "connected") return;
  // The wire event keeps its legacy name for compatibility with existing PSM bridge consumers.
  conn.send({ type: "session_tag_changed", payload: { sessionId: sid, tags: [] } });
}
