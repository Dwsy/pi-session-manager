import { ImageIcon, Monitor, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmWidgetHtml,
  PsmWidgetsClient,
} from '@pi-session-manager/plugin-sdk'

let widgetsClient: PsmWidgetsClient | null = null

type WidgetDetails = {
  savedFile?: unknown
  file?: unknown
  filename?: unknown
  fullPath?: unknown
  height?: unknown
  width?: unknown
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

function getDetails(data: PsmToolResolvedData): WidgetDetails {
  const message = data.result?.message
  if (isRecord(message) && isRecord(message.details)) return message.details
  return {}
}

function getWidgetFile(data: PsmToolResolvedData): string | null {
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

function getFallbackHtml(data: PsmToolResolvedData): string | null {
  for (const value of [data.args.widget_code, data.args.html, data.args.svg]) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function getWidgetTitle(data: PsmToolResolvedData, widget: PsmWidgetHtml | null): string {
  if (widget?.record.title) return widget.record.title
  if (typeof data.args.title === 'string' && data.args.title.trim()) return data.args.title
  return 'Generated widget'
}

function getPreviewHeight(data: PsmToolResolvedData, widget: PsmWidgetHtml | null): number {
  const details = getDetails(data)
  return clampHeight(
    widget?.record.height
    ?? asNumber(details.height)
    ?? asNumber(data.args.height),
  )
}

function getPreviewWidth(data: PsmToolResolvedData, widget: PsmWidgetHtml | null): number | undefined {
  const details = getDetails(data)
  return widget?.record.width ?? asNumber(details.width) ?? asNumber(data.args.width)
}

function GenerativeUiRenderer({ resolvedData, context }: PsmToolRenderProps) {
  const { isExpanded, toggleExpanded, disableSuccessStyle } = context
  const file = useMemo(() => getWidgetFile(resolvedData), [resolvedData])
  const fallbackHtml = useMemo(() => getFallbackHtml(resolvedData), [resolvedData])
  const [widget, setWidget] = useState<PsmWidgetHtml | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  const statusClass = resolvedData.isError || (error && !html) ? 'error' : disableSuccessStyle ? '' : 'success'
  const summary = file ?? (width ? `${width} x ${height}` : `${height}px`)
  const unavailableText = error ?? (resolvedData.output || 'Widget preview unavailable')

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${resolvedData.entryId}`}>
      <div className="tool-header select-none" onClick={toggleExpanded}>
        <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        <span className="tool-name inline-flex items-center gap-1.5">
          <Monitor className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-meta">{summary}</span>
        {loading && <span className="tool-meta">loading</span>}
      </div>

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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function isGenerativeUiTool(toolCall: PsmToolCallContent): boolean {
  const name = toolCall.name ?? ''
  return name === 'show_widget'
    || name === 'browse_widgets'
    || name.endsWith('.show_widget')
    || name.endsWith('.browse_widgets')
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
  permissions: ['fs:read'],
}

export function activate(ctx: PsmPluginHostContext) {
  widgetsClient = ctx.psm.widgets
  ctx.ui.registerToolRenderer(generativeUiRenderer)
  return {
    dispose() {
      widgetsClient = null
    },
  }
}
