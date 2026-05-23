// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
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

function renderUseRouteSync(path: string, selectedSession: SessionInfo | null) {
  const session = makeSession("target-session");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );

  return renderHook(
    () =>
      useRouteSync({
        selectedSession,
        sessions: [session],
        sessionsLoading: true,
        setSelectedSession: vi.fn(),
        setViewMode: vi.fn(),
        setSelectedProject: vi.fn(),
        setShowSettings: vi.fn(),
        setShowTerminal: vi.fn(),
        setShowFavorites: vi.fn(),
      }),
    { wrapper },
  );
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
});
