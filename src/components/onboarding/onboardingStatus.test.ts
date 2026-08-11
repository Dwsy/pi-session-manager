/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  FIRST_SCAN_DONE_KEY,
  ONBOARDING_COMPLETED_KEY,
  isFirstScanDone,
  isOnboardingCompletedLocally,
  markFirstScanDone,
  reconcileOnboardingCompletion,
  setOnboardingCompletedLocally,
} from "./onboardingStatus";

describe("onboarding local flags", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads the completion flag written by earlier app versions", () => {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    expect(isOnboardingCompletedLocally()).toBe(true);
  });

  it("clears the completion flag instead of storing a falsy string", () => {
    setOnboardingCompletedLocally(true);
    setOnboardingCompletedLocally(false);
    expect(localStorage.getItem(ONBOARDING_COMPLETED_KEY)).toBeNull();
    expect(isOnboardingCompletedLocally()).toBe(false);
  });

  it("keeps the first-scan flag independent from the onboarding flag", () => {
    markFirstScanDone();
    setOnboardingCompletedLocally(false);

    expect(localStorage.getItem(FIRST_SCAN_DONE_KEY)).toBe("true");
    expect(isFirstScanDone()).toBe(true);
    expect(isOnboardingCompletedLocally()).toBe(false);
  });
});

describe("reconcileOnboardingCompletion", () => {
  it("does nothing when both copies agree", () => {
    expect(reconcileOnboardingCompletion(false, false)).toBe("none");
    expect(reconcileOnboardingCompletion(true, true)).toBe("none");
  });

  it("adopts the settings copy on a device that never ran the guide", () => {
    expect(reconcileOnboardingCompletion(false, true)).toBe(
      "adopt-remote-completion",
    );
  });

  it("publishes a legacy local completion to settings", () => {
    expect(reconcileOnboardingCompletion(true, false)).toBe(
      "publish-local-completion",
    );
  });
});
