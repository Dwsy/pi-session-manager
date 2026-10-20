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
}

export interface SessionViewerTabsData {
  tabs: SessionInfo[];
  activeTabId: string | null;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
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
  const activeId = selectedSession?.id ?? null;

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
  }, [sessions, activeId]);

  const closeTab = useCallback(
    (sessionId: string) => {
      if (activeId !== sessionId) {
        setOpenTabIds((prev) => prev.filter((id) => id !== sessionId));
        return;
      }

      // Closing the active tab: prefer the right neighbor, then the left one.
      const index = openTabIds.indexOf(sessionId);
      const neighborIds =
        index >= 0
          ? [...openTabIds.slice(index + 1), ...openTabIds.slice(0, index)]
          : openTabIds.filter((id) => id !== sessionId);
      const sessionsById = new Map(
        sessions.map((session) => [session.id, session]),
      );
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
    [activeId, openTabIds, sessions, onSelectSession, onCloseViewer],
  );

  const tabsData = useMemo<SessionViewerTabsData | undefined>(() => {
    if (!enabled) return undefined;

    const sessionsById = new Map(sessions.map((session) => [session.id, session]));
    if (selectedSession) {
      sessionsById.set(selectedSession.id, selectedSession);
    }
    // Include the active session even before the append effect runs, so the
    // bar never flashes without its own tab.
    const ids = activeId && !openTabIds.includes(activeId)
      ? [...openTabIds, activeId]
      : openTabIds;
    const resolved = ids
      .map((id) => sessionsById.get(id))
      .filter((session): session is SessionInfo => Boolean(session));

    return { tabs: resolved, activeTabId: activeId };
  }, [enabled, sessions, selectedSession, openTabIds, activeId]);

  return { tabs: tabsData, closeTab };
}
