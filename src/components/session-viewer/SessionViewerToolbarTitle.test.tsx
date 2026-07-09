// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import SessionViewerToolbarTitle from "./SessionViewerToolbarTitle";

describe("SessionViewerToolbarTitle", () => {
  it("renders static title when rename is unavailable", () => {
    render(<SessionViewerToolbarTitle title="Alpha" />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("enters edit mode on click and saves on blur", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(<SessionViewerToolbarTitle title="Alpha" onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.blur(input);

    expect(onRename).toHaveBeenCalledWith("Beta");
    expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy();
  });

  it("shows optimistic title while rename is pending", async () => {
    let resolveRename: (() => void) | undefined;
    const onRename = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        }),
    );
    render(<SessionViewerToolbarTitle title="Alpha" onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.blur(input);

    expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy();
    resolveRename?.();
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy();
    });
  });

  it("does not call rename when value unchanged", () => {
    const onRename = vi.fn();
    render(<SessionViewerToolbarTitle title="Alpha" onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    const input = screen.getByRole("textbox");
    fireEvent.blur(input);

    expect(onRename).not.toHaveBeenCalled();
  });
});