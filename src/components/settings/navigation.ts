export const SETTINGS_NAVIGATE_EVENT = "psm-settings:navigate";

/** Legacy section ids kept for deep-links / external navigate events. */
const LEGACY_SETTINGS_SECTION_ALIASES: Record<string, string> = {
  "pi-agent": "pi-resources",
  "pi-config": "pi-resources",
};

export function resolveSettingsSectionId(section: string): string {
  return LEGACY_SETTINGS_SECTION_ALIASES[section] ?? section;
}
