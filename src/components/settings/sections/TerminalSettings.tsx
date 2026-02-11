import { useTranslation } from 'react-i18next'
import { FolderOpen, Terminal, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { TerminalSettingsProps } from '../types'

const SHELL_OPTIONS = [
  { path: '/bin/zsh', label: 'zsh' },
  { path: '/bin/bash', label: 'bash' },
  { path: '/bin/sh', label: 'sh' },
  { path: '/usr/local/bin/fish', label: 'fish' },
]

export default function TerminalSettings({ settings, onUpdate }: TerminalSettingsProps) {
  const { t } = useTranslation()
  const [isBuiltinExpanded, setIsBuiltinExpanded] = useState(settings.terminal.builtinTerminalEnabled)

  const terminals = [
    { id: 'iterm2', name: t('settings.terminal.options.iterm2.name'), description: t('settings.terminal.options.iterm2.description') },
    { id: 'terminal', name: t('settings.terminal.options.terminal.name'), description: t('settings.terminal.options.terminal.description') },
    { id: 'vscode', name: t('settings.terminal.options.vscode.name'), description: t('settings.terminal.options.vscode.description') },
    { id: 'custom', name: t('settings.terminal.options.custom.name'), description: t('settings.terminal.options.custom.description') },
  ]

  const handleToggleBuiltin = (enabled: boolean) => {
    onUpdate('terminal', 'builtinTerminalEnabled', enabled)
    setIsBuiltinExpanded(enabled)
  }

  return (
    <div className="space-y-6">
      {/* Built-in Terminal - Modern Card Design */}
      <div className="rounded-xl border border-[#2c2d3b] overflow-hidden bg-[#191a26]/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2c2d3b]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#569cd6]/10 flex items-center justify-center">
              <Terminal className="h-5 w-5 text-[#569cd6]" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-white">
                {t('settings.terminal.builtinEnabled')}
              </h4>
              <p className="text-xs text-[#6a6f85]">
                {t('settings.terminal.builtinEnabledHelp')}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggleBuiltin(!settings.terminal.builtinTerminalEnabled)}
            className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
              settings.terminal.builtinTerminalEnabled 
                ? 'bg-[#569cd6] shadow-[0_0_12px_rgba(86,156,214,0.4)]' 
                : 'bg-[#2c2d3b]'
            }`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
              settings.terminal.builtinTerminalEnabled ? 'translate-x-6' : ''
            }`} />
          </button>
        </div>

        {/* Expandable Content */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isBuiltinExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="p-4 space-y-5 bg-[#252636]/30">
            {/* Default Shell */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#6a6f85] uppercase tracking-wide">
                {t('settings.terminal.defaultShell')}
              </label>
              <div className="flex gap-2">
                {SHELL_OPTIONS.map(s => (
                  <button
                    key={s.path}
                    onClick={() => onUpdate('terminal', 'defaultShell', s.path)}
                    className={`px-4 py-2 text-sm rounded-lg border transition-all duration-200 ${
                      settings.terminal.defaultShell === s.path
                        ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                        : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f] hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#6a6f85] uppercase tracking-wide">
                  {t('settings.terminal.fontSize')}
                </label>
                <span className="text-sm font-mono text-[#569cd6]">{settings.terminal.terminalFontSize}px</span>
              </div>
              <div className="relative h-6 flex items-center">
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-[#2c2d3b]" />
                <div 
                  className="absolute h-1.5 rounded-full bg-gradient-to-r from-[#569cd6] to-[#7bb3e0]"
                  style={{ width: `${((settings.terminal.terminalFontSize - 10) / 10) * 100}%` }}
                />
                <input
                  type="range"
                  min={10}
                  max={20}
                  value={settings.terminal.terminalFontSize}
                  onChange={(e) => onUpdate('terminal', 'terminalFontSize', Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div 
                  className="absolute w-5 h-5 rounded-full bg-[#569cd6] shadow-[0_0_8px_rgba(86,156,214,0.6)] border-2 border-white/20 pointer-events-none transition-all duration-150"
                  style={{ left: `calc(${((settings.terminal.terminalFontSize - 10) / 10) * 100}% - 10px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-[#6a6f85]">
                <span>10px</span>
                <span>20px</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expand/Collapse hint */}
        <button
          onClick={() => setIsBuiltinExpanded(!isBuiltinExpanded)}
          className={`w-full flex items-center justify-center gap-1 py-2 text-xs text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]/30 transition-all duration-200 ${
            !settings.terminal.builtinTerminalEnabled && 'opacity-50 pointer-events-none'
          }`}
        >
          {isBuiltinExpanded ? (
            <><ChevronUp className="h-3 w-3" /> 收起</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> 展开设置</>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#2c2d3b]" />

      {/* Default Terminal Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.terminal.default', '默认终端')}
        </label>
        <div className="grid grid-cols-1 gap-2">
          {terminals.map((term) => (
            <label
              key={term.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                settings.terminal.defaultTerminal === term.id
                  ? 'border-[#569cd6] bg-[#569cd6]/10'
                  : 'border-[#2c2d3b] hover:border-[#3a3b4f]'
              }`}
            >
              <input
                type="radio"
                name="terminal"
                value={term.id}
                checked={settings.terminal.defaultTerminal === term.id}
                onChange={(e) => onUpdate('terminal', 'defaultTerminal', e.target.value)}
                className="text-[#569cd6] focus:ring-[#569cd6]"
              />
              <div>
                <div className="text-sm font-medium text-white">{term.name}</div>
                <div className="text-xs text-[#6a6f85]">{term.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Custom Terminal Command */}
      {settings.terminal.defaultTerminal === 'custom' && (
        <div className="space-y-2 p-4 rounded-lg border border-[#2c2d3b] bg-[#252636]/30 animate-in fade-in slide-in-from-top-2">
          <label className="text-sm font-medium text-white">
            {t('settings.terminal.customCommand', '自定义终端命令')}
          </label>
          <input
            type="text"
            value={settings.terminal.customTerminalCommand || ''}
            onChange={(e) => onUpdate('terminal', 'customTerminalCommand', e.target.value)}
            placeholder={t('settings.terminal.commandExample')}
            className="w-full px-3 py-2 bg-[#1e1f2e] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6] transition-colors"
          />
          <p className="text-xs text-[#6a6f85]">
            {t('settings.terminal.customCommandHelp', '使用 {path} 作为会话路径占位符')}
          </p>
        </div>
      )}

      {/* Pi Command Path */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white">
          {t('settings.terminal.piCommandPath', 'Pi 命令路径')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.terminal.piCommandPath}
            onChange={(e) => onUpdate('terminal', 'piCommandPath', e.target.value)}
            placeholder="pi"
            className="flex-1 px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6] transition-colors"
          />
          <button className="px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-[#6a6f85] hover:text-white hover:border-[#3a3b4f] transition-colors">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-[#6a6f85]">
          {t('settings.terminal.piCommandPathHelp', '如果 pi 不在系统 PATH 中，请指定完整路径')}
        </p>
      </div>
    </div>
  )
}
