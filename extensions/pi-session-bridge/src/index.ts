/**
 * psm-bridge — Bridge Pi agent sessions to Pi Session Manager.
 *
 * Features:
 * - Live mode: real-time session sync via WebSocket
 * - Search: full-text search across indexed sessions via HTTP API
 * - Tags: PSM-backed session tagging (no local SQLite)
 * - Context: recall and context from past sessions
 *
 * ENV: PSM_URL (default ws://127.0.0.1:52131/ws), PSM_TOKEN
 *
 * Architecture:
 *   config         — env + constants
 *   types          — shared interfaces (aligned with PSM backend)
 *   psm-client     — HTTP client for PSM's POST /api dispatch
 *   bridge-conn    — WebSocket connection with heartbeat + RPC
 *   conn-manager   — live mode lifecycle, UI status, session state
 *   tools          — LLM-callable tools (search, context, recall, tag)
 *   commands       — single /psm panel
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as connMgr from "./connection-manager.js";
import { registerAll } from "./commands.js";
import {
  sessionListTool,
  sessionSearchTool,
  sessionContextTool,
  sessionRecallTool,
  sessionTagTool,
} from "./tools.js";

export default async function (pi: ExtensionAPI) {
  // ── Register tools ──────────────────────────────────
  pi.registerTool(sessionListTool);
  pi.registerTool(sessionSearchTool);
  pi.registerTool(sessionContextTool);
  pi.registerTool(sessionRecallTool);
  pi.registerTool(sessionTagTool);

  // ── Register commands ───────────────────────────────
  registerAll(pi);

  // ── Init connection manager (event forwarding + RPC handling) ──
  connMgr.init(pi);

  // ── Session lifecycle ───────────────────────────────
  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    connMgr.initSession(ctx, pi);
  });

  pi.on("session_shutdown", async () => {
    connMgr.shutdown();
  });

  // ── Mid-session init (for extensions loaded after session_start) ──
  connMgr.tryMidSessionInit(pi as unknown as { getCurrentContext?: () => ExtensionContext; context?: ExtensionContext });
}
