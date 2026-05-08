/**
 * resume-x — Rendering logic
 *
 * Preview pane, detail pane, and monkey-patch for SessionList.
 */

import { visibleWidth } from "@mariozechner/pi-tui";
import type { SessionMessage } from "./types.js";
import { loadSessionDetail } from "./db.js";
import { getSessionKanbanTags, mapTagColorToTheme } from "./search.js";
import { fmtTokens, fmtCost, shortModel, fmtTime, wrapText, safeLine, getTheme, getTermHeight, getMaxVisible } from "./utils.js";

// ── Monkey-patch ─────────────────────────────────────────────────────

const PATCHED = Symbol.for("resume-x:patched");

/**
 * Patch SessionList.prototype.render to append detail pane.
 * Called once per selector instance, safe to call multiple times.
 */
export function patchSessionListRender(sessionList: any): void {
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

// ── Preview pane ─────────────────────────────────────────────────────

export function buildPreviewLines(
  width: number,
  messages: SessionMessage[],
  scrollOffset: number,
  sessionPath: string,
): { lines: string[]; totalLines: number } {
  const theme = getTheme();
  if (!theme) return { lines: [], totalLines: 0 };

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
      const summary = toolNames.length === 1
        ? toolNames[0]
        : `${toolNames.length} calls: ${toolNames.slice(0, 4).join(", ")}${toolNames.length > 4 ? "..." : ""}`;
      allLines.push(safeLine(`    ${theme.fg("muted", summary)}`, width));
    } else {
      const wrapped = wrapText(msg.content, contentWidth);
      for (const chunk of wrapped) {
        allLines.push(safeLine(`    ${chunk}`, width));
      }
    }
  }

  const totalLines = allLines.length;
  const termHeight = getTermHeight();
  const maxVisible = getMaxVisible();

  const start = Math.min(scrollOffset, Math.max(0, totalLines - maxVisible));
  const end = Math.min(start + maxVisible, totalLines);

  return { lines: allLines.slice(start, end).map((l) => safeLine(l, width)), totalLines };
}

// ── Detail pane (appended to SessionList) ────────────────────────────

export function buildDetailLines(
  sessionPath: string,
  width: number,
  sessionData?: { created: string; modified: string; lastMessage?: string; lastMessageRole?: string; sessionId?: string } | null,
): string[] {
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
    const prefixLen = 2 + label.length;
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
