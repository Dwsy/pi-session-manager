/**
 * resume-x — Database layer
 *
 * SQLite access via better-sqlite3.
 * Reads from PSM's sessions.db (read-only).
 */

import * as path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import Database from "better-sqlite3";
import { appendFileSync } from "node:fs";
import type { ResumeSession, SessionDetail, SessionMessage } from "./types.js";

// ── Error logging ────────────────────────────────────────────────────

const _dbgLog = path.join(homedir(), ".pi", "agent", "resume-x-crash.log");
export function _crash(tag: string, err: unknown) {
  try {
    const ts = new Date().toISOString();
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    appendFileSync(_dbgLog, `[${ts}] [${tag}] ${msg}\n`);
  } catch { /* never crash on logging */ }
}

// ── Connection singleton ─────────────────────────────────────────────

let db: InstanceType<typeof Database> | null = null;
const detailCache = new Map<string, SessionDetail | null>();

function getDbPath(): string {
  return path.join(homedir(), ".pi", "agent", "sessions", "sessions.db");
}

function initDb(): boolean {
  if (db) return true;
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) return false;
  try {
    db = new Database(dbPath, { readonly: true });
    db.pragma("busy_timeout = 5000");
    return true;
  } catch (e) {
    _crash("initDb", e);
    db = null;
    return false;
  }
}

// ── Session queries ──────────────────────────────────────────────────

export function loadSessionsFromSqlite(cwdFilter?: string): ResumeSession[] {
  if (!initDb()) return [];
  try {
    if (db && db.open === false) { db = null; if (!initDb()) return []; }
    let sql = `
      SELECT s.path, s.id, s.cwd, COALESCE(s.name, '') as name,
             s.created, s.modified, s.message_count,
             COALESCE(s.first_message, '') as first_message,
             COALESCE(s.last_message, '') as last_message,
             COALESCE(s.last_message_role, '') as last_message_role,
             COALESCE(s.parent_session_path, '') as parent_session_path
      FROM sessions s
    `;
    const params: string[] = [];
    if (cwdFilter) {
      sql += ` WHERE s.cwd = ?`;
      params.push(cwdFilter);
    }
    sql += ` ORDER BY s.modified DESC`;

    const rows = (params.length > 0
      ? db!.prepare(sql).all(...params)
      : db!.prepare(sql).all()
    ) as Array<{
      path: string; id: string; cwd: string; name: string;
      created: string; modified: string; message_count: number;
      first_message: string; last_message: string; last_message_role: string; parent_session_path: string;
    }>;

    return rows.map((r) => ({
      path: r.path,
      id: r.id,
      cwd: r.cwd,
      name: r.name || undefined,
      parentSessionPath: r.parent_session_path || undefined,
      created: new Date(r.created),
      modified: new Date(r.modified),
      messageCount: r.message_count,
      firstMessage: r.first_message || "(no messages)",
      lastMessage: r.last_message || "",
      lastMessageRole: r.last_message_role || "",
      allMessagesText: [r.first_message, r.last_message].filter(Boolean).join(" "),
    }));
  } catch {
    return [];
  }
}

export function loadSessionDetail(sessionPath: string): SessionDetail | null {
  if (detailCache.has(sessionPath)) return detailCache.get(sessionPath)!;
  if (!initDb()) { detailCache.set(sessionPath, null); return null; }
  try {
    if (db && db.open === false) { db = null; if (!initDb()) { detailCache.set(sessionPath, null); return null; } }
    const row = db!.prepare(`
      SELECT models_json,
             input_tokens, output_tokens,
             cache_read_tokens, cache_write_tokens,
             input_cost, output_cost,
             cache_read_cost, cache_write_cost
      FROM session_details_cache WHERE path = ?
    `).get(sessionPath) as any;

    if (!row) { detailCache.set(sessionPath, null); return null; }

    let models: string[] = [];
    try { models = JSON.parse(row.models_json); } catch { /* ignore */ }

    const totalCost = (row.input_cost || 0) + (row.output_cost || 0)
      + (row.cache_read_cost || 0) + (row.cache_write_cost || 0);

    const detail: SessionDetail = {
      models,
      inputTokens: row.input_tokens || 0,
      outputTokens: row.output_tokens || 0,
      cacheReadTokens: row.cache_read_tokens || 0,
      cacheWriteTokens: row.cache_write_tokens || 0,
      totalCost,
    };
    detailCache.set(sessionPath, detail);
    return detail;
  } catch {
    detailCache.set(sessionPath, null);
    return null;
  }
}

export function loadSessionMessages(sessionPath: string): SessionMessage[] {
  if (!initDb()) { return []; }
  try {
    if (db && db.open === false) { db = null; if (!initDb()) return []; }
    const rows = db!.prepare(`
      SELECT role, source_type, content, timestamp
      FROM message_entries
      WHERE session_path = ?
      ORDER BY timestamp ASC
    `).all(sessionPath) as Array<{
      role: string; source_type: string; content: string; timestamp: string;
    }>;
    return rows.map((r) => ({
      role: r.role,
      sourceType: r.source_type,
      content: r.content,
      timestamp: r.timestamp,
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Get the database instance (for search module).
 */
export function getDb(): InstanceType<typeof Database> | null {
  if (!initDb()) return null;
  if (db && db.open === false) { db = null; initDb(); }
  return db;
}
