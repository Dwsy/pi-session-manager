/**
 * Pi Session Manager Bridge Extension
 *
 * Bridges local Pi agent sessions to pi-session-manager desktop app.
 * Multiple Pi processes share one psm WS (port 52131), each registered by sessionId.
 *
 * Also includes session state tagging (merged from pi-session-state):
 *   - Tool: session_tag (action: list/set/remove)
 *   - Commands: /state, /state-set, /state-list, /state-clear, /flow
 *   - SQLite-backed tag persistence via sessions.db
 *
 * ENV:  PSM_URL (default ws://127.0.0.1:52131/ws),  PSM_TOKEN
 *
 * Status indicator (visible in Pi TUI bottom bar):
 *   🟢 Connected   ← Connection healthy
 *   ⏳ Reconnecting ← Reconnecting (shows attempt count)
 *   ❌ Disconnected ← Connection lost
 *
 * Live Mode:
 *   Enabled by default
 *   Auto-connects to PSM and forwards session events
 *   Can be disabled via /psm-live off
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { BridgeConnection } from "./ws-bridge.ts";
import type { BridgeState } from "./ws-bridge.ts";
import { isDbAvailable, initDb, ensureBuiltinTags, refreshTagCache, getTagsForSession } from "./tag-db.ts";
import { registerTagCommands } from "./tag-commands.ts";
import { registerSessionContextTool } from "./session-context-tool.ts";
import { registerSessionRenameTool } from "./session-rename-tool.ts";
import { registerSessionRecallTool } from "./session-recall-tool.ts";
import { registerSessionSearchTool } from "./session-search-tool.ts";
import { registerSessionTagTool } from "./session-tag-tool.ts";

// ── Helpers ────────────────────────────────────────────

function extractSessionId(ctx: ExtensionContext): { sessionId: string; sessionPath: string } {
  const sf = ctx.sessionManager.getSessionFile() || "";
  return { sessionId: path.basename(sf, ".jsonl"), sessionPath: sf };
}

// ── Extension ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let latestCtx: ExtensionContext | null = null;
  let sessionId = "";
  let sessionPath = "";
  let conn: BridgeConnection | null = null;
  let isShuttingDown = false;
  let lastNotifyState = "";
  let notifyCooldown = 0;
  let liveModeEnabled = true;

  function shouldNotify(newState: string): boolean {
    const now = Date.now();
    if (now - notifyCooldown < 5000) return false;
    if (newState === lastNotifyState) return false;
    lastNotifyState = newState;
    notifyCooldown = now;
    return true;
  }

  // ── Core commands ──────────────────────────────────

  pi.registerCommand("psm", {
    description: "PSM bridge status",
    handler: async (_args, ctx) => {
      const s = conn?.state ?? "disconnected";
      const badge = s === "connected" ? "🟢" : s === "reconnecting" ? "⏳" : "❌";
      const liveBadge = liveModeEnabled ? "🔴 LIVE" : "⚪ OFF";
      ctx.ui.notify(`${badge} PSM Bridge ${liveBadge}\nSession: ${sessionId}\nState: ${s}`, "info");
    },
  });

  pi.registerCommand("psm-connect", {
    description: "Connect to psm (requires live mode on)",
    handler: async (_args, ctx) => {
      if (!liveModeEnabled) {
        ctx.ui.notify("⚠️ Live mode is OFF\nEnable with: /psm-live on", "warning");
        return;
      }
      doConnect();
      ctx.ui.notify("Connecting to psm...", "info");
    },
  });

  pi.registerCommand("psm-disconnect", {
    description: "Disconnect from psm",
    handler: async (_args, ctx) => { doDisconnect(); ctx.ui.notify("Disconnected", "info"); },
  });

  pi.registerCommand("psm-live", {
    description: "Toggle live mode (on/off)",
    handler: async (args: string, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on" || action === "enable" || action === "true") {
        liveModeEnabled = true;
        ctx.ui.notify("🔴 Live mode ON\nAuto-connect enabled", "info");
        // If we have a session, connect now
        if (sessionId && conn?.state !== "connected") {
          doConnect();
        }
      } else if (action === "off" || action === "disable" || action === "false") {
        liveModeEnabled = false;
        doDisconnect();
        ctx.ui.notify("⚪ Live mode OFF\nAuto-connect disabled", "info");
      } else {
        const status = liveModeEnabled ? "🔴 ON" : "⚪ OFF";
        ctx.ui.notify(`Live mode: ${status}\nUsage: /psm-live on|off`, "info");
      }
    },
  });

  pi.registerCommand("steer", {
    description: "Steer running agent",
    handler: async (args: string, ctx) => {
      if (latestCtx && !latestCtx.isIdle()) {
        pi.sendUserMessage(args, { deliverAs: "steer" });
      } else {
        ctx.ui.notify("No active session", "warning");
      }
    },
  });

  // ── Tag module ──────────────────────────────────────

  registerTagCommands(pi, () => sessionId, () => conn);
  registerSessionTagTool(pi, () => conn);
  registerSessionSearchTool(pi, () => conn);
  registerSessionContextTool(pi, () => conn);
  registerSessionRecallTool(pi, () => conn);
  registerSessionRenameTool(pi, () => conn);

  // ── Connection lifecycle ────────────────────────────

  function doConnect() {
    if (conn?.state === "connected") return;
    if (conn) conn.disconnect();
    isShuttingDown = false;
    lastNotifyState = "";

    conn = new BridgeConnection({
      onState: (state: BridgeState, attempt: number) => {
        if (!latestCtx) return;
        switch (state) {
          case "connected":
            latestCtx.ui.setStatus("psm", "🟢 PSM");
            if (shouldNotify("connected") && attempt > 0) latestCtx.ui.notify("Reconnected to psm", "info");
            conn?.startHeartbeat();
            conn?.send({
              type: "register",
              payload: { sessionId, sessionPath, pid: process.pid, cwd: process.cwd(), entries: latestCtx?.sessionManager.getEntries() || [] },
            });
            broadcastSessionState();
            break;
          case "reconnecting":
            latestCtx.ui.setStatus("psm", `⏳ Reconnect ${attempt}`);
            if (shouldNotify("reconnecting")) latestCtx.ui.notify(`PSM disconnected, reconnecting (${attempt})...`, "warning");
            break;
          case "disconnected":
            latestCtx.ui.setStatus("psm", "❌ Timeout");
            if (shouldNotify("disconnected")) latestCtx.ui.notify("PSM heartbeat timeout", "error");
            break;
        }
      },
      onMessage: (msg: any) => {
        const id = msg.id;
        const eventType = msg?.event_type === "event" ? msg.event : msg.type;
        const payload = msg?.event_type === "event" ? msg.payload : msg;
        const localUuid = sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        const payloadSessionId = payload?.sessionId || "";
        const sessionMatches = payloadSessionId === sessionId || (localUuid && payloadSessionId === localUuid);

        const sendResponse = (success = true, data?: any) => {
          if (id) conn?.send({ type: "response", command: eventType, success, id, sessionId, data });
        };

        if (msg.type === "ping" || msg.ping === true) { conn?.send({ type: "pong" }); return; }
        if (msg.type === "pong" || msg.pong === true) { conn?.pongReceived(); return; }
        if (!sessionMatches && id) return;

        if (eventType === "steer") {
          if (latestCtx && !latestCtx.isIdle()) {
            pi.sendUserMessage(payload?.message || "", { deliverAs: "steer" });
            sendResponse(true);
          } else {
            sendResponse(false, "steer requires an active streaming session");
          }
        } else if (eventType === "follow_up") {
          if (latestCtx && !latestCtx.isIdle()) {
            pi.sendUserMessage(payload?.message || "", { deliverAs: "followUp" });
            sendResponse(true);
          } else {
            sendResponse(false, "follow_up requires an active streaming session");
          }
        } else if (eventType === "abort" && latestCtx) {
          latestCtx.abort();
          sendResponse(true);
        } else if (eventType === "set_model") {
          try {
            const models = latestCtx?.modelRegistry.getAvailable() || [];
            const target = models.find((m: any) => m.provider === payload.provider && m.id === payload.modelId);
            if (target) { pi.setModel(target); sendResponse(true); } else { sendResponse(false, "Model not found"); }
          } catch (e: any) { sendResponse(false, e.toString()); }
        } else if (eventType === "set_thinking_level") {
          pi.setThinkingLevel(payload.level);
          sendResponse(true);
        } else if (eventType === "get_state") {
          broadcastSessionState();
          sendResponse(true, buildSessionState());
        } else if (eventType === "get_commands") {
          sendResponse(true, { commands: pi.getCommands() });
        } else if (eventType === "prompt") {
          if (latestCtx && !latestCtx.isIdle()) {
            const behavior = payload.streamingBehavior;
            const messageText = typeof payload.message === "string" ? payload.message.trim() : "";
            if (messageText.startsWith("/")) {
              pi.sendUserMessage(payload.message || "");
              sendResponse(true);
            } else if (behavior) {
              pi.sendUserMessage(payload.message || "", { deliverAs: behavior as any });
              sendResponse(true);
            } else {
              sendResponse(false, "prompt requires streamingBehavior while streaming");
            }
          } else {
            pi.sendUserMessage(payload.message || "");
            sendResponse(true);
          }
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
    conn?.sendEntry(sessionId, sessionPath, eventName, event);
  }

  // ── Session state broadcast ─────────────────────────

  function buildSessionState() {
    const model = latestCtx?.model;
    const availableModels = (latestCtx?.modelRegistry.getAvailable() || []).map((item: any) => ({
      provider: item.provider,
      id: item.id,
      name: item.name || item.id,
    }));
    const thinkingLevel = pi.getThinkingLevel();
    const contextUsage = latestCtx?.getContextUsage();
    const tagsResult = getTagsForSession(sessionId);
    const tags = tagsResult.success ? (tagsResult.data || []) : [];

    return {
      sessionId,
      sessionPath,
      model,
      availableModels,
      thinkingLevel,
      contextUsage,
      isStreaming: latestCtx ? !latestCtx.isIdle() : false,
      pendingMessageCount: latestCtx?.hasPendingMessages?.() ? 1 : 0,
      tags,
    };
  }

  function broadcastSessionState() {
    if (!latestCtx || !conn?.state || conn.state !== "connected") return;
    conn?.send({
      type: "session_state",
      payload: buildSessionState(),
    });
  }

  // ── Event listeners ─────────────────────────────────

  const EVENTS = [
    "message_start", "message_update", "message_end",
    "tool_execution_start", "tool_execution_update", "tool_execution_end",
    "agent_start", "agent_end", "turn_start", "turn_end",
    "model_select", "auto_compaction_start", "auto_compaction_end", "queue_update",
  ];

  for (const et of EVENTS) {
    pi.on(et as any, async (event: any, ctx: ExtensionContext) => {
      latestCtx = ctx;
      forward(et, event);
      if (et === "model_select" || et === "turn_end" || et === "turn_start") broadcastSessionState();
    });
  }

  // ── Session lifecycle ───────────────────────────────

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    latestCtx = ctx;
    ({ sessionId, sessionPath } = extractSessionId(ctx));
    lastNotifyState = "";

    if (!isDbAvailable()) initDb();
    ensureBuiltinTags();
    refreshTagCache();

    // Only auto-connect if live mode is enabled
    if (!liveModeEnabled) {
      if (latestCtx) latestCtx.ui.setStatus("psm", "⚪ PSM (live off)");
      return;
    }

    if (conn?.state === "connected") {
      conn.send({
        type: "register",
        payload: { sessionId, sessionPath, pid: process.pid, cwd: process.cwd(), entries: ctx.sessionManager.getEntries() },
      });
      broadcastSessionState();
    } else {
      doConnect();
    }
  });

  pi.on("session_shutdown", async () => { doDisconnect(); });

  // ── Mid-session load ────────────────────────────────
  // Only initialize if live mode is enabled
  if (!liveModeEnabled) return;

  try {
    const currentCtx = (pi as any).getCurrentContext?.() || (pi as any).context;
    if (currentCtx) {
      latestCtx = currentCtx;
      ({ sessionId, sessionPath } = extractSessionId(currentCtx));
      if (sessionId) {
        if (!isDbAvailable()) initDb();
        ensureBuiltinTags();
        refreshTagCache();
        doConnect();
      }
    }
  } catch {
    // mid-session init may fail gracefully
  }
}
