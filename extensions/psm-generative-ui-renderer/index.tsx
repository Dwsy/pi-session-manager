import { ImageIcon, Monitor, SquareArrowOutUpRight, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import {
  SessionPluginPanel,
  SessionPluginPanelBody,
  SessionPluginPanelHeader,
  SessionPluginPanelState,
  sessionPluginPanelActionButtonClass,
} from '@/components/session-viewer/SessionPluginPanel'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmPluginI18nClient,
  PsmSessionReference,
  PsmSessionUiRenderProps,
  PsmSessionViewerController,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmWidgetHtml,
  PsmWidgetsClient,
  PsmWindowsClient,
} from '@pi-session-manager/plugin-sdk'

let widgetsClient: PsmWidgetsClient | null = null
let windowsClient: PsmWindowsClient | null = null

type WidgetDetails = {
  savedFile?: unknown
  file?: unknown
  filename?: unknown
  fullPath?: unknown
  height?: unknown
  width?: unknown
}

type WidgetDataSource = {
  args: Record<string, unknown>
  result?: PsmToolResolvedData['result']
  output?: string
}

type SessionEntryLike = {
  type?: unknown
  id?: unknown
  timestamp?: unknown
  message?: unknown
}

type SessionWidgetItem = {
  key: string
  rowEntryId: string
  toolCallId: string | null
  kind: string
  title: string
  file: string | null
  fallbackHtml: string | null
  width?: number
  height: number
  timestamp: string | null
  source: WidgetDataSource
}

interface WidgetsToolbarButtonProps {
  open: boolean
  onToggle(): void
}

interface WidgetsPanelProps {
  i18n: PsmPluginI18nClient
  sessionsClient: Pick<PsmPluginHostContext['psm']['sessions'], 'readEntries'>
  session: PsmSessionReference
  open: boolean
  onClose(): void
  viewer?: PsmSessionViewerController
  activeEntryId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeWidgetFile(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && !value.includes('/') && !value.includes('\\') && !value.includes('..')
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clampHeight(value: number | undefined): number {
  if (!value) return 360
  return Math.max(220, Math.min(900, value))
}

function getDetails(data: WidgetDataSource): WidgetDetails {
  const message = data.result?.message
  if (isRecord(message) && isRecord(message.details)) return message.details as WidgetDetails
  return {}
}

function getWidgetFile(data: WidgetDataSource): string | null {
  const details = getDetails(data)
  for (const value of [details.savedFile, details.file, details.filename, data.args.savedFile, data.args.file]) {
    if (typeof value === 'string' && isSafeWidgetFile(value)) return value
  }

  for (const value of [details.fullPath, data.args.fullPath]) {
    if (typeof value !== 'string') continue
    const file = basename(value)
    if (isSafeWidgetFile(file)) return file
  }

  return null
}

function getFallbackHtml(data: WidgetDataSource): string | null {
  for (const value of [data.args.widget_code, data.args.html, data.args.svg]) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function getWidgetTitle(data: WidgetDataSource, widget: PsmWidgetHtml | null): string {
  if (widget?.record.title) return widget.record.title
  if (typeof data.args.title === 'string' && data.args.title.trim()) return data.args.title
  return 'Generated widget'
}

function getPreviewHeight(data: WidgetDataSource, widget: PsmWidgetHtml | null): number {
  const details = getDetails(data)
  return clampHeight(
    widget?.record.height
    ?? asNumber(details.height)
    ?? asNumber(data.args.height),
  )
}

function getPreviewWidth(data: WidgetDataSource, widget: PsmWidgetHtml | null): number | undefined {
  const details = getDetails(data)
  return widget?.record.width ?? asNumber(details.width) ?? asNumber(data.args.width)
}

function isGenerativeUiToolName(name: string): boolean {
  return name === 'show_widget'
    || name === 'browse_widgets'
    || name.endsWith('.show_widget')
    || name.endsWith('.browse_widgets')
}

function isGenerativeUiTool(toolCall: PsmToolCallContent): boolean {
  return isGenerativeUiToolName(toolCall.name ?? '')
}

function createWidgetSource(toolCall: Record<string, unknown>, result: PsmToolResolvedData['result'] | undefined, output = ''): WidgetDataSource {
  return {
    args: isRecord(toolCall.arguments) ? toolCall.arguments : {},
    result,
    output,
  }
}

function messageRole(entry: SessionEntryLike): string | null {
  if (!isRecord(entry.message)) return null
  return typeof entry.message.role === 'string' ? entry.message.role : null
}

function toolResultCallId(entry: SessionEntryLike): string | null {
  if (!isRecord(entry.message)) return null
  return typeof entry.message.toolCallId === 'string' && entry.message.toolCallId ? entry.message.toolCallId : null
}

function collectSessionWidgets(entries: unknown[]): SessionWidgetItem[] {
  const toolResults = new Map<string, PsmToolResolvedData['result']>()
  const typedEntries = entries.filter(isRecord) as SessionEntryLike[]

  for (const entry of typedEntries) {
    if (messageRole(entry) !== 'toolResult') continue
    const toolCallId = toolResultCallId(entry)
    if (!toolCallId) continue
    toolResults.set(toolCallId, entry as PsmToolResolvedData['result'])
  }

  const widgets: SessionWidgetItem[] = []

  for (const entry of typedEntries) {
    if (messageRole(entry) !== 'assistant' || !isRecord(entry.message)) continue
    const content = Array.isArray(entry.message.content) ? entry.message.content : []

    content.forEach((item, index) => {
      if (!isRecord(item) || item.type !== 'toolCall') return
      const name = typeof item.name === 'string' ? item.name : ''
      if (!isGenerativeUiToolName(name)) return

      const toolCallId = typeof item.id === 'string' && item.id ? item.id : null
      const source = createWidgetSource(item, toolCallId ? toolResults.get(toolCallId) : undefined)
      const file = getWidgetFile(source)
      const fallbackHtml = getFallbackHtml(source)
      const title = getWidgetTitle(source, null)
      const rowEntryId = typeof entry.id === 'string' ? entry.id : `${name}-${index}`
      const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null

      widgets.push({
        key: toolCallId ?? `${rowEntryId}:${name}:${index}`,
        rowEntryId,
        toolCallId,
        kind: name,
        title,
        file,
        fallbackHtml,
        width: getPreviewWidth(source, null),
        height: getPreviewHeight(source, null),
        timestamp,
        source,
      })
    })
  }

  return widgets
}

async function resolveWidgetHtml(data: WidgetDataSource, currentWidget?: PsmWidgetHtml | null): Promise<PsmWidgetHtml | null> {
  if (currentWidget) return currentWidget
  const file = getWidgetFile(data)
  if (!file || !widgetsClient) return null
  return widgetsClient.readHtml(file)
}

async function openWidgetWindow(data: WidgetDataSource, currentWidget?: PsmWidgetHtml | null): Promise<void> {
  if (!windowsClient) {
    throw new Error('Preview window is unavailable')
  }

  const widget = await resolveWidgetHtml(data, currentWidget)
  const html = widget?.html ?? getFallbackHtml(data)
  if (!html) {
    throw new Error('Widget preview unavailable')
  }

  await windowsClient.open({
    title: getWidgetTitle(data, widget),
    html,
    width: getPreviewWidth(data, widget) ?? 1024,
    height: getPreviewHeight(data, widget),
    floating: true,
  })
}

function formatWidgetTimestamp(value: string | null, language: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language || undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toolbarButtonClass(open: boolean): string {
  return `inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
    open
      ? 'border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16'
      : 'border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
  }`
}

function WidgetsToolbarButton({ open, onToggle }: WidgetsToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={toolbarButtonClass(open)}
      title="Widgets"
      aria-label="Widgets"
      aria-expanded={open}
      aria-pressed={open}
    >
      <Monitor className="h-3.5 w-3.5" />
      <span className="font-medium">Widgets</span>
    </button>
  )
}

function GenerativeUiWidgetsPanel({
  i18n,
  sessionsClient,
  session,
  open,
  onClose,
  viewer,
  activeEntryId,
}: WidgetsPanelProps) {
  const { language } = i18n
  const [items, setItems] = useState<SessionWidgetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windowError, setWindowError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!open || !session.path) {
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    setError(null)
    setWindowError(null)

    sessionsClient.readEntries(session.path).then((entries) => {
      if (cancelled) return
      setItems(collectSessionWidgets(entries))
      setLoading(false)
    }).catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, session.path, sessionsClient])

  const handleReveal = (item: SessionWidgetItem) => {
    setWindowError(null)
    if (!viewer) return
    if (item.toolCallId) {
      viewer.revealToolCall(item.toolCallId, { expand: true, align: 'center' })
      return
    }
    viewer.revealEntry(item.rowEntryId, { align: 'center' })
  }

  const handleOpenWindow = async (event: MouseEvent<HTMLButtonElement>, item: SessionWidgetItem) => {
    event.stopPropagation()
    setWindowError(null)
    try {
      await openWidgetWindow(item.source)
    } catch (err) {
      setWindowError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <SessionPluginPanel label="Widgets">
      <SessionPluginPanelHeader
        icon={<Monitor className="h-4 w-4" />}
        title="Widgets"
        subtitle={loading ? 'Loading…' : `${items.length} items`}
        onClose={onClose}
        closeLabel="Close widgets"
      />

      <SessionPluginPanelBody>
        <div className="space-y-2">
          {error && (
            <SessionPluginPanelState tone="error" role="alert">
              {error}
            </SessionPluginPanelState>
          )}
          {windowError && (
            <SessionPluginPanelState tone="error" role="alert">
              {windowError}
            </SessionPluginPanelState>
          )}
          {!loading && !error && items.length === 0 && (
            <SessionPluginPanelState role="status">
              当前会话还没有 widget 记录。
            </SessionPluginPanelState>
          )}
          {items.map((item) => {
            const active = activeEntryId === item.rowEntryId
            const identifier = item.file ?? item.kind
            const timestamp = formatWidgetTimestamp(item.timestamp, language)
            const canOpen = Boolean(windowsClient && (item.file || item.fallbackHtml))
            return (
              <div
                key={item.key}
                className={`flex items-stretch gap-2 rounded-md border p-2 ${
                  active
                    ? 'border-primary/35 bg-primary/8'
                    : 'border-border/70 bg-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleReveal(item)}
                  className="min-w-0 flex-1 rounded px-2 py-2 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                >
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                    <span className="rounded border border-border/60 bg-background/45 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.kind}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{identifier}</div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{item.width ? `${item.width} × ${item.height}` : `${item.height}px`}</span>
                    {timestamp && <span>{timestamp}</span>}
                  </div>
                </button>
                <button
                  type="button"
                  className={`${sessionPluginPanelActionButtonClass} shrink-0 self-stretch disabled:cursor-not-allowed disabled:opacity-50`}
                  onClick={(event) => handleOpenWindow(event, item)}
                  disabled={!canOpen}
                  title={canOpen ? '在新窗口打开' : '当前项不可打开'}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                    在新窗口打开
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </SessionPluginPanelBody>
    </SessionPluginPanel>
  )
}

function GenerativeUiRenderer({ resolvedData, context }: PsmToolRenderProps) {
  const { isExpanded, toggleExpanded, disableSuccessStyle, t } = context
  const file = useMemo(() => getWidgetFile(resolvedData), [resolvedData])
  const fallbackHtml = useMemo(() => getFallbackHtml(resolvedData), [resolvedData])
  const [widget, setWidget] = useState<PsmWidgetHtml | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windowError, setWindowError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setWidget(null)
    setError(null)

    if (!file || !widgetsClient) {
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    widgetsClient.readHtml(file).then((result) => {
      if (cancelled) return
      setWidget(result)
      setLoading(false)
    }).catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [file])

  const html = widget?.html ?? fallbackHtml
  const title = getWidgetTitle(resolvedData, widget)
  const height = getPreviewHeight(resolvedData, widget)
  const width = getPreviewWidth(resolvedData, widget)
  const statusData = {
    ...resolvedData,
    isError: resolvedData.isError || Boolean(error && !html),
  }
  const status = getToolRenderStatus(statusData)
  const summary = file ?? (width ? `${width} x ${height}` : `${height}px`)
  const unavailableText = error ?? (resolvedData.output || 'Widget preview unavailable')
  const openPreviewWindow = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setWindowError(null)
    try {
      await openWidgetWindow(resolvedData, widget)
    } catch (err) {
      setWindowError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={`tool-execution ${getToolExecutionClass(statusData, disableSuccessStyle)}`.trim()} id={`entry-${resolvedData.entryId}`}>
      <ToolHeader
        expandable
        expanded={isExpanded}
        onToggle={toggleExpanded}
        ariaLabel={`${title}: ${getToolStatusLabel(status, t)}`}
        actions={html ? (
          <button
            type="button"
            className="tool-copy-button"
            aria-label={windowsClient ? 'Open preview in new window' : 'Preview window is unavailable'}
            title={windowsClient ? 'Open preview in new window' : 'Preview window is unavailable'}
            disabled={!windowsClient}
            onClick={openPreviewWindow}
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      >
        <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        <span className="tool-name inline-flex items-center gap-1.5">
          <Monitor className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-detail">{summary}</span>
        {loading && <span className="tool-detail">{t('components.toolCall.previewLoading', 'Loading preview')}</span>}
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
        <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded && (
            <div className="space-y-2 p-3 text-sm">
              {html ? (
                <iframe
                  title={title}
                  srcDoc={html}
                  sandbox="allow-scripts"
                  className="w-full rounded-md border border-border/70 bg-white"
                  style={{ height, minHeight: 220 }}
                />
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-border/60 bg-surface/35 p-3 text-muted-foreground">
                  {error ? <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" /> : <ImageIcon className="mt-0.5 h-4 w-4 text-accent" />}
                  <span>{unavailableText}</span>
                </div>
              )}
              {windowError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {windowError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const generativeUiRenderer: PsmToolRendererRegistration = {
  id: 'builtin-generative-ui-renderer',
  name: 'Generative UI Renderer',
  match: isGenerativeUiTool,
  priority: 125,
  component: GenerativeUiRenderer,
  getSearchSegments: (_toolCall, data) => [
    data.name,
    getWidgetTitle(data, null),
    getWidgetFile(data) ?? '',
    data.output,
  ].filter(Boolean),
  getPreview: (_toolCall, data) => {
    const file = getWidgetFile(data)
    return file ? `Widget: ${file}` : getWidgetTitle(data, null)
  },
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.generative-ui-renderer',
  name: 'Generative UI Renderer',
  version: '1.0.0',
  permissions: ['sessions:read', 'fs:read', 'windows:open'],
}

export function activate(ctx: PsmPluginHostContext) {
  widgetsClient = ctx.psm.widgets
  windowsClient = ctx.psm.windows
  ctx.ui.registerToolRenderer(generativeUiRenderer)
  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.generative-ui-renderer.toolbar',
    title: 'Widgets',
    panelId: 'builtin.generative-ui-renderer.panel',
    render: (props: PsmSessionUiRenderProps) => (
      <WidgetsToolbarButton open={Boolean(props.panelOpen)} onToggle={props.togglePanel ?? (() => {})} />
    ),
  })
  ctx.ui.registerSessionPanel({
    id: 'builtin.generative-ui-renderer.panel',
    title: 'Widgets',
    side: 'right',
    render: (props: PsmSessionUiRenderProps) => (
      <GenerativeUiWidgetsPanel
        i18n={ctx.i18n}
        sessionsClient={ctx.psm.sessions}
        session={props.session}
        open={Boolean(props.panelOpen)}
        onClose={props.closePanel ?? (() => {})}
        viewer={props.viewer}
        activeEntryId={props.activeEntryId}
      />
    ),
  })
  return {
    dispose() {
      widgetsClient = null
      windowsClient = null
    },
  }
}
