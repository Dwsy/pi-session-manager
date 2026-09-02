import { useEffect, useSyncExternalStore } from 'react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

export interface KanbanLabel {
  id: string
  name: string
  color: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface KanbanLabelAssignment {
  sessionId: string
  labelId: string
}

export interface KanbanLabelsSnapshot {
  labels: KanbanLabel[]
  assignments: KanbanLabelAssignment[]
  loading: boolean
  error: string | null
}

export interface KanbanLabelsStore {
  load(): void
  subscribe(listener: () => void): () => void
  getSnapshot(): KanbanLabelsSnapshot
  createLabel(input: Pick<KanbanLabel, 'name' | 'color' | 'description'>): Promise<KanbanLabel>
  updateLabel(id: string, updates: Partial<Pick<KanbanLabel, 'name' | 'color' | 'description'>>): Promise<void>
  deleteLabel(id: string): Promise<void>
  toggleLabel(sessionId: string, labelId: string, assigned: boolean): Promise<void>
}

const CONFIG_KEY = 'labels'
const LOCAL_STORAGE_KEY = 'psm-kanban-board.labels'
const DEFAULT_LABEL_COLOR = '#0969da'

interface StoredLabelsConfig {
  version: 1
  labels: KanbanLabel[]
  assignments: KanbanLabelAssignment[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_LABEL_COLOR
  const color = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_LABEL_COLOR
}

function sanitizeLabel(value: unknown): KanbanLabel | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const name = value.name.trim()
  if (!name) return null
  const now = new Date().toISOString()
  return {
    id: value.id,
    name,
    color: normalizeColor(value.color),
    description: typeof value.description === 'string' ? value.description.trim() : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  }
}

function sanitizeAssignment(value: unknown): KanbanLabelAssignment | null {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || typeof value.labelId !== 'string') return null
  return { sessionId: value.sessionId, labelId: value.labelId }
}

function normalizeStoredConfig(value: unknown): StoredLabelsConfig {
  if (!isRecord(value)) return { version: 1, labels: [], assignments: [] }
  const labels = Array.isArray(value.labels)
    ? value.labels.map(sanitizeLabel).filter((label): label is KanbanLabel => Boolean(label))
    : []
  const labelIds = new Set(labels.map((label) => label.id))
  const seenAssignments = new Set<string>()
  const assignments = Array.isArray(value.assignments)
    ? value.assignments
        .map(sanitizeAssignment)
        .filter((assignment): assignment is KanbanLabelAssignment => Boolean(assignment))
        .filter((assignment) => {
          if (!labelIds.has(assignment.labelId)) return false
          const key = `${assignment.sessionId}\u0000${assignment.labelId}`
          if (seenAssignments.has(key)) return false
          seenAssignments.add(key)
          return true
        })
    : []
  return { version: 1, labels, assignments }
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

function writeLocalFallback(value: StoredLabelsConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function nextLabelId(labels: KanbanLabel[]): string {
  const prefix = `label-${Date.now()}`
  let id = prefix
  let suffix = 1
  while (labels.some((label) => label.id === id)) {
    id = `${prefix}-${suffix}`
    suffix += 1
  }
  return id
}

export function labelsForSession(
  labels: KanbanLabel[],
  assignments: KanbanLabelAssignment[],
  sessionId: string,
): KanbanLabel[] {
  const assignedIds = new Set(
    assignments
      .filter((assignment) => assignment.sessionId === sessionId)
      .map((assignment) => assignment.labelId),
  )
  return labels.filter((label) => assignedIds.has(label.id))
}

export function createKanbanLabelsStore(ctx: PsmPluginHostContext): KanbanLabelsStore {
  let snapshot: KanbanLabelsSnapshot = {
    labels: [],
    assignments: [],
    loading: true,
    error: null,
  }
  let started = false
  const listeners = new Set<() => void>()

  const emit = (next: Partial<KanbanLabelsSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  const persist = async (labels = snapshot.labels, assignments = snapshot.assignments) => {
    const stored: StoredLabelsConfig = { version: 1, labels, assignments }
    try {
      await ctx.psm.config.write(CONFIG_KEY, stored)
    } catch (error) {
      writeLocalFallback(stored)
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
        const normalized = normalizeStoredConfig(raw)
        emit({ labels: normalized.labels, assignments: normalized.assignments, loading: false, error: null })
      } catch (error) {
        emit({ loading: false, error: normalizeError(error) })
      }
    })()
  }

  return {
    load,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return snapshot
    },
    async createLabel(input) {
      const name = input.name.trim()
      if (!name) throw new Error('Label name is required')
      const now = new Date().toISOString()
      const label: KanbanLabel = {
        id: nextLabelId(snapshot.labels),
        name,
        color: normalizeColor(input.color),
        description: input.description.trim(),
        createdAt: now,
        updatedAt: now,
      }
      const labels = [...snapshot.labels, label]
      emit({ labels, error: null })
      await persist(labels)
      return label
    },
    async updateLabel(id, updates) {
      const labels = snapshot.labels.map((label) => {
        if (label.id !== id) return label
        const name = updates.name === undefined ? label.name : updates.name.trim()
        if (!name) throw new Error('Label name is required')
        return {
          ...label,
          name,
          color: updates.color === undefined ? label.color : normalizeColor(updates.color),
          description: updates.description === undefined ? label.description : updates.description.trim(),
          updatedAt: new Date().toISOString(),
        }
      })
      emit({ labels, error: null })
      await persist(labels)
    },
    async deleteLabel(id) {
      const labels = snapshot.labels.filter((label) => label.id !== id)
      const assignments = snapshot.assignments.filter((assignment) => assignment.labelId !== id)
      emit({ labels, assignments, error: null })
      await persist(labels, assignments)
    },
    async toggleLabel(sessionId, labelId, assigned) {
      const exists = snapshot.assignments.some(
        (assignment) => assignment.sessionId === sessionId && assignment.labelId === labelId,
      )
      const assignments = assigned
        ? exists
          ? snapshot.assignments
          : [...snapshot.assignments, { sessionId, labelId }]
        : snapshot.assignments.filter(
            (assignment) => !(assignment.sessionId === sessionId && assignment.labelId === labelId),
          )
      emit({ assignments, error: null })
      await persist(snapshot.labels, assignments)
    },
  }
}

export function useKanbanLabelsSnapshot(store: KanbanLabelsStore): KanbanLabelsSnapshot {
  useEffect(() => {
    store.load()
  }, [store])

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
