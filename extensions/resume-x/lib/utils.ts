/**
 * resume-x — Utility functions
 *
 * Pure formatting and calculation helpers.
 * No side effects, no database access.
 */

import { visibleWidth } from "@earendil-works/pi-tui";

// ── Scroll helpers ───────────────────────────────────────────────────

export function getTermHeight(): number {
  return typeof process.stdout.rows === "number" ? process.stdout.rows : 36;
}

export function getMaxVisible(): number {
  return Math.max(8, getTermHeight() - 2);
}

export function clampScroll(offset: number, totalLines: number, maxVisible: number): number {
  const maxOffset = Math.max(0, totalLines - maxVisible);
  return Math.max(0, Math.min(maxOffset, offset));
}

// ── Formatters ───────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtCost(v: number): string {
  if (v === 0) return "free";
  if (v < 0.01) return `$${v.toFixed(3)}`;
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(1)}`;
}

export function shortModel(m: string): string {
  const parts = m.split("/");
  const name = parts[parts.length - 1] || m;
  return name.replace(/-\d{8}$/, "").replace(/-\d{4,}$/, "");
}

export function fmtTime(iso: string): string {
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

// ── Text utilities ───────────────────────────────────────────────────

export function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  const rawLines = text.split("\n");
  for (const raw of rawLines) {
    if (visibleWidth(raw) <= maxWidth) {
      result.push(raw);
    } else {
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

/**
 * Truncate a string to fit within maxWidth, using visible width.
 */
export function safeLine(line: string, maxWidth: number): string {
  if (visibleWidth(line) <= maxWidth) return line;
  let result = "";
  let w = 0;
  for (const ch of line) {
    const chW = visibleWidth(ch);
    if (w + chW > maxWidth) break;
    result += ch;
    w += chW;
  }
  return result;
}

/**
 * Theme accessor — uses global symbol from pi-coding-agent.
 */
const THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");
export function getTheme(): any {
  return (globalThis as any)[THEME_KEY];
}
