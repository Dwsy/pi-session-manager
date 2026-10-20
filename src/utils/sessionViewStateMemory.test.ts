import { describe, expect, it } from "vitest";

import {
  getSessionExpansion,
  getSessionScrollTop,
  saveSessionExpansion,
  saveSessionScrollTop,
} from "./sessionViewStateMemory";

describe("sessionViewStateMemory", () => {
  it("stores and returns scroll positions per session", () => {
    saveSessionScrollTop("/a.jsonl", 120);
    saveSessionScrollTop("/b.jsonl", 340);

    expect(getSessionScrollTop("/a.jsonl")).toBe(120);
    expect(getSessionScrollTop("/b.jsonl")).toBe(340);
    expect(getSessionScrollTop("/c.jsonl")).toBeUndefined();
  });

  it("rejects invalid scroll positions and paths", () => {
    saveSessionScrollTop("/invalid.jsonl", Number.NaN);
    saveSessionScrollTop("", 100);

    expect(getSessionScrollTop("/invalid.jsonl")).toBeUndefined();
    expect(getSessionScrollTop("")).toBeUndefined();
  });

  it("stores expansion snapshots defensively copied", () => {
    const ids = ["e1", "e2"];
    saveSessionExpansion("/a.jsonl", { toolsExpanded: true, expandedToolIds: ids });
    ids.push("e3");

    const snapshot = getSessionExpansion("/a.jsonl");
    expect(snapshot?.toolsExpanded).toBe(true);
    expect(snapshot?.expandedToolIds).toEqual(["e1", "e2"]);

    snapshot!.expandedToolIds.push("mutated");
    expect(getSessionExpansion("/a.jsonl")?.expandedToolIds).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("evicts the least recently used entry beyond the cap", () => {
    for (let i = 0; i < 35; i += 1) {
      saveSessionScrollTop(`/s-${i}.jsonl`, i);
    }

    expect(getSessionScrollTop("/s-0.jsonl")).toBeUndefined();
    expect(getSessionScrollTop("/s-1.jsonl")).toBeUndefined();
    expect(getSessionScrollTop("/s-34.jsonl")).toBe(34);
  });
});
