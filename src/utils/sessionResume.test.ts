import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionInfo } from "@/types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  settings: {
    terminal: {
      defaultTerminal: "terminal",
      customTerminalCommand: "",
      piCommandPath: "/custom/pi",
      resumeCommand: "",
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
  detectPlatform: () => "macos",
  getPlatformDefaults: () => ({ defaultTerminal: "terminal" }),
}));

import {
  buildOmpResumeCommand,
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
});
