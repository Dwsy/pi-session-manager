import type {
  FavoriteItem,
  SessionEntry,
  SessionInfo,
  SessionTag,
  Tag,
} from '../types'
import type { SessionSortBy, SessionSortOrder } from '../types/sessionSort'

import type { DemoSessionSeed } from './seed'

export interface DemoStore {
  sessions: SessionInfo[]
  favorites: FavoriteItem[]
  tags: Tag[]
  sessionTags: SessionTag[]
  entriesByPath: Map<string, SessionEntry[]>
  sizeBytesByPath: Map<string, number>
  seedByPath: Map<string, DemoSessionSeed>
  nextUserTagId: number
}

export interface DemoPaginatedSessionsResponse {
  sessions: SessionInfo[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}

export interface DemoSearchOptions {
  query: string
  sessions?: SessionInfo[]
}

export interface DemoFullTextSearchOptions {
  query: string
  roleFilter?: 'all' | 'user' | 'assistant'
  globPattern?: string | null
  page?: number
  pageSize?: number
  matchMode?: 'any' | 'all'
}

export interface DemoListSessionsOptions {
  offset: number
  limit: number
  searchQuery?: string | null
  projectFilter?: string | null
  filterTagIds?: string[] | null
  sortBy?: SessionSortBy
  sortOrder?: SessionSortOrder
}
