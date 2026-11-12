import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { invoke } from '@/transport'
import type { SessionEntry, SystemPromptSnapshot } from '@/types'
import SystemPromptDialog from './SystemPromptDialog'

type Tab = 'prompt' | 'tools'
interface ContextValue {
  snapshots: Map<string, SystemPromptSnapshot>
  open: (id: string, tab: Tab) => void
}
const Context = createContext<ContextValue | null>(null)
export const useSystemMessageContext = () => useContext(Context)

export function SystemMessageProvider({ children, entries, sessionPath }: { children: ReactNode; entries: SessionEntry[]; sessionPath: string }) {
  const [snapshots, setSnapshots] = useState<SystemPromptSnapshot[]>([])
  const [selection, setSelection] = useState<{ id: string; tab: Tab } | null>(null)
  const systemCount = useMemo(() => entries.filter((entry) => entry.type === 'message' && entry.message?.role === 'system').length, [entries])
  useEffect(() => {
    let cancelled = false
    setSnapshots([])
    setSelection(null)
    if (sessionPath && systemCount) {
      invoke<SystemPromptSnapshot[]>('get_session_system_prompt_snapshots', { path: sessionPath })
        .then((result) => { if (!cancelled) setSnapshots(result) })
        .catch(() => { if (!cancelled) setSnapshots([]) })
    }
    return () => { cancelled = true }
  }, [sessionPath, systemCount])
  const byId = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.id, snapshot])), [snapshots])
  const open = useCallback((id: string, tab: Tab) => setSelection({ id, tab }), [])
  const value = useMemo(() => ({ snapshots: byId, open }), [byId, open])
  return <Context.Provider value={value}>
    {children}
    {selection && <SystemPromptDialog isOpen onClose={() => setSelection(null)} entries={entries} sessionPath={sessionPath} initialSnapshotId={selection.id} initialTab={selection.tab} initialSnapshots={snapshots.length > 0 ? snapshots : undefined} />}
  </Context.Provider>
}
