import { useEffect, useSyncExternalStore } from 'react'
import type { PsmFavoriteItem, PsmFavoritesClient } from '@pi-session-manager/plugin-sdk'

type Snapshot = { favorites: PsmFavoriteItem[]; loading: boolean }

let client: PsmFavoritesClient | null = null
let snapshot: Snapshot = { favorites: [], loading: false }
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

async function load() {
  if (!client || snapshot.loading) return
  snapshot = { ...snapshot, loading: true }
  notify()
  try {
    snapshot = { favorites: await client.list(), loading: false }
  } finally {
    snapshot = { ...snapshot, loading: false }
    notify()
  }
}

export function configureFavoritesStore(nextClient: PsmFavoritesClient) {
  client = nextClient
  void load()
}

export function useFavorites() {
  useEffect(() => {
    void load()
  }, [])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
    () => snapshot,
  )
}

export async function toggleFavorite(item: Omit<PsmFavoriteItem, 'addedAt'>) {
  if (!client) throw new Error('Favorites plugin is not initialized')
  await client.toggle(item)
  await load()
}

export async function removeFavorite(id: string) {
  if (!client) throw new Error('Favorites plugin is not initialized')
  await client.remove(id)
  await load()
}
