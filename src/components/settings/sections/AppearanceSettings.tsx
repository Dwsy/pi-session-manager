/**
 * 外观设置组件
 */

import { useTranslation } from 'react-i18next'
import type { AppearanceSettingsProps } from '../types'

export default function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.appearance.theme', '主题')}
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['dark', 'light', 'system'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => onUpdate('appearance', 'theme', theme)}
              className={`p-3 rounded-lg border text-sm transition-all ${
                settings.appearance.theme === theme
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {t(`settings.appearance.themes.${theme}`, theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : '跟随系统')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.appearance.fontSize', '字体大小')}
        </label>
        <div className="flex gap-2">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => onUpdate('appearance', 'fontSize', size)}
              className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                settings.appearance.fontSize === size
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {t(`settings.appearance.fontSizes.${size}`, size === 'small' ? '小' : size === 'medium' ? '中' : '大')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.appearance.codeBlockTheme', '代码块主题')}
        </label>
        <select
          value={settings.appearance.codeBlockTheme}
          onChange={(e) => onUpdate('appearance', 'codeBlockTheme', e.target.value)}
          className="w-full px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white focus:outline-none focus:border-[#569cd6]"
        >
          <option value="github">GitHub</option>
          <option value="monokai">Monokai</option>
          <option value="dracula">Dracula</option>
          <option value="one-dark">One Dark</option>
        </select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.appearance.messageSpacing', '消息间距')}
        </label>
        <div className="flex gap-2">
          {(['compact', 'comfortable', 'spacious'] as const).map((spacing) => (
            <button
              key={spacing}
              onClick={() => onUpdate('appearance', 'messageSpacing', spacing)}
              className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                settings.appearance.messageSpacing === spacing
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {t(
                `settings.appearance.spacing.${spacing}`,
                spacing === 'compact' ? '紧凑' : spacing === 'comfortable' ? '舒适' : '宽松'
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}