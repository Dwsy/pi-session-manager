export interface PsmOfficialPluginSource {
  id: string;
  packageName: string;
  npmUrl: string;
  nameKey: string;
  descriptionKey: string;
  defaultName: string;
  defaultDescription: string;
  childPluginIds: string[];
}

export const OFFICIAL_PSM_PLUGIN_SOURCES: readonly PsmOfficialPluginSource[] = [
  {
    id: "pi-session-manager-suite",
    packageName: "pi-session-manager-plugin",
    npmUrl: "https://www.npmjs.com/package/pi-session-manager-plugin",
    nameKey: "settings.psmPlugins.officialSources.piSessionManagerSuite.name",
    descriptionKey:
      "settings.psmPlugins.officialSources.piSessionManagerSuite.description",
    defaultName: "PSM Plugin Suite",
    defaultDescription:
      "A npm plugin suite for Pi Session Manager. Starts with Pi Context Navigator and can grow through psm.extensions.",
    childPluginIds: ["dwsy.psm-pi-context"],
  },
];
