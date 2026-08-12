/**
 * Initialize @pierre/diffs custom element WITHOUT Shadow DOM.
 * Injects styles into document <head> so app's color-scheme and CSS vars apply.
 */
import { DIFFS_TAG_NAME } from "@pierre/diffs";

const DIFFS_STYLE_ID = "pierre-diffs-styles";

const DIFFS_CSS = `
/* ── @pierre/diffs base ── */
${DIFFS_TAG_NAME} {
  --diffs-dark-bg: #1e1f2e;
  --diffs-light-bg: #f8f9fa;
  --diffs-dark: #e5e5e7;
  --diffs-light: #1a1b2e;
  --diffs-font-fallback: ui-monospace, 'SF Mono', Monaco, Consolas, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  --diffs-header-font-fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif;
  --diffs-mixer: light-dark(black, white);
  --diffs-gap-fallback: 8px;
  color-scheme: light dark;
  display: block;
  font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
  font-size: var(--diffs-font-size, 13px);
  line-height: var(--diffs-line-height, 20px);
}

${DIFFS_TAG_NAME} pre, ${DIFFS_TAG_NAME} code, ${DIFFS_TAG_NAME} [data-error-wrapper] {
  margin: 0; padding: 0; display: block; outline: none;
  font-family: var(--diffs-font-family, var(--diffs-font-fallback));
}

${DIFFS_TAG_NAME} *, ${DIFFS_TAG_NAME} *::before, ${DIFFS_TAG_NAME} *::after { box-sizing: border-box; }
${DIFFS_TAG_NAME} [data-icon-sprite] { display: none; }

${DIFFS_TAG_NAME} [data-diffs-header], ${DIFFS_TAG_NAME} [data-separator] {
  font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
}

${DIFFS_TAG_NAME} [data-file-info] {
  padding: 8px 12px; font-weight: 600; font-size: 12px;
  color: var(--diffs-fg);
  background-color: color-mix(in lab, var(--diffs-bg) 95%, var(--diffs-fg));
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
}

${DIFFS_TAG_NAME} [data-diffs-header],
${DIFFS_TAG_NAME} [data-diffs],
${DIFFS_TAG_NAME} [data-error-wrapper] {
  --diffs-bg: light-dark(var(--diffs-light-bg), var(--diffs-dark-bg));
  --diffs-bg-buffer: light-dark(
    color-mix(in lab, var(--diffs-bg) 92%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-bg) 92%, var(--diffs-mixer))
  );
  --diffs-bg-hover: light-dark(
    color-mix(in lab, var(--diffs-bg) 97%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-bg) 91%, var(--diffs-mixer))
  );
  --diffs-bg-context: light-dark(
    color-mix(in lab, var(--diffs-bg) 98.5%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-bg) 92.5%, var(--diffs-mixer))
  );
  --diffs-bg-separator: light-dark(
    color-mix(in lab, var(--diffs-bg) 96%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-bg) 85%, var(--diffs-mixer))
  );
  --diffs-fg: light-dark(var(--diffs-light), var(--diffs-dark));
  --diffs-fg-number: light-dark(
    color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg)),
    color-mix(in lab, var(--diffs-fg) 65%, var(--diffs-bg))
  );

  --diffs-deletion-base: light-dark(var(--diffs-deletion-color, #ef4444), var(--diffs-deletion-color, #ef4444));
  --diffs-addition-base: light-dark(var(--diffs-addition-color, #22c55e), var(--diffs-addition-color, #22c55e));
  --diffs-modified-base: light-dark(var(--diffs-modified-color, #3b82f6), var(--diffs-modified-color, #3b82f6));

  --diffs-bg-deletion: light-dark(
    color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-deletion-base)),
    color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-deletion-base))
  );
  --diffs-bg-deletion-number: light-dark(
    color-mix(in lab, var(--diffs-bg) 91%, var(--diffs-deletion-base)),
    color-mix(in lab, var(--diffs-bg) 85%, var(--diffs-deletion-base))
  );
  --diffs-bg-deletion-hover: light-dark(
    color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-deletion-base)),
    color-mix(in lab, var(--diffs-bg) 75%, var(--diffs-deletion-base))
  );
  --diffs-bg-deletion-emphasis: light-dark(
    rgb(from var(--diffs-deletion-base) r g b / 0.15),
    rgb(from var(--diffs-deletion-base) r g b / 0.2)
  );

  --diffs-bg-addition: light-dark(
    color-mix(in lab, var(--diffs-bg) 88%, var(--diffs-addition-base)),
    color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-addition-base))
  );
  --diffs-bg-addition-number: light-dark(
    color-mix(in lab, var(--diffs-bg) 91%, var(--diffs-addition-base)),
    color-mix(in lab, var(--diffs-bg) 85%, var(--diffs-addition-base))
  );
  --diffs-bg-addition-hover: light-dark(
    color-mix(in lab, var(--diffs-bg) 80%, var(--diffs-addition-base)),
    color-mix(in lab, var(--diffs-bg) 70%, var(--diffs-addition-base))
  );
  --diffs-bg-addition-emphasis: light-dark(
    rgb(from var(--diffs-addition-base) r g b / 0.15),
    rgb(from var(--diffs-addition-base) r g b / 0.2)
  );

  --diffs-selection-base: var(--diffs-modified-base);
  --diffs-selection-number-fg: light-dark(
    color-mix(in lab, var(--diffs-selection-base) 65%, var(--diffs-mixer)),
    color-mix(in lab, var(--diffs-selection-base) 75%, var(--diffs-mixer))
  );
  --diffs-bg-selection: light-dark(
    color-mix(in lab, var(--diffs-bg) 82%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-bg) 75%, var(--diffs-selection-base))
  );
  --diffs-bg-selection-number: light-dark(
    color-mix(in lab, var(--diffs-bg) 75%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-bg) 60%, var(--diffs-selection-base))
  );

  background-color: var(--diffs-bg);
  color: var(--diffs-fg);
}

${DIFFS_TAG_NAME} [data-diffs] {
  --diffs-code-grid: minmax(min-content, max-content) 1fr;
}

${DIFFS_TAG_NAME} [data-column-content] span {
  color: light-dark(var(--diffs-token-light, var(--diffs-light)), var(--diffs-token-dark, var(--diffs-dark)));
}

${DIFFS_TAG_NAME} [data-column-content] span:not([data-diff-span]) {
  background-color: light-dark(var(--diffs-token-light-bg, inherit), var(--diffs-token-dark-bg, inherit));
}

${DIFFS_TAG_NAME} [data-column-content] {
  background-color: var(--diffs-line-bg, transparent);
  grid-column: 2 / 3;
}

@media (prefers-color-scheme: dark) {
  ${DIFFS_TAG_NAME} [data-diffs-header],
  ${DIFFS_TAG_NAME} [data-diffs] { color-scheme: dark; }
}

.theme-dark ${DIFFS_TAG_NAME} [data-diffs-header],
.theme-dark ${DIFFS_TAG_NAME} [data-diffs] { color-scheme: dark; }

.theme-light ${DIFFS_TAG_NAME} [data-diffs-header],
.theme-light ${DIFFS_TAG_NAME} [data-diffs] { color-scheme: light; }

${DIFFS_TAG_NAME} [data-type='split'][data-overflow='wrap'] {
  display: grid; grid-auto-flow: dense;
  grid-template-columns: repeat(2, var(--diffs-code-grid));
}

${DIFFS_TAG_NAME} [data-type='split'][data-overflow='scroll'] {
  display: grid; grid-template-columns: 1fr 1fr; gap: 2px;
}

${DIFFS_TAG_NAME} [data-code] {
  display: grid; grid-auto-flow: dense;
  grid-template-columns: var(--diffs-code-grid);
  overflow: scroll clip; overscroll-behavior-x: none;
  tab-size: var(--diffs-tab-size, 2);
  align-self: flex-start;
  padding-top: var(--diffs-gap-block, var(--diffs-gap-fallback));
  padding-bottom: max(0px, calc(var(--diffs-gap-block, var(--diffs-gap-fallback)) - 6px));
}

${DIFFS_TAG_NAME} [data-code]::-webkit-scrollbar { width: 0; height: 6px; }
${DIFFS_TAG_NAME} [data-code]::-webkit-scrollbar-track { background: transparent; }
${DIFFS_TAG_NAME} [data-code]::-webkit-scrollbar-thumb {
  background-color: transparent; border: 1px solid transparent;
  background-clip: content-box; border-radius: 3px;
}
${DIFFS_TAG_NAME}:hover [data-code]::-webkit-scrollbar-thumb {
  background-color: var(--diffs-bg-context);
}

${DIFFS_TAG_NAME} [data-line-annotation],
${DIFFS_TAG_NAME} [data-no-newline],
${DIFFS_TAG_NAME} [data-line] {
  position: relative; display: grid;
  grid-template-columns: subgrid; grid-column: 1 / 3;
}

${DIFFS_TAG_NAME} [data-buffer] {
  position: sticky; left: 0; grid-column: 1 / 3;
  user-select: none;
  background-image: repeating-linear-gradient(-45deg, transparent, transparent calc(3px * 1.414), var(--diffs-bg-buffer) calc(3px * 1.414), var(--diffs-bg-buffer) calc(4px * 1.414));
  min-height: 1lh; width: var(--diffs-column-width, auto);
}

${DIFFS_TAG_NAME} [data-separator] { grid-column: span 2; }

${DIFFS_TAG_NAME} [data-separator='metadata'],
${DIFFS_TAG_NAME} [data-separator]:empty {
  min-height: 4px; background-color: var(--diffs-bg-separator);
  display: grid; grid-template-columns: subgrid;
}

${DIFFS_TAG_NAME} [data-separator-wrapper] { user-select: none; fill: currentColor; overflow: hidden; }

${DIFFS_TAG_NAME} [data-separator='metadata'] [data-separator-wrapper] {
  grid-column: 2 / 3; width: var(--diffs-column-content-width);
  position: sticky; left: var(--diffs-column-number-width); padding: 4px 1ch;
}

${DIFFS_TAG_NAME} [data-separator='line-info'] {
  margin-block: var(--diffs-gap-block, var(--diffs-gap-fallback));
}

${DIFFS_TAG_NAME} [data-separator='line-info'] [data-separator-wrapper] {
  position: sticky; display: flex; align-items: center; gap: 2px;
  width: calc(var(--diffs-column-width) - var(--diffs-gap-fallback)); border-radius: 6px;
}

${DIFFS_TAG_NAME} [data-expand-button],
${DIFFS_TAG_NAME} [data-separator-content] {
  display: flex; align-items: center; background-color: var(--diffs-bg-separator);
}

${DIFFS_TAG_NAME} [data-expand-button] {
  justify-content: center; flex-shrink: 0;
  width: 32px; height: 32px; opacity: 0.65;
}

${DIFFS_TAG_NAME} [data-separator-content] {
  flex: 1 1 auto; padding: 0 1ch; height: 32px; opacity: 0.65;
  overflow: hidden; justify-content: flex-start;
  grid-column: 2; grid-row: 1 / -1;
}

${DIFFS_TAG_NAME} [data-unmodified-lines] {
  display: block; overflow: hidden; min-width: 0;
  text-overflow: ellipsis; white-space: nowrap; flex: 0 1 auto;
}

${DIFFS_TAG_NAME} [data-line] { background-color: var(--diffs-bg); color: var(--diffs-fg); }

${DIFFS_TAG_NAME} [data-line-annotation] {
  min-height: var(--diffs-annotation-min-height, 0);
  background-color: var(--diffs-bg-context); z-index: 3;
}

${DIFFS_TAG_NAME} [data-column-content],
${DIFFS_TAG_NAME} [data-column-number] { position: relative; padding-inline: 1ch; }
`;

// Inject styles into document head (not shadow DOM) so app color-scheme applies
if (typeof document !== "undefined" && !document.getElementById(DIFFS_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = DIFFS_STYLE_ID;
  style.textContent = DIFFS_CSS;
  document.head.appendChild(style);
}

// Register custom element WITHOUT shadow DOM
if (typeof HTMLElement !== "undefined" && customElements.get(DIFFS_TAG_NAME) == null) {
  class DiffsContainer extends HTMLElement {
    constructor() {
      super();
    }
  }
  customElements.define(DIFFS_TAG_NAME, DiffsContainer);
}
