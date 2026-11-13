import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PsmCapabilityClient,
  PsmPluginSettingsClient,
  PsmSessionReference,
} from '@dwsy/plugin-sdk'

import type { SessionEntry } from '@/types'
import ToolCallReviewModal from './ToolCallReviewModal'
import { buildToolResultByCallId, readSessionEntries } from './sessionData'

/**
 * Right-side session panel for code review. Shares the review body with the
 * toolbar modal (variant="panel") so both surfaces can be open at once.
 */
export default function CodeReviewPanel({
  client,
  settings,
  session,
  panelOpen = true,
  width,
  onClose,
}: {
  client: PsmCapabilityClient
  settings: PsmPluginSettingsClient
  session: PsmSessionReference
  panelOpen?: boolean
  width?: number
  onClose: () => void
}) {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // The host keeps right panels mounted while hidden; reload when visible.
  useEffect(() => {
    if (!panelOpen) return
    void refresh()
  }, [panelOpen, refresh])

  const toolResultByCallId = useMemo(
    () => buildToolResultByCallId(entries),
    [entries],
  )

  return (
    <ToolCallReviewModal
      variant="panel"
      narrow={(width ?? 380) < 720}
      sessionCwd={session.cwd ?? undefined}
      isOpen
      onClose={onClose}
      entries={entries}
      toolResultByCallId={toolResultByCallId}
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
  )
}
