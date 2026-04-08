import type { FavoriteItem } from "@/types";
import { getActiveDatasetId } from "./core";

function favoritesKey(datasetId: string): string {
  return `pi-session-manager-browser-dataset-favorites:${datasetId}`;
}

function readFavorites(datasetId: string): FavoriteItem[] {
  if (typeof window === "undefined" || !datasetId) return [];
  try {
    const raw = localStorage.getItem(favoritesKey(datasetId));
    return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
  } catch {
    return [];
  }
}

function writeFavorites(datasetId: string, favorites: FavoriteItem[]): void {
  if (typeof window === "undefined" || !datasetId) return;
  try {
    localStorage.setItem(favoritesKey(datasetId), JSON.stringify(favorites));
  } catch {}
}

export function getBrowserDatasetFavorites(): FavoriteItem[] {
  return readFavorites(getActiveDatasetId());
}

export function removeBrowserDatasetFavorite(id: string): void {
  const datasetId = getActiveDatasetId();
  const next = readFavorites(datasetId).filter(
    (favorite) => favorite.id !== id,
  );
  writeFavorites(datasetId, next);
}

export function toggleBrowserDatasetFavorite(
  item: Omit<FavoriteItem, "addedAt">,
): void {
  const datasetId = getActiveDatasetId();
  const favorites = readFavorites(datasetId);
  const existing = favorites.find((favorite) => favorite.id === item.id);
  const next = existing
    ? favorites.filter((favorite) => favorite.id !== item.id)
    : [
        {
          ...item,
          addedAt: new Date().toISOString(),
        },
        ...favorites,
      ];
  writeFavorites(datasetId, next);
}
