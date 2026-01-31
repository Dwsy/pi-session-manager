import { useState, useEffect } from 'react'
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
  Cpu,
} from 'lucide-react'
import type { AppSettings, SettingsSection } from './types'
import { defaultSettings } from './types'
import TerminalSettings from './sections/TerminalSettings'
import AppearanceSettings from './sections/AppearanceSettings'
import LanguageSettings from './sections/LanguageSettings'
import SessionSettings from './sections/SessionSettings'
import SearchSettings from './sections/SearchSettings'
import ExportSettings from './sections/ExportSettings'
import PiConfigSettings from './sections/PiConfigSettings'
import ModelSettings from './sections/ModelSettings'
import AdvancedSettings from './sections/AdvancedSettings'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>('terminal')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const saved = localStorage.getItem('pi-session-manager-settings')
      if (saved) {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      localStorage.setItem('pi-session-manager-settings', JSON.stringify(settings))
      i18n.changeLanguage(settings.language.locale)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: any
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }))
  }

  const resetSettings = () => {
    if (confirm(t('settings.confirmReset', '确定要重置所有设置吗？'))) {
      setSettings(defaultSettings)
    }
  }

  if (!isOpen) return null

  const menuItems: { id: SettingsSection; icon: React.ReactNode; label: string }[] = [
    { id: 'terminal', icon: <Terminal className="h-4 w-4" />, label: t('settings.sections.terminal', '终端') },
    { id: 'appearance', icon: <Palette className="h-4 w-4" />, label: t('settings.sections.appearance', '外观') },
    { id: 'language', icon: <Globe className="h-4 w-4" />, label: t('settings.sections.language', '语言') },
    { id: 'session', icon: <Database className="h-4 w-4" />, label: t('settings.sections.session', '会话') },
    { id: 'search', icon: <Code className="h-4 w-4" />, label: t('settings.sections.search', '搜索') },
    { id: 'export', icon: <ChevronRight className="h-4 w-4" />, label: t('settings.sections.export', '导出') },
    { id: 'pi-config', icon: <Puzzle className="h-4 w-4" />, label: t('settings.sections.piConfig', 'Pi 配置') },
    { id: 'models', icon: <Cpu className="h-4 w-4" />, label: t('settings.sections.models', '模型') },
    { id: 'advanced', icon: <Shield className="h-4 w-4" />, label: t('settings.sections.advanced', '高级') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[1200px] h-[700px] bg-[#1e1f2e] rounded-xl border border-[#2c2d3b] shadow-2xl flex overflow-hidden">
        <SettingsSidebar
          menuItems={menuItems}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onReset={resetSettings}
        />
        <SettingsContent
          menuItems={menuItems}
          activeSection={activeSection}
          settings={settings}
          loading={loading}
          onUpdate={updateSetting}
          onClose={onClose}
          onSave={saveSettings}
          saving={saving}
          saved={saved}
        />
      </div>
    </div>
  )
}

interface SettingsSidebarProps {
  menuItems: { id: SettingsSection; icon: React.ReactNode; label: string }[]
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onReset: () => void
}

function SettingsSidebar({ menuItems, activeSection, onSectionChange, onReset }: SettingsSidebarProps) {
  const { t } = useTranslation()

  return (
    <div className="w-64 bg-[#191a26] border-r border-[#2c2d3b] flex flex-col">
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

      <ShortcutHints />
    </div>
  )
}

function ShortcutHints() {
  const { t } = useTranslation()

  return (
    <div className="px-4 pb-4">
      <div className="bg-[#252636] rounded-lg p-3">
        <div className="text-xs text-[#6a6f85] mb-2">{t('settings.shortcuts.title', '快捷键')}</div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6a6f85]">{t('app.shortcuts.settings', '打开设置')}</span>
            <span className="text-white bg-[#2c2d3b] px-1.5 py-0.5 rounded">Cmd+,</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6a6f85]">{t('app.shortcuts.refresh', '刷新会话列表')}</span>
            <span className="text-white bg-[#2c2d3b] px-1.5 py-0.5 rounded">Cmd+R</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6a6f85]">{t('app.shortcuts.search', '聚焦搜索框')}</span>
            <span className="text-white bg-[#2c2d3b] px-1.5 py-0.5 rounded">Cmd+F</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6a6f85]">{t('app.shortcuts.close', '关闭')}</span>
            <span className="text-white bg-[#2c2d3b] px-1.5 py-0.5 rounded">Esc</span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SettingsContentProps {
  menuItems: { id: SettingsSection; icon: React.ReactNode; label: string }[]
  activeSection: SettingsSection
  settings: AppSettings
  loading: boolean
  onUpdate: <K extends keyof AppSettings>(section: K, key: keyof AppSettings[K], value: any) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  saved: boolean
}

function SettingsContent({
  menuItems,
  activeSection,
  settings,
  loading,
  onUpdate,
  onClose,
  onSave,
  saving,
  saved,
}: SettingsContentProps) {
  const { t } = useTranslation()

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2c2d3b]">
        <h3 className="text-base font-medium text-white">
          {menuItems.find((i) => i.id === activeSection)?.label}
        </h3>
        <button
          onClick={onClose}
          className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-[#569cd6]" />
          </div>
        ) : (
          <div className="space-y-6">
            {activeSection === 'terminal' && <TerminalSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'appearance' && <AppearanceSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'language' && <LanguageSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'session' && <SessionSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'search' && <SearchSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'export' && <ExportSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'pi-config' && <PiConfigSettings />}
            {activeSection === 'models' && <ModelSettings />}
            {activeSection === 'advanced' && <AdvancedSettings settings={settings} onUpdate={onUpdate} />}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2c2d3b] bg-[#191a26]">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-[#6a6f85] hover:text-white transition-colors"
        >
          {t('common.cancel', '取消')}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? t('settings.saved', '已保存') : t('common.save', '保存设置')}
        </button>
      </div>
    </div>
  )
}