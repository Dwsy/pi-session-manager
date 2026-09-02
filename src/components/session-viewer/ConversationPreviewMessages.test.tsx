// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionViewProvider } from "@/contexts/SessionViewContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { registerBuiltinToolPlugins } from "@/plugins/tools-render";
import type { SessionEntry } from "@/types";
import ConversationPreviewMessages, {
  buildConversationPreviewTurns,
  buildToolCallPreviewSegments,
} from "./ConversationPreviewMessages";

function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SessionViewProvider>{children}</SessionViewProvider>
    </SettingsProvider>
  );
}

function message(id: string, role: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-05-19T00:00:00.000Z",
    message: {
      role,
      content: [{ type: "text", text }],
    },
  };
}

function toolCall(id: string, name: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-05-19T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id, name, arguments: {} }],
    },
  };
}

function thinking(id: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-05-19T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: text }],
    },
  };
}

function toolResult(id: string, toolCallId: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-05-19T00:00:00.000Z",
    message: {
      role: "toolResult",
      toolCallId,
      content: [{ type: "text", text: "ok" }],
    },
  };
}

describe("buildConversationPreviewTurns", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    registerBuiltinToolPlugins();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  it("starts a visible turn from a developer message", () => {
    const turns = buildConversationPreviewTurns([
      message("dev-1", "developer", "Continue active goal"),
      message("assistant-1", "assistant", "Reading files"),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].id).toBe("dev-1");
    expect(turns[0].userEntry?.id).toBe("dev-1");
    expect(turns[0].assistantEntry?.id).toBe("assistant-1");
  });

  it("does not drop entries when the file begins with assistant output", () => {
    const turns = buildConversationPreviewTurns([
      message("assistant-1", "assistant", "Already working"),
      message("user-1", "user", "Next prompt"),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].id).toBe("assistant-1");
    expect(turns[0].userEntry).toBeUndefined();
    expect(turns[0].assistantEntry?.id).toBe("assistant-1");
    expect(turns[1].userEntry?.id).toBe("user-1");
  });

  it("keeps intermediate assistant text in chronological process order", () => {
    const turns = buildConversationPreviewTurns([
      message("user-1", "user", "Inspect"),
      toolCall("read-1", "read"),
      message("checkpoint", "assistant", "I found the first boundary"),
      toolCall("bash-1", "bash"),
      message("done", "assistant", "Done"),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].processEntries.map((entry) => entry.id)).toEqual([
      "read-1",
      "checkpoint",
      "bash-1",
    ]);
    expect(turns[0].assistantEntry?.id).toBe("done");
  });

  it("builds Grok-style tool runs across thinking and tool results but stops at visible text", () => {
    const segments = buildToolCallPreviewSegments([
      toolCall("read-1", "read"),
      thinking("thinking-1", "checking"),
      toolResult("result-1", "read-1"),
      toolCall("bash-1", "bash"),
      message("checkpoint", "assistant", "Visible boundary"),
      toolCall("write-1", "write"),
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "group",
      "entry",
      "group",
    ]);
    const firstGroup = segments[0];
    expect(firstGroup.kind).toBe("group");
    if (firstGroup.kind === "group") {
      expect(firstGroup.memberEntries.map((entry) => entry.id)).toEqual([
        "read-1",
        "bash-1",
      ]);
      expect(firstGroup.transparentEntries.map((entry) => entry.id)).toEqual([
        "result-1",
      ]);
      expect(firstGroup.entries.map((entry) => entry.id)).toEqual([
        "read-1",
        "thinking-1",
        "result-1",
        "bash-1",
      ]);
    }
  });

  it("renders V2 tool groups independently and leaves assistant text boundaries visible", () => {
    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            message("user-1", "user", "Inspect"),
            toolCall("read-1", "read"),
            message("checkpoint", "assistant", "Visible boundary"),
            toolCall("bash-1", "bash"),
            message("done", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    expect(screen.getByText("Visible boundary")).toBeTruthy();
    expect(screen.getAllByText("Show")).toHaveLength(2);

    fireEvent.click(screen.getAllByText("Show")[0]);
    expect(screen.getAllByText("Hide")).toHaveLength(1);
    expect(screen.getAllByText("Show")).toHaveLength(1);
  });

  it("keeps the legacy whole-turn fold as a single summary", () => {
    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            message("user-1", "user", "Inspect"),
            toolCall("read-1", "read"),
            message("checkpoint", "assistant", "Legacy hidden boundary"),
            toolCall("bash-1", "bash"),
            message("done", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
          foldMode="wholeTurn"
        />
      </Providers>,
    );

    expect(screen.queryByText("Legacy hidden boundary")).toBeNull();
    expect(screen.getAllByText("Show")).toHaveLength(1);
  });

  it("renders a developer-starting conversation", () => {
    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[message("dev-1", "developer", "Continue active goal")]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    expect(screen.getByText("Continue active goal")).toBeTruthy();
  });

  it("keeps hook order stable when process entries appear after an empty summary", () => {
    const { rerender } = render(
      <Providers>
        <ConversationPreviewMessages
          entries={[message("user-1", "user", "Open file"), message("assistant-1", "assistant", "Done")]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    rerender(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            message("user-1", "user", "Open file"),
            toolCall("tool-1", "read"),
            message("assistant-1", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    expect(screen.getByText("read")).toBeTruthy();
  });

  it("renders expanded process entries with duplicate entry ids without React key warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            message("user-1", "user", "Open file"),
            toolCall("3e57eea9", "read"),
            toolCall("3e57eea9", "bash"),
            message("assistant-1", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    fireEvent.click(screen.getByText("Show"));

    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((arg) =>
        String(arg).includes("Encountered two children with the same key"),
      ),
    );
    consoleError.mockRestore();

    expect(duplicateKeyWarning).toBe(false);
  });

  it("always shows model_change outside the collapsible process summary", () => {
    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            {
              type: "model_change",
              id: "mc-1",
              timestamp: "2026-05-19T00:00:00.000Z",
              provider: "3838/cx",
              modelId: "gpt-5.6-terra",
            },
            toolCall("tool-1", "bash"),
            message("assistant-1", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    // model_change is visible without expanding
    expect(screen.getByText(/gpt-5\.6-terra/)).toBeTruthy();
    // summary should only count foldable process work, not model_change
    expect(screen.queryByText("model_change")).toBeNull();
    expect(screen.getByText("bash")).toBeTruthy();
  });

  it("does not render a process fold when only model_change entries exist", () => {
    render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            {
              type: "model_change",
              id: "mc-1",
              timestamp: "2026-05-19T00:00:00.000Z",
              provider: "3838/cx",
              modelId: "gpt-5.6-terra",
            },
            message("user-1", "user", "hello"),
          ]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    expect(screen.getByText(/gpt-5\.6-terra/)).toBeTruthy();
    expect(screen.queryByText("Show")).toBeNull();
    expect(screen.queryByText("Hide")).toBeNull();
  });

  it("shows linked tool output after expanding a process entry", () => {
    const toolResult: SessionEntry = {
      type: "message",
      id: "tool-result-bash",
      timestamp: "2026-05-19T00:00:01.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-bash",
        content: [{ type: "text", text: "tests passed" }],
      },
    };

    const { container } = render(
      <Providers>
        <ConversationPreviewMessages
          entries={[
            message("user-1", "user", "Run tests"),
            {
              type: "message",
              id: "assistant-tool",
              timestamp: "2026-05-19T00:00:00.000Z",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: "call-bash",
                    name: "bash",
                    arguments: { command: "pnpm test" },
                  },
                ],
              },
            },
            message("assistant-1", "assistant", "Done"),
          ]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </Providers>,
    );

    fireEvent.click(screen.getByText("Show"));
    const toolToggle = container.querySelector(".tool-header-bash .tool-header-toggle");
    expect(toolToggle).toBeTruthy();
    fireEvent.click(toolToggle!);

    expect(document.body.textContent).toContain("tests passed");
  });
});
