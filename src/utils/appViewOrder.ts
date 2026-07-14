const STORAGE_KEY = 'psm.appViewOrder.v1'

/** Only kanban is pinned by default; other plugin apps stay unpinned. */
export const DEFAULT_PINNED_APP_VIEW_ID = 'builtin.kanban-board.view'

export interface AppViewOrderState {
  /** App views pinned into the primary toolbar (beyond system list/project). */
  pinnedIds: string[]
  /** Preferred relative order for plugin-registered app views. */
  orderIds: string[]
}

const EMPTY_STATE: AppViewOrderState = {
  pinnedIds: [],
  orderIds: [],
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function loadAppViewOrderState(): AppViewOrderState {
  if (typeof localStorage === 'undefined') return { ...EMPTY_STATE }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed = JSON.parse(raw) as Partial<AppViewOrderState>
    return {
      pinnedIds: isStringArray(parsed.pinnedIds) ? unique(parsed.pinnedIds) : [],
      orderIds: isStringArray(parsed.orderIds) ? unique(parsed.orderIds) : [],
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export function saveAppViewOrderState(state: AppViewOrderState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pinnedIds: unique(state.pinnedIds),
        orderIds: unique(state.orderIds),
      }),
    )
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function unique(ids: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function orderAppViewItems<T extends { id: string }>(
  items: T[],
  state: AppViewOrderState,
): T[] {
  if (items.length <= 1) return items
  const byId = new Map(items.map((item) => [item.id, item]))
  const known = new Set(items.map((item) => item.id))
  const ordered: T[] = []
  const used = new Set<string>()

  for (const id of state.orderIds) {
    if (!known.has(id) || used.has(id)) continue
    const item = byId.get(id)
    if (!item) continue
    ordered.push(item)
    used.add(id)
  }

  for (const item of items) {
    if (used.has(item.id)) continue
    ordered.push(item)
  }

  return ordered
}

export function resolvePinnedAppViewIds(
  orderedItems: Array<{ id: string }>,
  state: AppViewOrderState,
  options?: { maxPinned?: number; defaultPinnedId?: string },
): string[] {
  const maxPinned = options?.maxPinned ?? 1
  const defaultPinnedId = options?.defaultPinnedId ?? DEFAULT_PINNED_APP_VIEW_ID
  const known = new Set(orderedItems.map((item) => item.id))
  // Prefer explicit user pins. If the user has never pinned anything, only kanban
  // is auto-pinned by default — other plugin apps stay in the overflow menu.
  const explicit = state.pinnedIds.filter((id) => known.has(id)).slice(0, maxPinned)
  if (explicit.length > 0) return explicit
  if (known.has(defaultPinnedId)) return [defaultPinnedId].slice(0, maxPinned)
  return []
}

export function sortAppViewsForMenu<T extends { id: string }>(
  orderedItems: T[],
  pinnedIds: string[],
): T[] {
  const pinned = new Set(pinnedIds)
  const unpinned = orderedItems.filter((item) => !pinned.has(item.id))
  const pinnedItems = orderedItems.filter((item) => pinned.has(item.id))
  // Unpinned items first (top of menu), then pinned ones.
  return [...unpinned, ...pinnedItems]
}

export function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id)
  if (index < 0) return ids
  const target = index + direction
  if (target < 0 || target >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function ensureOrderContains(ids: string[], allIds: string[]): string[] {
  const known = new Set(allIds)
  const next = unique(ids.filter((id) => known.has(id)))
  for (const id of allIds) {
    if (!next.includes(id)) next.push(id)
  }
  return next
}

export function togglePinnedId(
  pinnedIds: string[],
  id: string,
  options?: { maxPinned?: number },
): string[] {
  const maxPinned = options?.maxPinned ?? 1
  if (pinnedIds.includes(id)) {
    return pinnedIds.filter((item) => item !== id)
  }
  return unique([id, ...pinnedIds]).slice(0, maxPinned)
}
