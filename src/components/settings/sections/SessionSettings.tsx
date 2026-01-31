/**
 * 会话设置组件
 */

import { useTranslation } from 'react-i18next'
import type { SessionSettingsProps } from '../types'

export default function SessionSettings({ settings, onUpdate }: SessionSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.session.autoRefresh', '自动刷新')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.session.autoRefreshHelp', '自动检测新会话')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.autoRefresh}
            onChange={(e) => onUpdate('session', 'autoRefresh', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      {settings.session.autoRefresh && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {t('settings.session.refreshInterval', '刷新间隔')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="5"
              max="300"
              step="5"
              value={settings.session.refreshInterval}
              onChange={(e) => onUpdate('session', 'refreshInterval', parseInt(e.target.value))}
              className="flex-1 h-2 bg-[#2c2d3b] rounded-lg appearance-none cursor-pointer accent-[#569cd6]"
            />
            <span className="text-sm text-[#6a6f85] w-16 text-right">
              {settings.session.refreshInterval}s
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.session.defaultViewMode', '默认视图模式')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['list', 'directory', 'project'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onUpdate('session', 'defaultViewMode', mode)}
              className={`py-2 rounded-lg border text-sm transition-all ${
                settings.session.defaultViewMode === mode
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {t(
                `settings.session.viewModes.${mode}`,
                mode === 'list' ? '列表' : mode === 'directory' ? '目录' : '项目'
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.session.showMessagePreview', '显示消息预览')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.session.showMessagePreviewHelp', '在会话列表中显示最后一条消息')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.session.showMessagePreview}
            onChange={(e) => onUpdate('session', 'showMessagePreview', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      {settings.session.showMessagePreview && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {t('settings.session.previewLines', '预览行数')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="5"
              value={settings.session.previewLines}
              onChange={(e) => onUpdate('session', 'previewLines', parseInt(e.target.value))}
              className="flex-1 h-2 bg-[#2c2d3b] rounded-lg appearance-none cursor-pointer accent-[#569cd6]"
            />
            <span className="text-sm text-[#6a6f85] w-8 text-right">
              {settings.session.previewLines}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}