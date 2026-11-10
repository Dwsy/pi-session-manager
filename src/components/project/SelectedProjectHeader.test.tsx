// @vitest-environment jsdom

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SelectedProjectHeader from "./SelectedProjectHeader";

const pluginUi = vi.hoisted(() => ({
  current: {
    projectIdentityProviders: [] as unknown[],
  },
}));

vi.mock("@/plugins/runtime-host", () => ({
  usePsmPluginSessionUi: () => pluginUi.current,
  usePsmPluginUi: () => pluginUi.current,
  PluginContributionBoundary: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  PluginContributionSlot: ({ render }: { render: () => ReactNode }) => (
    <>{render()}</>
  ),
}));

const renderHeader = (projectName: string, projectPath?: string) =>
  render(
    <SelectedProjectHeader
      projectName={projectName}
      projectPath={projectPath}
      sessionCount={3}
      onBack={() => undefined}
      backLabel="Back"
    />,
  );

describe("SelectedProjectHeader", () => {
  afterEach(() => {
    pluginUi.current = { projectIdentityProviders: [] };
  });

  it("keeps the directory basename when no provider matches", () => {
    renderHeader("bw-platform");

    expect(screen.getByText("bw-platform")).toBeTruthy();
  });

  it("renders the plugin identity label for a long agent directory", () => {
    pluginUi.current = {
      projectIdentityProviders: [
        {
          id: "p.bot",
          pluginId: "builtin.project-identity",
          priority: 100,
          resolve: () => ({ label: "zero", subtitle: "OpenBot agent" }),
        },
      ],
    };

    renderHeader(
      "agent-da66bdca-0664-440c-a271-585ab5c62164",
      "/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164",
    );

    expect(screen.getByText("zero")).toBeTruthy();
    expect(screen.getByTitle("OpenBot agent")).toBeTruthy();
    expect(
      screen.queryByText("agent-da66bdca-0664-440c-a271-585ab5c62164"),
    ).toBeNull();
  });
});
