// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionViewProvider } from "@/contexts/SessionViewContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
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
      content: [{ type: "toolCall", id, name, args: {} }],
    },
  };
}

describe("buildConversationPreviewTurns", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
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
});
