// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@/types";
import {
  selectRenderableEntries,
  useSessionViewerDerivedData,
} from "./useSessionViewerDerivedData";

function message(
  id: string,
  role: string,
  text: string,
  parentId?: string | null,
): SessionEntry {
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

function modelChange(
  id: string,
  modelId: string,
  parentId?: string | null,
): SessionEntry {
  return {
    type: "model_change",
    id,
    parentId,
    timestamp: "2026-05-19T00:00:00.000Z",
    provider: "openai",
    modelId,
  };
}

describe("useSessionViewerDerivedData", () => {
  it("keeps developer messages renderable", () => {
    const entries = [
      message("dev-1", "developer", "Continue active goal"),
      message("assistant-1", "assistant", "Done", "dev-1"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, "assistant-1"),
    );

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "dev-1",
      "assistant-1",
    ]);
  });

  it("filters the transcript to the active branch path when tree selection changes", () => {
    const entries = [
      message("root-user", "user", "Root prompt"),
      message(
        "branch-a-assistant",
        "assistant",
        "Original branch reply",
        "root-user",
      ),
      message(
        "branch-b-assistant",
        "assistant",
        "Newer branch reply",
        "root-user",
      ),
    ];

    const { result, rerender } = renderHook(
      ({ active }) => useSessionViewerDerivedData(entries, active),
      { initialProps: { active: "branch-a-assistant" } },
    );

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "root-user",
      "branch-a-assistant",
    ]);

    rerender({ active: "branch-b-assistant" });

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "root-user",
      "branch-b-assistant",
    ]);
  });

  it("shows the full transcript when no active entry is selected", () => {
    const entries = [
      message("root-user", "user", "Root prompt"),
      message("branch-a-assistant", "assistant", "A", "root-user"),
      message("branch-b-assistant", "assistant", "B", "root-user"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, null),
    );

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "root-user",
      "branch-a-assistant",
      "branch-b-assistant",
    ]);
  });

  it("does not filter when active entry id is missing from the file", () => {
    const entries = [
      message("root-user", "user", "Root prompt"),
      message("branch-a-assistant", "assistant", "A", "root-user"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, "ghost-leaf"),
    );

    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "root-user",
      "branch-a-assistant",
    ]);
  });

  it("indexes tool results by tool call id across the whole file", () => {
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
      message("branch-b", "assistant", "other branch", null),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, "branch-b"),
    );

    expect(result.current.toolResultByCallId.get("call-1")?.id).toBe(
      "tool-result-1",
    );
    expect(result.current.renderableEntries.map((entry) => entry.id)).toEqual([
      "branch-b",
    ]);
  });

  it("keeps only the last model_change in a consecutive run", () => {
    const entries: SessionEntry[] = [
      modelChange("mc-1", "gpt-5.6-luna"),
      modelChange("mc-2", "gpt-5.6-terra"),
      message("user-1", "user", "hello"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, null),
    );

    expect(
      result.current.renderableEntries
        .filter((entry) => entry.type === "model_change")
        .map((entry) => entry.id),
    ).toEqual(["mc-2"]);
  });

  it("treats non-renderable entries as transparent for model_change runs", () => {
    const entries: SessionEntry[] = [
      modelChange("mc-1", "gpt-a"),
      {
        type: "thinking_level_change",
        id: "tl-1",
        timestamp: "2026-05-19T00:00:00.500Z",
        thinkingLevel: "high",
      },
      {
        type: "label",
        id: "label-1",
        timestamp: "2026-05-19T00:00:00.750Z",
        label: "settings",
      },
      modelChange("mc-2", "gpt-b"),
      message("user-1", "user", "hello"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, null),
    );

    expect(
      result.current.renderableEntries
        .filter((entry) => entry.type === "model_change")
        .map((entry) => entry.id),
    ).toEqual(["mc-2"]);
  });

  it("keeps non-consecutive model_change entries separated by user messages", () => {
    const entries: SessionEntry[] = [
      modelChange("mc-1", "gpt-a"),
      message("user-1", "user", "first", "mc-1"),
      modelChange("mc-2", "gpt-b", "user-1"),
      message("user-2", "user", "second", "mc-2"),
    ];

    const { result } = renderHook(() =>
      useSessionViewerDerivedData(entries, "user-2"),
    );

    expect(
      result.current.renderableEntries
        .filter((entry) => entry.type === "model_change")
        .map((entry) => entry.id),
    ).toEqual(["mc-1", "mc-2"]);
  });

  it("does not let a sibling-branch model_change collapse the active branch marker", () => {
    const entries: SessionEntry[] = [
      message("root", "user", "Start"),
      modelChange("mc-a", "model-a", "root"),
      message("branch-a", "assistant", "A", "mc-a"),
      modelChange("mc-b", "model-b", "root"),
      message("branch-b", "assistant", "B", "mc-b"),
    ];

    expect(
      selectRenderableEntries(entries, "branch-a").map((entry) => entry.id),
    ).toEqual(["root", "mc-a", "branch-a"]);

    expect(
      selectRenderableEntries(entries, "branch-b").map((entry) => entry.id),
    ).toEqual(["root", "mc-b", "branch-b"]);
  });

  it("keeps multi-hop branch tails isolated from siblings", () => {
    const entries = [
      message("root", "user", "Start"),
      message("left-a", "assistant", "Left", "root"),
      message("left-b", "user", "Continue left", "left-a"),
      message("right-a", "assistant", "Right", "root"),
      message("right-b", "user", "Continue right", "right-a"),
    ];

    expect(
      selectRenderableEntries(entries, "left-b").map((entry) => entry.id),
    ).toEqual(["root", "left-a", "left-b"]);

    expect(
      selectRenderableEntries(entries, "right-b").map((entry) => entry.id),
    ).toEqual(["root", "right-a", "right-b"]);
  });
});
