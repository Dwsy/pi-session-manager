import { ListFilter, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PsmCapabilityClient,
  PsmPluginCommandContext,
  PsmPluginHostContext,
  PsmPluginI18nClient,
  PsmSessionReference,
} from '@pi-session-manager/plugin-sdk'

import type { SessionEntry } from '@/types'
import { subscribeToolReview } from '@/contexts/toolReviewBus'
import { manifest } from './manifest'
import ToolCallReviewModal from './ToolCallReviewModal'
import { extractFileOperations } from './tool-review/model'

export { manifest }

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeEntries(entries: unknown[]): SessionEntry[] {
  return entries.filter((entry): entry is SessionEntry => {
    return Boolean(entry && typeof entry === 'object' && 'id' in entry && 'type' in entry)
  })
}

function buildToolResultByCallId(entries: SessionEntry[]) {
  const byCallId = new Map<string, SessionEntry>()

  for (const entry of entries) {
    if (entry.message?.role !== 'tool') continue
    const toolCallId = entry.message.toolCallId
    if (toolCallId) byCallId.set(toolCallId, entry)
  }

  return byCallId
}

async function readSessionEntries(client: PsmCapabilityClient, sessionPath: string) {
  return normalizeEntries(await client.sessions.readEntries(sessionPath))
}

function resolveSessionPath(args: Record<string, unknown>, context?: PsmPluginCommandContext) {
  return optionalString(args.sessionPath ?? args.path) ?? context?.selectedSession?.path
}

function CodeReviewToolbarButton({
  client,
  i18n,
  settings,
  session,
}: {
  client: PsmCapabilityClient
  i18n: PsmPluginI18nClient
  settings: { get<T>(key: string, fallback: T): T }
  session: PsmSessionReference
}) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [overrideEntries, setOverrideEntries] = useState<SessionEntry[] | null>(null)
  const [overrideMap, setOverrideMap] = useState<Map<string, SessionEntry> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionToolResultByCallId = useMemo(
    () => buildToolResultByCallId(entries),
    [entries],
  )

  const activeEntries = overrideEntries ?? entries
  const activeToolResultByCallId = overrideMap ?? sessionToolResultByCallId

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await readSessionEntries(client, session.path))
    } catch (loadError) {
      setEntries([])
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [client, session.path])

  useEffect(() => {
    if (!open) return
    if (overrideEntries) return
    void refresh()
  }, [open, overrideEntries, refresh])

  useEffect(() => {
    return subscribeToolReview((request) => {
      if (request.entries && request.toolResultByCallId) {
        setOverrideEntries(request.entries)
        setOverrideMap(request.toolResultByCallId)
        setError(null)
        setLoading(false)
        setOpen(true)
      } else if (request.sessionPath) {
        setOverrideEntries(null)
        setOverrideMap(null)
        setOpen(true)
      }
    })
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setOverrideEntries(null)
    setOverrideMap(null)
  }, [])

  const title = i18n.t('session.codeReview.title', 'Code review')
  const shortLabel = i18n.t('session.codeReview.shortLabel', 'Review')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOverrideEntries(null)
          setOverrideMap(null)
          setOpen(true)
        }}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/70 bg-secondary px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground focus-ring"
        title={title}
        aria-label={title}
        aria-busy={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="font-medium">{shortLabel}</span>
      </button>

      <ToolCallReviewModal
        isOpen={open}
        onClose={handleClose}
        entries={activeEntries}
        toolResultByCallId={activeToolResultByCallId}
        loading={loading}
        error={error}
        diffConfig={{
          splitView: settings.get('diffView', 'split') === 'split',
          wrap: settings.get('diffWrap', false),
          expandUnchanged: settings.get('diffExpandUnchanged', false),
          lineNumbers: settings.get('diffLineNumbers', true),
          lineDiffType: settings.get('diffLineDiffType', 'words'),
          indicators: settings.get('diffIndicators', true),
        }}
      />
    </>
  )
}

export default function activate(ctx: PsmPluginHostContext) {
  async function inspect(args: Record<string, unknown>, context?: PsmPluginCommandContext) {
    const sessionPath = resolveSessionPath(args, context)
    if (!sessionPath) throw new Error('sessionPath is required')

    const entries = await readSessionEntries(ctx.psm, sessionPath)
    const toolResultByCallId = buildToolResultByCallId(entries)
    const operations = extractFileOperations(entries, toolResultByCallId)
    return {
      sessionPath,
      count: operations.length,
      operations,
    }
  }

  ctx.registerCommand({
    id: 'code-review.inspect',
    title: 'Inspect Code Review Operations',
    description: 'Extract reviewable file, shell, and task operations from the current session.',
    category: 'Code Review',
    keywords: ['code review', 'tool calls', 'changes', 'diff', '审查'],
    scope: 'session',
    run: inspect,
  })

  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.code-review.toolbar',
    title: 'Code Review',
    render: (props) => (
      <CodeReviewToolbarButton
        client={ctx.psm}
        i18n={ctx.i18n}
        settings={ctx.settings}
        session={props.session}
      />
    ),
  })
}
