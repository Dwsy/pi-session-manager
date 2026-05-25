// @vitest-environment jsdom

import { createElement } from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAppearance", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
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
}: {
  entries: SessionEntry[];
  toolResultByCallId?: Map<string, SessionEntry>;
  onClose?: () => void;
}) {
  render(
    createElement(ToolCallReviewModal, {
      isOpen: true,
      onClose,
      entries,
      toolResultByCallId,
    }),
  );
  return { onClose };
}

async function findFileTreeButtonByText(pattern: RegExp) {
  let match: HTMLButtonElement | undefined;

  await waitFor(() => {
    const treeHost = document.querySelector("file-tree-container");
    const buttons = Array.from(
      treeHost?.shadowRoot?.querySelectorAll("button") ?? [],
    ).filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);

    match = buttons.find((button) => {
      const text = `${button.textContent ?? ""} ${button.dataset.itemPath ?? ""}`;
      return pattern.test(text);
    });
    expect(match).toBeTruthy();
  });

  return match!;
}

async function getFileTreeShadowRoot() {
  let shadowRoot: ShadowRoot | null | undefined;

  await waitFor(() => {
    shadowRoot = document.querySelector("file-tree-container")?.shadowRoot;
    expect(shadowRoot).toBeTruthy();
  });

  return shadowRoot!;
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

    expect(screen.getByRole("radio", { name: /Files\s*1/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByRole("radio", { name: /All\s*1/ })).toBeTruthy();
    expect(await screen.findByText("src/App.tsx")).toBeTruthy();
    expect(screen.queryByText("Shell command")).toBeNull();
    expect(document.body.textContent).not.toContain("pnpm build --filter api");

    const defaultShadowRoot = await getFileTreeShadowRoot();
    await waitFor(() => {
      expect(defaultShadowRoot.textContent).not.toContain("pnpm build --filter api");
    });

    fireEvent.click(screen.getByRole("radio", { name: /Shell\s*1/ }));

    const shellNode = await findFileTreeButtonByText(/#2 pnpm build --filter api/);
    fireEvent.click(shellNode);

    expect(screen.getByText("Shell command")).toBeTruthy();
    expect(screen.getByText("pnpm build --filter api")).toBeTruthy();
  });

  it("renders Pierre file tree icons and keeps metrics in the Inspector", async () => {
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

    const inspector = screen.getByText("Inspector").closest("aside");
    expect(inspector?.textContent).toContain("Sequence");
    expect(inspector?.textContent).toContain("Size");
    expect(inspector?.textContent).toContain("Additions");
    expect(inspector?.textContent).toContain("Deletions");
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

    await waitFor(() => expect(screen.getByText("src/App.tsx")).toBeTruthy());
    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getAllByText("User.java").length).toBeGreaterThan(0));
    fireEvent.keyDown(document, { key: "ArrowUp" });
    await waitFor(() => expect(screen.getByText("src/App.tsx")).toBeTruthy());
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

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(parentHotkey).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", parentHotkey);
    }
  });
});
