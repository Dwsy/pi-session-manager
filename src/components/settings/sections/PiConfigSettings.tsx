import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { invoke } from '../../../transport'
import {
  Loader2, Search, Puzzle, FileText, Settings2, Blocks,
  Paintbrush, X, Check, History, RotateCcw, Eye,
} from 'lucide-react'
import MarkdownContent from '../../MarkdownContent'
import type { ResourceInfo, ResourceType, PiSettingsFull, ModelOption, ConfigVersionMeta } from '../../../types'

type PiConfigTab = 'resources' | 'settings' | 'versions'

export default function PiConfigSettings() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<PiConfigTab>('resources')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-surface rounded-lg overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <PillTab active={activeTab === 'resources'} onClick={() => setActiveTab('resources')}
          icon={<Blocks className="h-3.5 w-3.5" />} label={t('settings.piConfig.tabs.resources', 'Resources')} />
        <PillTab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}
          icon={<Settings2 className="h-3.5 w-3.5" />} label={t('settings.piConfig.tabs.settings', 'Settings')} />
        <PillTab active={activeTab === 'versions'} onClick={() => setActiveTab('versions')}
          icon={<History className="h-3.5 w-3.5" />} label={t('settings.piConfig.tabs.versions', 'Versions')} />
      </div>
      {activeTab === 'resources' && <ResourcesTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'versions' && <ConfigVersionsTab />}
    </div>
  )
}

function PillTab({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 min-w-0 min-h-[40px] flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
        active ? 'bg-info text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >{icon}{label}</button>
  )
}

// ─── Resources Tab ───────────────────────────────────────────────────────────

const RESOURCE_TYPES: { type: ResourceType; icon: React.ReactNode; labelKey: string; fallback: string }[] = [
  { type: 'extensions', icon: <Blocks className="h-3.5 w-3.5" />, labelKey: 'settings.piConfig.resourceType.extensions', fallback: 'Extensions' },
  { type: 'skills', icon: <Puzzle className="h-3.5 w-3.5" />, labelKey: 'settings.piConfig.resourceType.skills', fallback: 'Skills' },
  { type: 'prompts', icon: <FileText className="h-3.5 w-3.5" />, labelKey: 'settings.piConfig.resourceType.prompts', fallback: 'Prompts' },
  { type: 'themes', icon: <Paintbrush className="h-3.5 w-3.5" />, labelKey: 'settings.piConfig.resourceType.themes', fallback: 'Themes' },
]

function ResourcesTab() {
  const { t } = useTranslation()
  const [resources, setResources] = useState<ResourceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<ResourceType>('skills')
  const [toggling, setToggling] = useState<string | null>(null)
  const [viewingItem, setViewingItem] = useState<ResourceInfo | null>(null)
  const [viewContent, setViewContent] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  useEffect(() => { loadResources() }, [])

  const loadResources = async () => {
    setLoading(true)
    try {
      const data = await invoke<ResourceInfo[]>('scan_all_resources', { cwd: null })
      setResources(data)
      const types: ResourceType[] = ['skills', 'extensions', 'prompts', 'themes']
      const first = types.find(tp => data.some(r => r.resourceType === tp))
      if (first) setActiveType(first)
    } catch (e) {
      console.error('Failed to scan resources:', e)
    } finally {
      setLoading(false)
    }
  }

  const typeCounts = useMemo(() => {
    const counts: Record<ResourceType, { total: number; enabled: number }> = {
      extensions: { total: 0, enabled: 0 },
      skills: { total: 0, enabled: 0 },
      prompts: { total: 0, enabled: 0 },
      themes: { total: 0, enabled: 0 },
    }
    for (const r of resources) {
      counts[r.resourceType].total++
      if (r.enabled) counts[r.resourceType].enabled++
    }
    return counts
  }, [resources])

  const filtered = useMemo(() => {
    let items = resources.filter(r => r.resourceType === activeType)
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(r =>
        r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
      )
    }
    const user = items.filter(r => r.metadata.scope === 'user').sort((a, b) => a.name.localeCompare(b.name))
    const project = items.filter(r => r.metadata.scope === 'project').sort((a, b) => a.name.localeCompare(b.name))
    return { user, project }
  }, [resources, activeType, search])

  const handleToggle = useCallback(async (item: ResourceInfo) => {
    const key = `${item.metadata.scope}:${item.path}`
    setToggling(key)
    try {
      const newEnabled = !item.enabled
      await invoke('toggle_resource', {
        resourceType: item.resourceType,
        path: item.path,
        enabled: newEnabled,
        scope: item.metadata.scope,
      })
      setResources(prev => prev.map(r =>
        r.path === item.path && r.metadata.scope === item.metadata.scope
          ? { ...r, enabled: newEnabled } : r
      ))
    } catch (e) {
      console.error('Failed to toggle resource:', e)
    } finally {
      setToggling(null)
    }
  }, [])

  const handleView = useCallback(async (item: ResourceInfo) => {
    setViewingItem(item)
    setViewContent(null)
    setViewLoading(true)
    try {
      const content = await invoke<string>('read_resource_file', {
        path: item.path,
        scope: item.metadata.scope,
      })
      setViewContent(content)
    } catch (e) {
      setViewContent(`Failed to load: ${e}`)
    } finally {
      setViewLoading(false)
    }
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-info" />
    </div>
  }

  return (
    <div className="space-y-3">
      {/* Type tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {RESOURCE_TYPES.map(rt => {
          const c = typeCounts[rt.type]
          const isActive = activeType === rt.type
          return (
            <button key={rt.type} onClick={() => setActiveType(rt.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface'
              }`}
            >
              {rt.icon}
              {t(rt.labelKey, rt.fallback)}
              {c.total > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive ? 'bg-info/20 text-info' : 'bg-surface text-muted-foreground'
                }`}>
                  {c.enabled}/{c.total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('settings.piConfig.searchPlaceholder', 'Filter...')}
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-info"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Resource list */}
      <div className="max-h-[400px] overflow-y-auto overflow-x-hidden space-y-3">
        {filtered.user.length === 0 && filtered.project.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            {t('settings.piConfig.noResources', 'No resources found')}
          </div>
        ) : (
          <>
            {filtered.user.length > 0 && (
              <ScopeGroup
                label={t('settings.piConfig.scope.user', 'User')}
                sublabel="~/.pi/agent/"
                items={filtered.user}
                toggling={toggling} onToggle={handleToggle} onView={handleView}
              />
            )}
            {filtered.project.length > 0 && (
              <ScopeGroup
                label={t('settings.piConfig.scope.project', 'Project')}
                sublabel=".pi/"
                items={filtered.project}
                toggling={toggling} onToggle={handleToggle} onView={handleView}
              />
            )}
          </>
        )}
      </div>

      {/* Resource viewer modal */}
      {viewingItem && (
        <ResourceViewerModal
          item={viewingItem}
          content={viewContent}
          loading={viewLoading}
          onClose={() => { setViewingItem(null); setViewContent(null) }}
        />
      )}
    </div>
  )
}

function ScopeGroup({ label, sublabel, items, toggling, onToggle, onView }: {
  label: string; sublabel: string; items: ResourceInfo[]
  toggling: string | null; onToggle: (item: ResourceInfo) => void
  onView: (item: ResourceInfo) => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-muted-foreground">{sublabel}</span>
      </div>
      <div className="space-y-px">
        {items.map(item => {
          const key = `${item.metadata.scope}:${item.path}`
          const isToggling = toggling === key
          const hasFile = item.path.endsWith('.md') || item.path.endsWith('.ts') || item.path.endsWith('.js') || item.path.endsWith('.json')
          return (
            <div key={key} className={`flex items-center gap-2.5 px-3 py-2 rounded-md transition-all group min-w-0 ${
              item.enabled ? 'hover:bg-info/5' : 'opacity-50 hover:opacity-70'
            }`}>
              <button onClick={() => onToggle(item)} disabled={isToggling}
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  item.enabled
                    ? 'bg-info border-info text-white'
                    : 'border-border group-hover:border-muted-foreground'
                }`}
              >
                {isToggling ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : item.enabled ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : null}
              </button>
              <div className="flex-1 min-w-0 overflow-hidden cursor-default">
                <span className="block text-sm text-foreground truncate">{item.name}</span>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">{item.description}</p>
                )}
              </div>
              {hasFile && (
                <button onClick={() => onView(item)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-info hover:bg-info/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title={t('components.piConfig.view')}>
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const QUEUE_MODES = ['one-at-a-time', 'all'] as const
const DOUBLE_ESC_ACTIONS = ['tree', 'fork', 'none'] as const
const EDITOR_PADDINGS = ['0', '1', '2', '3'] as const
const AUTOCOMPLETE_ITEMS = ['3', '5', '7', '10', '15', '20'] as const

interface SettingDef {
  key: string            // supports dot-notation for nested: "compaction.enabled"
  labelKey: string
  fallbackLabel: string
  descKey: string
  fallbackDesc: string
  type: 'bool' | 'enum' | 'text' | 'number' | 'model-provider' | 'model-id'
  options?: readonly string[]
  defaultValue?: unknown  // default when undefined in settings.json (from pi source)
  group: string
  groupKey: string
}

/** Resolve a dot-notation key from a nested object */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

const SETTINGS: SettingDef[] = [
  // ── Model ──
  { key: 'defaultProvider', labelKey: 'settings.piConfig.setting.provider', fallbackLabel: 'Provider', descKey: 'settings.piConfig.settingDesc.provider', fallbackDesc: 'Default provider for new sessions', type: 'model-provider', group: 'Model', groupKey: 'settings.piConfig.group.model' },
  { key: 'defaultModel', labelKey: 'settings.piConfig.setting.model', fallbackLabel: 'Model', descKey: 'settings.piConfig.settingDesc.model', fallbackDesc: 'Default model for new sessions', type: 'model-id', group: 'Model', groupKey: 'settings.piConfig.group.model' },
  { key: 'defaultThinkingLevel', labelKey: 'settings.piConfig.setting.thinking', fallbackLabel: 'Thinking level', descKey: 'settings.piConfig.settingDesc.thinking', fallbackDesc: 'Reasoning depth for thinking-capable models', type: 'enum', options: THINKING_LEVELS, group: 'Model', groupKey: 'settings.piConfig.group.model' },
  // ── Behavior ──
  { key: 'steeringMode', labelKey: 'settings.piConfig.setting.steering', fallbackLabel: 'Steering mode', descKey: 'settings.piConfig.settingDesc.steering', fallbackDesc: 'How steering messages are delivered while streaming', type: 'enum', options: QUEUE_MODES, defaultValue: 'one-at-a-time', group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'followUpMode', labelKey: 'settings.piConfig.setting.followUp', fallbackLabel: 'Follow-up mode', descKey: 'settings.piConfig.settingDesc.followUp', fallbackDesc: 'How follow-up messages are delivered', type: 'enum', options: QUEUE_MODES, defaultValue: 'one-at-a-time', group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'hideThinkingBlock', labelKey: 'settings.piConfig.setting.hideThinking', fallbackLabel: 'Hide thinking', descKey: 'settings.piConfig.settingDesc.hideThinking', fallbackDesc: 'Hide thinking blocks in responses', type: 'bool', defaultValue: false, group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'quietStartup', labelKey: 'settings.piConfig.setting.quietStartup', fallbackLabel: 'Quiet startup', descKey: 'settings.piConfig.settingDesc.quietStartup', fallbackDesc: 'Disable verbose startup output', type: 'bool', defaultValue: false, group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'collapseChangelog', labelKey: 'settings.piConfig.setting.collapseChangelog', fallbackLabel: 'Collapse changelog', descKey: 'settings.piConfig.settingDesc.collapseChangelog', fallbackDesc: 'Condensed changelog after updates', type: 'bool', defaultValue: false, group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'enableSkillCommands', labelKey: 'settings.piConfig.setting.skillCommands', fallbackLabel: 'Skill commands', descKey: 'settings.piConfig.settingDesc.skillCommands', fallbackDesc: 'Register skills as /skill:name commands', type: 'bool', defaultValue: true, group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'doubleEscapeAction', labelKey: 'settings.piConfig.setting.doubleEscape', fallbackLabel: 'Double-escape action', descKey: 'settings.piConfig.settingDesc.doubleEscape', fallbackDesc: 'Action when pressing Escape twice with empty editor', type: 'enum', options: DOUBLE_ESC_ACTIONS, defaultValue: 'tree', group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'shellPath', labelKey: 'settings.piConfig.setting.shell', fallbackLabel: 'Shell path', descKey: 'settings.piConfig.settingDesc.shell', fallbackDesc: 'Custom shell for bash tool', type: 'text', group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  { key: 'shellCommandPrefix', labelKey: 'settings.piConfig.setting.shellPrefix', fallbackLabel: 'Shell prefix', descKey: 'settings.piConfig.settingDesc.shellPrefix', fallbackDesc: 'Prefix prepended to shell commands', type: 'text', group: 'Behavior', groupKey: 'settings.piConfig.group.behavior' },
  // ── Compaction & Retry ──
  { key: 'compaction.enabled', labelKey: 'settings.piConfig.setting.compaction', fallbackLabel: 'Auto-compact', descKey: 'settings.piConfig.settingDesc.compaction', fallbackDesc: 'Automatically compact context when too large', type: 'bool', defaultValue: true, group: 'Advanced', groupKey: 'settings.piConfig.group.advanced' },
  { key: 'compaction.reserveTokens', labelKey: 'settings.piConfig.setting.compactReserve', fallbackLabel: 'Compact reserve tokens', descKey: 'settings.piConfig.settingDesc.compactReserve', fallbackDesc: 'Tokens reserved for compaction summary (default: 16384)', type: 'number', defaultValue: 16384, group: 'Advanced', groupKey: 'settings.piConfig.group.advanced' },
  { key: 'compaction.keepRecentTokens', labelKey: 'settings.piConfig.setting.compactKeepRecent', fallbackLabel: 'Keep recent tokens', descKey: 'settings.piConfig.settingDesc.compactKeepRecent', fallbackDesc: 'Recent tokens preserved during compaction (default: 20000)', type: 'number', defaultValue: 20000, group: 'Advanced', groupKey: 'settings.piConfig.group.advanced' },
  { key: 'retry.enabled', labelKey: 'settings.piConfig.setting.retry', fallbackLabel: 'Auto-retry', descKey: 'settings.piConfig.settingDesc.retry', fallbackDesc: 'Automatically retry on transient errors', type: 'bool', defaultValue: true, group: 'Advanced', groupKey: 'settings.piConfig.group.advanced' },
  { key: 'retry.maxRetries', labelKey: 'settings.piConfig.setting.retryMax', fallbackLabel: 'Max retries', descKey: 'settings.piConfig.settingDesc.retryMax', fallbackDesc: 'Maximum retry attempts (default: 3)', type: 'number', defaultValue: 3, group: 'Advanced', groupKey: 'settings.piConfig.group.advanced' },
  // ── Images & Terminal ──
  { key: 'terminal.showImages', labelKey: 'settings.piConfig.setting.showImages', fallbackLabel: 'Show images', descKey: 'settings.piConfig.settingDesc.showImages', fallbackDesc: 'Render images inline in terminal', type: 'bool', defaultValue: true, group: 'Terminal', groupKey: 'settings.piConfig.group.terminal' },
  { key: 'terminal.clearOnShrink', labelKey: 'settings.piConfig.setting.clearOnShrink', fallbackLabel: 'Clear on shrink', descKey: 'settings.piConfig.settingDesc.clearOnShrink', fallbackDesc: 'Clear empty rows when content shrinks (may flicker)', type: 'bool', defaultValue: false, group: 'Terminal', groupKey: 'settings.piConfig.group.terminal' },
  { key: 'images.autoResize', labelKey: 'settings.piConfig.setting.autoResize', fallbackLabel: 'Auto-resize images', descKey: 'settings.piConfig.settingDesc.autoResize', fallbackDesc: 'Resize large images to 2000×2000 for model compatibility', type: 'bool', defaultValue: true, group: 'Terminal', groupKey: 'settings.piConfig.group.terminal' },
  { key: 'images.blockImages', labelKey: 'settings.piConfig.setting.blockImages', fallbackLabel: 'Block images', descKey: 'settings.piConfig.settingDesc.blockImages', fallbackDesc: 'Prevent images from being sent to LLM providers', type: 'bool', defaultValue: false, group: 'Terminal', groupKey: 'settings.piConfig.group.terminal' },
  // ── Appearance ──
  { key: 'theme', labelKey: 'settings.piConfig.setting.theme', fallbackLabel: 'Theme', descKey: 'settings.piConfig.settingDesc.theme', fallbackDesc: 'Pi TUI color theme', type: 'text', group: 'Appearance', groupKey: 'settings.piConfig.group.appearance' },
  { key: 'showHardwareCursor', labelKey: 'settings.piConfig.setting.hwCursor', fallbackLabel: 'Hardware cursor', descKey: 'settings.piConfig.settingDesc.hwCursor', fallbackDesc: 'Show terminal cursor for IME support', type: 'bool', defaultValue: false, group: 'Appearance', groupKey: 'settings.piConfig.group.appearance' },
  { key: 'editorPaddingX', labelKey: 'settings.piConfig.setting.editorPadding', fallbackLabel: 'Editor padding', descKey: 'settings.piConfig.settingDesc.editorPadding', fallbackDesc: 'Horizontal padding for input editor (0-3)', type: 'enum', options: EDITOR_PADDINGS, defaultValue: '0', group: 'Appearance', groupKey: 'settings.piConfig.group.appearance' },
  { key: 'autocompleteMaxVisible', labelKey: 'settings.piConfig.setting.autocompleteMax', fallbackLabel: 'Autocomplete items', descKey: 'settings.piConfig.settingDesc.autocompleteMax', fallbackDesc: 'Max visible items in autocomplete dropdown (3-20)', type: 'enum', options: AUTOCOMPLETE_ITEMS, defaultValue: '5', group: 'Appearance', groupKey: 'settings.piConfig.group.appearance' },
]

/** Hook: progressive model loading (fast from config, then full from CLI) */
function useModelOptions() {
  const [models, setModels] = useState<ModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const loadedFull = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    // Phase 1: fast read from models.json
    invoke<ModelOption[]>('list_model_options_fast')
      .then(fast => { if (!cancelled) setModels(fast) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    // Phase 2: full list from `pi --list-models` (background)
    invoke<ModelOption[]>('list_model_options_full')
      .then(full => {
        if (!cancelled) {
          setModels(full)
          loadedFull.current = true
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  const providers = useMemo(() => [...new Set(models.map(m => m.provider))].sort(), [models])

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const m of models) {
      if (!map.has(m.provider)) map.set(m.provider, [])
      map.get(m.provider)!.push(m.model)
    }
    return map
  }, [models])

  return { providers, modelsByProvider, loading, loadedFull: loadedFull.current }
}

function SettingsTab() {
  const { t } = useTranslation()
  const [piSettings, setPiSettings] = useState<PiSettingsFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const modelData = useModelOptions()

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await invoke<PiSettingsFull>('load_pi_settings_full')
      setPiSettings(data)
    } catch (e) {
      console.error('Failed to load pi settings:', e)
    } finally {
      setLoading(false)
    }
  }

  const saveSetting = useCallback(async (key: string, value: unknown) => {
    setSavingKey(key)
    try {
      await invoke('save_pi_setting', { key, value })
      setPiSettings(prev => prev ? { ...prev, [key]: value } : prev)
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 1200)
    } catch (e) {
      console.error(`Failed to save ${key}:`, e)
    } finally {
      setSavingKey(null)
    }
  }, [])

  if (loading || !piSettings) {
    return <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-info" />
    </div>
  }

  // Group settings
  const groups = SETTINGS.reduce<Record<string, SettingDef[]>>((acc, s) => {
    ;(acc[s.group] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="max-h-[450px] overflow-y-auto space-y-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider px-1 mb-1.5">
            {t(items[0].groupKey, group)}
          </div>
          <div className="space-y-px">
            {items.map(item => (
              <SettingRow key={item.key} def={item}
                value={getNestedValue(piSettings as unknown as Record<string, unknown>, item.key)}
                saving={savingKey === item.key}
                saved={savedKey === item.key}
                onSave={saveSetting}
                modelData={modelData}
                currentProvider={piSettings.defaultProvider}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="text-xs text-muted-foreground bg-surface p-3 rounded-lg">
        {t('settings.piConfig.settingsHelp', 'Changes are saved directly to ~/.pi/agent/settings.json.')}
      </div>
    </div>
  )
}

function SettingRow({ def, value, saving, saved, onSave, modelData, currentProvider }: {
  def: SettingDef; value: unknown; saving: boolean; saved: boolean
  onSave: (key: string, value: unknown) => void
  modelData: ReturnType<typeof useModelOptions>
  currentProvider?: string
}) {
  const { t } = useTranslation()
  const label = t(def.labelKey, def.fallbackLabel)
  const desc = t(def.descKey, def.fallbackDesc)

  const savedIndicator = saved ? <Check className="h-3 w-3 text-green-400" /> : null

  if (def.type === 'bool') {
    const checked = value !== undefined ? value === true : (def.defaultValue === true)
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <button onClick={() => onSave(def.key, !checked)} disabled={saving}
            className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-info' : 'bg-border'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              checked ? 'translate-x-4' : ''
            }`} />
          </button>
        </div>
      </div>
    )
  }

  if (def.type === 'enum' && def.options) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <select value={(value as string) ?? (def.defaultValue as string | undefined) ?? def.options[0]}
            onChange={e => onSave(def.key, e.target.value)} disabled={saving}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-info cursor-pointer">
            {def.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
    )
  }

  // Model provider dropdown
  if (def.type === 'model-provider') {
    const { providers, loading: modelsLoading } = modelData
    const current = (value as string) ?? ''
    // Include current value even if not in list yet
    const allProviders = current && !providers.includes(current)
      ? [current, ...providers] : providers

    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {desc}
            {modelsLoading && <span className="ml-1 text-info">⟳</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <select value={current}
            onChange={e => onSave(def.key, e.target.value || null)} disabled={saving}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-info cursor-pointer max-w-[180px]">
            <option value="">—</option>
            {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
    )
  }

  // Model ID dropdown (filtered by current provider)
  if (def.type === 'model-id') {
    const { modelsByProvider, providers, loading: modelsLoading } = modelData
    const current = (value as string) ?? ''
    // If provider is set, show only that provider's models; otherwise show all
    let modelOptions: string[]
    if (currentProvider && modelsByProvider.has(currentProvider)) {
      modelOptions = modelsByProvider.get(currentProvider)!
    } else {
      // Show all models grouped
      modelOptions = providers.flatMap(p => modelsByProvider.get(p) ?? [])
    }
    // Include current value even if not in list
    if (current && !modelOptions.includes(current)) {
      modelOptions = [current, ...modelOptions]
    }

    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {desc}
            {modelsLoading && <span className="ml-1 text-info">⟳</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <select value={current}
            onChange={e => onSave(def.key, e.target.value || null)} disabled={saving}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-info cursor-pointer max-w-[220px]">
            <option value="">—</option>
            {currentProvider && modelsByProvider.has(currentProvider) ? (
              // Show current provider's models
              modelOptions.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              // Show all grouped by provider
              providers.map(p => (
                <optgroup key={p} label={p}>
                  {(modelsByProvider.get(p) ?? []).map(m =>
                    <option key={`${p}/${m}`} value={m}>{m}</option>
                  )}
                </optgroup>
              ))
            )}
          </select>
        </div>
      </div>
    )
  }

  // number input
  if (def.type === 'number') {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <input type="number" value={(value as number) ?? (def.defaultValue as number | undefined) ?? ''} placeholder="—"
            onChange={e => {
              const v = e.target.value ? parseInt(e.target.value, 10) : null
              onSave(def.key, v != null && !isNaN(v) ? v : null)
            }} disabled={saving}
            className="w-24 text-xs bg-surface border border-border rounded-md px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-info"
          />
        </div>
      </div>
    )
  }

  // text fallback
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 transition-colors">
      <div className="min-w-0 mr-3">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {savedIndicator}
        <input type="text" value={(value as string) ?? ''} placeholder="—"
          onChange={e => onSave(def.key, e.target.value || null)} disabled={saving}
          className="w-32 text-xs bg-surface border border-border rounded-md px-2 py-1 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-info"
        />
      </div>
    </div>
  )
}

// ─── Resource Viewer Modal ───────────────────────────────────────────────────

function ResourceViewerModal({ item, content, loading, onClose }: {
  item: ResourceInfo; content: string | null; loading: boolean; onClose: () => void
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isMarkdown = item.path.endsWith('.md')

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: 99999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background border border-border rounded-xl shadow-2xl w-[80%] max-w-2xl max-h-[80vh] flex flex-col"
        style={{ zIndex: 99999 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{item.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{item.path}</div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-info" />
            </div>
          ) : content == null ? null : isMarkdown ? (
            <MarkdownContent content={content} className="text-sm" />
          ) : (
            <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">{content}</pre>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('portal-root') || document.body
  )
}

// ─── Config Versions Tab ─────────────────────────────────────────────────────

function ConfigVersionsTab() {
  const { t, i18n } = useTranslation()
  const [versions, setVersions] = useState<ConfigVersionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)

  useEffect(() => { loadVersions() }, [])

  const loadVersions = async () => {
    setLoading(true)
    try {
      const data = await invoke<ConfigVersionMeta[]>('list_config_versions', { filePath: null })
      setVersions(data)
    } catch (e) {
      console.error('Failed to load config versions:', e)
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async (id: number) => {
    if (previewId === id) { setPreviewId(null); setPreviewContent(null); return }
    try {
      const ver = await invoke<{ id: number; content: string }>('get_config_version', { id })
      setPreviewId(id)
      setPreviewContent(ver.content)
    } catch (e) {
      console.error('Failed to get version:', e)
    }
  }

  const handleRestore = async (id: number) => {
    if (!confirm(t('settings.piConfig.confirmRestore', 'Restore this version? Current config will be saved as a new snapshot.'))) return
    setRestoring(id)
    try {
      await invoke('restore_config_version', { id })
      await loadVersions()
    } catch (e) {
      console.error('Failed to restore:', e)
    } finally {
      setRestoring(null)
    }
  }

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso + 'Z')
      const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US'
      return d.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return iso }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    return `${(bytes / 1024).toFixed(1)}KB`
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-info" />
    </div>
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {t('settings.piConfig.noVersions', 'No version history yet')}
        <p className="text-xs mt-1">{t('settings.piConfig.versionsHint', 'Snapshots are created automatically when settings change.')}</p>
      </div>
    )
  }

  return (
    <div className="max-h-[450px] overflow-y-auto divide-y divide-border rounded-lg border border-border">
      {versions.map(v => (
        <div key={v.id}>
          <div className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-surface/30 transition-colors">
            <span className="text-muted-foreground font-mono w-8 text-right flex-shrink-0">#{v.id}</span>
            <span className="flex-1 text-foreground">{formatTime(v.createdAt)}</span>
            <span className="text-muted-foreground flex-shrink-0">{formatSize(v.sizeBytes)}</span>
            <button onClick={() => handlePreview(v.id)}
              className={`p-1 rounded transition-colors ${previewId === v.id ? 'text-info bg-info/10' : 'text-muted-foreground hover:text-foreground'}`}
              title={t('settings.piConfig.preview', 'Preview')}>
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => handleRestore(v.id)} disabled={restoring === v.id}
              className="p-1 rounded text-muted-foreground hover:text-warning transition-colors"
              title={t('settings.piConfig.restore', 'Restore')}>
              {restoring === v.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
          </div>
          {previewId === v.id && previewContent && (
            <pre className="px-3 py-2 text-[11px] bg-surface text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto border-t border-border/50">
              {previewContent}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
