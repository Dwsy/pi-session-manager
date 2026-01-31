/**
 * 高级设置组件
 */

import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react'
import type { AdvancedSettingsProps } from '../types'

export default function AdvancedSettings({ settings, onUpdate }: AdvancedSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-white">
          {t('settings.advanced.sessionDir', '会话目录')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.advanced.sessionDir}
            onChange={(e) => onUpdate('advanced', 'sessionDir', e.target.value)}
            className="flex-1 px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white focus:outline-none focus:border-[#569cd6]"
          />
          <button className="px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-[#6a6f85] hover:text-white transition-colors">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-[#6a6f85]">
          {t('settings.advanced.sessionDirHelp', 'Pi 会话文件的存储位置')}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.advanced.cacheEnabled', '启用缓存')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.advanced.cacheEnabledHelp', '缓存会话数据以提高性能')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advanced.cacheEnabled}
            onChange={(e) => onUpdate('advanced', 'cacheEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      {settings.advanced.cacheEnabled && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {t('settings.advanced.maxCacheSize', '最大缓存大小')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={settings.advanced.maxCacheSize}
              onChange={(e) => onUpdate('advanced', 'maxCacheSize', parseInt(e.target.value))}
              className="flex-1 h-2 bg-[#2c2d3b] rounded-lg appearance-none cursor-pointer accent-[#569cd6]"
            />
            <span className="text-sm text-[#6a6f85] w-20 text-right">
              {settings.advanced.maxCacheSize} MB
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.advanced.debugMode', '调试模式')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.advanced.debugModeHelp', '启用详细日志记录')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advanced.debugMode}
            onChange={(e) => onUpdate('advanced', 'debugMode', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      <div className="pt-4 border-t border-[#2c2d3b]">
        <button
          onClick={() => {
            localStorage.clear()
            alert(t('settings.advanced.cacheCleared', '缓存已清除'))
          }}
          className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm transition-colors"
        >
          {t('settings.advanced.clearCache', '清除缓存')}
        </button>
      </div>
    </div>
  )
}