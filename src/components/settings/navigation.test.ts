import { describe, expect, it } from "vitest";

import { resolveSettingsSectionId } from "./navigation";

describe("resolveSettingsSectionId", () => {
  it("maps legacy pi-agent and pi-config to pi-resources", () => {
    expect(resolveSettingsSectionId("pi-agent")).toBe("pi-resources");
    expect(resolveSettingsSectionId("pi-config")).toBe("pi-resources");
  });

  it("passes through current section ids", () => {
    expect(resolveSettingsSectionId("pi-resources")).toBe("pi-resources");
    expect(resolveSettingsSectionId("models")).toBe("models");
    expect(resolveSettingsSectionId("subagents")).toBe("subagents");
    expect(resolveSettingsSectionId("pi-live")).toBe("pi-live");
  });
});
