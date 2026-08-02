// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionInfo } from "@/types";
import { useTerminalScopes } from "./useTerminalScopes";

const makeSession = (id: string, cwd = "/tmp/project"): SessionInfo => ({
  id,
  path: `/sessions/${id}.jsonl`,
  cwd,
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-01T00:00:00.000Z",
  message_count: 1,
  first_message: "hello",
  last_message: "hello",
  last_message_role: "user",
});

const defaultOptions = {
  selectedSession: null,
  selectedProject: null,
  sessions: [makeSession("one")],
  standaloneDatasetRuntime: false,
  workspaceLabel: "Workspace",
};

describe("useTerminalScopes", () => {
  it("derives the current scope from the selected session", () => {
    const session = makeSession("selected", "/tmp/selected");
    const { result } = renderHook(() =>
      useTerminalScopes({ ...defaultOptions, selectedSession: session }),
    );

    expect(result.current.currentTerminalScope).toEqual({
      key: "session:selected",
      cwd: "/tmp/selected",
      label: "selected",
    });
  });

  it("opens the current project scope and tracks its pending command", () => {
    const { result } = renderHook(() =>
      useTerminalScopes({
        ...defaultOptions,
        selectedProject: "/tmp/project",
      }),
    );

    act(() => {
      result.current.openTerminalScope(
        { key: "project:/tmp/project", cwd: "/tmp/project", label: "project" },
        "pi",
      );
    });

    expect(result.current.showTerminal).toBe(true);
    expect(result.current.activeTerminalScopeKey).toBe("project:/tmp/project");
    expect(result.current.terminalScopeList).toEqual([
      { key: "project:/tmp/project", cwd: "/tmp/project", label: "project" },
    ]);
    expect(result.current.terminalPendingCommands["project:/tmp/project"]).toBe(
      "pi",
    );

    act(() => {
      result.current.clearTerminalPendingCommand("project:/tmp/project");
    });
    expect(result.current.terminalPendingCommands["project:/tmp/project"]).toBe(
      null,
    );
  });

  it("does not open when the terminal feature is disabled", () => {
    const { result } = renderHook(() => useTerminalScopes(defaultOptions));

    act(() => {
      result.current.toggleCurrentTerminalScope(false);
    });

    expect(result.current.showTerminal).toBe(false);
    expect(result.current.terminalScopeList).toEqual([]);
  });

  it("keeps the scope cache bounded and closes cleanly when disabled", () => {
    const { result } = renderHook(() => useTerminalScopes(defaultOptions));

    for (let index = 0; index < 6; index += 1) {
      act(() => {
        result.current.openTerminalScope({
          key: `scope:${index}`,
          cwd: `/tmp/${index}`,
          label: `Scope ${index}`,
        });
      });
    }

    expect(result.current.terminalScopeList).toHaveLength(5);

    act(() => {
      result.current.setTerminalMaximized(true);
    });
    expect(result.current.terminalMaximized).toBe(true);

    act(() => {
      result.current.handleBuiltinTerminalDisabled();
    });
    expect(result.current.showTerminal).toBe(false);
    expect(result.current.terminalMaximized).toBe(false);
  });
});
