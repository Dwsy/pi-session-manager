import { describe, expect, it } from "vitest";

import type { SessionInfo } from "@/types";
import {
  summarizeSessionLibrary,
  topProjectsByActivity,
} from "./onboardingSummary";

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    path: "/tmp/session.jsonl",
    id: "session",
    cwd: "/repo/app",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    message_count: 1,
    first_message: "",
    last_message: "",
    last_message_role: "assistant",
    ...overrides,
  };
}

describe("summarizeSessionLibrary", () => {
  it("returns an empty summary when nothing was scanned", () => {
    expect(summarizeSessionLibrary([])).toEqual({
      sessionCount: 0,
      projectCount: 0,
      firstSessionAt: null,
    });
  });

  it("counts distinct projects rather than sessions", () => {
    const summary = summarizeSessionLibrary([
      session({ id: "a", cwd: "/repo/app" }),
      session({ id: "b", cwd: "/repo/app" }),
      session({ id: "c", cwd: "/repo/docs" }),
    ]);

    expect(summary.sessionCount).toBe(3);
    expect(summary.projectCount).toBe(2);
  });

  it("ignores blank working directories", () => {
    const summary = summarizeSessionLibrary([
      session({ id: "a", cwd: "" }),
      session({ id: "b", cwd: "   " }),
      session({ id: "c", cwd: "/repo/app" }),
    ]);

    expect(summary.projectCount).toBe(1);
  });

  it("picks the oldest creation time regardless of input order", () => {
    const summary = summarizeSessionLibrary([
      session({ id: "a", created: "2026-05-02T10:00:00.000Z" }),
      session({ id: "b", created: "2025-11-20T08:30:00.000Z" }),
      session({ id: "c", created: "2026-02-14T12:00:00.000Z" }),
    ]);

    expect(summary.firstSessionAt?.toISOString()).toBe(
      "2025-11-20T08:30:00.000Z",
    );
  });

  it("skips sessions with unparsable timestamps", () => {
    const summary = summarizeSessionLibrary([
      session({ id: "a", created: "not-a-date" }),
      session({ id: "b", created: "2026-03-03T00:00:00.000Z" }),
    ]);

    expect(summary.sessionCount).toBe(2);
    expect(summary.firstSessionAt?.toISOString()).toBe(
      "2026-03-03T00:00:00.000Z",
    );
  });
});

describe("topProjectsByActivity", () => {
  it("ranks projects by session count and honours the limit", () => {
    const projects = topProjectsByActivity(
      [
        session({ id: "a", cwd: "/repo/docs" }),
        session({ id: "b", cwd: "/repo/app" }),
        session({ id: "c", cwd: "/repo/app" }),
        session({ id: "d", cwd: "/repo/infra" }),
        session({ id: "e", cwd: "/repo/app" }),
        session({ id: "f", cwd: "/repo/docs" }),
      ],
      2,
    );

    expect(projects).toEqual([
      { path: "/repo/app", name: "app", sessionCount: 3 },
      { path: "/repo/docs", name: "docs", sessionCount: 2 },
    ]);
  });

  it("groups paths that differ only by a trailing separator", () => {
    const projects = topProjectsByActivity(
      [
        session({ id: "a", cwd: "/repo/app" }),
        session({ id: "b", cwd: "/repo/app/" }),
      ],
      5,
    );

    expect(projects).toHaveLength(1);
    expect(projects[0].sessionCount).toBe(2);
  });

  it("returns nothing when no session has a working directory", () => {
    expect(topProjectsByActivity([session({ cwd: "" })], 5)).toEqual([]);
  });
});
