/**
 * resume-x — Search logic
 *
 * Full-text search across sessions, messages, and tags.
 * Also handles Kanban data loading from PSM JSON files.
 */

import * as path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { visibleWidth } from "@mariozechner/pi-tui";
import type { KanbanTag, SessionTagMark, SearchResult } from "./types.js";
import { _crash, getDb } from "./db.js";
import { fmtTime, getTheme } from "./utils.js";

// Re-export types for convenience
export type { KanbanTag, SessionTagMark, SearchResult } from "./types.js";

// ── Kanban data (from PSM JSON files) ────────────────────────────────

let kanbanTagsCache: KanbanTag[] | null = null;
let kanbanMarksCache: SessionTagMark[] | null = null;
let kanbanCacheMtimeTags = 0;
let kanbanCacheMtimeMarks = 0;

function getPsmConfigDir(): string {
  return path.join(homedir(), ".pi", "pi-session-manager");
}

function getMtimeMs(filePath: string): number {
  try { return statSync(filePath).mtimeMs; } catch { return 0; }
}

export function loadKanbanData(): { tags: KanbanTag[]; marks: SessionTagMark[] } {
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

export function getSessionKanbanTags(sessionId: string): KanbanTag[] {
  const { tags, marks } = loadKanbanData();
  const tagIds = new Set(
    marks.filter((m) => m.sessionId === sessionId).map((m) => m.tagId)
  );
  return tags.filter((t) => tagIds.has(t.id));
}

export function mapTagColorToTheme(color: string): string {
  switch (color) {
    case "success": return "success";
    case "warning": return "warning";
    case "destructive": return "error";
    case "info": return "accent";
    case "slate": return "muted";
    default: return "accent";
  }
}

// ── Search across sessions, messages, tags ───────────────────────────

export function searchSessions(query: string, cwdFilter?: string): SearchResult[] {
  const db = getDb();
  if (!db || !query.trim()) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const cwdClause = cwdFilter ? " AND s.cwd = ?" : "";
  const cwdParams = cwdFilter ? [cwdFilter] : [];

  try {
    // Search session names + first/last message
    const rows = db.prepare(`
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
    const msgRows = db.prepare(`
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
        const sessionRows = db.prepare(`
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

// ── Search UI rendering ──────────────────────────────────────────────

export function buildSearchLines(
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
  const truncateLine = (s: string) => {
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
  const resultLines = shown.length;
  const hasQuery = query.trim().length > 0;
  const hasResults = shown.length > 0;
  let contentLines = 4;
  if (!hasQuery) contentLines += 1;
  else if (!hasResults) contentLines += 1;
  else contentLines += 2 + resultLines;

  const termHeight = typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
  const topPad = Math.max(0, Math.floor((termHeight - contentLines) / 2));

  for (let i = 0; i < topPad; i++) lines.push("");

  // Header
  lines.push(theme.fg("border", sep));
  const scopeLabel = cwdOnly ? `cwd: ${cwd.split("/").pop() || cwd}` : "all";
  lines.push(theme.fg("accent", `  Search  ⌥Q  `) + theme.fg("muted", `[Tab] ${scopeLabel}`));

  // Search input
  const cursorChar = "\u2588";
  const inputLine = `  ${query}${cursorChar}`;
  lines.push(truncateLine(inputLine));
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

  // Results list
  const maxVisibleResults = Math.max(2, termHeight - topPad - 6);
  const start = Math.max(0, Math.min(scrollOffset, shown.length - maxVisibleResults));
  const end = Math.min(start + maxVisibleResults, shown.length);

  const badgeCol = 4;
  const metaCol = 16;
  const nameMaxW = Math.max(10, width - 6 - badgeCol - metaCol);

  for (let i = start; i < end; i++) {
    const r = shown[i];
    const isSelected = i === selectedIdx;
    const prefix = isSelected ? ">" : " ";

    const badgeMap: Record<string, [string, string]> = {
      name: ["N", "accent"],
      message: ["M", "success"],
      tag: ["T", "warning"],
    };
    const [badge, badgeColor] = badgeMap[r.matchType] || ["M", "muted"];

    let nameTrunc = "";
    let nameVisW = 0;
    for (const ch of r.sessionName) {
      const cw = visibleWidth(ch);
      if (nameVisW + cw > nameMaxW - 3) break;
      nameTrunc += ch;
      nameVisW += cw;
    }
    if (nameTrunc.length < r.sessionName.length) nameTrunc += "...";

    const namePad = Math.max(0, nameMaxW - nameVisW - (nameTrunc.endsWith("...") ? 3 : 0));
    const meta = `${r.messageCount}msg ${fmtTime(r.modified)}`;

    const badgeStr = `[${badge}]`;
    const namePart = isSelected ? theme.fg("accent", nameTrunc) : nameTrunc;
    const metaPart = theme.fg("muted", meta);

    lines.push(truncateLine(`${prefix} ${theme.fg(badgeColor, badgeStr)} ${namePart}${" ".repeat(namePad)} ${metaPart}`));
  }

  lines.push("");
  lines.push(theme.fg("muted", "  ↑↓ navigate · ⏎ open · Tab scope · Esc back"));

  return lines;
}
