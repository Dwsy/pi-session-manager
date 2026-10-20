// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionInfo } from "@/types";
import { useSessionTabs } from "./useSessionTabs";

const mocks = vi.hoisted(() => ({
  onSelectSession: vi.fn(),
  onCloseViewer: vi.fn(),
}));

function makeSession(id: string): SessionInfo {
  return {
    path: `/tmp/${id}.jsonl`,
    id,
    cwd: "/tmp",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    message_count: 0,
    first_message: "",
    last_message: "",
    last_message_role: "",
  };
}

interface Props {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  enabled: boolean;
}

function renderTabs(initialProps: Props) {
  return renderHook(
    (props: Props) =>
      useSessionTabs({
        sessions: props.sessions,
        selectedSession: props.selectedSession,
        enabled: props.enabled,
        onSelectSession: mocks.onSelectSession,
        onCloseViewer: mocks.onCloseViewer,
      }),
    { initialProps },
  );
}

const A = makeSession("a");
const B = makeSession("b");
const C = makeSession("c");

function ids(value: ReturnType<typeof useSessionTabs>): string[] {
  return value.tabs?.tabs.map((session) => session.id) ?? [];
}

describe("useSessionTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accumulates opened sessions as tabs in selection order", () => {
    const view = renderTabs({
      sessions: [A, B, C],
      selectedSession: A,
      enabled: true,
    });

    expect(ids(view.result.current)).toEqual(["a"]);
    expect(view.result.current.tabs?.activeTabId).toBe("a");

    view.rerender({ sessions: [A, B, C], selectedSession: B, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b"]);

    view.rerender({ sessions: [A, B, C], selectedSession: A, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b"]);
    expect(view.result.current.tabs?.activeTabId).toBe("a");
  });

  it("keeps the active session visible even before its id is loaded in sessions", () => {
    // Simulates a session route resolving before the session list contains it.
    const view = renderTabs({
      sessions: [A],
      selectedSession: B,
      enabled: true,
    });

    expect(ids(view.result.current)).toEqual(["b"]);
    // A later prune pass must not drop the active id.
    view.rerender({ sessions: [A], selectedSession: B, enabled: true });
    expect(ids(view.result.current)).toEqual(["b"]);
  });

  it("prunes tabs whose session disappeared, but never the active one", () => {
    const view = renderTabs({
      sessions: [A, B],
      selectedSession: A,
      enabled: true,
    });
    view.rerender({ sessions: [A, B], selectedSession: B, enabled: true });
    view.rerender({ sessions: [A, B], selectedSession: A, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b"]);

    // B deleted while A is active.
    view.rerender({ sessions: [A], selectedSession: A, enabled: true });
    expect(ids(view.result.current)).toEqual(["a"]);
  });

  it("collapses to the active session when the mode is turned off and back on", () => {
    const view = renderTabs({
      sessions: [A, B],
      selectedSession: A,
      enabled: true,
    });
    view.rerender({ sessions: [A, B], selectedSession: B, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b"]);

    view.rerender({ sessions: [A, B], selectedSession: B, enabled: false });
    expect(view.result.current.tabs).toBeUndefined();

    view.rerender({ sessions: [A, B], selectedSession: B, enabled: true });
    expect(ids(view.result.current)).toEqual(["b"]);
  });

  it("closes a background tab without changing the active session", () => {
    const view = renderTabs({
      sessions: [A, B, C],
      selectedSession: A,
      enabled: true,
    });
    view.rerender({ sessions: [A, B, C], selectedSession: B, enabled: true });
    view.rerender({ sessions: [A, B, C], selectedSession: C, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b", "c"]);

    act(() => view.result.current.closeTab("a"));

    expect(ids(view.result.current)).toEqual(["b", "c"]);
    expect(mocks.onSelectSession).not.toHaveBeenCalled();
    expect(mocks.onCloseViewer).not.toHaveBeenCalled();
  });

  it("selects the right neighbor when the active tab is closed", () => {
    const view = renderTabs({
      sessions: [A, B, C],
      selectedSession: A,
      enabled: true,
    });
    view.rerender({ sessions: [A, B, C], selectedSession: B, enabled: true });
    view.rerender({ sessions: [A, B, C], selectedSession: C, enabled: true });
    view.rerender({ sessions: [A, B, C], selectedSession: B, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "b", "c"]);

    act(() => view.result.current.closeTab("b"));

    expect(mocks.onSelectSession).toHaveBeenCalledTimes(1);
    expect(mocks.onSelectSession.mock.calls[0][0].id).toBe("c");
    expect(mocks.onCloseViewer).not.toHaveBeenCalled();
  });

  it("falls back to the left neighbor when no right neighbor exists", () => {
    const view = renderTabs({
      sessions: [A, C],
      selectedSession: A,
      enabled: true,
    });
    view.rerender({ sessions: [A, C], selectedSession: C, enabled: true });
    expect(ids(view.result.current)).toEqual(["a", "c"]);

    act(() => view.result.current.closeTab("c"));

    expect(mocks.onSelectSession.mock.calls.at(-1)?.[0].id).toBe("a");
    expect(mocks.onCloseViewer).not.toHaveBeenCalled();
  });

  it("closes the viewer when the last open tab is closed", () => {
    const view = renderTabs({
      sessions: [A],
      selectedSession: A,
      enabled: true,
    });

    act(() => view.result.current.closeTab("a"));

    expect(mocks.onCloseViewer).toHaveBeenCalledTimes(1);
    expect(mocks.onSelectSession).not.toHaveBeenCalled();
  });
});
