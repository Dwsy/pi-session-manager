import { psmPluginHost } from "@/plugins/runtime-host";
import { psmPluginSectionId } from "./settingsRegistry";
import type { SettingsSection } from "./types";

export interface SettingsSearchItem {
  /** Unique key for data-settings-search attribute and scroll target */
  id: string;
  /** Which section this setting belongs to */
  section: SettingsSection;
  /** i18n key for the setting label (e.g. "settings.terminal.builtinEnabled") */
  labelKey: string;
  /** Fallback text if i18n is missing */
  fallbackLabel: string;
  /** Additional i18n keys to search against (descriptions, help text) */
  extraKeys?: string[];
  /** Static keywords for fuzzy matching (terminal app names, etc.) */
  keywords?: string[];
}

/**
 * Static index of core searchable settings.
 * Plugin settings are derived at runtime from plugin manifests.
 * The `id` is used as `data-settings-search` for scroll targeting.
 */
export const SETTINGS_SEARCH_INDEX: SettingsSearchItem[] = [
  // ── Terminal ──
  {
    id: "terminal-builtinEnabled",
    section: "terminal",
    labelKey: "settings.terminal.builtinEnabled",
    fallbackLabel: "Built-in Terminal",
    extraKeys: ["settings.terminal.builtinEnabledHelp"],
    keywords: ["terminal", "built-in", "builtin", "integrated", "ctrl+`"],
  },
  {
    id: "terminal-defaultShell",
    section: "terminal",
    labelKey: "settings.terminal.defaultShell",
    fallbackLabel: "Default Shell",
    extraKeys: ["settings.terminal.defaultShellHelp"],
    keywords: ["shell", "zsh", "bash", "fish", "sh"],
  },
  {
    id: "terminal-fontSize",
    section: "terminal",
    labelKey: "settings.terminal.fontSize",
    fallbackLabel: "Terminal Font Size",
    keywords: ["font", "size", "terminal"],
  },
  {
    id: "terminal-defaultTerminal",
    section: "terminal",
    labelKey: "settings.terminal.defaultTerminal",
    fallbackLabel: "Default Terminal",
    keywords: [
      "terminal",
      "iterm2",
      "kitty",
      "alacritty",
      "wezterm",
      "ghostty",
      "warp",
      "zed",
      "hyper",
      "tabby",
      "foot",
      "tmux",
      "gnome",
      "konsole",
    ],
  },
  {
    id: "terminal-piCommandPath",
    section: "terminal",
    labelKey: "settings.terminal.piCommandPath",
    fallbackLabel: "Pi Command Path",
    extraKeys: ["settings.terminal.piCommandPathHelp"],
    keywords: ["pi", "path", "command", "binary"],
  },
  {
    id: "terminal-resumeCommand",
    section: "terminal",
    labelKey: "settings.terminal.resumeCommand",
    fallbackLabel: "Resume Command",
    extraKeys: ["settings.terminal.resumeCommandHelp", "settings.terminal.resumeCommandDesc"],
    keywords: ["resume", "command", "tmux", "session", "restore"],
  },

  // ── Appearance ──
  {
    id: "appearance-theme",
    section: "appearance",
    labelKey: "settings.appearance.theme",
    fallbackLabel: "Theme",
    keywords: ["theme", "dark", "light", "system", "custom", "color"],
  },
  {
    id: "appearance-fontSize",
    section: "appearance",
    labelKey: "settings.appearance.fontSize",
    fallbackLabel: "Font Size",
    keywords: ["font", "size", "text", "small", "medium", "large"],
  },
  {
    id: "appearance-fontFamily",
    section: "appearance",
    labelKey: "settings.appearance.fontFamily",
    fallbackLabel: "Font Family",
    keywords: ["font", "family", "typeface", "sans-serif"],
  },
  {
    id: "appearance-fontFamilyMono",
    section: "appearance",
    labelKey: "settings.appearance.fontFamilyMono",
    fallbackLabel: "Monospace Font Family",
    keywords: ["monospace", "mono", "code", "font", "family"],
  },
  {
    id: "appearance-codeBlockTheme",
    section: "appearance",
    labelKey: "settings.appearance.codeBlockTheme",
    fallbackLabel: "Code Block Theme",
    keywords: ["code", "block", "theme", "syntax", "highlight", "github", "monokai", "dracula"],
  },
  {
    id: "appearance-messageSpacing",
    section: "appearance",
    labelKey: "settings.appearance.messageSpacing",
    fallbackLabel: "Message Spacing",
    keywords: ["message", "spacing", "compact", "comfortable", "spacious", "layout"],
  },
  {
    id: "appearance-customTheme",
    section: "appearance",
    labelKey: "settings.appearance.customTheme",
    fallbackLabel: "Custom Theme Preset",
    extraKeys: ["settings.appearance.customThemeHelp"],
    keywords: ["custom", "theme", "preset", "pi", "agent", "themes"],
  },
  {
    id: "appearance-disableToolSuccessStyle",
    section: "appearance",
    labelKey: "settings.appearance.disableToolSuccessStyle",
    fallbackLabel: "Disable Tool Success Style",
    extraKeys: ["settings.appearance.disableToolSuccessStyleDesc"],
    keywords: ["tool", "success", "style", "green", "background", "border"],
  },
  {
    id: "appearance-disableToolCallStyle",
    section: "appearance",
    labelKey: "settings.appearance.disableToolCallStyle",
    fallbackLabel: "Disable Tool Call Style",
    extraKeys: ["settings.appearance.disableToolCallStyleDesc"],
    keywords: ["tool", "call", "execution", "style", "background", "border", "shadow"],
  },

  // ── Language ──
  {
    id: "language-locale",
    section: "language",
    labelKey: "settings.language.select",
    fallbackLabel: "Select Language",
    keywords: ["language", "locale", "i18n", "english", "chinese", "japanese", "french", "german", "spanish"],
  },

  // ── Session ──
  {
    id: "session-autoRefresh",
    section: "session-viewer",
    labelKey: "settings.session.autoRefresh",
    fallbackLabel: "Auto Refresh",
    extraKeys: ["settings.session.autoRefreshHelp"],
    keywords: ["auto", "refresh", "detect", "new", "session", "poll"],
  },
  {
    id: "session-refreshInterval",
    section: "session-viewer",
    labelKey: "settings.session.refreshInterval",
    fallbackLabel: "Refresh Interval",
    keywords: ["refresh", "interval", "interval", "seconds", "polling"],
  },
  {
    id: "session-defaultViewMode",
    section: "session-viewer",
    labelKey: "settings.session.defaultViewMode",
    fallbackLabel: "Default View Mode",
    keywords: ["view", "mode", "list", "directory", "project", "app"],
  },
  {
    id: "session-sourceMode",
    section: "local-session-paths",
    labelKey: "settings.session.sourceMode",
    fallbackLabel: "Session source",
    extraKeys: ["settings.session.sourceModeHelp"],
    keywords: ["source", "local", "dataset", "mode", "会话来源"],
  },
  {
    id: "session-scanOtherAgentJsonl",
    section: "external-agent-sessions",
    labelKey: "settings.session.scanOtherAgentJsonl",
    fallbackLabel: "Scan other agent JSONL",
    extraKeys: ["settings.session.scanOtherAgentJsonlHelp"],
    keywords: ["scan", "agent", "jsonl", "external", "other", "provider", "claude", "codex", "gemini"],
  },
  {
    id: "session-showMessagePreview",
    section: "session-viewer",
    labelKey: "settings.session.showMessagePreview",
    fallbackLabel: "Show Message Preview",
    extraKeys: ["settings.session.showMessagePreviewHelp"],
    keywords: ["message", "preview", "show", "last", "list"],
  },
  {
    id: "session-previewLines",
    section: "session-viewer",
    labelKey: "settings.session.previewLines",
    fallbackLabel: "Preview Lines",
    keywords: ["preview", "lines", "message"],
  },
  {
    id: "session-colorizeToolCalls",
    section: "session-viewer",
    labelKey: "settings.session.colorizeToolCalls",
    fallbackLabel: "Colorize Tool Calls",
    extraKeys: ["settings.session.colorizeToolCallsHelp"],
    keywords: ["color", "tool", "call", "tree"],
  },
  {
    id: "session-openPosition",
    section: "session-viewer",
    labelKey: "settings.session.openPosition",
    fallbackLabel: "Task navigation open position",
    keywords: ["open", "position", "top", "bottom", "navigation"],
  },
  {
    id: "session-cmdFBehavior",
    section: "session-viewer",
    labelKey: "settings.session.cmdFBehavior",
    fallbackLabel: "In-session Cmd+F behavior",
    extraKeys: ["settings.session.cmdFBehaviorHelp"],
    keywords: ["cmd+f", "search", "find", "session", "tree", "sidebar"],
  },
  {
    id: "session-scrollMarkersEnabled",
    section: "session-viewer",
    labelKey: "settings.session.scrollMarkersEnabled",
    fallbackLabel: "Scroll markers",
    extraKeys: ["settings.session.scrollMarkersEnabledHelp"],
    keywords: ["scroll", "marker", "navigation", "dots", "side"],
  },
  {
    id: "session-timelineNavEnabled",
    section: "session-viewer",
    labelKey: "settings.session.timelineNavEnabled",
    fallbackLabel: "Timeline navigation",
    extraKeys: ["settings.session.timelineNavEnabledHelp"],
    keywords: ["timeline", "navigation", "dots", "hover", "preview", "right"],
  },
  {
    id: "session-conversationModeEnabled",
    section: "session-viewer",
    labelKey: "settings.session.conversationModeEnabled",
    fallbackLabel: "Conversation mode",
    extraKeys: ["settings.session.conversationModeEnabledHelp"],
    keywords: ["conversation", "preview", "fold", "thinking", "tools", "assistant"],
  },
  // ── External Sessions ──
  {
    id: "external-sessions-includeInStats",
    section: "external-agent-sessions",
    labelKey: "settings.externalSessions.includeInStats",
    fallbackLabel: "Include external sessions in statistics",
    extraKeys: ["settings.externalSessions.includeInStatsHelp"],
    keywords: ["external", "agent", "provider", "stats", "statistics", "dashboard", "include"],
  },
  {
    id: "external-sessions-includeInSearch",
    section: "external-agent-sessions",
    labelKey: "settings.externalSessions.includeInSearch",
    fallbackLabel: "Include external sessions in search",
    extraKeys: ["settings.externalSessions.includeInSearchHelp"],
    keywords: ["external", "agent", "provider", "search", "include", "claude", "codex", "gemini"],
  },
  {
    id: "external-sessions-showAgentIcon",
    section: "external-agent-sessions",
    labelKey: "settings.externalSessions.showAgentIconInSessionBadge",
    fallbackLabel: "Show agent icon in SessionBadge",
    extraKeys: ["settings.externalSessions.showAgentIconInSessionBadgeHelp"],
    keywords: ["agent", "provider", "icon", "badge", "show"],
  },
  {
    id: "external-sessions-defaultResumeTarget",
    section: "resume-targets",
    labelKey: "settings.externalSessions.defaultExternalResumeTarget",
    fallbackLabel: "Default external resume target",
    extraKeys: ["settings.externalSessions.defaultExternalResumeTargetHelp"],
    keywords: ["external", "agent", "provider", "resume", "target", "default", "cli", "claude", "codex", "gemini"],
  },

  // ── Search ──
  {
    id: "search-defaultMode",
    section: "search-export",
    labelKey: "settings.search.defaultSearchMode",
    fallbackLabel: "Default Search Mode",
    keywords: ["search", "mode", "content", "name", "default"],
  },
  {
    id: "search-caseSensitive",
    section: "search-export",
    labelKey: "settings.search.caseSensitive",
    fallbackLabel: "Case Sensitive",
    keywords: ["case", "sensitive", "upper", "lower"],
  },
  {
    id: "search-includeToolCalls",
    section: "search-export",
    labelKey: "settings.search.includeToolCalls",
    fallbackLabel: "Include Tool Calls",
    extraKeys: ["settings.search.includeToolCallsHelp"],
    keywords: ["tool", "call", "include", "search"],
  },
  {
    id: "search-includeThinking",
    section: "search-export",
    labelKey: "settings.search.includeThinkingInSearch",
    fallbackLabel: "Search thinking text",
    extraKeys: ["settings.search.includeThinkingInSearchHelp"],
    keywords: ["thinking", "reasoning", "search", "include", "model"],
  },
  {
    id: "search-highlightMatches",
    section: "search-export",
    labelKey: "settings.search.highlightMatches",
    fallbackLabel: "Highlight Matches",
    extraKeys: ["settings.search.highlightMatchesHelp"],
    keywords: ["highlight", "match", "color", "search"],
  },

  // ── Export ──
  {
    id: "export-defaultFormat",
    section: "search-export",
    labelKey: "settings.export.defaultFormat",
    fallbackLabel: "Default Export Format",
    keywords: ["export", "format", "default", "json", "markdown"],
  },
  {
    id: "export-includeMetadata",
    section: "search-export",
    labelKey: "settings.export.includeMetadata",
    fallbackLabel: "Include Metadata",
    extraKeys: ["settings.export.includeMetadataHelp"],
    keywords: ["export", "metadata", "include"],
  },
  {
    id: "export-includeTimestamps",
    section: "search-export",
    labelKey: "settings.export.includeTimestamps",
    fallbackLabel: "Include Timestamps",
    extraKeys: ["settings.export.includeTimestampsHelp"],
    keywords: ["export", "timestamps", "time", "include"],
  },

  // ── Update ──
  {
    id: "update-auto-check",
    section: "app-behavior",
    labelKey: "settings.update.autoCheck",
    fallbackLabel: "Auto Check Updates",
    extraKeys: ["settings.update.autoCheckHelp"],
    keywords: ["update", "auto", "check", "daily"],
  },
  {
    id: "update-channel",
    section: "app-behavior",
    labelKey: "settings.update.channel.title",
    fallbackLabel: "Update Channel",
    extraKeys: ["settings.update.channel.description", "settings.update.channel.help"],
    keywords: ["update", "channel", "stable", "beta", "release"],
  },

  // ── Pi Config ──
  {
    id: "pi-config",
    section: "pi-agent",
    labelKey: "settings.sections.piConfig",
    fallbackLabel: "Pi Config",
    keywords: ["pi", "config", "configuration", "agent", "settings"],
  },

  // ── Pi Live ──
  {
    id: "pi-live",
    section: "pi-agent",
    labelKey: "settings.sections.piLive",
    fallbackLabel: "Pi Live",
    keywords: ["pi", "live", "realtime", "real-time", "registry"],
  },

  // ── Models ──
  {
    id: "models",
    section: "models",
    labelKey: "settings.sections.models",
    fallbackLabel: "Model Settings",
    keywords: ["model", "provider", "openai", "anthropic", "ollama", "api"],
  },

  // ── Shortcuts ──
  {
    id: "shortcuts",
    section: "shortcuts",
    labelKey: "settings.sections.shortcuts",
    fallbackLabel: "Keyboard Shortcuts",
    keywords: ["keyboard", "shortcut", "hotkey", "key", "binding"],
  },

  // ── Advanced ──
  {
    id: "advanced-serverSection",
    section: "server-access",
    labelKey: "settings.advanced.serverSection",
    fallbackLabel: "Server Settings",
    extraKeys: ["settings.advanced.serverSectionDesc"],
    keywords: ["server", "websocket", "http", "api", "port", "bind"],
  },
  {
    id: "advanced-bindAddr",
    section: "server-access",
    labelKey: "settings.advanced.bindAddr",
    fallbackLabel: "Bind Address",
    extraKeys: ["settings.advanced.bindAddrHelp"],
    keywords: ["bind", "address", "127.0.0.1", "0.0.0.0", "local", "remote"],
  },
  {
    id: "advanced-wsPort",
    section: "server-access",
    labelKey: "settings.advanced.wsPort",
    fallbackLabel: "WebSocket Port",
    keywords: ["websocket", "port", "ws"],
  },
  {
    id: "advanced-httpPort",
    section: "server-access",
    labelKey: "settings.advanced.httpPort",
    fallbackLabel: "HTTP Port",
    keywords: ["http", "port"],
  },
  {
    id: "advanced-auth",
    section: "server-access",
    labelKey: "settings.advanced.auth",
    fallbackLabel: "Authentication",
    extraKeys: ["settings.advanced.authHelp"],
    keywords: ["auth", "authentication", "token", "security", "password"],
  },
  {
    id: "advanced-apiKeys",
    section: "server-access",
    labelKey: "settings.advanced.apiKeys",
    fallbackLabel: "API Keys",
    extraKeys: ["settings.advanced.apiKeysHelp"],
    keywords: ["api", "key", "token", "bearer", "authorization"],
  },
  {
    id: "advanced-sessionDir",
    section: "local-session-paths",
    labelKey: "settings.advanced.sessionDir",
    fallbackLabel: "Session Directories",
    extraKeys: ["settings.advanced.sessionDirHelp"],
    keywords: ["session", "directory", "path", "folder", "scan"],
  },
  {
    id: "advanced-lightweightMode",
    section: "app-behavior",
    labelKey: "settings.advanced.lightweightMode",
    fallbackLabel: "Lightweight mode",
    extraKeys: ["settings.advanced.lightweightModeDesc"],
    keywords: ["tray", "minimize", "close", "hide", "lightweight", "托盘", "最小化"],
  },

  // ── Tag Manager ──
  {
    id: "tags",
    section: "tags",
    labelKey: "settings.sections.tags",
    fallbackLabel: "Labels",
    keywords: ["tag", "label", "category", "color", "organize"],
  },

  // ── Invoke Transport Test ──
  {
    id: "invoke-test",
    section: "diagnostics-maintenance",
    labelKey: "settings.sections.diagnosticsMaintenance",
    fallbackLabel: "Diagnostics & Maintenance",
    keywords: ["invoke", "transport", "ipc", "http", "websocket", "debug"],
  },

  // ── PSM Plugins ──
  {
    id: "psm-plugins-overview",
    section: "psm-plugins",
    labelKey: "settings.sections.psmPlugins",
    fallbackLabel: "PSM Plugins",
    keywords: ["psm", "plugin", "plugins", "enable", "disable", "installed"],
  },
  {
    id: "psm-plugin-marketplace",
    section: "psm-plugin-marketplace",
    labelKey: "settings.sections.psmPluginMarketplace",
    fallbackLabel: "Marketplace",
    keywords: ["psm", "plugin", "market", "marketplace", "npm", "install", "update"],
  },
  {
    id: "psm-plugin-sources",
    section: "psm-plugin-sources",
    labelKey: "settings.sections.psmPluginSources",
    fallbackLabel: "Local Sources",
    keywords: ["psm", "plugin", "path", "source", "local", "entry"],
  },
  {
    id: "psm-plugin-dev",
    section: "psm-plugin-dev",
    labelKey: "settings.sections.psmPluginDev",
    fallbackLabel: "Dev Mode",
    keywords: ["psm", "plugin", "dev", "developer", "preview", "build"],
  },
  {
    id: "psm-plugin-diagnostics",
    section: "psm-plugin-diagnostics",
    labelKey: "settings.sections.psmPluginDiagnostics",
    fallbackLabel: "Diagnostics",
    keywords: ["psm", "plugin", "diagnostics", "errors", "warnings", "health"],
  },

  // ── Import/Export (Config Bundle) ──
  {
    id: "import-export",
    section: "backup-restore",
    labelKey: "settings.sections.backupRestore",
    fallbackLabel: "Backup & Restore",
    keywords: ["import", "export", "backup", "restore", "config", "bundle"],
  },
];

/** Build a flat search index with pre-lowered text for fast matching */
export function pluginSearchId(pluginId: string, key: string) {
  const slug = pluginId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `psm-plugin-${slug}-${key}`;
}

export function getSettingsSearchIndex(): SettingsSearchItem[] {
  const pluginItems = psmPluginHost.listPlugins().flatMap((plugin) => {
    const properties = plugin.manifest?.configuration?.properties ?? [];
    const propertyItems = properties.map((property) => ({
      id: pluginSearchId(plugin.id, property.key),
      section: psmPluginSectionId(plugin.id),
      labelKey: `plugins.${plugin.id}.settings.${property.key}.title`,
      fallbackLabel: property.title,
      extraKeys: property.description
        ? [`plugins.${plugin.id}.settings.${property.key}.description`]
        : undefined,
      keywords: ["psm", "plugin", plugin.name, plugin.id, property.key],
    }));
    const permissionItems = (plugin.permissions ?? []).map((permission) => ({
      id: pluginSearchId(plugin.id, `permission-${permission.permission}`),
      section: psmPluginSectionId(plugin.id),
      labelKey: "settings.psmPlugins.authorization",
      fallbackLabel: "Authorization",
      keywords: ["psm", "plugin", "permission", "authorization", plugin.name, plugin.id, permission.permission],
    }));
    return [...propertyItems, ...permissionItems];
  });
  return [...SETTINGS_SEARCH_INDEX, ...pluginItems];
}

function buildSearchText(
  item: SettingsSearchItem,
  t: (key: string, fallback: string) => string,
): string {
  const parts = [
    t(item.labelKey, item.fallbackLabel),
    item.fallbackLabel,
    ...(item.extraKeys?.map((k) => t(k, "")) || []),
    ...(item.keywords || []),
  ];
  return parts.join(" ").toLowerCase();
}

export interface SettingsSearchResult {
  item: SettingsSearchItem;
  /** The matched section display label */
  sectionLabel: string;
  /** The matched setting display label */
  settingLabel: string;
}

export function searchSettings(
  query: string,
  t: (key: string, fallback: string) => string,
  sectionLabels: Record<string, string>,
  limit = 20,
): SettingsSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const terms = q.split(/\s+/);

  const results: SettingsSearchResult[] = [];

  for (const item of getSettingsSearchIndex()) {
    if (results.length >= limit) break;
    const text = buildSearchText(item, t);
    const matched = terms.every((term) => text.includes(term));
    if (matched) {
      results.push({
        item,
        sectionLabel: sectionLabels[item.section] || item.section,
        settingLabel: t(item.labelKey, item.fallbackLabel),
      });
    }
  }

  return results;
}
