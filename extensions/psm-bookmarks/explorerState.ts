/**
 * Shared view state for the bookmark explorer: the app sidebar (project
 * filter) and the main app view (grouping, sort) both read and write it.
 */

export type BookmarkGrouping = 'all' | 'session' | 'project'
export type BookmarkSortOrder = 'newest' | 'oldest'

export interface ExplorerStateValue {
  grouping: BookmarkGrouping
  projectFilter: string | null
  sortOrder: BookmarkSortOrder
}

const INITIAL: ExplorerStateValue = {
  grouping: 'session',
  projectFilter: null,
  sortOrder: 'newest',
}

type Listener = () => void

class ExplorerStateStore {
  private value: ExplorerStateValue = INITIAL
  private readonly listeners = new Set<Listener>()

  get = (): ExplorerStateValue => this.value

  set = (patch: Partial<ExplorerStateValue>): void => {
    const next = { ...this.value, ...patch }
    if (
      next.grouping === this.value.grouping &&
      next.projectFilter === this.value.projectFilter &&
      next.sortOrder === this.value.sortOrder
    ) {
      return
    }
    this.value = next
    for (const listener of [...this.listeners]) listener()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const explorerState = new ExplorerStateStore()
