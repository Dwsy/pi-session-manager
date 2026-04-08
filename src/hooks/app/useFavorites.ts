import { useCallback, useEffect, useRef, useState } from "react";
import type { FavoriteItem } from "@/types";
import {
  loadRuntimeFavorites,
  removeRuntimeFavorite,
  toggleRuntimeFavorite,
} from "@/runtime-data/favoritesSource";

export interface UseFavoritesOptions {
  enabled?: boolean;
}

export interface UseFavoritesReturn {
  favorites: FavoriteItem[];
  loadingFavorites: boolean;
  loadFavorites: () => Promise<void>;
  removeFavorite: (item: FavoriteItem) => Promise<void>;
  toggleFavorite: (item: Omit<FavoriteItem, "addedAt">) => Promise<void>;
}

export function useFavorites({
  enabled = true,
}: UseFavoritesOptions = {}): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const hasAutoLoadedRef = useRef(false);

  const loadFavorites = useCallback(async () => {
    setLoadingFavorites(true);
    try {
      setFavorites(await loadRuntimeFavorites());
    } catch (error) {
      console.error("[Favorites] Failed to load favorites:", error);
      setFavorites([]);
    } finally {
      setLoadingFavorites(false);
    }
  }, []);

  const removeFavorite = useCallback(
    async (item: FavoriteItem) => {
      try {
        await removeRuntimeFavorite(item);
        await loadFavorites();
      } catch (error) {
        console.error("Failed to remove favorite:", error);
      }
    },
    [loadFavorites],
  );

  const toggleFavorite = useCallback(
    async (item: Omit<FavoriteItem, "addedAt">) => {
      try {
        await toggleRuntimeFavorite(item);
        await loadFavorites();
      } catch (error) {
        console.error("[Favorites] Failed to toggle favorite:", error);
      }
    },
    [loadFavorites],
  );

  useEffect(() => {
    if (!enabled || hasAutoLoadedRef.current) {
      return;
    }

    hasAutoLoadedRef.current = true;
    void loadFavorites();
  }, [enabled, loadFavorites]);

  return {
    favorites,
    loadingFavorites,
    loadFavorites,
    removeFavorite,
    toggleFavorite,
  };
}
