export type TerminalType =
  | "auto"
  | "iterm2"
  | "terminal"
  | "vscode"
  | "custom"
  | "tmux"
  | "wezterm"
  | "kitty"
  | "alacritty"
  | "powershell"
  | "cmd"
  | "windows-terminal"
  | "gnome-terminal"
  | "konsole"
  | "xfce4-terminal"
  | "xterm"
  | "x-terminal-emulator"
  | "tilix"
  | "mate-terminal"
  | "lxterminal";

export type Platform = "macos" | "windows" | "linux";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent || navigator.platform || "";
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "macos";
  return "linux";
}

export function getPlatformDefaults(): {
  defaultTerminal: TerminalType;
  defaultShell: string;
} {
  switch (detectPlatform()) {
    case "windows":
      return { defaultTerminal: "auto", defaultShell: "powershell.exe" };
    case "linux":
      return { defaultTerminal: "auto", defaultShell: "/bin/bash" };
    default:
      return { defaultTerminal: "auto", defaultShell: "/bin/zsh" };
  }
}

import { defaultPiLiveSettings, type PiLiveSettings } from "@/types/pi-live";

export interface AppSettings {
  piLive: PiLiveSettings;
  terminal: {
    defaultTerminal: TerminalType;
    customTerminalCommand?: string;
    /** Custom resume command to run inside the terminal. Supports {cwd}, {path}, {pi} placeholders. */
    resumeCommand?: string;
    piCommandPath: string;
    builtinTerminalEnabled: boolean;
    defaultShell: string;
    terminalFontSize: number;
  };
  appearance: {
    theme: "dark" | "light" | "system" | "custom";
    customTheme: string;
    fontFamily: string;
    fontFamilyMono: string;
    sidebarWidth: number;
    fontSize: "small" | "medium" | "large";
    codeBlockTheme: "github" | "monokai" | "dracula" | "one-dark";
    messageSpacing: "compact" | "comfortable" | "spacious";
    disableToolSuccessStyle: boolean;
  };
  language: {
    locale: string;
  };
  session: {
    autoRefresh: boolean;
    refreshInterval: number;
    defaultViewMode: "list" | "directory" | "project" | "kanban";
    sourceMode: "local" | "dataset";
    activeDatasetId: string;
    activeDatasetIds: string[];
    scanOtherAgentJsonl: boolean;
    externalSessionProviders: string[];
    showAgentIconInSessionBadge: boolean;
    showMessagePreview: boolean;
    previewLines: number;
    colorizeToolCalls: boolean;
    openPosition: "top" | "bottom";
    /** Cmd+F behavior: 'inSessionSearch' = search in current session, 'toggleSidebar' = toggle session tree */
    cmdFBehavior: "inSessionSearch" | "toggleSidebar";
    /** Scroll markers feature enabled */
    scrollMarkersEnabled: boolean;
    /** Whether the scroll markers onboarding guide has been seen */
    scrollMarkersGuideSeen: boolean;
    /** Timeline navigation dots feature enabled */
    timelineNavEnabled: boolean;
  };
  search: {
    defaultSearchMode: "content" | "name";
    caseSensitive: boolean;
    includeToolCalls: boolean;
    includeThinkingInSearch: boolean;
    highlightMatches: boolean;
  };
  export: {
    defaultFormat: "html" | "md" | "json";
    includeMetadata: boolean;
    includeTimestamps: boolean;
  };
  update: {
    autoCheck: boolean;
    channel: "stable" | "beta";
  };
  advanced: {
    sessionDirs: string[];
    cacheEnabled: boolean;
    debugMode: boolean;
    demoMode: boolean;
    maxCacheSize: number;
  };
}

/**
 * Detect system language, preferring user-saved preference
 */
function getDefaultLocale(): string {
  const saved = localStorage.getItem("app-language");
  if (saved) return saved;
  const lang = navigator.language || "en-US";
  return lang.startsWith("zh") ? "zh-CN" : "en-US";
}

const platformDefaults = getPlatformDefaults();

export const defaultSettings: AppSettings = {
  piLive: defaultPiLiveSettings,
  terminal: {
    defaultTerminal: platformDefaults.defaultTerminal,
    piCommandPath: "pi",
    builtinTerminalEnabled: true,
    defaultShell: platformDefaults.defaultShell,
    terminalFontSize: 13,
  },
  appearance: {
    theme: "dark",
    customTheme: "app-default",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif',
    fontFamilyMono:
      'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    sidebarWidth: 320,
    fontSize: "medium",
    codeBlockTheme: "github",
    messageSpacing: "comfortable",
    disableToolSuccessStyle: true,
  },
  language: {
    locale: getDefaultLocale(),
  },
  session: {
    autoRefresh: true,
    refreshInterval: 30,
    defaultViewMode: "project",
    sourceMode: "local",
    activeDatasetId: "",
    activeDatasetIds: [],
    scanOtherAgentJsonl: false,
    externalSessionProviders: [],
    showAgentIconInSessionBadge: true,
    showMessagePreview: true,
    previewLines: 2,
    colorizeToolCalls: true,
    openPosition: "top",
    cmdFBehavior: "inSessionSearch",
    scrollMarkersEnabled: false,
    scrollMarkersGuideSeen: false,
    timelineNavEnabled: false,
  },
  search: {
    defaultSearchMode: "content",
    caseSensitive: false,
    includeToolCalls: false,
    includeThinkingInSearch: false,
    highlightMatches: true,
  },
  export: {
    defaultFormat: "html",
    includeMetadata: true,
    includeTimestamps: true,
  },
  update: {
    autoCheck: true,
    channel: "stable",
  },
  advanced: {
    sessionDirs: ["~/.pi/agent/sessions"],
    cacheEnabled: true,
    debugMode: false,
    demoMode: false,
    maxCacheSize: 100,
  },
};

export type SettingsSection =
  | "terminal"
  | "appearance"
  | "language"
  | "session"
  | "external-sessions"
  | "tags"
  | "search"
  | "export"
  | "updates"
  | "pi-config"
  | "pi-live"
  | "models"
  | "shortcuts"
  | "advanced"
  | "api-test"
  | "import-export";

export type SettingsProps<T extends keyof AppSettings> = {
  settings: AppSettings;
  onUpdate: (section: T, key: keyof AppSettings[T], value: any) => void;
};

export interface TerminalSettingsProps extends SettingsProps<"terminal"> {}
export interface AppearanceSettingsProps extends SettingsProps<"appearance"> {}
export interface LanguageSettingsProps extends SettingsProps<"language"> {}
export interface SessionSettingsProps extends SettingsProps<"session"> {}
export interface SearchSettingsProps extends SettingsProps<"search"> {}
export interface ExportSettingsProps extends SettingsProps<"export"> {}
export interface UpdateSettingsProps extends SettingsProps<"update"> {}
export interface AdvancedSettingsProps extends SettingsProps<"advanced"> {}
export interface PiLiveSettingsProps extends SettingsProps<"piLive"> {}

export interface DatasetInfo {
  id: string;
  slug: string;
  displayName: string;
  sourceUrl: string;
  repoId: string;
  revision: string;
  importedAt?: string | null;
  totalFiles: number;
  totalBytes: number;
  localPath: string;
  sessionsPath: string;
  dbPath: string;
  isActive: boolean;
}

export interface DatasetImportStatus {
  taskId: string;
  datasetId: string;
  displayName: string;
  sourceUrl: string;
  phase:
    | "queued"
    | "discovering"
    | "downloading"
    | "building"
    | "completed"
    | "failed"
    | string;
  totalFiles: number;
  downloadedFiles: number;
  indexedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  error?: string | null;
  finishedAt?: string | null;
}

export interface BrowserDatasetCacheInfo {
  datasetId: string;
  cachedAt: number;
  revision: string;
  sessionCount: number;
  totalBytes: number;
}
