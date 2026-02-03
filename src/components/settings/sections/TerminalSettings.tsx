/**
 * 终端设置组件
 */

import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import type { TerminalSettingsProps } from '../types'

export default function TerminalSettings({ settings, onUpdate }: TerminalSettingsProps) {
  const { t } = useTranslation()

  const terminals = [
    { id: 'iterm2', name: t('settings.terminal.options.iterm2.name'), description: t('settings.terminal.options.iterm2.description') },
    { id: 'terminal', name: t('settings.terminal.options.terminal.name'), description: t('settings.terminal.options.terminal.description') },
    { id: 'vscode', name: t('settings.terminal.options.vscode.name'), description: t('settings.terminal.options.vscode.description') },
    { id: 'custom', name: t('settings.terminal.options.custom.name'), description: t('settings.terminal.options.custom.description') },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.terminal.default', '默认终端')}
        </label>
        <div className="space-y-2">
          {terminals.map((term) => (
            <label
              key={term.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
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
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-white">{term.name}</div>
                <div className="text-xs text-[#6a6f85]">{term.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {settings.terminal.defaultTerminal === 'custom' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {t('settings.terminal.customCommand', '自定义终端命令')}
          </label>
          <input
            type="text"
            value={settings.terminal.customTerminalCommand || ''}
            onChange={(e) => onUpdate('terminal', 'customTerminalCommand', e.target.value)}
            placeholder={t('settings.terminal.commandExample')}
            className="w-full px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6]"
          />
          <p className="text-xs text-[#6a6f85]">
            {t('settings.terminal.customCommandHelp', '使用 {path} 作为会话路径占位符')}
          </p>
        </div>
      )}

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
            className="flex-1 px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6]"
          />
          <button className="px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-[#6a6f85] hover:text-white transition-colors">
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