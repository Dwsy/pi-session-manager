import { useState, useEffect } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
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
  ChevronLeft,
  Loader2,
  Check,
  RefreshCw,
  Puzzle,
  Cpu,
  Keyboard,
  Tags,
} from 'lucide-react'
import type { AppSettings, SettingsSection } from './types'
import { defaultSettings } from './types'
import { loadAppSettings, saveAppSettings } from '../../utils/settingsApi'
import TerminalSettings from './sections/TerminalSettings'
import AppearanceSettings from './sections/AppearanceSettings'
import LanguageSettings from './sections/LanguageSettings'
import SessionSettings from './sections/SessionSettings'
import SearchSettings from './sections/SearchSettings'
import ExportSettings from './sections/ExportSettings'
import PiConfigSettings from './sections/PiConfigSettings'
import ModelSettings from './sections/ModelSettings'
import AdvancedSettings from './sections/AdvancedSettings'
import ShortcutSettings from './sections/ShortcutSettings'
import TagManagerSettings from './sections/TagManagerSettings'

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
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  // ESC key to close settings modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadSettings = async () => {
    setLoading(true)
    try {
      const s = await loadAppSettings()
      setSettings(s)
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      await saveAppSettings(settings)
      i18n.changeLanguage(settings.language.locale)

      // Apply appearance settings to DOM immediately
      const root = document.documentElement
      const { theme, sidebarWidth, fontSize, messageSpacing, codeBlockTheme } = settings.appearance
      root.classList.remove('theme-dark', 'theme-light')
      if (theme === 'dark') root.classList.add('theme-dark')
      else if (theme === 'light') root.classList.add('theme-light')
      // system: no class — CSS @media handles it
      if (sidebarWidth) root.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
      const fontMap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' }
      root.style.setProperty('--font-size-base', fontMap[fontSize] || '16px')
      const spacingMap: Record<string, string> = { compact: '8px', comfortable: '16px', spacious: '24px' }
      root.style.setProperty('--spacing-base', spacingMap[messageSpacing] || '16px')
      if (codeBlockTheme) root.setAttribute('data-code-theme', codeBlockTheme)

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
    { id: 'tags', icon: <Tags className="h-4 w-4" />, label: t('settings.sections.tags', '标签') },
    { id: 'search', icon: <Code className="h-4 w-4" />, label: t('settings.sections.search', '搜索') },
    { id: 'export', icon: <ChevronRight className="h-4 w-4" />, label: t('settings.sections.export', '导出') },
    { id: 'pi-config', icon: <Puzzle className="h-4 w-4" />, label: t('settings.sections.piConfig', 'Pi 配置') },
    { id: 'models', icon: <Cpu className="h-4 w-4" />, label: t('settings.sections.models', '模型') },
    { id: 'shortcuts', icon: <Keyboard className="h-4 w-4" />, label: t('settings.sections.shortcuts', '快捷键') },
    { id: 'advanced', icon: <Shield className="h-4 w-4" />, label: t('settings.sections.advanced', '高级') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`${isMobile ? 'w-full h-full rounded-none' : 'w-[1200px] h-[700px] rounded-xl'} bg-surface-dark border border-border shadow-2xl flex ${isMobile ? 'flex-col' : ''} overflow-hidden`}>
        {isMobile ? (
          <MobileSettings
            menuItems={menuItems}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            settings={settings}
            loading={loading}
            onUpdate={updateSetting}
            onClose={onClose}
            onSave={saveSettings}
            onReset={resetSettings}
            saving={saving}
            saved={saved}
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

interface MobileSettingsProps {
  menuItems: { id: SettingsSection; icon: React.ReactNode; label: string }[]
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  settings: AppSettings
  loading: boolean
  onUpdate: <K extends keyof AppSettings>(section: K, key: keyof AppSettings[K], value: any) => void
  onClose: () => void
  onSave: () => void
  onReset: () => void
  saving: boolean
  saved: boolean
}

function MobileSettings({
  menuItems,
  activeSection,
  onSectionChange,
  settings,
  loading,
  onUpdate,
  onClose,
  onSave,
  onReset,
  saving,
  saved,
}: MobileSettingsProps) {
  const { t } = useTranslation()
  const [showDetail, setShowDetail] = useState(false)
  // Track animation state so both pages render during transition
  const [animating, setAnimating] = useState(false)

  const handleSectionClick = (id: SettingsSection) => {
    onSectionChange(id)
    setAnimating(true)
    // Trigger reflow then animate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowDetail(true))
    })
  }

  const handleBack = () => {
    setShowDetail(false)
    setAnimating(true)
  }

  const handleTransitionEnd = () => {
    setAnimating(false)
  }

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'terminal': return <TerminalSettings settings={settings} onUpdate={onUpdate} />
      case 'appearance': return <AppearanceSettings settings={settings} onUpdate={onUpdate} />
      case 'language': return <LanguageSettings settings={settings} onUpdate={onUpdate} />
      case 'session': return <SessionSettings settings={settings} onUpdate={onUpdate} />
      case 'tags': return <TagManagerSettings />
      case 'search': return <SearchSettings settings={settings} onUpdate={onUpdate} />
      case 'export': return <ExportSettings settings={settings} onUpdate={onUpdate} />
      case 'pi-config': return <PiConfigSettings />
      case 'models': return <ModelSettings />
      case 'shortcuts': return <ShortcutSettings />
      case 'advanced': return <AdvancedSettings settings={settings} onUpdate={onUpdate} />
      default: return null
    }
  }

  const shouldRenderDetail = showDetail || animating
  const shouldRenderList = !showDetail || animating

  // 移动端全屏滑动：列表左滑出，详情从右滑入（更清晰的页面切换）
  const listTransform = showDetail ? 'translateX(-100%)' : 'translateX(0)'
  const detailTransform = showDetail ? 'translateX(0)' : 'translateX(100%)'
  const transitionStyle = { transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease' }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* List page */}
      {shouldRenderList && (
        <div
          className="absolute inset-0 flex flex-col bg-surface-dark"
          style={{
            transform: listTransform,
            opacity: showDetail ? 0 : 1,
            ...transitionStyle,
          }}
          onTransitionEnd={!showDetail ? handleTransitionEnd : undefined}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background flex-shrink-0 safe-area-top">
            <h2 className="text-lg font-semibold text-foreground">{t('settings.title', '设置')}</h2>
            <button
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="py-2">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSectionClick(item.id)}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] text-left text-sm text-foreground hover:bg-surface active:bg-secondary transition-colors"
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </button>
              ))}
            </div>

            <div className="px-4 py-4 border-t border-border">
              <button
                onClick={onReset}
                className="w-full flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg border border-border transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                {t('settings.reset', '重置设置')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail page */}
      {shouldRenderDetail && (
        <div
          className="absolute inset-0 flex flex-col bg-surface-dark"
          style={{
            transform: detailTransform,
            ...transitionStyle,
          }}
          onTransitionEnd={showDetail ? handleTransitionEnd : undefined}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background flex-shrink-0 safe-area-top">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h3 className="text-base font-medium text-foreground flex-1">
              {menuItems.find((i) => i.id === activeSection)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-info" />
              </div>
            ) : (
              <div className="space-y-5">{renderSectionContent()}</div>
            )}
          </div>

          <div className="flex items-center gap-3 px-4 py-3 border-t border-border bg-background flex-shrink-0 safe-area-bottom">
            <button
              onClick={handleBack}
              className="flex-1 min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors flex items-center justify-center"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-4 bg-info hover:bg-info/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? t('settings.saved', '已保存') : t('common.save', '保存')}
            </button>
          </div>
        </div>
      )}
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
    <div className="w-64 bg-background/95 border-r border-border flex flex-col overflow-y-auto">
      <div className="p-5 border-b border-border/80 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{t('settings.title', '设置')}</h2>
        <p className="text-xs text-muted-foreground mt-1.5">{t('settings.subtitle', '自定义您的体验')}</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              activeSection === item.id
                ? 'bg-info/15 text-foreground ring-1 ring-info/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/80'
            }`}
          >
            <span className={activeSection === item.id ? 'text-info' : ''}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronRight
              className={`h-4 w-4 transition-transform text-muted-foreground/50 ${
                activeSection === item.id ? 'rotate-90 text-info/70' : ''
              }`}
            />
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-border/80 flex-shrink-0">
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface/80 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t('settings.reset', '重置设置')}
        </button>
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
    <div className="flex-1 flex flex-col bg-surface-dark/30">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-background/50">
        <h3 className="text-base font-semibold text-foreground tracking-tight">
          {menuItems.find((i) => i.id === activeSection)?.label}
        </h3>
        <button
          onClick={onClose}
          className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-info" />
          </div>
        ) : (
          <div className="space-y-6">
            {activeSection === 'terminal' && <TerminalSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'appearance' && <AppearanceSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'language' && <LanguageSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'session' && <SessionSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'tags' && <TagManagerSettings />}
            {activeSection === 'search' && <SearchSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'export' && <ExportSettings settings={settings} onUpdate={onUpdate} />}
            {activeSection === 'pi-config' && <PiConfigSettings />}
            {activeSection === 'models' && <ModelSettings />}
            {activeSection === 'shortcuts' && <ShortcutSettings />}
            {activeSection === 'advanced' && <AdvancedSettings settings={settings} onUpdate={onUpdate} />}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/80 bg-background/80">
        <button
          onClick={onClose}
          className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg transition-colors"
        >
          {t('common.cancel', '取消')}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? t('settings.saved', '已保存') : t('common.save', '保存设置')}
        </button>
      </div>
    </div>
  )
}
