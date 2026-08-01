// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/transport", () => ({
  invoke: mocks.invoke,
}));

import { useAvailableTerminals } from "./useAvailableTerminals";

function TerminalProbe() {
  const terminals = useAvailableTerminals();
  return <output>{terminals.join(",")}</output>;
}

describe("useAvailableTerminals", () => {
  afterEach(() => {
    mocks.invoke.mockReset();
  });

  it("reuses the completed terminal scan when the settings section remounts", async () => {
    mocks.invoke.mockResolvedValue(["terminal", "ghostty"]);

    const first = render(<TerminalProbe />);
    await screen.findByText("terminal,ghostty");
    first.unmount();

    render(<TerminalProbe />);
    await screen.findByText("terminal,ghostty");

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("list_available_terminals");
  });
});
