/**
 * Pi Session Manager Bridge Extension
 *
 * Bridges local Pi agent sessions to pi-session-manager desktop app.
 * Multiple Pi processes share one psm WS (port 52131), each registered by sessionId.
 *
 * ENV:  PSM_URL (default ws://127.0.0.1:52131/ws),  PSM_TOKEN
 *
 * Status indicator (visible in Pi TUI bottom bar):
 *   🟢 Connected   ← 连接正常
 *   ⏳ Reconnecting ← 断线重连中（显示尝试次数）
 *   ❌ Disconnected ← 连接断开
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { WebSocket } from "ws";
import * as path from "node:path";

// ── Config ─────────────────────────────────────────────

const PSM_URL = process.env.PSM_URL || "ws://127.0.0.1:52131/ws";
const PSM_TOKEN = process.env.PSM_TOKEN || "";
const HB_INTERVAL = 15_000;    // ping every 15s
const HB_TIMEOUT = 30_000;     // no pong for 30s → dead
const RECONNECT_BASE = 3000;
const RECONNECT_MAX = 30_000;

// ── Helpers ────────────────────────────────────────────

function extractSessionId(ctx: ExtensionContext): { sessionId: string; sessionPath: string } {
  const sf = ctx.sessionManager.getSessionFile() || "";
  return { sessionId: path.basename(sf, ".jsonl"), sessionPath: sf };
}

// ── BridgeConnection ───────────────────────────────────

interface ConnectionCallbacks {
  onState: (state: "connected" | "reconnecting" | "disconnected", attempt: number) => void;
  onMessage: (msg: any) => void;
}

class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private _lastSentId = "";
  private _state: "connected" | "reconnecting" | "disconnected" = "disconnected";

  // Heartbeat
  private hbTimer: NodeJS.Timeout | null = null;
  private lastPongAt = 0;

  get state() { return this._state; }

  constructor(
    private readonly cb: ConnectionCallbacks,
  ) {
    this.connect();
  }

  private setState(s: "connected" | "reconnecting" | "disconnected") {
    this._state = s;
    this.cb.onState(s, this.reconnectAttempts);
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.cleanup();
    this.intentionallyClosed = false;

    const url = PSM_TOKEN ? `${PSM_URL}?token=${PSM_TOKEN}` : PSM_URL;
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastPongAt = Date.now();
      this.setState("connected");
    });

    this.ws.on("message", (data: Buffer) => {
      try { this.cb.onMessage(JSON.parse(data.toString())); } catch { /* skip */ }
    });

    this.ws.on("close", (code, reason) => {
      this.stopHeartbeat();
      const wasTimeout = Date.now() - this.lastPongAt > HB_TIMEOUT;
      if (wasTimeout) {
        this.setState("disconnected");
      }
      if (!this.intentionallyClosed) this.scheduleReconnect();
    });

    this.ws.on("error", () => { /* onclose fires after */ });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.setState("reconnecting");
    const delay = Math.min(RECONNECT_MAX, RECONNECT_BASE * Math.pow(1.5, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  sendEntry(sessionId: string, sessionPath: string, payload: { eventType: string; entry: any }) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    
    // Log for debugging - seeing if message_update actually goes out
    if (payload.eventType.includes("message") || payload.eventType.includes("tool")) {
      console.log(`[psm-bridge] -> Forwarding ${payload.eventType} for ${sessionId}`);
    }

    this.send({ type: "pi-agent:entry", sessionId, sessionPath, payload });
  }

  // ── Heartbeat ──────────────────────────────────────

  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    if (this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ ping: true })); } catch {}
    }
    this.hbTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) { this.stopHeartbeat(); return; }
      const elapsed = Date.now() - this.lastPongAt;
      if (elapsed > HB_TIMEOUT) {
        this.setState("disconnected");
        this.cleanup();
        return;
      }
      try { this.ws.send(JSON.stringify({ ping: true })); } catch {}
    }, HB_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
  }

  pongReceived() {
    this.lastPongAt = Date.now();
  }

  // ── Cleanup ──────────────────────────────────────────

  private cleanup() {
    this.stopHeartbeat();
    if (this.ws) { this.ws.removeAllListeners(); try { this.ws.close(); } catch {} this.ws = null; }
  }

  disconnect() {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.cleanup();
  }
}

// ── Extension ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let latestCtx: ExtensionContext | null = null;
  let sessionId = "";
  let sessionPath = "";
  let conn: BridgeConnection | null = null;
  let isShuttingDown = false;

  // Track if we already notified about connection issues (avoid spam)
  let lastNotifyState = "";
  let notifyCooldown = 0;

  function shouldNotify(newState: string): boolean {
    const now = Date.now();
    if (now - notifyCooldown < 5000) return false; // max once per 5s
    if (newState === lastNotifyState) return false;
    lastNotifyState = newState;
    notifyCooldown = now;
    return true;
  }

  // ── Commands ────────────────────────────────────────

  pi.registerCommand("psm", {
    description: "PSM bridge status",
    handler: (_args, ctx) => {
      const s = conn?.state ?? "disconnected";
      const badge = s === "connected" ? "🟢" : s === "reconnecting" ? "⏳" : "❌";
      ctx.ui.notify(`${badge} PSM Bridge\nSession: ${sessionId}\nState: ${s}`, "info");
    },
  });

  pi.registerCommand("psm-connect", {
    description: "Connect to psm",
    handler: (_args, ctx) => { doConnect(); ctx.ui.notify("Connecting to psm...", "info"); },
  });

  pi.registerCommand("psm-disconnect", {
    description: "Disconnect from psm",
    handler: (_args, ctx) => { doDisconnect(); ctx.ui.notify("Disconnected", "info"); },
  });

  pi.registerCommand("steer", {
    description: "Steer running agent",
    handler: (args, ctx) => {
      if (latestCtx && !latestCtx.isIdle()) {
        pi.sendUserMessage(args.join(" "), { deliverAs: "steer" });
      } else {
        ctx.ui.notify("No active session", "warning");
      }
    },
  });

  // ── Connection lifecycle ────────────────────────────

  function doConnect() {
    if (conn?.state === "connected") return;
    if (conn) conn.disconnect();
    isShuttingDown = false;
    lastNotifyState = "";

    conn = new BridgeConnection({
      onState: (state, attempt) => {
        if (!latestCtx) return;
        switch (state) {
          case "connected":
            latestCtx.ui.setStatus("psm", "🟢 PSM");
            if (shouldNotify("connected") && attempt > 0) {
              latestCtx.ui.notify("Reconnected to psm", "info");
            }
            conn?.startHeartbeat();
            // Re-register after reconnect
            conn?.send({
              type: "register",
              payload: { sessionId, sessionPath, pid: process.pid, cwd: process.cwd() },
            });
            // Send current session state (model, thinking, context)
            broadcastSessionState();
            break;
          case "reconnecting":
            latestCtx.ui.setStatus("psm", `⏳ Reconnect ${attempt}`);
            if (shouldNotify("reconnecting")) {
              latestCtx.ui.notify(`PSM disconnected, reconnecting (${attempt})...`, "warning");
            }
            break;
          case "disconnected":
            latestCtx.ui.setStatus("psm", "❌ Timeout");
            if (shouldNotify("disconnected")) {
              latestCtx.ui.notify("PSM heartbeat timeout", "error");
            }
            break;
        }
      },
      onMessage: (msg: any) => {
        const id = msg.id; // RPC correlation ID
        const eventType = msg?.event_type === "event" ? msg.event : msg.type;
        // If it's a flat RPC command, the "payload" is the message itself
        const payload = msg?.event_type === "event" ? msg.payload : msg;

        // Matching logic: either direct session match or UUID match from the payload
        const localUuid = sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        const payloadSessionId = payload?.sessionId || payload?.session_id || "";
        const sessionMatches = payloadSessionId === sessionId || (localUuid && payloadSessionId === localUuid);

        console.log(`[psm-bridge] Received ${eventType} (id: ${id}), matches: ${sessionMatches}`);

        // Define a helper to send success response back
        const sendResponse = (success = true, data?: any) => {
          if (id) {
            conn?.send({
              type: "response",
              command: eventType,
              success,
              id,
              sessionId: sessionId,
              data
            });
          }
        };

        if (msg.type === "ping" || msg.ping === true) {
          conn?.send({ type: "pong" });
          return;
        } 
        if (msg.type === "pong" || msg.pong === true) {
          conn?.pongReceived();
          return;
        }

        // --- RPC Commands ---
        // If it's a multi-client PSM, it sends RPCs to specific clients. 
        // We check matches here to be safe.
        if (!sessionMatches && id) {
          console.warn(`[psm-bridge] Session mismatch: expected ${sessionId}/${localUuid}, got ${payloadSessionId}`);
          return;
        }

        if (eventType === "steer" && latestCtx && !latestCtx.isIdle()) {
          const deliverAs = payload?.deliverAs === "followUp" ? "followUp" : "steer";
          pi.sendUserMessage(payload?.message || "", { deliverAs });
          sendResponse(true);
        } else if (eventType === "abort" && latestCtx) {
          latestCtx.abort();
          sendResponse(true);
        } else if (eventType === "set_model") {
          latestCtx?.modelRegistry.getAvailable().then((models: any[]) => {
            const target = models.find((m: any) => m.provider === payload.provider && m.id === payload.modelId);
            if (target) {
              pi.setModel(target);
              sendResponse(true);
            } else {
              sendResponse(false, "Model not found");
            }
          }).catch(e => sendResponse(false, e.toString()));
        } else if (eventType === "set_thinking_level") {
          pi.setThinkingLevel(payload.level);
          sendResponse(true);
        } else if (eventType === "get_state") {
          broadcastSessionState();
          sendResponse(true);
        } else if (eventType === "prompt") {
          if (latestCtx && !latestCtx.isIdle()) {
            const behavior = payload.streamingBehavior || (payload.deliverAs === "followUp" ? "followUp" : "steer");
            pi.sendUserMessage(payload.message || "", { deliverAs: behavior as any });
          } else {
            // If idle, just send a normal message
            pi.sendUserMessage(payload.message || "");
          }
          sendResponse(true);
        }
      },
    });
  }

  function doDisconnect() {
    isShuttingDown = true;
    conn?.disconnect();
    conn = null;
    if (latestCtx) latestCtx.ui.setStatus("psm", undefined);
  }

  // ── Forward events ──────────────────────────────────

  function forward(eventName: string, event: any) {
    conn?.sendEntry(sessionId, sessionPath, { eventType: eventName, entry: event });
  }

  // ── Model / Thinking / Context info ──────────────────

  function broadcastSessionState() {
    if (!latestCtx || !conn?.state || conn.state !== "connected") return;
    const model = latestCtx.model;
    const thinkingLevel = pi.getThinkingLevel();
    const contextUsage = latestCtx.getContextUsage();
    conn?.send({
      type: "session_state",
      payload: { sessionId, model, thinkingLevel, contextUsage },
    });
  }

  const EVENTS = [
    "message_start", "message_update", "message_end",
    "tool_execution_start", "tool_execution_update", "tool_execution_end",
    "agent_start", "agent_end", "turn_start", "turn_end",
    "model_select", "auto_compaction_start", "auto_compaction_end",
  ];

  for (const et of EVENTS) {
    pi.on(et as any, async (event: any, ctx: ExtensionContext) => {
      latestCtx = ctx;
      forward(et, event);
      // After model change or turn end, broadcast full state
      if (et === "model_select" || et === "turn_end" || et === "turn_start") {
        broadcastSessionState();
      }
    });
  }

  // ── Session lifecycle ───────────────────────────────

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    latestCtx = ctx;
    ({ sessionId, sessionPath } = extractSessionId(ctx));
    lastNotifyState = "";
    doConnect();

    const entries = ctx.sessionManager.getEntries();
    for (let i = 0; i < Math.min(entries.length, 50); i++) {
      forward("history", entries[i]);
    }
    forward("session_meta", { type: "session", id: sessionId, timestamp: Date.now() });
  });

  pi.on("session_shutdown", async () => { doDisconnect(); });
}
