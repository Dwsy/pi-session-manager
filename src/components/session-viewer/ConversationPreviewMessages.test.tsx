// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionViewProvider } from "@/contexts/SessionViewContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { registerBuiltinToolPlugins } from "@/plugins/tools-render";
import type { SessionEntry } from "@/types";
import ConversationPreviewMessages, { buildConversationPreviewTurns } from "./ConversationPreviewMessages";

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
    const toolHeader = container.querySelector(".tool-header-bash");
    expect(toolHeader).toBeTruthy();
    fireEvent.click(toolHeader!);

    expect(document.body.textContent).toContain("tests passed");
  });
});
