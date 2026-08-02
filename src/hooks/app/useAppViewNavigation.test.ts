import { describe, expect, it } from "vitest";

import {
  appViewIdFromMobileTab,
  appViewMobileTabId,
  getAppViewRoute,
  normalizeAppRoute,
  normalizeShortcutKey,
} from "./useAppViewNavigation";

describe("app view navigation helpers", () => {
  it("normalizes registered routes without query, hash, or trailing slash", () => {
    expect(normalizeAppRoute("boards/?mode=compact#today")).toBe("/boards");
    expect(normalizeAppRoute("/")).toBe("/");
    expect(normalizeAppRoute(undefined)).toBeNull();
  });

  it("falls back to an encoded app route when a plugin omits one", () => {
    expect(getAppViewRoute({ id: "plugin.board view", route: undefined })).toBe(
      "/app/plugin.board%20view",
    );
    expect(getAppViewRoute({ id: "plugin.board", route: "/boards/" })).toBe(
      "/boards",
    );
  });

  it("round-trips plugin mobile tab ids", () => {
    const tab = appViewMobileTabId("plugin.board");
    expect(tab).toBe("app:plugin.board");
    expect(appViewIdFromMobileTab(tab)).toBe("plugin.board");
    expect(appViewIdFromMobileTab("list")).toBeNull();
  });

  it("normalizes command and symbol shortcut notation", () => {
    expect(normalizeShortcutKey(" Command + Shift + P ")).toBe("cmd+shift+p");
    expect(normalizeShortcutKey("⌘K")).toBe("cmd+k");
    expect(normalizeShortcutKey(undefined)).toBeUndefined();
  });
});
