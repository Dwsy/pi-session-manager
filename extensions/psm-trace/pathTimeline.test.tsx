// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import activate from "./index";
import TraceView from "./TraceView";

const CONTENT = [
  {
    type: "session",
    id: "session",
    version: 3,
    timestamp: "2026-07-14T00:00:00Z",
  },
  {
    type: "message",
    id: "root",
    parentId: null,
    timestamp: "2026-07-14T00:00:01Z",
    message: { role: "user", content: [{ type: "text", text: "Root prompt" }] },
  },
  {
    type: "message",
    id: "branch-a",
    parentId: "root",
    timestamp: "2026-07-14T00:00:02Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Branch A" }],
    },
  },
  {
    type: "message",
    id: "branch-b",
    parentId: "root",
    timestamp: "2026-07-14T00:00:03Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Branch B" }],
    },
  },
]
  .map((entry) => JSON.stringify(entry))
  .join("\n");

function capabilityClient() {
  return {
    sessions: {
      readFileChunk: vi.fn().mockResolvedValue({
        content: CONTENT,
        next_offset: CONTENT.length,
        file_size: CONTENT.length,
        has_more: false,
      }),
    },
  };
}

describe("psm-trace workbench", () => {
  it("renders the active path as trace steps and locates entries through the viewer", async () => {
    const navigateBranch = vi.fn();
    render(
      <TraceView
        client={capabilityClient() as any}
        session={{ path: "/tmp/session.jsonl" }}
        activeEntryId="branch-a"
        viewer={{
          revealEntry: vi.fn(),
          revealToolCall: vi.fn(),
          navigateBranch,
        }}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Trace lens" })).not.toBeNull();
    });
    expect(screen.getAllByText("Branch A").length).toBeGreaterThan(0);
    expect(screen.queryByText("Branch B")).toBeNull();
    expect(screen.getByLabelText("Step inspector")).not.toBeNull();

    const rootRow = screen
      .getAllByText("Root prompt")
      .find((element) => element.className.includes("psm-trace-row__title"));
    expect(rootRow).toBeTruthy();
    fireEvent.doubleClick(rootRow!);
    expect(navigateBranch).toHaveBeenCalledWith(
      "branch-b",
      "root",
      expect.objectContaining({ align: "center" }),
    );
  });

  it("reloads the live session when its active entry advances", async () => {
    const client = capabilityClient();
    const props = {
      client: client as any,
      session: { path: "/tmp/session.jsonl" },
      viewer: { revealEntry: vi.fn(), revealToolCall: vi.fn() },
      onClose: vi.fn(),
    };
    const { rerender } = render(<TraceView {...props} activeEntryId="branch-a" />);

    await screen.findAllByText("Branch A");
    rerender(<TraceView {...props} activeEntryId="branch-b" />);

    await waitFor(() => {
      expect(screen.getAllByText("Branch B").length).toBeGreaterThan(0);
      expect(client.sessions.readFileChunk).toHaveBeenCalledTimes(2);
    });
  });

  it("registers the workbench as the existing Trace main view", () => {
    const registerSessionToolbarItem = vi.fn();
    const registerSessionMainView = vi.fn();
    activate({
      i18n: { t: (key: string) => key },
      psm: capabilityClient(),
      ui: { registerSessionToolbarItem, registerSessionMainView },
    } as any);

    expect(registerSessionToolbarItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "builtin.trace.toolbar",
        mainViewId: "builtin.trace.main",
      }),
    );
    expect(registerSessionMainView).toHaveBeenCalledWith(
      expect.objectContaining({ id: "builtin.trace.main", title: "Trace" }),
    );
  });
});
