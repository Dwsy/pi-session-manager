import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAvailableTerminals } from "@/hooks/useAvailableTerminals";
import {
  Monitor,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Keyboard,
} from "lucide-react";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import SettingsTabs from "@/components/settings/SettingsTabs";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import SettingsVisualSliderField from "@/components/settings/SettingsVisualSliderField";
import { detectPlatform } from "@/components/settings/types";
import type { TerminalSettingsProps } from "@/components/settings/types";
import { formatShortcutDisplay } from "@/utils/platformShortcuts";

const platform = detectPlatform();

const SHELL_OPTIONS =
  platform === "windows"
    ? [
        { path: "powershell.exe", label: "PowerShell" },
        { path: "cmd.exe", label: "cmd" },
        { path: "C:\\Program Files\\Git\\bin\\bash.exe", label: "Git Bash" },
        { path: "pwsh.exe", label: "pwsh" },
      ]
    : [
        { path: "/bin/zsh", label: "zsh" },
        { path: "/bin/bash", label: "bash" },
        { path: "/bin/sh", label: "sh" },
        { path: "/usr/local/bin/fish", label: "fish" },
      ];

export default function TerminalSettings({
  settings,
  onUpdate,
}: TerminalSettingsProps) {
  const { t } = useTranslation();
  const availableTerminals = useAvailableTerminals();
  const [copiedExample, setCopiedExample] = useState<string | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "builtin" | "resume" | "shortcuts"
  >("builtin");

  const handleCopyExample = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedExample(key);
      setTimeout(() => setCopiedExample(null), 2000);
    });
  };

  const platformTerminals = (() => {
    const common = [
      {
        id: "auto",
        name: t("settings.terminal.options.auto.name", "Auto"),
        description: t(
          "settings.terminal.options.auto.description",
          "Auto detect",
        ),
      },
    ];
    switch (platform) {
      case "windows":
        return [
          {
            id: "powershell",
            name: "PowerShell",
            description: t(
              "settings.terminal.options.powershell.description",
              "Windows PowerShell",
            ),
          },
          {
            id: "cmd",
            name: "cmd",
            description: t(
              "settings.terminal.options.cmd.description",
              "Command Prompt",
            ),
          },
          {
            id: "windows-terminal",
            name: "Windows Terminal",
            description: t(
              "settings.terminal.options.windowsTerminal.description",
              "Windows Terminal",
            ),
          },
          ...common,
        ];
      case "linux":
        return [
          {
            id: "ghostty",
            name: "Ghostty",
            description: t(
              "settings.terminal.options.ghostty.description",
              "Ghostty terminal",
            ),
          },
          {
            id: "gnome-terminal",
            name: "GNOME Terminal",
            description: t(
              "settings.terminal.options.gnomeTerminal.description",
              "GNOME Terminal",
            ),
          },
          {
            id: "konsole",
            name: "Konsole",
            description: t(
              "settings.terminal.options.konsole.description",
              "KDE Konsole",
            ),
          },
          {
            id: "kitty",
            name: "kitty",
            description: t(
              "settings.terminal.options.kitty.description",
              "kitty terminal",
            ),
          },
          {
            id: "alacritty",
            name: "Alacritty",
            description: t(
              "settings.terminal.options.alacritty.description",
              "Alacritty terminal",
            ),
          },
          {
            id: "wezterm",
            name: "WezTerm",
            description: t(
              "settings.terminal.options.wezterm.description",
              "WezTerm terminal",
            ),
          },
          {
            id: "foot",
            name: "Foot",
            description: t(
              "settings.terminal.options.foot.description",
              "Wayland terminal",
            ),
          },
          {
            id: "xdg-terminal-exec",
            name: "xdg-terminal-exec",
            description: t(
              "settings.terminal.options.xdgTerminalExec.description",
              "System default terminal",
            ),
          },
          ...common,
        ];
      default:
        return [
          {
            id: "iterm2",
            name: t("settings.terminal.options.iterm2.name"),
            description: t("settings.terminal.options.iterm2.description"),
          },
          {
            id: "terminal",
            name: t("settings.terminal.options.terminal.name"),
            description: t("settings.terminal.options.terminal.description"),
          },
          {
            id: "tmux",
            name: "tmux",
            description: t(
              "settings.terminal.options.tmux.description",
              "tmux session (pi)",
            ),
          },
          {
            id: "kitty",
            name: "kitty",
            description: t(
              "settings.terminal.options.kitty.description",
              "kitty terminal",
            ),
          },
          {
            id: "alacritty",
            name: "Alacritty",
            description: t(
              "settings.terminal.options.alacritty.description",
              "Alacritty terminal",
            ),
          },
          {
            id: "wezterm",
            name: "WezTerm",
            description: t(
              "settings.terminal.options.wezterm.description",
              "WezTerm terminal",
            ),
          },
          {
            id: "ghostty",
            name: "Ghostty",
            description: t(
              "settings.terminal.options.ghostty.description",
              "Ghostty terminal",
            ),
          },
          {
            id: "warp",
            name: "Warp",
            description: t(
              "settings.terminal.options.warp.description",
              "Warp terminal",
            ),
          },
          {
            id: "zed",
            name: "Zed",
            description: t(
              "settings.terminal.options.zed.description",
              "Zed editor",
            ),
          },
          {
            id: "hyper",
            name: "Hyper",
            description: t(
              "settings.terminal.options.hyper.description",
              "Hyper terminal",
            ),
          },
          {
            id: "tabby",
            name: "Tabby",
            description: t(
              "settings.terminal.options.tabby.description",
              "Tabby terminal",
            ),
          },
          ...common,
        ];
    }
  })();

  // Filter to only show installed terminals ("auto" and "custom" always visible)
  const filteredTerminals = useMemo(() => {
    if (availableTerminals.length === 0) return platformTerminals;
    return platformTerminals.filter(
      (term) => term.id === "auto" || term.id === "custom" || availableTerminals.includes(term.id),
    );
  }, [platformTerminals, availableTerminals]);

  return (
    <div className="space-y-6">
      <SettingsTabs
        items={[
          {
            id: "builtin",
            label: t("settings.terminal.tabs.builtin", "Built-in"),
            icon: <Terminal className="h-3.5 w-3.5" />,
          },
          {
            id: "resume",
            label: t("settings.terminal.tabs.resume", "Resume"),
            icon: <Monitor className="h-3.5 w-3.5" />,
          },
          {
            id: "shortcuts",
            label: t("settings.terminal.tabs.shortcuts", "Shortcuts"),
            icon: <Keyboard className="h-3.5 w-3.5" />,
          },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "builtin" && (
        <div className="rounded-xl border border-border overflow-hidden bg-background/50">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <Terminal className="h-5 w-5 text-info" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  {t("settings.terminal.builtinEnabled", "Built-in Terminal")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "settings.terminal.builtinEnabledHelp",
                    "Use integrated terminal panel (Ctrl+`)",
                  )}
                </p>
              </div>
            </div>

            <SettingsToggleRow
              title={t("settings.terminal.builtinEnabled", "Built-in Terminal")}
              description={t(
                "settings.terminal.builtinEnabledHelp",
                "Use integrated terminal panel (Ctrl+`)",
              )}
              searchKey="terminal-builtinEnabled"
              checked={settings.terminal.builtinTerminalEnabled}
              onChange={(enabled) =>
                onUpdate("terminal", "builtinTerminalEnabled", enabled)
              }
            />
          </div>

          <div
            className={`overflow-hidden border-t border-border/50 ${
              settings.terminal.builtinTerminalEnabled
                ? "max-h-[400px] opacity-100"
                : "max-h-0 opacity-0"
            }`}
            style={{
              transition:
                "max-height var(--motion-duration-overlay) var(--motion-ease-standard), opacity var(--motion-duration-overlay) var(--motion-ease-standard)",
            }}
          >
            <div className="p-4 space-y-5 bg-surface/30">
              <SettingsField
                label={t("settings.terminal.defaultShell", "Default Shell")}
                className="space-y-2"
                labelClassName="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                searchKey="terminal-defaultShell"
              >
                <div className="flex flex-wrap gap-2">
                  {SHELL_OPTIONS.map((shell) => (
                    <button
                      key={shell.path}
                      onClick={() =>
                        onUpdate("terminal", "defaultShell", shell.path)
                      }
                      className={`px-4 py-2 rounded-lg border text-sm motion-surface motion-color motion-press focus-ring ${
                        settings.terminal.defaultShell === shell.path
                          ? "border-info bg-info/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
                      }`}
                    >
                      {shell.label}
                    </button>
                  ))}
                </div>
              </SettingsField>

              <SettingsVisualSliderField
                label={t("settings.terminal.fontSize", "Terminal Font Size")}
                searchKey="terminal-fontSize"
                value={settings.terminal.terminalFontSize}
                min={10}
                max={20}
                onChange={(value) =>
                  onUpdate("terminal", "terminalFontSize", value)
                }
                valueText={`${settings.terminal.terminalFontSize}px`}
                minText="10px"
                maxText="20px"
                fieldClassName="space-y-3"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "resume" && (
        <div className="rounded-xl border border-border overflow-hidden bg-background/50">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-success" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground">
                  {t("settings.terminal.externalTerminal", "Resume Terminal")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "settings.terminal.externalTerminalHelp",
                    "Select terminal app for resuming sessions",
                  )}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50">
                <Keyboard className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-mono">
                  {formatShortcutDisplay("Cmd+R", { symbolic: true })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-settings-search="terminal-defaultTerminal">
              {filteredTerminals.map((term) => (
                <button
                  key={term.id}
                  onClick={() =>
                    onUpdate("terminal", "defaultTerminal", term.id)
                  }
                  className={`relative p-3 rounded-lg border text-left motion-surface motion-color motion-press focus-ring ${
                    settings.terminal.defaultTerminal === term.id
                      ? "border-info bg-info/10"
                      : "border-border hover:border-border-hover"
                  }`}
                >
                  <div className="text-sm font-medium text-foreground">
                    {term.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {term.description}
                  </div>
                  {settings.terminal.defaultTerminal === term.id && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-info" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {settings.terminal.defaultTerminal !== "auto" && (
            <div className="border-t border-border/50 p-4 space-y-4 bg-surface/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-foreground">
                  {t("settings.terminal.resumeCommand", "Resume Command")}
                </span>
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-secondary rounded">
                  {t("settings.terminal.optional", "Optional")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                {t(
                  "settings.terminal.resumeCommandDesc",
                  "Leave empty for default: cd {cwd} && {pi} --session {path}",
                )}
              </p>

              <SettingsInput
                type="text"
                value={settings.terminal.resumeCommand || ""}
                onChange={(e) =>
                  onUpdate("terminal", "resumeCommand", e.target.value)
                }
                searchKey="terminal-resumeCommand"
                placeholder={t(
                  "settings.terminal.resumeCommandPlaceholder",
                  "e.g., /opt/homebrew/bin/tmux new-session -A -s pi",
                )}
                className="bg-surface-dark font-mono text-sm"
              />

              <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                <button
                  onClick={() => setShowPlaceholders(!showPlaceholders)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/30 motion-color"
                >
                  <span className="text-xs font-medium text-foreground">
                    {t(
                      "settings.terminal.placeholders",
                      "Placeholder Reference",
                    )}
                  </span>
                  {showPlaceholders ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showPlaceholders && (
                  <div className="px-3 pb-3 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      {t(
                        "settings.terminal.placeholdersHelp",
                        "Use these placeholders in the resume command",
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        {
                          key: "{cwd}",
                          desc: t(
                            "settings.terminal.placeholderCwdDesc",
                            "Session working directory",
                          ),
                          example: "/Users/dengwenyu/Dev/AI/project",
                        },
                        {
                          key: "{path}",
                          desc: t(
                            "settings.terminal.placeholderPathDesc",
                            "Session file path",
                          ),
                          example:
                            "/Users/dengwenyu/.pi/agent/sessions/.../2026-04-07_abc123.jsonl",
                        },
                        {
                          key: "{pi}",
                          desc: t(
                            "settings.terminal.placeholderPiDesc",
                            "Pi command path",
                          ),
                          example: "pi",
                        },
                      ].map((ph) => (
                        <div
                          key={ph.key}
                          className="flex flex-col gap-1 p-2 rounded-md bg-secondary/30"
                        >
                          <div className="flex items-center gap-2">
                            <code className="text-[11px] font-mono text-info bg-info/10 px-1.5 py-0.5 rounded shrink-0">
                              {ph.key}
                            </code>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {ph.desc}
                          </span>
                          <code
                            className="text-[10px] font-mono text-muted-foreground/70 truncate"
                            title={ph.example}
                          >
                            {ph.example}
                          </code>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                        {t(
                          "settings.terminal.howItWorks",
                          "How it works (tmux)",
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-start gap-2 text-[11px]">
                          <span className="text-muted-foreground font-medium shrink-0 w-16">
                            tmux:
                          </span>
                          <span className="text-muted-foreground">
                            Attach existing or create session
                          </span>
                        </div>
                        <code className="block text-[11px] font-mono text-info bg-info/10 px-2 py-1 rounded break-all">
                          {"{tmux setup}"} && {"{pi}"} --session {"{path}"}
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground">
                  {t("settings.terminal.examples", "Examples")}
                </span>
                {[
                  {
                    key: "tmux-session",
                    label: t(
                      "settings.terminal.exampleTmuxSession",
                      "tmux session",
                    ),
                    command:
                      "/opt/homebrew/bin/tmux new-session -A -s {session}",
                  },
                  {
                    key: "default",
                    label: t(
                      "settings.terminal.exampleDefault",
                      "Default (leave empty)",
                    ),
                    command: "cd {cwd} && {pi} --session {path}",
                  },
                ].map((example) => (
                  <div
                    key={example.key}
                    className="rounded-lg border border-border bg-background/50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <span className="text-[11px] text-muted-foreground">
                        {example.label}
                      </span>
                      <button
                        onClick={() =>
                          handleCopyExample(example.command, example.key)
                        }
                        className="p-1 rounded hover:bg-secondary motion-color motion-press focus-ring"
                        title="Copy"
                      >
                        {copiedExample === example.key ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    <pre className="px-3 py-2 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap break-all">
                      {example.command}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border/50 p-4">
            <SettingsField
              label={t("settings.terminal.piCommandPath", "Pi Command Path")}
              description={t(
                "settings.terminal.piCommandPathHelp",
                "Specify full path if pi is not in system PATH",
              )}
              className="space-y-2"
              searchKey="terminal-piCommandPath"
            >
              <SettingsInput
                type="text"
                value={settings.terminal.piCommandPath}
                onChange={(e) =>
                  onUpdate("terminal", "piCommandPath", e.target.value)
                }
                placeholder="pi"
                className="font-mono text-sm"
              />
            </SettingsField>
          </div>
        </div>
      )}

      {activeTab === "shortcuts" && (
        <div className="rounded-xl border border-border bg-background/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t("settings.shortcuts.title", "Keyboard Shortcuts")}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">
                {t(
                  "settings.terminal.shortcutResume",
                  "Resume session in terminal",
                )}
              </span>
              <kbd className="px-2 py-0.5 rounded bg-secondary text-[11px] font-mono text-foreground">
                {formatShortcutDisplay("Cmd+R", { symbolic: true })}
              </kbd>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">
                {t(
                  "settings.terminal.shortcutToggle",
                  "Toggle built-in terminal",
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <kbd className="px-2 py-0.5 rounded bg-secondary text-[11px] font-mono text-foreground">
                  {formatShortcutDisplay("Ctrl+`", { symbolic: true })}
                </kbd>
                <span className="text-xs text-muted-foreground">/</span>
                <kbd className="px-2 py-0.5 rounded bg-secondary text-[11px] font-mono text-foreground">
                  {formatShortcutDisplay("Cmd+J", { symbolic: true })}
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
