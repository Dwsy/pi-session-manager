import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@/types";

import {
  buildActivePathIds,
  buildTree,
  buildTreePrefix,
  buildVisibleTreeMaps,
  filterCollapsedFlatNodes,
  filterFlatNodes,
  flattenTree,
  getEntryDisplayText,
  isFoldableNode,
  type FlatNode,
} from "./session-tree";

function message(
  id: string,
  role: "user" | "assistant" | "toolResult",
  text: string,
  parentId?: string,
  timestamp = "2026-04-09T10:00:00Z",
): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      role,
      content: [{ type: "text", text }],
    },
  };
}

function renderPrefixes(flatNodes: FlatNode[]): string[] {
  return flatNodes.map((flatNode) => {
    const prefix = buildTreePrefix(flatNode);
    const text = getEntryDisplayText(flatNode.node.entry, flatNode.node.label);
    return `${prefix}${text}`;
  });
}

function project(
  entries: SessionEntry[],
  options: {
    activeLeafId?: string;
    filter?: string;
    searchTerms?: string[];
    collapsedIds?: string[];
  } = {},
): FlatNode[] {
  const tree = buildTree(entries);
  const activePathIds = buildActivePathIds(options.activeLeafId, entries);
  const flatNodes = flattenTree(tree, activePathIds);
  const filtered = filterFlatNodes(
    flatNodes,
    options.searchTerms ?? [],
    options.filter ?? "all",
    (content) => {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((block: any) => block.type === "text" && block.text)
          .map((block: any) => block.text)
          .join("");
      }
      return "";
    },
  );
  return filterCollapsedFlatNodes(
    filtered,
    flatNodes,
    new Set(options.collapsedIds ?? []),
  );
}

describe("session tree display text", () => {
  it("keeps assistant text when there is no label or tool call", () => {
    const entry = message("assistant-1", "assistant", "Assistant reply with useful context");
    expect(getEntryDisplayText(entry)).toBe("Assistant reply with useful context");
  });
});

describe("session tree golden prefixes", () => {
  it("keeps a linear single-child chain at indent 0 without connectors", () => {
    const entries = [
      message("u1", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a1", "assistant", "reply-1", "u1", "2026-04-09T10:01:00Z"),
      message("u2", "user", "follow-up", "a1", "2026-04-09T10:02:00Z"),
      message("a2", "assistant", "reply-2", "u2", "2026-04-09T10:03:00Z"),
    ];

    const lines = renderPrefixes(project(entries, { activeLeafId: "a2" }));

    expect(lines).toEqual([
      "root",
      "reply-1",
      "follow-up",
      "reply-2",
    ]);
  });

  it("renders a binary branch with continuous gutters and last-child closers", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "branch-a", "root", "2026-04-09T10:01:00Z"),
      message("b", "assistant", "branch-b", "root", "2026-04-09T10:02:00Z"),
    ];

    // active leaf prefers branch-a, so it appears first among siblings
    const lines = renderPrefixes(project(entries, { activeLeafId: "a" }));

    expect(lines).toEqual([
      "root",
      "├─ branch-a",
      "└─ branch-b",
    ]);
  });

  it("embeds fold markers inside connector cells like Pi TUI", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "branch-a", "root", "2026-04-09T10:01:00Z"),
      message("b", "assistant", "branch-b", "root", "2026-04-09T10:02:00Z"),
    ];
    const rows = project(entries, { activeLeafId: "a" });
    const branchA = rows.find((row) => row.node.entry.id === "a")!;

    expect(buildTreePrefix(branchA, { foldable: true })).toBe("├⊟ ");
    expect(buildTreePrefix(branchA, { folded: true, foldable: true })).toBe("├⊞ ");
    expect(buildTreePrefix(rows[0], { foldable: true })).toBe("⊟ ");
  });

  it("keeps first-generation single-child grouping after a branch point", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "branch-a", "root", "2026-04-09T10:01:00Z"),
      message("a2", "user", "after-a", "a", "2026-04-09T10:02:00Z"),
      message("b", "assistant", "branch-b", "root", "2026-04-09T10:03:00Z"),
      message("b2", "user", "after-b", "b", "2026-04-09T10:04:00Z"),
    ];

    const lines = renderPrefixes(project(entries, { activeLeafId: "a2" }));

    // Pi keeps +1 indent for the first generation after a branch, without a connector.
    expect(lines).toEqual([
      "root",
      "├─ branch-a",
      "│     after-a",
      "└─ branch-b",
      "      after-b",
    ]);
  });

  it("renders nested branches with continuous ancestor rails", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "a", "root", "2026-04-09T10:01:00Z"),
      message("a1", "user", "a1", "a", "2026-04-09T10:02:00Z"),
      message("a2", "user", "a2", "a", "2026-04-09T10:03:00Z"),
      message("b", "assistant", "b", "root", "2026-04-09T10:04:00Z"),
    ];

    const lines = renderPrefixes(project(entries, { activeLeafId: "a1" }));

    expect(lines).toEqual([
      "root",
      "├─ a",
      "│  ├─ a1",
      "│  └─ a2",
      "└─ b",
    ]);
  });

  it("uses virtual-root semantics for multiple roots", () => {
    const entries = [
      message("r1", "user", "root-1", undefined, "2026-04-09T10:00:00Z"),
      message("r1a", "assistant", "child-1", "r1", "2026-04-09T10:01:00Z"),
      message("r2", "user", "root-2", undefined, "2026-04-09T10:02:00Z"),
      message("r2a", "assistant", "child-2", "r2", "2026-04-09T10:03:00Z"),
    ];

    const lines = renderPrefixes(project(entries, { activeLeafId: "r1a" }));

    // Pi suppresses connectors on virtual-root children; displayIndent is indent-1.
    expect(lines).toEqual([
      "root-1",
      "   child-1",
      "root-2",
      "   child-2",
    ]);
  });

  it("reconnects to nearest visible ancestor after filtering", () => {
    const entries = [
      message("u1", "user", "user-1", undefined, "2026-04-09T10:00:00Z"),
      message("a1", "assistant", "assistant-1", "u1", "2026-04-09T10:01:00Z"),
      message("t1", "toolResult", "tool-result", "a1", "2026-04-09T10:02:00Z"),
      message("u2", "user", "user-2", "t1", "2026-04-09T10:03:00Z"),
      message("a2", "assistant", "assistant-2", "u2", "2026-04-09T10:04:00Z"),
    ];

    const lines = renderPrefixes(
      project(entries, {
        activeLeafId: "a2",
        filter: "user-only",
      }),
    );

    expect(lines).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("hides collapsed descendants and recomputes sibling connectors", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "branch-a", "root", "2026-04-09T10:01:00Z"),
      message("a2", "user", "after-a", "a", "2026-04-09T10:02:00Z"),
      message("b", "assistant", "branch-b", "root", "2026-04-09T10:03:00Z"),
      message("b2", "user", "after-b", "b", "2026-04-09T10:04:00Z"),
    ];

    const lines = renderPrefixes(
      project(entries, {
        activeLeafId: "a2",
        collapsedIds: ["a"],
      }),
    );

    expect(lines).toEqual([
      "root",
      "├─ branch-a",
      "└─ branch-b",
      "      after-b",
    ]);
  });

  it("always recomputes rails when no-tools hides intermediate tool results", () => {
    const entries = [
      message("u1", "user", "user-1", undefined, "2026-04-09T10:00:00Z"),
      message("a1", "assistant", "assistant-1", "u1", "2026-04-09T10:01:00Z"),
      message("t1", "toolResult", "tool-result", "a1", "2026-04-09T10:02:00Z"),
      message("u2", "user", "user-2", "t1", "2026-04-09T10:03:00Z"),
    ];

    const lines = renderPrefixes(
      project(entries, {
        activeLeafId: "u2",
        filter: "no-tools",
      }),
    );

    expect(lines).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
    ]);
  });
});

describe("session tree active path", () => {
  it("walks parentId chain to the root", () => {
    const entries = [
      message("u1", "user", "root"),
      message("a1", "assistant", "reply", "u1"),
      message("u2", "user", "follow-up", "a1"),
    ];

    expect([...buildActivePathIds("u2", entries)].sort()).toEqual([
      "a1",
      "u1",
      "u2",
    ]);
  });
});

describe("session tree foldability", () => {
  it("matches Pi segment-start fold rules", () => {
    const entries = [
      message("root", "user", "root", undefined, "2026-04-09T10:00:00Z"),
      message("a", "assistant", "branch-a", "root", "2026-04-09T10:01:00Z"),
      message("a2", "user", "after-a", "a", "2026-04-09T10:02:00Z"),
      message("b", "assistant", "branch-b", "root", "2026-04-09T10:03:00Z"),
    ];

    const tree = buildTree(entries);
    const flatNodes = flattenTree(tree, buildActivePathIds("a2", entries));
    const rows = project(entries, { activeLeafId: "a2" });
    const maps = buildVisibleTreeMaps(rows, flatNodes);

    expect(isFoldableNode("root", maps.visibleParentById, maps.visibleChildrenById)).toBe(true);
    expect(isFoldableNode("a", maps.visibleParentById, maps.visibleChildrenById)).toBe(true);
    expect(isFoldableNode("a2", maps.visibleParentById, maps.visibleChildrenById)).toBe(false);
    expect(isFoldableNode("b", maps.visibleParentById, maps.visibleChildrenById)).toBe(false);
  });

  it("does not mutate source flat nodes when projecting filters", () => {
    const entries = [
      message("u1", "user", "user-1"),
      message("a1", "assistant", "assistant-1", "u1"),
      message("t1", "toolResult", "tool-result", "a1"),
      message("u2", "user", "user-2", "t1"),
    ];
    const tree = buildTree(entries);
    const flatNodes = flattenTree(tree, buildActivePathIds("u2", entries));
    const snapshot = flatNodes.map((node) => ({ ...node, gutters: [...node.gutters] }));

    filterFlatNodes(flatNodes, [], "user-only", () => "");

    expect(flatNodes).toEqual(snapshot);
  });
});
