/**
 * Unified TUI SDK for pi-session-bridge — modeled directly on grok-pi's
 * `pi-grok-tui-kit` design language and layout primitives.
 *
 * Provides rounded box borders (`╭─╮│╰─╯` + `┬│┴`), clickable header pills
 * with `ClickRegion` hit-testing, Telescope-style search bars, ANSI/CJK-safe
 * display-width padding (`fitWidth`, `wrapTextToWidth`), structured footer
 * hints, split overlay framing, floating context menu compositing, and
 * mouse/list controllers.
 */

import { truncateToWidth as piTruncateToWidth, visibleWidth as piVisibleWidth } from "@earendil-works/pi-tui";

export interface TuiTheme {
  fg: (color: string, text: string) => string;
  bold?: (text: string) => string;
}

export interface TuiMouseEvent {
  type: "press" | "release" | "move" | "drag" | "click" | "wheel";
  button: "left" | "middle" | "right" | "none";
  x: number;
  y: number;
  wheelDelta?: number;
}

export interface TuiMouseEventResult {
  handled?: boolean;
  focus?: boolean;
  capture?: boolean;
  render?: boolean;
}

export interface ClickRegion {
  x1: number;
  x2: number;
  y: number;
}

export interface RectRegion {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface HeaderPillSpec {
  id: string;
  label: string;
  active?: boolean;
  color?: string;
}

export interface FooterHintSpec {
  key: string;
  label: string;
}

export interface SplitFrameGeometry {
  totalWidth: number;
  innerWidth: number;
  leftWidth: number;
  rightWidth: number;
  dividerX: number;
  bodyStartY: number;
  bodyHeight: number;
}

export interface SplitOverlayRenderResult {
  lines: string[];
  geometry: SplitFrameGeometry;
  pillRects: Map<string, ClickRegion>;
  closeRect: ClickRegion;
}

export interface FloatingMenuItem {
  id: string;
  label: string;
  hint?: string;
  color?: string;
  checked?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

export interface FloatingMenuRenderResult {
  lines: string[];
  box: RectRegion;
  itemRows: Map<number, number>;
}

const ANSI_SGR_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SGR_RE, "");
}

export function visibleWidth(text: string): number {
  return piVisibleWidth(text);
}

export function truncateToWidth(text: string, width: number, ellipsis = "…"): string {
  return piTruncateToWidth(text, width, ellipsis);
}

/** Check whether a mouse coordinate `(x, y)` falls inside a single-row `ClickRegion`. */
export function hitRegion(region: ClickRegion | undefined, x: number, y: number): boolean {
  if (!region || region.x1 < 0) return false;
  return y === region.y && x >= region.x1 && x <= region.x2;
}

/** Check whether a mouse coordinate `(x, y)` falls inside a rectangular `RectRegion`. */
export function hitRect(rect: RectRegion | undefined, x: number, y: number): boolean {
  if (!rect || rect.x1 < 0) return false;
  return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
}

export function styleBold(theme: TuiTheme, text: string): string {
  return theme.bold ? theme.bold(text) : `\x1b[1m${text}\x1b[0m`;
}

/** Pad or truncate an ANSI-styled string to an exact display column width. */
export function fitWidth(text: string, width: number): string {
  if (width <= 0) return "";
  const truncated = truncateToWidth(text, width, "…");
  const w = visibleWidth(truncated);
  if (w >= width) return truncated;
  return truncated + " ".repeat(width - w);
}

/** Word/character-wrap plain text to `maxWidth` terminal display columns. */
export function wrapTextToWidth(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [""];
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.length === 0) {
      out.push("");
      continue;
    }
    let current = "";
    let currentW = 0;
    for (const ch of rawLine) {
      const cw = visibleWidth(ch);
      if (currentW + cw > maxWidth && current.length > 0) {
        out.push(current);
        current = ch;
        currentW = cw;
      } else {
        current += ch;
        currentW += cw;
      }
    }
    if (current.length > 0) out.push(current);
  }
  return out.length > 0 ? out : [""];
}

/** Highlight multi-term search matches inside a line while preserving ANSI escapes. */
export function highlightTerms(
  text: string,
  query: string,
  highlight: (match: string) => string = (m) => `\x1b[7m${m}\x1b[27m`,
): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 1);
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  if (!text.includes("\x1b")) {
    return text.replace(re, (match) => highlight(match));
  }
  const ansiSplitRe = /(\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
  return text
    .split(ansiSplitRe)
    .map((segment, index) => (index % 2 === 1 ? segment : segment.replace(re, (match) => highlight(match))))
    .join("");
}

/** Coalesce rapid wheel/drag events into a single render request. */
export class RenderCoalescer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly requestRender: () => void,
    private readonly delayMs = 40,
  ) {}

  get pending(): boolean {
    return this.timer !== null;
  }

  schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.requestRender();
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Reusable virtualized list selection, viewport scroll, and double-click controller. */
export const DEFAULT_DOUBLE_CLICK_MS = 450;

export class ListController {
  selected = 0;
  scroll = 0;
  private lastClickIndex = -1;
  private lastClickTime = 0;
  private readonly rowsPerItem: number;
  private readonly doubleClickMs: number;

  constructor(options: { rowsPerItem?: number; doubleClickMs?: number } = {}) {
    this.rowsPerItem = Math.max(1, options.rowsPerItem ?? 1);
    this.doubleClickMs = options.doubleClickMs ?? DEFAULT_DOUBLE_CLICK_MS;
  }

  itemsPerPage(bodyHeight: number): number {
    return Math.max(1, Math.floor(bodyHeight / this.rowsPerItem));
  }

  clamp(count: number, bodyHeight: number): void {
    if (count <= 0) {
      this.selected = 0;
      this.scroll = 0;
      return;
    }
    this.selected = Math.max(0, Math.min(count - 1, this.selected));
    const perPage = this.itemsPerPage(bodyHeight);
    if (this.selected < this.scroll) {
      this.scroll = this.selected;
    } else if (this.selected >= this.scroll + perPage) {
      this.scroll = this.selected - perPage + 1;
    }
    const maxScroll = Math.max(0, count - perPage);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
  }

  select(next: number, count: number, bodyHeight: number): boolean {
    const prev = this.selected;
    if (count <= 0) {
      this.selected = 0;
      this.scroll = 0;
      return prev !== 0;
    }
    this.selected = Math.max(0, Math.min(count - 1, next));
    this.clamp(count, bodyHeight);
    return this.selected !== prev;
  }

  move(delta: number, count: number, bodyHeight: number): boolean {
    return this.select(this.selected + delta, count, bodyHeight);
  }

  handleClick(
    index: number,
    count: number,
    bodyHeight: number,
    nowMs: number = Date.now(),
  ): "select" | "confirm" | "none" {
    if (index < 0 || index >= count) return "none";
    if (index === this.lastClickIndex && nowMs - this.lastClickTime <= this.doubleClickMs) {
      this.lastClickIndex = -1;
      this.lastClickTime = 0;
      this.select(index, count, bodyHeight);
      return "confirm";
    }
    this.lastClickIndex = index;
    this.lastClickTime = nowMs;
    this.select(index, count, bodyHeight);
    return "select";
  }

  indexAtBodyRow(relRow: number, count: number): number {
    if (relRow < 0) return -1;
    const idx = this.scroll + Math.floor(relRow / this.rowsPerItem);
    return idx >= 0 && idx < count ? idx : -1;
  }

  reset(): void {
    this.selected = 0;
    this.scroll = 0;
    this.lastClickIndex = -1;
    this.lastClickTime = 0;
  }
}

/** Reusable vertical divider drag controller for split overlays. */
export class DividerDragController {
  private ratio: number;
  private active = false;

  constructor(initialRatio = 0.42) {
    this.ratio = Math.max(0.15, Math.min(0.85, initialRatio));
  }

  get leftRatio(): number {
    return this.ratio;
  }

  get dragging(): boolean {
    return this.active;
  }

  cancel(): void {
    this.active = false;
  }

  handleMouse(
    event: { type: string; button?: string; x: number; y: number },
    bounds: {
      totalWidth: number;
      dividerX: number;
      bodyStartY: number;
      bodyHeight: number;
      minLeft?: number;
      minRight?: number;
    },
  ): { handled: true; capture?: boolean; render: boolean } | undefined {
    const minLeft = bounds.minLeft ?? 22;
    const minRight = bounds.minRight ?? (bounds.totalWidth >= 80 ? 28 : 22);
    if (this.active) {
      if (event.type === "drag") {
        const maxLeft = Math.max(minLeft, bounds.totalWidth - minRight - 1);
        const clamped = Math.max(minLeft, Math.min(event.x, maxLeft));
        this.ratio = clamped / Math.max(1, bounds.totalWidth - 1);
        return { handled: true, capture: true, render: true };
      }
      if (event.type === "release") {
        this.active = false;
        return { handled: true, render: true };
      }
      return { handled: true, capture: true, render: false };
    }
    if (event.type === "press" && event.button === "left") {
      const inBody = event.y >= bounds.bodyStartY && event.y < bounds.bodyStartY + bounds.bodyHeight;
      if (inBody && Math.abs(event.x - bounds.dividerX) <= 1) {
        this.active = true;
        return { handled: true, capture: true, render: true };
      }
    }
    return undefined;
  }
}

/** Compute responsive geometry for a two-pane bordered overlay. */
export function computeSplitGeometry(options: {
  width: number;
  rows: number;
  leftRatio?: number;
  hasSearchBar: boolean;
  minWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  heightRatio?: number;
  maxRows?: number;
}): SplitFrameGeometry {
  const minWidth = options.minWidth ?? 56;
  const minLeft = options.minLeftWidth ?? 24;
  const minRight = options.minRightWidth ?? 24;
  const totalWidth = Math.max(minWidth, Math.floor(options.width));
  const innerWidth = totalWidth - 2;
  const leftRatio = options.leftRatio ?? 0.42;
  const leftWidth = Math.max(
    minLeft,
    Math.min(innerWidth - minRight - 1, Math.floor(innerWidth * leftRatio)),
  );
  const rightWidth = Math.max(minRight, innerWidth - leftWidth - 1);
  const dividerX = 1 + leftWidth;

  const heightRatio = options.heightRatio ?? 0.82;
  const maxRows = options.maxRows ?? 32;
  const totalRows = Math.max(16, Math.min(maxRows, Math.floor(options.rows * heightRatio)));
  const chromeRows = options.hasSearchBar ? 8 : 6;
  const bodyStartY = options.hasSearchBar ? 5 : 3;
  const bodyHeight = Math.max(8, totalRows - chromeRows);

  return {
    totalWidth,
    innerWidth,
    leftWidth,
    rightWidth,
    dividerX,
    bodyStartY,
    bodyHeight,
  };
}

/** Render a unified header row with title, clickable pills, and right-aligned `[✕]`. */
export function renderHeaderRow(options: {
  innerWidth: number;
  titlePrefix: string;
  pills: readonly HeaderPillSpec[];
  theme: TuiTheme;
  y?: number;
}): { line: string; pillRects: Map<string, ClickRegion>; closeRect: ClickRegion } {
  const { innerWidth, titlePrefix, pills, theme, y = 1 } = options;
  const b = (s: string) => theme.fg("border", s);
  const pillRects = new Map<string, ClickRegion>();

  let col = 1 + visibleWidth(titlePrefix);
  const renderedPills: string[] = [];
  for (const pill of pills) {
    if (!pill.label) continue;
    const w = visibleWidth(pill.label);
    const start = col;
    const end = start + w - 1;
    if (end < innerWidth - 4) {
      pillRects.set(pill.id, { x1: start, x2: end, y });
    }
    col = end + 2;
    const color = pill.color ?? (pill.active ? "accent" : "dim");
    const styled = pill.active
      ? styleBold(theme, theme.fg(color, pill.label))
      : theme.fg(color, pill.label);
    renderedPills.push(styled);
  }

  const leftHeader = `${titlePrefix}${renderedPills.join(" ")}`;
  const closeText = "[✕]";
  const closeW = visibleWidth(closeText);
  const maxLeft = Math.max(1, innerWidth - closeW - 2);
  const clippedLeft = visibleWidth(leftHeader) > maxLeft ? truncateToWidth(leftHeader, maxLeft, "…") : leftHeader;
  const gap = Math.max(1, innerWidth - visibleWidth(clippedLeft) - closeW - 1);
  const closeStart = 1 + innerWidth - closeW - 1;
  const closeRect: ClickRegion = { x1: closeStart, x2: closeStart + closeW - 1, y };

  const line = `${b("│")}${fitWidth(`${clippedLeft}${" ".repeat(gap)}${theme.fg("dim", closeText)} `, innerWidth)}${b("│")}`;
  return { line, pillRects, closeRect };
}

/** Render a unified Telescope-style search input row with reverse cursor and counter. */
export function renderSearchRow(options: {
  innerWidth: number;
  promptPrefix: string;
  query: string;
  placeholder: string;
  rightLabel: string;
  active?: boolean;
  theme: TuiTheme;
}): string {
  const { innerWidth, promptPrefix, query, placeholder, rightLabel, active = false, theme } = options;
  const b = (s: string) => theme.fg("border", s);
  const cursor = active ? "\x1b[7m \x1b[27m" : "";
  const queryDisplay = query
    ? `${query}${cursor}`
    : `${cursor}${theme.fg("dim", placeholder)}`;
  const budget = Math.max(10, innerWidth - visibleWidth(rightLabel) - 2);
  const left = fitWidth(`${promptPrefix}${queryDisplay}`, budget);
  return `${b("│")}${fitWidth(`${left} ${theme.fg("dim", rightLabel)} `, innerWidth)}${b("│")}`;
}

/** Render a unified footer row from structured key/label hint pairs. */
export function renderFooterRow(options: {
  innerWidth: number;
  hints?: readonly FooterHintSpec[];
  customContent?: string;
  theme: TuiTheme;
}): string {
  const { innerWidth, hints = [], customContent, theme } = options;
  const b = (s: string) => theme.fg("border", s);
  const content =
    customContent ??
    ` ${hints.map((h) => `${theme.fg("accent", h.key)}${theme.fg("dim", `:${h.label}`)}`).join("  ")}`;
  return `${b("│")}${fitWidth(content, innerWidth)}${b("│")}`;
}

/** Assemble a complete bordered two-pane overlay frame from left/right body renderers. */
export function renderSplitOverlayFrame(options: {
  geometry: SplitFrameGeometry;
  titlePrefix: string;
  pills: readonly HeaderPillSpec[];
  search?: {
    promptPrefix: string;
    query: string;
    placeholder: string;
    rightLabel: string;
    active?: boolean;
  };
  leftLines: readonly string[];
  rightLines: readonly string[];
  footerHints?: readonly FooterHintSpec[];
  footerCustom?: string;
  theme: TuiTheme;
}): SplitOverlayRenderResult {
  const { geometry: g, theme } = options;
  const b = (s: string) => theme.fg("border", s);
  const topBorder = b(`╭${"─".repeat(g.innerWidth)}╮`);
  const midRule = b(`├${"─".repeat(g.innerWidth)}┤`);
  const splitTop = b(`├${"─".repeat(g.leftWidth)}┬${"─".repeat(g.rightWidth)}┤`);
  const splitBottom = b(`├${"─".repeat(g.leftWidth)}┴${"─".repeat(g.rightWidth)}┤`);
  const bottomBorder = b(`╰${"─".repeat(g.innerWidth)}╯`);

  const { line: headerLine, pillRects, closeRect } = renderHeaderRow({
    innerWidth: g.innerWidth,
    titlePrefix: options.titlePrefix,
    pills: options.pills,
    theme,
    y: 1,
  });

  const bodyLines: string[] = [];
  for (let i = 0; i < g.bodyHeight; i++) {
    const left = options.leftLines[i] ?? " ".repeat(g.leftWidth);
    const right = options.rightLines[i] ?? " ".repeat(g.rightWidth);
    bodyLines.push(`${b("│")}${left}${b("│")}${right}${b("│")}`);
  }

  const footerLine = renderFooterRow({
    innerWidth: g.innerWidth,
    hints: options.footerHints,
    customContent: options.footerCustom,
    theme,
  });

  const lines = options.search
    ? [
        topBorder,
        headerLine,
        midRule,
        renderSearchRow({
          innerWidth: g.innerWidth,
          promptPrefix: options.search.promptPrefix,
          query: options.search.query,
          placeholder: options.search.placeholder,
          rightLabel: options.search.rightLabel,
          active: options.search.active,
          theme,
        }),
        splitTop,
        ...bodyLines,
        splitBottom,
        footerLine,
        bottomBorder,
      ]
    : [topBorder, headerLine, splitTop, ...bodyLines, splitBottom, footerLine, bottomBorder];

  return { lines, geometry: g, pillRects, closeRect };
}

/**
 * Slice a display-column prefix or suffix from an ANSI-styled line cleanly.
 * Used to composite floating context menus on top of a rendered frame.
 */
function sliceColumns(line: string, startCol: number, endCol: number): string {
  const plain = stripAnsi(line);
  let col = 0;
  let out = "";
  for (const ch of Array.from(plain)) {
    const w = visibleWidth(ch);
    if (col + w > endCol) break;
    if (col >= startCol) {
      out += ch;
    }
    col += w;
  }
  const target = Math.max(0, endCol - startCol);
  const actual = visibleWidth(out);
  return actual < target ? out + " ".repeat(target - actual) : out;
}

/**
 * Composite a floating rounded-box context menu over an existing frame's `lines`.
 * Anchors near `(anchorX, anchorY)` and clamps within the frame bounds.
 */
export function compositeFloatingMenu(options: {
  baseLines: readonly string[];
  frameWidth: number;
  title: string;
  items: readonly FloatingMenuItem[];
  selectedIndex: number;
  hoveredIndex?: number;
  anchorX?: number;
  anchorY?: number;
  minWidth?: number;
  maxWidth?: number;
  theme: TuiTheme;
}): FloatingMenuRenderResult {
  const { baseLines, frameWidth, title, items, selectedIndex, hoveredIndex, theme } = options;
  const maxWidth = Math.min(options.maxWidth ?? 44, Math.max(24, frameWidth - 4));
  const minWidth = Math.min(options.minWidth ?? 28, maxWidth);

  let contentMax = visibleWidth(title) + 4;
  for (const item of items) {
    if (item.separator) continue;
    const prefixW = item.checked !== undefined ? 6 : 3;
    const hintW = item.hint ? visibleWidth(item.hint) + 2 : 0;
    contentMax = Math.max(contentMax, prefixW + visibleWidth(item.label) + hintW + 2);
  }
  const menuWidth = Math.max(minWidth, Math.min(maxWidth, contentMax + 2));
  const innerW = menuWidth - 2;

  const b = (s: string) => theme.fg("accent", s);
  const menuLines: string[] = [];
  const itemRows = new Map<number, number>();

  const titleClipped = truncateToWidth(` ${title} `, Math.max(4, innerW - 2), "…");
  const titleW = visibleWidth(titleClipped);
  const rightRule = Math.max(0, innerW - 1 - titleW);
  menuLines.push(`${b("╭─")}${styleBold(theme, theme.fg("accent", titleClipped))}${b(`${"─".repeat(rightRule)}╮`)}`);

  const maxVisibleItems = Math.max(3, baseLines.length - 4);
  const visibleItems = items.slice(0, maxVisibleItems);
  for (let i = 0; i < visibleItems.length; i++) {
    const item = visibleItems[i]!;
    if (item.separator) {
      menuLines.push(b(`├${"─".repeat(innerW)}┤`));
      continue;
    }
    const isSel = i === selectedIndex;
    const isHov = i === hoveredIndex;
    const cursor = isSel ? theme.fg("accent", "▸") : " ";
    const check = item.checked === undefined
      ? ""
      : item.checked
        ? `${theme.fg("success", "[x]")} `
        : `${theme.fg("dim", "[ ]")} `;
    const labelColor = item.disabled ? "dim" : item.color ?? (isSel ? "accent" : "text");
    const styledLabel = isSel || isHov
      ? styleBold(theme, theme.fg(labelColor, item.label))
      : theme.fg(labelColor, item.label);
    const hintText = item.hint ? theme.fg("dim", item.hint) : "";
    const leftPart = ` ${cursor} ${check}${styledLabel}`;
    const hintW = visibleWidth(hintText);
    const leftBudget = Math.max(4, innerW - hintW - (hintW > 0 ? 2 : 1));
    const leftFit = fitWidth(leftPart, leftBudget);
    const rowContent = hintW > 0 ? `${leftFit} ${hintText} ` : fitWidth(leftPart, innerW);
    itemRows.set(menuLines.length, i);
    menuLines.push(`${b("│")}${fitWidth(rowContent, innerW)}${b("│")}`);
  }
  menuLines.push(b(`╰${"─".repeat(innerW)}╯`));

  const menuHeight = menuLines.length;
  const defaultX = Math.max(2, Math.floor((frameWidth - menuWidth) / 2));
  const defaultY = Math.max(2, Math.floor((baseLines.length - menuHeight) / 2));
  const startX = Math.max(1, Math.min(options.anchorX ?? defaultX, Math.max(1, frameWidth - menuWidth - 1)));
  const startY = Math.max(1, Math.min(options.anchorY ?? defaultY, Math.max(1, baseLines.length - menuHeight - 1)));

  const outLines = [...baseLines];
  const absoluteItemRows = new Map<number, number>();
  for (let row = 0; row < menuHeight; row++) {
    const targetY = startY + row;
    if (targetY < 0 || targetY >= outLines.length) continue;
    const orig = outLines[targetY]!;
    const leftBg = theme.fg("dim", sliceColumns(orig, 0, startX));
    const rightBg = theme.fg("dim", sliceColumns(orig, startX + menuWidth, frameWidth));
    outLines[targetY] = `${leftBg}${menuLines[row]!}${rightBg}`;
    const itemIdx = itemRows.get(row);
    if (itemIdx !== undefined) {
      absoluteItemRows.set(targetY, itemIdx);
    }
  }

  return {
    lines: outLines,
    box: {
      x1: startX,
      x2: startX + menuWidth - 1,
      y1: startY,
      y2: startY + menuHeight - 1,
    },
    itemRows: absoluteItemRows,
  };
}
