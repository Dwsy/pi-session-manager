// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionViewProvider } from "@/contexts/SessionViewContext";
import type { SessionEntry } from "@/types";
import ConversationPreviewMessages, { buildConversationPreviewTurns } from "./ConversationPreviewMessages";

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

describe("buildConversationPreviewTurns", () => {
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
      <SessionViewProvider>
        <ConversationPreviewMessages
          entries={[message("dev-1", "developer", "Continue active goal")]}
          toolResultByCallId={new Map()}
          searchQuery=""
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={() => {}}
        />
      </SessionViewProvider>,
    );

    expect(screen.getByText("Continue active goal")).toBeTruthy();
  });
});
