/**
 * 导出设置组件
 */

import { useTranslation } from 'react-i18next'
import type { ExportSettingsProps } from '../types'

export default function ExportSettings({ settings, onUpdate }: ExportSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.export.defaultFormat', '默认导出格式')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['html', 'md', 'json'] as const).map((format) => (
            <button
              key={format}
              onClick={() => onUpdate('export', 'defaultFormat', format)}
              className={`py-2 rounded-lg border text-sm transition-all ${
                settings.export.defaultFormat === format
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.export.includeMetadata', '包含元数据')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.export.includeMetadataHelp', '导出时包含会话元数据')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.export.includeMetadata}
            onChange={(e) => onUpdate('export', 'includeMetadata', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.export.includeTimestamps', '包含时间戳')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.export.includeTimestampsHelp', '导出时包含消息时间戳')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.export.includeTimestamps}
            onChange={(e) => onUpdate('export', 'includeTimestamps', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>
    </div>
  )
}