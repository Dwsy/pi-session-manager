// @vitest-environment jsdom

import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultSettings } from "@/components/settings/types";
import { enUS } from "@/i18n/locales/en-US";
import { resetTransport } from "@/transport";
import { FALLBACK_SESSION_PROVIDERS } from "@/utils/sessionProviderCatalog";
import ExternalSessionsSettings from "./ExternalSessionsSettings";

const settings = {
  ...defaultSettings,
  session: {
    ...defaultSettings.session,
    externalSessionProviders: ["codex"],
    scanOtherAgentJsonl: true,
  },
};

describe("ExternalSessionsSettings", () => {
  beforeEach(async () => {
    vi.stubGlobal("__TAURI__", {});
    mockIPC(() => FALLBACK_SESSION_PROVIDERS);
    await i18n.use(initReactI18next).init({
      lng: "en-US",
      resources: { "en-US": { translation: enUS } },
    });
  });

  afterEach(() => {
    resetTransport();
    clearMocks();
    vi.unstubAllGlobals();
  });

  it.each(["agents", "all"] as const)(
    "allows scan-only providers to be toggled in %s mode without selecting them as targets",
    async (mode) => {
      const onUpdate = vi.fn();
      const view = render(
        <ExternalSessionsSettings
          settings={settings}
          onUpdate={onUpdate}
          mode={mode}
        />,
      );

      await screen.findByRole("group", { name: "Antigravity" });

      for (const [slug, name] of [
        ["antigravity", "Antigravity"],
        ["cursor", "Cursor"],
      ]) {
        view.rerender(
          <ExternalSessionsSettings
            settings={settings}
            onUpdate={onUpdate}
            mode={mode}
          />,
        );
        const provider = within(screen.getByRole("group", { name }));
        expect(provider.queryByRole("button")).toBeNull();
        expect(provider.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);

        onUpdate.mockClear();
        fireEvent.click(provider.getByRole("checkbox"));
        const enabled = ["codex", slug].sort();
        expect(onUpdate.mock.calls).toEqual([
          ["session", "externalSessionProviders", enabled],
          ["session", "scanOtherAgentJsonl", true],
        ]);

        view.rerender(
          <ExternalSessionsSettings
            settings={{
              ...settings,
              session: { ...settings.session, externalSessionProviders: enabled },
            }}
            onUpdate={onUpdate}
            mode={mode}
          />,
        );
        expect(provider.getByRole<HTMLInputElement>("checkbox").checked).toBe(true);

        onUpdate.mockClear();
        fireEvent.click(provider.getByRole("checkbox"));
        expect(onUpdate.mock.calls).toEqual([
          ["session", "externalSessionProviders", ["codex"]],
          ["session", "scanOtherAgentJsonl", true],
        ]);
      }
    },
  );

  it("offers only conversion-capable providers in resume mode", async () => {
    const onUpdate = vi.fn();
    render(
      <ExternalSessionsSettings
        settings={settings}
        onUpdate={onUpdate}
        mode="resume"
      />,
    );

    await screen.findByText("Codex");
    expect(screen.queryByText("Antigravity")).toBeNull();
    expect(screen.queryByText("Cursor")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();

    const codex = within(screen.getByRole("group", { name: "Codex" }));
    fireEvent.click(codex.getByRole("button", { name: "Set default" }));
    expect(onUpdate.mock.calls).toEqual([
      ["session", "defaultExternalResumeTarget", "codex"],
      ["session", "externalResumePromptEnabled", false],
    ]);
  });
});
