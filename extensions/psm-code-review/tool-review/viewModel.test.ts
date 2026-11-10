// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { FileOperation } from "./model";
import { getReviewStatus } from "./model";
import {
  buildCodeViewItems,
  buildReviewTreeModel,
  canonicalReviewPath,
  getReviewTreePath,
  resolveFileTreeDisplayPaths,
} from "./viewModel";

function operation(overrides: Partial<FileOperation>): FileOperation {
  return {
    id: "op-1",
    entryId: "entry-1",
    toolCallId: "call-1",
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
  it("does not present pending or failed tool-call attempts as confirmed file changes", () => {
    const pending = operation({
      id: "pending", filePath: "/repo/src/pending.ts", outcome: "pending",
      metrics: { additions: 20, deletions: 10, lines: 30, bytes: 40 },
    });
    const failed = operation({
      id: "failed", filePath: "/repo/src/failed.ts", outcome: "failed", isError: true,
      metrics: { additions: 5, deletions: 2, lines: 7, bytes: 10 },
    });
    const success = operation({
      id: "succeeded", filePath: "/repo/src/done.ts", outcome: "succeeded",
      metrics: { additions: 2, deletions: 1, lines: 3, bytes: 12 },
    });
    const tree = buildReviewTreeModel([pending, failed, success], "/repo");
    expect(tree.status).toEqual([{ path: "src/done.ts", status: "modified" }]);
    expect(tree.nodes.find((node) => node.path === "src/pending.ts")).toMatchObject({
      additions: 0, deletions: 0, hasPending: true, hasError: false, status: undefined,
    });
    expect(tree.nodes.find((node) => node.path === "src/failed.ts")).toMatchObject({
      additions: 0, deletions: 0, hasError: true, status: undefined,
    });
    expect(tree.nodes.find((node) => node.path === "src/done.ts")).toMatchObject({
      additions: 2, deletions: 1, status: "modified",
    });
    expect(getReviewStatus(pending, true, true).fallbackLabel).toBe("Awaiting tool result");
    expect(getReviewStatus(failed, true, true).fallbackLabel).toBe("Needs attention");
  });
  it("merges relative/absolute aliases only within the same session cwd", () => {
    const model = buildReviewTreeModel([
      operation({ id: "relative", filePath: "src/./task.ts" }),
      operation({ id: "absolute", filePath: "/repo/src/task.ts" }),
      operation({ id: "other-project", filePath: "/other-repo/src/task.ts" }),
    ], "/repo");
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.find((node) => node.path === "src/task.ts")?.operations.map((op) => op.id))
      .toEqual(["relative", "absolute"]);
    expect(model.nodes.find((node) => node.path.startsWith("External/"))?.operations[0].id)
      .toBe("other-project");
  });

  it("normalizes dot segments and Windows drive semantics without shortening away repository identity", () => {
    expect(canonicalReviewPath("src/../src/app.ts", "/work/repo")).toBe("src/app.ts");
    expect(canonicalReviewPath("../another/src/app.ts", "/work/repo")).toBe("External/work/another/src/app.ts");
    expect(canonicalReviewPath("C:\\APP\\src\\a.ts", "c:/app")).toBe("src/a.ts");
    expect(canonicalReviewPath("D:\\app\\src\\a.ts", "c:/app")).toBe("External/d:/app/src/a.ts");
  });
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
    expect(tree.displayPathByCanonical.get("src/new.ts")).toBe("src/new.ts");
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

  it("builds CodeView diff items from generated write content", () => {
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
      type: "diff",
      version: 1,
      fileDiff: {
        name: "new.ts",
        type: "new",
        isPartial: false,
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

  it("renames prefix-only leaves when a deeper path shares the same segment", () => {
    const tree = buildReviewTreeModel([
      operation({
        id: "file-root",
        sequence: 1,
        toolName: "write",
        filePath: "payment-core",
        content: "root marker",
      }),
      operation({
        id: "nested",
        sequence: 2,
        toolName: "edit",
        filePath: "payment-core/lib/App.tsx",
        args: { old_string: "a", new_string: "b" },
      }),
    ]);

    expect(tree.paths).toEqual([
      "payment-core (file)",
      "payment-core/lib/App.tsx",
    ]);
    expect(tree.canonicalPathByDisplay.get("payment-core (file)")).toBe(
      "payment-core",
    );
    expect(
      resolveFileTreeDisplayPaths(["payment-core", "payment-core/lib/App.tsx"])
        .displayPaths,
    ).toEqual(["payment-core (file)", "payment-core/lib/App.tsx"]);
  });

  it("ignores non-change operations for CodeView", () => {
    expect(
      buildCodeViewItems([
        operation({ id: "read-1", toolName: "read", filePath: "src/App.tsx" }),
      ]),
    ).toEqual([]);
  });
});
