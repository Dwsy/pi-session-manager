import { useState } from 'react'
import { FolderOpen, Terminal, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SettingsField from '../SettingsField'
import SettingsInput from '../SettingsInput'
import SettingsOptionGroup from '../SettingsOptionGroup'
import SettingsRadioCardGroup from '../SettingsRadioCardGroup'
import SettingsVisualSliderField from '../SettingsVisualSliderField'
import { detectPlatform } from '../types'
import type { TerminalSettingsProps } from '../types'

const platform = detectPlatform()

const SHELL_OPTIONS = platform === 'windows'
  ? [
      { path: 'powershell.exe', label: 'PowerShell' },
      { path: 'cmd.exe', label: 'cmd' },
      { path: 'C:\\Program Files\\Git\\bin\\bash.exe', label: 'Git Bash' },
      { path: 'pwsh.exe', label: 'pwsh' },
    ]
  : [
      { path: '/bin/zsh', label: 'zsh' },
      { path: '/bin/bash', label: 'bash' },
      { path: '/bin/sh', label: 'sh' },
      { path: '/usr/local/bin/fish', label: 'fish' },
    ]

export default function TerminalSettings({ settings, onUpdate }: TerminalSettingsProps) {
  const { t } = useTranslation()
  const [isBuiltinExpanded, setIsBuiltinExpanded] = useState(settings.terminal.builtinTerminalEnabled)
  const shellOptionsMap = new Map(SHELL_OPTIONS.map((shell) => [shell.path, shell.label] as const))

  const platformTerminals = (() => {
    const common = [
      {
        id: 'auto',
        name: t('settings.terminal.options.auto.name', 'Auto'),
        description: t(
          'settings.terminal.options.auto.description',
          'Automatically choose an installed terminal on this system'
        ),
      },
      { id: 'vscode', name: t('settings.terminal.options.vscode.name'), description: t('settings.terminal.options.vscode.description') },
      { id: 'custom', name: t('settings.terminal.options.custom.name'), description: t('settings.terminal.options.custom.description') },
    ]
    switch (platform) {
      case 'windows':
        return [
          { id: 'powershell', name: 'PowerShell', description: t('settings.terminal.options.powershell.description', 'Windows PowerShell') },
          { id: 'cmd', name: 'cmd', description: t('settings.terminal.options.cmd.description', 'Command Prompt') },
          { id: 'windows-terminal', name: 'Windows Terminal', description: t('settings.terminal.options.windowsTerminal.description', 'Windows Terminal') },
          ...common,
        ]
      case 'linux':
        return [
          { id: 'gnome-terminal', name: 'GNOME Terminal', description: t('settings.terminal.options.gnomeTerminal.description', 'GNOME Terminal') },
          { id: 'konsole', name: 'Konsole', description: t('settings.terminal.options.konsole.description', 'KDE Konsole') },
          { id: 'xfce4-terminal', name: 'Xfce Terminal', description: t('settings.terminal.options.xfce4Terminal.description', 'Xfce Terminal') },
          { id: 'tilix', name: 'Tilix', description: t('settings.terminal.options.tilix.description', 'Tilix') },
          { id: 'kitty', name: 'kitty', description: t('settings.terminal.options.kitty.description', 'kitty terminal') },
          { id: 'alacritty', name: 'Alacritty', description: t('settings.terminal.options.alacritty.description', 'Alacritty terminal') },
          { id: 'wezterm', name: 'WezTerm', description: t('settings.terminal.options.wezterm.description', 'WezTerm terminal') },
          { id: 'mate-terminal', name: 'MATE Terminal', description: t('settings.terminal.options.mateTerminal.description', 'MATE Terminal') },
          { id: 'lxterminal', name: 'LXTerminal', description: t('settings.terminal.options.lxterminal.description', 'LXTerminal') },
          { id: 'xterm', name: 'xterm', description: t('settings.terminal.options.xterm.description', 'xterm') },
          { id: 'x-terminal-emulator', name: 'x-terminal-emulator', description: t('settings.terminal.options.xTerminalEmulator.description', 'System terminal launcher') },
          ...common,
        ]
      default:
        return [
          { id: 'iterm2', name: t('settings.terminal.options.iterm2.name'), description: t('settings.terminal.options.iterm2.description') },
          { id: 'terminal', name: t('settings.terminal.options.terminal.name'), description: t('settings.terminal.options.terminal.description') },
          { id: 'wezterm', name: 'WezTerm', description: t('settings.terminal.options.wezterm.description', 'WezTerm terminal') },
          { id: 'kitty', name: 'kitty', description: t('settings.terminal.options.kitty.description', 'kitty terminal') },
          { id: 'alacritty', name: 'Alacritty', description: t('settings.terminal.options.alacritty.description', 'Alacritty terminal') },
          ...common,
        ]
    }
  })()
  const terminalOptionsMap = new Map(platformTerminals.map((term) => [term.id, term] as const))

  const handleToggleBuiltin = (enabled: boolean) => {
    onUpdate('terminal', 'builtinTerminalEnabled', enabled)
    setIsBuiltinExpanded(enabled)
  }

  return (
    <div className="space-y-6">
      {/* Built-in Terminal - Modern Card Design */}
      <div className="rounded-xl border border-border overflow-hidden bg-background/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Terminal className="h-5 w-5 text-info" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground">
                {t('settings.terminal.builtinEnabled')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('settings.terminal.builtinEnabledHelp')}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleBuiltin(!settings.terminal.builtinTerminalEnabled)}
            className={`relative w-12 h-6 rounded-full motion-surface motion-color ${
              settings.terminal.builtinTerminalEnabled 
                ? 'bg-info shadow-[0_0_12px_rgba(86,156,214,0.4)]'
                : 'bg-secondary'
            }`}
            style={{ transitionDuration: 'var(--motion-duration-overlay)' }}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-md motion-transform ${
                settings.terminal.builtinTerminalEnabled ? 'translate-x-6' : ''
              }`}
              style={{ transitionDuration: 'var(--motion-duration-overlay)' }}
            />
          </button>
        </div>

        {/* Expandable Content */}
        <div
          className={`overflow-hidden ${
            isBuiltinExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
          }`}
          style={{
            transition:
              'max-height var(--motion-duration-overlay) var(--motion-ease-standard), opacity var(--motion-duration-overlay) var(--motion-ease-standard)',
          }}
        >
          <div className="p-4 space-y-5 bg-surface/30">
            {/* Default Shell */}
            <SettingsField
              label={t('settings.terminal.defaultShell')}
              className="space-y-2"
              labelClassName="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              <SettingsOptionGroup
                options={SHELL_OPTIONS.map((shell) => shell.path)}
                value={settings.terminal.defaultShell}
                onChange={(shellPath) => onUpdate('terminal', 'defaultShell', shellPath)}
                renderLabel={(shellPath) => shellOptionsMap.get(shellPath) ?? shellPath}
                containerClassName="flex flex-wrap gap-2"
                optionClassName="px-4 py-2 min-h-[40px]"
                inactiveClassName="border-border text-muted-foreground hover:border-border-hover hover:text-foreground"
              />
            </SettingsField>

            {/* Font Size Slider */}
            <SettingsVisualSliderField
              label={t('settings.terminal.fontSize')}
              value={settings.terminal.terminalFontSize}
              min={10}
              max={20}
              onChange={(value) => onUpdate('terminal', 'terminalFontSize', value)}
              valueText={`${settings.terminal.terminalFontSize}px`}
              minText="10px"
              maxText="20px"
              fieldClassName="space-y-3"
            />
          </div>
        </div>

        {/* Expand/Collapse hint */}
        <button
          onClick={() => setIsBuiltinExpanded(!isBuiltinExpanded)}
          className={`w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 motion-color motion-press focus-ring ${
            !settings.terminal.builtinTerminalEnabled && 'opacity-50 pointer-events-none'
          }`}
        >
          {isBuiltinExpanded ? (
            <><ChevronUp className="h-3 w-3" /> {t('settings.terminal.collapse')}</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> {t('settings.terminal.expandSettings')}</>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-secondary" />

      {/* Default Terminal Selection */}
      <SettingsField label={t('settings.terminal.default', '默认终端')}>
        <SettingsRadioCardGroup
          options={platformTerminals.map((term) => term.id)}
          value={settings.terminal.defaultTerminal}
          onChange={(terminalId) => onUpdate('terminal', 'defaultTerminal', terminalId)}
          name="terminal"
          getLabel={(terminalId) => terminalOptionsMap.get(terminalId)?.name ?? terminalId}
          getDescription={(terminalId) =>
            terminalOptionsMap.get(terminalId)?.description ?? ''
          }
          containerClassName="grid grid-cols-1 gap-2"
          radioClassName="text-info focus:ring-info"
        />
      </SettingsField>

      {/* Custom Terminal Command */}
      {settings.terminal.defaultTerminal === 'custom' && (
        <SettingsField
          label={t('settings.terminal.customCommand', '自定义终端命令')}
          description={t('settings.terminal.customCommandHelp', '支持 {command} / {cwd} / {path} / {pi} 占位符')}
          className="space-y-2 p-4 rounded-lg border border-border bg-surface/30 animate-in fade-in slide-in-from-top-2"
        >
          <SettingsInput
            type="text"
            value={settings.terminal.customTerminalCommand || ''}
            onChange={(e) => onUpdate('terminal', 'customTerminalCommand', e.target.value)}
            placeholder={t('settings.terminal.commandExample')}
            className="bg-surface-dark"
          />
        </SettingsField>
      )}

      {/* Pi Command Path */}
      <SettingsField
        label={t('settings.terminal.piCommandPath', 'Pi 命令路径')}
        description={t('settings.terminal.piCommandPathHelp', '如果 pi 不在系统 PATH 中，请指定完整路径')}
        className="space-y-2"
      >
        <div className="flex flex-wrap gap-2 items-center">
          <SettingsInput
            type="text"
            value={settings.terminal.piCommandPath}
            onChange={(e) => onUpdate('terminal', 'piCommandPath', e.target.value)}
            placeholder="pi"
            className="flex-1 w-auto"
          />
          <button className="px-3 py-2 bg-surface border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-border-hover motion-color motion-surface motion-press focus-ring">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </SettingsField>
    </div>
  )
}
