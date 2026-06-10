// @vitest-environment jsdom
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

  it("keeps the full transcript renderable when tree selection changes", () => {
    const entries = [
      message("root-user", "user", "Root prompt"),
      message("branch-a-assistant", "assistant", "Original branch reply", "root-user"),
      message("branch-b-assistant", "assistant", "Newer branch reply", "root-user"),
    ];

    const { result } = renderHook(() => useSessionViewerDerivedData(entries, "branch-a-assistant"));

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "root-user",
      "branch-a-assistant",
      "branch-b-assistant",
    ]);
  });

  it("indexes tool results by tool call id", () => {
    const entries = [
      message("assistant-1", "assistant", "Running tool"),
      {
        type: "message",
        id: "tool-result-1",
        parentId: "assistant-1",
        timestamp: "2026-05-19T00:00:01.000Z",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "file contents" }],
        },
      } satisfies SessionEntry,
    ];

    const { result } = renderHook(() => useSessionViewerDerivedData(entries, "tool-result-1"));

    expect(result.current.toolResultByCallId.get("call-1")?.id).toBe("tool-result-1");
  });
});
