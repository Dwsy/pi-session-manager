// @vitest-environment jsdom

import { createElement } from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAppearance", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver;
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  cleanup();
});

import type { SessionEntry } from "@/types";
import ToolCallReviewModal from "./ToolCallReviewModal";
import {
  DEFAULT_REVIEW_FILTER,
  extractFileOperations,
} from "./tool-review/model";

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

function renderModal({
  entries,
  toolResultByCallId = new Map(),
  onClose = vi.fn(),
  initialToolCallId,
}: {
  entries: SessionEntry[];
  toolResultByCallId?: Map<string, SessionEntry>;
  onClose?: () => void;
  initialToolCallId?: string;
}) {
  render(
    createElement(ToolCallReviewModal, {
      isOpen: true,
      onClose,
      entries,
      toolResultByCallId,
      initialToolCallId,
    }),
  );
  return { onClose };
}

async function getFileTreeShadowRoot() {
  let shadowRoot: ShadowRoot | null | undefined;

  await waitFor(() => {
    shadowRoot = document.querySelector("file-tree-container")?.shadowRoot;
    expect(shadowRoot).toBeTruthy();
  });

  return shadowRoot!;
}

/**
 * Shell mode renders operations via ReviewShellList as a plain `role="list"`
 * of clickable <div>s in the light DOM (NOT the shadow-root file tree), each
 * labeled with the command text and a `#<sequence>` prefix. This finds the
 * list item whose command matches `pattern`.
 */
async function findShellListItem(pattern: RegExp): Promise<HTMLElement> {
  let match: HTMLElement | undefined;

  await waitFor(() => {
    const lists = screen.getAllByRole("list");
    for (const list of lists) {
      const items = Array.from(list.querySelectorAll<HTMLElement>("[role='listitem'], div"));
      const hit = items.find((item) =>
        pattern.test(item.textContent ?? ""),
      );
      if (hit) {
        match = hit;
        break;
      }
    }
    expect(match).toBeTruthy();
  });

  return match!;
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
    expect(operations[0].filePath).toBe("pnpm build");
    expect(operations[1].filePath).toBe("src/App.tsx");
  });

  it("normalizes converted Codex and Claude Code tool aliases for review", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-claude-read",
            name: "Read",
            arguments: { file_path: "src/App.tsx" },
          },
          {
            type: "toolCall",
            id: "call-codex-edit",
            name: "edit_file",
            arguments: { path: "src/App.tsx", new_string: "const next = 1;" },
          },
          {
            type: "toolCall",
            id: "call-codex-shell",
            name: "shell",
            arguments: { command: "pnpm test" },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations.map((operation) => operation.toolName)).toEqual([
      "read",
      "edit",
      "bash",
    ]);
    expect(operations.map((operation) => operation.filePath)).toEqual([
      "src/App.tsx",
      "src/App.tsx",
      "pnpm test",
    ]);
  });


  it("extracts edit operations with resolved diff metrics", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-edit",
            name: "edit",
            arguments: {
              file_path: "src/App.tsx",
              old_string: "const value = 1;",
              new_string: "const value = 2;",
            },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations[0]).toMatchObject({
      toolName: "edit",
      filePath: "src/App.tsx",
      content: "const value = 2;",
      preview: "const value = 2;",
      metrics: {
        additions: 0,
        deletions: 0,
        lines: 1,
      },
    });
  });

  it("extracts nested Pi edit operations from edits oldText/newText", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-pi-edit",
            name: "edit",
            arguments: {
              path: "app/build.gradle",
              edits: [
                {
                  oldText: "packagingOptions {\n    exclude \"/META-INF/**\"\n}",
                  newText:
                    "packagingOptions {\n    resources {\n        excludes += [\"META-INF/LICENSE*\"]\n    }\n}",
                },
              ],
            },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations[0]).toMatchObject({
      toolName: "edit",
      filePath: "app/build.gradle",
      content:
        "packagingOptions {\n    resources {\n        excludes += [\"META-INF/LICENSE*\"]\n    }\n}",
      preview: "packagingOptions {",
      metrics: {
        additions: 0,
        deletions: 0,
        lines: 5,
      },
    });
  });

  it("extracts task operations with description fallback and output metrics", () => {
    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-task",
            name: "task",
            arguments: { description: "review repository changes" },
          },
        ]),
      ],
      new Map(),
    );

    expect(operations[0]).toMatchObject({
      sequence: 1,
      toolName: "task",
      filePath: "review repository changes",
      preview: '{ "description": "review repository changes" }',
      metrics: {
        additions: 0,
        deletions: 0,
        lines: 0,
      },
    });
  });

  it("marks operations as errors when matching tool result failed", () => {
    const toolResult: SessionEntry = {
      type: "message",
      id: "tool-result-1",
      timestamp: "2026-05-19T10:00:02.000Z",
      message: {
        role: "tool",
        toolCallId: "call-bash",
        toolName: "bash",
        isError: true,
        content: [{ type: "text", text: "command failed" }],
      },
    };

    const operations = extractFileOperations(
      [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-bash",
            name: "bash",
            arguments: { command: "pnpm build" },
          },
        ]),
      ],
      new Map([["call-bash", toolResult]]),
    );

    expect(operations[0]).toMatchObject({
      toolName: "bash",
      output: "command failed",
      isError: true,
      metrics: {
        lines: 1,
      },
    });
  });
});

describe("ToolCallReviewModal UI behavior", () => {
  it("renders the empty state", () => {
    renderModal({ entries: [] });

    expect(screen.getByText("No reviewable tool calls found")).toBeTruthy();
  });

  it("keeps error state and copy behavior", async () => {
    const toolResult: SessionEntry = {
      type: "message",
      id: "tool-result-1",
      timestamp: "2026-05-19T10:00:02.000Z",
      message: {
        role: "tool",
        toolCallId: "call-bash",
        toolName: "bash",
        isError: true,
        content: [{ type: "text", text: "command failed" }],
      },
    };

    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-bash",
            name: "bash",
            arguments: { command: "pnpm build" },
          },
        ]),
      ],
      toolResultByCallId: new Map([["call-bash", toolResult]]),
    });

    expect(screen.getByText("Error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy operation details" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "pnpm build\n\ncommand failed",
      );
    });
  });

  it("opens on the requested tool call", async () => {
    const firstResult: SessionEntry = {
      type: "message",
      id: "tool-result-first",
      timestamp: "2026-05-19T10:00:02.000Z",
      message: {
        role: "tool",
        toolCallId: "call-read-first",
        toolName: "read",
        content: [{ type: "text", text: "export const first = true;" }],
      },
    };
    const secondResult: SessionEntry = {
      type: "message",
      id: "tool-result-second",
      timestamp: "2026-05-19T10:00:03.000Z",
      message: {
        role: "tool",
        toolCallId: "call-read-second",
        toolName: "read",
        content: [{ type: "text", text: "export const second = true;" }],
      },
    };

    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-read-first",
            name: "read",
            arguments: { path: "src/First.ts" },
          },
          {
            type: "toolCall",
            id: "call-read-second",
            name: "read",
            arguments: { path: "src/Second.ts" },
          },
        ]),
      ],
      toolResultByCallId: new Map([
        ["call-read-first", firstResult],
        ["call-read-second", secondResult],
      ]),
      initialToolCallId: "call-read-second",
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain("export const second = true;");
    });
    expect(document.body.textContent).not.toContain("export const first = true;");
  });

  it("keeps Inspector and read output on the CodeBlock fallback path", async () => {
    const toolResult: SessionEntry = {
      type: "message",
      id: "tool-result-read",
      timestamp: "2026-05-19T10:00:02.000Z",
      message: {
        role: "tool",
        toolCallId: "call-read",
        toolName: "read",
        content: [{ type: "text", text: "export const value = 42;" }],
      },
    };

    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-read",
            name: "read",
            arguments: { path: "src/config.ts" },
          },
        ]),
      ],
      toolResultByCallId: new Map([["call-read", toolResult]]),
    });

    expect(await screen.findByText("Inspector")).toBeTruthy();
    expect(document.body.textContent).toContain("export const value = 42;");
  });

  it("keeps generic task metadata on the CodeBlock fallback path", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-task",
            name: "task",
            arguments: { description: "review repository changes" },
          },
        ]),
      ],
    });

    expect(await screen.findByText("Task")).toBeTruthy();
    expect(screen.getAllByText(/review repository changes/).length).toBeGreaterThan(0);
  });

  it("deduplicates diff detail chrome for edit operations", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-edit",
            name: "edit",
            arguments: {
              path: "src/App.tsx",
              old_string: "export const value = 1;",
              new_string: "export const value = 2;",
            },
          },
        ]),
      ],
    });

    expect(await screen.findByText("Patch")).toBeTruthy();
    expect(screen.queryByText("Change review")).toBeNull();
    expect(screen.queryByText("Impact")).toBeNull();
    expect(document.body.textContent).not.toContain("src/App.tsx");
  });

  it("splits new file and edit operations into separate filters", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-write",
            name: "write",
            arguments: {
              file_path: "src/NewFile.ts",
              content: "export const created = true;\n",
            },
          },
          {
            type: "toolCall",
            id: "call-edit",
            name: "edit",
            arguments: {
              path: "src/ExistingFile.ts",
              old_string: "export const value = 1;",
              new_string: "export const value = 2;",
            },
          },
          {
            type: "toolCall",
            id: "call-read",
            name: "read",
            arguments: { path: "src/config.ts" },
          },
        ]),
      ],
    });

    expect(screen.getByRole("radio", { name: /New\s*1/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Edit\s*1/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Changes/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /New\s*1/ }));

    const shadowRoot = await getFileTreeShadowRoot();
    await waitFor(() => {
      const treeText = Array.from(shadowRoot.querySelectorAll("button"))
        .map((button) => `${button.textContent ?? ""} ${button.getAttribute("data-item-path") ?? ""}`)
        .join("\n");
      expect(treeText).toContain("NewFile.ts");
      expect(treeText).not.toContain("ExistingFile.ts");
    });
  });

  it("selects shell tree nodes and keeps the detail panel on that command", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-read",
            name: "read",
            arguments: { path: "src/App.tsx" },
          },
          {
            type: "toolCall",
            id: "call-bash",
            name: "bash",
            arguments: { command: "pnpm build --filter api" },
          },
        ]),
      ],
    });

    expect(screen.getByRole("radio", { name: /All\s*1/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("radio", { name: /Shell\s*1/ })).toBeTruthy();
    // The path may be rendered both as a heading and inside the detail preview;
    // assert presence rather than uniqueness.
    expect((await screen.findAllByText("src/App.tsx")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Shell command")).toBeNull();
    expect(document.body.textContent).not.toContain("pnpm build --filter api");

    const defaultShadowRoot = await getFileTreeShadowRoot();
    await waitFor(() => {
      expect(defaultShadowRoot.textContent).not.toContain("pnpm build --filter api");
    });

    fireEvent.click(screen.getByRole("radio", { name: /^Shell\s*1$/ }));

    const shellNode = await findShellListItem(/pnpm build --filter api/);
    fireEvent.click(shellNode);

    // Highlighted bash/log output splits text across spans; assert merged text.
    expect(document.body.textContent).toContain("pnpm build --filter api");
  });

  it("renders Pierre file tree icons and shows metrics in the Inspector popover", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-read-app",
            name: "read",
            arguments: {
              path: "src/App.tsx",
            },
          },
          {
            type: "toolCall",
            id: "call-read",
            name: "read",
            arguments: { path: "package.json" },
          },
          {
            type: "toolCall",
            id: "call-bash",
            name: "bash",
            arguments: { command: "pnpm test" },
          },
        ]),
      ],
    });

    const shadowRoot = await getFileTreeShadowRoot();
    const iconTokens = Array.from(
      shadowRoot.querySelectorAll("[data-icon-token]"),
    ).map((element) => element.getAttribute("data-icon-token"));

    expect(iconTokens).toContain("react");
    expect(iconTokens).toContain("json");
    expect(document.querySelector(".code-block-header")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));

    await waitFor(() => {
      expect(document.body.textContent).toContain("Sequence");
      expect(document.body.textContent).toContain("Size");
      expect(document.body.textContent).toContain("Additions");
      expect(document.body.textContent).toContain("Deletions");
    });
  });

  it("lets the detail content enter fullscreen without the left file tree", async () => {
    const { onClose } = renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-write-preview",
            name: "write",
            arguments: {
              file_path: "src/views/review/PreviewPane.tsx",
              content: "export const PreviewPane = () => null;\n",
            },
          },
        ]),
      ],
    });

    await getFileTreeShadowRoot();
    expect(screen.getByRole("button", { name: "Inspector" })).toBeTruthy();
    expect(screen.queryByText("Target")).toBeNull();
    expect(document.querySelector("[data-tool-review-content-expanded='false']")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fullscreen content" }));

    expect(document.querySelector("[data-tool-review-content-expanded='true']")).toBeTruthy();
    expect(document.querySelector("file-tree-container")).toBeNull();
    expect(screen.getByRole("button", { name: "Inspector" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.querySelector("[data-tool-review-content-expanded='false']")).toBeTruthy();
    });
    expect(await screen.findByRole("button", { name: "Inspector" })).toBeTruthy();
  });

  it("moves selection with ArrowDown and ArrowUp", async () => {
    renderModal({
      entries: [
        assistantToolEntry([
          {
            type: "toolCall",
            id: "call-read-1",
            name: "read",
            arguments: { path: "src/App.tsx" },
          },
          {
            type: "toolCall",
            id: "call-read-2",
            name: "read",
            arguments: { path: "src/main/java/com/example/User.java" },
          },
        ]),
      ],
    });

    await waitFor(() =>
      expect(screen.getAllByText("src/App.tsx").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getAllByText("User.java").length).toBeGreaterThan(0));
    fireEvent.keyDown(document, { key: "ArrowUp" });
    await waitFor(() =>
      expect(screen.getAllByText("src/App.tsx").length).toBeGreaterThan(0),
    );
  });
});

describe("ToolCallReviewModal keyboard handling", () => {
  it("intercepts Escape before parent session hotkeys", async () => {
    const onClose = vi.fn();
    const parentHotkey = vi.fn();

    document.addEventListener("keydown", parentHotkey);

    try {
      render(
        createElement(ToolCallReviewModal, {
          isOpen: true,
          onClose,
          entries: [
            assistantToolEntry([
              {
                type: "toolCall",
                id: "call-read",
                name: "read",
                arguments: { path: "src/App.tsx" },
              },
            ]),
          ],
          toolResultByCallId: new Map(),
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByText("Sequence")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(parentHotkey).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", parentHotkey);
    }
  });
});
