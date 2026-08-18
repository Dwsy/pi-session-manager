import type {
  FavoriteItem,
  SessionChunk,
  SessionInfo,
  SessionTag,
  Tag,
} from '@/types'

import { buildInitialStoreData, toJsonl } from './content'
import {
  fullTextSearchDemoInStore,
  listDemoSessionsPaginatedInStore,
  searchDemoSessionsInStore,
} from './search'
import { getDemoDayStatsFromStore, getDemoStatsFromStore } from './stats'
import type {
  DemoFullTextSearchOptions,
  DemoListSessionsOptions,
  DemoPaginatedSessionsResponse,
  DemoSearchOptions,
  DemoStore,
} from './types'

const SESSION_CONTENT_CACHE = new Map<string, string>()

let store: DemoStore | null = null

function cloneSession(session: SessionInfo): SessionInfo {
  return {
    ...session,
  }
}

function cloneTag(tag: Tag): Tag {
  return {
    ...tag,
  }
}

function cloneSessionTag(st: SessionTag): SessionTag {
  return {
    ...st,
  }
}

function cloneFavorite(favorite: FavoriteItem): FavoriteItem {
  return {
    ...favorite,
  }
}

function clearCachesAfterMutation(): void {
  // Session JSONL cache only needs explicit updates on content/path changes.
}

function ensureStore(): DemoStore {
  if (store) {
    return store
  }

  const seeded = buildInitialStoreData()
  store = {
    sessions: seeded.sessions,
    favorites: seeded.favorites,
    tags: seeded.tags,
    sessionTags: seeded.sessionTags,
    entriesByPath: seeded.entriesByPath,
    sizeBytesByPath: seeded.sizeBytesByPath,
    seedByPath: seeded.seedByPath,
    nextUserTagId: seeded.nextUserTagId,
  }

  SESSION_CONTENT_CACHE.clear()
  for (const [path, entries] of store.entriesByPath) {
    SESSION_CONTENT_CACHE.set(path, toJsonl(entries))
  }

  return store
}

function getSortedSessions(state: DemoStore): SessionInfo[] {
  return state.sessions
    .map(cloneSession)
    .sort((left, right) => right.modified.localeCompare(left.modified) || left.path.localeCompare(right.path))
}

function syncSessionFavoriteFlag(state: DemoStore): void {
  const favoriteSessionPaths = new Set(
    state.favorites
      .filter((favorite) => favorite.type === 'session')
      .map((favorite) => favorite.path)
  )

  state.sessions = state.sessions.map((session) => ({
    ...session,
    isFavorite: favoriteSessionPaths.has(session.path),
  }))
}

export function getDemoSessions(): SessionInfo[] {
  const state = ensureStore()
  return getSortedSessions(state)
}

export function getDemoSessionByPath(path: string): SessionInfo | null {
  const state = ensureStore()
  const found = state.sessions.find((session) => session.path === path)
  return found ? cloneSession(found) : null
}

export function renameDemoSession(path: string, newName: string): SessionInfo | null {
  const state = ensureStore()
  const index = state.sessions.findIndex((session) => session.path === path)
  if (index < 0) return null

  state.sessions[index] = {
    ...state.sessions[index],
    name: newName,
    modified: new Date().toISOString(),
  }

  for (let i = 0; i < state.favorites.length; i += 1) {
    if (state.favorites[i].type === 'session' && state.favorites[i].path === path) {
      state.favorites[i] = {
        ...state.favorites[i],
        name: newName,
      }
    }
  }

  clearCachesAfterMutation()
  return cloneSession(state.sessions[index])
}

export function deleteDemoSessions(paths: string[]): {
  deleted_count: number
  failed: Array<{ path: string; error: string }>
} {
  const state = ensureStore()
  const pathSet = new Set(paths)
  const before = state.sessions.length

  state.sessions = state.sessions.filter((session) => !pathSet.has(session.path))
  state.favorites = state.favorites.filter((favorite) => {
    if (favorite.type !== 'session') {
      return true
    }
    return !pathSet.has(favorite.path)
  })

  const deletedSessionIds = new Set(
    Array.from(state.seedByPath.values())
      .filter((seed) => pathSet.has(seed.path))
      .map((seed) => seed.id)
  )

  state.sessionTags = state.sessionTags.filter((st) => !deletedSessionIds.has(st.sessionId))

  for (const path of pathSet) {
    state.entriesByPath.delete(path)
    state.seedByPath.delete(path)
    state.sizeBytesByPath.delete(path)
    SESSION_CONTENT_CACHE.delete(path)
  }

  clearCachesAfterMutation()

  return {
    deleted_count: before - state.sessions.length,
    failed: [],
  }
}

export function getDemoSessionContent(path: string): string {
  const state = ensureStore()
  const cached = SESSION_CONTENT_CACHE.get(path)
  if (cached !== undefined) {
    return cached
  }

  const entries = state.entriesByPath.get(path)
  if (!entries) {
    return ''
  }

  const content = toJsonl(entries)
  SESSION_CONTENT_CACHE.set(path, content)
  return content
}

export function readDemoSessionChunk(path: string, offset = 0, maxBytes = 384 * 1024): SessionChunk {
  const content = getDemoSessionContent(path)
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const encoded = encoder.encode(content)

  if (offset >= encoded.length) {
    return {
      content: '',
      next_offset: encoded.length,
      file_size: encoded.length,
      has_more: false,
    }
  }

  const normalizedMaxBytes = Math.max(1, maxBytes)
  const nextOffset = Math.min(encoded.length, offset + normalizedMaxBytes)
  const sliced = encoded.slice(offset, nextOffset)

  return {
    content: decoder.decode(sliced),
    next_offset: nextOffset,
    file_size: encoded.length,
    has_more: nextOffset < encoded.length,
  }
}

export function searchDemoSessions(options: DemoSearchOptions) {
  const state = ensureStore()
  return searchDemoSessionsInStore(state, options)
}

export function listDemoSessionsPaginated(options: DemoListSessionsOptions): DemoPaginatedSessionsResponse {
  const state = ensureStore()
  return listDemoSessionsPaginatedInStore(state, options)
}

export function fullTextSearchDemo(options: DemoFullTextSearchOptions) {
  const state = ensureStore()
  return fullTextSearchDemoInStore(state, options)
}

export function getDemoSessionLabels(path: string): Record<string, string> {
  const state = ensureStore()
  const entries = state.entriesByPath.get(path) || []
  const labels = new Map<string, string>()

  for (const entry of entries) {
    if (entry.type !== 'label' || typeof entry.targetId !== 'string' || !entry.targetId) {
      continue
    }

    const label = typeof entry.label === 'string' ? entry.label : ''
    if (label.trim()) {
      labels.set(entry.targetId, label)
      continue
    }

    labels.delete(entry.targetId)
  }

  return Object.fromEntries(labels)
}

export function getDemoStats(scopedSessions?: SessionInfo[]) {
  const state = ensureStore()
  return getDemoStatsFromStore(state, scopedSessions)
}

export function getDemoDayStats(date: string, scopedSessions?: SessionInfo[]) {
  const state = ensureStore()
  return getDemoDayStatsFromStore(state, date, scopedSessions)
}

export function getDemoFavorites(): FavoriteItem[] {
  const state = ensureStore()
  return state.favorites.map(cloneFavorite)
}

export function removeDemoFavorite(id: string): void {
  const state = ensureStore()
  state.favorites = state.favorites.filter((favorite) => favorite.id !== id)
  syncSessionFavoriteFlag(state)
  clearCachesAfterMutation()
}

export function toggleDemoFavorite(item: Omit<FavoriteItem, 'addedAt'>): void {
  const state = ensureStore()
  const existingIndex = state.favorites.findIndex((favorite) => favorite.id === item.id)

  if (existingIndex >= 0) {
    state.favorites.splice(existingIndex, 1)
    syncSessionFavoriteFlag(state)
    clearCachesAfterMutation()
    return
  }

  state.favorites.unshift({
    ...item,
    addedAt: new Date().toISOString(),
  })

  syncSessionFavoriteFlag(state)
  clearCachesAfterMutation()
}

export function getDemoTags(): Tag[] {
  const state = ensureStore()
  return state.tags
    .map(cloneTag)
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

export function getDemoSessionTags(): SessionTag[] {
  const state = ensureStore()
  return state.sessionTags.map(cloneSessionTag)
}

export function createDemoTag(name: string, color: string, icon?: string, parentId?: string): Tag {
  const state = ensureStore()
  const sortOrder = state.tags.length > 0
    ? Math.max(...state.tags.map((tag) => tag.sortOrder)) + 1
    : 0

  const tag: Tag = {
    id: `tag-user-${state.nextUserTagId}`,
    name,
    color,
    icon,
    sortOrder,
    isBuiltin: false,
    createdAt: new Date().toISOString(),
    parentId: parentId || null,
  }

  state.nextUserTagId += 1
  state.tags.push(tag)
  clearCachesAfterMutation()
  return cloneTag(tag)
}

export function updateDemoTag(id: string, updates: Partial<Pick<Tag, 'name' | 'color' | 'icon'>>): void {
  const state = ensureStore()
  state.tags = state.tags.map((tag) => {
    if (tag.id !== id) return tag
    return {
      ...tag,
      ...updates,
    }
  })
  clearCachesAfterMutation()
}

export function deleteDemoTag(id: string): void {
  const state = ensureStore()
  state.tags = state.tags.filter((tag) => tag.id !== id)
  state.sessionTags = state.sessionTags.filter((st) => st.tagId !== id)
  clearCachesAfterMutation()
}

export function assignDemoTag(sessionId: string, tagId: string): void {
  const state = ensureStore()
  const exists = state.sessionTags.some((st) => st.sessionId === sessionId && st.tagId === tagId)
  if (exists) return

  const maxPosition = state.sessionTags
    .filter((st) => st.tagId === tagId)
    .reduce((max, st) => Math.max(max, st.position), -1)

  state.sessionTags.push({
    sessionId,
    tagId,
    position: maxPosition + 1,
    assignedAt: new Date().toISOString(),
  })

  clearCachesAfterMutation()
}

export function removeDemoTagFromSession(sessionId: string, tagId: string): void {
  const state = ensureStore()
  state.sessionTags = state.sessionTags.filter((st) => !(st.sessionId === sessionId && st.tagId === tagId))
  clearCachesAfterMutation()
}

export function moveDemoSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string,
  position: number,
): void {
  const state = ensureStore()

  if (fromTagId) {
    state.sessionTags = state.sessionTags.filter((st) => !(st.sessionId === sessionId && st.tagId === fromTagId))
  }

  state.sessionTags = state.sessionTags.filter((st) => !(st.sessionId === sessionId && st.tagId === toTagId))
  state.sessionTags.push({
    sessionId,
    tagId: toTagId,
    position,
    assignedAt: new Date().toISOString(),
  })

  clearCachesAfterMutation()
}

export function reorderDemoTags(tagIds: string[]): void {
  const state = ensureStore()
  const orderMap = new Map(tagIds.map((id, index) => [id, index]))

  state.tags = state.tags.map((tag) => {
    const sortOrder = orderMap.get(tag.id)
    if (sortOrder === undefined) {
      return tag
    }
    return {
      ...tag,
      sortOrder,
    }
  })

  clearCachesAfterMutation()
}

export function updateDemoTagAutoRules(id: string, rules: string | null): void {
  const state = ensureStore()
  state.tags = state.tags.map((tag) => {
    if (tag.id !== id) return tag
    return {
      ...tag,
      autoRules: rules || undefined,
    }
  })
  clearCachesAfterMutation()
}

export function evaluateDemoAutoRules(sessionId: string, text: string): string[] {
  const state = ensureStore()
  const lowerText = text.toLowerCase()
  const matchedTagIds: string[] = []

  for (const tag of state.tags) {
    if (!tag.autoRules) continue

    const rules = tag.autoRules
      .split(/\n|,/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    if (rules.length === 0) continue

    if (rules.some((rule) => lowerText.includes(rule))) {
      matchedTagIds.push(tag.id)
    }
  }

  if (matchedTagIds.length === 0) {
    return []
  }

  for (const tagId of matchedTagIds) {
    assignDemoTag(sessionId, tagId)
  }

  clearCachesAfterMutation()
  return matchedTagIds
}

export function resetDemoStore(): void {
  store = null
  SESSION_CONTENT_CACHE.clear()
}
