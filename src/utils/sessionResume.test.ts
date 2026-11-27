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
  buildCopyResumeCommand,
  buildCopyResumeCommandForTarget,
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

  it("uses native resume command for Antigravity CLI without triggering conversion", async () => {
    const agySession = {
      id: "901d1db7-8590-4cb0-a7cb-35fac369d860",
      path: "/Users/demo/.gemini/antigravity-cli/brain/901d1db7-8590-4cb0-a7cb-35fac369d860/.system_generated/logs/transcript_full.jsonl",
      cwd: "/Users/demo/project",
    } as SessionInfo;

    mocks.invoke.mockResolvedValueOnce({
      source_provider: "antigravity",
      source_display_name: "Antigravity",
      session_id: agySession.id,
      cwd: agySession.cwd,
      can_native_resume: true,
      cli_installed: true,
      resume_command: "cd '/Users/demo/project' && agy --conversation 901d1db7-8590-4cb0-a7cb-35fac369d860",
      raw_command: "agy --conversation 901d1db7-8590-4cb0-a7cb-35fac369d860",
      reason: null,
      carry_options: [],
    });

    const cmd = await buildCopyResumeCommand(agySession);
    expect(cmd).toBe("cd '/Users/demo/project' && agy --conversation 901d1db7-8590-4cb0-a7cb-35fac369d860");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("get_session_resume_info", { path: agySession.path });
  });

  it("uses zero-conversion omp --fork when carrying a Pi session to OMP", async () => {
    const piSession = {
      id: "pi-1",
      path: "/Users/demo/.pi/agent/sessions/proj/2026_pi-1.jsonl",
      cwd: "/Users/demo/project",
    } as SessionInfo;

    mocks.invoke.mockResolvedValueOnce({
      source_provider: "pi",
      source_display_name: "Pi",
      session_id: piSession.id,
      cwd: piSession.cwd,
      can_native_resume: true,
      cli_installed: true,
      resume_command: "cd '/Users/demo/project' && pi --session '/Users/demo/.pi/agent/sessions/proj/2026_pi-1.jsonl'",
      raw_command: "pi --session '/Users/demo/.pi/agent/sessions/proj/2026_pi-1.jsonl'",
      reason: null,
      carry_options: [
        {
          target_provider: "omp",
          target_display_name: "OMP",
          command: "cd '/Users/demo/project' && omp --fork '/Users/demo/.pi/agent/sessions/proj/2026_pi-1.jsonl'",
          zero_conversion: true,
        },
      ],
    });

    const cmd = await buildCopyResumeCommandForTarget(piSession, "omp");
    expect(cmd).toBe("cd '/Users/demo/project' && omp --fork '/Users/demo/.pi/agent/sessions/proj/2026_pi-1.jsonl'");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
