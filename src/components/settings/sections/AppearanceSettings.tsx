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
          <optgroup label="GitHub">
            <option value="github-dark">GitHub Dark</option>
            <option value="github-light">GitHub Light</option>
            <option value="github-dark-dimmed">GitHub Dark Dimmed</option>
            <option value="github-dark-high-contrast">GitHub Dark High Contrast</option>
            <option value="github-light-high-contrast">GitHub Light High Contrast</option>
          </optgroup>
          <optgroup label="VS Code">
            <option value="dark-plus">Dark+</option>
            <option value="light-plus">Light+</option>
            <option value="one-dark-pro">One Dark Pro</option>
            <option value="one-light">One Light</option>
          </optgroup>
          <optgroup label="Popular">
            <option value="monokai">Monokai</option>
            <option value="dracula">Dracula</option>
            <option value="dracula-soft">Dracula Soft</option>
            <option value="nord">Nord</option>
            <option value="tokyo-night">Tokyo Night</option>
            <option value="night-owl">Night Owl</option>
            <option value="synthwave-84">Synthwave '84</option>
          </optgroup>
          <optgroup label="Catppuccin">
            <option value="catppuccin-mocha">Catppuccin Mocha</option>
            <option value="catppuccin-latte">Catppuccin Latte</option>
            <option value="catppuccin-frappe">Catppuccin Frappé</option>
            <option value="catppuccin-macchiato">Catppuccin Macchiato</option>
          </optgroup>
          <optgroup label="Rosé Pine">
            <option value="rose-pine">Rosé Pine</option>
            <option value="rose-pine-moon">Rosé Pine Moon</option>
            <option value="rose-pine-dawn">Rosé Pine Dawn</option>
          </optgroup>
          <optgroup label="Vitesse">
            <option value="vitesse-dark">Vitesse Dark</option>
            <option value="vitesse-light">Vitesse Light</option>
            <option value="vitesse-black">Vitesse Black</option>
          </optgroup>
          <optgroup label="Solarized">
            <option value="solarized-dark">Solarized Dark</option>
            <option value="solarized-light">Solarized Light</option>
          </optgroup>
          <optgroup label="Gruvbox">
            <option value="gruvbox-dark-medium">Gruvbox Dark Medium</option>
            <option value="gruvbox-light-medium">Gruvbox Light Medium</option>
          </optgroup>
          <optgroup label="Material Theme">
            <option value="material-theme">Material Theme</option>
            <option value="material-theme-darker">Material Theme Darker</option>
            <option value="material-theme-lighter">Material Theme Lighter</option>
            <option value="material-theme-ocean">Material Theme Ocean</option>
            <option value="material-theme-palenight">Material Theme Palenight</option>
          </optgroup>
          <optgroup label="Other">
            <option value="ayu-dark">Ayu Dark</option>
            <option value="everforest-dark">Everforest Dark</option>
            <option value="everforest-light">Everforest Light</option>
            <option value="min-dark">Min Dark</option>
            <option value="min-light">Min Light</option>
          </optgroup>
        </select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.appearance.mermaidRenderMode', 'Mermaid 渲染')}
        </label>
        <div className="flex gap-2">
          {(['ascii', 'svg'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onUpdate('appearance', 'mermaidRenderMode', mode)}
              className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                settings.appearance.mermaidRenderMode === mode
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {mode === 'ascii' ? 'ASCII' : 'SVG'}
            </button>
          ))}
        </div>
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
