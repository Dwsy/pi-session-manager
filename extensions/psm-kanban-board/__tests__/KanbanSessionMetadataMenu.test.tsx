// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppPluginSurfaceDataProvider } from "@/components/app/AppPluginSurfaceData";
import KanbanSessionMetadataMenu from "../sidebar/KanbanSessionMetadataMenu";
import { createKanbanLabelsStore } from "../labels/kanbanLabelsStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function createLabelsStore() {
  return createKanbanLabelsStore({
    psm: {
      config: {
        read: vi.fn(async () => ({ version: 1, labels: [], assignments: [] })),
        write: vi.fn(async () => undefined),
      },
    },
  } as any);
}

afterEach(cleanup);

describe("KanbanSessionMetadataMenu", () => {
  it("renders visible status names next to compact color dots", () => {
    const statuses = [
      { id: "todo", name: "Todo", color: "warning" },
      { id: "doing", name: "Doing", color: "info" },
      { id: "done", name: "Done", color: "success" },
    ].map((status, index) => ({
      ...status,
      sortOrder: index,
      isBuiltin: true,
      createdAt: "2026-09-05T00:00:00.000Z",
    }));
    const surface = {
      tags: statuses,
      sessionTags: [
        {
          sessionId: "session-1",
          tagId: "doing",
          position: 0,
          assignedAt: "2026-09-05T01:00:00.000Z",
        },
      ],
      onMoveSession: vi.fn(),
      onClearSessionStatus: vi.fn(),
    } as any;

    render(
      <AppPluginSurfaceDataProvider value={surface}>
        <KanbanSessionMetadataMenu
          session={{
            id: "session-1",
            path: "/tmp/session-1.jsonl",
            cwd: "/tmp/project",
          } as any}
          labelsStore={createLabelsStore()}
          close={vi.fn()}
          onActivate={vi.fn()}
        />
      </AppPluginSurfaceDataProvider>,
    );

    for (const name of ["Todo", "Doing", "Done"]) {
      const text = screen.getByText(name);
      expect(text.closest("button")?.textContent).toContain(name);
    }
  });
});
