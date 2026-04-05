import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@/transport'
import type { FavoriteItem } from '@/types'
import { getDemoFavorites, isDemoModeEnabled, removeDemoFavorite, toggleDemoFavorite } from '@/demo'

interface SqliteFavoriteItem {
  id: string
  type: string
  name: string
  path: string
  added_at: string
}

export interface UseFavoritesOptions {
  enabled?: boolean
}

export interface UseFavoritesReturn {
  favorites: FavoriteItem[]
  loadingFavorites: boolean
  loadFavorites: () => Promise<void>
  removeFavorite: (item: FavoriteItem) => Promise<void>
  toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => Promise<void>
}

export function useFavorites(
  { enabled = true }: UseFavoritesOptions = {},
): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const hasAutoLoadedRef = useRef(false)

  const loadFavorites = useCallback(async () => {
    setLoadingFavorites(true)
    try {
      if (isDemoModeEnabled()) {
        setFavorites(getDemoFavorites())
      } else {
        const result = await invoke<SqliteFavoriteItem[]>('get_all_favorites')
        const formattedFavorites: FavoriteItem[] = result.map((favorite) => ({
          id: favorite.id,
          type: favorite.type as FavoriteItem['type'],
          name: favorite.name,
          path: favorite.path,
          addedAt: favorite.added_at,
        }))
        setFavorites(formattedFavorites)
      }
    } catch (error) {
      console.error('[Favorites] Failed to load favorites:', error)
      setFavorites([])
    } finally {
      setLoadingFavorites(false)
    }
  }, [])

  const removeFavorite = useCallback(
    async (item: FavoriteItem) => {
      try {
        if (isDemoModeEnabled()) {
          removeDemoFavorite(item.id)
        } else {
          await invoke<void>('remove_favorite', { id: item.id })
        }
        await loadFavorites()
      } catch (error) {
        console.error('Failed to remove favorite:', error)
      }
    },
    [loadFavorites],
  )

  const toggleFavorite = useCallback(
    async (item: Omit<FavoriteItem, 'addedAt'>) => {
      try {
        if (isDemoModeEnabled()) {
          toggleDemoFavorite(item)
        } else {
          const params = {
            id: item.id,
            favoriteType: item.type,
            name: item.name,
            path: item.path,
          }
          await invoke<void>('toggle_favorite', params)
        }
        await loadFavorites()
      } catch (error) {
        console.error('[Favorites] Failed to toggle favorite:', error)
      }
    },
    [loadFavorites],
  )

  useEffect(() => {
    if (!enabled || hasAutoLoadedRef.current) {
      return
    }

    hasAutoLoadedRef.current = true
    void loadFavorites()
  }, [enabled, loadFavorites])

  return {
    favorites,
    loadingFavorites,
    loadFavorites,
    removeFavorite,
    toggleFavorite,
  }
}
