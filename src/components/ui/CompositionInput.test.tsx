// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CompositionInput from "@/components/ui/CompositionInput";

describe("CompositionInput", () => {
  it("does not switch between controlled and uncontrolled during IME composition", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CompositionInput
        aria-label="search"
        value=""
        onChange={() => {}}
      />,
    );

    const input = screen.getByLabelText("search");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ni" } });
    fireEvent.compositionEnd(input, { currentTarget: { value: "你" } });

    const controlledWarning = consoleError.mock.calls.some((call) =>
      call.some((arg) =>
        String(arg).includes("A component is changing a controlled input to be uncontrolled"),
      ),
    );

    consoleError.mockRestore();

    expect(controlledWarning).toBe(false);
  });
});
