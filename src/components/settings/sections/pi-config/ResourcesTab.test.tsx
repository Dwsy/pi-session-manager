// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectResourceTrust, ResourceInfo } from "@/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/transport", () => ({
  invoke: mocks.invoke,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrOptions?: string | Record<string, unknown>,
    ): string => {
      if (typeof fallbackOrOptions === "string") return fallbackOrOptions;
      const options = fallbackOrOptions ?? {};
      const template =
        typeof options.defaultValue === "string" ? options.defaultValue : key;
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options[name] ?? ""),
      );
    },
  }),
}));

import ResourcesTab from "./ResourcesTab";

const userSkill: ResourceInfo = {
  name: "Demo skill",
  path: "skills/demo/SKILL.md",
  description: "A test skill",
  enabled: true,
  state: "inherit",
  resourceType: "skills",
  metadata: {
    source: "local",
    scope: "user",
    origin: "top-level",
    discovery: "pi",
    baseDir: "/tmp/.pi/agent",
  },
};

const projectSkill: ResourceInfo = {
  ...userSkill,
  name: "Project skill",
  metadata: {
    ...userSkill.metadata,
    scope: "project",
    baseDir: "/tmp/project/.pi",
  },
};

const lockedTrust: ProjectResourceTrust = {
  cwd: "/tmp/project",
  required: true,
  trusted: false,
  decision: null,
};

afterEach(cleanup);

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe("ResourcesTab", () => {
  it("writes an explicit disabled override from the tri-state control", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "scan_all_resources") return [userSkill];
      if (command === "set_resource_state") return null;
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<ResourcesTab />);

    expect(await screen.findByText("Demo skill")).toBeTruthy();
    const overrideGroup = screen.getByRole("group", {
      name: "Override for Demo skill",
    });
    fireEvent.click(within(overrideGroup).getByRole("button", { name: "Off" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("set_resource_state", {
        resourceType: "skills",
        path: "skills/demo/SKILL.md",
        state: "disabled",
        scope: "user",
        cwd: null,
        origin: "top-level",
        source: "local",
      });
    });
  });

  it("requires an explicit trust action before project resources are unlocked", async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === "scan_all_resources") return [projectSkill];
      if (command === "get_project_resource_trust") return lockedTrust;
      if (command === "set_project_resource_trust") {
        return { ...lockedTrust, trusted: true, decision: true };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    render(<ResourcesTab cwd="/tmp/project" />);

    expect(await screen.findByText("Project resources locked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trust project" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("set_project_resource_trust", {
        cwd: "/tmp/project",
        trusted: true,
      });
    });
  });
});
