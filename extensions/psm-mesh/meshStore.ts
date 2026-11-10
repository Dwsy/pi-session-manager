import { useSyncExternalStore } from 'react'
import type {
  PsmFavoriteItem,
  PsmMeshHerdrAgent,
  PsmMeshPeer,
  PsmPluginHostContext,
} from '@dwsy/plugin-sdk'
import {
  basenameForDisplay,
  type MeshPeer,
} from './meshHelpers'

export type MeshFilter = 'all' | 'online' | 'running' | 'idle' | 'favorites' | 'offline'

export interface MeshActivityItem {
  id: number
  eventName: string
  sessionId?: string
  sessionPath?: string
  label: string
  timestamp: string
}

export interface MeshStoreSnapshot {
  meshAgents: PsmMeshPeer[]
  herdrAgents: PsmMeshHerdrAgent[]
  meshAvailable: boolean
  favorites: PsmFavoriteItem[]
  activity: MeshActivityItem[]
  loading: boolean
  refreshing: boolean
  error: string | null
  actionError: string | null
  query: string
  filter: MeshFilter
  selectedRepo: string | null
  viewMode: 'board' | 'topology' | 'table'
  previewPeer: MeshPeer | null
  fromSessionId: string
  onlineCount: number
  runningCount: number
}

export interface MeshStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): MeshStoreSnapshot
  setQuery(query: string): void
  setFilter(filter: MeshFilter): void
  setSelectedRepo(repo: string | null): void
  setViewMode(mode: 'board' | 'topology' | 'table'): void
  setPreviewPeer(peer: MeshPeer | null): void
  setFromSessionId(id: string): void
  setActionError(error: string | null): void
  refresh(silent?: boolean): Promise<void>
  toggleFavorite(peer: MeshPeer): Promise<void>
  dispose(): void
}

export function createMeshStore(ctx: PsmPluginHostContext): MeshStore {
  let listeners = new Set<() => void>()
  let meshAgents: PsmMeshPeer[] = []
  let herdrAgents: PsmMeshHerdrAgent[] = []
  let meshAvailable = false
  let favorites: PsmFavoriteItem[] = []
  let activity: MeshActivityItem[] = []
  let loading = true
  let refreshing = false
  let error: string | null = null
  let actionError: string | null = null
  let query = ''
  let filter: MeshFilter = 'online'
  let selectedRepo: string | null = null
  let viewMode: 'board' | 'topology' | 'table' = 'board'
  let previewPeer: MeshPeer | null = null
  let fromSessionId = ''

  let generation = 0
  let refreshingTask: { token: number; promise: Promise<void> } | null = null
  let refreshDirty = false
  let disposed = false

  let cachedSnapshot: MeshStoreSnapshot | null = null

  const buildSnapshot = (): MeshStoreSnapshot => {
    const onlineCount = meshAvailable
      ? meshAgents.filter((p) => p.state === 'running' || p.state === 'waiting').length
      : 0
    const runningCount = meshAvailable
      ? meshAgents.filter((p) => p.state === 'running').length
      : 0

    return {
      meshAgents,
      herdrAgents,
      meshAvailable,
      favorites,
      activity,
      loading,
      refreshing,
      error,
      actionError,
      query,
      filter,
      selectedRepo,
      viewMode,
      previewPeer,
      fromSessionId,
      onlineCount,
      runningCount,
    }
  }

  const notify = () => {
    cachedSnapshot = buildSnapshot()
    listeners.forEach((listener) => listener())
  }

  // Initial snapshot
  cachedSnapshot = buildSnapshot()

  const updateActivity = (agents: PsmMeshPeer[]) => {
    const files = agents.flatMap((peer) =>
      peer.files.map((file) => ({
        id: 0,
        eventName: 'file_activity',
        sessionId: peer.sessionId,
        sessionPath: peer.sessionFile,
        label: `${file.op === 'write' ? 'Wrote' : 'Edited'} · ${basenameForDisplay(file.path)}`,
        timestamp: file.ts,
      })),
    )
    files.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    activity = files.slice(0, 12).map((file, id) => ({ ...file, id }))
  }

  const refresh = async (silent = false): Promise<void> => {
    if (disposed) return
    const inFlight = refreshingTask
    if (inFlight && inFlight.token === generation) {
      refreshDirty = true
      if (!silent && !refreshing) {
        refreshing = true
        notify()
      }
      return inFlight.promise
    }
    const token = ++generation
    if (!silent) {
      refreshing = true
      notify()
    }

    const task = (async () => {
      try {
        const [snapshot, hosts] = await Promise.all([
          ctx.psm.mesh.peers(),
          ctx.psm.mesh.herdrAgents().catch(() => []),
        ])
        if (token !== generation || disposed) return
        if (JSON.stringify(meshAgents) !== JSON.stringify(snapshot)) {
          meshAgents = snapshot
          updateActivity(snapshot)
        }
        if (JSON.stringify(herdrAgents) !== JSON.stringify(hosts)) herdrAgents = hosts
        meshAvailable = true
        error = null
      } catch (readError) {
        if (token !== generation || disposed) return
        meshAvailable = false
        error = readError instanceof Error ? readError.message : String(readError)
      } finally {
        if (token === generation && !disposed) {
          loading = false
          refreshing = false
          notify()
        }
      }
    })()

    refreshingTask = { token, promise: task }
    try {
      await task
    } finally {
      if (refreshingTask?.token === token) {
        refreshingTask = null
        if (refreshDirty && !disposed) {
          refreshDirty = false
          void refresh(true)
        }
      }
    }
  }

  // Load favorites once
  void ctx.psm.favorites.list().then((items) => {
    if (!disposed) {
      favorites = items
      notify()
    }
  }).catch(() => {})

  // Subscribe events
  const offChanged = ctx.events.subscribe('psm-mesh:changed', () => void refresh(true))
  const offAvailability = ctx.events.subscribe('psm-mesh:availability', ({ payload }) => {
    if ((payload as { available?: boolean } | null)?.available === false) {
      ++generation
      refreshDirty = false
      meshAvailable = false
      loading = false
      refreshing = false
      error = 'Mesh Hub disconnected · controls disabled; last snapshot remains readable'
      notify()
    } else {
      void refresh(true)
    }
  })

  // Initial fetch and interval
  void refresh(true)
  const interval = setInterval(() => void refresh(true), 5000)

  const toggleFavorite = async (peer: MeshPeer) => {
    if (!peer.session) return
    actionError = null
    notify()
    try {
      await ctx.psm.favorites.toggle({
        type: 'session',
        id: peer.session.id || peer.session.path,
        name: peer.title,
        path: peer.session.path,
      })
      favorites = await ctx.psm.favorites.list()
      notify()
    } catch (toggleError) {
      actionError = toggleError instanceof Error ? toggleError.message : String(toggleError)
      notify()
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot(): MeshStoreSnapshot {
      if (!cachedSnapshot) {
        cachedSnapshot = buildSnapshot()
      }
      return cachedSnapshot
    },
    setQuery(nextQuery: string) {
      if (query !== nextQuery) {
        query = nextQuery
        notify()
      }
    },
    setFilter(nextFilter: MeshFilter) {
      if (filter !== nextFilter) {
        filter = nextFilter
        notify()
      }
    },
    setSelectedRepo(nextRepo: string | null) {
      if (selectedRepo !== nextRepo) {
        selectedRepo = nextRepo
        notify()
      }
    },
    setViewMode(nextViewMode: 'board' | 'topology' | 'table') {
      if (viewMode !== nextViewMode) {
        viewMode = nextViewMode
        notify()
      }
    },
    setPreviewPeer(peer: MeshPeer | null) {
      previewPeer = peer
      notify()
    },
    setFromSessionId(id: string) {
      if (fromSessionId !== id) {
        fromSessionId = id
        notify()
      }
    },
    setActionError(err: string | null) {
      actionError = err
      notify()
    },
    refresh,
    toggleFavorite,
    dispose() {
      disposed = true
      ++generation
      refreshDirty = false
      refreshingTask = null
      clearInterval(interval)
      offChanged()
      offAvailability()
      listeners.clear()
    },
  }
}

export function useMeshSnapshot(store: MeshStore): MeshStoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
