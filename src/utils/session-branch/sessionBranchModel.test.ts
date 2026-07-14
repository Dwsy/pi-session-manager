import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@/types";
import { parseSessionEntriesWithLineCount } from "@/utils/session";

import {
  buildEffectiveContext,
  buildPath,
  buildSessionBranchModel,
  buildTopologyLayout,
  buildTopologyProjection,
  buildTreeItems,
} from ".";

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
  parentId?: string | null,
): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: `2026-07-14T00:00:0${id.length}Z`,
    message: { role, content: [{ type: "text", text }] },
  };
}

function branchedEntries(): SessionEntry[] {
  return [
    message("root", "user", "Start"),
    message("left-a", "assistant", "Left answer", "root"),
    message("left-b", "user", "Continue left", "left-a"),
    message("right-a", "assistant", "Right answer", "root"),
    message("right-b", "user", "Continue right", "right-a"),
  ];
}

describe("session branch model", () => {
  it("separates parentId storage paths from visual branch segments", () => {
    const model = buildSessionBranchModel(branchedEntries());

    expect(model.forks).toHaveLength(1);
    expect(model.forks[0]?.anchor.id).toBe("root");
    expect(model.segments).toHaveLength(3);
    expect(model.rootSegments[0]?.nodes.map((node) => node.id)).toEqual([
      "root",
    ]);
    expect(model.rootSegments[0]?.children).toHaveLength(2);
    expect(model.terminalSegments.map((segment) => segment.end.id)).toEqual([
      "left-b",
      "right-b",
    ]);
  });

  it("draws connectors only for real forks", () => {
    const model = buildSessionBranchModel(branchedEntries());
    const layout = buildTopologyLayout(model, "sequence");

    expect(layout.segments).toHaveLength(3);
    expect(layout.forkLinks).toHaveLength(2);
    expect(
      layout.forkLinks.every((link) => link.fork.anchor.id === "root"),
    ).toBe(true);
  });

  it("hides annotations in the embedded map but retains them for Atlas", () => {
    const model = buildSessionBranchModel([
      message("root", "user", "Start"),
      message("reply", "assistant", "Done", "root"),
    ]);
    const layout = buildTopologyLayout(model, "sequence");
    const settings = {
      scope: "all" as const,
      axis: "sequence" as const,
      smartMapLayout: false,
      enabledNotes: {
        user: true,
        assistant_reply: true,
        rename: true,
        label: true,
        model: true,
        thinking: true,
        compaction: true,
        error: true,
      },
      selectedModels: [],
      showBridgeCounts: true,
      showSegmentLabels: true,
      showForkLabels: true,
    };

    expect(
      buildTopologyProjection(layout, settings, "reply", "reply", "none").notes,
    ).toEqual([]);
    expect(
      buildTopologyProjection(layout, settings, "reply", "reply", "atlas").notes
        .length,
    ).toBeGreaterThan(0);
  });

  it("projects active lineage first without nesting linear entries", () => {
    const model = buildSessionBranchModel(branchedEntries());
    const activeLeafUid = model.firstById.get("right-b")!.uid;
    const items = buildTreeItems({
      model,
      activeLeafUid,
      filter: "all",
      search: "",
      includeSearchContext: true,
      collapsed: new Set(),
    });
    const segmentItems = items.filter((item) => item.kind === "segment");
    const rightSegment = model.firstById.get("right-b")!.segment!;

    expect(segmentItems[1]?.kind).toBe("segment");
    expect(segmentItems[1]?.key).toBe(rightSegment.uid);
    expect(
      items
        .filter(
          (item) => item.kind === "entry" && item.segment === rightSegment,
        )
        .map((item) => item.indent),
    ).toEqual([1, 1]);
  });

  it("reconstructs effective context from the last compaction", () => {
    const entries: SessionEntry[] = [
      message("u1", "user", "One"),
      message("a1", "assistant", "One answer", "u1"),
      {
        type: "compaction",
        id: "compact",
        parentId: "a1",
        timestamp: "2026-07-14T00:00:03Z",
        firstKeptEntryId: "a1",
        summary: "Compact",
      },
      message("u2", "user", "Two", "compact"),
    ];
    const model = buildSessionBranchModel(entries);
    const path = buildPath(model, model.firstById.get("u2")!.uid);

    expect(buildEffectiveContext(path, model).map((node) => node.id)).toEqual([
      "compact",
      "a1",
      "u2",
    ]);
  });

  it("does not mutate input while reporting inferred topology", () => {
    const entries = branchedEntries();
    const before = JSON.stringify(entries);
    const model = buildSessionBranchModel(entries);

    expect(JSON.stringify(entries)).toBe(before);
    expect(model.topologyQuality).toBe("inferred");
  });

  it("uses source order for Pi entries that omit parentId", () => {
    const entries = [
      message("one", "user", "One"),
      message("two", "assistant", "Two"),
      message("three", "user", "Three"),
    ];
    for (const entry of entries) delete entry.parentId;

    const model = buildSessionBranchModel(entries);

    expect(model.topologyQuality).toBe("unknown");
    expect(model.roots.map((node) => node.id)).toEqual(["one"]);
    expect(model.firstById.get("two")?.parent?.id).toBe("one");
    expect(model.firstById.get("three")?.parent?.id).toBe("two");
    expect(model.segments).toHaveLength(1);
  });

  it("keeps a custom parent anchor in the same topology path", () => {
    const content = [
      JSON.stringify(message("root", "user", "Start", null)),
      JSON.stringify({
        type: "custom",
        id: "custom-anchor",
        parentId: "root",
        timestamp: "2026-07-14T00:00:01Z",
        content: "branch anchor",
      }),
      JSON.stringify(
        message("child", "assistant", "Continue", "custom-anchor"),
      ),
    ].join("\n");

    const { entries } = parseSessionEntriesWithLineCount(content);
    const model = buildSessionBranchModel(entries);

    expect(model.roots.map((node) => node.id)).toEqual(["root"]);
    expect(model.segments).toHaveLength(1);
    expect(model.firstById.get("child")?.parent?.id).toBe("custom-anchor");
  });

  it("keeps ambiguous duplicate parent references as roots", () => {
    const entries = [
      message("duplicate", "user", "First"),
      message("duplicate", "assistant", "Second"),
      message("child", "user", "Child", "duplicate"),
    ];

    const model = buildSessionBranchModel(entries);

    expect(model.firstById.get("child")?.parent).toBeNull();
    expect(model.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-id" }),
        expect.objectContaining({ code: "ambiguous-parent" }),
      ]),
    );
  });
});
