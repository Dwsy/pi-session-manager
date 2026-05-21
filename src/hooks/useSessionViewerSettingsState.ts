import { useSettings } from "@/hooks/useSettings";

export interface UseSessionViewerSettingsStateOptions {
  previewMode: boolean;
}

export function useSessionViewerSettingsState({
  previewMode,
}: UseSessionViewerSettingsStateOptions) {
  const { getSessionSetting } = useSettings();

  const cmdFBehavior = getSessionSetting("cmdFBehavior") ?? "inSessionSearch";
  const scrollMarkersEnabledSetting =
    getSessionSetting("scrollMarkersEnabled") ?? false;
  const timelineNavEnabledSetting =
    getSessionSetting("timelineNavEnabled") ?? false;
  const timelineNavEnabled = previewMode ? false : timelineNavEnabledSetting;
  const scrollMarkersEnabled = previewMode
    ? false
    : scrollMarkersEnabledSetting && !timelineNavEnabled;



  return {
    cmdFBehavior,
    scrollMarkersEnabled,
  };
}
