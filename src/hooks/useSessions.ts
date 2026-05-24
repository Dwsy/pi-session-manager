import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNotification } from "@/hooks/useNotification";
import { psmRuntimeEventBus } from "@/plugins/runtime-host/eventBus";
import type { SessionInfo, SessionsDiff } from "@/types";
import type {
  PiLiveSessionDisconnectedPayload,
  PiLiveSessionRegisteredPayload,
} from "@/types/pi-live";
import type {
  DeleteSessionAnchorPoint,
  DeleteSessionRequestOptions,
} from "@/components/dialogs/deleteSessionTypes";
import {
  BROWSER_DATASET_REFRESHED_EVENT,
  isBrowserDatasetModeEnabled,
} from "@/browser-dataset";
import {
  canResolveRuntimeSession,
  deleteRuntimeSessionItems,
  forkRuntimeSessionItem,
  getRuntimeSessionOperationCapability,
  getSessionRuntimeMode,
  loadRuntimeSessionList,
  renameRuntimeSessionItem,
} from "@/runtime-data/sessionSource";

export interface PendingDeleteSession {
  sessions: SessionInfo[];
  requestedAt: number;
  anchorRef?: React.RefObject<HTMLElement | null>;
  anchorPoint?: DeleteSessionAnchorPoint | null;
}

interface DeleteSessionsResult {
  deleted_count: number;
  failed: Array<{ path: string; error: string }>;
}

interface SessionChangeNotifications {
  newSessions: SessionInfo[];
  renamedSessions: Array<{
    before: string;
    after: string;
    path: string;
  }>;
}

function normalizeSessionName(session: Pick<SessionInfo, "name">): string {
  return (session.name || "").trim();
}

function getSessionDisplayName(session: SessionInfo, fallback: string): string {
  const explicitName = normalizeSessionName(session);
  if (explicitName) return explicitName;

  const firstMessage = session.first_message?.trim();
  if (firstMessage) return firstMessage;

  const filename = session.path.split(/[/\\]/).pop()?.replace(/\.jsonl$/, "");
  return filename?.trim() || session.id || fallback;
}

function getSessionChangeNotifications(
  previousSessions: SessionInfo[],
  diff: SessionsDiff,
  fallbackName: string,
): SessionChangeNotifications {
  const previousByPath = new Map(
    previousSessions.map((session) => [session.path, session]),
  );
  const previousById = new Map(
    previousSessions.map((session) => [session.id, session]),
  );
  const newSessions: SessionInfo[] = [];
  const renamedSessions: SessionChangeNotifications["renamedSessions"] = [];

  for (const updated of diff.updated) {
    const previous =
      previousByPath.get(updated.path) || previousById.get(updated.id);

    if (!previous) {
      newSessions.push(updated);
      continue;
    }

    const previousName = normalizeSessionName(previous);
    const nextName = normalizeSessionName(updated);
    if (previousName !== nextName) {
      renamedSessions.push({
        before: previousName || getSessionDisplayName(previous, fallbackName),
        after: nextName || getSessionDisplayName(updated, fallbackName),
        path: updated.path,
      });
    }
  }

  return { newSessions, renamedSessions };
}

export interface UseSessionsReturn {
  sessions: SessionInfo[];
  loading: boolean;
  selectedSession: SessionInfo | null;
  setSelectedSession: (session: SessionInfo | null) => void;
  loadSessions: () => Promise<void>;
  patchSessions: (diff: SessionsDiff) => void;
  handleDeleteSession: (
    session: SessionInfo,
    options?: DeleteSessionRequestOptions,
  ) => Promise<void>;
  handleDeleteSessions: (
    sessions: SessionInfo[],
    anchorRef?: React.RefObject<HTMLElement | null>,
    options?: DeleteSessionRequestOptions,
  ) => Promise<void>;
  pendingDeleteSession: PendingDeleteSession | null;
  confirmDeleteSession: () => Promise<void>;
  cancelDeleteSession: () => void;
  handleRenameSession: (session: SessionInfo, newName: string) => Promise<void>;
  forkSession: (
    sourcePath: string,
    targetName?: string,
  ) => Promise<SessionInfo | null>;
}

export function useSessions(): UseSessionsReturn {
  const { t } = useTranslation();
  const { sendNotification } = useNotification();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<PendingDeleteSession | null>(null);
  const sessionsRef = useRef<SessionInfo[]>([]);
  const selectedSessionRef = useRef<SessionInfo | null>(null);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  const notifyNewSessions = useCallback(
    (newSessions: SessionInfo[]) => {
      if (getSessionRuntimeMode() !== "backend" || newSessions.length === 0) {
        return;
      }

      const fallbackName = t("session.list.untitled", {
        defaultValue: "Untitled Session",
      });

      if (newSessions.length === 1) {
        const session = newSessions[0];
        void sendNotification({
          title: t("session.notifications.newSession", {
            defaultValue: "New Session",
          }),
          body: getSessionDisplayName(session, fallbackName),
          sessionPath: session.path,
        });
        return;
      }

      void sendNotification({
        title: t("session.notifications.newSessions", {
          defaultValue: "New Sessions",
        }),
        body: t("session.notifications.newSessionsBody", {
          count: newSessions.length,
          defaultValue: "{{count}} new sessions",
        }),
      });
    },
    [sendNotification, t],
  );

  const notifySessionRenamed = useCallback(
    (before: string, after: string, sessionPath: string) => {
      if (getSessionRuntimeMode() !== "backend" || before === after) {
        return;
      }

      void sendNotification({
        title: t("session.notifications.renamed", {
          defaultValue: "Session Renamed",
        }),
        body: `${before} -> ${after}`,
        sessionPath,
      });
    },
    [sendNotification, t],
  );

  const notifySessionChanges = useCallback(
    ({ newSessions, renamedSessions }: SessionChangeNotifications) => {
      notifyNewSessions(newSessions);
      for (const renamed of renamedSessions) {
        notifySessionRenamed(renamed.before, renamed.after, renamed.path);
      }
    },
    [notifyNewSessions, notifySessionRenamed],
  );

  const loadSessions = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    const isCurrentRequest = () => requestId === loadRequestIdRef.current;
    let shouldKeepLoading = false;

    try {
      const loadedSessionList = await loadRuntimeSessionList();
      const loadedSessions: SessionInfo[] = loadedSessionList.sessions;
      shouldKeepLoading =
        !loadedSessionList.isComplete && loadedSessions.length === 0;
      if (!isCurrentRequest()) {
        return;
      }

      sessionsRef.current = loadedSessions;
      setSessions(loadedSessions);

      const currentSelection = selectedSessionRef.current;
      if (currentSelection) {
        const matchedByPath = loadedSessions.find(
          (s) => s.path === currentSelection.path,
        );
        const matchedById = loadedSessions.find(
          (s) => s.id === currentSelection.id,
        );
        const matched = matchedByPath || matchedById;

        if (matched) {
          const pathChanged = matched.path !== currentSelection.path;
          const nameChanged = matched.name !== currentSelection.name;
          const hasChanges =
            pathChanged ||
            nameChanged ||
            matched.message_count !== currentSelection.message_count ||
            matched.modified !== currentSelection.modified;

          if (!hasChanges) {
            // No changes detected, keeping current selection stable
          } else if (pathChanged || nameChanged) {
            setSelectedSession(matched);
          } else {
            // Session metadata changed, updating silently
            setSelectedSession((prev) => {
              if (!prev) return matched;
              return { ...prev, ...matched };
            });
          }
        } else {
          try {
            const runtimeMode = getSessionRuntimeMode();
            if (runtimeMode === "demo") {
              // Demo mode doesn't need to check file existence
              setSelectedSession(currentSelection);
            } else {
              const readable = await canResolveRuntimeSession(
                currentSelection.path,
              );
              if (!isCurrentRequest()) {
                return;
              }
              if (readable && runtimeMode !== "backend") {
                setSelectedSession(currentSelection);
              }
              // Selected session file still readable but not in scan results, keeping selection
            }
          } catch (error) {
            if (!isCurrentRequest()) {
              return;
            }
            console.warn(
              "[useSessions] Selected session file not readable, clearing selection:",
              error,
            );
            setSelectedSession(null);
          }
        }
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      console.error("[useSessions] Failed to load sessions:", error);
      // Don't alert on mobile — connection errors are common on first load
    } finally {
      if (isCurrentRequest()) {
        setLoading(shouldKeepLoading);
      }
    }
  }, [t]);

  const patchSessions = useCallback((diff: SessionsDiff) => {
    const fallbackName = t("session.list.untitled", {
      defaultValue: "Untitled Session",
    });
    const notificationEvents = getSessionChangeNotifications(
      sessionsRef.current,
      diff,
      fallbackName,
    );

    setSessions((prev) => {
      const removedSet = new Set(diff.removed);
      let changed =
        diff.removed.length > 0 && prev.some((s) => removedSet.has(s.path));

      let next = changed
        ? prev.filter((s) => !removedSet.has(s.path))
        : [...prev];

      for (const u of diff.updated) {
        const idx = next.findIndex((s) => s.path === u.path);
        if (idx >= 0) {
          // Only replace if something actually changed
          const existing = next[idx];
          if (
            existing.modified !== u.modified ||
            existing.message_count !== u.message_count ||
            existing.name !== u.name ||
            existing.last_message !== u.last_message
          ) {
            next[idx] = u;
            changed = true;
          }
        } else {
          next.push(u);
          changed = true;
        }
      }

      if (!changed) {
        sessionsRef.current = prev;
        return prev;
      }

      next.sort((a, b) => b.modified.localeCompare(a.modified));
      sessionsRef.current = next;
      return next;
    });

    notifySessionChanges(notificationEvents);

    // Update selected session if it was in the diff
    const currentSelection = selectedSessionRef.current;
    if (currentSelection) {
      const removedSet = new Set(diff.removed);
      if (removedSet.has(currentSelection.path)) {
        setSelectedSession(null);
      } else {
        const updated = diff.updated.find(
          (s) => s.path === currentSelection.path,
        );
        if (updated) {
          setSelectedSession((prev) => (prev ? { ...prev, ...updated } : null));
        }
      }
    }
  }, [notifySessionChanges, t]);

  const handleDeleteSessions = useCallback(
    async (
      targets: SessionInfo[],
      anchorRef?: React.RefObject<HTMLElement | null>,
      options?: DeleteSessionRequestOptions,
    ) => {
      const nextTargets: SessionInfo[] = [];
      const seen = new Set<string>();

      for (const session of targets) {
        if (!session || seen.has(session.id)) {
          continue;
        }
        seen.add(session.id);
        nextTargets.push(session);
      }

      if (nextTargets.length === 0) {
        return;
      }

      setPendingDeleteSession({
        sessions: nextTargets,
        requestedAt: Date.now(),
        anchorRef,
        anchorPoint: options?.anchorPoint ?? null,
      });
    },
    [],
  );

  const handleDeleteSession = useCallback(
    async (
      session: SessionInfo,
      options?: DeleteSessionRequestOptions,
    ) => {
      await handleDeleteSessions([session], undefined, options);
    },
    [handleDeleteSessions],
  );

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDeleteSession) {
      return;
    }

    const targetSessions = pendingDeleteSession.sessions;
    const targetSessionIds = new Set(
      targetSessions.map((session) => session.id),
    );
    let deletedSessionIds = targetSessionIds;

    try {
      const capability = getRuntimeSessionOperationCapability("delete");
      if (!capability.supported) {
        console.warn("Delete is not supported in this runtime mode");
        alert(
          t("app.errors.deleteSession", {
            defaultValue: capability.fallbackMessage,
          }),
        );
        setPendingDeleteSession(null);
        return;
      }

      const result = (await deleteRuntimeSessionItems(
        targetSessions.map((session) => session.path),
      )) as DeleteSessionsResult;

      const failedPaths = new Set(result.failed.map((item) => item.path));
      deletedSessionIds = new Set(
        targetSessions
          .filter((session) => !failedPaths.has(session.path))
          .map((session) => session.id),
      );

      if (deletedSessionIds.size > 0) {
        setSessions((prev) => {
          const next = prev.filter(
            (session) => !deletedSessionIds.has(session.id),
          );
          sessionsRef.current = next;
          return next;
        });
      }

      if (result.failed.length > 0) {
        console.error("Failed to delete some sessions:", result.failed);
        alert(
          t("app.errors.deleteSessionPartial", {
            count: result.failed.length,
            defaultValue:
              "{{count}} sessions failed to delete. Check the console for details.",
          }),
        );
      }

      if (
        selectedSessionRef.current?.id &&
        deletedSessionIds.has(selectedSessionRef.current.id)
      ) {
        setSelectedSession(null);
      }

      setPendingDeleteSession(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert(t("app.errors.deleteSession"));
    }
  }, [pendingDeleteSession, t]);

  const cancelDeleteSession = useCallback(() => {
    setPendingDeleteSession(null);
  }, []);

  const handleRenameSession = useCallback(
    async (session: SessionInfo, newName: string) => {
      try {
        const capability = getRuntimeSessionOperationCapability("rename");
        if (!capability.supported) {
          console.warn("Rename is not supported in this runtime mode");
          alert(
            t("app.errors.renameSession", {
              defaultValue: capability.fallbackMessage,
            }),
          );
          return;
        }

        const fallbackName = t("session.list.untitled", {
          defaultValue: "Untitled Session",
        });
        const beforeName = getSessionDisplayName(session, fallbackName);
        const afterName = newName.trim() || fallbackName;
        const updated = await renameRuntimeSessionItem(session.path, newName);
        const updatedPath = updated?.path || session.path;
        setSessions((prev) => {
          const next = prev.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  name: newName,
                  modified: updated?.modified || s.modified,
                  path: updated?.path || s.path,
                }
              : s,
          );
          sessionsRef.current = next;
          return next;
        });

        if (selectedSession?.id === session.id) {
          setSelectedSession((prev) =>
            prev
              ? {
                  ...prev,
                  name: newName,
                  modified: updated?.modified || prev.modified,
                  path: updated?.path || prev.path,
                }
              : null,
          );
        }

        if (normalizeSessionName(session) !== newName.trim()) {
          notifySessionRenamed(beforeName, afterName, updatedPath);
        }
      } catch (error) {
        console.error("Failed to rename session:", error);
        alert(t("app.errors.renameSession"));
      }
    },
    [notifySessionRenamed, selectedSession, t],
  );

  const forkSession = useCallback(
    async (
      sourcePath: string,
      targetName?: string,
    ): Promise<SessionInfo | null> => {
      try {
        const capability = getRuntimeSessionOperationCapability("fork");
        if (!capability.supported) {
          console.warn("Fork is not supported in this runtime mode");
          alert(
            t("app.errors.forkSession", {
              defaultValue: capability.fallbackMessage,
            }),
          );
          return null;
        }

        const newSession = await forkRuntimeSessionItem(sourcePath, targetName);
        if (!newSession) {
          return null;
        }

        // Add the new session to the list
        setSessions((prev) => {
          const updated = [newSession, ...prev];
          updated.sort((a, b) => b.modified.localeCompare(a.modified));
          sessionsRef.current = updated;
          return updated;
        });
        notifyNewSessions([newSession]);

        return newSession;
      } catch (error) {
        console.error("Failed to fork session:", error);
        alert(
          t("app.errors.forkSession", {
            defaultValue: "Failed to fork session",
          }),
        );
        return null;
      }
    },
    [notifyNewSessions, t],
  );

  useEffect(() => {
    if (getSessionRuntimeMode() !== "backend") return;

    const unsubscribeRegistered = psmRuntimeEventBus.subscribe<
      "pi-live:session_registered",
      PiLiveSessionRegisteredPayload
    >("pi-live:session_registered", ({ payload }) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) return;
      // Patch in a lightweight stub; the next file-watcher diff will fill details.
      const now = new Date().toISOString();
      // Extract a meaningful display name from path/cwd, fallback to sessionId
      const sessionPath = payload.sessionPath || "";
      const displayName = sessionPath.split("/").pop()?.replace(/\.jsonl$/, "") || payload.cwd?.split("/").pop() || sessionId;
      patchSessions({
        updated: [{
          id: sessionId,
          path: sessionPath,
          cwd: payload.cwd || "",
          name: displayName,
          created: now,
          modified: now,
          message_count: payload.entries?.length || 0,
          first_message: "",
          user_messages_text: "",
          assistant_messages_text: "",
          last_message: "",
          last_message_role: "assistant",
          parent_session_path: undefined,
          isLive: true,
          pid: payload.pid,
        }],
        removed: [],
      });
    });
    const unsubscribeDisconnected = psmRuntimeEventBus.subscribe<
      "pi-live:session_disconnected",
      PiLiveSessionDisconnectedPayload
    >("pi-live:session_disconnected", ({ payload }) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) return;
      // Just mark as not-live; no full rescan needed.
      setSessions((prev) => {
        const next = prev.map((s) =>
          s.id === sessionId ? { ...s, isLive: false, pid: undefined } : s,
        );
        sessionsRef.current = next;
        return next;
      });
    });
    return () => {
      unsubscribeRegistered();
      unsubscribeDisconnected();
    };
  }, [patchSessions]);

  useEffect(() => {
    if (!isBrowserDatasetModeEnabled() || typeof window === "undefined") return;

    const handleRefresh = () => {
      void loadSessions();
    };

    window.addEventListener(BROWSER_DATASET_REFRESHED_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(
        BROWSER_DATASET_REFRESHED_EVENT,
        handleRefresh,
      );
    };
  }, [loadSessions]);

  return {
    sessions,
    loading,
    selectedSession,
    setSelectedSession,
    loadSessions,
    patchSessions,
    handleDeleteSession,
    handleDeleteSessions,
    pendingDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
    handleRenameSession,
    forkSession,
  };
}
