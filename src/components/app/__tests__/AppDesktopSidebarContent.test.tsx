// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { projectViewRenderSpy, usePsmPluginUiMock } = vi.hoisted(() => ({
  projectViewRenderSpy: vi.fn(),
  usePsmPluginUiMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("@/plugins/runtime-host", () => ({
  PluginContributionBoundary: ({ children }: any) => children,
  PluginContributionSlot: ({ render }: any) => render(),
  usePsmPluginUi: usePsmPluginUiMock,
}));

vi.mock("@/components/session-list/SessionList", () => ({
  default: () => <div data-testid="fallback-session-list" />,
}));

vi.mock("@/components/project/ProjectList", () => ({
  default: () => <div data-testid="project-list" />,
}));

vi.mock("../AppPluginSidebarPane", () => ({
  default: () => <div data-testid="plugin-sidebar" />,
}));

import { AppPluginSurfaceDataProvider } from "../AppPluginSurfaceData";
import AppDesktopSidebarContent from "../AppDesktopSidebarContent";

const session = {
  id: "session-1",
  path: "/tmp/project/session-1.jsonl",
  cwd: "/tmp/project",
  name: "Project session",
  created: "2026-09-05T00:00:00.000Z",
  modified: "2026-09-05T01:00:00.000Z",
  message_count: 3,
  first_message: "first",
  last_message: "last",
  last_message_role: "assistant",
};

const projectSessionView = {
  id: "test.project-sessions",
  pluginId: "test.plugin",
  title: "Project grouping",
  modes: [
    { id: "day", title: "Day" },
    { id: "status", title: "Status" },
    { id: "label", title: "Labels" },
  ],
  render: (props: unknown) => projectViewRenderSpy(props),
};

function renderSidebar() {
  const onLoadMore = vi.fn();
  const surfaceData = {
    sessions: [session],
    tags: [],
    sessionTags: [],
    selectedSession: session,
    onSelectSession: vi.fn(),
  } as any;

  render(
    <AppPluginSurfaceDataProvider value={surfaceData}>
      <AppDesktopSidebarContent
        sidebarMode="project"
        selectedSession={session as any}
        onSelectSession={vi.fn()}
        activeAppViewId={null}
        sessions={[session] as any}
        selectedProject="/tmp/project"
        selectedProjectSummary={{ projectName: "project", sessionCount: 1 }}
        filteredSessions={[session] as any}
        sidebarSessions={[session] as any}
        sidebarLoading={false}
        sidebarHasMore
        sidebarLoadingMore={false}
        locateSelectedSessionTrigger={0}
        loading={false}
        getBadgeType={vi.fn() as any}
        listScrollRef={createRef<HTMLDivElement>()}
        sessionListCommonProps={{} as any}
        onLoadMoreSidebarSessions={onLoadMore}
        onSelectProject={vi.fn()}
        liveSessionIds={new Set()}
      />
    </AppPluginSurfaceDataProvider>,
  );

  return { onLoadMore };
}

afterEach(() => {
  cleanup();
  projectViewRenderSpy.mockReset();
  usePsmPluginUiMock.mockReset();
});

describe("AppDesktopSidebarContent project session view", () => {
  it("keeps the native session list as the default and forwards pagination to Tree modes", () => {
    projectViewRenderSpy.mockImplementation((props: any) => (
      <div data-testid="project-session-tree">{props.mode}</div>
    ));
    usePsmPluginUiMock.mockReturnValue({ projectSessionViews: [projectSessionView] });

    const { onLoadMore } = renderSidebar();

    const projectName = screen.getByText("project");
    const selector = screen.getByRole("combobox", { name: "Project session view" });
    const headerRoot = selector.parentElement?.parentElement;
    expect(headerRoot?.contains(projectName)).toBe(true);
    expect(headerRoot?.className).toContain("bg-background");
    expect(headerRoot?.className).not.toContain("bg-background/");
    expect(selector.className).toContain("bg-background");
    expect(selector.className).not.toContain("bg-background/");
    expect(Array.from((selector as HTMLSelectElement).options).map((option) => option.value)).toEqual([
      "list",
      "day",
      "status",
      "label",
    ]);
    expect((selector as HTMLSelectElement).value).toBe("list");
    expect(screen.getByTestId("fallback-session-list")).toBeTruthy();
    expect(projectViewRenderSpy).not.toHaveBeenCalled();

    fireEvent.change(selector, { target: { value: "day" } });
    expect(screen.queryByTestId("fallback-session-list")).toBeNull();
    expect(screen.getByTestId("project-session-tree").textContent).toBe("day");
    expect(projectViewRenderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectPath: "/tmp/project",
        sessionIds: ["session-1"],
        mode: "day",
        loading: false,
        loadingMore: false,
        hasMore: true,
        onLoadMore,
      }),
    );
    const firstProps = projectViewRenderSpy.mock.calls.at(-1)?.[0] as any;
    expect(firstProps.data.sessions).toEqual([session]);

    fireEvent.change(selector, { target: { value: "status" } });
    expect(screen.getByTestId("project-session-tree").textContent).toBe("status");
    expect(projectViewRenderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "status" }),
    );

    fireEvent.change(selector, { target: { value: "list" } });
    expect(screen.getByTestId("fallback-session-list")).toBeTruthy();
    expect(screen.queryByTestId("project-session-tree")).toBeNull();
  });
});
