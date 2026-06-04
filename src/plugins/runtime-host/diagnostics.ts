import type { PsmPluginDiagnostic } from './types'

export const PSM_PLUGIN_DIAGNOSTICS_STORAGE_KEY = 'psm.plugin.diagnostics.v1'

function storage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null
    return globalThis.localStorage
  } catch {
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

export function normalizePluginError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
}

export function pluginDiagnostic(options: {
  level: PsmPluginDiagnostic['level']
  phase: NonNullable<PsmPluginDiagnostic['phase']>
  message: string
  pluginId?: string
  sourceId?: string
  contributionId?: string
  error?: unknown
}): PsmPluginDiagnostic {
  const errorDetails = options.error === undefined ? undefined : normalizePluginError(options.error)
  const timestamp = nowIso()
  return {
    level: options.level,
    phase: options.phase,
    pluginId: options.pluginId,
    sourceId: options.sourceId,
    contributionId: options.contributionId,
    message: options.message,
    stack: errorDetails?.stack,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    count: 1,
  }
}

export function diagnosticsMatch(a: PsmPluginDiagnostic, b: PsmPluginDiagnostic) {
  return a.level === b.level
    && a.phase === b.phase
    && a.pluginId === b.pluginId
    && a.sourceId === b.sourceId
    && a.contributionId === b.contributionId
    && a.message === b.message
}

export function mergeDiagnostic(list: PsmPluginDiagnostic[], next: PsmPluginDiagnostic): PsmPluginDiagnostic[] {
  const existingIndex = list.findIndex((item) => diagnosticsMatch(item, next))
  if (existingIndex === -1) return [...list, next]

  return list.map((item, index) => {
    if (index !== existingIndex) return item
    return {
      ...item,
      count: (item.count ?? 1) + (next.count ?? 1),
      firstSeenAt: item.firstSeenAt ?? next.firstSeenAt,
      lastSeenAt: next.lastSeenAt ?? item.lastSeenAt,
      stack: item.stack ?? next.stack,
    }
  })
}

export function mergeDiagnostics(base: PsmPluginDiagnostic[], additions: PsmPluginDiagnostic[]): PsmPluginDiagnostic[] {
  return additions.reduce((current, item) => mergeDiagnostic(current, item), base)
}

function readStoredDiagnostics(): Record<string, PsmPluginDiagnostic[]> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(PSM_PLUGIN_DIAGNOSTICS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, PsmPluginDiagnostic[]>
  } catch {
    return {}
  }
}

function writeStoredDiagnostics(records: Record<string, PsmPluginDiagnostic[]>) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PSM_PLUGIN_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Diagnostics must never be able to crash the plugin host.
  }
}

export function getPersistedPluginDiagnostics(pluginId: string): PsmPluginDiagnostic[] {
  return readStoredDiagnostics()[pluginId] ?? []
}

export function recordPersistedPluginDiagnostic(pluginId: string, diagnostic: PsmPluginDiagnostic) {
  const records = readStoredDiagnostics()
  records[pluginId] = mergeDiagnostic(records[pluginId] ?? [], diagnostic)
  writeStoredDiagnostics(records)
}

export function clearPersistedPluginDiagnostics(pluginId?: string) {
  const store = storage()
  if (!store) return
  if (!pluginId) {
    store.removeItem(PSM_PLUGIN_DIAGNOSTICS_STORAGE_KEY)
    return
  }
  const records = readStoredDiagnostics()
  delete records[pluginId]
  writeStoredDiagnostics(records)
}
