// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getAvailableSettingsAreas,
  getAvailableSettingsGroups,
  getAvailableSettingsSections,
} from "./settingsRegistry";

describe("settings registry selectors", () => {
  it("returns available base settings metadata", () => {
    expect(getAvailableSettingsAreas().map((area) => area.id)).toContain(
      "preferences",
    );
    expect(getAvailableSettingsAreas().map((area) => area.id)).toContain(
      "plugins",
    );
    expect(
      getAvailableSettingsSections().map((section) => section.id),
    ).toContain("psm-plugins");
    expect(
      getAvailableSettingsSections().map((section) => section.id),
    ).toContain("psm-plugin-dev");
    expect(
      getAvailableSettingsGroups("config-center").flatMap(
        (group) => group.sections,
      ),
    ).not.toContain("psm-plugins");
    expect(
      getAvailableSettingsGroups("plugins").flatMap((group) => group.sections),
    ).toContain("psm-plugins");
    expect(
      getAvailableSettingsGroups("plugins").flatMap((group) => group.sections),
    ).toContain("psm-plugin-marketplace");
    expect(
      getAvailableSettingsGroups("config-center").flatMap(
        (group) => group.sections,
      ),
    ).toEqual(
      expect.arrayContaining([
        "models",
        "pi-resources",
        "pi-runtime",
        "subagents",
        "pi-live",
      ]),
    );
    expect(
      getAvailableSettingsSections().map((section) => section.id),
    ).not.toContain("pi-agent");
  });
});
