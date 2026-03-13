import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileJson,
  FlaskConical,
  FolderOpen,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { invoke } from '../../../transport'
import { useClipboard } from '../../../hooks/useClipboard'
import SettingsCard from '../SettingsCard'
import SettingsField from '../SettingsField'
import SettingsInput from '../SettingsInput'
import SettingsSelect from '../SettingsSelect'
import SettingsToggleRow from '../SettingsToggleRow'

type JsonValue = Record<string, unknown>

type FeedbackTone = 'success' | 'error' | 'warning' | 'info'
type ImportMode = 'merge' | 'replace'
type HistoryTab = 'backups' | 'versions'
type ConfirmTone = 'danger' | 'warning' | 'info'
type ModelConfigMainTab = 'configure' | 'test' | 'tools' | 'history'
type ConfigDetailTab = 'provider' | 'model'

interface ModelCost {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

interface ModelEntry {
  id: string
  name?: string
  api?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: ModelCost
}

interface ProviderEntry {
  baseUrl?: string
  api?: string
  apiKey?: string
  authHeader?: boolean
  headers?: Record<string, string>
  models?: ModelEntry[]
}

interface ModelConfigShape {
  providers: Record<string, ProviderEntry>
}

interface ModelConfigBackupMeta {
  id: string
  filePath: string
  createdAt: string
  sizeBytes: number
  note?: string | null
}

interface ConfigVersionMeta {
  id: number
  filePath: string
  createdAt: string
  sizeBytes: number
}

interface ModelHttpTestResult {
  provider: string
  model: string
  api: string
  method: string
  url: string
  statusCode: number | null
  ok: boolean
  latencyMs: number
  curlCommand: string
  requestBody: string
  requestStyle: string
  responsePreview?: string | null
  attemptCount: number
  usedFallback: boolean
  responseBody: string
  error?: string | null
}

interface FeedbackState {
  tone: FeedbackTone
  message: string
}

interface ConfirmDialogState {
  title: string
  description: string
  confirmLabel: string
  tone: ConfirmTone
  onConfirm: () => void | Promise<void>
}

const EMPTY_CONFIG: ModelConfigShape = { providers: {} }
const MODEL_CONFIG_PATH = '~/.pi/agent/models.json'

const API_TYPE_OPTIONS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
] as const

function asModelConfigShape(raw: unknown): ModelConfigShape {
  if (!raw || typeof raw !== 'object') return EMPTY_CONFIG
  const obj = raw as Record<string, unknown>
  const providers = obj.providers && typeof obj.providers === 'object'
    ? (obj.providers as Record<string, ProviderEntry>)
    : {}
  return { providers }
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined
  const entries = Object.entries(headers).sort(([left], [right]) => left.localeCompare(right))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeConfig(config: ModelConfigShape): ModelConfigShape {
  const providers: Record<string, ProviderEntry> = {}

  for (const providerName of Object.keys(config.providers).sort((a, b) => a.localeCompare(b))) {
    const provider = config.providers[providerName] ?? {}
    providers[providerName] = {
      baseUrl: provider.baseUrl ?? '',
      api: provider.api ?? 'openai-completions',
      apiKey: provider.apiKey ?? '',
      authHeader: provider.authHeader === true,
      headers: normalizeHeaders(provider.headers),
      models: (provider.models ?? []).map((model) => ({
        id: model.id ?? '',
        name: model.name ?? '',
        api: model.api ?? '',
        reasoning: model.reasoning === true,
        input: [...new Set((model.input ?? ['text']).map((item) => item.trim()).filter(Boolean))],
        contextWindow: model.contextWindow ?? 128000,
        maxTokens: model.maxTokens ?? 16384,
        cost: {
          input: model.cost?.input ?? 0,
          output: model.cost?.output ?? 0,
          cacheRead: model.cost?.cacheRead ?? 0,
          cacheWrite: model.cost?.cacheWrite ?? 0,
        },
      })),
    }
  }

  return { providers }
}

function serializeConfig(config: ModelConfigShape): string {
  return JSON.stringify(normalizeConfig(config))
}

function prettyConfig(config: ModelConfigShape): string {
  return JSON.stringify(normalizeConfig(config), null, 2)
}

function splitInputTypes(raw: string): string[] {
  return Array.from(new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)))
}

function createDefaultModel(): ModelEntry {
  return {
    id: '',
    name: '',
    reasoning: false,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
}

function createDefaultProvider(): ProviderEntry {
  return {
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    apiKey: 'ollama',
    authHeader: false,
    models: [createDefaultModel()],
  }
}

function modelSelectionValue(index: number): string {
  return String(index)
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  )
}

function SegmentedButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium motion-color motion-press focus-ring ${
        active
          ? 'bg-info text-white shadow-sm'
          : 'text-muted-foreground hover:bg-surface hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function MainTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-0 min-h-[40px] flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-md motion-surface motion-color motion-press focus-ring whitespace-nowrap ${
        active ? 'bg-info text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function StatusBanner({
  tone,
  message,
  onClose,
}: {
  tone: FeedbackTone
  message: string
  onClose: () => void
}) {
  const palette = {
    success: 'border-green-500/30 bg-green-500/10 text-green-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-info/30 bg-info/10 text-info',
  } as const

  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${palette[tone]}`}>
      <div className="flex items-start gap-2">
        {tone === 'success' ? <Check className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-current/80 hover:bg-black/10 hover:text-current motion-color motion-press focus-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function ModalShell({
  title,
  description,
  children,
  footer,
  onClose,
  widthClass = 'max-w-lg',
}: {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  widthClass?: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={`w-full rounded-xl border border-border/70 bg-background shadow-2xl ${widthClass}`}>
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground motion-color motion-press focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({
  dialog,
  confirming,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  dialog: ConfirmDialogState
  confirming: boolean
  cancelLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const palette = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-black',
    info: 'bg-info hover:bg-info/90 text-white',
  } as const

  return (
    <ModalShell
      title={dialog.title}
      description={dialog.description}
      onClose={() => {
        if (!confirming) onCancel()
      }}
      widthClass="max-w-md"
      footer={(
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium motion-color motion-press focus-ring disabled:opacity-60 ${palette[dialog.tone]}`}
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {dialog.confirmLabel}
          </button>
        </>
      )}
    >
      <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
        {dialog.description}
      </div>
    </ModalShell>
  )
}

export default function ModelConfigCenter() {
  const { t } = useTranslation()
  const { copyText, readText } = useClipboard()

  const [config, setConfig] = useState<ModelConfigShape>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const [baselineSnapshot, setBaselineSnapshot] = useState(serializeConfig(EMPTY_CONFIG))
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const [selectedProvider, setSelectedProvider] = useState('')
  // 选中模型用索引而不是 id，允许用户先创建空模型再补齐 ID。
  const [selectedModel, setSelectedModel] = useState('')
  const [providerNameDraft, setProviderNameDraft] = useState('')

  const [testPrompt, setTestPrompt] = useState('Please reply only with OK')
  const [testResult, setTestResult] = useState<ModelHttpTestResult | null>(null)

  const [backups, setBackups] = useState<ModelConfigBackupMeta[]>([])
  const [versions, setVersions] = useState<ConfigVersionMeta[]>([])
  const [historyTab, setHistoryTab] = useState<HistoryTab>('backups')
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [mainTab, setMainTab] = useState<ModelConfigMainTab>('configure')
  const [configDetailTab, setConfigDetailTab] = useState<ConfigDetailTab>('model')

  const [showAddProviderModal, setShowAddProviderModal] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')

  const [showImportModal, setShowImportModal] = useState(false)
  const [importContentDraft, setImportContentDraft] = useState('')

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [confirmingDialog, setConfirmingDialog] = useState(false)

  const providerNames = useMemo(
    () => Object.keys(config.providers).sort((a, b) => a.localeCompare(b)),
    [config.providers]
  )

  const currentSnapshot = useMemo(() => serializeConfig(config), [config])
  const isDirty = currentSnapshot !== baselineSnapshot

  const totalModels = useMemo(() => {
    return Object.values(config.providers).reduce((sum, provider) => sum + (provider.models?.length ?? 0), 0)
  }, [config.providers])

  const selectedProviderEntry = selectedProvider ? config.providers[selectedProvider] : undefined
  const selectedProviderModels = selectedProviderEntry?.models ?? []
  const selectedModelIndex = Number.parseInt(selectedModel, 10)
  const selectedModelEntry = Number.isInteger(selectedModelIndex)
    ? selectedProviderModels[selectedModelIndex]
    : undefined
  const activeModelLabel = selectedModelEntry
    ? (selectedModelEntry.name?.trim() || selectedModelEntry.id?.trim() || t('settings.modelConfigCenter.status.unnamedModel', '未命名模型'))
    : ''


  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (!selectedProvider || !config.providers[selectedProvider]) {
      const firstProvider = providerNames[0] ?? ''
      if (selectedProvider !== firstProvider) {
        setSelectedProvider(firstProvider)
      }
      if (!firstProvider && selectedModel !== '') {
        setSelectedModel('')
      }
      return
    }

    if (selectedProviderModels.length === 0) {
      if (selectedModel !== '') {
        setSelectedModel('')
      }
      return
    }

    if (!Number.isInteger(selectedModelIndex) || selectedModelIndex < 0 || selectedModelIndex >= selectedProviderModels.length) {
      setSelectedModel('0')
    }
  }, [config.providers, providerNames, selectedModel, selectedModelIndex, selectedProvider, selectedProviderModels])

  useEffect(() => {
    setProviderNameDraft(selectedProvider)
  }, [selectedProvider])

  useEffect(() => {
    setTestResult(null)
  }, [selectedProvider, selectedModel])

  useEffect(() => {
    if (!feedback || (feedback.tone !== 'success' && feedback.tone !== 'info')) {
      return undefined
    }

    const timer = window.setTimeout(() => setFeedback(null), 3200)
    return () => window.clearTimeout(timer)
  }, [feedback])

  async function loadAll(options: { showSpinner?: boolean } = {}) {
    const { showSpinner = true } = options
    if (showSpinner) {
      setLoading(true)
    }

    try {
      const previousProvider = selectedProvider
      const previousModel = selectedModel
      const [cfg, backupItems, versionItems] = await Promise.all([
        invoke<JsonValue>('load_model_config'),
        invoke<ModelConfigBackupMeta[]>('list_model_config_backups'),
        invoke<ConfigVersionMeta[]>('list_model_config_versions'),
      ])

      const parsed = asModelConfigShape(cfg)
      const nextProviderNames = Object.keys(parsed.providers).sort((a, b) => a.localeCompare(b))
      const nextProvider = previousProvider && parsed.providers[previousProvider]
        ? previousProvider
        : (nextProviderNames[0] ?? '')
      const nextModels = parsed.providers[nextProvider]?.models ?? []
      const previousModelIndex = Number.parseInt(previousModel, 10)
      const nextModel = Number.isInteger(previousModelIndex) && nextModels[previousModelIndex]
        ? previousModel
        : (nextModels.length > 0 ? '0' : '')

      setConfig(parsed)
      setBackups(backupItems)
      setVersions(versionItems)
      // 用稳定序列化结果比较草稿是否发生变化，避免对象引用导致的误判。
      setBaselineSnapshot(serializeConfig(parsed))
      setSelectedProvider(nextProvider)
      setSelectedModel(nextModel)
    } catch (error) {
      console.error('Failed to load model config center:', error)
      setFeedback({
        tone: 'error',
        message: t('settings.modelConfigCenter.feedback.loadFailed', '加载模型配置失败：{{reason}}', {
          reason: asErrorMessage(error),
        }),
      })
    } finally {
      if (showSpinner) {
        setLoading(false)
      }
    }
  }

  function pushFeedback(tone: FeedbackTone, message: string) {
    setFeedback({ tone, message })
  }

  function openConfirm(dialog: ConfirmDialogState) {
    setConfirmDialog(dialog)
  }

  function guardUnsaved(description: string, onConfirm: () => void | Promise<void>) {
    if (!isDirty) {
      void onConfirm()
      return
    }

    openConfirm({
      title: t('settings.modelConfigCenter.dialogs.unsavedTitle', '放弃未保存的改动？'),
      description,
      confirmLabel: t('settings.modelConfigCenter.actions.continue', '继续'),
      tone: 'warning',
      onConfirm,
    })
  }

  async function handleConfirmDialog() {
    if (!confirmDialog || confirmingDialog) return
    const currentDialog = confirmDialog
    setConfirmingDialog(true)
    setConfirmDialog(null)

    try {
      await currentDialog.onConfirm()
    } catch (error) {
      console.error('Confirm dialog action failed:', error)
      pushFeedback('error', asErrorMessage(error))
    } finally {
      setConfirmingDialog(false)
    }
  }

  function updateSelectedProviderEntry(updater: (provider: ProviderEntry) => ProviderEntry) {
    if (!selectedProvider) return

    setConfig((prev) => {
      const currentProvider = prev.providers[selectedProvider]
      if (!currentProvider) return prev

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [selectedProvider]: updater(currentProvider),
        },
      }
    })
  }

  function updateSelectedModelEntry(updater: (model: ModelEntry) => ModelEntry) {
    if (!selectedProvider || !Number.isInteger(selectedModelIndex) || !selectedProviderModels[selectedModelIndex]) {
      return
    }

    setConfig((prev) => {
      const currentProvider = prev.providers[selectedProvider]
      if (!currentProvider) return prev
      const nextModels = [...(currentProvider.models ?? [])]
      if (!nextModels[selectedModelIndex]) return prev

      nextModels[selectedModelIndex] = updater(nextModels[selectedModelIndex])

      return {
        ...prev,
        providers: {
          ...prev.providers,
          [selectedProvider]: {
            ...currentProvider,
            models: nextModels,
          },
        },
      }
    })
  }

  function commitProviderRename() {
    if (!selectedProvider) return
    const nextName = providerNameDraft.trim()

    if (!nextName) {
      setProviderNameDraft(selectedProvider)
      pushFeedback(
        'warning',
        t('settings.modelConfigCenter.feedback.providerNameRequired', 'Provider 名称不能为空')
      )
      return
    }

    if (nextName === selectedProvider) {
      return
    }

    if (config.providers[nextName]) {
      setProviderNameDraft(selectedProvider)
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.providerNameExists', 'Provider 名称已存在：{{name}}', {
          name: nextName,
        })
      )
      return
    }

    setConfig((prev) => {
      const nextProviders: Record<string, ProviderEntry> = {}
      for (const key of Object.keys(prev.providers)) {
        nextProviders[key === selectedProvider ? nextName : key] = prev.providers[key]
      }
      return { ...prev, providers: nextProviders }
    })
    setSelectedProvider(nextName)
    pushFeedback(
      'success',
      t('settings.modelConfigCenter.feedback.providerRenamed', 'Provider 已重命名为 {{name}}', {
        name: nextName,
      })
    )
  }

  function handleCreateProvider() {
    const name = newProviderName.trim()
    if (!name) {
      pushFeedback(
        'warning',
        t('settings.modelConfigCenter.feedback.providerNameRequired', 'Provider 名称不能为空')
      )
      return
    }

    if (config.providers[name]) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.providerNameExists', 'Provider 名称已存在：{{name}}', {
          name,
        })
      )
      return
    }

    const nextProvider = createDefaultProvider()
    setConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [name]: nextProvider,
      },
    }))
    setSelectedProvider(name)
    setSelectedModel('0')
    setMainTab('configure')
    setConfigDetailTab('provider')
    setShowAddProviderModal(false)
    setNewProviderName('')
    pushFeedback(
      'success',
      t('settings.modelConfigCenter.feedback.providerCreated', '已创建 Provider：{{name}}', { name })
    )
  }

  function requestDeleteProvider(providerName: string) {
    openConfirm({
      title: t('settings.modelConfigCenter.dialogs.deleteProviderTitle', '删除 Provider？'),
      description: t('settings.modelConfigCenter.dialogs.deleteProviderDesc', '这会从当前草稿中移除 Provider“{{name}}”及其所有模型。', {
        name: providerName,
      }),
      confirmLabel: t('settings.modelConfigCenter.actions.delete', '删除'),
      tone: 'danger',
      onConfirm: () => {
        setConfig((prev) => {
          const nextProviders = { ...prev.providers }
          delete nextProviders[providerName]
          return { ...prev, providers: nextProviders }
        })
        if (selectedProvider === providerName) {
          setSelectedProvider('')
          setSelectedModel('')
        }
        pushFeedback(
          'success',
          t('settings.modelConfigCenter.feedback.providerDeleted', '已移除 Provider：{{name}}', {
            name: providerName,
          })
        )
      },
    })
  }

  function addModel() {
    if (!selectedProvider) return
    const nextIndex = selectedProviderModels.length
    updateSelectedProviderEntry((provider) => ({
      ...provider,
      models: [...(provider.models ?? []), createDefaultModel()],
    }))
    setSelectedModel(modelSelectionValue(nextIndex))
    setMainTab('configure')
    setConfigDetailTab('model')
    pushFeedback('info', t('settings.modelConfigCenter.feedback.modelCreated', '已新增一个模型草稿'))
  }

  function requestDeleteModel(index: number) {
    if (!selectedProvider) return
    const currentModel = selectedProviderModels[index]
    const modelLabel = currentModel?.name?.trim() || currentModel?.id?.trim() || t('settings.modelConfigCenter.status.unnamedModel', '未命名模型')

    openConfirm({
      title: t('settings.modelConfigCenter.dialogs.deleteModelTitle', '删除模型？'),
      description: t('settings.modelConfigCenter.dialogs.deleteModelDesc', '这会从当前草稿中移除模型“{{name}}”。', {
        name: modelLabel,
      }),
      confirmLabel: t('settings.modelConfigCenter.actions.delete', '删除'),
      tone: 'danger',
      onConfirm: () => {
        updateSelectedProviderEntry((provider) => ({
          ...provider,
          models: (provider.models ?? []).filter((_, modelIndex) => modelIndex !== index),
        }))
        pushFeedback(
          'success',
          t('settings.modelConfigCenter.feedback.modelDeleted', '已移除模型“{{name}}”', {
            name: modelLabel,
          })
        )
      },
    })
  }


  async function saveConfig() {
    setSaving(true)
    try {
      await invoke('save_model_config', { content: config, createBackup: true })
      await loadAll({ showSpinner: false })
      pushFeedback('success', t('settings.modelConfigCenter.feedback.saveSuccess', '模型配置已保存'))
    } catch (error) {
      console.error('Save model config failed:', error)
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.saveFailed', '保存失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    } finally {
      setSaving(false)
    }
  }

  function refreshConfig() {
    guardUnsaved(
      t('settings.modelConfigCenter.dialogs.unsavedDescRefresh', '刷新会丢弃当前未保存的改动，并重新加载磁盘内容。'),
      async () => {
        setBusy('refresh')
        try {
          await loadAll({ showSpinner: false })
        } finally {
          setBusy(null)
        }
      }
    )
  }

  async function createBackup() {
    setBusy('backup')
    try {
      await invoke('create_model_config_backup', { note: 'manual backup from model config center' })
      await loadAll({ showSpinner: false })
      pushFeedback('success', t('settings.modelConfigCenter.feedback.backupCreated', '已创建配置备份'))
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.backupCreateFailed', '创建备份失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    } finally {
      setBusy(null)
    }
  }

  async function exportToPath() {
    try {
      const pathValue = await saveDialog({
        title: 'Export models.json',
        defaultPath: 'models.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!pathValue) return
      await invoke('export_model_config_to_path', { path: pathValue })
      pushFeedback(
        'success',
        t('settings.modelConfigCenter.feedback.exportSuccess', '已导出到 {{path}}', { path: pathValue })
      )
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.exportFailed', '导出失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    }
  }

  async function copyDraftJson() {
    try {
      await copyText(prettyConfig(config))
      pushFeedback('success', t('settings.modelConfigCenter.feedback.copySuccess', '当前草稿 JSON 已复制'))
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.copyFailed', '复制失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    }
  }

  function openImportContentModal() {
    guardUnsaved(
      t('settings.modelConfigCenter.dialogs.unsavedDescImport', '导入会覆盖当前草稿状态，请先保存或确认放弃未保存修改。'),
      () => {
        setImportContentDraft('')
        setShowImportModal(true)
      }
    )
  }

  function importFromPath() {
    guardUnsaved(
      t('settings.modelConfigCenter.dialogs.unsavedDescImport', '导入会覆盖当前草稿状态，请先保存或确认放弃未保存修改。'),
      async () => {
        const selected = await openDialog({
          title: 'Import model config',
          multiple: false,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (!selected || typeof selected !== 'string') return

        setBusy('import-file')
        try {
          await invoke('import_model_config_from_path', { path: selected, mode: importMode })
          await loadAll({ showSpinner: false })
          pushFeedback('success', t('settings.modelConfigCenter.feedback.importSuccess', '模型配置已导入'))
        } catch (error) {
          pushFeedback(
            'error',
            t('settings.modelConfigCenter.feedback.importFailed', '导入失败：{{reason}}', {
              reason: asErrorMessage(error),
            })
          )
        } finally {
          setBusy(null)
        }
      }
    )
  }

  async function pasteClipboardToImport() {
    try {
      const clipboardText = await readText()
      setImportContentDraft(clipboardText)
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.clipboardFailed', '读取剪贴板失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    }
  }

  async function importFromContent() {
    const content = importContentDraft.trim()
    if (!content) {
      pushFeedback(
        'warning',
        t('settings.modelConfigCenter.feedback.importInvalidJson', '请输入有效的 JSON 内容')
      )
      return
    }

    try {
      JSON.parse(content)
    } catch {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.importInvalidJson', '请输入有效的 JSON 内容')
      )
      return
    }

    setBusy('import-content')
    try {
      await invoke('import_model_config_content', { content, mode: importMode })
      setShowImportModal(false)
      await loadAll({ showSpinner: false })
      pushFeedback('success', t('settings.modelConfigCenter.feedback.importSuccess', '模型配置已导入'))
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.importFailed', '导入失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    } finally {
      setBusy(null)
    }
  }

  function requestRestoreBackup(backupId: string) {
    const confirmRestore = () => {
      openConfirm({
        title: t('settings.modelConfigCenter.dialogs.restoreBackupTitle', '恢复这个备份？'),
        description: t('settings.modelConfigCenter.dialogs.restoreBackupDesc', '恢复后会自动为当前配置创建一个新备份。'),
        confirmLabel: t('settings.modelConfigCenter.actions.restore', '恢复'),
        tone: 'warning',
        onConfirm: async () => {
          setBusy(`restore-${backupId}`)
          try {
            await invoke('restore_model_config_backup', { id: backupId })
            await loadAll({ showSpinner: false })
            pushFeedback('success', t('settings.modelConfigCenter.feedback.backupRestored', '备份已恢复'))
          } catch (error) {
            pushFeedback(
              'error',
              t('settings.modelConfigCenter.feedback.backupRestoreFailed', '恢复备份失败：{{reason}}', {
                reason: asErrorMessage(error),
              })
            )
          } finally {
            setBusy(null)
          }
        },
      })
    }

    guardUnsaved(
      t('settings.modelConfigCenter.dialogs.unsavedDescRestore', '恢复操作会覆盖当前草稿内容，请先保存或确认放弃未保存修改。'),
      confirmRestore
    )
  }

  function requestDeleteBackup(backupId: string) {
    openConfirm({
      title: t('settings.modelConfigCenter.dialogs.deleteBackupTitle', '删除这个备份？'),
      description: t('settings.modelConfigCenter.dialogs.deleteBackupDesc', '删除后无法恢复该备份文件。'),
      confirmLabel: t('settings.modelConfigCenter.actions.delete', '删除'),
      tone: 'danger',
      onConfirm: async () => {
        setBusy(`delete-${backupId}`)
        try {
          await invoke('delete_model_config_backup', { id: backupId })
          await loadAll({ showSpinner: false })
          pushFeedback('success', t('settings.modelConfigCenter.feedback.backupDeleted', '备份已删除'))
        } catch (error) {
          pushFeedback(
            'error',
            t('settings.modelConfigCenter.feedback.backupDeleteFailed', '删除备份失败：{{reason}}', {
              reason: asErrorMessage(error),
            })
          )
        } finally {
          setBusy(null)
        }
      },
    })
  }

  function requestRestoreVersion(versionId: number) {
    const confirmRestore = () => {
      openConfirm({
        title: t('settings.modelConfigCenter.dialogs.restoreVersionTitle', '恢复这个版本？'),
        description: t('settings.modelConfigCenter.dialogs.restoreVersionDesc', '这会把当前配置回退到所选历史版本。'),
        confirmLabel: t('settings.modelConfigCenter.actions.restore', '恢复'),
        tone: 'warning',
        onConfirm: async () => {
          setBusy(`version-${versionId}`)
          try {
            await invoke('restore_config_version', { id: versionId })
            await loadAll({ showSpinner: false })
            pushFeedback(
              'success',
              t('settings.modelConfigCenter.feedback.versionRestored', '已恢复到版本 #{{id}}', {
                id: versionId,
              })
            )
          } catch (error) {
            pushFeedback(
              'error',
              t('settings.modelConfigCenter.feedback.versionRestoreFailed', '恢复版本失败：{{reason}}', {
                reason: asErrorMessage(error),
              })
            )
          } finally {
            setBusy(null)
          }
        },
      })
    }

    guardUnsaved(
      t('settings.modelConfigCenter.dialogs.unsavedDescRestore', '恢复操作会覆盖当前草稿内容，请先保存或确认放弃未保存修改。'),
      confirmRestore
    )
  }

  async function runHttpTest() {
    if (!selectedProvider || !selectedModelEntry?.id?.trim()) return

    setBusy('http-test')
    setTestResult(null)
    try {
      const result = await invoke<ModelHttpTestResult>('test_model_http', {
        provider: selectedProvider,
        model: selectedModelEntry.id.trim(),
        prompt: testPrompt,
        timeoutMs: 20000,
      })
      setTestResult(result)
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.httpTestFailed', 'HTTP 测试失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    } finally {
      setBusy(null)
    }
  }

  async function copyCurlCommand() {
    if (!testResult) return
    try {
      await copyText(testResult.curlCommand)
      pushFeedback('success', t('settings.modelConfigCenter.feedback.curlCopied', 'cURL 已复制'))
    } catch (error) {
      pushFeedback(
        'error',
        t('settings.modelConfigCenter.feedback.copyFailed', '复制失败：{{reason}}', {
          reason: asErrorMessage(error),
        })
      )
    }
  }


  if (loading) {
    return (
      <div className="flex h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-info" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <SettingsCard
          icon={<Server className="h-5 w-5" />}
          title={t('settings.modelConfigCenter.title', '模型配置中心')}
          description={t('settings.modelConfigCenter.description', '可视化编辑 ~/.pi/agent/models.json，支持备份/版本/导入导出与在线 HTTP 测试。')}
        >
          <div className="space-y-4">
            {feedback && (
              <StatusBanner
                tone={feedback.tone}
                message={feedback.message}
                onClose={() => setFeedback(null)}
              />
            )}

            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                    isDirty
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-green-500/10 text-green-300'
                  }`}>
                    {isDirty
                      ? t('settings.modelConfigCenter.status.dirty', '未保存改动')
                      : t('settings.modelConfigCenter.status.saved', '已与磁盘同步')}
                  </span>
                  {selectedProvider && (
                    <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs text-foreground">
                      {t('settings.modelConfigCenter.status.activeProvider', 'Provider: {{name}}', {
                        name: selectedProvider,
                      })}
                    </span>
                  )}
                  {selectedModelEntry && (
                    <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs text-foreground">
                      {t('settings.modelConfigCenter.status.activeModel', 'Model: {{name}}', {
                        name: activeModelLabel,
                      })}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('settings.modelConfigCenter.pathLabel', '配置文件')}: <span className="font-mono text-foreground/80">{MODEL_CONFIG_PATH}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveConfig()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('settings.modelConfigCenter.actions.save', '保存配置')}
                </button>
                <button
                  type="button"
                  onClick={refreshConfig}
                  disabled={busy === 'refresh'}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                >
                  {busy === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('settings.modelConfigCenter.actions.refresh', '刷新')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile label={t('settings.modelConfigCenter.summary.providers', 'Providers')} value={providerNames.length} />
              <StatTile label={t('settings.modelConfigCenter.summary.models', 'Models')} value={totalModels} />
              <StatTile label={t('settings.modelConfigCenter.summary.backups', 'Backups')} value={backups.length} />
              <StatTile label={t('settings.modelConfigCenter.summary.versions', 'Versions')} value={versions.length} />
            </div>
          </div>
        </SettingsCard>

        <div className="flex gap-1 overflow-x-auto rounded-lg bg-surface p-1 [-webkit-overflow-scrolling:touch]">
          <MainTabButton
            active={mainTab === 'configure'}
            onClick={() => setMainTab('configure')}
            icon={<FileJson className="h-3.5 w-3.5" />}
            label={t('settings.modelConfigCenter.tabs.configure', '配置')}
          />
          <MainTabButton
            active={mainTab === 'test'}
            onClick={() => setMainTab('test')}
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            label={t('settings.modelConfigCenter.tabs.test', '测试')}
          />
          <MainTabButton
            active={mainTab === 'tools'}
            onClick={() => setMainTab('tools')}
            icon={<Upload className="h-3.5 w-3.5" />}
            label={t('settings.modelConfigCenter.tabs.tools', '导入导出')}
          />
          <MainTabButton
            active={mainTab === 'history'}
            onClick={() => setMainTab('history')}
            icon={<History className="h-3.5 w-3.5" />}
            label={t('settings.modelConfigCenter.tabs.history', '历史恢复')}
          />
        </div>

        {mainTab === 'configure' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <SettingsCard
            icon={<FileJson className="h-5 w-5" />}
            title={t('settings.modelConfigCenter.sections.navigatorTitle', 'Provider / Model 导航')}
            description={t('settings.modelConfigCenter.sections.navigatorDesc', '先定位 Provider，再聚焦当前模型细节。')}
          >
            <div className="max-h-[740px] space-y-5 overflow-y-auto pr-1">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {t('settings.modelConfigCenter.summary.providers', 'Providers')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">{providerNames.length}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddProviderModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.modelConfigCenter.actions.addProvider', '新增 Provider')}
                  </button>
                </div>

                {providerNames.length > 0 ? (
                  <div className="space-y-2">
                    {providerNames.map((providerName) => {
                      const provider = config.providers[providerName]
                      const isActive = providerName === selectedProvider
                      return (
                        <div
                          key={providerName}
                          className={`group flex items-start gap-2 rounded-xl border px-3 py-3 motion-color motion-surface ${
                            isActive
                              ? 'border-info/50 bg-info/10 shadow-sm'
                              : 'border-border/70 bg-background/35 hover:border-border-hover hover:bg-background/45'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProvider(providerName)
                              setConfigDetailTab('provider')
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-medium text-foreground">{providerName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{provider.api ?? 'openai-completions'}</span>
                              <span>·</span>
                              <span>{(provider.models ?? []).length} {t('settings.modelConfigCenter.summary.models', 'Models')}</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              requestDeleteProvider(providerName)
                            }}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-300 motion-color motion-press focus-ring"
                            title={t('settings.modelConfigCenter.actions.delete', '删除')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                    <div className="text-sm font-medium text-foreground">
                      {t('settings.modelConfigCenter.empty.noProvidersTitle', '还没有 Provider')}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('settings.modelConfigCenter.empty.noProvidersDesc', '先创建一个 Provider，右侧就会出现对应的连接与模型配置。')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAddProviderModal(true)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
                    >
                      <Plus className="h-4 w-4" />
                      {t('settings.modelConfigCenter.actions.createProvider', '创建 Provider')}
                    </button>
                  </div>
                )}
              </section>

              <section className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {t('settings.modelConfigCenter.summary.models', 'Models')}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {selectedProvider ? `${selectedProviderModels.length} / ${selectedProvider}` : t('settings.modelConfigCenter.sections.testSelection', '选择一个 Provider 继续')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addModel}
                    disabled={!selectedProvider}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.modelConfigCenter.actions.addModel', '新增模型')}
                  </button>
                </div>

                {selectedProvider ? (
                  selectedProviderModels.length > 0 ? (
                    <div className="space-y-2">
                      {selectedProviderModels.map((model, index) => {
                        const isActive = selectedModel === modelSelectionValue(index)
                        const label = model.name?.trim() || model.id?.trim() || t('settings.modelConfigCenter.status.unnamedModel', '未命名模型')
                        return (
                          <button
                            key={`${selectedProvider}-${index}`}
                            type="button"
                            onClick={() => {
                              setSelectedModel(modelSelectionValue(index))
                              setConfigDetailTab('model')
                            }}
                            className={`w-full rounded-xl border px-3 py-3 text-left motion-color motion-surface focus-ring ${
                              isActive
                                ? 'border-info/50 bg-info/10 shadow-sm'
                                : 'border-border/70 bg-background/35 hover:border-border-hover hover:bg-background/45'
                            }`}
                          >
                            <div className="truncate text-sm font-medium text-foreground">{label}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{model.id?.trim() || t('settings.modelConfigCenter.status.unnamedModel', '未命名模型')}</span>
                              {model.reasoning && (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">
                                  {t('settings.modelConfigCenter.fields.reasoning', '推理')}
                                </span>
                              )}
                              <span>{model.contextWindow ?? 128000}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                      <div className="text-sm font-medium text-foreground">
                        {t('settings.modelConfigCenter.empty.noModelsTitle', '当前 Provider 还没有模型')}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t('settings.modelConfigCenter.empty.noModelsDesc', '先创建一个模型，再在右侧补充 ID、能力与成本信息。')}
                      </p>
                      <button
                        type="button"
                        onClick={addModel}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
                      >
                        <Plus className="h-4 w-4" />
                        {t('settings.modelConfigCenter.actions.addModel', '新增模型')}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    {t('settings.modelConfigCenter.sections.testSelection', '选择一个 Provider 继续')}
                  </div>
                )}
              </section>
            </div>
          </SettingsCard>


          <div className="space-y-4">
            <div className="inline-flex rounded-lg border border-border bg-surface/60 p-1">
              <SegmentedButton active={configDetailTab === 'provider'} onClick={() => setConfigDetailTab('provider')}>
                {t('settings.modelConfigCenter.tabs.provider', 'Provider 详情')}
              </SegmentedButton>
              <SegmentedButton active={configDetailTab === 'model'} onClick={() => setConfigDetailTab('model')}>
                {t('settings.modelConfigCenter.tabs.model', '模型详情')}
              </SegmentedButton>
            </div>

            {configDetailTab === 'provider' && (
              <SettingsCard
                icon={<Server className="h-5 w-5" />}
              title={t('settings.modelConfigCenter.sections.providerDetailsTitle', 'Provider 详情')}
              description={t('settings.modelConfigCenter.sections.providerDetailsDesc', '当前 Provider 的连接、鉴权与默认 API 配置。')}
            >
              {selectedProviderEntry ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <SettingsField
                      label={t('settings.modelConfigCenter.fields.providerKey', 'Provider Key')}
                      description={t('settings.modelConfigCenter.help.providerKey', '修改后会更新 providers 下的 key 名称。')}
                    >
                      <SettingsInput
                        value={providerNameDraft}
                        onChange={(event) => setProviderNameDraft(event.target.value)}
                        onBlur={commitProviderRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitProviderRename()
                          }
                          if (event.key === 'Escape') {
                            setProviderNameDraft(selectedProvider)
                            event.currentTarget.blur()
                          }
                        }}
                        placeholder={t('settings.modelConfigCenter.placeholders.providerName', '例如：local-openai')}
                      />
                    </SettingsField>

                    <SettingsField label={t('settings.modelConfigCenter.fields.apiType', 'API 类型')}>
                      <SettingsSelect
                        value={selectedProviderEntry.api ?? 'openai-completions'}
                        onChange={(event) => updateSelectedProviderEntry((provider) => ({ ...provider, api: event.target.value }))}
                      >
                        {API_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </SettingsSelect>
                    </SettingsField>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <SettingsField label={t('settings.modelConfigCenter.fields.baseUrl', 'Base URL')}>
                      <SettingsInput
                        value={selectedProviderEntry.baseUrl ?? ''}
                        onChange={(event) => updateSelectedProviderEntry((provider) => ({ ...provider, baseUrl: event.target.value }))}
                        placeholder={t('settings.modelConfigCenter.placeholders.providerBaseUrl', 'https://api.example.com/v1')}
                      />
                    </SettingsField>

                    <SettingsField
                      label={t('settings.modelConfigCenter.fields.apiKey', 'API Key')}
                      description={t('settings.modelConfigCenter.help.apiKey', '支持直接写密钥、环境变量名，或 `!command` 形式。')}
                    >
                      <SettingsInput
                        value={selectedProviderEntry.apiKey ?? ''}
                        onChange={(event) => updateSelectedProviderEntry((provider) => ({ ...provider, apiKey: event.target.value }))}
                        placeholder={t('settings.modelConfigCenter.placeholders.apiKey', 'MY_API_KEY 或 !security ...')}
                      />
                    </SettingsField>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                    <SettingsToggleRow
                      title={t('settings.modelConfigCenter.fields.authHeader', '使用 Bearer 鉴权头')}
                      description={t('settings.modelConfigCenter.help.authHeader', '对当前 Provider 下的模型统一生效。')}
                      checked={selectedProviderEntry.authHeader === true}
                      onChange={(checked) => updateSelectedProviderEntry((provider) => ({ ...provider, authHeader: checked }))}
                      className="items-start"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                    <button
                      type="button"
                      onClick={() => requestDeleteProvider(selectedProvider)}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 motion-color motion-press focus-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('settings.modelConfigCenter.actions.delete', '删除')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  <div className="text-sm font-medium text-foreground">
                    {t('settings.modelConfigCenter.empty.noProvidersTitle', '还没有 Provider')}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('settings.modelConfigCenter.empty.noProvidersDesc', '先创建一个 Provider，右侧就会出现对应的连接与模型配置。')}
                  </p>
                </div>
              )}
            </SettingsCard>
            )}

            {configDetailTab === 'model' && (
              <SettingsCard
                icon={<FileJson className="h-5 w-5" />}
              title={t('settings.modelConfigCenter.sections.modelDetailsTitle', '模型详情')}
              description={t('settings.modelConfigCenter.sections.modelDetailsDesc', '默认只展示高频字段，把能力与成本分层展开。')}
            >
              {selectedProviderEntry ? (
                selectedModelEntry ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-foreground">{activeModelLabel}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{selectedProvider}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => requestDeleteModel(selectedModelIndex)}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 motion-color motion-press focus-ring"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('settings.modelConfigCenter.actions.delete', '删除')}
                      </button>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <div className="mb-4">
                        <div className="text-sm font-medium text-foreground">
                          {t('settings.modelConfigCenter.sections.basicSection', '基础信息')}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SettingsField label={t('settings.modelConfigCenter.fields.modelId', '模型 ID')}>
                          <SettingsInput
                            value={selectedModelEntry.id}
                            onChange={(event) => updateSelectedModelEntry((model) => ({ ...model, id: event.target.value }))}
                            placeholder="kimi-k2.5"
                          />
                        </SettingsField>

                        <SettingsField label={t('settings.modelConfigCenter.fields.modelName', '显示名称')}>
                          <SettingsInput
                            value={selectedModelEntry.name ?? ''}
                            onChange={(event) => updateSelectedModelEntry((model) => ({ ...model, name: event.target.value }))}
                            placeholder={t('settings.modelConfigCenter.placeholders.modelName', '对用户更友好的展示名称')}
                          />
                        </SettingsField>

                        <SettingsField
                          label={t('settings.modelConfigCenter.fields.inputTypes', '输入类型')}
                          description={t('settings.modelConfigCenter.help.inputTypes', '用逗号分隔，例如 text,image。')}
                        >
                          <SettingsInput
                            value={(selectedModelEntry.input ?? ['text']).join(', ')}
                            onChange={(event) => {
                              const inputs = splitInputTypes(event.target.value)
                              updateSelectedModelEntry((model) => ({
                                ...model,
                                input: inputs.length > 0 ? inputs : ['text'],
                              }))
                            }}
                            placeholder={t('settings.modelConfigCenter.placeholders.inputTypes', 'text,image')}
                          />
                        </SettingsField>

                        <div className="rounded-lg border border-border/70 bg-background/35 px-4 py-3">
                          <SettingsToggleRow
                            title={t('settings.modelConfigCenter.fields.reasoning', '推理模型')}
                            description={t('settings.modelConfigCenter.help.reasoning', '用于区分是否支持更深层次的思考能力')}
                            checked={selectedModelEntry.reasoning === true}
                            onChange={(checked) => updateSelectedModelEntry((model) => ({ ...model, reasoning: checked }))}
                            className="items-start"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <div className="mb-4">
                        <div className="text-sm font-medium text-foreground">
                          {t('settings.modelConfigCenter.sections.capabilitySection', '能力边界')}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <SettingsField label={t('settings.modelConfigCenter.fields.contextWindow', '上下文窗口')}>
                          <SettingsInput
                            type="number"
                            value={selectedModelEntry.contextWindow ?? 128000}
                            onChange={(event) => updateSelectedModelEntry((model) => ({
                              ...model,
                              contextWindow: Number(event.target.value) || 0,
                            }))}
                          />
                        </SettingsField>

                        <SettingsField label={t('settings.modelConfigCenter.fields.maxTokens', '最大输出 Token')}>
                          <SettingsInput
                            type="number"
                            value={selectedModelEntry.maxTokens ?? 16384}
                            onChange={(event) => updateSelectedModelEntry((model) => ({
                              ...model,
                              maxTokens: Number(event.target.value) || 0,
                            }))}
                          />
                        </SettingsField>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                      <div className="mb-4">
                        <div className="text-sm font-medium text-foreground">
                          {t('settings.modelConfigCenter.sections.advancedSection', '高级 / 成本')}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((costKey) => (
                          <SettingsField
                            key={costKey}
                            label={t(`settings.modelConfigCenter.cost.${costKey}`, `Cost.${costKey}`)}
                          >
                            <SettingsInput
                              type="number"
                              step="0.0001"
                              value={selectedModelEntry.cost?.[costKey] ?? 0}
                              onChange={(event) => updateSelectedModelEntry((model) => ({
                                ...model,
                                cost: {
                                  input: model.cost?.input ?? 0,
                                  output: model.cost?.output ?? 0,
                                  cacheRead: model.cost?.cacheRead ?? 0,
                                  cacheWrite: model.cost?.cacheWrite ?? 0,
                                  [costKey]: Number(event.target.value) || 0,
                                },
                              }))}
                            />
                          </SettingsField>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                    <div className="text-sm font-medium text-foreground">
                      {t('settings.modelConfigCenter.empty.noModelsTitle', '当前 Provider 还没有模型')}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('settings.modelConfigCenter.empty.noModelsDesc', '先创建一个模型，再在右侧补充 ID、能力与成本信息。')}
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  <div className="text-sm font-medium text-foreground">
                    {t('settings.modelConfigCenter.empty.noProvidersTitle', '还没有 Provider')}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('settings.modelConfigCenter.empty.noProvidersDesc', '先创建一个 Provider，右侧就会出现对应的连接与模型配置。')}
                  </p>
                </div>
              )}
            </SettingsCard>
            )}
          </div>
        </div>
        )}

        {mainTab !== 'configure' && (
          <div className="grid grid-cols-1 gap-4">
            {(mainTab === 'tools' || mainTab === 'test') && (
            <div className="space-y-4">
              {mainTab === 'tools' && (
              <SettingsCard
                icon={<Upload className="h-5 w-5" />}
                title={t('settings.modelConfigCenter.sections.toolsTitle', '导入与导出')}
                description={t('settings.modelConfigCenter.sections.toolsDesc', '把工具操作从主编辑区拆出来，避免干扰配置主路径。')}
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-background/30 p-4">
                  <div className="text-sm font-medium text-foreground">
                    {t('settings.modelConfigCenter.sections.importMode', '导入模式')}
                  </div>
                  <div className="mt-3 inline-flex rounded-lg border border-border bg-surface/60 p-1">
                    <SegmentedButton active={importMode === 'merge'} onClick={() => setImportMode('merge')}>
                      {t('settings.modelConfigCenter.tabs.merge', '合并')}
                    </SegmentedButton>
                    <SegmentedButton active={importMode === 'replace'} onClick={() => setImportMode('replace')}>
                      {t('settings.modelConfigCenter.tabs.replace', '替换')}
                    </SegmentedButton>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('settings.modelConfigCenter.help.importMode', '合并保留现有 Provider，替换会直接采用导入内容。')}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={importFromPath}
                    disabled={busy === 'import-file'}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                  >
                    {busy === 'import-file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                    {t('settings.modelConfigCenter.actions.importFile', '导入文件')}
                  </button>
                  <button
                    type="button"
                    onClick={openImportContentModal}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                  >
                    <Upload className="h-4 w-4" />
                    {t('settings.modelConfigCenter.actions.importContent', '导入 JSON 内容')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyDraftJson()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                  >
                    <Copy className="h-4 w-4" />
                    {t('settings.modelConfigCenter.actions.copyDraft', '复制当前草稿')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportToPath()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                  >
                    <Download className="h-4 w-4" />
                    {t('settings.modelConfigCenter.actions.exportSaved', '导出已保存文件')}
                  </button>
                </div>

                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                  <div>{t('settings.modelConfigCenter.help.copyDraft', '“复制当前草稿”会包含你尚未保存的修改。')}</div>
                  <div className="mt-1">{t('settings.modelConfigCenter.help.exportSaved', '“导出已保存文件”读取磁盘上的 models.json，适合做归档。')}</div>
                </div>
              </div>
            </SettingsCard>
            )}

            {mainTab === 'test' && (
              <SettingsCard
                icon={<FlaskConical className="h-5 w-5" />}
                  title={t('settings.modelConfigCenter.httpTestTitle', '在线 HTTP / cURL 测试')}
                  description={t('settings.modelConfigCenter.httpTestDesc', '按当前选中的 Provider + Model 发起真实请求，验证配置是否可用。')}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {t('settings.modelConfigCenter.fields.selectedProvider', '当前 Provider')}
                    </div>
                    <div className="mt-2 truncate text-sm font-medium text-foreground">{selectedProvider || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {t('settings.modelConfigCenter.fields.selectedModel', '当前 Model')}
                    </div>
                    <div className="mt-2 truncate text-sm font-medium text-foreground">{selectedModelEntry?.id?.trim() || activeModelLabel || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/35 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">API</div>
                    <div className="mt-2 truncate text-sm font-medium text-foreground">{selectedProviderEntry?.api ?? '-'}</div>
                  </div>
                </div>

                {!selectedProviderEntry && (
                  <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('settings.modelConfigCenter.empty.testEmpty', '先到配置页选择 Provider 和模型，再回来运行测试。')}
                  </div>
                )}

                {!selectedModelEntry?.id?.trim() && selectedProviderEntry && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                    {t('settings.modelConfigCenter.help.noModelId', '当前模型还没有填写 ID，无法发起 HTTP 测试。')}
                  </div>
                )}

                <SettingsField label={t('settings.modelConfigCenter.fields.prompt', '测试 Prompt')}>
                  <SettingsInput
                    value={testPrompt}
                    onChange={(event) => setTestPrompt(event.target.value)}
                    placeholder={t('settings.modelConfigCenter.placeholders.testPrompt', '请只回复 OK')}
                  />
                </SettingsField>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runHttpTest()}
                    disabled={!selectedProvider || !selectedModelEntry?.id?.trim() || busy === 'http-test'}
                    className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
                  >
                    {busy === 'http-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t('settings.modelConfigCenter.actions.runTest', '运行测试')}
                  </button>
                  {testResult && (
                    <button
                      type="button"
                      onClick={() => void copyCurlCommand()}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                    >
                      <Copy className="h-4 w-4" />
                      {t('settings.modelConfigCenter.actions.copyCurl', '复制 cURL')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMainTab('configure')}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
                  >
                    <FileJson className="h-4 w-4" />
                    {t('settings.modelConfigCenter.actions.backToConfigure', '返回配置页')}
                  </button>
                </div>

                {testResult && (
                  <div className="rounded-xl border border-border/70 bg-background/30 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${testResult.ok ? 'text-green-300' : 'text-red-300'}`}>
                        {testResult.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        {testResult.ok ? 'OK' : 'FAILED'}
                      </span>
                      <span className="text-muted-foreground">{testResult.method} {testResult.url}</span>
                      <span className="text-muted-foreground">status: {testResult.statusCode ?? '-'}</span>
                      <span className="text-muted-foreground">latency: {testResult.latencyMs} ms</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
                      <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">API</div>
                        <div className="mt-1 font-medium text-foreground">{testResult.api}</div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Request Style</div>
                        <div className="mt-1 font-medium text-foreground">{testResult.requestStyle}</div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Attempts</div>
                        <div className="mt-1 font-medium text-foreground">{testResult.attemptCount}{testResult.usedFallback ? ' (fallback used)' : ''}</div>
                      </div>
                    </div>
                    {testResult.responsePreview && (
                      <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                        {testResult.responsePreview}
                      </div>
                    )}
                    {testResult.error && (
                      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {testResult.error}
                      </div>
                    )}
                    <div className="mt-4 space-y-3 text-xs">
                      <details>
                        <summary className="cursor-pointer font-medium text-foreground">cURL</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">{testResult.curlCommand}</pre>
                      </details>
                      <details>
                        <summary className="cursor-pointer font-medium text-foreground">Request Body</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">{testResult.requestBody}</pre>
                      </details>
                      <details open>
                        <summary className="cursor-pointer font-medium text-foreground">Response Body</summary>
                        <pre className="mt-2 max-h-[280px] overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border/70 bg-background/40 p-3 text-muted-foreground">{testResult.responseBody || '(empty)'}</pre>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            </SettingsCard>
            )}
          </div>
          )}

          {mainTab === 'history' && (
            <SettingsCard
              icon={<History className="h-5 w-5" />}
              title={t('settings.modelConfigCenter.sections.historyTitle', '历史与恢复')}
              description={t('settings.modelConfigCenter.sections.historyDesc', '备份与版本快照统一放在一处，减少上下跳转。')}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg border border-border bg-surface/60 p-1">
                  <SegmentedButton active={historyTab === 'backups'} onClick={() => setHistoryTab('backups')}>
                    {t('settings.modelConfigCenter.tabs.backups', '备份')}
                  </SegmentedButton>
                  <SegmentedButton active={historyTab === 'versions'} onClick={() => setHistoryTab('versions')}>
                    {t('settings.modelConfigCenter.tabs.versions', '版本')}
                  </SegmentedButton>
                </div>
                <button
                  type="button"
                  onClick={() => void createBackup()}
                  disabled={busy === 'backup'}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                >
                  {busy === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                  {t('settings.modelConfigCenter.actions.createBackup', '立即备份')}
                </button>
              </div>


              <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                {historyTab === 'backups' ? (
                  backups.length > 0 ? (
                    backups.map((backup) => (
                      <div key={backup.id} className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-mono text-foreground">{backup.id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString()}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{formatBytes(backup.sizeBytes)}</div>
                            {backup.note && (
                              <div className="mt-2 text-xs text-muted-foreground">{backup.note}</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => requestRestoreBackup(backup.id)}
                            disabled={busy === `restore-${backup.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                          >
                            {busy === `restore-${backup.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {t('settings.modelConfigCenter.actions.restore', '恢复')}
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteBackup(backup.id)}
                            disabled={busy === `delete-${backup.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                          >
                            {busy === `delete-${backup.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            {t('settings.modelConfigCenter.actions.delete', '删除')}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('settings.modelConfigCenter.empty.noBackups', '还没有备份记录')}
                    </div>
                  )
                ) : (
                  versions.length > 0 ? (
                    versions.map((version) => (
                      <div key={version.id} className="rounded-xl border border-border/70 bg-background/30 p-3 text-sm">
                        <div className="font-mono text-foreground">#{version.id}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{version.filePath}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatBytes(version.sizeBytes)}</div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => requestRestoreVersion(version.id)}
                            disabled={busy === `version-${version.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface motion-color motion-press focus-ring disabled:opacity-60"
                          >
                            {busy === `version-${version.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            {t('settings.modelConfigCenter.actions.restore', '恢复')}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {t('settings.modelConfigCenter.empty.noVersions', '还没有版本快照')}
                    </div>
                  )
                )}
              </div>
            </div>
          </SettingsCard>
          )}
        </div>
        )}
      </div>

      {showAddProviderModal && (
        <ModalShell
          title={t('settings.modelConfigCenter.dialogs.addProviderTitle', '新增 Provider')}
          description={t('settings.modelConfigCenter.dialogs.addProviderDesc', '先给 Provider 一个稳定名称，创建后可在右侧继续补充连接信息。')}
          onClose={() => setShowAddProviderModal(false)}
          footer={(
            <>
              <button
                type="button"
                onClick={() => setShowAddProviderModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
              >
                {t('settings.modelConfigCenter.actions.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={handleCreateProvider}
                className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
              >
                <Plus className="h-4 w-4" />
                {t('settings.modelConfigCenter.actions.createProvider', '创建 Provider')}
              </button>
            </>
          )}
        >
          <SettingsField label={t('settings.modelConfigCenter.fields.providerKey', 'Provider Key')}>
            <SettingsInput
              autoFocus
              value={newProviderName}
              onChange={(event) => setNewProviderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleCreateProvider()
                }
              }}
              placeholder={t('settings.modelConfigCenter.placeholders.providerName', '例如：local-openai')}
            />
          </SettingsField>
        </ModalShell>
      )}


      {showImportModal && (
        <ModalShell
          title={t('settings.modelConfigCenter.dialogs.importContentTitle', '导入 JSON 内容')}
          description={t('settings.modelConfigCenter.dialogs.importContentDesc', '把完整的 models.json 内容粘贴进来，并按当前导入模式应用。')}
          onClose={() => {
            if (busy !== 'import-content') {
              setShowImportModal(false)
            }
          }}
          widthClass="max-w-2xl"
          footer={(
            <>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                disabled={busy === 'import-content'}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:opacity-60"
              >
                {t('settings.modelConfigCenter.actions.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={() => void importFromContent()}
                disabled={busy === 'import-content'}
                className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring disabled:opacity-60"
              >
                {busy === 'import-content' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t('settings.modelConfigCenter.actions.importNow', '立即导入')}
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/30 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t('settings.modelConfigCenter.sections.importMode', '导入模式')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('settings.modelConfigCenter.help.importMode', '合并保留现有 Provider，替换会直接采用导入内容。')}
                </div>
              </div>
              <div className="inline-flex rounded-lg border border-border bg-surface/60 p-1">
                <SegmentedButton active={importMode === 'merge'} onClick={() => setImportMode('merge')}>
                  {t('settings.modelConfigCenter.tabs.merge', '合并')}
                </SegmentedButton>
                <SegmentedButton active={importMode === 'replace'} onClick={() => setImportMode('replace')}>
                  {t('settings.modelConfigCenter.tabs.replace', '替换')}
                </SegmentedButton>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void pasteClipboardToImport()}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface motion-color motion-press focus-ring"
              >
                <Copy className="h-4 w-4" />
                {t('settings.modelConfigCenter.actions.pasteClipboard', '从剪贴板粘贴')}
              </button>
            </div>

            <textarea
              value={importContentDraft}
              onChange={(event) => setImportContentDraft(event.target.value)}
              placeholder={t('settings.modelConfigCenter.placeholders.importContent', '粘贴完整的 models.json 内容')}
              className="min-h-[320px] w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-info focus:outline-none motion-color motion-surface"
            />
          </div>
        </ModalShell>
      )}

      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          confirming={confirmingDialog}
          cancelLabel={t('settings.modelConfigCenter.actions.cancel', '取消')}
          onCancel={() => {
            if (!confirmingDialog) {
              setConfirmDialog(null)
            }
          }}
          onConfirm={() => void handleConfirmDialog()}
        />
      )}
    </>
  )
}
