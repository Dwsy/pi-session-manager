// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@/types";
import {
  DEFAULT_REVIEW_FILTER,
  extractFileOperations,
} from "./ToolCallReviewModal";

function assistantToolEntry(content: NonNullable<SessionEntry["message"]>["content"]): SessionEntry {
  return {
    type: "message",
    id: "assistant-1",
    timestamp: "2026-05-19T10:00:00.000Z",
    message: {
      role: "assistant",
      content,
    },
  };
}

describe("ToolCallReviewModal data model", () => {
  it("defaults to the full operation timeline", () => {
    expect(DEFAULT_REVIEW_FILTER).toBe("all");
  });

  it("extracts write operations with path, preview, and line metrics", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-write",
            name: "write",
            arguments: {
              file_path: "/repo/src/example.ts",
              content: "export const value = 1;\nexport const next = 2;",
            },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      sequence: 1,
      toolName: "write",
      filePath: "/repo/src/example.ts",
      preview: "export const value = 1;",
      metrics: {
        additions: 2,
        deletions: 0,
        lines: 2,
      },
    });
  });

  it("keeps shell and read operations in source order", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-bash",
            name: "bash",
            arguments: { command: "pnpm build" },
          },
          {
            type: "toolCall",
            id: "call-read",
            name: "read",
            arguments: { path: "src/App.tsx" },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations.map((operation) => operation.toolName)).toEqual([
      "bash",
      "read",
    ]);
    expect(operations.map((operation) => operation.sequence)).toEqual([1, 2]);
  });
});
