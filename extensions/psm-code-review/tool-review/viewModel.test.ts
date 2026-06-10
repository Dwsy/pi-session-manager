// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { FileOperation } from "./model";
import { buildCodeViewItems, buildReviewTreeModel, getReviewTreePath } from "./viewModel";

function operation(overrides: Partial<FileOperation>): FileOperation {
  return {
    id: "op-1",
    entryId: "entry-1",
    sequence: 1,
    toolName: "edit",
    filePath: "src/App.tsx",
    args: {},
    isError: false,
    timestamp: "2026-05-19T10:00:00.000Z",
    preview: "",
    metrics: { additions: 0, deletions: 0, lines: 0, bytes: 0 },
    ...overrides,
  };
}

describe("tool review view model", () => {
  it("groups operations into tree paths with file status and totals", () => {
    const tree = buildReviewTreeModel([
      operation({
        id: "write-1",
        sequence: 1,
        toolName: "write",
        filePath: "/repo/src/new.ts",
        metrics: { additions: 3, deletions: 0, lines: 3, bytes: 12 },
      }),
      operation({
        id: "edit-1",
        sequence: 2,
        toolName: "edit",
        filePath: "/repo/src/new.ts",
        metrics: { additions: 1, deletions: 2, lines: 3, bytes: 20 },
      }),
      operation({
        id: "bash-1",
        sequence: 3,
        toolName: "bash",
        filePath: "pnpm test",
      }),
    ]);

    expect(tree.paths).toEqual(["Shell/#3 pnpm test", "src/new.ts"]);
    const sourceNode = tree.nodes.find((node) => node.path === "src/new.ts");
    expect(sourceNode).toMatchObject({
      path: "src/new.ts",
      additions: 4,
      deletions: 2,
      status: "added",
    });
    expect(tree.status).toContainEqual({ path: "src/new.ts", status: "added" });
    const shellNode = tree.nodes.find((node) => node.path === "Shell/#3 pnpm test");
    expect(shellNode?.status).toBeUndefined();
    expect(tree.status).not.toContainEqual({
      path: "Shell/#3 pnpm test",
      status: "modified",
    });
  });

  it("trims Java source paths to meaningful roots", () => {
    const edit = operation({
      id: "java-1",
      sequence: 5,
      toolName: "edit",
      filePath:
        "/tmp/work/bestwond-fast-service/bestwond-fast-common/src/main/java/com/bestwond/common/constant/NotificationTemplateConstants.java",
    });

    expect(getReviewTreePath(edit)).toBe(
      "src/main/java/com/bestwond/common/constant/NotificationTemplateConstants.java",
    );
  });

  it("keeps paths stable for selecting the first operation in each file node", () => {
    const edit = operation({
      id: "edit-1",
      sequence: 7,
      toolName: "edit",
      filePath: "/repo/src/App.tsx",
    });
    const shell = operation({
      id: "bash-1",
      sequence: 8,
      toolName: "bash",
      filePath: "pnpm test",
    });

    expect(getReviewTreePath(edit)).toBe("src/App.tsx");
    expect(getReviewTreePath(shell)).toBe("Shell/#8 pnpm test");
  });

  it("builds CodeView file items from generated write content", () => {
    const items = buildCodeViewItems([
      operation({
        id: "write-1",
        sequence: 1,
        toolName: "write",
        filePath: "src/new.ts",
        content: "export const value = 1;\n",
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "write-1",
      type: "file",
      version: 1,
      file: {
        name: "new.ts",
        contents: "export const value = 1;\n",
      },
    });
  });

  it("builds multiple CodeView diff items for one selected file", () => {
    const items = buildCodeViewItems([
      operation({
        id: "write-1",
        sequence: 1,
        toolName: "write",
        filePath: "src/new.ts",
        content: "export const value = 1;\n",
      }),
      operation({
        id: "edit-1",
        sequence: 2,
        toolName: "edit",
        filePath: "src/new.ts",
        args: {
          old_string: "export const value = 1;",
          new_string: "export const value = 2;",
        },
        content: "export const value = 2;",
      }),
    ]);

    expect(items.map((item) => item.id)).toEqual(["write-1", "edit-1"]);
  });

  it("ignores non-change operations for CodeView", () => {
    expect(
      buildCodeViewItems([
        operation({ id: "read-1", toolName: "read", filePath: "src/App.tsx" }),
      ]),
    ).toEqual([]);
  });
});
