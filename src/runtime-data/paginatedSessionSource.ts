import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import { resolveSessionProvider } from "./providers";

export { type RuntimePaginatedSessionsResponse } from "./providers";

export async function loadRuntimePaginatedSessions(options: {
  offset: number;
  limit: number;
  searchQuery?: string | null;
  projectFilter?: string | null;
  filterTagIds?: string[] | null;
  sourceFilterSlugs?: string[] | null;
  sortBy: SessionSortBy;
  sortOrder: SessionSortOrder;
}) {
  return resolveSessionProvider().paginateSessions(options);
}

export function shouldUseBackendPagination(): boolean {
  return resolveSessionProvider().mode === "backend";
}
