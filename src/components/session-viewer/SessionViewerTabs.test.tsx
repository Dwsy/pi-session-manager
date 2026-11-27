// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("@/transport", () => ({
  isTauri: () => false,
}));

const copyTextMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/hooks/useClipboard", () => ({
  useClipboard: () => ({ copyText: copyTextMock }),
}));

import SessionViewerTabs, {
  type SessionViewerTabsProps,
} from "./SessionViewerTabs";
import type { SessionInfo } from "@/types";

afterEach(cleanup);

function makeSession(id: string, name?: string): SessionInfo {
  return {
    path: `/tmp/${id}.jsonl`,
    id,
    name,
    cwd: "/tmp",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    message_count: 0,
    first_message: "",
    last_message: "",
    last_message_role: "",
  };
}

const A = makeSession("alpha-session", "Alpha");
const B = makeSession("beta-session");

function baseProps(): SessionViewerTabsProps {
  return {
    tabs: [A, B],
    activeTabId: "alpha-session",
    isMobile: false,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };
}

function getStrip(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[data-session-tabs]");
}

describe("SessionViewerTabs", () => {
  it("renders nothing with a single open tab", () => {
    const { container } = render(
      <SessionViewerTabs {...baseProps()} tabs={[A]} />,
    );
    expect(getStrip(container)).toBeNull();
  });

  it("renders nothing on mobile", () => {
    const { container } = render(
      <SessionViewerTabs {...baseProps()} isMobile />,
    );
    expect(getStrip(container)).toBeNull();
  });

  it("shows explicit names and falls back to the file name", () => {
    const { container } = render(<SessionViewerTabs {...baseProps()} />);

    expect(screen.getByTitle("Alpha")).toBeTruthy();
    expect(screen.getByTitle("beta-session")).toBeTruthy();
    expect(getStrip(container)).toBeTruthy();
  });

  it("marks the active tab with aria-current", () => {
    render(<SessionViewerTabs {...baseProps()} />);

    expect(screen.getByTitle("Alpha").getAttribute("aria-current")).toBe(
      "true",
    );
    expect(screen.getByTitle("beta-session").getAttribute("aria-current")).toBeNull();
  });

  it("selects a tab on click", () => {
    const props = baseProps();
    render(<SessionViewerTabs {...props} />);

    fireEvent.click(screen.getByTitle("beta-session"));

    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onSelect.mock.calls[0][0].id).toBe("beta-session");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes a tab from its close button without selecting it", () => {
    const props = baseProps();
    render(<SessionViewerTabs {...props} />);

    const closeButtons = screen.getAllByLabelText("Close tab");
    // Buttons render in tab order: [Alpha close, beta close].
    fireEvent.click(closeButtons[1]);

    expect(props.onClose).toHaveBeenCalledWith("beta-session");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("closes a tab on middle click", () => {
    const props = baseProps();
    const { container } = render(<SessionViewerTabs {...props} />);

    const strip = getStrip(container)!;
    const wrappers = strip.querySelectorAll("[data-active]");
    // Active wrapper carries data-active; reach the inactive one by position.
    const inactiveWrapper = strip.children[1] as HTMLElement;
    expect(wrappers.length).toBeGreaterThan(0);
    fireEvent(
      inactiveWrapper,
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );

    expect(props.onClose).toHaveBeenCalledWith("beta-session");
  });

  it("shows a live indicator with accessible text for live sessions", () => {
    const { container } = render(
      <SessionViewerTabs {...baseProps()} liveSessionIds={new Set(["beta-session"])} />,
    );

    expect(container.textContent).toContain("Live");
    // The dot itself must not pollute the accessible name.
    const liveTab = screen.getByTitle("beta-session");
    expect(liveTab.textContent).toContain("Live");
  });

  it("opens browser-style right-click context menu with accurate disabled states", () => {
    const C = makeSession("gamma-session", "Gamma");
    const props: SessionViewerTabsProps = {
      ...baseProps(),
      tabs: [A, B, C],
      onCloseOthers: vi.fn(),
      onCloseToLeft: vi.fn(),
      onCloseToRight: vi.fn(),
      onCloseAll: vi.fn(),
      onTogglePin: vi.fn(),
      onReopenClosed: vi.fn(),
      canReopenClosedTab: false,
    };

    render(<SessionViewerTabs {...props} />);

    // Right-click the first tab ("Alpha"): no tabs to the left, reopen disabled.
    fireEvent.contextMenu(screen.getByTitle("Alpha"));

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(
      (screen.getByRole("menuitem", { name: "Close tabs to the left" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("menuitem", { name: "Close tabs to the right" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("menuitem", { name: "Reopen closed tab" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("menuitem", { name: "Close tabs to the right" }));
    expect(props.onCloseToRight).toHaveBeenCalledWith("alpha-session");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("hides close button and ignores middle-click on pinned tabs, and allows unpinning via menu", () => {
    const props: SessionViewerTabsProps = {
      ...baseProps(),
      pinnedTabIds: new Set(["alpha-session"]),
      onTogglePin: vi.fn(),
    };

    const { container } = render(<SessionViewerTabs {...props} />);
    const strip = getStrip(container)!;
    const pinnedWrapper = strip.children[0] as HTMLElement;

    expect(pinnedWrapper.getAttribute("data-pinned")).toBe("true");
    // Only beta-session should have an inline close button.
    expect(screen.getAllByLabelText("Close tab")).toHaveLength(1);

    fireEvent(
      pinnedWrapper,
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByTitle("Alpha"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin tab" }));
    expect(props.onTogglePin).toHaveBeenCalledWith("alpha-session");
  });

  it("dismisses context menu on Escape and supports right-click on empty strip", () => {
    const props: SessionViewerTabsProps = {
      ...baseProps(),
      canReopenClosedTab: true,
      onReopenClosed: vi.fn(),
      onCloseAll: vi.fn(),
    };

    const { container } = render(<SessionViewerTabs {...props} />);
    const strip = getStrip(container)!;

    fireEvent.contextMenu(strip);
    const menu = screen.getByRole("menu");
    expect(screen.getByRole("menuitem", { name: "Reopen closed tab" })).toBeTruthy();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(strip);
    fireEvent.click(screen.getByRole("menuitem", { name: "Reopen closed tab" }));
    expect(props.onReopenClosed).toHaveBeenCalledTimes(1);
  });
});
