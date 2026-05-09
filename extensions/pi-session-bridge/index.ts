/**
 * psm-bridge - Bridge Pi agent sessions to Pi Session Manager
 *
 * Features:
 * - Live mode: real-time session sync via WebSocket
 * - Search: full-text search across indexed sessions via HTTP API
 * - Tags: SQLite-backed session tagging
 * - Context: recall and context from past sessions
 *
 * ENV: PSM_URL (default ws://127.0.0.1:52131/ws), PSM_TOKEN
 *
 * Status indicators:
 *   [psm]         - Connected
 *   [retry N]     - Reconnecting (attempt N)
 *   [timeout]     - Connection lost
 *   [psm: off]   - Live mode disabled
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

// ── Config ─────────────────────────────────────────────

const PSM_URL = process.env.PSM_URL || "ws://127.0.0.1:52131/ws";
const PSM_TOKEN = process.env.PSM_TOKEN || "";
const DB_PATH = path.join(homedir(), ".pi", "agent", "sessions", "sessions.db");
const HB_INTERVAL = 15_000;
const HB_TIMEOUT = 30_000;
const RECONNECT_BASE = 3_000;
const RECONNECT_MAX = 30_000;

const WS_PROTOCOL = PSM_URL.startsWith("wss") ? "https" : "http";
const WS_HOST = PSM_URL.replace(/^wss?:\/\//, "").replace(/\/.*$/, "");
const HTTP_BASE = `${WS_PROTOCOL}://${WS_HOST}`;

// ── Types ─────────────────────────────────────────────

interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: string;
  autoRules?: string;
  parentId?: string | null;
}

interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SearchHit {
  session_id: string;
  session_path: string;
  session_name?: string;
  entry_id: string;
  role: string;
  source_type: string;
  content: string;
  timestamp: string;
  score: number;
  match_reason?: string;
}

interface FullTextSearchResponse {
  hits: SearchHit[];
  total_hits: number;
  has_more: boolean;
}

interface SessionContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
}

interface SessionEntryMessage {
  role?: string;
  content?: SessionContentBlock[];
}

interface SessionEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: SessionEntryMessage;
}

interface HttpEntriesResponse {
  success: boolean;
  data?: SessionEntry[];
  error?: string;
}

// ── HTTP Client ────────────────────────────────────────

async function httpRequest<T = unknown>(pathname: string, options: RequestInit = {}): Promise<T> {
  const url = `${HTTP_BASE}${pathname}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (PSM_TOKEN) headers["Authorization"] = `Bearer ${PSM_TOKEN}`;

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

async function httpPost<T = unknown>(pathname: string, body?: unknown): Promise<T> {
  return httpRequest<T>(pathname, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function httpGet<T = unknown>(pathname: string): Promise<T> {
  return httpRequest<T>(pathname, { method: "GET" });
}

// ── WebSocket Bridge ────────────────────────────────────

type BridgeState = "connected" | "reconnecting" | "disconnected";

interface ConnectionCallbacks {
  onState: (state: BridgeState, attempt: number) => void;
  onMessage: (msg: unknown) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private intentionallyClosed = false;
  private _state: BridgeState = "disconnected";
  private hbTimer: NodeJS.Timeout | null = null;
  private lastPongAt = 0;
  private requestId = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  get state(): BridgeState {
    return this._state;
  }

  constructor(private readonly cb: ConnectionCallbacks) {
    this.connect();
  }

  private setState(s: BridgeState) {
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
      try {
        const parsed = JSON.parse(data.toString());
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.id === "string" &&
          typeof parsed.command === "string" &&
          typeof parsed.success === "boolean" &&
          this.pendingRequests.has(parsed.id)
        ) {
          const pending = this.pendingRequests.get(parsed.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(parsed.id);
          if (parsed.success) {
            pending.resolve(parsed.data);
          } else {
            pending.reject(new Error(parsed.error || `PSM command failed: ${parsed.command}`));
          }
          return;
        }
        this.cb.onMessage(parsed);
      } catch {
        /* skip */
      }
    });

    this.ws.on("close", () => {
      this.stopHeartbeat();
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) this.setState("disconnected");
      if (!this.intentionallyClosed) this.scheduleReconnect();
    });

    this.ws.on("error", () => {
      /* onclose fires after */
    });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.setState("reconnecting");
    const delay = Math.min(RECONNECT_MAX, RECONNECT_BASE * Math.pow(1.5, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  request(command: string, payload: unknown = {}, timeoutMs = 15000): Promise<unknown> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("PSM bridge is not connected"));
    }

    const id = `ext-${++this.requestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`PSM request timeout: ${command}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ id, command, payload }));
    });
  }

  sendEntry(sessionId: string, sessionPath: string, eventType: string, event: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload =
      event && typeof event === "object" && !Array.isArray(event) ? { ...event } : { event };
    this.send({ type: eventType, sessionId, sessionPath, ...payload });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongAt = Date.now();
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ ping: true }));
      } catch {
        /* ignore */
      }
    }
    this.hbTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }
      if (Date.now() - this.lastPongAt > HB_TIMEOUT) {
        this.setState("disconnected");
        this.cleanup();
        return;
      }
      try {
        this.ws.send(JSON.stringify({ ping: true }));
      } catch {
        /* ignore */
      }
    }, HB_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.hbTimer) {
      clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }

  pongReceived() {
    this.lastPongAt = Date.now();
  }

  private cleanup() {
    this.stopHeartbeat();
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PSM bridge disconnected"));
      this.pendingRequests.delete(id);
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  disconnect() {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
  }
}

// ── Tag DB ─────────────────────────────────────────────

let sqliteCliAvailable: boolean | null = null;

function hasSqliteCli(): boolean {
  if (sqliteCliAvailable !== null) return sqliteCliAvailable;
  try {
    execSync("sqlite3 --version", { stdio: "ignore" });
    sqliteCliAvailable = true;
    return true;
  } catch {
    sqliteCliAvailable = false;
    return false;
  }
}

function escapeValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function query<T>(sql: string, params?: unknown[]): QueryResult<T[]> {
  try {
    let finalSql = sql;
    if (params) {
      let idx = 0;
      finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++]));
    }
    const result = spawnSync("sqlite3", [DB_PATH, "-json", finalSql], {
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.error) return { success: false, error: result.error.message };
    if (result.status !== 0) return { success: false, error: result.stderr || "Unknown error" };
    const stdout = result.stdout.trim();
    if (!stdout) return { success: true, data: [] as T[] };
    return { success: true, data: JSON.parse(stdout) as T[] };
  } catch (err: unknown) {
    return { success: false, error: String(err) };
  }
}

function execute(sql: string, params?: unknown[]): QueryResult<void> {
  let finalSql = sql;
  if (params) {
    let idx = 0;
    finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++]));
  }
  try {
    const result = spawnSync("sqlite3", [DB_PATH], {
      input: finalSql,
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.error) return { success: false, error: result.error.message };
    if (result.status !== 0) return { success: false, error: result.stderr || "Unknown error" };
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: String(err) };
  }
}

const BUILTIN_TAGS = [
  { id: "builtin-todo", name: "Todo", color: "warning", sortOrder: 0 },
  { id: "builtin-wip", name: "In Progress", color: "info", sortOrder: 1 },
  { id: "builtin-done", name: "Done", color: "success", sortOrder: 2 },
  { id: "builtin-important", name: "Important", color: "destructive", sortOrder: 3 },
  { id: "builtin-archive", name: "Archive", color: "slate", sortOrder: 4 },
];

const BUILTIN_TAG_MAP: Record<string, string> = {
  todo: "builtin-todo",
  wip: "builtin-wip",
  "in-progress": "builtin-wip",
  done: "builtin-done",
  complete: "builtin-done",
  completed: "builtin-done",
  important: "builtin-important",
  archive: "builtin-archive",
  archived: "builtin-archive",
};

const TAG_NAMES: Record<string, string> = {
  "builtin-todo": "Todo",
  "builtin-wip": "In Progress",
  "builtin-done": "Done",
  "builtin-important": "Important",
  "builtin-archive": "Archive",
};

const TAG_DESCRIPTIONS: Record<string, string> = {
  Todo: "Waiting to be started",
  "In Progress": "Currently in progress",
  Done: "Task completed",
  Important: "High priority",
  Archive: "Archived record",
};

function normalizeTagRow(tag: Record<string, unknown>): Tag {
  return { ...tag, isBuiltin: tag.isBuiltin === 1 || tag.isBuiltin === true } as Tag;
}

function initDb(): QueryResult<void> {
  const dbDir = path.dirname(DB_PATH);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (err) {
    return { success: false, error: String(err) };
  }
  return execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'info',
      icon TEXT, sort_order INTEGER NOT NULL DEFAULT 0, is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, auto_rules TEXT, parent_id TEXT
    );
    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT NOT NULL, tag_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL, PRIMARY KEY (session_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_session_tags_session ON session_tags(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag_id);
  `);
}

function ensureBuiltinTags() {
  const now = new Date().toISOString();
  for (const tag of BUILTIN_TAGS) {
    execute(
      `INSERT OR IGNORE INTO tags (id, name, color, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      [tag.id, tag.name, tag.color, tag.sortOrder, now],
    );
  }
}

let cachedTags: Tag[] = [];
let lastCacheTime = 0;
const CACHE_TTL = 30_000;

async function refreshTagCache(): Promise<Tag[]> {
  const now = Date.now();
  if (now - lastCacheTime < CACHE_TTL && cachedTags.length > 0) return cachedTags;
  const result = query<Record<string, unknown>>(`SELECT * FROM tags ORDER BY sort_order, created_at`);
  if (result.success && result.data) {
    cachedTags = result.data.map(normalizeTagRow);
    lastCacheTime = now;
  }
  return cachedTags;
}

function getCachedTags(): Tag[] {
  return cachedTags;
}

function getTagsForSession(sessionId: string): QueryResult<Tag[]> {
  const result = query<Record<string, unknown>>(
    `SELECT t.* FROM tags t INNER JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ? ORDER BY st.position, st.assigned_at`,
    [sessionId],
  );
  if (!result.success) return result as QueryResult<Tag[]>;
  return { success: true, data: result.data!.map(normalizeTagRow) };
}

function findTag(name: string, tags: Tag[]): Tag | null {
  const normalized = name.toLowerCase().trim();
  const builtinId = BUILTIN_TAG_MAP[normalized];
  if (builtinId) {
    const found = tags.find((t) => t.id === builtinId);
    if (found) return found;
  }
  const exact = tags.find((t) => t.name.toLowerCase() === normalized);
  if (exact) return exact;
  return tags.find((t) => t.name.toLowerCase().includes(normalized)) || null;
}

function assignTag(sessionId: string, tagId: string): QueryResult<void> {
  return execute(
    `INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?, ?, 0, ?)`,
    [sessionId, tagId, new Date().toISOString()],
  );
}

function removeTag(sessionId: string, tagId: string): QueryResult<void> {
  return execute(`DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?`, [sessionId, tagId]);
}

function moveSessionTag(sessionId: string, fromTagId: string | null, toTagId: string): QueryResult<void> {
  if (fromTagId) {
    const r = removeTag(sessionId, fromTagId);
    if (!r.success) return r;
  }
  return assignTag(sessionId, toTagId);
}

function getOrCreateTag(name: string, color = "info", icon?: string): QueryResult<Tag> {
  const existing = getCachedTags().find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return { success: true, data: existing };
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const result = execute(
    `INSERT INTO tags (id, name, color, icon, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)`,
    [id, name, color, icon || null, now],
  );
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: { id, name, color, icon, sortOrder: 0, isBuiltin: false, createdAt: now },
  };
}

// ── Helpers ────────────────────────────────────────────

function extractSessionId(ctx: ExtensionContext): { sessionId: string; sessionPath: string } {
  const sf = ctx.sessionManager.getSessionFile() || "";
  return { sessionId: path.basename(sf, ".jsonl"), sessionPath: sf };
}

// ── Extension ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const localCommandHandlers = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
  let latestCtx: ExtensionContext | null = null;
  let sessionId = "";
  let sessionPath = "";
  let conn: BridgeConnection | null = null;
  let isShuttingDown = false;
  let lastNotifyState = "";
  let notifyCooldown = 0;
  let liveModeEnabled = false;

  function shouldNotify(newState: string): boolean {
    const now = Date.now();
    if (now - notifyCooldown < 5000) return false;
    if (newState === lastNotifyState) return false;
    lastNotifyState = newState;
    notifyCooldown = now;
    return true;
  }

  function registerBridgeCommand(
    name: string,
    options: {
      description: string;
      handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }>;
    },
  ) {
    localCommandHandlers.set(name, options.handler);
    pi.registerCommand(name, options);
  }

  // ── Core commands ──────────────────────────────────

  registerBridgeCommand("psm", {
    description: "PSM bridge status",
    handler: async (_args, ctx) => {
      const s = conn?.state ?? "disconnected";
      const liveBadge = liveModeEnabled ? "[live]" : "[off]";
      ctx.ui.notify(`PSM Bridge ${liveBadge}\nSession: ${sessionId}\nState: ${s}`, "info");
    },
  });

  registerBridgeCommand("psm-live", {
    description: "Toggle live mode (on/off)",
    handler: async (args: string, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on" || action === "enable" || action === "true") {
        liveModeEnabled = true;
        ctx.ui.notify("Live mode enabled. Auto-connect activated.", "info");
        if (sessionId && conn?.state !== "connected") {
          doConnect();
        }
      } else if (action === "off" || action === "disable" || action === "false") {
        liveModeEnabled = false;
        doDisconnect();
        ctx.ui.notify("Live mode disabled. Auto-connect deactivated.", "info");
      } else {
        const status = liveModeEnabled ? "enabled" : "disabled";
        ctx.ui.notify(`Live mode: ${status}\nUsage: /psm-live on|off`, "info");
      }
    },
  });

  registerBridgeCommand("psm-connect", {
    description: "Connect to psm",
    handler: async (_args, ctx) => {
      if (!liveModeEnabled) {
        ctx.ui.notify("Live mode is off. Enable with: /psm-live on", "warning");
        return;
      }
      doConnect();
      ctx.ui.notify("Connecting to psm...", "info");
    },
  });

  registerBridgeCommand("psm-disconnect", {
    description: "Disconnect from psm",
    handler: async (_args, ctx) => {
      doDisconnect();
      ctx.ui.notify("Disconnected", "info");
    },
  });

  registerBridgeCommand("state", {
    description: "Show current session tags",
    handler: async (_args, ctx) => {
      const sid = sessionId;
      if (!sid) {
        ctx.ui.notify("No session ID", "error");
        return;
      }
      const [tagsResult] = await Promise.all([getTagsForSession(sid), refreshTagCache()]);
      const currentTags = tagsResult.success ? tagsResult.data || [] : [];
      const lines = [
        `Session: ${sid.slice(0, 8)}...`,
        `Active: ${currentTags.length > 0 ? currentTags.map((t) => t.name).join(", ") : "none"}`,
        "",
        "Available:",
        ...getCachedTags().map((t) =>
          `  ${currentTags.some((ct) => ct.id === t.id) ? "[x]" : "[ ]"} ${t.name}`,
        ),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  registerBridgeCommand("state-set", {
    description: "Set session status tag",
    handler: async (args: string, ctx) => {
      const tagName = args.trim();
      if (!tagName) {
        ctx.ui.notify("Specify a tag: /state-set wip", "error");
        return;
      }
      const sid = sessionId;
      if (!sid) {
        ctx.ui.notify("No session ID", "error");
        return;
      }
      await refreshTagCache();
      let targetTag = findTag(tagName, getCachedTags());
      if (!targetTag) {
        const created = getOrCreateTag(tagName, "info");
        if (!created.success) {
          ctx.ui.notify(`Creation failed: ${created.error}`, "error");
          return;
        }
        targetTag = created.data!;
      }
      const result = moveSessionTag(sid, null, targetTag.id);
      if (result.success) notifyPsmTagChange(sid);
      ctx.ui.notify(
        result.success ? `Set: ${targetTag.name}` : `Error: ${result.error}`,
        result.success ? "info" : "error",
      );
    },
  });

  registerBridgeCommand("state-list", {
    description: "List available tags",
    handler: async (_args, ctx) => {
      await refreshTagCache();
      const builtin = getCachedTags().filter((t) => t.isBuiltin);
      const custom = getCachedTags().filter((t) => !t.isBuiltin);
      ctx.ui.notify(
        [
          "Available Tags",
          `System: ${builtin.map((t) => t.name).join(", ")}`,
          `Custom: ${custom.length > 0 ? custom.map((t) => t.name).join(", ") : "none"}`,
        ].join("\n"),
        "info",
      );
    },
  });

  registerBridgeCommand("state-clear", {
    description: "Clear all session tags",
    handler: async (_args, ctx) => {
      const sid = sessionId;
      if (!sid) {
        ctx.ui.notify("No session ID", "error");
        return;
      }
      const current = getTagsForSession(sid);
      const tags = current.success ? current.data || [] : [];
      if (tags.length === 0) {
        ctx.ui.notify("No active tags", "info");
        return;
      }
      for (const tag of tags) removeTag(sid, tag.id);
      notifyPsmTagChange(sid);
      ctx.ui.notify(`Cleared ${tags.length} tags`, "info");
    },
  });

  registerBridgeCommand("flow", {
    description: "Quick transitions: start/done/hold/todo/important/archive",
    handler: async (args: string, ctx) => {
      const action = args.trim().toLowerCase();
      const sid = sessionId;
      if (!sid) {
        ctx.ui.notify("No session ID", "error");
        return;
      }
      const transitions: Record<string, { from: string | null; to: string }> = {
        start: { from: "builtin-todo", to: "builtin-wip" },
        wip: { from: null, to: "builtin-wip" },
        done: { from: "builtin-wip", to: "builtin-done" },
        hold: { from: "builtin-wip", to: "builtin-todo" },
        todo: { from: null, to: "builtin-todo" },
        important: { from: null, to: "builtin-important" },
        archive: { from: null, to: "builtin-archive" },
      };
      const transition = transitions[action];
      if (!transition) {
        ctx.ui.notify("Unknown action: start/done/hold/todo/important/archive", "error");
        return;
      }
      const result = moveSessionTag(sid, transition.from, transition.to);
      if (result.success) notifyPsmTagChange(sid);
      const fromName = transition.from ? TAG_NAMES[transition.from] || transition.from : "none";
      const toName = TAG_NAMES[transition.to] || transition.to;
      ctx.ui.notify(
        result.success ? `${fromName} -> ${toName}` : `Error: ${result.error}`,
        result.success ? "info" : "error",
      );
    },
  });

  function notifyPsmTagChange(sid: string) {
    if (!conn?.state || conn.state !== "connected") return;
    const tagsResult = getTagsForSession(sid);
    const tags = tagsResult.success ? tagsResult.data || [] : [];
    conn.send({ type: "session_tag_changed", payload: { sessionId: sid, tags } });
  }

  // ── Tools ─────────────────────────────────────────

  // Pre-loaded session list cache (single scan_sessions call).
  let cachedSessions: SessionInfo[] | null = null;
  async function getSessions(): Promise<SessionInfo[]> {
    if (cachedSessions) return cachedSessions;
    try {
      const resp = await httpPost<{ success: boolean; data: SessionInfo[] }>(
        "/api",
        { command: "scan_sessions", payload: {} },
      );
      cachedSessions = (resp?.data || []) as SessionInfo[];
    } catch {
      cachedSessions = [];
    }
    return cachedSessions!;
  }

  async function getEntriesForSession(sessionId: string): Promise<SessionEntry[]> {
    const sessions = await getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.path) return [];
    const resp = await httpPost<{ success: boolean; data?: SessionEntry[] }>(
      "/api",
      { command: "get_session_entries", payload: { path: session.path } },
    );
    return (resp?.data || []).filter(
      (e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
    );
  }

  async function getEntriesByPath(sessionPath: string): Promise<SessionEntry[]> {
    const resp = await httpPost<{ success: boolean; data?: SessionEntry[] }>(
      "/api",
      { command: "get_session_entries", payload: { path: sessionPath } },
    );
    return (resp?.data || []).filter(
      (e) => e.type === "message" && (e.message?.role === "user" || e.message?.role === "assistant"),
    );
  }

  pi.registerTool({
    name: "session_search",
    label: "Session Search",
    description:
      "Search indexed Pi sessions via PSM HTTP API. Use this to find relevant past conversations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to run against indexed sessions." },
        roleFilter: {
          type: "string",
          enum: ["all", "user", "assistant"],
          description: "Optional role filter. Defaults to all.",
        },
        matchMode: {
          type: "string",
          enum: ["any", "all", "phrase"],
          description: "Match mode. Defaults to any.",
        },
        pageSize: {
          type: "number",
          minimum: 1,
          maximum: 20,
          description: "Max hits to return. Defaults to 8.",
        },
        sortOrder: {
          type: "string",
          enum: ["relevance", "newest", "oldest"],
          description: "Sort order. Defaults to relevance.",
        },
      },
      required: ["query"],
    },
    async execute(_toolCallId, params: Record<string, unknown>) {
      const query = String(params.query || "").trim();
      if (!query) {
        return { content: [{ type: "text", text: "query is required." }], isError: true };
      }

      try {
        const body = {
          query,
          role_filter: params.roleFilter || "all",
          glob_pattern: null,
          project_path: null,
          page: 0,
          page_size: Math.min(Math.max(Number(params.pageSize) || 8, 1), 20),
          match_mode: params.matchMode || "any",
          sort_order: params.sortOrder || "relevance",
        };

        const response = await httpPost<{ success: boolean; data: FullTextSearchResponse }>(
          "/api",
          { command: "full_text_search", payload: body },
        );
        const fts: FullTextSearchResponse = response?.data || {};
        const hits = (fts.hits || []).filter(
          (h) => h.source_type === "user" || h.source_type === "assistant",
        );

        if (hits.length === 0) {
          return {
            content: [{ type: "text", text: `No matching messages found for: ${query}` }],
          };
        }

        const lines = [
          `Session search results for: ${query}`,
          `Found ${hits.length} hit(s)${fts.has_more ? " (truncated)" : ""}`,
          "",
          ...hits.map((hit, i) => {
            const shortId = hit.session_id.slice(0, 8);
            const label = hit.session_name || shortId;
            const excerpt = hit.content.replace(/\s+/g, " ").trim().slice(0, 200);
            const ellipsis = hit.content.length > 200 ? "..." : "";
            return `${i + 1}. ${label} [${shortId}]\n   ${excerpt}${ellipsis}`;
          }),
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Search failed: ${err}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "session_tag",
    label: "Session Tag Manager",
    description:
      "Manage session status tags. Actions: list(show tags), set(assign tag), remove(unassign tag).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "set", "remove"],
          description: "Action: list, set, or remove",
        },
        tag: { type: "string", description: "Tag name for set/remove actions." },
      },
      required: ["action"],
    },
    async execute(_toolCallId, params: Record<string, unknown>) {
      const sid = sessionId;
      await refreshTagCache();

      if (params.action === "list") {
        const current = getTagsForSession(sid);
        const currentTags = current.success ? current.data || [] : [];
        const lines = [
          `Session Tags (ID: ${sid.slice(0, 8)}...)`,
          `Active: ${currentTags.length > 0 ? currentTags.map((t) => t.name).join(", ") : "none"}`,
          "",
          "Available:",
          ...getCachedTags().map((t) => {
            const assigned = currentTags.some((ct) => ct.id === t.id);
            const desc = TAG_DESCRIPTIONS[t.name] || "";
            const suffix = t.isBuiltin ? " [system]" : "";
            return `  ${assigned ? "[x]" : "[ ]"} ${t.name}${desc ? ` - ${desc}` : ""}${suffix}`;
          }),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      if (params.action === "set") {
        const tagName = String(params.tag || "").trim();
        if (!tagName) return { content: [{ type: "text", text: "tag is required for set." }], isError: true };

        let targetTag = findTag(tagName, getCachedTags());
        if (!targetTag) {
          const created = getOrCreateTag(tagName, "info");
          if (!created.success) return { content: [{ type: "text", text: `Failed: ${created.error}` }], isError: true };
          targetTag = created.data!;
        }

        const result = moveSessionTag(sid, null, targetTag.id);
        if (!result.success) return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
        notifyPsmTagChange(sid);
        const suffix = targetTag.isBuiltin ? " [system]" : "";
        return {
          content: [
            {
              type: "text",
              text: `Tag updated\n${targetTag.name}${suffix}`,
            },
          ],
        };
      }

      if (params.action === "remove") {
        const tagName = String(params.tag || "").trim();
        if (!tagName) return { content: [{ type: "text", text: "tag is required for remove." }], isError: true };
        const targetTag = findTag(tagName, getCachedTags());
        if (!targetTag) return { content: [{ type: "text", text: `Tag not found: ${tagName}` }], isError: true };
        const result = removeTag(sid, targetTag.id);
        if (!result.success) return { content: [{ type: "text", text: `Failed: ${result.error}` }], isError: true };
        notifyPsmTagChange(sid);
        return { content: [{ type: "text", text: `Removed: ${targetTag.name}` }] };
      }

      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    },
  });

  pi.registerTool({
    name: "session_context",
    label: "Session Context",
    description: "Fetch message context from a specific session via PSM HTTP API.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID from search results." },
        sessionPath: { type: "string", description: "Full session path." },
        before: { type: "number", description: "Entries before target. Default: 4." },
        after: { type: "number", description: "Entries after target. Default: 4." },
      },
    },
    async execute(_toolCallId, params: Record<string, unknown>) {
      const sid = String(params.sessionId || "");
      const path = String(params.sessionPath || "");

      if (!sid && !path) {
        return { content: [{ type: "text", text: "sessionId or sessionPath required." }], isError: true };
      }

      try {
        let entries: SessionEntry[] = [];
        if (sid) {
          entries = await getEntriesForSession(sid);
        } else if (path) {
          entries = await getEntriesByPath(path);
        }

        if (entries.length === 0) {
          return { content: [{ type: "text", text: "No dialogue entries found." }] };
        }

        const before = Math.min(Math.max(Number(params.before) || 4, 0), 20);
        const after = Math.min(Math.max(Number(params.after) || 4, 0), 20);
        const start = Math.max(entries.length - (before + after + 1), 0);
        const window = entries.slice(start, entries.length);

        const lines = [
          `Session context (${entries.length} entries)`,
          "",
          ...window.map((entry, i) => {
            const role = entry.message?.role || "unknown";
            const content = (entry.message?.content || [])
              .filter((b) => b?.type === "text" && b.text)
              .map((b) => b.text!.trim())
              .join("\n");
            return `[${start + i + 1}] ${role}: ${content || "(no text)"}`;
          }),
        ];

        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed: ${err}` }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: "session_recall",
    label: "Session Recall",
    description: "Search and retrieve surrounding dialogue context from past sessions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        maxResults: { type: "number", description: "Max recall windows. Default: 3." },
        before: { type: "number", description: "Entries before hit. Default: 2." },
        after: { type: "number", description: "Entries after hit. Default: 2." },
      },
      required: ["query"],
    },
    async execute(_toolCallId, params: Record<string, unknown>) {
      const query = String(params.query || "").trim();
      if (!query) return { content: [{ type: "text", text: "query is required." }], isError: true };

      try {
        const body = {
          query,
          role_filter: "all",
          glob_pattern: null,
          project_path: null,
          page: 0,
          page_size: Math.min(Math.max(Number(params.maxResults) || 3, 1) * 3, 15),
          match_mode: "any",
          sort_order: "relevance",
        };

        const response = await httpPost<{ success: boolean; data: FullTextSearchResponse }>(
          "/api",
          { command: "full_text_search", payload: body },
        );
        const fts: FullTextSearchResponse = response?.data || {};
        const hits = (fts.hits || [])
          .filter((h) => h.source_type === "user" || h.source_type === "assistant")
          .slice(0, Math.max(1, Math.min(Number(params.maxResults) || 3, 5)));

        if (hits.length === 0) {
          return { content: [{ type: "text", text: `No matching dialogue for: ${query}` }] };
        }

        const before = Math.min(Math.max(Number(params.before) || 2, 0), 10);
        const after = Math.min(Math.max(Number(params.after) || 2, 0), 10);
        const sections: string[] = [];

        // Pre-load session list once for all hits
        const sessions = await getSessions();
        const pathToSession = new Map(sessions.map((s) => [s.path, s]));

        for (let i = 0; i < hits.length; i++) {
          const hit = hits[i];
          let entries: SessionEntry[] = [];
          try {
            const session = pathToSession.get(hit.session_path);
            const entryPath = session?.path || hit.session_path;
            if (entryPath) {
              entries = await getEntriesByPath(entryPath);
            }
          } catch {
            /* skip */
          }

          const matchedText = hit.content.replace(/\s+/g, " ").trim().slice(0, 200);
          let context = "";
          if (entries.length > 0) {
            const idx = entries.findIndex((e) => e.id === hit.entry_id);
            const start = Math.max(0, idx - before);
            const end = Math.min(entries.length, idx + after + 1);
            context = entries
              .slice(start, end)
              .map((e, j) => {
                const role = e.message?.role || "unknown";
                const text = (e.message?.content || [])
                  .filter((b) => b?.type === "text" && b.text)
                  .map((b) => b.text!.trim())
                  .join("\n");
                const marker = idx === start + j ? "->" : "  ";
                return `${marker} ${role}: ${text || "(no text)"}`;
              })
              .join("\n");
          }

          sections.push(
            `${i + 1}. ${hit.session_name || hit.session_id.slice(0, 8)}\nmatched: ${matchedText}${context ? "\n\n" + context : ""}`,
          );
        }

        return {
          content: [
            {
              type: "text",
              text: [`Session recall for: ${query}`, "", ...sections].join("\n\n"),
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Recall failed: ${err}` }], isError: true };
      }
    },
  });

  // ── Input handler ──────────────────────────────────

  pi.on("input", async (event: { source?: string; text?: string }, ctx: ExtensionContext) => {
    if (event.source !== "extension") return;
    const text = typeof event.text === "string" ? event.text.trim() : "";
    if (!text.startsWith("/")) return;

    const withoutSlash = text.slice(1);
    const firstSpace = withoutSlash.indexOf(" ");
    const commandName = (firstSpace === -1 ? withoutSlash : withoutSlash.slice(0, firstSpace)).trim();
    const args = firstSpace === -1 ? "" : withoutSlash.slice(firstSpace + 1).trim();

    const handler = localCommandHandlers.get(commandName);
    if (handler) {
      await handler(args, ctx);
      return { action: "handled" };
    }
  });

  // ── Connection ─────────────────────────────────────

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
            latestCtx.ui.setStatus("psm", "[psm]");
            if (shouldNotify("connected") && attempt > 0) {
              latestCtx.ui.notify("Reconnected to psm", "info");
            }
            conn?.startHeartbeat();
            conn?.send({
              type: "register",
              payload: { sessionId, sessionPath, pid: process.pid, cwd: process.cwd(), entries: [] },
            });
            break;
          case "reconnecting":
            latestCtx.ui.setStatus("psm", `[retry ${attempt}]`);
            if (shouldNotify("reconnecting")) {
              latestCtx.ui.notify(`PSM disconnected, reconnecting (${attempt})...`, "warning");
            }
            break;
          case "disconnected":
            latestCtx.ui.setStatus("psm", "[timeout]");
            if (shouldNotify("disconnected")) {
              latestCtx.ui.notify("PSM heartbeat timeout", "error");
            }
            break;
        }
      },
      onMessage: (msg: unknown) => {
        const m = msg as Record<string, unknown>;
        if (m.type === "ping" || m.ping === true) {
          conn?.send({ type: "pong" });
          return;
        }
        if (m.type === "pong" || m.pong === true) {
          conn?.pongReceived();
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

  // ── Session lifecycle ───────────────────────────────

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    latestCtx = ctx;
    ({ sessionId, sessionPath } = extractSessionId(ctx));
    lastNotifyState = "";

    if (!existsSync(DB_PATH)) initDb();
    ensureBuiltinTags();
    await refreshTagCache();

    if (!liveModeEnabled) {
      if (latestCtx) latestCtx.ui.setStatus("psm", "[psm: off]");
      return;
    }

    if (conn?.state === "connected") {
      conn.send({
        type: "register",
        payload: { sessionId, sessionPath, pid: process.pid, cwd: process.cwd(), entries: ctx.sessionManager.getEntries() },
      });
    } else {
      doConnect();
    }
  });

  pi.on("session_shutdown", async () => {
    doDisconnect();
  });

  // ── Mid-session init ──────────────────────────────
  if (liveModeEnabled) {
    try {
      const currentCtx = (pi as unknown as { getCurrentContext?: () => ExtensionContext }).getCurrentContext?.() || (pi as unknown as { context?: ExtensionContext }).context;
      if (currentCtx) {
        latestCtx = currentCtx;
        ({ sessionId, sessionPath } = extractSessionId(currentCtx));
        if (sessionId) {
          if (!existsSync(DB_PATH)) initDb();
          ensureBuiltinTags();
          await refreshTagCache();
          doConnect();
        }
      }
    } catch {
      /* fail gracefully */
    }
  }
}
