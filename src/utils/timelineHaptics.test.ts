// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { triggerTimelineHoverHaptic } from "./timelineHaptics";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
  });
});

describe("triggerTimelineHoverHaptic", () => {
  it("does not invoke a native command in a web browser", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    triggerTimelineHoverHaptic();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes native haptics for every hover without throttling", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    triggerTimelineHoverHaptic();
    triggerTimelineHoverHaptic();
    triggerTimelineHoverHaptic();
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledWith("trigger_timeline_haptic");
    now.mockRestore();
  });
});
