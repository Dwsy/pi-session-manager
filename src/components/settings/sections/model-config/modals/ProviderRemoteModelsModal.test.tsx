// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderRemoteModelsModal } from "./ProviderRemoteModelsModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows installed Go models as available in Pi and selects only catalog additions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
    { id: "deepseek-v4.1-flash", type: "chat" },
    { id: "next-go-model", type: "chat" },
  ] }))));
  const onConfirm = vi.fn();
  const dialog = <ProviderRemoteModelsModal
    open
    providerName="opencode-go"
    providerEntry={{}}
    existingModelIds={[]}
    piGoModels={["deepseek-v4.1-flash"]}
    loadingPiGoModels={false}
    refreshPiGoModels={vi.fn()}
    onClose={vi.fn()}
    onConfirm={onConfirm}
    onRequestRemoveExisting={vi.fn()}
  />;
  const { rerender } = render(dialog);

  const installed = await screen.findByRole<HTMLButtonElement>("button", { name: /deepseek-v4\.1-flash.*Available in Pi/ });
  const add = screen.getByRole<HTMLButtonElement>("button", { name: "Add selected models" });
  expect(installed.disabled).toBe(true);
  expect(add.disabled).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
  fireEvent.click(add);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm.mock.calls[0][0]).toEqual([expect.objectContaining({ id: "next-go-model" })]);

  // If Pi gains the model while the dialog is open, it can no longer be queued for import.
  rerender(<ProviderRemoteModelsModal {...dialog.props} piGoModels={["deepseek-v4.1-flash", "next-go-model"]} />);
  expect(add.disabled).toBe(true);
});
