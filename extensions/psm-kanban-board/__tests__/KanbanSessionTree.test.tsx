// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, Tag } from "@/types";
import KanbanSessionTree from "../sidebar/KanbanSessionTree";
import { createKanbanLabelsStore } from "../labels/kanbanLabelsStore";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) =>
      typeof fallbackOrOptions === "string" ? fallbackOrOptions : key,
  }),
}));

const status: Tag = {
  id: "doing",
  name: "Doing",
  color: "blue",
  sortOrder: 0,
  isBuiltin: false,
  createdAt: "2026-09-05T00:00:00.000Z",
};

const now = new Date();
const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
const yesterdayAtNoon = new Date(todayAtNoon);
yesterdayAtNoon.setDate(yesterdayAtNoon.getDate() - 1);

function localDayLabel(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const session: SessionInfo = {
  id: "session-1",
  path: "/tmp/session-1.jsonl",
  cwd: "/tmp/project",
  name: "Compact row",
  created: todayAtNoon.toISOString(),
  modified: todayAtNoon.toISOString(),
  message_count: 12,
  first_message: "first",
  last_message: "last message detail",
  last_message_role: "assistant",
};

const olderSession: SessionInfo = {
  ...session,
  id: "session-2",
  path: "/tmp/session-2.jsonl",
  name: "Older row",
  created: yesterdayAtNoon.toISOString(),
  modified: yesterdayAtNoon.toISOString(),
};

function createStore() {
  let stored: unknown = {
    version: 1,
    labels: [
      {
        id: "frontend",
        name: "frontend",
        color: "#0969da",
        description: "UI work",
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
    ],
    assignments: [{ sessionId: session.id, labelId: "frontend" }],
  };
  return createKanbanLabelsStore({
    psm: {
      config: {
        read: vi.fn(async () => stored),
        write: vi.fn(async (_key: string, value: unknown) => {
          stored = value;
        }),
      },
    },
  } as any);
}

afterEach(cleanup);

describe("KanbanSessionTree", () => {
  it("renders compact rows and groups the visible project sessions by host-selected mode", async () => {
    const onSelectSession = vi.fn();
    const labelsStore = createStore();
    const data = {
      sessions: [session, olderSession],
      tags: [status],
      sessionTags: [
        {
          sessionId: session.id,
          tagId: status.id,
          position: 0,
          assignedAt: todayAtNoon.toISOString(),
        },
      ],
      selectedSession: session,
      onSelectSession,
    };

    const { rerender } = render(
      <KanbanSessionTree
        labelsStore={labelsStore}
        data={data}
        sessionIds={[session.id, olderSession.id]}
        mode="day"
      />,
    );

    const todayToggle = screen.getByRole("button", {
      name: new RegExp(localDayLabel(todayAtNoon)),
    });
    const yesterdayToggle = screen.getByRole("button", {
      name: new RegExp(localDayLabel(yesterdayAtNoon)),
    });
    expect(todayToggle.getAttribute("aria-expanded")).toBe("true");
    expect(yesterdayToggle.getAttribute("aria-expanded")).toBe("false");

    let row = screen.getByRole("button", { name: /compact row/i });
    expect(row.getAttribute("title")).toBe("last message detail");
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.className).toContain("group");
    expect(screen.getByText("12").parentElement?.className).toContain(
      "group-hover:flex",
    );
    expect(screen.getByText("Compact row").className).toContain("text-[12px]");

    fireEvent.click(yesterdayToggle);
    const olderRow = screen.getByRole("button", { name: /older row/i });
    expect(olderRow.className).toContain("rounded-lg");
    expect(olderRow.className).toContain("hover:bg-secondary/50");
    fireEvent.click(yesterdayToggle);

    fireEvent.click(todayToggle);
    expect(screen.queryByRole("button", { name: /compact row/i })).toBeNull();
    fireEvent.click(todayToggle);
    row = screen.getByRole("button", { name: /compact row/i });
    expect(row).toBeTruthy();

    rerender(
      <KanbanSessionTree
        labelsStore={labelsStore}
        data={data}
        sessionIds={[session.id, olderSession.id]}
        mode="status"
      />,
    );
    const statusToggle = screen.getByRole("button", { name: /Doing/i });
    expect(statusToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /compact row/i })).toBeNull();
    fireEvent.click(statusToggle);
    expect(screen.getByRole("button", { name: /compact row/i })).toBeTruthy();

    const onLoadMore = vi.fn();
    rerender(
      <KanbanSessionTree
        labelsStore={labelsStore}
        data={data}
        sessionIds={[session.id, olderSession.id]}
        mode="label"
        hasMore
        onLoadMore={onLoadMore}
      />,
    );
    const labelToggle = await screen.findByRole("button", { name: /frontend/i });
    expect(labelToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /compact row/i })).toBeNull();
    fireEvent.click(labelToggle);
    expect((await screen.findAllByText("frontend")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /compact row/i }));
    expect(onSelectSession).toHaveBeenCalledWith(session);
  });
});
