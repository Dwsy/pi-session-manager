/**
 * 设置面板 - 重构版本
 * 使用全局 Settings Context
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  Terminal,
  Palette,
  Globe,
  Database,
  Shield,
  Code,
  ChevronRight,
  Loader2,
  Check,
  RefreshCw,
  Puzzle,
  FileText,
} from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import type { SettingsSection, MenuSection } from './types'
import TerminalSettings from './sections/TerminalSettings'
import AppearanceSettings from './sections/AppearanceSettings'
import LanguageSettings from './sections/LanguageSettings'
import SessionSettings from './sections/SessionSettings'
import SearchSettings from './sections/SearchSettings'
import ExportSettings from './sections/ExportSettings'
import PiConfigSettings from './sections/PiConfigSettings'
import AdvancedSettings from './sections/AdvancedSettings'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t } = useTranslation()
  const {
    settings,
    loading,
    saving,
    error,
    updateSetting,
    resetSettings,
    saveSettings,
  } = useSettings()

  const [activeSection, setActiveSection] = useState<SettingsSection>('terminal')
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    try {
      await saveSettings()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  const handleReset = () => {
    if (confirm(t('settings.confirmReset', '确定要重置所有设置吗？'))) {
      resetSettings()
    }
  }

  if (!isOpen) return null

  const menuItems: MenuSection[] = [
    { id: 'terminal', icon: <Terminal className="h-4 w-4" />, label: t('settings.sections.terminal', '终端') },
    { id: 'appearance', icon: <Palette className="h-4 w-4" />, label: t('settings.sections.appearance', '外观') },
    { id: 'language', icon: <Globe className="h-4 w-4" />, label: t('settings.sections.language', '语言') },
    { id: 'session', icon: <Database className="h-4 w-4" />, label: t('settings.sections.session', '会话') },
    { id: 'search', icon: <Code className="h-4 w-4" />, label: t('settings.sections.search', '搜索') },
    { id: 'export', icon: <Code className="h-4 w-4" />, label: t('settings.sections.export', '导出') },
    { id: 'pi-config', icon: <Puzzle className="h-4 w-4" />, label: t('settings.sections.piConfig', 'Pi 配置') },
    { id: 'advanced', icon: <Shield className="h-4 w-4" />, label: t('settings.sections.advanced', '高级') },
  ]

  const activeMenuItem = menuItems.find((item) => item.id === activeSection)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[800px] h-[600px] bg-[#1e1f2e] rounded-xl border border-[#2c2d3b] shadow-2xl flex overflow-hidden">
        {/* 左侧菜单 */}
        <SettingsMenu
          menuItems={menuItems}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onReset={handleReset}
        />

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col">
          {/* 头部 */}
          <SettingsHeader
            title={activeMenuItem?.label || ''}
            onClose={onClose}
          />

          {/* 设置内容 */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#569cd6]" />
              </div>
            ) : (
              <SettingsContent
                activeSection={activeSection}
                settings={settings}
                onUpdate={updateSetting}
              />
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-6 py-2 bg-red-500/10 border-t border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 底部按钮 */}
          <SettingsFooter
            saving={saving}
            saved={saved}
            onCancel={onClose}
            onSave={handleSave}
          />
        </div>
      </div>
    </div>
  )
}

// 子组件
function SettingsMenu({
  menuItems,
  activeSection,
  onSectionChange,
  onReset,
}: {
  menuItems: MenuSection[]
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onReset: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="w-56 bg-[#191a26] border-r border-[#2c2d3b] flex flex-col">
      <div className="p-4 border-b border-[#2c2d3b]">
        <h2 className="text-lg font-semibold text-white">{t('settings.title', '设置')}</h2>
        <p className="text-xs text-[#6a6f85] mt-1">{t('settings.subtitle', '自定义您的体验')}</p>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              activeSection === item.id
                ? 'bg-[#2c2d3b] text-white'
                : 'text-[#6a6f85] hover:text-white hover:bg-[#252636]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto px-1.5 py-0.5 text-xs bg-[#2c2d3b] rounded-full">
                {item.badge}
              </span>
            )}
            <ChevronRight
              className={`h-4 w-4 ml-auto transition-transform ${
                activeSection === item.id ? 'rotate-90' : ''
              }`}
            />
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[#2c2d3b]">
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t('settings.reset', '重置设置')}
        </button>
      </div>
    </div>
  )
}

function SettingsHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#2c2d3b]">
      <h3 className="text-base font-medium text-white">{title}</h3>
      <button
        onClick={onClose}
        className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

function SettingsContent({
  activeSection,
  settings,
  onUpdate,
}: {
  activeSection: SettingsSection
  settings: any
  onUpdate: any
}) {
  const components: Record<SettingsSection, React.ReactNode> = {
    terminal: <TerminalSettings settings={settings} onUpdate={onUpdate} />,
    appearance: <AppearanceSettings settings={settings} onUpdate={onUpdate} />,
    language: <LanguageSettings settings={settings} onUpdate={onUpdate} />,
    session: <SessionSettings settings={settings} onUpdate={onUpdate} />,
    search: <SearchSettings settings={settings} onUpdate={onUpdate} />,
    export: <ExportSettings settings={settings} onUpdate={onUpdate} />,
    'pi-config': <PiConfigSettings />,
    advanced: <AdvancedSettings settings={settings} onUpdate={onUpdate} />,
  }

  return <div className="space-y-6">{components[activeSection]}</div>
}

function SettingsFooter({
  saving,
  saved,
  onCancel,
  onSave,
}: {
  saving: boolean
  saved: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2c2d3b] bg-[#191a26]">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm text-[#6a6f85] hover:text-white transition-colors"
      >
        {t('common.cancel', '取消')}
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : null}
        {saved
          ? t('settings.saved', '已保存')
          : t('common.save', '保存设置')}
      </button>
    </div>
  )
}