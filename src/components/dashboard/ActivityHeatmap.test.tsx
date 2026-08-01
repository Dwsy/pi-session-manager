// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ActivityHeatmap from "./ActivityHeatmap";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: "en-US" },
  }),
}));

describe("ActivityHeatmap", () => {
  it("uses the dedicated accessible color pair for a strong activity cell", () => {
    render(
      <ActivityHeatmap
        data={[
          {
            date: "2026-01-26",
            level: 5,
            total_messages: 1781,
            total_tokens: 0,
            total_cost: 0,
            session_count: 1,
          },
        ]}
        rangeStart={new Date(2026, 0, 26)}
        rangeEnd={new Date(2026, 1, 2)}
      />,
    );

    const activeCell = screen.getByRole("button", {
      name: "Jan 26: 1781 messages",
    });

    expect(activeCell.style.backgroundColor).toBe(
      "rgb(var(--heatmap-active-background))",
    );
    expect(activeCell.style.color).toBe(
      "rgb(var(--heatmap-active-foreground))",
    );
    expect(activeCell.querySelector(".text-muted-foreground")).toBeNull();
    expect(activeCell.querySelector(".text-foreground")).toBeNull();
  });

  it("uses the available card width for the default six-month range", () => {
    const { container } = render(
      <ActivityHeatmap
        data={[
          {
            date: "2026-01-01",
            level: 0,
            total_messages: 0,
            total_tokens: 0,
            total_cost: 0,
            session_count: 0,
          },
        ]}
        rangeStart={new Date(2026, 0, 1)}
        rangeEnd={new Date(2026, 6, 1)}
      />,
    );

    const rows = container.querySelectorAll(
      ".activity-heatmap__history-row",
    );

    expect(rows).toHaveLength(7);
    expect(rows[0].style.gridTemplateColumns).toBe(
      "repeat(27, minmax(0, 1fr))",
    );
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("fits a full calendar year into the card without an intrinsic-width scroller", () => {
    const { container } = render(
      <ActivityHeatmap
        data={[
          {
            date: "2026-01-01",
            level: 0,
            total_messages: 0,
            total_tokens: 0,
            total_cost: 0,
            session_count: 0,
          },
        ]}
        rangeStart={new Date(2026, 0, 1)}
        rangeEnd={new Date(2027, 0, 1)}
        granularity="year"
      />,
    );

    const rows = container.querySelectorAll(
      ".activity-heatmap__history-row",
    );

    expect(rows).toHaveLength(7);
    expect(rows[0].className).toContain("w-full");
    expect(rows[0].style.gridTemplateColumns).toBe(
      "repeat(53, minmax(0, 1fr))",
    );
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });
});
