import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Tag, QueryResult } from "./types.ts";

const DB_PATH = path.join(homedir(), ".pi", "agent", "sessions", "sessions.db");

let sqliteCliAvailable: boolean | null = null;
let betterSqlite: any = null;

// ── Backend detection ─────────────────────────────────

export function getDbPath(): string { return DB_PATH; }

export function isDbAvailable(): boolean { return existsSync(DB_PATH); }

function hasSqliteCli(): boolean {
  if (sqliteCliAvailable !== null) return sqliteCliAvailable;
  try { execSync("sqlite3 --version", { stdio: "ignore" }); sqliteCliAvailable = true; return true; }
  catch { sqliteCliAvailable = false; return false; }
}

function loadBetterSqlite(): any {
  if (betterSqlite !== null) return betterSqlite;
  try { const m = require("better-sqlite3"); betterSqlite = m.default || m; return betterSqlite; }
  catch { return null; }
}

// ── Low-level query helpers ───────────────────────────

function escapeValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function queryWithCli<T>(sql: string, params?: any[]): QueryResult<T[]> {
  try {
    let finalSql = sql;
    if (params) { let idx = 0; finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++])); }
    const result = spawnSync("sqlite3", [DB_PATH, "-json", finalSql], { encoding: "utf-8", timeout: 5000 });
    if (result.error) return { success: false, error: result.error.message };
    if (result.status !== 0) return { success: false, error: result.stderr || "Unknown error" };
    const stdout = result.stdout.trim();
    if (!stdout) return { success: true, data: [] as T[] };
    return { success: true, data: JSON.parse(stdout) as T[] };
  } catch (err: any) { return { success: false, error: err.message }; }
}

function queryWithBetterSqlite<T>(sql: string, params?: any[]): QueryResult<T[]> {
  const Database = loadBetterSqlite();
  if (!Database) return { success: false, error: "better-sqlite3 not available" };
  try {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    const stmt = db.prepare(sql);
    const data = params ? stmt.all(...params) : stmt.all();
    db.close();
    return { success: true, data: data as T[] };
  } catch (err: any) { return { success: false, error: err.message }; }
}

function query<T>(sql: string, params?: any[]): QueryResult<T[]> {
  return hasSqliteCli() ? queryWithCli<T>(sql, params) : queryWithBetterSqlite<T>(sql, params);
}

export function execute(sql: string, params?: any[]): QueryResult<void> {
  let finalSql = sql;
  if (params) { let idx = 0; finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++])); }
  if (hasSqliteCli()) {
    try {
      const result = spawnSync("sqlite3", [DB_PATH], { input: finalSql, encoding: "utf-8", timeout: 5000 });
      if (result.error) return { success: false, error: result.error.message };
      if (result.status !== 0) return { success: false, error: result.stderr || "Unknown error" };
      return { success: true };
    } catch (err: any) { return { success: false, error: err.message }; }
  }
  const Database = loadBetterSqlite();
  if (!Database) return { success: false, error: "No SQLite backend available" };
  try {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    const stmt = db.prepare(sql);
    params ? stmt.run(...params) : stmt.run();
    db.close();
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

// ── Schema init ───────────────────────────────────────

export function initDb(): { success: boolean; error?: string } {
  const dbDir = path.dirname(DB_PATH);
  try { mkdirSync(dbDir, { recursive: true }); } catch (err: any) {
    return { success: false, error: `Failed to create directory: ${err.message}` };
  }
  const result = execute(`
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
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(LOWER(name));
  `);
  return result.success ? { success: true } : { success: false, error: result.error };
}

// ── Tag helpers ────────────────────────────────────────

function normalizeTagRow(tag: any): Tag {
  return { ...tag, isBuiltin: tag.isBuiltin === 1 || tag.isBuiltin === true };
}

export function getAllTags(): QueryResult<Tag[]> {
  const result = query<any>(`SELECT * FROM tags ORDER BY sort_order, created_at`);
  if (!result.success) return result;
  return { success: true, data: result.data!.map(normalizeTagRow) };
}

export function getTagsForSession(sessionId: string): QueryResult<Tag[]> {
  const result = query<any>(`
    SELECT t.* FROM tags t INNER JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ? ORDER BY st.position, st.assigned_at
  `, [sessionId]);
  if (!result.success) return result;
  return { success: true, data: result.data!.map(normalizeTagRow) };
}

export function assignTag(sessionId: string, tagId: string): QueryResult<void> {
  return execute(`INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at) VALUES (?, ?, 0, ?)`,
    [sessionId, tagId, new Date().toISOString()]);
}

export function removeTag(sessionId: string, tagId: string): QueryResult<void> {
  return execute(`DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?`, [sessionId, tagId]);
}

export function moveSessionTag(sessionId: string, fromTagId: string | null, toTagId: string): QueryResult<void> {
  if (fromTagId) { const r = removeTag(sessionId, fromTagId); if (!r.success) return r; }
  return assignTag(sessionId, toTagId);
}

export function getTagByName(name: string): QueryResult<Tag | null> {
  const result = query<any>(`SELECT * FROM tags WHERE LOWER(name) = LOWER(?) LIMIT 1`, [name]);
  if (!result.success) return result as unknown as QueryResult<Tag | null>;
  const tag = result.data?.[0];
  return { success: true, data: tag ? normalizeTagRow(tag) : null };
}

export function getOrCreateTag(name: string, color = "info", icon?: string): QueryResult<Tag> {
  const existing = getTagByName(name);
  if (!existing.success) return existing as unknown as QueryResult<Tag>;
  if (existing.data) return { success: true, data: existing.data };
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const result = execute(
    `INSERT INTO tags (id, name, color, icon, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)`,
    [id, name, color, icon || null, now]);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, data: { id, name, color, icon, sortOrder: 0, isBuiltin: false, createdAt: now } };
}

// ── Built-in tags ──────────────────────────────────────

export const BUILTIN_TAGS = [
  { id: "builtin-todo", name: "Todo", color: "warning", sortOrder: 0 },
  { id: "builtin-wip", name: "In Progress", color: "info", sortOrder: 1 },
  { id: "builtin-done", name: "Done", color: "success", sortOrder: 2 },
  { id: "builtin-important", name: "Important", color: "destructive", sortOrder: 3 },
  { id: "builtin-archive", name: "Archive", color: "slate", sortOrder: 4 },
];

export const BUILTIN_TAG_MAP: Record<string, string> = {
  "todo": "builtin-todo",
  "wip": "builtin-wip", "in-progress": "builtin-wip",
  "done": "builtin-done", "complete": "builtin-done", "completed": "builtin-done",
  "important": "builtin-important",
  "archive": "builtin-archive", "archived": "builtin-archive",
};

export const TAG_NAMES: Record<string, string> = {
  "builtin-todo": "Todo",
  "builtin-wip": "In Progress",
  "builtin-done": "Done",
  "builtin-important": "Important",
  "builtin-archive": "Archive",
};

export const TAG_DESCRIPTIONS: Record<string, string> = {
  "Todo": "Waiting to be started",
  "In Progress": "Currently in progress",
  "Done": "Task completed",
  "Important": "High priority",
  "Archive": "Archived record",
};

export function ensureBuiltinTags() {
  const now = new Date().toISOString();
  for (const tag of BUILTIN_TAGS) {
    execute(`INSERT OR IGNORE INTO tags (id, name, color, sort_order, is_builtin, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      [tag.id, tag.name, tag.color, tag.sortOrder, now]);
  }
}

// ── Tag cache ──────────────────────────────────────────

let cachedTags: Tag[] = [];
let lastCacheTime = 0;
const CACHE_TTL = 30000;

export async function refreshTagCache(): Promise<Tag[]> {
  const now = Date.now();
  if (now - lastCacheTime < CACHE_TTL && cachedTags.length > 0) return cachedTags;
  const result = getAllTags();
  if (result.success && result.data) { cachedTags = result.data; lastCacheTime = now; }
  return cachedTags;
}

export function getCachedTags(): Tag[] { return cachedTags; }

export function findTag(name: string, tags: Tag[]): Tag | null {
  const normalized = name.toLowerCase().trim();
  const builtinId = BUILTIN_TAG_MAP[normalized];
  if (builtinId) { const found = tags.find(t => t.id === builtinId); if (found) return found; }
  const exact = tags.find(t => t.name.toLowerCase() === normalized);
  if (exact) return exact;
  return tags.find(t => t.name.toLowerCase().includes(normalized)) || null;
}
