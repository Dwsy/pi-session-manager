// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSessionBranchModel,
  type SessionEntry,
} from "@/utils/session-branch";

import { DEFAULT_BRANCH_MAP_SETTINGS } from "./settings";

vi.mock("./GlobalMapCanvas", () => ({
  GlobalMapCanvas: () => <div data-testid="atlas-canvas" />,
  clampView: (view: unknown) => view,
  fitMapViewToLayout: () => ({ zoom: 1, centerX: 0.5, centerY: 0.5 }),
}));

import { AtlasDialog } from "./AtlasDialog";

const MODEL = buildSessionBranchModel([
  {
    type: "message",
    id: "root",
    parentId: null,
    timestamp: "2026-07-14T00:00:00Z",
    message: { role: "user", content: [{ type: "text", text: "Root" }] },
  },
  {
    type: "message",
    id: "reply",
    parentId: "root",
    timestamp: "2026-07-14T00:00:01Z",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Reply" }],
    },
  },
] satisfies SessionEntry[]);

function renderDialog(onClose = vi.fn()): ReturnType<typeof render> {
  return render(
    <AtlasDialog
      open
      model={MODEL}
      activeLeafUid="reply"
      selectedUid="reply"
      settings={DEFAULT_BRANCH_MAP_SETTINGS}
      onSettingsChange={vi.fn()}
      onSelectNode={vi.fn()}
      onActivateNode={vi.fn()}
      onClose={onClose}
    />,
  );
}

afterEach(() => {
  document.querySelector(".app-shell")?.remove();
});

describe("AtlasDialog", () => {
  it("consumes Escape before host shortcuts can observe it", () => {
    const onClose = vi.fn();
    const hostShortcut = vi.fn();
    renderDialog(onClose);
    document.addEventListener("keydown", hostShortcut);

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    document.dispatchEvent(event);
    document.removeEventListener("keydown", hostShortcut);

    expect(onClose).toHaveBeenCalledOnce();
    expect(hostShortcut).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("uses a compact header and reserves macOS traffic-light clearance", () => {
    const appShell = document.createElement("div");
    appShell.className = "app-shell";
    appShell.dataset.runtime = "tauri";
    appShell.dataset.os = "macos";
    document.body.appendChild(appShell);

    renderDialog();

    expect(screen.queryByText("LINEAR ≠ HIERARCHY")).toBeNull();
    expect(
      screen
        .getByRole("dialog")
        .querySelector("header")
        ?.classList.contains("is-macos-tauri"),
    ).toBe(true);
    expect(
      screen
        .getByTitle("Focus selected entry (F)")
        .classList.contains("toolbar-button"),
    ).toBe(true);
  });
});
