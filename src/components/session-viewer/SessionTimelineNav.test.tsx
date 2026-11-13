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

    const dots = screen.getAllByRole("button", { name: /Jump to user message/ });
    fireEvent.mouseEnter(dots[1]);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("合并 goal tool");
    expect(tooltip.textContent).not.toContain("AI 回复");
    expect(tooltip.textContent).toContain("通过渐进式导出定义 action 模式");
    expect(tooltip.querySelector("svg.lucide-plus")).toBeNull();
    expect(tooltip.className).toContain("pointer-events-auto");
    expect(tooltip.querySelector(".text-sm")).not.toBeNull();
    expect(tooltip.getAttribute("style")).toContain("width: 180px");
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
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Jump to user message: Prompt 0" }));
    const preview = screen.getByRole("tooltip");
    expect(preview.textContent).toContain("Prompt 0");
    expect(preview.textContent).toContain("本轮暂无最终回答");
    expect(preview.textContent).not.toContain("Prompt 1");
  });

  it("keeps the preview while crossing the gap and hovering the card", () => {
    render(<SessionTimelineNav items={createItems(3)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    vi.useFakeTimers();
    try {
      const dots = screen.getAllByRole("button", { name: /Jump to user message/ });
      fireEvent.mouseEnter(dots[1]);
      const preview = screen.getByRole("tooltip");
      fireEvent.mouseLeave(dots[1]);
      expect(screen.getByRole("tooltip")).toBe(preview);
      fireEvent.mouseEnter(preview);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("tooltip")).toBe(preview);
      fireEvent.mouseLeave(preview);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("triggers haptics on every newly hovered dot, including rapid changes", () => {
    render(<SessionTimelineNav items={createItems(3)} activeEntryId="user-0" onNavigate={vi.fn()} />);
    const dots = screen.getAllByRole("button", { name: /Jump to user message/ });
    fireEvent.mouseEnter(dots[0]);
    fireEvent.mouseEnter(dots[1]);
    fireEvent.mouseEnter(dots[2]);
    expect(triggerTimelineHoverHaptic).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("tooltip").textContent).toContain("Prompt 2");
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
