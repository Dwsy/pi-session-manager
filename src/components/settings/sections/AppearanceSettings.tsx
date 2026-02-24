/**
 * 外观设置组件
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppearanceSettingsProps } from '../types'
import { listUserPiThemes } from '../../../utils/piTheme'

export default function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const { t } = useTranslation()
  const [piThemes, setPiThemes] = useState<string[]>([])

  const handleThemeSelect = (theme: 'dark' | 'light' | 'system' | 'custom') => {
    onUpdate('appearance', 'theme', theme)

    if (theme === 'custom' && settings.appearance.customTheme === 'app-default' && piThemes.length > 0) {
      onUpdate('appearance', 'customTheme', piThemes[0])
    }
  }

  useEffect(() => {
    let active = true

    listUserPiThemes().then((themes) => {
      if (active) {
        setPiThemes(themes)
      }
    })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.theme', '主题')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {(['dark', 'light', 'system', 'custom'] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => handleThemeSelect(theme)}
              className={`p-3 min-h-[44px] rounded-lg border text-sm transition-all ${
                settings.appearance.theme === theme
                  ? 'border-info bg-info/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border-hover'
              }`}
            >
              {t(
                `settings.appearance.themes.${theme}`,
                theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : theme === 'system' ? '跟随系统' : '自定义'
              )}
            </button>
          ))}
        </div>
      </div>

      {settings.appearance.theme === 'custom' && (
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">
            {t('settings.appearance.customTheme', 'Custom Theme Preset')}
          </label>
          <select
            value={settings.appearance.customTheme}
            onChange={(e) => onUpdate('appearance', 'customTheme', e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
          >
            <option value="app-default">{t('settings.appearance.appDefaultTheme', 'App default')}</option>
            {piThemes.length === 0 && (
              <option value="" disabled>{t('settings.appearance.noCustomThemes', 'No custom themes found')}</option>
            )}
            {piThemes.map((themeName) => (
              <option key={themeName} value={themeName}>
                {themeName}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t('settings.appearance.customThemeHelp', 'Uses theme files from ~/.pi/agent/themes')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.fontSize', '字体大小')}
        </label>
        <div className="flex flex-wrap gap-2">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => onUpdate('appearance', 'fontSize', size)}
              className={`flex-1 min-w-[80px] py-2 rounded-lg border text-sm transition-all ${
                settings.appearance.fontSize === size
                  ? 'border-info bg-info/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border-hover'
              }`}
            >
              {t(`settings.appearance.fontSizes.${size}`, size === 'small' ? '小' : size === 'medium' ? '中' : '大')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.fontFamily', 'Font Family')}
        </label>
        <input
          type="text"
          value={settings.appearance.fontFamily}
          onChange={(e) => onUpdate('appearance', 'fontFamily', e.target.value)}
          placeholder='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.fontFamilyMono', 'Monospace Font Family')}
        </label>
        <input
          type="text"
          value={settings.appearance.fontFamilyMono}
          onChange={(e) => onUpdate('appearance', 'fontFamilyMono', e.target.value)}
          placeholder='ui-monospace, "Cascadia Code", monospace'
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.codeBlockTheme', '代码块主题')}
        </label>
        <select
          value={settings.appearance.codeBlockTheme}
          onChange={(e) => onUpdate('appearance', 'codeBlockTheme', e.target.value)}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
        >
          <option value="github">GitHub</option>
          <option value="monokai">Monokai</option>
          <option value="dracula">Dracula</option>
          <option value="one-dark">One Dark</option>
        </select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.appearance.messageSpacing', '消息间距')}
        </label>
        <div className="flex flex-wrap gap-2">
          {(['compact', 'comfortable', 'spacious'] as const).map((spacing) => (
            <button
              key={spacing}
              onClick={() => onUpdate('appearance', 'messageSpacing', spacing)}
              className={`flex-1 min-w-[80px] py-2 rounded-lg border text-sm transition-all ${
                settings.appearance.messageSpacing === spacing
                  ? 'border-info bg-info/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-border-hover'
              }`}
            >
              {t(`settings.appearance.spacing.${spacing}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}