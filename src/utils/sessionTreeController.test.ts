import { describe, expect, it } from "vitest";

import {
  createTreeControllerState,
  reduceTreeAction,
  treeKeyToAction,
} from "./sessionTreeController";

const ctx = {
  visibleIds: ["root", "a", "a2", "b"],
  searchMatchIds: ["a", "b"],
  visibleParentById: new Map<string, string | null>([
    ["root", null],
    ["a", "root"],
    ["a2", "a"],
    ["b", "root"],
  ]),
  visibleChildrenById: new Map<string, string[]>([
    ["root", ["a", "b"]],
    ["a", ["a2"]],
    ["a2", []],
    ["b", []],
  ]),
};

describe("sessionTreeController", () => {
  it("moves focus with arrow actions", () => {
    const state = createTreeControllerState({ focusedId: "a" });
    const next = reduceTreeAction(state, { type: "MOVE_NEXT" }, ctx);
    expect(next.state.focusedId).toBe("a2");
  });

  it("folds foldable nodes on left, otherwise moves to parent", () => {
    const state = createTreeControllerState({ focusedId: "a" });
    const folded = reduceTreeAction(state, { type: "FOLD_OR_PARENT" }, ctx);
    expect(folded.state.foldedIds.has("a")).toBe(true);

    const toParent = reduceTreeAction(folded.state, { type: "FOLD_OR_PARENT" }, ctx);
    expect(toParent.state.focusedId).toBe("root");
  });

  it("search next only moves focus", () => {
    const state = createTreeControllerState({
      focusedId: "a",
      searchQuery: "x",
      searchMatchIndex: 0,
    });
    const next = reduceTreeAction(state, { type: "SEARCH_NEXT" }, ctx);
    expect(next.state.focusedId).toBe("b");
    expect(next.state.searchMatchIndex).toBe(1);
    expect(next.effect.type).toBe("none");
  });

  it("escape clears search before requesting close", () => {
    const withQuery = createTreeControllerState({ searchQuery: "foo" });
    const cleared = reduceTreeAction(withQuery, { type: "ESCAPE" }, ctx);
    expect(cleared.state.searchQuery).toBe("");
    expect(cleared.effect.type).toBe("clear-search-done");

    const closed = reduceTreeAction(cleared.state, { type: "ESCAPE" }, ctx);
    expect(closed.effect.type).toBe("request-close");
  });

  it("maps keyboard keys to tree actions", () => {
    expect(treeKeyToAction({ key: "ArrowUp", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
      .toEqual({ type: "MOVE_PREVIOUS" });
    expect(treeKeyToAction({ key: "ArrowLeft", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }))
      .toEqual({ type: "FOLD_OR_PARENT" });
  });
});
