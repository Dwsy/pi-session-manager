// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderEntry } from "../types";
import { ConfigureTab } from "./ConfigureTab";

afterEach(cleanup);

describe("ConfigureTab API key visibility", () => {
  it("reveals and hides the selected provider API key", () => {
    const provider: ProviderEntry = {
      apiKey: "sk-secret",
      models: [],
    };
    const props: ComponentProps<typeof ConfigureTab> = {
      providerNames: ["openai"],
      config: { providers: { openai: provider } },
      selectedProvider: "openai",
      setSelectedProvider: vi.fn(),
      setConfigDetailTab: vi.fn(),
      requestDeleteProvider: vi.fn(),
      openCopyProviderModal: vi.fn(),
      openAddProviderModal: vi.fn(),
      selectedProviderModels: [],
      selectedModel: "",
      setSelectedModel: vi.fn(),
      addModel: vi.fn(),
      openCatalogBrowser: vi.fn(),
      openRemoteModelsBrowser: vi.fn(),
      fillSelectedModelPricing: vi.fn(),
      fillProviderPricing: vi.fn(),
      busy: null,
      selectedProviderEntry: provider,
      providerNameDraft: "openai",
      setProviderNameDraft: vi.fn(),
      commitProviderRename: vi.fn(),
      updateSelectedProviderEntry: vi.fn(),
      selectedModelEntry: undefined,
      activeModelLabel: "",
      updateSelectedModelEntry: vi.fn(),
      selectedModelIndex: -1,
      configDetailTab: "provider",
      requestDeleteModel: vi.fn(),
    };

    const { container } = render(<ConfigureTab {...props} />);
    const input = container.querySelector<HTMLInputElement>(
      'input[value="sk-secret"]',
    );

    expect(input?.type).toBe("password");

    fireEvent.click(
      screen.getByRole("button", { name: "Show API key" }),
    );
    expect(input?.type).toBe("text");

    fireEvent.click(
      screen.getByRole("button", { name: "Hide API key" }),
    );
    expect(input?.type).toBe("password");
  });
});
