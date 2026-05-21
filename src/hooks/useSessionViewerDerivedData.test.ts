import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@/types";
import { useSessionViewerDerivedData } from "./useSessionViewerDerivedData";

function message(id: string, role: string, text: string, parentId?: string): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-05-19T00:00:00.000Z",
    message: {
      role,
      content: [{ type: "text", text }],
    },
  };
}

describe("useSessionViewerDerivedData", () => {
  it("keeps developer messages renderable", () => {
    const entries = [
      message("dev-1", "developer", "Continue active goal"),
      message("assistant-1", "assistant", "Done", "dev-1"),
    ];

    const { result } = renderHook(() => useSessionViewerDerivedData(entries, "assistant-1"));

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "dev-1",
      "assistant-1",
    ]);
  });
});
