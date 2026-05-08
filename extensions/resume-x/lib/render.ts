/**
 * resume-x — Rendering logic
 *
 * Preview pane, detail pane, and monkey-patch for SessionList.
 */

import { visibleWidth, wrapTextWithAnsi, Text } from "@mariozechner/pi-tui";
import type { SessionMessage } from "./types.js";
import { TOOL_PREVIEW_LINES } from "./types.js";
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
  toolExpanded = false,
): { lines: string[]; totalLines: number } {
  const theme = getTheme();
  if (!theme) return { lines: [], totalLines: 0 };

  const W = Math.max(20, width);
  const innerW = Math.max(10, W - 2);  // 1-char padding each side

  // Helper: pad line to exact width
  const pad = (s: string): string => {
    const vw = visibleWidth(s);
    return vw >= W ? s.slice(0, W) : s + " ".repeat(W - vw);
  };

  // Helper: border line
  const border = (): string => theme.fg("border", "\u2500".repeat(W));

  // Helper: wrap colored text to inner width
  const wrapContent = (text: string, maxW: number): string[] => {
    if (!text) return [];
    const lines: string[] = [];
    for (const rawLine of text.split("\n")) {
      if (rawLine.length === 0) { lines.push(""); continue; }
      const wrapped = wrapTextWithAnsi(rawLine, maxW);
      lines.push(...wrapped);
    }
    return lines;
  };

  const allLines: string[] = [];

  // ── Header ──
  allLines.push(border());
  const shortPath = sessionPath.split("/").pop() || sessionPath;
  const title = `Preview: ${shortPath} \u00b7 ${messages.length} turns`;
  allLines.push(pad(" " + theme.fg("accent", title.slice(0, innerW))));
  const hint = " \u2191\u2193 scroll \u00b7 ctrl+o tools \u00b7 \u2190 back \u00b7 \u23b5 resume";
  allLines.push(pad(theme.fg("muted", hint)));
  allLines.push(border());

  // ── Messages ──
  for (const msg of messages) {
    if (!msg.content || msg.content.trim().length === 0) continue;

    const isTool = msg.sourceType === "tool_use" || msg.sourceType === "tool_result";

    // Parse tool call JSON
    let toolNames: string[] = [];
    let toolInput = "";
    let toolOutput = "";
    if (isTool) {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          toolNames = parsed.map((t: any) => t.name || t.tool_name || "tool").filter(Boolean);
          toolInput = parsed.map((t: any) => {
            if (t.input) return typeof t.input === "string" ? t.input : JSON.stringify(t.input, null, 2);
            return "";
          }).filter(Boolean).join("\n");
          toolOutput = parsed.map((t: any) => {
            if (t.content) return typeof t.content === "string" ? t.content : JSON.stringify(t.content, null, 2);
            return "";
          }).filter(Boolean).join("\n");
        } else if (parsed.name || parsed.tool_name) {
          toolNames = [parsed.name || parsed.tool_name];
          toolInput = parsed.input ? (typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input, null, 2)) : "";
          toolOutput = parsed.content ? (typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content, null, 2)) : "";
        }
      } catch { /* not JSON */ }
    }

    // Gap between messages
    allLines.push(pad(""));

    // Role header
    const roleLabel = msg.role === "user" ? "User" : isTool ? "Tool" : "Agent";
    const roleColor = msg.role === "user" ? "accent" : isTool ? "warning" : "success";
    const timeStr = fmtTime(msg.timestamp);
    allLines.push(pad(" " + theme.fg(roleColor, theme.bold(roleLabel)) + theme.fg("muted", ` \u00b7 ${timeStr}`)));

    if (isTool && toolNames.length > 0) {
      // ── Tool call rendering ──
      const toolSep = "\u2500".repeat(Math.min(40, innerW));
      allLines.push(pad(" " + theme.fg("border", toolSep)));

      const summary = toolNames.length === 1
        ? toolNames[0]
        : `${toolNames.length} calls: ${toolNames.slice(0, 4).join(", ")}${toolNames.length > 4 ? "..." : ""}`;

      const content = toolOutput || toolInput;

      if (toolExpanded) {
        // Expanded: full output with box
        allLines.push(pad(" " + theme.fg("warning", "\u25b6 ") + theme.fg("accent", theme.bold(summary)) + theme.fg("muted", " (ctrl+o collapse)")));
        if (content) {
          allLines.push(pad(" " + theme.fg("border", "\u250c" + "\u2500".repeat(innerW - 1))));
          const contentLines = wrapContent(content, innerW - 3);
          for (const cl of contentLines) {
            allLines.push(pad(" " + theme.fg("border", "\u2502 ") + theme.fg("muted", cl)));
          }
          allLines.push(pad(" " + theme.fg("border", "\u2514" + "\u2500".repeat(innerW - 1))));
        }
      } else {
        // Collapsed: preview lines
        allLines.push(pad(" " + theme.fg("muted", "\u25b8 ") + theme.fg("accent", summary) + theme.fg("muted", " (ctrl+o expand)")));
        if (content) {
          const allContentLines = content.split("\n");
          const previewLines = allContentLines.slice(0, TOOL_PREVIEW_LINES);
          for (const pl of previewLines) {
            const truncated = pl.length > innerW - 4 ? pl.slice(0, innerW - 7) + "..." : pl;
            allLines.push(pad("   " + theme.fg("muted", truncated)));
          }
          if (allContentLines.length > TOOL_PREVIEW_LINES) {
            const hidden = allContentLines.length - TOOL_PREVIEW_LINES;
            allLines.push(pad("   " + theme.fg("muted", `... ${hidden} more line${hidden > 1 ? "s" : ""}`)));
          }
        }
      }
    } else {
      // ── Normal message rendering ──
      const msgSep = "\u2500".repeat(Math.min(40, innerW));
      allLines.push(pad(" " + theme.fg("border", msgSep)));

      // Use Text component for proper word wrap
      const textComponent = new Text(msg.content, 1, 0);
      const renderedLines = textComponent.render(innerW);
      for (const rl of renderedLines) {
        allLines.push(pad(" " + rl));
      }
    }
  }

  // ── Scroll window ──
  const totalLines = allLines.length;
  const maxVisible = getMaxVisible();
  const start = Math.min(scrollOffset, Math.max(0, totalLines - maxVisible));
  const end = Math.min(start + maxVisible, totalLines);

  return { lines: allLines.slice(start, end).map((l) => pad(l)), totalLines };
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
