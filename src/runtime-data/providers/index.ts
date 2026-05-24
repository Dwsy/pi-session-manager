export type {
  FavoritesProvider,
  RuntimePaginatedSessionsResponse,
  RuntimeSessionListResponse,
  SessionProvider,
  TagsProvider,
} from "./types";

export { resolveFavoritesProvider } from "./favoritesProviders";
export { browserTagsProvider, resolveTagsProvider } from "./tagsProviders";
export { resolveSessionProvider } from "./sessionProviders";

import { resolveSessionProvider } from "./sessionProviders";

export function supportsRuntimeSessionEvents(): boolean {
  return resolveSessionProvider().supportsLiveEvents;
}

export function canMutateRuntimeSessions(): boolean {
  const provider = resolveSessionProvider();
  return provider.canDeleteSessions || provider.canRenameSessions;
}

export function canForkRuntimeSessions(): boolean {
  return resolveSessionProvider().canForkSessions;
}

export async function deleteRuntimeSessions(paths: string[]) {
  const provider = resolveSessionProvider();
  if (!provider.deleteSessions) {
    throw new Error("delete_not_supported");
  }
  return provider.deleteSessions(paths);
}

export async function renameRuntimeSession(path: string, newName: string) {
  const provider = resolveSessionProvider();
  if (!provider.renameSession) {
    throw new Error("rename_not_supported");
  }
  return provider.renameSession(path, newName);
}

export async function forkRuntimeSession(
  sourcePath: string,
  targetName?: string,
) {
  const provider = resolveSessionProvider();
  if (!provider.forkSession) {
    throw new Error("fork_not_supported");
  }
  return provider.forkSession(sourcePath, targetName);
}
