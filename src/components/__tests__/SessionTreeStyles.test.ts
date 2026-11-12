// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import less from "less";

/**
 * Regression guard for the outline panel doubled-text bug.
 *
 * Segment headers and entry rows are absolutely positioned inside a
 * virtualized spacer: they literally float above other rows. Any alpha in
 * their background lets the row underneath bleed through and the two lines of
 * text overlap. These assertions compile the real stylesheet and inspect the
 * emitted CSS, so a future "let us make it glassy again" cannot slip through.
 */

const STYLE_FILE = resolve(process.cwd(), "src/styles/_branch-atlas.less");
const source = readFileSync(STYLE_FILE, "utf8");
let css = "";

async function compiled(): Promise<string> {
  if (!css) css = (await less.render(source, { filename: STYLE_FILE })).css;
  return css;
}

function blocks(stylesheet: string, selectorFragment: string): string[] {
  const out: string[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stylesheet)) !== null) {
    if (match[1]!.includes(selectorFragment)) out.push(match[2]!);
  }
  return out;
}

function backgroundValues(body: string): string[] {
  return [...body.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/g)].map(
    (item) => item[1]!.trim(),
  );
}

const alphaBackground = (value: string): boolean =>
  /\/\s*0?\.\d+\s*\)/.test(value) || /rgba?\([^)]*,\s*0?\.\d+\s*\)/.test(value);

const OPAQUE_LAYERS = [
  ".branch-segment-row",
  ".branch-segment-row.is-sticky-header",
  ".branch-segment-row.is-active-lineage",
  ".branch-entry-row",
  ".branch-entry-row.is-selected",
  ".branch-entry-row.is-active-path",
  ".branch-entry-row.is-match",
  ".branch-outline-scroll",
];

describe("session tree: opaque row surfaces", () => {
  it.each(OPAQUE_LAYERS)("%s never uses a translucent background", async (selector) => {
    const stylesheet = await compiled();
    const found = blocks(stylesheet, selector);
    expect(found.length, "no CSS rule emitted for " + selector).toBeGreaterThan(0);
    for (const body of found) {
      for (const value of backgroundValues(body)) {
        expect(alphaBackground(value), selector + " background is translucent: " + value).toBe(false);
      }
    }
  });

  it("never fills a row with the accent color (no big green/teal blocks)", async () => {
    // The active path covers nearly every row of a linear session. Mixing the
    // accent into the row background therefore paints the whole panel teal,
    // which competes with the transcript. Accent belongs on rails/chips only.
    const stylesheet = await compiled();
    const re = /([^{}]*\.branch-(?:segment|entry)-row[^{}]*)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(stylesheet)) !== null) {
      const selector = match[1]!.trim().replace(/\s+/g, " ");
      for (const value of backgroundValues(match[2]!)) {
        // `[^)]*` would stop at the first nested var(); just check that any
        // color-mix() in this declaration mixes in the accent.
        expect(
          value.includes("color-mix(") && value.includes("var(--accent)"),
          selector + " fills the row with accent: " + value,
        ).toBe(false);
      }
    }
  });

  it("keeps the sticky header positioned above the virtualized rows", async () => {
    const stylesheet = await compiled();
    const anchor = blocks(stylesheet, ".branch-sticky-anchor").join("");
    expect(anchor).toContain("position: sticky");
    expect(anchor).toMatch(/z-index:\s*\d+/);
    const sticky = blocks(stylesheet, ".branch-segment-row.is-sticky-header").join("");
    expect(sticky).toMatch(/z-index:\s*\d+/);
  });

  it("jumps on a single click everywhere in the tree UI", () => {
    // Requiring a double click to navigate made the outline feel broken. Both
    // the list rows and the branch-map canvas must use a plain click.
    const tree = readFileSync(
      resolve(process.cwd(), "src/components/session-tree/SessionTree.tsx"),
      "utf8",
    );
    const canvas = readFileSync(
      resolve(process.cwd(), "src/components/session-branch-map/GlobalMapCanvas.tsx"),
      "utf8",
    );
    for (const [name, source] of [["SessionTree", tree], ["GlobalMapCanvas", canvas]] as const) {
      expect(source.includes("onDoubleClick"), name + " still binds a double click").toBe(false);
      expect(source.includes("handleDoubleClick"), name + " still has a double-click handler").toBe(false);
      expect(source.includes("onClick"), name + " lost its click handler").toBe(true);
    }
  });

  it("keeps row height in sync with the virtual list constant", async () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/session-tree/SessionTree.tsx"),
      "utf8",
    );
    const constant = Number(component.match(/const ROW_HEIGHT = (\d+)/)?.[1]);
    const stylesheet = await compiled();
    const rowRule = blocks(stylesheet, ".branch-segment-row,").join("");
    const height = Number(rowRule.match(/height:\s*(\d+)px/)?.[1]);
    expect(constant).toBeGreaterThan(0);
    expect(height).toBe(constant);
  });
});
