// ─── Settings Tab ────────────────────────────────────────────────────────────

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
const QUEUE_MODES = ["one-at-a-time", "all"] as const;
const DOUBLE_ESC_ACTIONS = ["tree", "fork", "none"] as const;
const EDITOR_PADDINGS = ["0", "1", "2", "3"] as const;
const AUTOCOMPLETE_ITEMS = ["3", "5", "7", "10", "15", "20"] as const;

export interface SettingDef {
  key: string; // supports dot-notation for nested: "compaction.enabled"
  labelKey: string;
  fallbackLabel: string;
  descKey: string;
  fallbackDesc: string;
  type: "bool" | "enum" | "text" | "number" | "model-provider" | "model-id";
  options?: readonly string[];
  defaultValue?: unknown; // default when undefined in settings.json (from pi source)
  group: string;
  groupKey: string;
}

/** Resolve a dot-notation key from a nested object */
export function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export const SETTINGS: SettingDef[] = [
  // ── Model ──
  {
    key: "defaultProvider",
    labelKey: "settings.piConfig.setting.provider",
    fallbackLabel: "Provider",
    descKey: "settings.piConfig.settingDesc.provider",
    fallbackDesc: "Default provider for new sessions",
    type: "model-provider",
    group: "Model",
    groupKey: "settings.piConfig.group.model",
  },
  {
    key: "defaultModel",
    labelKey: "settings.piConfig.setting.model",
    fallbackLabel: "Model",
    descKey: "settings.piConfig.settingDesc.model",
    fallbackDesc: "Default model for new sessions",
    type: "model-id",
    group: "Model",
    groupKey: "settings.piConfig.group.model",
  },
  {
    key: "defaultThinkingLevel",
    labelKey: "settings.piConfig.setting.thinking",
    fallbackLabel: "Thinking level",
    descKey: "settings.piConfig.settingDesc.thinking",
    fallbackDesc: "Reasoning depth for thinking-capable models",
    type: "enum",
    options: THINKING_LEVELS,
    group: "Model",
    groupKey: "settings.piConfig.group.model",
  },
  // ── Behavior ──
  {
    key: "steeringMode",
    labelKey: "settings.piConfig.setting.steering",
    fallbackLabel: "Steering mode",
    descKey: "settings.piConfig.settingDesc.steering",
    fallbackDesc: "How steering messages are delivered while streaming",
    type: "enum",
    options: QUEUE_MODES,
    defaultValue: "one-at-a-time",
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "followUpMode",
    labelKey: "settings.piConfig.setting.followUp",
    fallbackLabel: "Follow-up mode",
    descKey: "settings.piConfig.settingDesc.followUp",
    fallbackDesc: "How follow-up messages are delivered",
    type: "enum",
    options: QUEUE_MODES,
    defaultValue: "one-at-a-time",
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "hideThinkingBlock",
    labelKey: "settings.piConfig.setting.hideThinking",
    fallbackLabel: "Hide thinking",
    descKey: "settings.piConfig.settingDesc.hideThinking",
    fallbackDesc: "Hide thinking blocks in responses",
    type: "bool",
    defaultValue: false,
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "quietStartup",
    labelKey: "settings.piConfig.setting.quietStartup",
    fallbackLabel: "Quiet startup",
    descKey: "settings.piConfig.settingDesc.quietStartup",
    fallbackDesc: "Disable verbose startup output",
    type: "bool",
    defaultValue: false,
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "collapseChangelog",
    labelKey: "settings.piConfig.setting.collapseChangelog",
    fallbackLabel: "Collapse changelog",
    descKey: "settings.piConfig.settingDesc.collapseChangelog",
    fallbackDesc: "Condensed changelog after updates",
    type: "bool",
    defaultValue: false,
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "enableSkillCommands",
    labelKey: "settings.piConfig.setting.skillCommands",
    fallbackLabel: "Skill commands",
    descKey: "settings.piConfig.settingDesc.skillCommands",
    fallbackDesc: "Register skills as /skill:name commands",
    type: "bool",
    defaultValue: true,
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "doubleEscapeAction",
    labelKey: "settings.piConfig.setting.doubleEscape",
    fallbackLabel: "Double-escape action",
    descKey: "settings.piConfig.settingDesc.doubleEscape",
    fallbackDesc: "Action when pressing Escape twice with empty editor",
    type: "enum",
    options: DOUBLE_ESC_ACTIONS,
    defaultValue: "tree",
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "shellPath",
    labelKey: "settings.piConfig.setting.shell",
    fallbackLabel: "Shell path",
    descKey: "settings.piConfig.settingDesc.shell",
    fallbackDesc: "Custom shell for bash tool",
    type: "text",
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  {
    key: "shellCommandPrefix",
    labelKey: "settings.piConfig.setting.shellPrefix",
    fallbackLabel: "Shell prefix",
    descKey: "settings.piConfig.settingDesc.shellPrefix",
    fallbackDesc: "Prefix prepended to shell commands",
    type: "text",
    group: "Behavior",
    groupKey: "settings.piConfig.group.behavior",
  },
  // ── Compaction & Retry ──
  {
    key: "compaction.enabled",
    labelKey: "settings.piConfig.setting.compaction",
    fallbackLabel: "Auto-compact",
    descKey: "settings.piConfig.settingDesc.compaction",
    fallbackDesc: "Automatically compact context when too large",
    type: "bool",
    defaultValue: true,
    group: "Advanced",
    groupKey: "settings.piConfig.group.advanced",
  },
  {
    key: "compaction.reserveTokens",
    labelKey: "settings.piConfig.setting.compactReserve",
    fallbackLabel: "Compact reserve tokens",
    descKey: "settings.piConfig.settingDesc.compactReserve",
    fallbackDesc: "Tokens reserved for compaction summary (default: 16384)",
    type: "number",
    defaultValue: 16384,
    group: "Advanced",
    groupKey: "settings.piConfig.group.advanced",
  },
  {
    key: "compaction.keepRecentTokens",
    labelKey: "settings.piConfig.setting.compactKeepRecent",
    fallbackLabel: "Keep recent tokens",
    descKey: "settings.piConfig.settingDesc.compactKeepRecent",
    fallbackDesc: "Recent tokens preserved during compaction (default: 20000)",
    type: "number",
    defaultValue: 20000,
    group: "Advanced",
    groupKey: "settings.piConfig.group.advanced",
  },
  {
    key: "retry.enabled",
    labelKey: "settings.piConfig.setting.retry",
    fallbackLabel: "Auto-retry",
    descKey: "settings.piConfig.settingDesc.retry",
    fallbackDesc: "Automatically retry on transient errors",
    type: "bool",
    defaultValue: true,
    group: "Advanced",
    groupKey: "settings.piConfig.group.advanced",
  },
  {
    key: "retry.maxRetries",
    labelKey: "settings.piConfig.setting.retryMax",
    fallbackLabel: "Max retries",
    descKey: "settings.piConfig.settingDesc.retryMax",
    fallbackDesc: "Maximum retry attempts (default: 3)",
    type: "number",
    defaultValue: 3,
    group: "Advanced",
    groupKey: "settings.piConfig.group.advanced",
  },
  // ── Images & Terminal ──
  {
    key: "terminal.showImages",
    labelKey: "settings.piConfig.setting.showImages",
    fallbackLabel: "Show images",
    descKey: "settings.piConfig.settingDesc.showImages",
    fallbackDesc: "Render images inline in terminal",
    type: "bool",
    defaultValue: true,
    group: "Terminal",
    groupKey: "settings.piConfig.group.terminal",
  },
  {
    key: "terminal.clearOnShrink",
    labelKey: "settings.piConfig.setting.clearOnShrink",
    fallbackLabel: "Clear on shrink",
    descKey: "settings.piConfig.settingDesc.clearOnShrink",
    fallbackDesc: "Clear empty rows when content shrinks (may flicker)",
    type: "bool",
    defaultValue: false,
    group: "Terminal",
    groupKey: "settings.piConfig.group.terminal",
  },
  {
    key: "images.autoResize",
    labelKey: "settings.piConfig.setting.autoResize",
    fallbackLabel: "Auto-resize images",
    descKey: "settings.piConfig.settingDesc.autoResize",
    fallbackDesc: "Resize large images to 2000×2000 for model compatibility",
    type: "bool",
    defaultValue: true,
    group: "Terminal",
    groupKey: "settings.piConfig.group.terminal",
  },
  {
    key: "images.blockImages",
    labelKey: "settings.piConfig.setting.blockImages",
    fallbackLabel: "Block images",
    descKey: "settings.piConfig.settingDesc.blockImages",
    fallbackDesc: "Prevent images from being sent to LLM providers",
    type: "bool",
    defaultValue: false,
    group: "Terminal",
    groupKey: "settings.piConfig.group.terminal",
  },
  // ── Appearance ──
  {
    key: "theme",
    labelKey: "settings.piConfig.setting.theme",
    fallbackLabel: "Theme",
    descKey: "settings.piConfig.settingDesc.theme",
    fallbackDesc: "Pi TUI color theme",
    type: "text",
    group: "Appearance",
    groupKey: "settings.piConfig.group.appearance",
  },
  {
    key: "showHardwareCursor",
    labelKey: "settings.piConfig.setting.hwCursor",
    fallbackLabel: "Hardware cursor",
    descKey: "settings.piConfig.settingDesc.hwCursor",
    fallbackDesc: "Show terminal cursor for IME support",
    type: "bool",
    defaultValue: false,
    group: "Appearance",
    groupKey: "settings.piConfig.group.appearance",
  },
  {
    key: "editorPaddingX",
    labelKey: "settings.piConfig.setting.editorPadding",
    fallbackLabel: "Editor padding",
    descKey: "settings.piConfig.settingDesc.editorPadding",
    fallbackDesc: "Horizontal padding for input editor (0-3)",
    type: "enum",
    options: EDITOR_PADDINGS,
    defaultValue: "0",
    group: "Appearance",
    groupKey: "settings.piConfig.group.appearance",
  },
  {
    key: "autocompleteMaxVisible",
    labelKey: "settings.piConfig.setting.autocompleteMax",
    fallbackLabel: "Autocomplete items",
    descKey: "settings.piConfig.settingDesc.autocompleteMax",
    fallbackDesc: "Max visible items in autocomplete dropdown (3-20)",
    type: "enum",
    options: AUTOCOMPLETE_ITEMS,
    defaultValue: "5",
    group: "Appearance",
    groupKey: "settings.piConfig.group.appearance",
  },
];
