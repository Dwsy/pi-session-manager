// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SessionTimelineNav from "./SessionTimelineNav";
import { triggerTimelineHoverHaptic } from "@/utils/timelineHaptics";

vi.mock("@/utils/timelineHaptics", () => ({ triggerTimelineHoverHaptic: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockTrackGeometry(firstTop = () => 100, left = 300) {
  const dots = screen.getAllByRole("button", { name: /Jump to user message/ });
  dots.forEach((dot, index) => {
    vi.spyOn(dot, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(left, firstTop() + index * 14, 36, 14),
    );
  });
  return { dots, track: dots[0].parentElement! };
}

describe("SessionTimelineNav", () => {
  const createItems = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      entryId: `user-${index}`,
      index,
      preview: `Prompt ${index}`,
      top: count === 1 ? 0 : index / (count - 1),
    }));

  it("hides navigation when there are fewer than two messages", () => {
    const onNavigate = vi.fn();
    const view = render(<SessionTimelineNav items={[]} activeEntryId={null} onNavigate={onNavigate} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    view.rerender(<SessionTimelineNav items={createItems(1)} activeEntryId="user-0" onNavigate={onNavigate} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    view.rerender(<SessionTimelineNav items={createItems(2)} activeEntryId="user-0" onNavigate={onNavigate} />);
    expect(screen.getByRole("navigation")).not.toBeNull();
  });

  it("shows an anchored rich preview, haptics, and working navigation", () => {
    const onNavigate = vi.fn();
    const items = createItems(3);
    items[1] = { ...items[1], title: "合并 goal tool", excerpt: "通过渐进式导出定义 action 模式" } as typeof items[number];
    render(<SessionTimelineNav items={items} activeEntryId="user-1" onNavigate={onNavigate} />);

    const { dots, track } = mockTrackGeometry();
    fireEvent.mouseMove(track, { clientY: 121 });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("合并 goal tool");
    expect(tooltip.textContent).not.toContain("AI 回复");
    expect(tooltip.textContent).toContain("通过渐进式导出定义 action 模式");
    expect(tooltip.querySelector("svg.lucide-plus")).toBeNull();
    expect(tooltip.className).toContain("pointer-events-auto");
    expect(tooltip.querySelector(".text-sm")).not.toBeNull();
    expect(tooltip.style.width).toBe("276px");
    expect(tooltip.style.top).toBe("121px");
    expect(tooltip.style.right).toBe(`${window.innerWidth - 300 + 8}px`);
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation").className).toContain("right-0");
    fireEvent.click(dots[2]);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onNavigate).toHaveBeenLastCalledWith("user-2");
    fireEvent.click(screen.getByRole("button", { name: /previous user message/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("user-0");
    fireEvent.click(screen.getByRole("button", { name: /next user message/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("user-2");
  });

  it("shows a pending state instead of borrowing a reply from another turn", () => {
    render(<SessionTimelineNav items={createItems(2)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    const { track } = mockTrackGeometry();
    fireEvent.mouseMove(track, { clientY: 107 });
    const preview = screen.getByRole("tooltip");
    expect(preview.textContent).toContain("Prompt 0");
    expect(preview.textContent).toContain("本轮暂无最终回答");
    expect(preview.textContent).not.toContain("Prompt 1");
  });

  it("keeps the preview while crossing the gap and hovering the card", () => {
    render(<SessionTimelineNav items={createItems(3)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    vi.useFakeTimers();
    try {
      const { track } = mockTrackGeometry();
      fireEvent.mouseMove(track, { clientY: 121 });
      const preview = screen.getByRole("tooltip");
      fireEvent.mouseLeave(track);
      expect(screen.getByRole("tooltip")).toBe(preview);
      act(() => vi.advanceTimersByTime(100));
      fireEvent.mouseEnter(preview);
      fireEvent.mouseMove(preview, { clientY: 133 });
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("tooltip")).toBe(preview);
      expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(1);
      fireEvent.mouseLeave(preview);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits only each changed landing, even for rapid jumps and reversals", () => {
    render(<SessionTimelineNav items={createItems(6)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    const { dots, track } = mockTrackGeometry();

    fireEvent.mouseMove(track, { clientY: 107 });
    fireEvent.mouseMove(dots[0].firstElementChild!, { clientY: 109 });
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(1);

    fireEvent.mouseMove(track, { clientY: 171 });
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 5");

    fireEvent.mouseMove(track, { clientY: 114 });
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 1");

    fireEvent.mouseLeave(track);
    fireEvent.mouseMove(track, { clientY: 114 });
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(4);
  });

  it("maps a partially visible track against the scrolled tick positions", () => {
    render(<SessionTimelineNav items={createItems(20)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    const trackTop = 200;
    let scrollOffset = 35;
    const { track } = mockTrackGeometry(() => trackTop - scrollOffset);
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue(new DOMRect(300, trackTop, 36, 70));

    // The viewport starts halfway through tick 2. The same coordinate
    // lands on tick 5 once the content scrolls another three ticks.
    fireEvent.mouseMove(track, { clientY: 202 });
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 2");
    expect(screen.getByRole("tooltip").style.top).toBe("200px");
    scrollOffset += 42;
    fireEvent.scroll(track);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(1);

    fireEvent.mouseMove(track, { clientY: 202 });
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 5");
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(2);
  });

  it("keeps native button focus and activation separate from haptic landings", () => {
    const onNavigate = vi.fn();
    render(<SessionTimelineNav items={createItems(3)} activeEntryId="user-0" onNavigate={onNavigate} />);
    const { dots } = mockTrackGeometry();

    act(() => dots[0].focus());
    expect(document.activeElement).toBe(dots[0]);
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 0");
    act(() => dots[2].focus());
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 2");
    // Native keyboard activation delivers a click with detail 0.
    fireEvent.click(dots[2], { detail: 0 });
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("user-2");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(triggerTimelineHoverHaptic).not.toHaveBeenCalled();
  });

  it("samples long timelines but keeps the last message reachable", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <SessionTimelineNav items={createItems(100)} activeEntryId="user-0" onNavigate={onNavigate} />,
    );
    expect(screen.getAllByRole("button", { name: /Jump to user message/ })).toHaveLength(60);
    expect(container.querySelector(".overflow-y-auto")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jump to user message: Prompt 99" }));
    expect(onNavigate).toHaveBeenCalledWith("user-99");
  });
});
