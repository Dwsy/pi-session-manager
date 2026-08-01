// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardTimeFilter from "./DashboardTimeFilter";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

const options = {
  years: [2025, 2026],
  months: Array.from({ length: 12 }, (_, index) => index + 1),
  days: Array.from({ length: 31 }, (_, index) => index + 1),
};

describe("DashboardTimeFilter week navigation", () => {
  it("replaces date selects with previous and next week controls", () => {
    const onChange = vi.fn();

    render(
      <DashboardTimeFilter
        selection={{ granularity: "week", year: 2026, month: 7, day: 27 }}
        options={options}
        rangeLabel="Jul 27 – Aug 2"
        resultCount={3}
        totalCount={12}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next week" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    expect(onChange).toHaveBeenCalledWith({
      granularity: "week",
      year: 2026,
      month: 7,
      day: 20,
    });
  });

  it("moves to the next week across a year boundary", () => {
    const onChange = vi.fn();

    render(
      <DashboardTimeFilter
        selection={{ granularity: "week", year: 2025, month: 12, day: 29 }}
        options={options}
        rangeLabel="Dec 29 – Jan 4"
        resultCount={3}
        totalCount={12}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(onChange).toHaveBeenCalledWith({
      granularity: "week",
      year: 2026,
      month: 1,
      day: 5,
    });
  });
});
