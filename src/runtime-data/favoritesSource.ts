import type { FavoriteItem } from "@/types";
import { resolveFavoritesProvider } from "./providers";

export async function loadRuntimeFavorites(): Promise<FavoriteItem[]> {
  return resolveFavoritesProvider().loadFavorites();
}

export async function removeRuntimeFavorite(item: FavoriteItem): Promise<void> {
  return resolveFavoritesProvider().removeFavorite(item);
}

export async function toggleRuntimeFavorite(
  item: Omit<FavoriteItem, "addedAt">,
): Promise<void> {
  return resolveFavoritesProvider().toggleFavorite(item);
}
