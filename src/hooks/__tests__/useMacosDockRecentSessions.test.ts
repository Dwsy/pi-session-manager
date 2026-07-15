import { describe, expect, it } from "vitest";
import {
  type DockRecentSession,
  updateDockRecentSessions,
} from "../useMacosDockRecentSessions";

function recent(id: string): DockRecentSession {
  return { id, title: `Session ${id}` };
}

describe("updateDockRecentSessions", () => {
  it("moves a revisited session to the front without duplicating it", () => {
    expect(
      updateDockRecentSessions([recent("one"), recent("two")], {
        id: "two",
        title: "Updated title",
      }),
    ).toEqual([
      { id: "two", title: "Updated title" },
      recent("one"),
    ]);
  });

  it("keeps the five direct and ten More menu entries", () => {
    const current = Array.from({ length: 15 }, (_, index) =>
      recent(String(index + 1)),
    );

    const updated = updateDockRecentSessions(current, recent("new"));

    expect(updated).toHaveLength(15);
    expect(updated[0]).toEqual(recent("new"));
    expect(updated.at(-1)).toEqual(recent("14"));
  });

  it("normalizes blank and overly long titles", () => {
    expect(updateDockRecentSessions([], { id: " blank ", title: "   " })).toEqual([
      { id: "blank", title: "Untitled Session" },
    ]);
    expect(
      updateDockRecentSessions([], { id: "long", title: "x".repeat(100) })[0]
        .title,
    ).toHaveLength(80);
  });
});
