import type {
  PsmAgentUsageStatus,
  PsmJsonConfigClient,
} from '@pi-session-manager/plugin-sdk'

export const AGENT_USAGE_STATUS_CACHE_KEY = 'status-cache'

export interface AgentUsageStatusCacheFile {
  version: 1
  status: PsmAgentUsageStatus
  savedAt: string
}

function isStatus(value: unknown): value is PsmAgentUsageStatus {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return Array.isArray(record.providers) && typeof record.fetchedAt === 'string'
}

function isCacheFile(value: unknown): value is AgentUsageStatusCacheFile {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && isStatus(record.status) && typeof record.savedAt === 'string'
}

/** Legacy muxy-shaped cache (repo-root `status-cache.json`) — import snapshots only. */
function isLegacyMuxyCache(value: unknown): value is {
  version: number
  snapshots: Array<{
    id: string
    name: string
    fetchedAt: string
    state: { kind: string; message?: string }
    rows: Array<{
      label: string
      percent?: number | null
      resetAt?: string | null
      detail?: string | null
    }>
    planName?: string
  }>
} {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && Array.isArray(record.snapshots)
}

function legacyToStatus(legacy: NonNullable<ReturnType<typeof parseLegacy>>): PsmAgentUsageStatus | null {
  if (!legacy) return null
  const providers = legacy.snapshots.map((snap) => {
    const kind = snap.state.kind
    const state =
      kind === 'available' ? 'available' as const
        : kind === 'error' ? 'error' as const
          : 'unavailable' as const
    return {
      id: snap.id,
      name: snap.name,
      planName: snap.planName ?? null,
      fetchedAt: snap.fetchedAt,
      state,
      message: snap.state.message ?? null,
      metrics: snap.rows.map((row) => ({
        label: row.label,
        usedPercent: typeof row.percent === 'number' ? row.percent : null,
        resetAt: row.resetAt ?? null,
        detail: row.detail ?? null,
      })),
    }
  })
  const fetchedAt = providers.map((p) => p.fetchedAt).sort().at(-1) ?? new Date().toISOString()
  return { providers, fetchedAt }
}

function parseLegacy(value: unknown) {
  return isLegacyMuxyCache(value) ? value : null
}

export function normalizeCachedStatus(value: unknown): PsmAgentUsageStatus | null {
  if (isCacheFile(value)) return value.status
  if (isStatus(value)) return value
  return legacyToStatus(parseLegacy(value))
}

export async function readAgentUsageStatusCache(
  config: PsmJsonConfigClient,
): Promise<PsmAgentUsageStatus | null> {
  const raw = await config.read<unknown>(AGENT_USAGE_STATUS_CACHE_KEY, { defaultValue: null })
  return normalizeCachedStatus(raw)
}

export async function writeAgentUsageStatusCache(
  config: PsmJsonConfigClient,
  status: PsmAgentUsageStatus,
): Promise<void> {
  const payload: AgentUsageStatusCacheFile = {
    version: 1,
    status,
    savedAt: new Date().toISOString(),
  }
  await config.write(AGENT_USAGE_STATUS_CACHE_KEY, payload)
}