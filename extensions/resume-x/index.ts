/**
 * resume-x — Enhanced resume command using PSM SQLite
 *
 * Features:
 * - SQLite fast path (no disk scan)
 * - cwd filtering for current project
 * - Detail pane: model, tokens, cost per session (monkey-patches SessionList.render)
 * - Message preview: press ← to browse full conversation history, → to return
 *
 * Data source: ~/.pi/agent/sessions/sessions.db (PSM)
 * Usage: /resume-x
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "node:path";
import { realpathSync, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { appendFileSync } from "node:fs";

const _dbgLog = path.join(homedir(), ".pi", "agent", "resume-x-crash.log");
function _crash(tag: string, err: unknown) {
  try {
    const ts = new Date().toISOString();
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    appendFileSync(_dbgLog, `[${ts}] [${tag}] ${msg}\n`);
  } catch { /* never crash on logging */ }
}

// ── Host module imports ──────────────────────────────────────────────
// Keybindings use full qualified names from pi-tui (e.g. "tui.editor.cursorLeft")
// and pi-coding-agent (e.g. "app.interrupt"). The KeybindingsManager passed to
// ctx.ui.custom() already includes both TUI and app keybindings.
import { visibleWidth, matchesKey, getKeybindings } from "@mariozechner/pi-tui";

function getHostDistDir(): string {
 return path.dirname(realpathSync(process.argv[1]));
}

function hostUrl(relativePath: string): string {
 return new URL(relativePath, pathToFileURL(getHostDistDir()).href + "/").href;
}

// ── SQLite ───────────────────────────────────────────────────────────

interface ResumeSession {
 path: string;
 id: string;
 cwd: string;
 name?: string;
 parentSessionPath?: string;
 created: Date;
 modified: Date;
 messageCount: number;
 firstMessage: string;
 lastMessage: string;
 lastMessageRole: string;
 allMessagesText: string;
}

// Session detail with extra fields for display
interface ResumeSessionWithDetail extends ResumeSession {
 detail: SessionDetail | null;
}

interface SessionDetail {
 models: string[];
 inputTokens: number;
 outputTokens: number;
 cacheReadTokens: number;
 cacheWriteTokens: number;
 totalCost: number;
}

interface SessionMessage {
 role: string;
 sourceType: string;
 content: string;
 timestamp: string;
}

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
 return true;
 } catch {
 return false;
 }
}

function loadSessionsFromSqlite(cwdFilter?: string): ResumeSession[] {
 if (!initDb()) return [];
 try {
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

function loadSessionDetail(sessionPath: string): SessionDetail | null {
 if (detailCache.has(sessionPath)) return detailCache.get(sessionPath)!;
 if (!initDb()) { detailCache.set(sessionPath, null); return null; }
 try {
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

function loadSessionMessages(sessionPath: string): SessionMessage[] {
 if (!initDb()) { return []; }
 try {
 const rows = db!.prepare(`
 SELECT role, source_type, content, timestamp
 FROM message_entries
 WHERE session_path = ?
 ORDER BY timestamp ASC
 `).all(sessionPath) as Array<{
 role: string; source_type: string; content: string; timestamp: string;
 }>;
 const result = rows.map((r) => ({
 role: r.role,
 sourceType: r.source_type,
 content: r.content,
 timestamp: r.timestamp,
 }));

 return result;
 } catch (e) {

 return [];
 }
}

// ── Full-text search across sessions, messages, tags ─────────────────

interface SearchResult {
 sessionId: string;
 sessionPath: string;
 sessionName: string;
 matchType: "name" | "message" | "tag";
 matchSnippet: string;
 modified: string;
 messageCount: number;
}

function searchSessions(query: string, cwdFilter?: string): SearchResult[] {
 if (!initDb() || !query.trim()) return [];
 const q = query.toLowerCase();
 const results: SearchResult[] = [];
 const seen = new Set<string>();

 const cwdClause = cwdFilter ? " AND s.cwd = ?" : "";
 const cwdParams = cwdFilter ? [cwdFilter] : [];

 try {
 // Search session names + first/last message
 const rows = db!.prepare(`
 SELECT s.id, s.path, COALESCE(s.name, '') as name,
 COALESCE(s.first_message, '') as first_message,
 COALESCE(s.last_message, '') as last_message,
 s.modified, s.message_count
 FROM sessions s
 WHERE (lower(s.name) LIKE ? OR lower(s.first_message) LIKE ? OR lower(s.last_message) LIKE ?)${cwdClause}
 ORDER BY s.modified DESC
 LIMIT 50
 `).all(`%${q}%`, `%${q}%`, `%${q}%`, ...cwdParams) as Array<{
 id: string; path: string; name: string;
 first_message: string; last_message: string; modified: string; message_count: number;
 }>;

 for (const r of rows) {
 if (seen.has(r.id)) continue;
 seen.add(r.id);
 const displayName = r.name || r.first_message || r.last_message || "(no content)";
 const matchType: SearchResult["matchType"] = r.name && r.name.toLowerCase().includes(q) ? "name" : "message";
 results.push({
 sessionId: r.id, sessionPath: r.path, sessionName: displayName,
 matchType, matchSnippet: "", modified: r.modified,
 messageCount: r.message_count,
 });
 }

 // Search message content
 const msgCwdClause = cwdFilter ? " AND s.cwd = ?" : "";
 const msgRows = db!.prepare(`
 SELECT me.session_path, me.role, me.content, me.timestamp,
 s.id as session_id, COALESCE(s.name, '') as session_name, s.modified, s.message_count
 FROM message_entries me
 JOIN sessions s ON s.path = me.session_path
 WHERE lower(me.content) LIKE ?${msgCwdClause}
 ORDER BY me.timestamp DESC
 LIMIT 50
 `).all(`%${q}%`, ...cwdParams) as Array<{
 session_path: string; role: string; content: string; timestamp: string;
 session_id: string; session_name: string; modified: string; message_count: number;
 }>;

 for (const r of msgRows) {
 if (seen.has(r.session_id)) continue;
 seen.add(r.session_id);
 const idx = r.content.toLowerCase().indexOf(q);
 const start = Math.max(0, idx - 40);
 const end = Math.min(r.content.length, idx + q.length + 40);
 const snippet = (start > 0 ? "..." : "") + r.content.slice(start, end).replace(/\n/g, " ").trim() + (end < r.content.length ? "..." : "");
 const displayName = r.session_name || snippet || "(no content)";
 results.push({
 sessionId: r.session_id, sessionPath: r.session_path,
 sessionName: displayName,
 matchType: "message", matchSnippet: "",
 modified: r.modified, messageCount: r.message_count,
 });
 }

 // Search tags
 const { tags, marks } = loadKanbanData();
 for (const tag of tags) {
 if (!tag.name.toLowerCase().includes(q)) continue;
 const sessionIds = marks.filter((m) => m.tagId === tag.id).map((m) => m.sessionId);
 for (const sid of sessionIds) {
 if (seen.has(sid)) continue;
 seen.add(sid);
 const sessionRows = db!.prepare(`
 SELECT path, COALESCE(name, '') as name, modified, message_count FROM sessions WHERE id = ?
 `).get(sid) as { path: string; name: string; modified: string; message_count: number } | undefined;
 if (sessionRows) {
 const displayName = sessionRows.name || `#${tag.name}`;
 results.push({
 sessionId: sid, sessionPath: sessionRows.path,
 sessionName: displayName,
 matchType: "tag", matchSnippet: "",
 modified: sessionRows.modified, messageCount: sessionRows.message_count,
 });
 }
 }
 }
 } catch (e) {
 _crash("SEARCH", e);
 }

 return results;
}

// ── Kanban status (from PSM JSON files) ──────────────────────────────

interface KanbanTag {
 id: string;
 name: string;
 color: string;
}

interface SessionTagMark {
 sessionId: string;
 tagId: string;
}

let kanbanTagsCache: KanbanTag[] | null = null;
let kanbanMarksCache: SessionTagMark[] | null = null;
let kanbanCacheMtimeTags = 0;
let kanbanCacheMtimeMarks = 0;

function getPsmConfigDir(): string {
 return path.join(homedir(), ".pi", "pi-session-manager");
}

function getMtimeMs(filePath: string): number {
 try {
 return statSync(filePath).mtimeMs;
 } catch {
 return 0;
 }
}

function loadKanbanData(): { tags: KanbanTag[]; marks: SessionTagMark[] } {
 const configDir = getPsmConfigDir();
 const tagsPath = path.join(configDir, "tags_config.json");
 const marksPath = path.join(configDir, "session_mark.json");

 const tagsMtime = getMtimeMs(tagsPath);
 if (!kanbanTagsCache || tagsMtime !== kanbanCacheMtimeTags) {
 kanbanCacheMtimeTags = tagsMtime;
 kanbanTagsCache = [];
 if (tagsMtime > 0) {
 try {
 const raw = readFileSync(tagsPath, "utf-8");
 const parsed = JSON.parse(raw);
 if (parsed.tags && Array.isArray(parsed.tags)) {
 kanbanTagsCache = parsed.tags.map((t: any) => ({
 id: t.id || t.tag_id || "",
 name: t.name || "",
 color: t.color || "accent",
 }));
 }
 } catch { /* ignore */ }
 }
 }

 const marksMtime = getMtimeMs(marksPath);
 if (!kanbanMarksCache || marksMtime !== kanbanCacheMtimeMarks) {
 kanbanCacheMtimeMarks = marksMtime;
 kanbanMarksCache = [];
 if (marksMtime > 0) {
 try {
 const raw = readFileSync(marksPath, "utf-8");
 const parsed = JSON.parse(raw);
 if (parsed.sessionTags && Array.isArray(parsed.sessionTags)) {
 kanbanMarksCache = parsed.sessionTags.map((m: any) => ({
 sessionId: m.sessionId || m.session_id || "",
 tagId: m.tagId || m.tag_id || "",
 }));
 }
 } catch { /* ignore */ }
 }
 }

 return { tags: kanbanTagsCache || [], marks: kanbanMarksCache || [] };
}

function getSessionKanbanTags(sessionId: string): KanbanTag[] {
 const { tags, marks } = loadKanbanData();
 const tagIds = new Set(
 marks.filter((m) => m.sessionId === sessionId).map((m) => m.tagId)
 );
 return tags.filter((t) => tagIds.has(t.id));
}

function mapTagColorToTheme(color: string): string {
 switch (color) {
 case "success": return "success";
 case "warning": return "warning";
 case "destructive": return "error";
 case "info": return "accent";
 case "slate": return "muted";
 default: return "accent";
 }
}

// ── Formatters ───────────────────────────────────────────────────────

function fmtTokens(n: number): string {
 if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
 if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
 return String(n);
}

function fmtCost(v: number): string {
 if (v === 0) return "free";
 if (v < 0.01) return `$${v.toFixed(3)}`;
 if (v < 1) return `$${v.toFixed(2)}`;
 return `$${v.toFixed(1)}`;
}

function shortModel(m: string): string {
 const parts = m.split("/");
 const name = parts[parts.length - 1] || m;
 return name.replace(/-\d{8}$/, "").replace(/-\d{4,}$/, "");
}

// ── Monkey-patch ─────────────────────────────────────────────────────

const PATCHED = Symbol.for("resume-x:patched");
const THEME_KEY = Symbol.for("@mariozechner/pi-coding-agent:theme");
function getTheme(): any { return (globalThis as any)[THEME_KEY]; }

/**
 * Patch SessionList.prototype.render to append detail pane.
 * Called once per selector instance, safe to call multiple times.
 */
function patchSessionListRender(sessionList: any): void {
 const ctor = sessionList?.constructor;
 if (!ctor || ctor[PATCHED]) return;

 const proto = ctor.prototype;
 const originalRender = proto.render;

 proto.render = function patchedRender(this: any, width: number): string[] {
 const lines: string[] = originalRender.call(this, width);
 try {
 const selected = this.filteredSessions?.[this.selectedIndex];
 const session = selected?.session;
 if (session?.path) {
 const detailLines = buildDetailLines(session.path, width, {
 created: (session as any).created?.toISOString?.() ?? (session as any).created,
 modified: (session as any).modified?.toISOString?.() ?? (session as any).modified,
 lastMessage: (session as any).lastMessage ?? "",
 lastMessageRole: (session as any).lastMessageRole ?? "",
 sessionId: (session as any).id ?? "",
 });
 if (detailLines.length > 0) {
 lines.push(...detailLines);
 }
 }
 } catch { /* silent */ }
 return lines;
 };

 ctor[PATCHED] = true;
}

function fmtTime(iso: string): string {
 try {
 const d = new Date(iso);
 const now = new Date();
 const diffMs = now.getTime() - d.getTime();
 const diffMin = Math.floor(diffMs / 60000);
 const diffHr = Math.floor(diffMin / 60);
 const diffDay = Math.floor(diffHr / 24);
 const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
 if (diffMin < 1) return "just now";
 if (diffMin < 60) return `${diffMin}m ago`;
 if (diffHr < 24) return `${diffHr}h ago`;
 if (diffDay < 7) return `${diffDay}d ago`;
 return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
 } catch {
 return "";
 }
}

function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  const rawLines = text.split("\n");
  for (const raw of rawLines) {
    if (visibleWidth(raw) <= maxWidth) {
      result.push(raw);
    } else {
      // Wrap by visible width, not character count
      let line = "";
      let lineW = 0;
      for (const ch of raw) {
        const chW = visibleWidth(ch);
        if (lineW + chW > maxWidth && line.length > 0) {
          result.push(line);
          line = ch;
          lineW = chW;
        } else {
          line += ch;
          lineW += chW;
        }
      }
      if (line) result.push(line);
    }
  }
  return result;
}

function buildPreviewLines(
  width: number,
  messages: SessionMessage[],
  scrollOffset: number,
  sessionPath: string,
): { lines: string[]; totalLines: number } {
  const theme = getTheme();
  if (!theme) return { lines: [], totalLines: 0 };

  // Truncate line to terminal width using visible width
  function safeLine(line: string): string {
    if (visibleWidth(line) <= width) return line;
    // Truncate by visible width
    let result = "";
    let w = 0;
    for (const ch of line) {
      const chW = visibleWidth(ch);
      if (w + chW > width) break;
      result += ch;
      w += chW;
    }
    return result;
  }

  const allLines: string[] = [];
  const sep = "─".repeat(Math.max(10, width));

  // Header
  allLines.push(theme.fg("border", sep));
  const shortPath = sessionPath.split("/").pop() || sessionPath;
  const titleText = `Preview: ${shortPath} · ${messages.length} turns`;
  const title = titleText.length > width ? titleText.slice(0, width) : titleText;
  allLines.push(theme.fg("accent", title));
  const hintText = "↑↓ scroll · ⇧↑↓ page · ← back · ⏎ resume";
  const hintPadding = Math.max(0, width - hintText.length);
  allLines.push(theme.fg("muted", hintText) + " ".repeat(hintPadding));
  allLines.push(theme.fg("border", sep));

  // Messages (skip empty content, compact tool calls)
  for (const msg of messages) {
    if (!msg.content || msg.content.trim().length === 0) continue;

    const isTool = msg.sourceType === "tool_use" || msg.sourceType === "tool_result";

    // Try to parse tool call JSON for compact display
    let toolNames: string[] = [];
    if (isTool) {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          toolNames = parsed.map((t: any) => t.name || t.tool_name || "tool").filter(Boolean);
        } else if (parsed.name || parsed.tool_name) {
          toolNames = [parsed.name || parsed.tool_name];
        }
      } catch { /* not JSON, show as text */ }
    }

    // Separator between messages
    allLines.push("");

    // Role + time header
    const roleLabel = msg.role === "user" ? "User" : isTool ? "Tool" : "Agent";
    const roleColor = msg.role === "user" ? "accent" : isTool ? "warning" : "success";
    const timeStr = fmtTime(msg.timestamp);
    const header = `${roleLabel} · ${timeStr}`;
    allLines.push(theme.fg(roleColor, header));

    // Thin separator
    allLines.push(theme.fg("border", "─".repeat(Math.min(40, width))));

    // Content
    const contentWidth = Math.max(10, width - 4);

    if (isTool && toolNames.length > 0) {
      // Compact tool call display
      const summary = toolNames.length === 1
        ? toolNames[0]
        : `${toolNames.length} calls: ${toolNames.slice(0, 4).join(", ")}${toolNames.length > 4 ? "..." : ""}`;
      allLines.push(safeLine(`    ${theme.fg("muted", summary)}`));
    } else {
      const wrapped = wrapText(msg.content, contentWidth);
      for (const chunk of wrapped) {
        allLines.push(safeLine(`    ${chunk}`));
      }
    }
  }

  const totalLines = allLines.length;
  const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
  const maxVisible = Math.max(8, termHeight - 2);

  const start = Math.min(scrollOffset, Math.max(0, totalLines - maxVisible));
  const end = Math.min(start + maxVisible, totalLines);

  return { lines: allLines.slice(start, end).map(safeLine), totalLines };
}

function buildSearchLines(
 width: number,
 query: string,
 results: SearchResult[],
 selectedIdx: number,
 scrollOffset: number,
 cwdOnly: boolean,
 cwd: string,
): string[] {
 const theme = getTheme();
 if (!theme) return ["(no theme)"];

 const lines: string[] = [];
 const sep = "─".repeat(Math.max(10, width));
 const safeLine = (s: string) => {
 let w = 0;
 let result = "";
 for (const ch of s) {
 const chW = visibleWidth(ch);
 if (w + chW > width) break;
 result += ch;
 w += chW;
 }
 return result;
 };

 // Calculate content height and center vertically
 const MAX_RESULTS = 10;
 const shown = results.slice(0, MAX_RESULTS);
 const resultLines = shown.length; // 1 line per result
 const hasQuery = query.trim().length > 0;
 const hasResults = shown.length > 0;
 // contentLines: sep + title + input + sep + (count? + results?) + hint? + footer
 let contentLines = 4; // sep + title + input + sep
 if (!hasQuery) contentLines += 1; // hint
 else if (!hasResults) contentLines += 1; // no results msg
 else contentLines += 2 + resultLines; // count + results + footer

 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 const topPad = Math.max(0, Math.floor((termHeight - contentLines) / 2));

 // Top padding for centering
 for (let i = 0; i < topPad; i++) lines.push("");

 // Header
 lines.push(theme.fg("border", sep));
 const scopeLabel = cwdOnly ? `cwd: ${cwd.split("/").pop() || cwd}` : "all";
 lines.push(theme.fg("accent", `  Search  ⌥Q  `) + theme.fg("muted", `[Tab] ${scopeLabel}`));

 // Search input
 const cursorChar = "\u2588"; // █ block cursor
 const inputLine = `  ${query}${cursorChar}`;
 lines.push(safeLine(inputLine));
 lines.push(theme.fg("border", sep));

 if (!hasQuery) {
 lines.push(theme.fg("muted", "  Type to search sessions, messages, tags..."));
 return lines;
 }

 if (!hasResults) {
 lines.push(theme.fg("muted", `  No results for "${query}"`));
 return lines;
 }

 // Results count
 lines.push(theme.fg("muted", `  ${results.length} result${results.length > 1 ? "s" : ""}${results.length > MAX_RESULTS ? ` (showing ${MAX_RESULTS})` : ""}`));

 // Results list — single line per result with meta + badge
 const maxVisibleResults = Math.max(2, termHeight - topPad - 6);
 const start = Math.max(0, Math.min(scrollOffset, shown.length - maxVisibleResults));
 const end = Math.min(start + maxVisibleResults, shown.length);

 // Fixed column widths for consistent layout
 const badgeCol = 4; // [M]
 const metaCol = 16; // 5msg · 3h ago
 const nameMaxW = Math.max(10, width - 6 - badgeCol - metaCol);

 for (let i = start; i < end; i++) {
 const r = shown[i];
 const isSelected = i === selectedIdx;
 const prefix = isSelected ? ">" : " ";

 // Badge
 const badgeMap: Record<string, [string, string]> = {
 name: ["N", "accent"],
 message: ["M", "success"],
 tag: ["T", "warning"],
 };
 const [badge, badgeColor] = badgeMap[r.matchType] || ["M", "muted"];

 // Truncate name by visible width (CJK-safe)
 let nameTrunc = "";
 let nameVisW = 0;
 for (const ch of r.sessionName) {
 const cw = visibleWidth(ch);
 if (nameVisW + cw > nameMaxW - 3) break;
 nameTrunc += ch;
 nameVisW += cw;
 }
 if (nameTrunc.length < r.sessionName.length) nameTrunc += "...";

 // Pad name to fixed width
 const namePad = Math.max(0, nameMaxW - nameVisW - (nameTrunc.endsWith("...") ? 3 : 0));

 // Meta right-aligned
 const meta = `${r.messageCount}msg ${fmtTime(r.modified)}`;

 const badgeStr = `[${badge}]`;
 const namePart = isSelected ? theme.fg("accent", nameTrunc) : nameTrunc;
 const metaPart = theme.fg("muted", meta);

 lines.push(safeLine(`${prefix} ${theme.fg(badgeColor, badgeStr)} ${namePart}${" ".repeat(namePad)} ${metaPart}`));
 }

 // Footer hints
 lines.push("");
 lines.push(theme.fg("muted", "  ↑↓ navigate · ⏎ open · Tab scope · Esc back"));

 return lines;
}

function buildDetailLines(sessionPath: string, width: number, sessionData?: { created: string; modified: string; lastMessage?: string; lastMessageRole?: string; sessionId?: string } | null): string[] {
 const theme = getTheme();
 if (!theme) return [];

 const detail = loadSessionDetail(sessionPath);

 const lines: string[] = [];
 const sep = "─".repeat(Math.min(50, width - 4));
 lines.push(theme.fg("border", " " + sep));

 // Time: start + updated
 if (sessionData) {
 const started = fmtTime(sessionData.created);
 const updated = fmtTime(sessionData.modified);
 lines.push(` ${theme.fg("muted", "Started ")}${theme.fg("accent", started)}`);
 lines.push(` ${theme.fg("muted", "Updated ")}${theme.fg("accent", updated)}`);
 }

 // Model
 if (detail && detail.models && detail.models.length > 0) {
 const modelStr = detail.models.map((m) => theme.fg("accent", shortModel(m))).join(theme.fg("muted", " + "));
 lines.push(` ${theme.fg("muted", "Model ")}${modelStr}`);
 }

 // Tokens + messages
 if (detail) {
 const tp: string[] = [];
 if (detail.inputTokens > 0) tp.push(`${theme.fg("muted", "in")} ${theme.fg("accent", fmtTokens(detail.inputTokens))}`);
 if (detail.outputTokens > 0) tp.push(`${theme.fg("muted", "out")} ${theme.fg("accent", fmtTokens(detail.outputTokens))}`);
 if (detail.cacheReadTokens > 0) tp.push(`${theme.fg("muted", "cache")} ${theme.fg("muted", fmtTokens(detail.cacheReadTokens))}`);
 if (tp.length > 0) {
 lines.push(` ${theme.fg("muted", "Tokens ")}${tp.join(theme.fg("muted", " "))}`);
 }

 // Cost
 const costColor = detail.totalCost === 0 ? "success" : "muted";
 lines.push(` ${theme.fg("muted", "Cost ")}${theme.fg(costColor, fmtCost(detail.totalCost))}`);
 }

 // Message count
 if (sessionData) {
 const mc = (sessionData as any).messageCount;
 if (mc > 0) {
 lines.push(` ${theme.fg("muted", "Messages ")}${theme.fg("accent", String(mc))}`);
 }
 }

 // Kanban status
 const sessionId = sessionData?.sessionId;
 if (sessionId) {
 const kbTags = getSessionKanbanTags(sessionId);
 if (kbTags.length > 0) {
 const tagStr = kbTags.map((t) => theme.fg(mapTagColorToTheme(t.color), t.name)).join(theme.fg("muted", ", "));
 lines.push(` ${theme.fg("muted", "Kanban ")}${tagStr}`);
 }
 }

 // Last user message
 const lastMsg = sessionData?.lastMessage?.trim();
 const lastRole = sessionData?.lastMessageRole?.trim();
 if (lastMsg && lastRole === "user") {
 const label = "User ";
 const prefixLen = 2 + label.length; // " " + label
 const contentWidth = Math.max(10, width - prefixLen);
 const wrapped = wrapText(lastMsg, contentWidth);
 wrapped.forEach((chunk, idx) => {
 if (idx === 0) {
 lines.push(` ${theme.fg("muted", label)}${theme.fg("accent", chunk)}`);
 } else {
 lines.push(` ${" ".repeat(label.length)}${theme.fg("accent", chunk)}`);
 }
 });
 }

 return lines;
}

// ── Extension entry ──────────────────────────────────────────────────

export default async function resumeXExtension(pi: ExtensionAPI) {
 // Global crash catcher — log any unhandled exception to file
 const _origListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
 function _globalCatch(err: Error) {
 _crash("UNCAUGHT", err);
 }
 process.on("uncaughtException", _globalCatch);
 process.on("unhandledRejection", (reason) => _crash("UNHANDLED-REJ", reason));
 const [{ SessionSelectorComponent }] = await Promise.all([
 import(hostUrl("modes/interactive/components/session-selector.js")),
 ]);

 pi.registerFlag("resume-x", {
 description: "Resume from PSM SQLite (fast, no disk scan)",
 type: "boolean",
 default: false,
 });

 // Store switchSession from session_start event (available on every session start)
 pi.on("session_start", (event, ctx) => {
 if (typeof ctx.switchSession === "function") switchSessionFn = ctx.switchSession;
 });

 // Toggle state for shortcut
 let isOpen = false;
 let closeFn: (() => void) | null = null;
 let switchSessionFn: ((path: string) => Promise<any>) | null = null;

 const runResumeX = async (ctx: ExtensionContext) => {
 if (isOpen && closeFn) {
 closeFn();
 return;
 }
 isOpen = true;
 try {
 const cwd = process.cwd();

 const currentSessions = loadSessionsFromSqlite(cwd);
 const allSessions = loadSessionsFromSqlite();

 if (allSessions.length === 0) {
 ctx.ui.notify("No sessions found in SQLite.", "warning");
 return;
 }

 const currentLoader = async (onProgress?: (loaded: number, total: number) => void) => {
 onProgress?.(currentSessions.length, currentSessions.length);
 return currentSessions;
 };
 const allLoader = async (onProgress?: (loaded: number, total: number) => void) => {
 onProgress?.(allSessions.length, allSessions.length);
 return allSessions;
 };

 // Use ctx.ui.custom() — patch SessionList.render inside the factory
 const selectedPath = await ctx.ui.custom<string | null>((tui, _theme, keybindings, done) => {
 closeFn = () => done(null);
 const selector = new SessionSelectorComponent(
 currentLoader,
 allLoader,
 (p: string) => done(p),
 () => done(null),
 () => { done(null); ctx.shutdown(); },
 () => tui.requestRender(),
 { showRenameHint: false, keybindings },
 );

 // Patch SessionList.render for detail pane
 try {
 const sl = selector.getSessionList?.();
 if (sl) patchSessionListRender(sl);
 } catch { /* silent */ }

 // Preview mode state
 let mode: "list" | "preview" | "search" = "list";
 let previewMessages: SessionMessage[] = [];
 let previewScrollOffset = 0;
 let previewTotalLines = 0;
 let previewSessionPath = "";

 // Search mode state
 let searchQuery = "";
 let searchResults: SearchResult[] = [];
 let searchSelectedIdx = 0;
 let searchScrollOffset = 0;
 let searchCwdOnly = false;
 const searchCwd = process.cwd();
 let escBuffer = "";
 let escTimer: ReturnType<typeof setTimeout> | null = null;

 return {
 render(width: number) {
 // Search mode: render search UI
 if (mode === "search") {
 return buildSearchLines(width, searchQuery, searchResults, searchSelectedIdx, searchScrollOffset, searchCwdOnly, searchCwd);
 }

 let baseLines: string[];
 try {
 baseLines = selector.render(width);
 } catch (e) {
 _crash("SELECTOR-RENDER", e);
 return ["(render error)"];
 }
 if (mode !== "preview" || previewMessages.length === 0) {
 return baseLines;
 }
 try {
 const result = buildPreviewLines(width, previewMessages, previewScrollOffset, previewSessionPath);
 previewTotalLines = result.totalLines;
 const merged = [...baseLines, ...result.lines];
 return merged;
 } catch (e) {
 _crash("RENDER", e);
 mode = "list";
 previewMessages = [];
 return baseLines;
 }
 },
 invalidate() {
 selector.invalidate?.();
 },
 handleInput(data: string) {
 const hex = Buffer.from(data).toString("hex");

 if (mode === "list") {
 // ⌥Q — enter search mode
 const isAltQ = matchesKey(data, "alt+q");
 if (isAltQ) {
 mode = "search";
 searchQuery = "";
 searchResults = [];
 searchSelectedIdx = 0;
 searchScrollOffset = 0;
 searchCwdOnly = true;
 tui.requestRender();
 return;
 }

 const isRight = keybindings.matches(data, "tui.editor.cursorRight");
 if (isRight) {
 try {
 const sl = selector.getSessionList?.();
 if (sl) {
 const selected = sl.filteredSessions?.[sl.selectedIndex];
 const session = selected?.session;
 if (session?.path) {
 const msgs = loadSessionMessages(session.path);
 if (msgs.length > 0) {
 previewMessages = msgs;
 previewSessionPath = session.path;
 previewScrollOffset = 0;
 previewTotalLines = 0;
 mode = "preview";

 tui.requestRender();
 return;
 }
 }
 }
 } catch (e) { _crash("ERR", e); }
 }
 try {
 selector.handleInput(data);
 } catch (e) { _crash("ERR", e); }
 tui.requestRender();
 return;
 }

 // Preview mode
 if (mode === "preview") {
 try {
 const isLeft = keybindings.matches(data, "tui.editor.cursorLeft");
 const isCancel = keybindings.matches(data, "tui.select.cancel");
 const isInterrupt = keybindings.matches(data, "app.interrupt");
 const isUp = keybindings.matches(data, "tui.select.up") || keybindings.matches(data, "tui.editor.cursorUp");
 const isDown = keybindings.matches(data, "tui.select.down") || keybindings.matches(data, "tui.editor.cursorDown");
 const isPgUp = keybindings.matches(data, "tui.select.pageUp") || keybindings.matches(data, "tui.editor.pageUp") || hex === "1b5b313b3241";
 const isPgDn = keybindings.matches(data, "tui.select.pageDown") || keybindings.matches(data, "tui.editor.pageDown") || hex === "1b5b313b3242";
 const isConfirm = keybindings.matches(data, "tui.select.confirm");

 if (isLeft || isCancel || isInterrupt) {
 mode = "list";
 previewMessages = [];
 tui.requestRender();
 return;
 }
 if (isConfirm && previewSessionPath) {
 done(previewSessionPath);
 return;
 }
 if (isUp) {
 previewScrollOffset = Math.max(0, previewScrollOffset - 1);
 tui.requestRender();
 return;
 }
 if (isDown) {
 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 const maxVisible = Math.max(8, termHeight - 2);
 const maxOffset = Math.max(0, previewTotalLines - maxVisible);
 previewScrollOffset = Math.min(maxOffset, previewScrollOffset + 1);
 tui.requestRender();
 return;
 }
 if (isPgUp) {
 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 previewScrollOffset = Math.max(0, previewScrollOffset - Math.floor(termHeight / 2));
 tui.requestRender();
 return;
 }
 if (isPgDn) {
 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 const maxVisible = Math.max(8, termHeight - 2);
 const maxOffset = Math.max(0, previewTotalLines - maxVisible);
 previewScrollOffset = Math.min(maxOffset, previewScrollOffset + Math.floor(termHeight / 2));
 tui.requestRender();
 return;
 }
 } catch (e) {
 _crash("PREVIEW", e);
 mode = "list";
 previewMessages = [];
 tui.requestRender();
 }
 }

 // Search mode
 if (mode === "search") {
 const kb = getKeybindings();
 const isCancel = kb.matches(data, "tui.select.cancel") || keybindings.matches(data, "tui.select.cancel");
 const isInterrupt = kb.matches(data, "app.interrupt") || keybindings.matches(data, "app.interrupt");

 if (isCancel || isInterrupt) {
 mode = "list";
 searchQuery = "";
 searchResults = [];
 if (escTimer) { clearTimeout(escTimer); escTimer = null; }
 escBuffer = "";
 tui.requestRender();
 return;
 }

 // Tab — toggle CWD / global
 const isTab = kb.matches(data, "tui.input.tab") || keybindings.matches(data, "tui.input.tab") || data === "\t";
 if (isTab) {
 searchCwdOnly = !searchCwdOnly;
 searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
 searchSelectedIdx = 0;
 searchScrollOffset = 0;
 tui.requestRender();
 return;
 }

 const isConfirm = kb.matches(data, "tui.select.confirm") || keybindings.matches(data, "tui.select.confirm") || data === "\n";
 const maxResults = Math.min(searchResults.length, 10);

 if (isConfirm && maxResults > 0) {
 const selected = searchResults[searchSelectedIdx];
 if (selected) {
 mode = "list";
 searchQuery = "";
 searchResults = [];
 done(selected.sessionPath);
 }
 return;
 }

 // Arrow keys via keybindings + j/k fallback
 const isUp = kb.matches(data, "tui.select.up") || keybindings.matches(data, "tui.select.up") || data === "k";
 const isDown = kb.matches(data, "tui.select.down") || keybindings.matches(data, "tui.select.down") || data === "j";

 if (isUp && maxResults > 0) {
 searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
 if (searchSelectedIdx < searchScrollOffset) searchScrollOffset = searchSelectedIdx;
 tui.requestRender();
 return;
 }
 if (isDown && maxResults > 0) {
 searchSelectedIdx = Math.min(maxResults - 1, searchSelectedIdx + 1);
 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 const mvr = Math.max(2, termHeight - 10);
 if (searchSelectedIdx >= searchScrollOffset + mvr) searchScrollOffset = searchSelectedIdx - mvr + 1;
 tui.requestRender();
 return;
 }

 // Backspace
 if (hex === "7f" || hex === "08") {
 if (searchQuery.length > 0) {
 searchQuery = searchQuery.slice(0, -1);
 searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
 searchSelectedIdx = 0;
 searchScrollOffset = 0;
 }
 tui.requestRender();
 return;
 }

 // ESC buffer for split escape sequences
 const code = data.charCodeAt(0);
 if (code === 0x1b) {
 if (escTimer) { clearTimeout(escTimer); escTimer = null; }
 escBuffer = data;
 escTimer = setTimeout(() => {
 // Timeout — ESC alone = cancel
 escBuffer = "";
 escTimer = null;
 mode = "list";
 searchQuery = "";
 searchResults = [];
 tui.requestRender();
 }, 80);
 return;
 }

 // If buffering ESC sequence, append and check
 if (escBuffer) {
 if (escTimer) { clearTimeout(escTimer); escTimer = null; }
 escBuffer += data;
 const seq = Buffer.from(escBuffer).toString("hex");
 if (seq === "1b5b41" || seq === "1b4f41") {
 // Arrow up
 searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
 if (searchSelectedIdx < searchScrollOffset) searchScrollOffset = searchSelectedIdx;
 escBuffer = "";
 tui.requestRender();
 return;
 }
 if (seq === "1b5b42" || seq === "1b4f42") {
 // Arrow down
 searchSelectedIdx = Math.min(maxResults - 1, searchSelectedIdx + 1);
 const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
 const mvr = Math.max(2, termHeight - 10);
 if (searchSelectedIdx >= searchScrollOffset + mvr) searchScrollOffset = searchSelectedIdx - mvr + 1;
 escBuffer = "";
 tui.requestRender();
 return;
 }
 // Unknown sequence — discard
 escBuffer = "";
 return;
 }

 // Skip control chars (< 0x20 except backspace) and DEL
 if ((code < 0x20 && code !== 0x08) || code === 0x7f) {
 return;
 }

 // Printable input (ASCII + UTF-8 multi-byte)
 searchQuery += data;
 searchResults = searchSessions(searchQuery, searchCwdOnly ? searchCwd : undefined);
 searchSelectedIdx = 0;
 searchScrollOffset = 0;
 tui.requestRender();
 return;
 }
 },
 };
 });

 closeFn = null;
 isOpen = false;

 if (!selectedPath) { return; }

 try {
 const switchFn = typeof ctx.switchSession === "function" ? ctx.switchSession : switchSessionFn;
 if (typeof switchFn === "function") {
 await switchFn(selectedPath);
 } else if (ctx.sessionManager && typeof ctx.sessionManager.setSessionFile === "function") {
 // Fallback: shortcut ctx lacks switchSession, use sessionManager directly
 ctx.sessionManager.setSessionFile(selectedPath);
 ctx.ui.notify("Resumed", "success");
 } else {
 ctx.ui.notify("Run /resume-x once first", "warning");
 }
 } catch (err) {
 ctx.ui.notify(`Switch failed: ${err instanceof Error ? err.message : err}`, "error");
 }
 } catch (e) {
 isOpen = false;
 closeFn = null;
 _crash("HANDLER-TOP", e);
 ctx.ui.notify(`resume-x crashed: ${e instanceof Error ? e.message : e}`, "error");
 }
 };

 pi.registerCommand("resume-x", {
 description: "Resume session from SQLite (fast, no disk scan)",
 handler: async (_args: string, ctx: ExtensionContext) => {
 if (typeof ctx.switchSession === "function") switchSessionFn = ctx.switchSession;
 await runResumeX(ctx);
 },
 });

 pi.registerShortcut("alt+x", {
 description: "Open/close resume-x session picker",
 handler: async (ctx: ExtensionContext) => {
 await runResumeX(ctx);
 },
 });

 pi.on("session_shutdown", () => {
 detailCache.clear();
 if (db) { db.close(); db = null; }
 process.removeListener("uncaughtException", _globalCatch);
 process.removeListener("unhandledRejection", (reason) => _crash("UNHANDLED-REJ", reason));
 });
}
