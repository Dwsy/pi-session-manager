import { describe, expect, it } from "vitest";
import { normalizeThinkingLevelMap } from "./utils";

describe("normalizeThinkingLevelMap", () => {
  it("keeps custom levels like max/ultra", () => {
    expect(
      normalizeThinkingLevelMap({
        xhigh: "xhigh",
        max: "max",
        ultra: "ultra",
        off: null,
        "  ": "ignored",
        blank: "   ",
      }),
    ).toEqual({
      xhigh: "xhigh",
      max: "max",
      ultra: "ultra",
      off: null,
    });
  });

  it("returns undefined for empty maps", () => {
    expect(normalizeThinkingLevelMap({})).toBeUndefined();
    expect(normalizeThinkingLevelMap(undefined)).toBeUndefined();
  });
});
