// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  buildSessionBranchModel,
  buildTopologyLayout,
  type SessionEntry,
} from "@/utils/session-branch";

import { zoomAtlasViewAtPointer } from "./GlobalMapCanvas";

const MODEL = buildSessionBranchModel([
  {
    type: "message",
    id: "root",
    parentId: null,
    timestamp: "2026-07-14T00:00:00Z",
    message: { role: "user", content: [{ type: "text", text: "Start" }] },
  },
  {
    type: "message",
    id: "reply",
    parentId: "root",
    timestamp: "2026-07-14T00:00:01Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
    },
  },
] satisfies SessionEntry[]);

describe("zoomAtlasViewAtPointer", () => {
  it("accumulates rapid wheel deltas from the latest view", () => {
    const layout = buildTopologyLayout(MODEL, "sequence");
    const initial = { zoom: 2, centerX: 0.5, centerY: 0.5 };
    const first = zoomAtlasViewAtPointer(
      initial,
      layout,
      1200,
      800,
      600,
      400,
      -8,
    );
    const sequential = zoomAtlasViewAtPointer(
      first,
      layout,
      1200,
      800,
      600,
      400,
      -12,
    );
    const combined = zoomAtlasViewAtPointer(
      initial,
      layout,
      1200,
      800,
      600,
      400,
      -20,
    );

    expect(sequential.zoom).toBeCloseTo(combined.zoom, 10);
    expect(sequential.centerX).toBeCloseTo(combined.centerX, 10);
    expect(sequential.centerY).toBeCloseTo(combined.centerY, 10);
  });
});
