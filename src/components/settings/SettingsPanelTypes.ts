import type { AppSettings } from "./types";
import type {
  getAvailableSettingsAreas,
  getAvailableSettingsGroups,
  getAvailableSettingsSections,
} from "./settingsRegistry";

export type SettingsAreas = ReturnType<typeof getAvailableSettingsAreas>;
export type SettingsGroups = ReturnType<typeof getAvailableSettingsGroups>;
export type SettingsSections = ReturnType<typeof getAvailableSettingsSections>;

export type SettingsUpdateHandler = <K extends keyof AppSettings>(
  section: K,
  key: keyof AppSettings[K],
  value: any,
) => void;
