import { useCallback } from "react";

import { useSettings } from "@/hooks/useSettings";
import { saveAppSettings } from "@/utils/settingsApi";
import type { AppSettings } from "@/components/settings/types";

export interface UseSessionViewerSettingsStateOptions {
  previewMode: boolean;
}

export function useSessionViewerSettingsState({
  previewMode,
}: UseSessionViewerSettingsStateOptions) {
  const { getSessionSetting, updateSessionSetting, settings } = useSettings();

  const collapseToolCalls = getSessionSetting("collapseToolCalls") !== false;
  const cmdFBehavior = getSessionSetting("cmdFBehavior") ?? "inSessionSearch";
  const scrollMarkersEnabledSetting =
    getSessionSetting("scrollMarkersEnabled") ?? false;
  const timelineNavEnabledSetting =
    getSessionSetting("timelineNavEnabled") ?? false;
  const timelineNavEnabled = previewMode ? false : timelineNavEnabledSetting;
  const scrollMarkersEnabled = previewMode
    ? false
    : scrollMarkersEnabledSetting && !timelineNavEnabled;

  const toggleCollapseToolCalls = useCallback(() => {
    const next = !collapseToolCalls;
    updateSessionSetting("collapseToolCalls", next);
    const nextSettings: AppSettings = {
      ...settings,
      session: {
        ...settings.session,
        collapseToolCalls: next,
      },
    };
    void saveAppSettings(nextSettings).catch((err) => {
      console.error("Failed to save collapseToolCalls setting:", err);
    });
  }, [collapseToolCalls, updateSessionSetting, settings]);

  return {
    collapseToolCalls,
    cmdFBehavior,
    scrollMarkersEnabled,
    toggleCollapseToolCalls,
  };
}
