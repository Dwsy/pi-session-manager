import { describe, expect, it } from "vitest";

import {
  buildSessionBranchModel,
  type SessionEntry,
} from "@/utils/session-branch";

import { buildSegmentBranchColors } from "./branchColors";

function message(id: string, parentId: string | null): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: `2026-07-14T00:00:0${id.length}Z`,
    message: {
      role: "user",
      content: [{ type: "text", text: id }],
    },
  };
}

describe("buildSegmentBranchColors", () => {
  it("uses stable terminal order while keeping shared trunks on accent", () => {
    const model = buildSessionBranchModel([
      message("root", null),
      message("left", "root"),
      message("right", "root"),
    ]);
    const colors = buildSegmentBranchColors(
      model.segments,
      model.terminalSegments,
      { accent: "accent", branches: ["blue", "green", "purple"] },
    );

    const root = model.firstById.get("root")!.segment!;
    const left = model.firstById.get("left")!.segment!;
    const right = model.firstById.get("right")!.segment!;

    expect(colors.get(root.uid)).toBe("accent");
    expect(colors.get(left.uid)).toBe("blue");
    expect(colors.get(right.uid)).toBe("green");
  });
});
