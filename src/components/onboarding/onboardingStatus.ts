import type { AppSettings } from "@/components/settings/types";
import { getCachedSettings, saveAppSettings } from "@/utils/settingsApi";

/**
 * Fast-path flag read during the first paint so the guide does not flash.
 * `settings.onboarding.completed` remains the source of truth across devices.
 */
export const ONBOARDING_COMPLETED_KEY = "onboarding-completed";

/**
 * Tracks whether an initial session scan has ever finished. Kept separate from the
 * onboarding flag so skipping the guide does not silence the first-launch splash.
 */
export const FIRST_SCAN_DONE_KEY = "psm-first-scan-done";

export type OnboardingReconciliation =
  | "none"
  | "adopt-remote-completion"
  | "publish-local-completion";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode, quota); the settings copy still applies.
  }
}

export function isOnboardingCompletedLocally(): boolean {
  return readFlag(ONBOARDING_COMPLETED_KEY);
}

export function setOnboardingCompletedLocally(completed: boolean): void {
  writeFlag(ONBOARDING_COMPLETED_KEY, completed);
}

export function isFirstScanDone(): boolean {
  return readFlag(FIRST_SCAN_DONE_KEY);
}

export function markFirstScanDone(): void {
  writeFlag(FIRST_SCAN_DONE_KEY, true);
}

/**
 * Settles a disagreement between the local fast-path flag and persisted settings.
 * A device that already finished the guide teaches the backend; a backend that
 * knows the guide is done stops a fresh browser profile from replaying it.
 */
export function reconcileOnboardingCompletion(
  local: boolean,
  remote: boolean,
): OnboardingReconciliation {
  if (local === remote) return "none";
  return remote ? "adopt-remote-completion" : "publish-local-completion";
}

/**
 * Commits the guide's edits together with the completion flag in a single write, so
 * dismissing the guide can never drop choices the user already made inside it.
 */
export async function persistOnboardingCompletion(
  settings: AppSettings,
): Promise<void> {
  setOnboardingCompletedLocally(true);
  try {
    await saveAppSettings({ ...settings, onboarding: { completed: true } });
  } catch (error) {
    console.warn("Failed to persist onboarding completion:", error);
  }
}

/**
 * Makes the guide appear again on the next launch. Both copies must be cleared,
 * otherwise reconciliation immediately re-adopts the completion from settings.
 */
export async function resetOnboarding(): Promise<void> {
  setOnboardingCompletedLocally(false);
  try {
    await saveAppSettings({
      ...getCachedSettings(),
      onboarding: { completed: false },
    });
  } catch (error) {
    console.warn("Failed to reset onboarding completion:", error);
  }
}
