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

  it("allows scan-only providers to be toggled without selecting them as resume targets", async () => {
    const onUpdate = vi.fn();
    const view = render(
      <ExternalSessionsSettings
        settings={settings}
        onUpdate={onUpdate}
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
  });

  it("allows setting any conversion-capable provider as default resume target even when scanning is off", async () => {
    const onUpdate = vi.fn();
    render(
      <ExternalSessionsSettings
        settings={settings}
        onUpdate={onUpdate}
      />,
    );

    const claude = within(await screen.findByRole("group", { name: "Claude Code" }));
    expect(claude.getByRole<HTMLInputElement>("checkbox").checked).toBe(false);
    fireEvent.click(claude.getByRole("button", { name: "Set default" }));
    expect(onUpdate.mock.calls).toEqual([
      ["session", "defaultExternalResumeTarget", "claude-code"],
      ["session", "externalResumePromptEnabled", false],
    ]);
  });
});
