/**
 * resume-x — Rendering logic
 *
 * Preview pane, detail pane, and monkey-patch for SessionList.
 */

import { visibleWidth, Markdown, Box, Container, Text, Spacer, type MarkdownTheme } from "@mariozechner/pi-tui";
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

// Safe fg lookup — falls back to identity if theme token missing
function safeFg(t: any, token: string, text: string): string {
  try { return t.fg(token, text); } catch { return text; }
}

// Build MarkdownTheme from global theme (same tokens as pi-coding-agent)
function getMarkdownTheme(t: any): MarkdownTheme {
  return {
    heading: (text: string) => safeFg(t, "mdHeading", text),
    link: (text: string) => safeFg(t, "mdLink", text),
    linkUrl: (text: string) => safeFg(t, "mdLinkUrl", text),
    code: (text: string) => safeFg(t, "mdCode", text),
    codeBlock: (text: string) => safeFg(t, "mdCodeBlock", text),
    codeBlockBorder: (text: string) => safeFg(t, "mdCodeBlockBorder", text),
    quote: (text: string) => safeFg(t, "mdQuote", t.italic(text)),
    quoteBorder: (text: string) => safeFg(t, "mdQuoteBorder", text),
    hr: (text: string) => safeFg(t, "mdHr", text),
    listBullet: (text: string) => safeFg(t, "mdListBullet", text),
    bold: (text: string) => t.bold(text),
    italic: (text: string) => t.italic(text),
    underline: (text: string) => t.underline(text),
    strikethrough: (text: string) => t.strikethrough(text),
  };
}

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
  const mdTheme = getMarkdownTheme(theme);

  // Helper: border line
  const border = (): string => theme.fg("border", "\u2500".repeat(W));

  // ── Fixed header (never scrolls) ──
  const headerContainer = new Container();
  headerContainer.addChild(new Text(border(), 0, 0));
  const shortPath = sessionPath.split("/").pop() || sessionPath;
  headerContainer.addChild(new Text(theme.fg("accent", `Preview: ${shortPath} \u00b7 ${messages.length} turns`), 1, 0));
  headerContainer.addChild(new Text(theme.fg("muted", "\u2191\u2193 scroll \u00b7 ctrl+o tools \u00b7 \u2190 back \u00b7 \u23ce resume"), 1, 0));
  headerContainer.addChild(new Text(border(), 0, 0));
  const headerLines = headerContainer.render(W);
  const headerHeight = headerLines.length;

  // ── Scrollable content ──
  const contentContainer = new Container();

  // ── Messages ──
  for (const msg of messages) {
    if (!msg.content || msg.content.trim().length === 0) continue;

    const isTool = msg.sourceType === "tool_use" || msg.sourceType === "tool_result" || msg.content.startsWith("[Tool:") || msg.content.startsWith("[Tool Output]");

    // Parse tool call JSON
    let toolNames: string[] = [];
    let toolInput = "";
    let toolOutput = "";
    if (isTool) {
      // Handle [Tool: name] and [Tool Output] formats from PSM SQLite
      if (msg.content.startsWith("[Tool: ")) {
        const endBracket = msg.content.indexOf("]");
        if (endBracket > 0) {
          toolNames = [msg.content.slice(7, endBracket).trim()];
          toolInput = msg.content.slice(endBracket + 1).trim();
        }
      } else if (msg.content.startsWith("[Tool Output]")) {
        toolOutput = msg.content.slice(14).trim();
        toolNames = ["output"];
      } else {
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
    }

    // Gap
    contentContainer.addChild(new Spacer(1));

    if (isTool && toolNames.length > 0) {
      // ── Tool call ──
      const summary = toolNames.length === 1
        ? toolNames[0]
        : `${toolNames.length} calls: ${toolNames.slice(0, 4).join(", ")}${toolNames.length > 4 ? "..." : ""}`;
      const content = toolOutput || toolInput;

      contentContainer.addChild(new Text(theme.fg("border", "\u2500".repeat(Math.min(40, W))), 0, 0));

      if (toolExpanded) {
        contentContainer.addChild(new Text(
          (theme.fg("warning", "\u25b6 ") || "\u25b6 ") + (theme.fg("accent", theme.bold(summary)) || summary) + (theme.fg("muted", " (ctrl+o collapse)") || " (ctrl+o collapse)"),
          1, 0,
        ));
        if (content) {
          contentContainer.addChild(new Markdown(content, 1, 0, mdTheme));
        }
      } else {
        contentContainer.addChild(new Text(
          (theme.fg("muted", "\u25b8 ") || "\u25b8 ") + (theme.fg("accent", summary) || summary) + (theme.fg("muted", " (ctrl+o expand)") || " (ctrl+o expand)"),
          1, 0,
        ));
        if (content) {
          const lines = content.split("\n");
          const preview = lines.slice(0, TOOL_PREVIEW_LINES);
          for (const pl of preview) {
            const truncated = pl.length > W - 6 ? pl.slice(0, W - 9) + "..." : pl;
            contentContainer.addChild(new Text(theme.fg("muted", truncated), 2, 0));
          }
          if (lines.length > TOOL_PREVIEW_LINES) {
            contentContainer.addChild(new Text(theme.fg("muted", `... ${lines.length - TOOL_PREVIEW_LINES} more lines`), 2, 0));
          }
        }
      }
    } else if (msg.role === "user") {
      // ── User message: Box + Markdown (same as UserMessageComponent) ──
      try {
        const box = new Box(1, 1, (text: string) => {
          try { return theme.bg("subtle", text); } catch { return text; }
        });
        box.addChild(new Markdown(msg.content.trim(), 0, 0, mdTheme, {
          color: (text: string) => { try { return theme.fg("userMessageText", text); } catch { return text; } },
        }));
        contentContainer.addChild(box);
      } catch {
        // Fallback: plain text
        contentContainer.addChild(new Markdown(msg.content.trim(), 1, 0, mdTheme));
      }
    } else {
      // ── Assistant message: Markdown (same as AssistantMessageComponent) ──
      contentContainer.addChild(new Markdown(msg.content.trim(), 1, 0, mdTheme));
    }
  }

  // ── Render and scroll (content only, header is fixed) ──
  const contentLines = contentContainer.render(W);
  const totalLines = contentLines.length;
  const maxVisible = getMaxVisible() - headerHeight;
  const start = Math.min(scrollOffset, Math.max(0, totalLines - maxVisible));
  const end = Math.min(start + maxVisible, totalLines);
  const scrolledLines = contentLines.slice(start, end);

  return { lines: [...headerLines, ...scrolledLines], totalLines };
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
