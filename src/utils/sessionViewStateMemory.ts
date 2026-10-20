/**
 * Per-session view memory for the multi-tab viewer.
 *
 * Keeps scroll position and tool expand/collapse snapshots keyed by session
 * path so they survive tab switches and viewer remounts. Maps are LRU-capped
 * and module-level on purpose: state outlives individual React trees.
 */

const MAX_ENTRIES = 30;

export interface SessionExpansionSnapshot {
  toolsExpanded: boolean;
  expandedToolIds: string[];
}

const scrollTops = new Map<string, number>();
const expansions = new Map<string, SessionExpansionSnapshot>();

function remember<T>(map: Map<string, T>, key: string, value: T): void {
  // Re-insertion refreshes recency; Map iteration order stays LRU-friendly.
  map.delete(key);
  map.set(key, value);
  if (map.size <= MAX_ENTRIES) return;
  const oldest = map.keys().next().value;
  if (oldest !== undefined) {
    map.delete(oldest);
  }
}

export function saveSessionScrollTop(
  sessionPath: string,
  scrollTop: number,
): void {
  if (!sessionPath || !Number.isFinite(scrollTop)) return;
  remember(scrollTops, sessionPath, scrollTop);
}

export function getSessionScrollTop(
  sessionPath: string,
): number | undefined {
  return sessionPath ? scrollTops.get(sessionPath) : undefined;
}

export function saveSessionExpansion(
  sessionPath: string,
  snapshot: SessionExpansionSnapshot,
): void {
  if (!sessionPath) return;
  remember(expansions, sessionPath, {
    toolsExpanded: snapshot.toolsExpanded,
    expandedToolIds: [...snapshot.expandedToolIds],
  });
}

export function getSessionExpansion(
  sessionPath: string,
): SessionExpansionSnapshot | undefined {
  const snapshot = sessionPath ? expansions.get(sessionPath) : undefined;
  return snapshot
    ? {
        toolsExpanded: snapshot.toolsExpanded,
        expandedToolIds: [...snapshot.expandedToolIds],
      }
    : undefined;
}
