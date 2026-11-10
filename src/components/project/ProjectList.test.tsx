// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo } from "@/types";
import ProjectList from "./ProjectList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === "project.list.count") return `${options?.count} projects`;
      if (key === "project.list.sessions") return "sessions";
      if (key === "session.list.messages") return "messages";
      return key;
    },
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 68,
      })),
    getTotalSize: () => count * 68,
    measureElement: () => undefined,
  }),
}));

vi.mock("@/hooks/useDelayedLoading", () => ({
  useDelayedLoading: () => false,
}));

const pluginUi = vi.hoisted(() => ({
  current: {
    projectListActions: [] as unknown[],
    projectIdentityProviders: [] as unknown[],
  },
}));

vi.mock("@/plugins/runtime-host", () => ({
  usePsmPluginUi: () => pluginUi.current,
  usePsmPluginSessionUi: () => pluginUi.current,
  PluginContributionBoundary: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  PluginContributionSlot: ({ render }: { render: () => ReactNode }) => (
    <>{render()}</>
  ),
}));

const session = (cwd: string): SessionInfo =>
  ({
    path: `${cwd}.jsonl`,
    id: "id",
    cwd,
    modified: "2026-08-06T10:00:00.000Z",
    message_count: 1,
  }) as SessionInfo;

describe("ProjectList", () => {
  afterEach(() => {
    pluginUi.current = { projectListActions: [], projectIdentityProviders: [] };
  });

  it("groups equivalent Windows cwd values and preserves the first cwd", () => {
    const firstCwd = "C:\\Code\\Foo\\";
    const equivalentCwd = "c:/code/foo";
    const onSelectProject = vi.fn();
    const sessions = [
      {
        path: "one.jsonl",
        id: "one",
        cwd: firstCwd,
        modified: "2026-08-06T10:00:00.000Z",
        message_count: 2,
      },
      {
        path: "two.jsonl",
        id: "two",
        cwd: equivalentCwd,
        modified: "2026-08-06T11:00:00.000Z",
        message_count: 3,
      },
    ] as SessionInfo[];

    render(
      <ProjectList
        sessions={sessions}
        loading={false}
        onSelectProject={onSelectProject}
      />,
    );

    expect(screen.getByText("1 projects")).toBeTruthy();
    expect(screen.getByText("2 sessions")).toBeTruthy();
    expect(screen.getByText("5 messages")).toBeTruthy();
    expect(screen.getAllByTitle(firstCwd)).toHaveLength(1);
    expect(screen.queryByTitle(equivalentCwd)).toBeNull();

    fireEvent.click(screen.getByTitle(firstCwd));
    expect(onSelectProject).toHaveBeenCalledWith(firstCwd);
  });

  it("keeps distinct Windows cwd values in separate projects", () => {
    const firstCwd = "C:\\Code\\Foo";
    const secondCwd = "C:\\Code\\Bar";
    const sessions = [
      {
        path: "one.jsonl",
        id: "one",
        cwd: firstCwd,
        modified: "2026-08-06T10:00:00.000Z",
        message_count: 1,
      },
      {
        path: "two.jsonl",
        id: "two",
        cwd: secondCwd,
        modified: "2026-08-06T11:00:00.000Z",
        message_count: 1,
      },
    ] as SessionInfo[];

    render(<ProjectList sessions={sessions} loading={false} />);

    expect(screen.getByText("2 projects")).toBeTruthy();
    expect(screen.getByTitle(firstCwd)).toBeTruthy();
    expect(screen.getByTitle(secondCwd)).toBeTruthy();
  });

  it("renders the identity supplied by a plugin provider", () => {
    pluginUi.current = {
      projectListActions: [],
      projectIdentityProviders: [
        {
          id: "p.bot",
          pluginId: "builtin.project-identity",
          priority: 100,
          resolve: () => ({
            label: "zero",
            subtitle: "OpenBot agent",
            avatar: { kind: "initial", value: "z", hue: 320 },
          }),
        },
      ],
    };

    render(
      <ProjectList
        sessions={[session("/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164")]}
        loading={false}
      />,
    );

    expect(screen.getByText("zero")).toBeTruthy();
    expect(screen.getByText("OpenBot agent")).toBeTruthy();
    expect(screen.getByText("Z")).toBeTruthy();
    // The raw directory name stays reachable as the path line, but not as the title.
    expect(
      screen.getAllByText("agent-da66bdca-0664-440c-a271-585ab5c62164"),
    ).toHaveLength(1);
  });

  it("hides the machine directory line when the provider owns the label", () => {
    pluginUi.current = {
      projectListActions: [],
      projectIdentityProviders: [
        {
          id: "p.bot",
          pluginId: "builtin.project-identity",
          priority: 100,
          resolve: () => ({ label: "zero", subtitle: "OpenBot agent", hidePath: true }),
        },
      ],
    };

    render(
      <ProjectList
        sessions={[session("/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164")]}
        loading={false}
      />,
    );

    expect(screen.getByText("zero")).toBeTruthy();
    expect(
      screen.queryByText("agent-da66bdca-0664-440c-a271-585ab5c62164"),
    ).toBeNull();
  });

  it("matches the search query against the plugin label", () => {
    pluginUi.current = {
      projectListActions: [],
      projectIdentityProviders: [
        {
          id: "p.bot",
          pluginId: "builtin.project-identity",
          priority: 100,
          resolve: ({ name }) => (name.startsWith("agent-") ? { label: "zero" } : null),
        },
      ],
    };

    render(
      <ProjectList
        sessions={[
          session("/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164"),
          session("/Users/dev/Work/bw-platform"),
        ]}
        loading={false}
        searchQuery="zero"
      />,
    );

    expect(screen.getByText("1 projects")).toBeTruthy();
    expect(screen.getByText("zero")).toBeTruthy();
    expect(screen.queryByText("bw-platform")).toBeNull();
  });
});
