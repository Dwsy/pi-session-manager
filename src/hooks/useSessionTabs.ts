import { useCallback, useEffect, useMemo, useState } from "react";

import type { SessionInfo } from "@/types";

export interface UseSessionTabsOptions {
  sessions: SessionInfo[];
  selectedSession: SessionInfo | null;
  /** Multi-tab mode setting; when false the open set collapses to the active session. */
  enabled: boolean;
  /** Activate a tab (must also sync route/badges, same as sidebar selection). */
  onSelectSession: (session: SessionInfo) => void;
  /** Leave the viewer when the last open tab is closed. */
  onCloseViewer: () => void;
}

export interface UseSessionTabsResult {
  /** Tab bar data; undefined when multi-tab mode is off. */
  tabs: SessionViewerTabsData | undefined;
  closeTab: (sessionId: string) => void;
  closeOtherTabs: (sessionId: string) => void;
  closeTabsToLeft: (sessionId: string) => void;
  closeTabsToRight: (sessionId: string) => void;
  closeAllTabs: () => void;
  togglePinTab: (sessionId: string) => void;
  reopenClosedTab: () => void;
}

export interface SessionViewerTabsData {
  tabs: SessionInfo[];
  activeTabId: string | null;
  pinnedTabIds: Set<string>;
  canReopenClosedTab: boolean;
}

interface ClosedTabRecord {
  id: string;
  index: number;
}

const MAX_CLOSED_HISTORY = 20;

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function orderWithPinnedFirst(ids: string[], pinned: Set<string>): string[] {
  const pinnedPart: string[] = [];
  const regularPart: string[] = [];
  for (const id of ids) {
    if (pinned.has(id)) {
      pinnedPart.push(id);
    } else {
      regularPart.push(id);
    }
  }
  return [...pinnedPart, ...regularPart];
}

/**
 * Tracks open session tabs for the multi-tab viewer.
 *
 * All selection paths (sidebar, command palette, routes, deep links, dock)
 * converge on `selectedSession`, so the tab set is maintained from that single
 * choke point instead of wrapping every call site.
 */
export function useSessionTabs({
  sessions,
  selectedSession,
  enabled,
  onSelectSession,
  onCloseViewer,
}: UseSessionTabsOptions): UseSessionTabsResult {
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [closedHistory, setClosedHistory] = useState<ClosedTabRecord[]>([]);
  const activeId = selectedSession?.id ?? null;

  const pinnedTabIds = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const sessionsById = useMemo(() => {
    const map = new Map(sessions.map((session) => [session.id, session]));
    if (selectedSession) {
      map.set(selectedSession.id, selectedSession);
    }
    return map;
  }, [sessions, selectedSession]);

  // Append the active session to the tab list (any selection path lands here).
  useEffect(() => {
    if (!enabled || !activeId) return;
    setOpenTabIds((prev) =>
      prev.includes(activeId) ? prev : [...prev, activeId],
    );
  }, [enabled, activeId]);

  // Collapsing to the active session only when the mode is turned off.
  useEffect(() => {
    if (enabled) return;
    const next = activeId ? [activeId] : [];
    setOpenTabIds((prev) => (sameIds(prev, next) ? prev : next));
    setPinnedIds((prev) => (prev.length === 0 ? prev : []));
    setClosedHistory((prev) => (prev.length === 0 ? prev : []));
  }, [enabled, activeId]);

  // Drop tabs whose session disappeared (deleted), never the active one —
  // while a session route is still resolving, the active id may not be in
  // the loaded list yet.
  useEffect(() => {
    const known = new Set(sessions.map((session) => session.id));
    setOpenTabIds((prev) => {
      const next = prev.filter((id) => known.has(id) || id === activeId);
      return sameIds(prev, next) ? prev : next;
    });
    setPinnedIds((prev) => {
      const next = prev.filter((id) => known.has(id) || id === activeId);
      return sameIds(prev, next) ? prev : next;
    });
  }, [sessions, activeId]);

  const recordClosed = useCallback((records: ClosedTabRecord[]) => {
    if (records.length === 0) return;
    setClosedHistory((prev) => {
      const closingIds = new Set(records.map((r) => r.id));
      const filtered = prev.filter((r) => !closingIds.has(r.id));
      return [...filtered, ...records].slice(-MAX_CLOSED_HISTORY);
    });
  }, []);

  const closeTab = useCallback(
    (sessionId: string) => {
      const index = openTabIds.indexOf(sessionId);
      if (index >= 0) {
        recordClosed([{ id: sessionId, index }]);
      }
      setPinnedIds((prev) =>
        prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : prev,
      );

      if (activeId !== sessionId) {
        setOpenTabIds((prev) => prev.filter((id) => id !== sessionId));
        return;
      }

      // Closing the active tab: prefer the right neighbor, then the left one.
      const neighborIds =
        index >= 0
          ? [...openTabIds.slice(index + 1), ...openTabIds.slice(0, index)]
          : openTabIds.filter((id) => id !== sessionId);
      const neighbor =
        neighborIds
          .map((id) => sessionsById.get(id))
          .find((session): session is SessionInfo => Boolean(session)) ?? null;

      setOpenTabIds((prev) => prev.filter((id) => id !== sessionId));
      if (neighbor) {
        onSelectSession(neighbor);
      } else {
        onCloseViewer();
      }
    },
    [activeId, openTabIds, sessionsById, recordClosed, onSelectSession, onCloseViewer],
  );

  const closeBatch = useCallback(
    (idsToClose: string[], fallbackFocusId: string | null) => {
      if (idsToClose.length === 0) return;
      const closeSet = new Set(idsToClose);
      const closedRecords: ClosedTabRecord[] = [];
      openTabIds.forEach((id, idx) => {
        if (closeSet.has(id)) {
          closedRecords.push({ id, index: idx });
        }
      });
      recordClosed(closedRecords);

      const remaining = openTabIds.filter((id) => !closeSet.has(id));
      setOpenTabIds(remaining);
      setPinnedIds((prev) => prev.filter((id) => !closeSet.has(id)));

      if (!activeId || !closeSet.has(activeId)) {
        return;
      }

      const nextFocusId =
        (fallbackFocusId && remaining.includes(fallbackFocusId)
          ? fallbackFocusId
          : remaining[0]) ?? null;
      const nextSession = nextFocusId ? sessionsById.get(nextFocusId) ?? null : null;
      if (nextSession) {
        onSelectSession(nextSession);
      } else {
        onCloseViewer();
      }
    },
    [activeId, openTabIds, sessionsById, recordClosed, onSelectSession, onCloseViewer],
  );

  const closeOtherTabs = useCallback(
    (sessionId: string) => {
      const toClose = openTabIds.filter(
        (id) => id !== sessionId && !pinnedTabIds.has(id),
      );
      closeBatch(toClose, sessionId);
    },
    [openTabIds, pinnedTabIds, closeBatch],
  );

  const closeTabsToLeft = useCallback(
    (sessionId: string) => {
      const targetIndex = openTabIds.indexOf(sessionId);
      if (targetIndex <= 0) return;
      const toClose = openTabIds
        .slice(0, targetIndex)
        .filter((id) => !pinnedTabIds.has(id));
      closeBatch(toClose, sessionId);
    },
    [openTabIds, pinnedTabIds, closeBatch],
  );

  const closeTabsToRight = useCallback(
    (sessionId: string) => {
      const targetIndex = openTabIds.indexOf(sessionId);
      if (targetIndex < 0 || targetIndex >= openTabIds.length - 1) return;
      const toClose = openTabIds
        .slice(targetIndex + 1)
        .filter((id) => !pinnedTabIds.has(id));
      closeBatch(toClose, sessionId);
    },
    [openTabIds, pinnedTabIds, closeBatch],
  );

  const closeAllTabs = useCallback(() => {
    const toClose = openTabIds.filter((id) => !pinnedTabIds.has(id));
    closeBatch(toClose, null);
  }, [openTabIds, pinnedTabIds, closeBatch]);

  const togglePinTab = useCallback((sessionId: string) => {
    setPinnedIds((prev) => {
      const isPinned = prev.includes(sessionId);
      const nextPinnedList = isPinned
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId];
      const nextPinnedSet = new Set(nextPinnedList);
      setOpenTabIds((currentIds) =>
        orderWithPinnedFirst(currentIds, nextPinnedSet),
      );
      return nextPinnedList;
    });
  }, []);

  const canReopenClosedTab = useMemo(() => {
    const openSet = new Set(openTabIds);
    for (let i = closedHistory.length - 1; i >= 0; i -= 1) {
      const rec = closedHistory[i];
      if (!openSet.has(rec.id) && sessionsById.has(rec.id)) {
        return true;
      }
    }
    return false;
  }, [closedHistory, openTabIds, sessionsById]);

  const reopenClosedTab = useCallback(() => {
    const openSet = new Set(openTabIds);
    let foundIndex = -1;
    for (let i = closedHistory.length - 1; i >= 0; i -= 1) {
      const rec = closedHistory[i];
      if (!openSet.has(rec.id) && sessionsById.has(rec.id)) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex === -1) return;

    const target = closedHistory[foundIndex];
    const session = sessionsById.get(target.id);
    if (!session) return;

    setClosedHistory((prev) => [
      ...prev.slice(0, foundIndex),
      ...prev.slice(foundIndex + 1),
    ]);
    setOpenTabIds((prev) => {
      if (prev.includes(target.id)) return prev;
      const pinnedCount = prev.filter((id) => pinnedTabIds.has(id)).length;
      const insertAt = Math.max(pinnedCount, Math.min(target.index, prev.length));
      return [...prev.slice(0, insertAt), target.id, ...prev.slice(insertAt)];
    });
    onSelectSession(session);
  }, [closedHistory, openTabIds, pinnedTabIds, sessionsById, onSelectSession]);

  const tabsData = useMemo<SessionViewerTabsData | undefined>(() => {
    if (!enabled) return undefined;

    // Include the active session even before the append effect runs, so the
    // bar never flashes without its own tab.
    const ids = activeId && !openTabIds.includes(activeId)
      ? [...openTabIds, activeId]
      : openTabIds;
    const orderedIds = orderWithPinnedFirst(ids, pinnedTabIds);
    const resolved = orderedIds
      .map((id) => sessionsById.get(id))
      .filter((session): session is SessionInfo => Boolean(session));

    return {
      tabs: resolved,
      activeTabId: activeId,
      pinnedTabIds,
      canReopenClosedTab,
    };
  }, [enabled, sessionsById, openTabIds, activeId, pinnedTabIds, canReopenClosedTab]);

  return {
    tabs: tabsData,
    closeTab,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    closeAllTabs,
    togglePinTab,
    reopenClosedTab,
  };
}
