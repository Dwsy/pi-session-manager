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
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
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

function resolveSessionId(sessionFile: string): string {
  const base = sessionFile.replace(/\.jsonl$/, "");
  const stem = base.substring(base.lastIndexOf("/") + 1);

  const underscoreIndex = stem.lastIndexOf("_");
  if (underscoreIndex >= 0 && underscoreIndex < stem.length - 1) {
    return stem.substring(underscoreIndex + 1);
  }

  return stem;
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

// pi emits these events; PSM expects these exact names
const EVENT_FORWARD_LIST = [
  // Lifecycle
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  // Content (streaming)
  "message_start",
  "message_update",
  "message_end",
  // Tools
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "tool_call",
  "tool_result",
  // Model
  "model_select",
];

function forwardEvent(eventType: string, data?: unknown) {
  if (!conn || conn.state !== "connected" || !sessionId) return;
  const payload = data && typeof data === "object" ? data : {};
  conn.send({ type: eventType, sessionId, sessionPath, ...payload });
}

function registerEventForwarding(pi: ExtensionAPI) {
  for (const eventType of EVENT_FORWARD_LIST) {
    pi.on(eventType, (event: unknown) => {
      // Track streaming state for get_state RPC
      if (eventType === "agent_start" || eventType === "turn_start" || eventType === "message_start") {
        isStreaming = true;
      } else if (eventType === "agent_end" || eventType === "turn_end" || eventType === "message_end") {
        isStreaming = false;
      }
      const data = event && typeof event === "object" ? event : {};
      forwardEvent(eventType, data);
    });
  }
}

// ── Session state sync (model/thinking → PSM) ─────────

function sendSessionState() {
  if (!conn || conn.state !== "connected" || !sessionId) return;
  conn.send({
    type: "session_state",
    payload: {
      sessionId,
      model: null, // TODO: extract from ctx if available
      thinkingLevel: null,
      isStreaming,
    },
  });
}

// ── RPC command handler (PSM → extension) ─────────────

async function handleRpcCommand(msg: Record<string, unknown>) {
  const type = msg.type as string;
  const sid = (msg.sessionId as string) || sessionId;

  const respond = (success: boolean, data?: unknown, error?: string) => {
    conn?.send({
      type: "response",
      sessionId: sid,
      id: msg.id || type,
      success,
      data,
      error,
    });
  };

  try {
    switch (type) {
      case "prompt":
      case "follow_up": {
        const message = msg.message as string;
        if (message && piApi) {
          piApi.sendUserMessage(message);
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "No message or pi API unavailable");
        }
        break;
      }

      case "steer": {
        const message = msg.message as string;
        if (message && piApi) {
          // sendUserMessage with steer delivery
          piApi.sendUserMessage(`[Steer] ${message}`, { deliverAs: "steer" });
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "No message or pi API unavailable");
        }
        break;
      }

      case "set_model": {
        const provider = msg.provider as string;
        const modelId = msg.modelId as string;
        if (provider && modelId && piApi) {
          piApi.setModel(`${provider}/${modelId}`);
          sendSessionState();
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "Missing provider/modelId");
        }
        break;
      }

      case "set_thinking_level": {
        const level = msg.level as string;
        if (level && piApi) {
          piApi.setThinkingLevel(level as "off" | "minimal" | "low" | "medium" | "high" | "xhigh");
          sendSessionState();
          respond(true, { status: "sent" });
        } else {
          respond(false, undefined, "Missing level");
        }
        break;
      }

      case "get_state": {
        respond(true, {
          sessionId,
          sessionPath,
          isStreaming,
          model: null,
          thinkingLevel: null,
        });
        break;
      }

      case "get_commands": {
        respond(true, { commands: [] });
        break;
      }

      case "get_available_models": {
        respond(true, { models: [] });
        break;
      }

      case "abort": {
        if (piApi) {
          piApi.sendUserMessage("[Abort] Please stop current task immediately.", { deliverAs: "steer" });
        }
        respond(true, { status: "sent" });
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
  sessionId = resolveSessionId(sf);
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

/** Mid-session reconnect for extensions loaded after session_start. */
export function tryMidSessionInit(pi: {
  getCurrentContext?: () => ExtensionContext;
  context?: ExtensionContext;
}) {
  try {
    const ctx = pi.getCurrentContext?.() || pi.context;
    if (!ctx) return;
    latestCtx = ctx;
    const sf = ctx.sessionManager.getSessionFile() || "";
    sessionPath = sf;
    sessionId = resolveSessionId(sf);
    if (liveModeEnabled && sessionId) doConnect();
  } catch {
    /* fail gracefully */
  }
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
