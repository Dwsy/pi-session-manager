// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppPluginSurfaceDataProvider } from "@/components/app/AppPluginSurfaceData";
import type { AppPluginSurfaceData } from "@/components/app/AppPluginSurfaceData";
import KanbanSessionMetadataMenu from "../sidebar/KanbanSessionMetadataMenu";
import { createKanbanLabelsStore } from "../labels/kanbanLabelsStore";
import type { KanbanLabelsStore } from "../labels/kanbanLabelsStore";
import type { Tag } from "@/types";
import type { PsmSessionContextMenuActionRenderProps } from "@pi-session-manager/plugin-sdk";
import type { PsmPluginHostContext } from "@pi-session-manager/plugin-sdk";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

function createLabelsStore(): KanbanLabelsStore {
  return createKanbanLabelsStore({
    psm: {
      config: {
        read: vi.fn(async () => ({ version: 1, labels: [], assignments: [] })),
        write: vi.fn(async () => undefined),
      },
    },
  } as unknown as PsmPluginHostContext);
}

function createStatusTag(id: string, name: string, color: string, sortOrder: number): Tag {
  return {
    id,
    name,
    color,
    sortOrder,
    isBuiltin: true,
    createdAt: "2026-09-05T00:00:00.000Z",
  };
}

function createSurface(overrides: Partial<AppPluginSurfaceData>): AppPluginSurfaceData {
  return {
    sessions: [],
    tags: [],
    sessionTags: [],
    selectedSession: null,
    onSelectSession: vi.fn(),
    onMoveSession: vi.fn(),
    onClearSessionStatus: vi.fn(),
    getTagsForSession: () => [],
    onToggleTag: vi.fn(),
    getDescendantIds: () => [],
    sourceOptions: [],
    onClearSelectedSession: vi.fn(),
    ...overrides,
  };
}

function createSession(): PsmSessionContextMenuActionRenderProps["session"] {
  return {
    id: "session-1",
    path: "/tmp/session-1.jsonl",
    cwd: "/tmp/project",
  };
}

afterEach(cleanup);

describe("KanbanSessionMetadataMenu", () => {
  it("renders visible status names next to compact color dots", () => {
    const statuses = [
      createStatusTag("todo", "Todo", "warning", 0),
      createStatusTag("doing", "Doing", "info", 1),
      createStatusTag("done", "Done", "success", 2),
    ];
    const surface = createSurface({
      tags: statuses,
      sessionTags: [
        {
          sessionId: "session-1",
          tagId: "doing",
          position: 0,
          assignedAt: "2026-09-05T01:00:00.000Z",
        },
      ],
    });

    render(
      <AppPluginSurfaceDataProvider value={surface}>
        <KanbanSessionMetadataMenu
          session={createSession()}
          labelsStore={createLabelsStore()}
          close={vi.fn()}
          onActivate={vi.fn()}
        />
      </AppPluginSurfaceDataProvider>,
    );

    // Sections start collapsed; expand the Status section first.
    fireEvent.click(screen.getByRole("menuitem", { name: /status/i }));

    for (const name of ["Todo", "Doing", "Done"]) {
      const text = screen.getByText(name);
      expect(text.closest("button")?.textContent).toContain(name);
    }
  });

  it("keeps sections collapsed by default", () => {
    const surface = createSurface({
      tags: [createStatusTag("todo", "Todo", "warning", 0)],
    });

    render(
      <AppPluginSurfaceDataProvider value={surface}>
        <KanbanSessionMetadataMenu
          session={createSession()}
          labelsStore={createLabelsStore()}
          close={vi.fn()}
          onActivate={vi.fn()}
        />
      </AppPluginSurfaceDataProvider>,
    );

    expect(screen.queryByText("Todo")).toBeNull();
    expect(screen.getByRole("menuitem", { name: /status/i }).getAttribute("aria-expanded")).toBe("false");
  });
});
