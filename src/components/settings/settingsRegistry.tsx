import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Database,
  Download,
  Globe,
  Keyboard,
  Palette,
  Puzzle,
  Search,
  Server,
  Settings2,
  Tags,
  Terminal,
} from "lucide-react";

import { isStandaloneDatasetRuntime } from "@/browser-dataset";
import type {
  AppSettings,
  SettingsArea,
  SettingsSaveMode,
  SettingsSection,
} from "./types";
import AdvancedSettings from "./sections/AdvancedSettings";
import AppBehaviorSettings from "./sections/AppBehaviorSettings";
import AppearanceSettings from "./sections/AppearanceSettings";
import { ConfigBundleManager } from "./sections/ConfigBundleManager";
import DataSourcesSettings from "./sections/DataSourcesSettings";
import DiagnosticsMaintenanceSettings from "./sections/DiagnosticsMaintenanceSettings";
import ModelSettings from "./sections/ModelSettings";
import PiAgentSettings from "./sections/PiAgentSettings";
import PsmPluginsSettings from "./sections/PsmPluginsSettings";
import SearchExportSettings from "./sections/SearchExportSettings";
import SessionSettings from "./sections/SessionSettings";
import ShortcutSettings from "./sections/ShortcutSettings";
import TagManagerSettings from "./sections/TagManagerSettings";
import TerminalSettings from "./sections/TerminalSettings";
import LanguageSettings from "./sections/LanguageSettings";

export interface SettingsAreaMeta {
  id: SettingsArea;
  labelKey: string;
  fallbackLabel: string;
  descriptionKey: string;
  fallbackDescription: string;
}

export interface SettingsSectionMeta {
  id: SettingsSection;
  area: SettingsArea;
  group: string;
  icon: ReactNode;
  labelKey: string;
  fallbackLabel: string;
  descriptionKey: string;
  fallbackDescription: string;
  saveMode: SettingsSaveMode;
}

export interface SettingsGroupMeta {
  id: string;
  area: SettingsArea;
  labelKey: string;
  fallbackLabel: string;
  sections: SettingsSection[];
}

export const SETTINGS_AREAS: SettingsAreaMeta[] = [
  {
    id: "preferences",
    labelKey: "settings.areas.preferences",
    fallbackLabel: "Preferences",
    descriptionKey: "settings.areaDescriptions.preferences",
    fallbackDescription: "Everyday app behavior and viewing defaults",
  },
  {
    id: "config-center",
    labelKey: "settings.areas.configCenter",
    fallbackLabel: "Config Center",
    descriptionKey: "settings.areaDescriptions.configCenter",
    fallbackDescription: "Agent, server, data source and maintenance tools",
  },
];

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "appearance",
    area: "preferences",
    group: "display",
    icon: <Palette className="h-4 w-4" />,
    labelKey: "settings.sections.appearance",
    fallbackLabel: "Appearance",
    descriptionKey: "settings.sectionDescriptions.appearance",
    fallbackDescription: "Theme, fonts and message density",
    saveMode: "app-settings",
  },
  {
    id: "language",
    area: "preferences",
    group: "display",
    icon: <Globe className="h-4 w-4" />,
    labelKey: "settings.sections.language",
    fallbackLabel: "Language",
    descriptionKey: "settings.sectionDescriptions.language",
    fallbackDescription: "Interface language",
    saveMode: "app-settings",
  },
  {
    id: "terminal",
    area: "preferences",
    group: "app",
    icon: <Terminal className="h-4 w-4" />,
    labelKey: "settings.sections.terminal",
    fallbackLabel: "Terminal & Resume",
    descriptionKey: "settings.sectionDescriptions.terminal",
    fallbackDescription: "Built-in terminal and resume command behavior",
    saveMode: "app-settings",
  },
  {
    id: "session-viewer",
    area: "preferences",
    group: "viewing",
    icon: <Database className="h-4 w-4" />,
    labelKey: "settings.sections.sessionViewer",
    fallbackLabel: "Session Viewer",
    descriptionKey: "settings.sectionDescriptions.sessionViewer",
    fallbackDescription: "Session list, preview and navigation defaults",
    saveMode: "app-settings",
  },
  {
    id: "search-export",
    area: "preferences",
    group: "productivity",
    icon: <Search className="h-4 w-4" />,
    labelKey: "settings.sections.searchExport",
    fallbackLabel: "Search & Export",
    descriptionKey: "settings.sectionDescriptions.searchExport",
    fallbackDescription: "Search matching and export defaults",
    saveMode: "app-settings",
  },
  {
    id: "tags",
    area: "preferences",
    group: "productivity",
    icon: <Tags className="h-4 w-4" />,
    labelKey: "settings.sections.tags",
    fallbackLabel: "Labels",
    descriptionKey: "settings.sectionDescriptions.tags",
    fallbackDescription: "Label tree and automatic label rules",
    saveMode: "inline",
  },
  {
    id: "shortcuts",
    area: "preferences",
    group: "productivity",
    icon: <Keyboard className="h-4 w-4" />,
    labelKey: "settings.sections.shortcuts",
    fallbackLabel: "Shortcuts",
    descriptionKey: "settings.sectionDescriptions.shortcuts",
    fallbackDescription: "Keyboard shortcut reference",
    saveMode: "read-only",
  },
  {
    id: "app-behavior",
    area: "preferences",
    group: "app",
    icon: <Settings2 className="h-4 w-4" />,
    labelKey: "settings.sections.appBehavior",
    fallbackLabel: "App Behavior",
    descriptionKey: "settings.sectionDescriptions.appBehavior",
    fallbackDescription: "Window behavior and update channel",
    saveMode: "app-settings",
  },
  {
    id: "data-sources",
    area: "config-center",
    group: "sources",
    icon: <Database className="h-4 w-4" />,
    labelKey: "settings.sections.dataSources",
    fallbackLabel: "Data Sources",
    descriptionKey: "settings.sectionDescriptions.dataSources",
    fallbackDescription: "Local paths, datasets and external agent sessions",
    saveMode: "app-settings",
  },
  {
    id: "pi-agent",
    area: "config-center",
    group: "agent",
    icon: <Bot className="h-4 w-4" />,
    labelKey: "settings.sections.piAgent",
    fallbackLabel: "Pi Agent",
    descriptionKey: "settings.sectionDescriptions.piAgent",
    fallbackDescription: "Pi resources, runtime settings and live sessions",
    saveMode: "app-settings",
  },
  {
    id: "models",
    area: "config-center",
    group: "agent",
    icon: <Bot className="h-4 w-4" />,
    labelKey: "settings.sections.models",
    fallbackLabel: "Models",
    descriptionKey: "settings.sectionDescriptions.models",
    fallbackDescription: "Provider, model and model test configuration",
    saveMode: "inline",
  },
  {
    id: "psm-plugins",
    area: "config-center",
    group: "agent",
    icon: <Puzzle className="h-4 w-4" />,
    labelKey: "settings.sections.psmPlugins",
    fallbackLabel: "PSM Plugins",
    descriptionKey: "settings.sectionDescriptions.psmPlugins",
    fallbackDescription: "Built-in and npm-installed PSM plugins",
    saveMode: "inline",
  },
  {
    id: "server-access",
    area: "config-center",
    group: "access",
    icon: <Server className="h-4 w-4" />,
    labelKey: "settings.sections.serverAccess",
    fallbackLabel: "Server & Access",
    descriptionKey: "settings.sectionDescriptions.serverAccess",
    fallbackDescription: "HTTP, WebSocket and API key access",
    saveMode: "inline",
  },
  {
    id: "backup-restore",
    area: "config-center",
    group: "maintenance",
    icon: <Download className="h-4 w-4" />,
    labelKey: "settings.sections.backupRestore",
    fallbackLabel: "Backup & Restore",
    descriptionKey: "settings.sectionDescriptions.backupRestore",
    fallbackDescription: "Configuration import, export and restore tools",
    saveMode: "inline",
  },
  {
    id: "diagnostics-maintenance",
    area: "config-center",
    group: "maintenance",
    icon: <Activity className="h-4 w-4" />,
    labelKey: "settings.sections.diagnosticsMaintenance",
    fallbackLabel: "Diagnostics & Maintenance",
    descriptionKey: "settings.sectionDescriptions.diagnosticsMaintenance",
    fallbackDescription: "Cache, debug and external API diagnostics",
    saveMode: "app-settings",
  },
];

export const SETTINGS_GROUPS: SettingsGroupMeta[] = [
  {
    id: "display",
    area: "preferences",
    labelKey: "settings.groups.display",
    fallbackLabel: "Display",
    sections: ["appearance", "language"],
  },
  {
    id: "viewing",
    area: "preferences",
    labelKey: "settings.groups.viewing",
    fallbackLabel: "Viewing",
    sections: ["session-viewer"],
  },
  {
    id: "productivity",
    area: "preferences",
    labelKey: "settings.groups.productivity",
    fallbackLabel: "Productivity",
    sections: ["search-export", "tags", "shortcuts"],
  },
  {
    id: "app",
    area: "preferences",
    labelKey: "settings.groups.app",
    fallbackLabel: "App",
    sections: ["terminal", "app-behavior"],
  },
  {
    id: "sources",
    area: "config-center",
    labelKey: "settings.groups.sources",
    fallbackLabel: "Sources",
    sections: ["data-sources"],
  },
  {
    id: "agent",
    area: "config-center",
    labelKey: "settings.groups.agent",
    fallbackLabel: "Agent",
    sections: ["pi-agent", "models", "psm-plugins"],
  },
  {
    id: "access",
    area: "config-center",
    labelKey: "settings.groups.access",
    fallbackLabel: "Access",
    sections: ["server-access"],
  },
  {
    id: "maintenance",
    area: "config-center",
    labelKey: "settings.groups.maintenance",
    fallbackLabel: "Maintenance",
    sections: ["backup-restore", "diagnostics-maintenance"],
  },
];

const STANDALONE_DATASET_SECTION_IDS: SettingsSection[] = [
  "appearance",
  "language",
  "session-viewer",
  "search-export",
  "tags",
  "shortcuts",
  "app-behavior",
  "data-sources",
];

const STANDALONE_DATASET_SECTION_SET = new Set(STANDALONE_DATASET_SECTION_IDS);
const STANDALONE_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter((item) =>
  STANDALONE_DATASET_SECTION_SET.has(item.id),
);

function buildAvailableAreas(sections: SettingsSectionMeta[]): SettingsAreaMeta[] {
  return SETTINGS_AREAS.filter((area) =>
    sections.some((section) => section.area === area.id),
  );
}

function buildAvailableGroups(
  sections: SettingsSectionMeta[],
  area?: SettingsArea,
): SettingsGroupMeta[] {
  const available = new Set(sections.map((section) => section.id));
  return SETTINGS_GROUPS
    .filter((group) => !area || group.area === area)
    .map((group) => ({
      ...group,
      sections: group.sections.filter((section) => available.has(section)),
    }))
    .filter((group) => group.sections.length > 0);
}

const DEFAULT_SETTINGS_AREAS = buildAvailableAreas(SETTINGS_SECTIONS);
const STANDALONE_SETTINGS_AREAS = buildAvailableAreas(STANDALONE_SETTINGS_SECTIONS);
const DEFAULT_SETTINGS_GROUPS = buildAvailableGroups(SETTINGS_SECTIONS);
const DEFAULT_PREFERENCES_GROUPS = buildAvailableGroups(SETTINGS_SECTIONS, "preferences");
const DEFAULT_CONFIG_CENTER_GROUPS = buildAvailableGroups(SETTINGS_SECTIONS, "config-center");
const STANDALONE_SETTINGS_GROUPS = buildAvailableGroups(STANDALONE_SETTINGS_SECTIONS);
const STANDALONE_PREFERENCES_GROUPS = buildAvailableGroups(STANDALONE_SETTINGS_SECTIONS, "preferences");
const STANDALONE_CONFIG_CENTER_GROUPS = buildAvailableGroups(STANDALONE_SETTINGS_SECTIONS, "config-center");

export function getAvailableSettingsAreas(): SettingsAreaMeta[] {
  return isStandaloneDatasetRuntime() ? STANDALONE_SETTINGS_AREAS : DEFAULT_SETTINGS_AREAS;
}

export function getAvailableSettingsSections(): SettingsSectionMeta[] {
  return isStandaloneDatasetRuntime() ? STANDALONE_SETTINGS_SECTIONS : SETTINGS_SECTIONS;
}

export function getAvailableSettingsGroups(
  area?: SettingsArea,
): SettingsGroupMeta[] {
  if (isStandaloneDatasetRuntime()) {
    if (area === "preferences") return STANDALONE_PREFERENCES_GROUPS;
    if (area === "config-center") return STANDALONE_CONFIG_CENTER_GROUPS;
    return STANDALONE_SETTINGS_GROUPS;
  }

  if (area === "preferences") return DEFAULT_PREFERENCES_GROUPS;
  if (area === "config-center") return DEFAULT_CONFIG_CENTER_GROUPS;
  return DEFAULT_SETTINGS_GROUPS;
}

export function getSettingsAreaMeta(area: SettingsArea): SettingsAreaMeta {
  return SETTINGS_AREAS.find((item) => item.id === area) || SETTINGS_AREAS[0];
}

export function getSettingsSectionMeta(
  section: SettingsSection,
): SettingsSectionMeta | undefined {
  return SETTINGS_SECTIONS.find((item) => item.id === section);
}

export function findSettingsGroupBySection(
  section: SettingsSection,
): SettingsGroupMeta {
  return (
    SETTINGS_GROUPS.find((group) => group.sections.includes(section)) ||
    SETTINGS_GROUPS[0]
  );
}

export function renderSettingsSection(
  activeSection: SettingsSection,
  settings: AppSettings,
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: any,
  ) => void,
) {
  switch (activeSection) {
    case "appearance":
      return <AppearanceSettings settings={settings} onUpdate={onUpdate} />;
    case "language":
      return <LanguageSettings settings={settings} onUpdate={onUpdate} />;
    case "terminal":
      return <TerminalSettings settings={settings} onUpdate={onUpdate} />;
    case "session-viewer":
      return <SessionSettings settings={settings} onUpdate={onUpdate} />;
    case "search-export":
      return <SearchExportSettings settings={settings} onUpdate={onUpdate} />;
    case "tags":
      return <TagManagerSettings />;
    case "shortcuts":
      return <ShortcutSettings />;
    case "app-behavior":
      return <AppBehaviorSettings settings={settings} onUpdate={onUpdate} />;
    case "data-sources":
      return <DataSourcesSettings settings={settings} onUpdate={onUpdate} />;
    case "pi-agent":
      return <PiAgentSettings settings={settings} onUpdate={onUpdate} />;
    case "models":
      return <ModelSettings />;
    case "psm-plugins":
      return <PsmPluginsSettings />;
    case "server-access":
      return (
        <AdvancedSettings
          settings={settings}
          onUpdate={onUpdate}
          mode="server-access"
        />
      );
    case "backup-restore":
      return <ConfigBundleManager />;
    case "diagnostics-maintenance":
      return (
        <DiagnosticsMaintenanceSettings
          settings={settings}
          onUpdate={onUpdate}
        />
      );
    default:
      return null;
  }
}
