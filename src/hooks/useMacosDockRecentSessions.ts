import { useEffect } from "react";
import type { SessionInfo } from "../types";
import { invoke, isTauri } from "../transport";

const STORAGE_KEY = "psm:macos-dock-recent-sessions";
const MAX_RECENT_SESSIONS = 15;
const MAX_TITLE_LENGTH = 80;

export interface DockRecentSession {
  id: string;
  title: string;
}

export function updateDockRecentSessions(
  current: readonly DockRecentSession[],
  session: DockRecentSession,
): DockRecentSession[] {
  const id = session.id.trim();
  if (!id) return current.slice(0, MAX_RECENT_SESSIONS);

  const title = session.title.trim() || "Untitled Session";
  return [
    { id, title: title.slice(0, MAX_TITLE_LENGTH) },
    ...current.filter((item) => item.id !== id),
  ].slice(0, MAX_RECENT_SESSIONS);
}

function loadRecentSessions(): DockRecentSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is DockRecentSession =>
          typeof item?.id === "string" && typeof item?.title === "string",
      )
      .slice(0, MAX_RECENT_SESSIONS);
  } catch {
    return [];
  }
}

function getSessionTitle(session: SessionInfo): string {
  const title = session.name?.trim() || session.first_message?.trim();
  return title || "Untitled Session";
}

export function useMacosDockRecentSessions(
  selectedSession: SessionInfo | null,
): void {
  useEffect(() => {
    if (!isTauri()) return;

    const stored = loadRecentSessions();
    const recentSessions = selectedSession
      ? updateDockRecentSessions(stored, {
          id: selectedSession.id,
          title: getSessionTitle(selectedSession),
        })
      : stored;

    if (selectedSession) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSessions));
    }

    void invoke("update_macos_dock_recent_sessions", {
      sessions: recentSessions,
    }).catch((error) => {
      console.warn("Failed to update macOS Dock recent sessions:", error);
    });
  }, [selectedSession]);
}
