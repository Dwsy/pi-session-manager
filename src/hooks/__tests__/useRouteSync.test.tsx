// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useRouteSync } from "../useRouteSync";
import type { SessionInfo } from "@/types";

const makeSession = (id: string): SessionInfo => ({
  id,
  path: `/sessions/${id}.jsonl`,
  cwd: "/tmp/project",
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-01T00:00:00.000Z",
  message_count: 1,
  first_message: "hello",
  last_message: "hello",
  last_message_role: "user",
});

type HookProps = Parameters<typeof useRouteSync>[0];

function renderUseRouteSync(path: string, initialProps: Partial<HookProps> = {}) {
  const session = makeSession("target-session");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  const spies = {
    setSelectedSession: vi.fn(),
    setViewMode: vi.fn(),
    setSelectedProject: vi.fn(),
    setShowSettings: vi.fn(),
    setShowTerminal: vi.fn(),
    setShowFavorites: vi.fn(),
    setActiveAppViewId: vi.fn(),
  };

  const baseProps: HookProps = {
    selectedSession: null,
    sessions: [session],
    sessionsLoading: true,
    viewMode: "list",
    ...spies,
    appRoutes: [],
    appRoutesReady: true,
    ...initialProps,
  };

  const hook = renderHook((props: HookProps) => useRouteSync(props), {
    wrapper,
    initialProps: baseProps,
  });
  return { ...hook, spies, session, baseProps };
}

describe("useRouteSync", () => {
  it("reports pending while a session URL has not been selected yet", () => {
    const { result } = renderUseRouteSync("/sessions/target-session", {
      selectedSession: null,
    });

    expect(result.current.pendingSessionRoute).toBe(true);
  });

  it("does not report pending once the URL session is selected", () => {
    const selectedSession = makeSession("target-session");
    const { result } = renderUseRouteSync("/sessions/target-session", {
      selectedSession,
    });

    expect(result.current.pendingSessionRoute).toBe(false);
  });

  it("activates a registered app route generically", async () => {
    const { spies } = renderUseRouteSync("/boards", {
      selectedSession: null,
      sessionsLoading: false,
      appRoutes: [{ id: "app.board", route: "/boards" }],
      appRoutesReady: true,
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith("app.board");
      expect(spies.setViewMode).toHaveBeenCalledWith("app");
    });
  });

  it("activates project list route when user navigates from an app route to projects", async () => {
    const { spies, result } = renderUseRouteSync("/kanban", {
      selectedSession: null,
      sessionsLoading: false,
      appRoutes: [{ id: "builtin.kanban-board.view", route: "/kanban" }],
      appRoutesReady: true,
      viewMode: "app",
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith("builtin.kanban-board.view");
      expect(spies.setViewMode).toHaveBeenCalledWith("app");
    });

    spies.setViewMode.mockClear();
    spies.setSelectedProject.mockClear();
    spies.setActiveAppViewId.mockClear();

    act(() => {
      result.current.navigateToProjects();
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith(null);
      expect(spies.setSelectedProject).toHaveBeenCalledWith(null);
      expect(spies.setViewMode).toHaveBeenCalledWith("project");
    });
  });
});
