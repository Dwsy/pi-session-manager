import { describe, expect, it } from "vitest";

import type { SessionInfo } from "@/types";
import {
  normalizeDashboardTimeSelection,
  shiftDashboardWeekSelection,
} from "./dashboardTimeRange";

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

describe("dashboard week selection", () => {
  it("moves a week in either direction across year boundaries", () => {
    expect(
      shiftDashboardWeekSelection(
        { granularity: "week", year: 2025, month: 12, day: 29 },
        1,
      ),
    ).toEqual({ granularity: "week", year: 2026, month: 1, day: 5 });
  });

  it("keeps a navigated week even when that year has no session data", () => {
    expect(
      normalizeDashboardTimeSelection([session], {
        granularity: "week",
        year: 2027,
        month: 1,
        day: 4,
      }),
    ).toEqual({ granularity: "week", year: 2027, month: 1, day: 4 });
  });
});
