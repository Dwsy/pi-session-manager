/**
 * 搜索设置组件
 */

import { useTranslation } from 'react-i18next'
import type { SearchSettingsProps } from '../types'

export default function SearchSettings({ settings, onUpdate }: SearchSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">
          {t('settings.search.defaultSearchMode', '默认搜索模式')}
        </label>
        <div className="flex gap-2">
          {(['content', 'name'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onUpdate('search', 'defaultSearchMode', mode)}
              className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                settings.search.defaultSearchMode === mode
                  ? 'border-[#569cd6] bg-[#569cd6]/10 text-white'
                  : 'border-[#2c2d3b] text-[#6a6f85] hover:border-[#3a3b4f]'
              }`}
            >
              {t(`settings.search.modes.${mode}`, mode === 'content' ? '内容' : '名称')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.search.caseSensitive', '区分大小写')}
          </label>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.search.caseSensitive}
            onChange={(e) => onUpdate('search', 'caseSensitive', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.search.includeToolCalls', '包含工具调用')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.search.includeToolCallsHelp', '在搜索结果中包含工具调用内容')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.search.includeToolCalls}
            onChange={(e) => onUpdate('search', 'includeToolCalls', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.search.highlightMatches', '高亮匹配')}
          </label>
          <p className="text-xs text-[#6a6f85]">
            {t('settings.search.highlightMatchesHelp', '在搜索结果中高亮显示匹配文本')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.search.highlightMatches}
            onChange={(e) => onUpdate('search', 'highlightMatches', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#2c2d3b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#569cd6]"></div>
        </label>
      </div>
    </div>
  )
}