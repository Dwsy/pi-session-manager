import { useCallback, useEffect, useRef, useState } from "react";

import {
  isFirstScanDone,
  isOnboardingCompletedLocally,
  markFirstScanDone,
  reconcileOnboardingCompletion,
  setOnboardingCompletedLocally,
} from "@/components/onboarding";
import { useSettings } from "@/contexts/SettingsContext";
import { shouldSkipOnboardingForRuntime } from "@/runtime-data/mode";
import { saveAppSettings } from "@/utils/settingsApi";

export interface UseOnboardingGateOptions {
  /** True while an initial or incremental session scan is running. */
  sessionsLoading: boolean;
}

export interface UseOnboardingGateReturn {
  showOnboarding: boolean;
  /** False only until the very first scan of this install has finished. */
  firstScanDone: boolean;
  dismissOnboarding: () => void;
}

/**
 * Owns first-launch visibility: whether to show the guide, and whether a scan has
 * ever completed. The two are tracked separately so skipping the guide does not
 * suppress the scanning splash, and vice versa.
 */
export function useOnboardingGate({
  sessionsLoading,
}: UseOnboardingGateOptions): UseOnboardingGateReturn {
  const { settings, loading: settingsLoading } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (shouldSkipOnboardingForRuntime()) {
      setOnboardingCompletedLocally(true);
      return false;
    }
    return !isOnboardingCompletedLocally();
  });
  const [firstScanDone, setFirstScanDone] = useState(isFirstScanDone);
  const hasReconciledRef = useRef(false);

  useEffect(() => {
    if (sessionsLoading || firstScanDone) return;
    markFirstScanDone();
    setFirstScanDone(true);
  }, [sessionsLoading, firstScanDone]);

  useEffect(() => {
    if (settingsLoading || hasReconciledRef.current) return;
    if (shouldSkipOnboardingForRuntime()) return;
    hasReconciledRef.current = true;

    const action = reconcileOnboardingCompletion(
      isOnboardingCompletedLocally(),
      settings.onboarding.completed,
    );
    if (action === "adopt-remote-completion") {
      setOnboardingCompletedLocally(true);
      setShowOnboarding(false);
      return;
    }
    if (action === "publish-local-completion") {
      // One-time migration for installs that only ever stored the local flag.
      void saveAppSettings({
        ...settings,
        onboarding: { completed: true },
      }).catch(() => {});
    }
  }, [settingsLoading, settings]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  return { showOnboarding, firstScanDone, dismissOnboarding };
}
