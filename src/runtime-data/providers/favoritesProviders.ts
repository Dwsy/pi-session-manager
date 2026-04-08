import { invoke } from "@/transport";
import type { FavoriteItem } from "@/types";
import {
  getDemoFavorites,
  removeDemoFavorite,
  toggleDemoFavorite,
} from "@/demo";
import {
  getBrowserDatasetFavorites,
  removeBrowserDatasetFavorite,
  toggleBrowserDatasetFavorite,
} from "@/browser-dataset";
import { getRuntimeMode } from "../runtimeMode";
import type { FavoritesProvider } from "./types";

export const backendFavoritesProvider: FavoritesProvider = {
  mode: "backend",
  async loadFavorites() {
    const result = await invoke<
      Array<{
        id: string;
        type: string;
        name: string;
        path: string;
        added_at: string;
      }>
    >("get_all_favorites");
    return result.map((favorite) => ({
      id: favorite.id,
      type: favorite.type as FavoriteItem["type"],
      name: favorite.name,
      path: favorite.path,
      addedAt: favorite.added_at,
    }));
  },
  async removeFavorite(item) {
    await invoke<void>("remove_favorite", { id: item.id });
  },
  async toggleFavorite(item) {
    await invoke<void>("toggle_favorite", {
      id: item.id,
      favoriteType: item.type,
      name: item.name,
      path: item.path,
    });
  },
};

export const demoFavoritesProvider: FavoritesProvider = {
  mode: "demo",
  loadFavorites: async () => getDemoFavorites(),
  removeFavorite: async (item) => removeDemoFavorite(item.id),
  toggleFavorite: async (item) => toggleDemoFavorite(item),
};

export const browserFavoritesProvider: FavoritesProvider = {
  mode: "browser-dataset",
  loadFavorites: async () => getBrowserDatasetFavorites(),
  removeFavorite: async (item) => removeBrowserDatasetFavorite(item.id),
  toggleFavorite: async (item) => toggleBrowserDatasetFavorite(item),
};

export function resolveFavoritesProvider(): FavoritesProvider {
  switch (getRuntimeMode()) {
    case "demo":
      return demoFavoritesProvider;
    case "browser-dataset":
      return browserFavoritesProvider;
    default:
      return backendFavoritesProvider;
  }
}
