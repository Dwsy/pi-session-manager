import { useEffect, useSyncExternalStore } from 'react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'
import type { KanbanCardDensity } from './kanbanBoardModel'

export interface KanbanWorkspaceConfig {
  projectFilter: string | null
  filterTagIds: string[]
  sourceFilterSlugs: string[]
  columnOrder: string[]
  cardDensity: KanbanCardDensity
}

export interface KanbanWorkspace {
  id: string
  name: string
  config: KanbanWorkspaceConfig
  createdAt: string
  updatedAt: string
}

export type KanbanWorkspaceDraft = Omit<KanbanWorkspace, 'createdAt' | 'updatedAt'>

export interface KanbanWorkspaceSnapshot {
  workspaces: KanbanWorkspace[]
  activeWorkspace: KanbanWorkspace
  activeWorkspaceId: string
  selectedProject: string | null
  loading: boolean
  error: string | null
}

export interface KanbanWorkspaceStore {
  load(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): KanbanWorkspaceSnapshot
  selectWorkspace(id: string): void
  selectProject(project: string | null): void
  saveWorkspace(workspace: KanbanWorkspaceDraft): Promise<void>
  deleteWorkspace(id: string): Promise<void>
  updateActiveWorkspaceConfig(config: Partial<KanbanWorkspaceConfig>): Promise<void>
}

const CONFIG_KEY = 'workspaces'
const LOCAL_STORAGE_KEY = 'psm-kanban-board.workspaces'
const DEFAULT_WORKSPACE_ID = '__default__'
const DEFAULT_CREATED_AT = '1970-01-01T00:00:00.000Z'

const EMPTY_CONFIG: KanbanWorkspaceConfig = {
  projectFilter: null,
  filterTagIds: [],
  sourceFilterSlugs: [],
  columnOrder: [],
  cardDensity: 'comfortable',
}

interface StoreState {
  customWorkspaces: KanbanWorkspace[]
  defaultWorkspaceConfig: KanbanWorkspaceConfig
  activeWorkspaceId: string
  selectedProject: string | null
  loading: boolean
  error: string | null
}

interface StoredWorkspaceConfig {
  version: 1
  activeWorkspaceId: string
  defaultWorkspaceConfig: KanbanWorkspaceConfig
  workspaces: KanbanWorkspace[]
}

function cloneConfig(config: KanbanWorkspaceConfig): KanbanWorkspaceConfig {
  return {
    projectFilter: config.projectFilter,
    filterTagIds: [...config.filterTagIds],
    sourceFilterSlugs: [...config.sourceFilterSlugs],
    columnOrder: [...config.columnOrder],
    cardDensity: config.cardDensity,
  }
}

function defaultWorkspace(config: KanbanWorkspaceConfig): KanbanWorkspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'All Projects',
    config: cloneConfig(config),
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function sanitizeConfig(value: unknown): KanbanWorkspaceConfig {
  if (!isRecord(value)) return cloneConfig(EMPTY_CONFIG)
  const cardDensity = value.cardDensity === 'compact' ? 'compact' : 'comfortable'
  return {
    projectFilter: typeof value.projectFilter === 'string' && value.projectFilter ? value.projectFilter : null,
    filterTagIds: stringArray(value.filterTagIds),
    sourceFilterSlugs: stringArray(value.sourceFilterSlugs),
    columnOrder: stringArray(value.columnOrder),
    cardDensity,
  }
}

function sanitizeWorkspace(value: unknown): KanbanWorkspace | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  if (value.id === DEFAULT_WORKSPACE_ID) return null
  const now = new Date().toISOString()
  return {
    id: value.id,
    name: value.name,
    config: sanitizeConfig(value.config),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  }
}

function normalizeStoredConfig(raw: unknown): Pick<StoreState, 'customWorkspaces' | 'defaultWorkspaceConfig' | 'activeWorkspaceId'> {
  const source: Record<string, unknown> = Array.isArray(raw)
    ? { workspaces: raw }
    : isRecord(raw)
      ? raw
      : {}

  const customWorkspaces = Array.isArray(source.workspaces)
    ? source.workspaces.map(sanitizeWorkspace).filter((workspace): workspace is KanbanWorkspace => Boolean(workspace))
    : []

  const requestedActiveId = typeof source.activeWorkspaceId === 'string' ? source.activeWorkspaceId : DEFAULT_WORKSPACE_ID
  const activeWorkspaceId = requestedActiveId === DEFAULT_WORKSPACE_ID || customWorkspaces.some((workspace) => workspace.id === requestedActiveId)
    ? requestedActiveId
    : DEFAULT_WORKSPACE_ID

  return {
    customWorkspaces,
    defaultWorkspaceConfig: sanitizeConfig(source.defaultWorkspaceConfig),
    activeWorkspaceId,
  }
}

function buildStoredConfig(state: StoreState): StoredWorkspaceConfig {
  return {
    version: 1,
    activeWorkspaceId: state.activeWorkspaceId,
    defaultWorkspaceConfig: cloneConfig(state.defaultWorkspaceConfig),
    workspaces: state.customWorkspaces,
  }
}

function buildSnapshot(state: StoreState): KanbanWorkspaceSnapshot {
  const workspaces = [defaultWorkspace(state.defaultWorkspaceConfig), ...state.customWorkspaces]
  const activeWorkspace = workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? workspaces[0]

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace.id,
    selectedProject: state.selectedProject,
    loading: state.loading,
    error: state.error,
  }
}

function readLocalFallback(): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLocalFallback(value: StoredWorkspaceConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

function nextWorkspaceId(workspaces: KanbanWorkspace[]) {
  let id = `ws-${Date.now()}`
  while (workspaces.some((workspace) => workspace.id === id)) {
    id = `${id}x`
  }
  return id
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createKanbanWorkspaceStore(ctx: PsmPluginHostContext): KanbanWorkspaceStore {
  let state: StoreState = {
    customWorkspaces: [],
    defaultWorkspaceConfig: cloneConfig(EMPTY_CONFIG),
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    selectedProject: null,
    loading: true,
    error: null,
  }
  let snapshot = buildSnapshot(state)
  let started = false
  const listeners = new Set<() => void>()

  const emit = (next: Partial<StoreState>) => {
    state = { ...state, ...next }
    snapshot = buildSnapshot(state)
    for (const listener of listeners) listener()
  }

  const persist = async () => {
    const value = buildStoredConfig(state)
    try {
      await ctx.psm.config.write(CONFIG_KEY, value)
    } catch (error) {
      writeLocalFallback(value)
      emit({ error: normalizeError(error) })
    }
  }

  const load = () => {
    if (started) return
    started = true
    void (async () => {
      try {
        let raw: unknown = null
        try {
          raw = await ctx.psm.config.read<unknown>(CONFIG_KEY, { defaultValue: null })
        } catch {
          raw = readLocalFallback()
        }
        emit({
          ...normalizeStoredConfig(raw),
          loading: false,
          error: null,
        })
      } catch (error) {
        emit({ loading: false, error: normalizeError(error) })
      }
    })()
  }

  return {
    load,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot() {
      return snapshot
    },
    selectWorkspace(id) {
      const exists = id === DEFAULT_WORKSPACE_ID || state.customWorkspaces.some((workspace) => workspace.id === id)
      emit({
        activeWorkspaceId: exists ? id : DEFAULT_WORKSPACE_ID,
        selectedProject: null,
        error: null,
      })
      void persist()
    },
    selectProject(project) {
      emit({ selectedProject: project, error: null })
    },
    async saveWorkspace(workspace) {
      const now = new Date().toISOString()
      const editing = workspace.id && workspace.id !== '__new__'
      const id = editing ? workspace.id : nextWorkspaceId(state.customWorkspaces)
      const existing = state.customWorkspaces.find((item) => item.id === id)
      const nextWorkspace: KanbanWorkspace = {
        id,
        name: workspace.name,
        config: sanitizeConfig(workspace.config),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const customWorkspaces = existing
        ? state.customWorkspaces.map((item) => (item.id === id ? nextWorkspace : item))
        : [...state.customWorkspaces, nextWorkspace]

      emit({
        customWorkspaces,
        activeWorkspaceId: existing ? state.activeWorkspaceId : id,
        selectedProject: null,
        error: null,
      })
      await persist()
    },
    async deleteWorkspace(id) {
      if (id === DEFAULT_WORKSPACE_ID) return
      emit({
        customWorkspaces: state.customWorkspaces.filter((workspace) => workspace.id !== id),
        activeWorkspaceId: state.activeWorkspaceId === id ? DEFAULT_WORKSPACE_ID : state.activeWorkspaceId,
        selectedProject: state.activeWorkspaceId === id ? null : state.selectedProject,
        error: null,
      })
      await persist()
    },
    async updateActiveWorkspaceConfig(config) {
      const nextConfig = {
        ...snapshot.activeWorkspace.config,
        ...config,
      }
      if (snapshot.activeWorkspaceId === DEFAULT_WORKSPACE_ID) {
        emit({ defaultWorkspaceConfig: sanitizeConfig(nextConfig), error: null })
      } else {
        emit({
          customWorkspaces: state.customWorkspaces.map((workspace) => (
            workspace.id === snapshot.activeWorkspaceId
              ? { ...workspace, config: sanitizeConfig(nextConfig), updatedAt: new Date().toISOString() }
              : workspace
          )),
          error: null,
        })
      }
      await persist()
    },
  }
}

export function useKanbanWorkspaceSnapshot(store: KanbanWorkspaceStore): KanbanWorkspaceSnapshot {
  useEffect(() => {
    store.load()
  }, [store])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
