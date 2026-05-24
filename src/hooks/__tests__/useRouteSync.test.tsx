// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
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

function renderUseRouteSync(
  path: string,
  selectedSession: SessionInfo | null,
  overrides: Partial<Parameters<typeof useRouteSync>[0]> = {},
) {
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

  const hook = renderHook(
    () =>
      useRouteSync({
        selectedSession,
        sessions: [session],
        sessionsLoading: true,
        viewMode: "list",
        ...spies,
        appRoutes: [],
        appRoutesReady: true,
        ...overrides,
      }),
    { wrapper },
  );
  return { ...hook, spies };
}

describe("useRouteSync", () => {
  it("reports pending while a session URL has not been selected yet", () => {
    const { result } = renderUseRouteSync("/sessions/target-session", null);

    expect(result.current.pendingSessionRoute).toBe(true);
  });

  it("does not report pending once the URL session is selected", () => {
    const selectedSession = makeSession("target-session");
    const { result } = renderUseRouteSync(
      "/sessions/target-session",
      selectedSession,
    );

    expect(result.current.pendingSessionRoute).toBe(false);
  });

  it("activates a registered app route generically", async () => {
    const { spies } = renderUseRouteSync("/boards", null, {
      sessionsLoading: false,
      appRoutes: [{ id: "app.board", route: "/boards" }],
      appRoutesReady: true,
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith("app.board");
      expect(spies.setViewMode).toHaveBeenCalledWith("app");
    });
  });
});
