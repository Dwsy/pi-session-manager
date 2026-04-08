import type { ReactNode } from "react";
import {
  Activity,
  Bot,
  Code,
  Cpu,
  Database,
  Download,
  Globe,
  Keyboard,
  Palette,
  Puzzle,
  Shield,
  Tags,
  Terminal,
} from "lucide-react";

import type { AppSettings, SettingsSection } from "./types";
import TerminalSettings from "./sections/TerminalSettings";
import AppearanceSettings from "./sections/AppearanceSettings";
import LanguageSettings from "./sections/LanguageSettings";
import ExternalSessionsSettings from "./sections/ExternalSessionsSettings";
import SessionSettings from "./sections/SessionSettings";
import SearchSettings from "./sections/SearchSettings";
import ExportSettings from "./sections/ExportSettings";
import UpdateSettings from "./sections/UpdateSettings";
import PiConfigSettings from "./sections/PiConfigSettings";
import ModelSettings from "./sections/ModelSettings";
import AdvancedSettings from "./sections/AdvancedSettings";
import ShortcutSettings from "./sections/ShortcutSettings";
import TagManagerSettings from "./sections/TagManagerSettings";
import APITestSettings from "./sections/APITestSettings";
import PiLiveSettings from "./sections/PiLiveSettings";
import { ConfigBundleManager } from "./sections/ConfigBundleManager";

export interface SettingsSectionMeta {
  id: SettingsSection;
  icon: ReactNode;
  labelKey: string;
  fallbackLabel: string;
}

export interface SettingsGroupMeta {
  id: "general" | "sessions" | "agent" | "system";
  labelKey: string;
  fallbackLabel: string;
  sections: SettingsSection[];
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "terminal",
    icon: <Terminal className="h-4 w-4" />,
    labelKey: "settings.sections.terminal",
    fallbackLabel: "Terminal",
  },
  {
    id: "appearance",
    icon: <Palette className="h-4 w-4" />,
    labelKey: "settings.sections.appearance",
    fallbackLabel: "Appearance",
  },
  {
    id: "language",
    icon: <Globe className="h-4 w-4" />,
    labelKey: "settings.sections.language",
    fallbackLabel: "Language",
  },
  {
    id: "session",
    icon: <Database className="h-4 w-4" />,
    labelKey: "settings.sections.session",
    fallbackLabel: "Session",
  },
  {
    id: "external-sessions",
    icon: <Bot className="h-4 w-4" />,
    labelKey: "settings.sections.externalSessions",
    fallbackLabel: "External Sessions",
  },
  {
    id: "tags",
    icon: <Tags className="h-4 w-4" />,
    labelKey: "settings.sections.tags",
    fallbackLabel: "Labels",
  },
  {
    id: "search",
    icon: <Code className="h-4 w-4" />,
    labelKey: "settings.sections.search",
    fallbackLabel: "Search",
  },
  {
    id: "export",
    icon: <Download className="h-4 w-4" />,
    labelKey: "settings.sections.export",
    fallbackLabel: "Export",
  },
  {
    id: "updates",
    icon: <Download className="h-4 w-4" />,
    labelKey: "settings.sections.updates",
    fallbackLabel: "Update",
  },
  {
    id: "pi-config",
    icon: <Puzzle className="h-4 w-4" />,
    labelKey: "settings.sections.piConfig",
    fallbackLabel: "Pi Config",
  },
  {
    id: "pi-live",
    icon: <Bot className="h-4 w-4" />,
    labelKey: "settings.sections.piLive",
    fallbackLabel: "Pi Live",
  },
  {
    id: "models",
    icon: <Cpu className="h-4 w-4" />,
    labelKey: "settings.sections.models",
    fallbackLabel: "Models",
  },
  {
    id: "shortcuts",
    icon: <Keyboard className="h-4 w-4" />,
    labelKey: "settings.sections.shortcuts",
    fallbackLabel: "Shortcuts",
  },
  {
    id: "advanced",
    icon: <Shield className="h-4 w-4" />,
    labelKey: "settings.sections.advanced",
    fallbackLabel: "Advanced",
  },
  {
    id: "api-test",
    icon: <Activity className="h-4 w-4" />,
    labelKey: "settings.sections.apiTest",
    fallbackLabel: "API Test",
  },
  {
    id: "import-export",
    icon: <Download className="h-4 w-4" />,
    labelKey: "settings.sections.importExport",
    fallbackLabel: "Import/Export",
  },
];

export const SETTINGS_GROUPS: SettingsGroupMeta[] = [
  {
    id: "general",
    labelKey: "settings.groups.general",
    fallbackLabel: "General",
    sections: [
      "terminal",
      "appearance",
      "language",
      "search",
      "export",
      "updates",
      "shortcuts",
    ],
  },
  {
    id: "sessions",
    labelKey: "settings.groups.sessions",
    fallbackLabel: "Sessions",
    sections: ["session", "external-sessions", "tags"],
  },
  {
    id: "agent",
    labelKey: "settings.groups.agent",
    fallbackLabel: "Agent",
    sections: ["pi-config", "pi-live", "models"],
  },
  {
    id: "system",
    labelKey: "settings.groups.system",
    fallbackLabel: "System",
    sections: ["advanced", "api-test", "import-export"],
  },
];

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
    case "terminal":
      return <TerminalSettings settings={settings} onUpdate={onUpdate} />;
    case "appearance":
      return <AppearanceSettings settings={settings} onUpdate={onUpdate} />;
    case "language":
      return <LanguageSettings settings={settings} onUpdate={onUpdate} />;
    case "session":
      return <SessionSettings settings={settings} onUpdate={onUpdate} />;
    case "external-sessions":
      return <ExternalSessionsSettings settings={settings} onUpdate={onUpdate} />;
    case "tags":
      return <TagManagerSettings />;
    case "search":
      return <SearchSettings settings={settings} onUpdate={onUpdate} />;
    case "export":
      return <ExportSettings settings={settings} onUpdate={onUpdate} />;
    case "updates":
      return <UpdateSettings settings={settings} onUpdate={onUpdate} />;
    case "pi-config":
      return <PiConfigSettings />;
    case "pi-live":
      return <PiLiveSettings settings={settings.piLive} onUpdate={onUpdate} />;
    case "models":
      return <ModelSettings />;
    case "shortcuts":
      return <ShortcutSettings />;
    case "advanced":
      return <AdvancedSettings settings={settings} onUpdate={onUpdate} />;
    case "api-test":
      return <APITestSettings />;
    case "import-export":
      return <ConfigBundleManager />;
    default:
      return null;
  }
}
