import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionInfo } from "@/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  platform: "macos" as "macos" | "windows" | "linux",
  settings: {
    terminal: {
      defaultTerminal: "terminal",
      customTerminalCommand: "",
      piCommandPath: "/custom/pi",
      resumeCommand: "",
    },
    session: {
      runtimeEnvironment: "local" as "local" | "wsl",
      wslDistro: "",
    },
  },
}));

vi.mock("@/transport", () => ({
  invoke: mocks.invoke,
  isTauri: () => true,
}));

vi.mock("@/utils/settingsApi", () => ({
  getCachedSettings: () => mocks.settings,
}));

vi.mock("@/components/settings/types", () => ({
  detectPlatform: () => mocks.platform,
  getPlatformDefaults: () => ({ defaultTerminal: "terminal" }),
}));

import {
  buildOmpResumeCommand,
  buildPiResumeCommand,
  openSessionInTerminalDirect,
} from "./sessionResume";

const ompSession = {
  id: "019fd549-b2f3-7000-92d0-2852810e5160",
  path: "/Users/demo/.omp/agent/sessions/project/session.jsonl",
  cwd: "/Users/demo/project",
} as SessionInfo;

describe("OMP session resume", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.platform = "macos";
    mocks.settings.session.runtimeEnvironment = "local";
    mocks.settings.session.wslDistro = "";
  });

  it("always uses the omp binary instead of the configured Pi binary", () => {
    expect(
      buildOmpResumeCommand(ompSession, { piPath: "/custom/pi" }),
    ).toBe(
      'cd "/Users/demo/project" && omp --session "/Users/demo/.omp/agent/sessions/project/session.jsonl"',
    );
  });

  it("passes an OMP-specific command to the desktop terminal opener", async () => {
    await openSessionInTerminalDirect(ompSession, {
      piPath: "/custom/pi",
    });

    expect(mocks.invoke).toHaveBeenCalledWith("open_session_in_terminal", {
      path: ompSession.path,
      cwd: ompSession.cwd,
      terminal: "terminal",
      piPath: "omp",
      resumeCommand:
        'cd "/Users/demo/project" && omp --session "/Users/demo/.omp/agent/sessions/project/session.jsonl"',
    });
  });

  it("converts WSL UNC paths to Linux paths and uses Linux shell syntax", () => {
    mocks.platform = "windows";
    mocks.settings.session.runtimeEnvironment = "wsl";
    mocks.settings.session.wslDistro = "Ubuntu";
    const session = {
      ...ompSession,
      path: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\.omp\\agent\\sessions\\project\\session.jsonl",
      cwd: "/home/demo/project",
    } as SessionInfo;

    expect(buildOmpResumeCommand(session)).toBe(
      'cd "/home/demo/project" && omp --session "/home/demo/.omp/agent/sessions/project/session.jsonl"',
    );
  });

  it("uses the Linux pi command in WSL instead of a Windows-configured Pi path", () => {
    mocks.platform = "windows";
    mocks.settings.session.runtimeEnvironment = "wsl";
    mocks.settings.session.wslDistro = "Ubuntu";
    const session = {
      ...ompSession,
      path: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\.pi\\agent\\sessions\\project\\session.jsonl",
      cwd: "/home/demo/project",
    } as SessionInfo;

    expect(buildPiResumeCommand(session)).toBe(
      'cd "/home/demo/project" && pi --session "/home/demo/.pi/agent/sessions/project/session.jsonl"',
    );
  });
});
