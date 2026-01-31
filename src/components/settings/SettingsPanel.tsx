import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
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
  FolderOpen,
  ExternalLink,
  Puzzle,
  FileText,
  Power,
  PowerOff,
  Cpu,
} from 'lucide-react'
import type { SkillInfo, PromptInfo, PiSettings } from '../../types'
import ModelSettings from './sections/ModelSettings'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

// 设置数据类型
export interface AppSettings {
  // 终端设置
  terminal: {
    defaultTerminal: 'iterm2' | 'terminal' | 'vscode' | 'custom'
    customTerminalCommand?: string
    piCommandPath: string
  }
  // 外观设置
  appearance: {
    theme: 'dark' | 'light' | 'system'
    sidebarWidth: number
    fontSize: 'small' | 'medium' | 'large'
    codeBlockTheme: 'github' | 'monokai' | 'dracula' | 'one-dark'
    messageSpacing: 'compact' | 'comfortable' | 'spacious'
  }
  // 语言设置
  language: {
    locale: string
  }
  // 会话设置
  session: {
    autoRefresh: boolean
    refreshInterval: number
    defaultViewMode: 'list' | 'directory' | 'project'
    showMessagePreview: boolean
    previewLines: number
  }
  // 搜索设置
  search: {
    defaultSearchMode: 'content' | 'name'
    caseSensitive: boolean
    includeToolCalls: boolean
    highlightMatches: boolean
  }
  // 导出设置
  export: {
    defaultFormat: 'html' | 'md' | 'json'
    includeMetadata: boolean
    includeTimestamps: boolean
  }
  // 高级设置
  advanced: {
    sessionDir: string
    cacheEnabled: boolean
    debugMode: boolean
    maxCacheSize: number
  }
}

const defaultSettings: AppSettings = {
  terminal: {
    defaultTerminal: 'iterm2',
    piCommandPath: 'pi',
  },
  appearance: {
    theme: 'dark',
    sidebarWidth: 320,
    fontSize: 'medium',
    codeBlockTheme: 'github',
    messageSpacing: 'comfortable',
  },
  language: {
    locale: 'zh-CN',
  },
  session: {
    autoRefresh: true,
    refreshInterval: 30,
    defaultViewMode: 'project',
    showMessagePreview: true,
    previewLines: 2,
  },
  search: {
    defaultSearchMode: 'content',
    caseSensitive: false,
    includeToolCalls: false,
    highlightMatches: true,
  },
  export: {
    defaultFormat: 'html',
    includeMetadata: true,
    includeTimestamps: true,
  },
  advanced: {
    sessionDir: '~/.pi/agent/sessions',
    cacheEnabled: true,
    debugMode: false,
    maxCacheSize: 100,
  },
}

type SettingsSection =
  | 'terminal'
  | 'appearance'
  | 'language'
  | 'session'
  | 'search'
  | 'export'
  | 'pi-config'
  | 'models'
  | 'advanced'

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t, i18n } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSection>('terminal')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 加载设置
  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setLoading(true)
    try {
      // TODO: 从后端加载设置
      // const savedSettings = await invoke<AppSettings>('load_settings')
      // setSettings(savedSettings)

      // 临时：从 localStorage 加载
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
      // TODO: 保存到后端
      // await invoke('save_settings', { settings })

      // 临时：保存到 localStorage
      localStorage.setItem('pi-session-manager-settings', JSON.stringify(settings))

      // 应用语言设置
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
    { id: 'export', icon: <ExternalLink className="h-4 w-4" />, label: t('settings.sections.export', '导出') },
    { id: 'pi-config', icon: <Puzzle className="h-4 w-4" />, label: t('settings.sections.piConfig', 'Pi 配置') },
    { id: 'models', icon: <Cpu className="h-4 w-4" />, label: t('settings.sections.models', '模型') },
    { id: 'advanced', icon: <Shield className="h-4 w-4" />, label: t('settings.sections.advanced', '高级') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[1200px] h-[700px] bg-[#1e1f2e] rounded-xl border border-[#2c2d3b] shadow-2xl flex overflow-hidden">
        {/* 左侧菜单 */}
        <div className="w-64 bg-[#191a26] border-r border-[#2c2d3b] flex flex-col">
          <div className="p-4 border-b border-[#2c2d3b]">
            <h2 className="text-lg font-semibold text-white">{t('settings.title', '设置')}</h2>
            <p className="text-xs text-[#6a6f85] mt-1">{t('settings.subtitle', '自定义您的体验')}</p>
          </div>

          <nav className="flex-1 p-2 space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
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
              onClick={resetSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              {t('settings.reset', '重置设置')}
            </button>
          </div>

          {/* 快捷键提示 */}
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
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col">
          {/* 头部 */}
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

          {/* 设置内容 */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#569cd6]" />
              </div>
            ) : (
              <div className="space-y-6">
                {activeSection === 'terminal' && (
                  <TerminalSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'appearance' && (
                  <AppearanceSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'language' && (
                  <LanguageSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'session' && (
                  <SessionSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'search' && (
                  <SearchSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'export' && (
                  <ExportSettings settings={settings} onUpdate={updateSetting} />
                )}
                {activeSection === 'pi-config' && (
                  <PiConfigSettings />
                )}
                {activeSection === 'models' && (
                  <ModelSettings />
                )}
                {activeSection === 'advanced' && (
                  <AdvancedSettings settings={settings} onUpdate={updateSetting} />
                )}
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2c2d3b] bg-[#191a26]">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#6a6f85] hover:text-white transition-colors"
            >
              {t('common.cancel', '取消')}
            </button>
            <button
              onClick={saveSettings}
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
        </div>
      </div>
    </div>
  )
}

// 终端设置组件
function TerminalSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'terminal', key: keyof AppSettings['terminal'], value: any) => void
}) {
  const { t } = useTranslation()

  const terminals = [
    { id: 'iterm2', name: 'iTerm2', description: '推荐的 macOS 终端' },
    { id: 'terminal', name: 'Terminal.app', description: 'macOS 自带终端' },
    { id: 'vscode', name: 'VS Code', description: 'Visual Studio Code 终端' },
    { id: 'custom', name: '自定义', description: '使用自定义命令' },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">{t('settings.terminal.default', '默认终端')}</label>
        <div className="space-y-2">
          {terminals.map((term) => (
            <label
              key={term.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                settings.terminal.defaultTerminal === term.id
                  ? 'border-[#569cd6] bg-[#569cd6]/10'
                  : 'border-[#2c2d3b] hover:border-[#3a3b4f]'
              }`}
            >
              <input
                type="radio"
                name="terminal"
                value={term.id}
                checked={settings.terminal.defaultTerminal === term.id}
                onChange={(e) => onUpdate('terminal', 'defaultTerminal', e.target.value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-white">{term.name}</div>
                <div className="text-xs text-[#6a6f85]">{term.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {settings.terminal.defaultTerminal === 'custom' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-white">
            {t('settings.terminal.customCommand', '自定义终端命令')}
          </label>
          <input
            type="text"
            value={settings.terminal.customTerminalCommand || ''}
            onChange={(e) => onUpdate('terminal', 'customTerminalCommand', e.target.value)}
            placeholder={t('settings.terminal.commandExample')}
            className="w-full px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6]"
          />
          <p className="text-xs text-[#6a6f85]">
            {t('settings.terminal.customCommandHelp', '使用 {path} 作为会话路径占位符')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-white">
          {t('settings.terminal.piCommandPath', 'Pi 命令路径')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.terminal.piCommandPath}
            onChange={(e) => onUpdate('terminal', 'piCommandPath', e.target.value)}
            placeholder="pi"
            className="flex-1 px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6]"
          />
          <button className="px-3 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-[#6a6f85] hover:text-white transition-colors">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-[#6a6f85]">
          {t('settings.terminal.piCommandPathHelp', '如果 pi 不在系统 PATH 中，请指定完整路径')}
        </p>
      </div>
    </div>
  )
}

// 外观设置组件
function AppearanceSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'appearance', key: keyof AppSettings['appearance'], value: any) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">{t('settings.appearance.theme', '主题')}</label>
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
        <label className="text-sm font-medium text-white">{t('settings.appearance.fontSize', '字体大小')}</label>
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
        <label className="text-sm font-medium text-white">{t('settings.appearance.codeBlockTheme', '代码块主题')}</label>
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
        <label className="text-sm font-medium text-white">{t('settings.appearance.messageSpacing', '消息间距')}</label>
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

// 语言设置组件
function LanguageSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'language', key: keyof AppSettings['language'], value: any) => void
}) {
  const { t } = useTranslation()

  const languages = [
    { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-white">{t('settings.language.select', '选择语言')}</label>
        <div className="space-y-2">
          {languages.map((lang) => (
            <label
              key={lang.code}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                settings.language.locale === lang.code
                  ? 'border-[#569cd6] bg-[#569cd6]/10'
                  : 'border-[#2c2d3b] hover:border-[#3a3b4f]'
              }`}
            >
              <input
                type="radio"
                name="language"
                value={lang.code}
                checked={settings.language.locale === lang.code}
                onChange={(e) => onUpdate('language', 'locale', e.target.value)}
                className="sr-only"
              />
              <span className="text-xl">{lang.flag}</span>
              <span className="text-sm font-medium text-white">{lang.name}</span>
              {settings.language.locale === lang.code && (
                <Check className="h-4 w-4 text-[#569cd6] ml-auto" />
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// 会话设置组件
function SessionSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'session', key: keyof AppSettings['session'], value: any) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">{t('settings.session.autoRefresh', '自动刷新')}</label>
          <p className="text-xs text-[#6a6f85]">{t('settings.session.autoRefreshHelp', '自动检测新会话')}</p>
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
            <span className="text-sm text-[#6a6f85] w-16 text-right">{settings.session.refreshInterval}s</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="text-sm font-medium text-white">{t('settings.session.defaultViewMode', '默认视图模式')}</label>
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
          <p className="text-xs text-[#6a6f85]">{t('settings.session.showMessagePreviewHelp', '在会话列表中显示最后一条消息')}</p>
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
            <span className="text-sm text-[#6a6f85] w-8 text-right">{settings.session.previewLines}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// 搜索设置组件
function SearchSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'search', key: keyof AppSettings['search'], value: any) => void
}) {
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
              {t(
                `settings.search.modes.${mode}`,
                mode === 'content' ? '内容' : '名称'
              )}
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
          <p className="text-xs text-[#6a6f85]">{t('settings.search.includeToolCallsHelp', '在搜索结果中包含工具调用内容')}</p>
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
          <p className="text-xs text-[#6a6f85]">{t('settings.search.highlightMatchesHelp', '在搜索结果中高亮显示匹配文本')}</p>
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

// 导出设置组件
function ExportSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'export', key: keyof AppSettings['export'], value: any) => void
}) {
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
          <p className="text-xs text-[#6a6f85]">{t('settings.export.includeMetadataHelp', '导出时包含会话元数据')}</p>
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
          <p className="text-xs text-[#6a6f85]">{t('settings.export.includeTimestampsHelp', '导出时包含消息时间戳')}</p>
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

// 高级设置组件
function AdvancedSettings({
  settings,
  onUpdate,
}: {
  settings: AppSettings
  onUpdate: (section: 'advanced', key: keyof AppSettings['advanced'], value: any) => void
}) {
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
        <p className="text-xs text-[#6a6f85]">{t('settings.advanced.sessionDirHelp', 'Pi 会话文件的存储位置')}</p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.advanced.cacheEnabled', '启用缓存')}
          </label>
          <p className="text-xs text-[#6a6f85]">{t('settings.advanced.cacheEnabledHelp', '缓存会话数据以提高性能')}</p>
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
            <span className="text-sm text-[#6a6f85] w-20 text-right">{settings.advanced.maxCacheSize} MB</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-white">
            {t('settings.advanced.debugMode', '调试模式')}
          </label>
          <p className="text-xs text-[#6a6f85]">{t('settings.advanced.debugModeHelp', '启用详细日志记录')}</p>
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

// Pi 配置组件
function PiConfigSettings() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [prompts, setPrompts] = useState<PromptInfo[]>([])
  const [piSettings, setPiSettings] = useState<PiSettings>({ skills: [], prompts: [], extensions: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'skills' | 'prompts'>('skills')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [skillsData, promptsData, settingsData] = await Promise.all([
        invoke<SkillInfo[]>('scan_skills'),
        invoke<PromptInfo[]>('scan_prompts'),
        invoke<PiSettings>('load_pi_settings'),
      ])

      // 根据 settings.json 中的配置标记启用/禁用状态
      const enabledSkills = new Set(settingsData.skills.map(s => s.replace(/^-/, '')))
      const disabledSkills = new Set(settingsData.skills.filter(s => s.startsWith('-')).map(s => s.slice(1)))

      const skillsWithStatus = skillsData.map(skill => ({
        ...skill,
        enabled: disabledSkills.has(skill.path) ? false : enabledSkills.has(skill.path) || skill.enabled,
      }))

      const enabledPrompts = new Set(settingsData.prompts.map(p => p.replace(/^-/, '')))
      const disabledPrompts = new Set(settingsData.prompts.filter(p => p.startsWith('-')).map(p => p.slice(1)))

      const promptsWithStatus = promptsData.map(prompt => ({
        ...prompt,
        enabled: disabledPrompts.has(prompt.path) ? false : enabledPrompts.has(prompt.path) || prompt.enabled,
      }))

      setSkills(skillsWithStatus)
      setPrompts(promptsWithStatus)
      setPiSettings(settingsData)
    } catch (error) {
      console.error('Failed to load Pi config:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      // 构建 skills 列表：启用的直接放路径，禁用的加 - 前缀
      const skillsConfig = skills.map(skill =>
        skill.enabled ? skill.path : `-${skill.path}`
      )

      // 构建 prompts 列表
      const promptsConfig = prompts.map(prompt =>
        prompt.enabled ? prompt.path : `-${prompt.path}`
      )

      const newSettings: PiSettings = {
        ...piSettings,
        skills: skillsConfig,
        prompts: promptsConfig,
      }

      await invoke('save_pi_settings', { settings: newSettings })
      setPiSettings(newSettings)
      alert(t('settings.piConfig.saved', '配置已保存'))
    } catch (error) {
      console.error('Failed to save Pi config:', error)
      alert(t('settings.piConfig.saveFailed', '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const toggleSkill = (index: number) => {
    setSkills(prev => prev.map((skill, i) =>
      i === index ? { ...skill, enabled: !skill.enabled } : skill
    ))
  }

  const togglePrompt = (index: number) => {
    setPrompts(prev => prev.map((prompt, i) =>
      i === index ? { ...prompt, enabled: !prompt.enabled } : prompt
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#569cd6]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 标签页切换 */}
      <div className="flex gap-2 border-b border-[#2c2d3b]">
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'skills'
              ? 'text-[#569cd6] border-[#569cd6]'
              : 'text-[#6a6f85] border-transparent hover:text-white'
          }`}
        >
          <Puzzle className="h-4 w-4" />
          {t('settings.piConfig.skills', 'Skills')}
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-[#2c2d3b] rounded-full">
            {skills.filter(s => s.enabled).length}/{skills.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('prompts')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'prompts'
              ? 'text-[#569cd6] border-[#569cd6]'
              : 'text-[#6a6f85] border-transparent hover:text-white'
          }`}
        >
          <FileText className="h-4 w-4" />
          {t('settings.piConfig.prompts', 'Prompts')}
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-[#2c2d3b] rounded-full">
            {prompts.filter(p => p.enabled).length}/{prompts.length}
          </span>
        </button>
      </div>

      {/* Skills 列表 */}
      {activeTab === 'skills' && (
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {skills.length === 0 ? (
            <div className="text-center py-8 text-[#6a6f85]">
              {t('settings.piConfig.noSkills', '未找到 Skills')}
            </div>
          ) : (
            skills.map((skill, index) => (
              <div
                key={skill.name}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  skill.enabled
                    ? 'border-[#569cd6]/30 bg-[#569cd6]/5'
                    : 'border-[#2c2d3b] opacity-60'
                }`}
              >
                <button
                  onClick={() => toggleSkill(index)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                    skill.enabled
                      ? 'text-green-400 hover:bg-green-400/10'
                      : 'text-[#6a6f85] hover:bg-[#2c2d3b]'
                  }`}
                  title={skill.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已禁用')}
                >
                  {skill.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-[#6a6f85] truncate">{skill.description}</div>
                  )}
                </div>
                <code className="text-xs text-[#6a6f85] bg-[#252636] px-2 py-1 rounded">
                  {skill.path}
                </code>
              </div>
            ))
          )}
        </div>
      )}

      {/* Prompts 列表 */}
      {activeTab === 'prompts' && (
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-[#6a6f85]">
              {t('settings.piConfig.noPrompts', '未找到 Prompts')}
            </div>
          ) : (
            prompts.map((prompt, index) => (
              <div
                key={prompt.name}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  prompt.enabled
                    ? 'border-[#569cd6]/30 bg-[#569cd6]/5'
                    : 'border-[#2c2d3b] opacity-60'
                }`}
              >
                <button
                  onClick={() => togglePrompt(index)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                    prompt.enabled
                      ? 'text-green-400 hover:bg-green-400/10'
                      : 'text-[#6a6f85] hover:bg-[#2c2d3b]'
                  }`}
                  title={prompt.enabled ? t('common.enabled', '已启用') : t('common.disabled', '已禁用')}
                >
                  {prompt.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{prompt.name}</div>
                  {prompt.description && (
                    <div className="text-xs text-[#6a6f85] truncate">{prompt.description}</div>
                  )}
                </div>
                <code className="text-xs text-[#6a6f85] bg-[#252636] px-2 py-1 rounded">
                  {prompt.path}
                </code>
              </div>
            ))
          )}
        </div>
      )}

      {/* 说明文字 */}
      <div className="text-xs text-[#6a6f85] bg-[#252636] p-3 rounded-lg">
        <p>{t('settings.piConfig.help', '点击电源图标切换启用/禁用状态。禁用的项目会以 - 前缀保存到 settings.json。')}</p>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.save', '保存到 settings.json')}
        </button>
      </div>
    </div>
  )
}
