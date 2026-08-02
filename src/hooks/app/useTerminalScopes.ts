import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { SessionInfo } from "@/types";
import { getPathBasename, pathsEqual } from "@/utils/path";

const MAX_TERMINAL_SCOPES = 5;

export interface TerminalScope {
  key: string;
  cwd: string;
  label: string;
}

export interface UseTerminalScopesOptions {
  selectedSession: SessionInfo | null;
  selectedProject: string | null;
  sessions: SessionInfo[];
  standaloneDatasetRuntime: boolean;
  workspaceLabel: string;
}

export interface UseTerminalScopesReturn {
  showTerminal: boolean;
  setShowTerminal: Dispatch<SetStateAction<boolean>>;
  terminalMaximized: boolean;
  setTerminalMaximized: Dispatch<SetStateAction<boolean>>;
  activeTerminalScopeKey: string | null;
  terminalScopeList: TerminalScope[];
  terminalPendingCommands: Record<string, string | null>;
  currentTerminalScope: TerminalScope;
  getTerminalScopeForSession: (session: SessionInfo) => TerminalScope;
  openTerminalScope: (scope: TerminalScope, command?: string | null) => void;
  toggleCurrentTerminalScope: (terminalEnabled: boolean) => void;
  closeDesktopTerminal: () => void;
  clearTerminalPendingCommand: (scopeKey: string) => void;
  handleBuiltinTerminalDisabled: () => void;
}

export function useTerminalScopes({
  selectedSession,
  selectedProject,
  sessions,
  standaloneDatasetRuntime,
  workspaceLabel,
}: UseTerminalScopesOptions): UseTerminalScopesReturn {
  const [showTerminal, setShowTerminal] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [activeTerminalScopeKey, setActiveTerminalScopeKey] = useState<
    string | null
  >(null);
  const [terminalScopes, setTerminalScopes] = useState<
    Record<string, TerminalScope>
  >({});
  const [terminalPendingCommands, setTerminalPendingCommands] = useState<
    Record<string, string | null>
  >({});

  const getTerminalScopeForSession = useCallback(
    (session: SessionInfo): TerminalScope => ({
      key: `session:${session.id || session.path}`,
      cwd: session.cwd || "/",
      label: session.name || session.id || "Session",
    }),
    [],
  );

  const currentTerminalScope = useMemo<TerminalScope>(() => {
    if (selectedSession) {
      return getTerminalScopeForSession(selectedSession);
    }
    if (selectedProject) {
      return {
        key: `project:${selectedProject}`,
        cwd: selectedProject,
        label: getPathBasename(selectedProject) || selectedProject,
      };
    }
    return {
      key: "workspace",
      cwd: sessions[0]?.cwd || "/",
      label: workspaceLabel,
    };
  }, [
    getTerminalScopeForSession,
    selectedProject,
    selectedSession,
    sessions,
    workspaceLabel,
  ]);

  const ensureTerminalScope = useCallback(
    (scope: TerminalScope) => {
      setTerminalScopes((previous) => {
        const existing = previous[scope.key];
        if (
          existing &&
          pathsEqual(existing.cwd, scope.cwd) &&
          existing.label === scope.label
        ) {
          return previous;
        }

        const next = { ...previous, [scope.key]: scope };
        const keys = Object.keys(next);
        if (keys.length <= MAX_TERMINAL_SCOPES) {
          return next;
        }

        const evictKey =
          keys.find(
            (key) => key !== scope.key && key !== activeTerminalScopeKey,
          ) ?? keys[0];
        if (evictKey) {
          delete next[evictKey];
        }
        return next;
      });
    },
    [activeTerminalScopeKey],
  );

  const openTerminalScope = useCallback(
    (scope: TerminalScope, command?: string | null) => {
      ensureTerminalScope(scope);
      setActiveTerminalScopeKey(scope.key);
      if (command != null) {
        setTerminalPendingCommands((previous) => ({
          ...previous,
          [scope.key]: command,
        }));
      }
      setShowTerminal(true);
    },
    [ensureTerminalScope],
  );

  const toggleCurrentTerminalScope = useCallback(
    (terminalEnabled: boolean) => {
      if (!terminalEnabled || standaloneDatasetRuntime) {
        return;
      }
      ensureTerminalScope(currentTerminalScope);
      setActiveTerminalScopeKey(currentTerminalScope.key);
      setShowTerminal(
        (open) =>
          !(open && activeTerminalScopeKey === currentTerminalScope.key),
      );
    },
    [
      activeTerminalScopeKey,
      currentTerminalScope,
      ensureTerminalScope,
      standaloneDatasetRuntime,
    ],
  );

  useEffect(() => {
    if (!showTerminal) {
      return;
    }
    ensureTerminalScope(currentTerminalScope);
    setActiveTerminalScopeKey(currentTerminalScope.key);
  }, [currentTerminalScope, ensureTerminalScope, showTerminal]);

  useEffect(() => {
    setTerminalMaximized(false);
  }, [activeTerminalScopeKey]);

  const closeDesktopTerminal = useCallback(() => {
    setShowTerminal(false);
    setTerminalMaximized(false);
  }, []);

  const clearTerminalPendingCommand = useCallback((scopeKey: string) => {
    setTerminalPendingCommands((previous) => {
      if (previous[scopeKey] == null) {
        return previous;
      }
      return { ...previous, [scopeKey]: null };
    });
  }, []);

  const handleBuiltinTerminalDisabled = useCallback(() => {
    setShowTerminal(false);
    setTerminalMaximized(false);
  }, []);

  const terminalScopeList = useMemo(
    () => Object.values(terminalScopes),
    [terminalScopes],
  );

  return {
    showTerminal,
    setShowTerminal,
    terminalMaximized,
    setTerminalMaximized,
    activeTerminalScopeKey,
    terminalScopeList,
    terminalPendingCommands,
    currentTerminalScope,
    getTerminalScopeForSession,
    openTerminalScope,
    toggleCurrentTerminalScope,
    closeDesktopTerminal,
    clearTerminalPendingCommand,
    handleBuiltinTerminalDisabled,
  };
}
