// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionInfo } from "@/types";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  getRuntimeStats: vi.fn(() => new Promise(() => {})),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: "en-US" },
  }),
}));

vi.mock("@/runtime-data/sessionSource", () => ({
  getRuntimeStats: mocks.getRuntimeStats,
  getRuntimeDayStats: vi.fn(),
}));

vi.mock("@/components/session-preview/SessionPreviewModal", () => ({
  default: () => null,
}));

vi.mock("@/utils/sessionPreviewActions", () => ({
  buildSessionPreviewModalActions: vi.fn(),
}));

const session: SessionInfo = {
  id: "session-1",
  path: "/sessions/session-1.jsonl",
  cwd: "/projects/pi-session-manager",
  name: "Session 1",
  created: "2026-07-01T10:00:00.000Z",
  modified: "2026-07-01T10:01:00.000Z",
  message_count: 1,
  first_message: "Hello",
  last_message: "World",
  last_message_role: "assistant",
};

describe("Dashboard startup loading", () => {
  it("shows a loading state while the initial session scan has not completed", () => {
    render(<Dashboard sessions={[]} loading />);

    expect(
      screen.getByRole("status", { name: "Loading dashboard..." }),
    ).toBeTruthy();
  });

  it("does not render a blank placeholder while the first statistics request is pending", () => {
    render(<Dashboard sessions={[session]} loading={false} />);

    expect(
      screen.getByRole("status", { name: "Loading dashboard..." }),
    ).toBeTruthy();
  });
});
