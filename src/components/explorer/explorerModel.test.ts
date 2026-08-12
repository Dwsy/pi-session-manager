import { describe, expect, it } from "vitest";

import type { SessionInfo } from "@/types";
import {
  buildExplorerProjects,
  nextExplorerSort,
  sortExplorerProjects,
  sortExplorerSessions,
  type ExplorerSessionSortKey,
  type ExplorerSortDirection,
} from "./explorerModel";

const LABELS = { untitled: "Untitled", unknownProject: "Unknown" };

function session(overrides: Partial<SessionInfo> & Pick<SessionInfo, "id">): SessionInfo {
  return {
    path: `/sessions/${overrides.id}.jsonl`,
    cwd: "/repo/alpha",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
    message_count: 0,
    first_message: "",
    last_message: "",
    last_message_role: "assistant",
    ...overrides,
  };
}

describe("buildExplorerProjects", () => {
  it("groups sessions by working directory and aggregates counters", () => {
    const projects = buildExplorerProjects(
      [
        session({ id: "a", cwd: "/repo/alpha", message_count: 3, modified: "2026-02-01T00:00:00.000Z" }),
        session({ id: "b", cwd: "/repo/alpha/", message_count: 5, modified: "2026-03-01T00:00:00.000Z", isLive: true }),
        session({ id: "c", cwd: "/repo/beta", message_count: 1 }),
      ],
      new Set(["c"]),
    );

    expect(projects).toEqual([
      {
        path: "/repo/alpha",
        name: "alpha",
        sessionCount: 2,
        messageCount: 8,
        lastModified: Date.parse("2026-03-01T00:00:00.000Z"),
        liveCount: 1,
      },
      {
        path: "/repo/beta",
        name: "beta",
        sessionCount: 1,
        messageCount: 1,
        lastModified: Date.parse("2026-01-01T00:00:00.000Z"),
        liveCount: 1,
      },
    ]);
  });

  it("keeps sessions without a working directory in one unknown bucket", () => {
    const projects = buildExplorerProjects([
      session({ id: "a", cwd: "" }),
      session({ id: "b", cwd: "" }),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ path: "", name: "", sessionCount: 2 });
  });
});

describe("sortExplorerSessions", () => {
  const sessions = [
    session({ id: "b", name: "Beta", message_count: 10, modified: "2026-01-02T00:00:00.000Z" }),
    session({ id: "a", name: "Alpha", message_count: 2, modified: "2026-01-03T00:00:00.000Z" }),
    session({ id: "c", name: "Gamma", message_count: 6, modified: "2026-01-01T00:00:00.000Z" }),
  ];

  it("sorts by updated time descending by default direction", () => {
    expect(
      sortExplorerSessions(sessions, "updated", "desc", LABELS).map((item) => item.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("sorts by title and message count", () => {
    expect(sortExplorerSessions(sessions, "title", "asc", LABELS).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      sortExplorerSessions(sessions, "messages", "desc", LABELS).map((item) => item.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("falls back to the untitled label when a session has no name or first message", () => {
    const unnamed = [session({ id: "z" }), session({ id: "y", name: "Alpha" })];
    expect(sortExplorerSessions(unnamed, "title", "asc", LABELS).map((item) => item.id)).toEqual([
      "y",
      "z",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [...sessions];
    sortExplorerSessions(input, "title", "asc", LABELS);
    expect(input.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });
});

describe("sortExplorerProjects", () => {
  const projects = [
    { path: "/b", name: "beta", sessionCount: 1, messageCount: 30, lastModified: 20, liveCount: 0 },
    { path: "/a", name: "alpha", sessionCount: 9, messageCount: 10, lastModified: 10, liveCount: 0 },
  ];

  it("sorts by the requested key and direction", () => {
    expect(sortExplorerProjects(projects, "name", "asc").map((item) => item.name)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(sortExplorerProjects(projects, "sessions", "desc").map((item) => item.name)).toEqual([
      "alpha",
      "beta",
    ]);
    expect(sortExplorerProjects(projects, "updated", "desc").map((item) => item.name)).toEqual([
      "beta",
      "alpha",
    ]);
  });
});

describe("nextExplorerSort", () => {
  const natural = (key: ExplorerSessionSortKey): ExplorerSortDirection =>
    key === "updated" ? "desc" : "asc";

  it("flips direction when the active key is clicked again", () => {
    expect(nextExplorerSort({ key: "updated", direction: "desc" }, "updated", natural)).toEqual({
      key: "updated",
      direction: "asc",
    });
  });

  it("adopts the natural direction when switching keys", () => {
    expect(nextExplorerSort({ key: "title", direction: "desc" }, "updated", natural)).toEqual({
      key: "updated",
      direction: "desc",
    });
    expect(nextExplorerSort({ key: "updated", direction: "desc" }, "title", natural)).toEqual({
      key: "title",
      direction: "asc",
    });
  });
});
