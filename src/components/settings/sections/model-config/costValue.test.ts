import { describe, expect, it } from "vitest";
import { clampCostValue } from "./utils";

describe("clampCostValue", () => {
  it("defaults empty/invalid values to 0", () => {
    expect(clampCostValue("")).toBe(0);
    expect(clampCostValue(undefined)).toBe(0);
    expect(clampCostValue(null)).toBe(0);
    expect(clampCostValue("abc")).toBe(0);
  });

  it("rejects negative values", () => {
    expect(clampCostValue(-1)).toBe(0);
    expect(clampCostValue("-0.5")).toBe(0);
  });

  it("keeps valid non-negative numbers", () => {
    expect(clampCostValue(0)).toBe(0);
    expect(clampCostValue(2.5)).toBe(2.5);
    expect(clampCostValue("0.3")).toBe(0.3);
  });
});
