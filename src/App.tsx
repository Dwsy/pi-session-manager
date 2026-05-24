import * as ReactRuntime from "react";
import { useState, useMemo, useRef, useCallback, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { VersionDowngradeDialog } from "./components/dialogs";
type VersionDowngradeInfo = {
  stored_app_version: string;
  stored_schema_version: number;
  current_app_version: string;
  max_supported_schema_version: number;
  updated_at: string;
  db_path: string;
};
import { useRouteSync } from "./hooks/useRouteSync";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSwipe } from "./hooks/useSwipe";
import { triggerHaptic } from "./utils/haptics";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDeepLink } from "./hooks/useDeepLink";
import { useSessionBadges } from "./hooks/useSessionBadges";
import { listSupportedSessionProviders } from "./utils/sessionProvidersApi";
import { useSessions } from "./hooks/useSessions";
import { useAppSettings } from "./hooks/useAppSettings";
import { useSessionActions } from "./hooks/useSessionActions";
import { useAppearance } from "./hooks/useAppearance";
import { useSettings } from "./hooks/useSettings";
import { useToolStyles } from "./hooks/useToolStyles";
import { useIsMobile } from "./hooks/useIsMobile";
import { useClipboard } from "./hooks/useClipboard";
import { useContextMenuOverride } from "./hooks/useContextMenuOverride";
import { useAppBootstrap } from "./hooks/app/useAppBootstrap";
import { useAppUiEffects } from "./hooks/app/useAppUiEffects";
import { useUpdateChecker } from "./hooks/app/useUpdateChecker";
import { useDesktopSidebarActions } from "./hooks/app/useDesktopSidebarActions";
import { useFavorites } from "./hooks/app/useFavorites";
import { useSidebarSessions } from "./hooks/app/useSidebarSessions";
import { registerBuiltinToolPlugins } from "./plugins/tools-render";
import ConnectionBanner from "./components/ConnectionBanner";
import UpdateNoticeToast from "./components/UpdateNoticeToast";
import StandaloneDatasetOverview from "./components/dataset/StandaloneDatasetOverview";
import { useTags } from "./hooks/useTags";
import type { SessionConvertTarget, SessionInfo } from "./types";
import type { SearchContext } from "./plugins/types";
import {
  initializePsmPluginHost,
  type PsmAppViewRuntimeRegistration,
  psmPluginHost,
  usePsmPluginUi,
} from "./plugins/runtime-host";
import { invoke, isTauri } from "./transport";
import { getCachedSettings } from "./utils/settingsApi";
import { getSessionSourceSlug } from "./utils/session";
import {
  buildPiResumeCommand,
  buildPiForkCommand,
  buildCopyResumeCommandForTarget,
  getConfiguredExternalResumeTarget,
  getFallbackExternalResumeTarget,
} from "./utils/sessionResume";
import { shouldSkipOnboardingForRuntime } from "./runtime-data/mode";
import AppMobileLayout, {
  type MobileTab,
} from "./components/app/AppMobileLayout";
import AppDesktopSidebar, {
  type AppDesktopSidebarAppViewItem,
} from "./components/app/AppDesktopSidebar";
import AppDesktopContent from "./components/app/AppDesktopContent";
import AppDesktopSearchBar from "./components/app/AppDesktopSearchBar";
import { usePiLive } from "./hooks/usePiLive";
import AppDesktopSidebarContent from "./components/app/AppDesktopSidebarContent";
import { AppPluginSurfaceDataProvider } from "./components/app/AppPluginSurfaceData";
import AppOverlays from "./components/app/AppOverlays";
import AppSessionListPane from "./components/app/AppSessionListPane";
import AppProjectListPane from "./components/app/AppProjectListPane";
import AppPluginViewPane from "./components/app/AppPluginViewPane";
import AppDashboardPane from "./components/app/AppDashboardPane";
import AppSessionViewerPane from "./components/app/AppSessionViewerPane";
import AppMobileFilterBar from "./components/app/AppMobileFilterBar";
import AppSettingsPane from "./components/app/AppSettingsPane";
import AppTerminalPane from "./components/app/AppTerminalPane";
import { resolveDesktopMainContent } from "./components/app/resolveDesktopMainContent";
import DeleteSessionPopover from "./components/dialogs/DeleteSessionPopover";
import type { DeleteSessionRequestOptions } from "./components/dialogs/deleteSessionTypes";
import {
  BROWSER_DATASET_REFRESHED_EVENT,
  DEFAULT_STANDALONE_DATASET_ID,
  getActiveDatasetId,
  isStandaloneDatasetRuntime,
} from "./browser-dataset";
import {
  DEFAULT_SESSION_SORT_BY,
  DEFAULT_SESSION_SORT_ORDER,
} from "./types/sessionSort";

if (!(globalThis as Record<string, unknown>).__PSM_HOST_REACT__) {
  (globalThis as Record<string, unknown>).__PSM_HOST_REACT__ = ReactRuntime;
}

const startDragging = () => {
  if (isTauri()) {
    getCurrentWindow().startDragging();
  }
};

const GLOBAL_SHORTCUTS_ALLOWED_IN_TEXT_ENTRY = [
  // Keep app-level navigation shortcuts available while typing, but do not
  // allow destructive or session-launch actions to fire from text inputs.
  "cmd+l",
  "cmd+p",
  "cmd+,",
  "cmd+`",
  "cmd+shift+f",
  "cmd+shift+i",
  "f12",
];

function normalizeShortcutKey(shortcut?: string) {
  return shortcut
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^command\+/, "cmd+")
    .replace(/^⌘/, "cmd+");
}

function normalizeAppRoute(route?: string) {
  if (!route) return null;
  const [pathname] = route.split(/[?#]/);
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, "") || "/";
}

function getAppViewRoute(view: Pick<PsmAppViewRuntimeRegistration, "id" | "route">) {
  return normalizeAppRoute(view.route) ?? `/app/${encodeURIComponent(view.id)}`;
}

function appViewMobileTabId(viewId: string): MobileTab {
  return `app:${viewId}`;
}

function appViewIdFromMobileTab(tab: MobileTab) {
  return tab.startsWith("app:") ? tab.slice(4) : null;
}

// Lazy load heavy components
const Dashboard = lazy(() => import("./components/dashboard/Dashboard"));
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel"));
const TerminalPanel = lazy(() => import("./components/terminal/TerminalPanel"));
const CommandPalette = lazy(() =>
  import("./components/command").then((m) => ({ default: m.CommandPalette })),
);

// Loading fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full" role="status" aria-live="polite" aria-label="Loading">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    <span className="sr-only">Loading</span>
  </div>
);

function App() {
  const { t } = useTranslation();
  const standaloneDatasetRuntime = isStandaloneDatasetRuntime();
  const isTauriRuntime = isTauri();
  const appRuntime = isTauriRuntime
    ? "tauri"
    : standaloneDatasetRuntime
      ? "dataset"
      : import.meta.env.MODE === "demo"
        ? "demo"
        : "web";

  // Override WebKit context menu for native feel
  useContextMenuOverride();

  // Delayed scanning page: only show if loading takes >500ms (avoids flash on fast DB loads)
  const [showScanningPage, setShowScanningPage] = useState(false);
  const [, setPluginRenderVersion] = useState(0);
  const loadingRef = useRef(true);
  const frontendReadyEmittedRef = useRef(false);

  // Register core tool renderers; extension renderers are loaded by the PSM plugin host.
  useEffect(() => {
    const unsubscribe = psmPluginHost.subscribe(() => {
      setPluginRenderVersion((version) => version + 1);
    });
    registerBuiltinToolPlugins();
    initializePsmPluginHost().catch((error) => {
      console.error("[PSM plugins] Failed to initialize plugin host:", error);
    });
    return unsubscribe;
  }, []);
  const isMobile = useIsMobile();

  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const listScrollRef = useRef<HTMLDivElement>(null);
  const projectScrollRef = useRef<HTMLDivElement>(null);

  const mobileViewerRef = useRef<HTMLDivElement>(null);

  const {
    sessions,
    loading,
    selectedSession,
    setSelectedSession,
    loadSessions,
    patchSessions,
    handleDeleteSession,
    handleDeleteSessions,
    handleRenameSession,
    forkSession,
    pendingDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
  } = useSessions();

  // Delayed scanning page: only show if loading takes >500ms
  useEffect(() => {
    loadingRef.current = loading;
    if (loading) {
      const timer = setTimeout(() => {
        if (loadingRef.current) setShowScanningPage(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowScanningPage(false);
    }
  }, [loading]);

  const { terminal, piPath, customCommand, resumeCommand, loadSettings } =
    useAppSettings();
  const { copyText } = useClipboard();
  const { handleExportSession, handleConvertSession } = useSessionActions();
  const { getBadgeType, clearBadge } = useSessionBadges(
    sessions,
    selectedSession?.id ?? null,
  );
  const handleDeleteSessionsWithRef = useCallback(
    async (
      sessions: import("./types").SessionInfo[],
      options?: DeleteSessionRequestOptions,
    ) => {
      await handleDeleteSessions(sessions, undefined, options);
    },
    [handleDeleteSessions],
  );

  const {
    tags,
    sessionTags,
    getTagsForSession,
    assignTag,
    removeTagFromSession,
    createTag,
    moveSession,
    getDescendantIds,
    loadTags,
  } = useTags();
  const { loading: settingsLoading } = useSettings();
  useAppearance();
  useToolStyles();
  const { liveSessionIds: runtimeLiveSessionIds } = usePiLive();
  const liveSessionIds = standaloneDatasetRuntime
    ? new Set<string>()
    : runtimeLiveSessionIds;

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"list" | "project" | "app">(
    () => {
      if (standaloneDatasetRuntime) {
        return "list";
      }
      const saved = getCachedSettings().session?.defaultViewMode;
      return saved === "list" ? "list" : "project";
    },
  );
  const [activeAppViewId, setActiveAppViewId] = useState<string | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [sourceFilterSlugs, setSourceFilterSlugs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("psm-source-filter-slugs");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [modelFilter, setModelFilter] = useState("");
  const [dateRange, setDateRange] = useState<import("./types").DateRange | null>(null);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [sourceOptions, setSourceOptions] = useState<
    Array<{ slug: string; label: string }>
  >([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeDialogMode, setResumeDialogMode] = useState<"resume" | "copy">(
    "resume",
  );
  const [convertResult, setConvertResult] = useState<
    import("./types").SessionConvertResult | null
  >(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const standaloneDatasetId = standaloneDatasetRuntime
    ? getActiveDatasetId() || DEFAULT_STANDALONE_DATASET_ID
    : "";
  const [sessionSortBy, setSessionSortBy] = useState(DEFAULT_SESSION_SORT_BY);
  const [sessionSortOrder, setSessionSortOrder] = useState(
    DEFAULT_SESSION_SORT_ORDER,
  );
  const [selectionModeTrigger, setSelectionModeTrigger] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (shouldSkipOnboardingForRuntime()) {
      try {
        localStorage.setItem("onboarding-completed", "true");
      } catch {}
      return false;
    }
    try {
      return !localStorage.getItem("onboarding-completed");
    } catch {
      return false;
    }
  });
  const [showTerminal, setShowTerminal] = useState(false);
  const [versionDowngradeInfo, setVersionDowngradeInfo] = useState<VersionDowngradeInfo | null>(null);

  useEffect(() => {
    if (!standaloneDatasetRuntime || typeof window === "undefined") return;

    const handleDatasetSelectionChange = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason !== "selection-change") return;

      setSelectedSession(null);
      setSelectedProject(null);
      setFilterTagIds([]);
      setSourceFilterSlugs([]);
      setModelFilter("");
      setDateRange(null);
      setSidebarSearchQuery("");
      setShowFavorites(false);
      setActiveAppViewId(null);
      setSidebarMode("list");
      if (isMobile) {
        setMobileTab("list");
      }
    };

    window.addEventListener(
      BROWSER_DATASET_REFRESHED_EVENT,
      handleDatasetSelectionChange,
    );
    return () => {
      window.removeEventListener(
        BROWSER_DATASET_REFRESHED_EVENT,
        handleDatasetSelectionChange,
      );
    };
  }, [isMobile, setSelectedSession, standaloneDatasetRuntime]);

  // Check for version downgrade on app startup
  useEffect(() => {
    if (standaloneDatasetRuntime) return;

    const checkVersion = async () => {
      try {
        const result = await invoke<{ has_downgrade: boolean; downgrade_info: VersionDowngradeInfo | null; current_app_version: string }>('check_version_downgrade');
        if (result.has_downgrade && result.downgrade_info) {
          setVersionDowngradeInfo(result.downgrade_info);
        }
      } catch (err) {
        console.error('Failed to check version downgrade:', err);
      }
    };

    checkVersion();
  }, [standaloneDatasetRuntime]);

  const handleContinueVersionDowngrade = useCallback(async () => {
    try {
      await invoke('allow_version_downgrade', { allow: true });
      setVersionDowngradeInfo(null);
      await Promise.allSettled([loadSettings(), loadSessions(), loadTags()]);
    } catch (err) {
      console.error('Failed to continue after version downgrade warning:', err);
    }
  }, [loadSettings, loadSessions, loadTags]);

  const navigate = useNavigate();
  const {
    ready: pluginUiReady,
    appViews,
  } = usePsmPluginUi();
  const appRoutes = useMemo(
    () => appViews.map((view) => ({ id: view.id, route: view.route })),
    [appViews],
  );

  // Route sync for deep linking and URL-based navigation
  const {
    navigateToSession,
    navigateToSessions,
    pendingSessionRoute,
    pendingAppRoute,
  } = useRouteSync({
    setSelectedSession,
    selectedSession,
    sessions,
    sessionsLoading: loading,
    viewMode: sidebarMode,
    setViewMode: setSidebarMode,
    setSelectedProject,
    setShowSettings,
    setShowTerminal,
    setShowFavorites,
    setActiveAppViewId,
    appRoutes,
    appRoutesReady: pluginUiReady,
  });

  const openPluginAppView = useCallback(
    (view: PsmAppViewRuntimeRegistration) => {
      setSidebarMode("app");
      setActiveAppViewId(view.id);
      setSelectedSession(null);
      setSelectedProject(null);
      setShowFavorites(false);
      navigate(getAppViewRoute(view));
    },
    [navigate, setSelectedSession],
  );
  const openPluginAppViewById = useCallback(
    (viewId: string) => {
      const view = appViews.find((item) => item.id === viewId);
      if (view) openPluginAppView(view);
    },
    [appViews, openPluginAppView],
  );
  const appViewItems = useMemo<AppDesktopSidebarAppViewItem[]>(
    () => appViews.map((view) => ({
        id: view.id,
        label: view.title,
        icon: view.icon,
        shortcut: view.shortcut,
        active: sidebarMode === "app" && activeAppViewId === view.id && !showFavorites,
        onSelect: () => openPluginAppView(view),
      })),
    [activeAppViewId, appViews, openPluginAppView, showFavorites, sidebarMode],
  );
  const mobileAppViewItems = useMemo(
    () => appViews.map((view) => ({
      id: view.id,
      tabId: appViewMobileTabId(view.id),
      label: view.title,
      icon: view.icon,
    })),
    [appViews],
  );
  const handleMobileTabChange = useCallback(
    (tab: MobileTab) => {
      const appViewId = appViewIdFromMobileTab(tab);
      if (appViewId) {
        const appView = appViews.find((view) => view.id === appViewId);
        setMobileTab(tab);
        if (appView) {
          openPluginAppView(appView);
        }
        return;
      }

      setActiveAppViewId(null);
      if (tab === "list") {
        setSidebarMode("list");
      } else if (tab === "projects") {
        setSidebarMode("project");
      }
      setMobileTab(tab);
    },
    [appViews, openPluginAppView],
  );
  useEffect(() => {
    if (!isMobile || sidebarMode !== "app" || !activeAppViewId) return;
    setMobileTab(appViewMobileTabId(activeAppViewId));
  }, [activeAppViewId, isMobile, sidebarMode]);
  const appViewShortcuts = useMemo(
    () => Object.fromEntries(
      appViewItems
        .map((item) => [normalizeShortcutKey(item.shortcut), item.onSelect] as const)
        .filter((entry): entry is readonly [string, () => void] => Boolean(entry[0])),
    ),
    [appViewItems],
  );
  const shortcutsAllowedInTextEntry = useMemo(
    () => [
      ...GLOBAL_SHORTCUTS_ALLOWED_IN_TEXT_ENTRY,
      ...Object.keys(appViewShortcuts),
    ],
    [appViewShortcuts],
  );

  // Deep link: pi-session://sessions/{id} etc.
  const handleDeepLink = useCallback((path: string) => navigate(path), [navigate]);
  useDeepLink({ onNavigate: handleDeepLink });

  useSwipe(mobileViewerRef, {
    onSwipeRight: () => {
      triggerHaptic("light");
      navigateToSessions();
    },
    threshold: 40,
    edgeZone: 40,
  });

  const [pendingScrollEntryId, setPendingScrollEntryId] = useState<
    string | null
  >(null);
  const clearPendingScrollEntryId = useCallback(() => {
    setPendingScrollEntryId(null);
  }, []);
  const triggerSelectionMode = useCallback(() => {
    setSelectionModeTrigger((value) => value + 1);
  }, []);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [terminalPendingCommand, setTerminalPendingCommand] = useState<
    string | null
  >(null);
  const handleBuiltinTerminalDisabled = useCallback(() => {
    setShowTerminal(false);
  }, []);
  useEffect(() => {
    if (standaloneDatasetRuntime) {
      setSourceOptions([]);
      return;
    }

    void listSupportedSessionProviders().then((items) => {
      setSourceOptions(
        items.map((item) => ({ slug: item.slug, label: item.display_name })),
      );
    });
  }, [standaloneDatasetRuntime]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "psm-source-filter-slugs",
        JSON.stringify(sourceFilterSlugs),
      );
    } catch {}
  }, [sourceFilterSlugs]);
  const { isInitialized, terminalConfig, reloadTerminalConfig } =
    useAppBootstrap({
      loadSessions,
      loadSettings,
      patchSessions,
      onBuiltinTerminalDisabled: handleBuiltinTerminalDisabled,
    });

  // Signal frontend ready to native shell (prevents white flash)
  useEffect(() => {
    if (
      isInitialized &&
      !settingsLoading &&
      isTauri() &&
      !frontendReadyEmittedRef.current
    ) {
      frontendReadyEmittedRef.current = true;
      import('@tauri-apps/api/event').then(({ emit }) => {
        emit('frontend://ready');
      });
    }
  }, [isInitialized, settingsLoading]);
  const {
    favorites,
    loadingFavorites,
    loadFavorites,
    removeFavorite,
    toggleFavorite,
  } = useFavorites({ enabled: isInitialized });
  const { updateInfo, closeUpdateNotice, openUpdateReleasePage } =
    useUpdateChecker();
  useAppUiEffects({
    isMobile,
    showExportDialog,
    showConvertDialog,
    showConvertResultDialog: !!convertResult,
    showRenameDialog,
    showForkDialog,
    hasPendingDeleteSession: false,
    showSettings,
    showOnboarding,
    mobileTab,
    pendingScrollEntryId,
    selectedSession,
    clearPendingScrollEntryId,
  });

  const handleSelectSession = useCallback(
    (session: SessionInfo) => {
      setSelectedSession(session);
      clearBadge(session.id);
      navigateToSession(session.id);
    },
    [setSelectedSession, navigateToSession, clearBadge],
  );

  const buildResumeCommand = useCallback(
    (session: SessionInfo) =>
      buildPiResumeCommand(session, {
        piPath,
        resumeCommand,
      }),
    [piPath, resumeCommand],
  );

  const openResumeCommandInTerminal = useCallback(
    async (path: string, cwd: string, commandOverride?: string | null) => {
      if (!isTauri()) {
        setTerminalPendingCommand(commandOverride || "");
        setShowTerminal(true);
        return;
      }
      try {
        await invoke("open_session_in_terminal", {
          path,
          cwd,
          terminal: terminal === "custom" ? customCommand : terminal,
          piPath: piPath || null,
          resumeCommand: commandOverride || resumeCommand || null,
        });
      } catch (err) {
        console.error("Failed to resume session:", err);
        throw err;
      }
    },
    [terminal, customCommand, piPath, resumeCommand],
  );

  const handleResumeSessionWithTarget = useCallback(
    async (session: SessionInfo, target: SessionConvertTarget) => {
      const sourceSlug = getSessionSourceSlug(session.path);
      if ((!sourceSlug || sourceSlug === "pi") && target === "pi") {
        const command = isTauri() ? null : buildResumeCommand(session);
        await openResumeCommandInTerminal(session.path, session.cwd, command);
        return;
      }

      const result = await invoke<import("./types").SessionConvertResult>(
        "convert_session_format",
        {
          path: session.path,
          targetFormat: target,
          dryRun: false,
          force: false,
        },
      );
      const writtenPath = result.written_paths[0] || session.path;
      await openResumeCommandInTerminal(
        writtenPath,
        session.cwd,
        result.resume_command || null,
      );
    },
    [buildResumeCommand, openResumeCommandInTerminal],
  );

  const requestResumeSession = useCallback(
    async (session: SessionInfo) => {
      const configuredTarget = getConfiguredExternalResumeTarget();
      navigateToSession(session.id);
      if (!configuredTarget) {
        setResumeDialogMode("resume");
        setShowResumeDialog(true);
        return;
      }
      await handleResumeSessionWithTarget(session, configuredTarget);
    },
    [handleResumeSessionWithTarget],
  );

  const handleCopyResumeCommandWithTarget = useCallback(
    async (session: SessionInfo, target: SessionConvertTarget) => {
      const command = await buildCopyResumeCommandForTarget(session, target, {
        piPath,
        resumeCommand,
      });
      await copyText(command);
    },
    [copyText, piPath, resumeCommand],
  );

  const requestCopyResumeCommand = useCallback(
    async (session: SessionInfo) => {
      const configuredTarget = getConfiguredExternalResumeTarget();
      navigateToSession(session.id);
      if (!configuredTarget) {
        setResumeDialogMode("copy");
        setShowResumeDialog(true);
        return;
      }
      await handleCopyResumeCommandWithTarget(session, configuredTarget);
    },
    [handleCopyResumeCommandWithTarget],
  );

  const handleNewSession = useCallback(
    async (cwd: string) => {
      if (!isTauri()) {
        setTerminalPendingCommand(cwd ? `cd "${cwd}" && pi` : "pi");
        setShowTerminal(true);
        return;
      }
      // Build new session command: cd to folder, then pi (no --session)
      const piCommand = piPath || "pi";
      const command = cwd ? `cd "${cwd}" && ${piCommand}` : piCommand;
      try {
        await invoke("open_session_in_terminal", {
          path: "",
          cwd: cwd || "",
          terminal: terminal === "custom" ? customCommand : terminal,
          piPath: piPath || null,
          resumeCommand: command,
        });
      } catch (err) {
        console.error("Failed to open new session in terminal:", err);
        throw err;
      }
    },
    [terminal, customCommand, piPath],
  );

  const handleResumeSession = useCallback(async () => {
    if (!selectedSession) return;
    await requestResumeSession(selectedSession);
  }, [selectedSession, requestResumeSession]);

  const handleExportAndOpen = useCallback(async () => {
    if (!selectedSession || !isTauri()) return;
    try {
      await invoke("open_session_in_browser", { path: selectedSession.path });
    } catch (err) {
      console.error("Failed to export and open session:", err);
    }
  }, [selectedSession]);

  const isBlockingShortcutOverlayOpen =
    showSettings ||
    showExportDialog ||
    showConvertDialog ||
    showResumeDialog ||
    !!convertResult ||
    showRenameDialog ||
    showForkDialog ||
    showOnboarding ||
    showTerminal;

  const shortcuts = useMemo(
    () => ({
      ...(standaloneDatasetRuntime
        ? {}
        : {
            "cmd+r": handleResumeSession,
            "cmd+e": handleExportAndOpen,
            "cmd+backspace": () => {
              if (!selectedSession || isBlockingShortcutOverlayOpen) {
                return;
              }

              void handleDeleteSession(selectedSession);
            },
          }),
      "cmd+l": () => {
        setSidebarMode("list");
        setActiveAppViewId(null);
        setSelectedProject(null);
        setShowFavorites(false);
        navigateToSessions();
      },
      "cmd+p": () => {
        setSidebarMode("project");
        setActiveAppViewId(null);
        setSelectedProject(null);
        setShowFavorites(false);
        navigateToSessions();
      },
      ...appViewShortcuts,
      "cmd+,": () => setShowSettings(true),
      "cmd+`": () => {
        if (!standaloneDatasetRuntime && terminalConfig.enabled) {
          setShowTerminal((v) => !v);
        }
      },
      "cmd+shift+i": async () => {
        if (isTauri()) {
          await invoke("toggle_devtools");
        }
      },
      "f12": async () => {
        if (isTauri()) {
          await invoke("toggle_devtools");
        }
      },
      escape: () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (showExportDialog) {
          setShowExportDialog(false);
        } else if (showConvertDialog) {
          setShowConvertDialog(false);
        } else if (showResumeDialog) {
          setShowResumeDialog(false);
        } else if (convertResult) {
          setConvertResult(null);
        } else if (showRenameDialog) {
          setShowRenameDialog(false);
        } else if (showForkDialog) {
          setShowForkDialog(false);
        } else if (showTerminal) {
          if (terminalMaximized) {
            setTerminalMaximized(false);
          } else {
            setShowTerminal(false);
          }
        } else if (selectedProject) {
          setSelectedProject(null);
          navigateToSessions();
        } else {
          navigateToSessions();
        }
      },
    }),
    [
      showSettings,
      showExportDialog,
      showConvertDialog,
      showResumeDialog,
      convertResult,
      showRenameDialog,
      showForkDialog,
      showTerminal,
      terminalMaximized,
      selectedProject,
      selectedSession,
      setSelectedSession,
      handleResumeSession,
      handleExportAndOpen,
      handleDeleteSession,
      isBlockingShortcutOverlayOpen,
      standaloneDatasetRuntime,
      terminalConfig.enabled,
      navigateToSessions,
      appViewShortcuts,
    ],
  );

  const shouldHandleGlobalShortcutEvent = useCallback(() => {
    return true;
  }, []);

  useKeyboardShortcuts(shortcuts, {
    shouldHandleEvent: shouldHandleGlobalShortcutEvent,
    allowInTextEntry: shortcutsAllowedInTextEntry,
  });

  // Wrap setSelectedSession to also update URL
  const selectSessionAndNavigate = useCallback(
    (session: SessionInfo | null) => {
      setSelectedSession(session);
      if (session) navigateToSession(session.id);
    },
    [setSelectedSession, navigateToSession],
  );

  const commandContext = useMemo<SearchContext>(
    () => ({
      sessions,
      selectedProject,
      selectedSession,
      setSelectedSession: selectSessionAndNavigate,
      setSelectedProject,
      setViewMode: setSidebarMode,
      openAppView: openPluginAppViewById,
      closeCommandMenu: () => {},
      setPendingScrollEntryId,
      searchCurrentProjectOnly: false,
      t,
    }),
    [
      sessions,
      selectedProject,
      selectedSession,
      t,
      selectSessionAndNavigate,
      openPluginAppViewById,
      setPendingScrollEntryId,
    ],
  );

  const {
    filteredSessions,
    sidebarSessions,
    sidebarLoading,
    sidebarLoadingMore,
    sidebarHasMore,
    loadMoreSidebarSessions,
    selectedProjectSummary,
    sessionListCommonProps,
    handleToggleSessionTag,
  } = useSidebarSessions({
    sessions,
    loading,
    selectedSession,
    selectedProject,
    isMobile,
    mobileTab,
    viewMode: sidebarMode,
    showFavorites,
    sidebarSearchQuery,
    filterTagIds,
    sourceFilterSlugs,
    modelFilter,
    dateRange,
    sessionTags,
    getDescendantIds,
    onSelectSession: handleSelectSession,
    onDeleteSession: handleDeleteSession,
    onDeleteSessions: handleDeleteSessionsWithRef,
    onConvertSession: async (session) => {
      navigateToSession(session.id);
      setShowConvertDialog(true);
    },
    onResumeSession: requestResumeSession,
    onCopyResumeSession: requestCopyResumeCommand,
    getBadgeType,
    terminal,
    piPath,
    customCommand,
    sortBy: sessionSortBy,
    sortOrder: sessionSortOrder,
    favorites,
    onToggleFavorite: toggleFavorite,
    tags,
    getTagsForSession,
    assignTag,
    removeTagFromSession,
    createTag,
    selectionModeTrigger,
    liveSessionIds,
  });

  const runtimeSessionListCommonProps = useMemo(
    () =>
      standaloneDatasetRuntime
        ? {
            ...sessionListCommonProps,
            onDeleteSession: undefined,
            onDeleteSessions: undefined,
            onConvertSession: undefined,
            onResumeSession: undefined,
            onCopyResumeSession: undefined,
            terminal: undefined,
            piPath: undefined,
            customCommand: undefined,
            resumeCommand: undefined,
            liveSessionIds: undefined,
          }
        : sessionListCommonProps,
    [sessionListCommonProps, standaloneDatasetRuntime],
  );

  const onRenameSession = async (newName: string) => {
    if (!selectedSession) return;
    await handleRenameSession(selectedSession, newName);
    setShowRenameDialog(false);
  };

  const onForkSession = async (targetName?: string) => {
    if (!selectedSession) return;
    const newSession = await forkSession(selectedSession.path, targetName);
    if (newSession) {
      navigateToSession(newSession.id);
      setShowForkDialog(false);
      // Open terminal with `pi --fork <path>` just like resume opens with `--session`
      const forkCommand = buildPiForkCommand(newSession, {
        piPath,
        resumeCommand,
      });
      await openResumeCommandInTerminal(
        newSession.path,
        newSession.cwd,
        forkCommand,
      );
    }
  };

  const onExportSession = async (format: "html" | "md" | "json") => {
    if (!selectedSession) return;
    await handleExportSession(selectedSession, format);
    setShowExportDialog(false);
  };

  const onConvertSession = async (
    target: SessionConvertTarget,
    options: { dryRun: boolean; force: boolean },
  ) => {
    if (!selectedSession) return;
    const result = await handleConvertSession(selectedSession, target, options);
    if (result) {
      setConvertResult(result);
    }
    setShowConvertDialog(false);
  };

  const onResumeToTarget = async (target: SessionConvertTarget) => {
    if (!selectedSession) return;
    if (resumeDialogMode === "copy") {
      await handleCopyResumeCommandWithTarget(selectedSession, target);
    } else {
      await handleResumeSessionWithTarget(selectedSession, target);
    }
    setShowResumeDialog(false);
  };

  const handleStartConvertSession = useCallback((session: SessionInfo) => {
    navigateToSession(session.id);
    setShowConvertDialog(true);
  }, [navigateToSession]);

  const handleOpenConvertedPath = useCallback(
    async (path: string) => {
      try {
        await invoke("open_path_in_system", { path });
      } catch (error) {
        console.error("Failed to open converted path:", error);
        alert(`${t("session.convert.openFailed")}: ${error}`);
      }
    },
    [t],
  );

  const handleRunConvertedResume = useCallback(async (command: string) => {
    if (!command) {
      return;
    }
    setTerminalPendingCommand(command);
    setShowTerminal(true);
  }, []);

  const handleConvertAgain = useCallback(() => {
    setConvertResult(null);
    setShowConvertDialog(true);
  }, []);

  // ─── Shared content renderers ───

  const modelOptions = useMemo(() => {
    const models = new Set<string>();
    for (const session of sessions) {
      if (session.model) {
        models.add(session.model);
      }
    }
    return Array.from(models).sort();
  }, [sessions]);

  const pluginSurfaceData = useMemo(
    () => ({
      sessions,
      tags,
      sessionTags,
      selectedSession,
      onSelectSession: handleSelectSession,
      onMoveSession: moveSession,
      getTagsForSession,
      onToggleTag: handleToggleSessionTag,
      onDeleteSession: standaloneDatasetRuntime ? undefined : handleDeleteSession,
      onConvertSession: standaloneDatasetRuntime ? undefined : handleStartConvertSession,
      onResumeSession: standaloneDatasetRuntime ? undefined : requestResumeSession,
      onCopyResumeSession: standaloneDatasetRuntime ? undefined : requestCopyResumeCommand,
      onNewSession: standaloneDatasetRuntime ? undefined : handleNewSession,
      favorites,
      onToggleFavorite: toggleFavorite,
      terminal: standaloneDatasetRuntime ? undefined : terminal,
      piPath: standaloneDatasetRuntime ? undefined : piPath,
      customCommand: standaloneDatasetRuntime ? undefined : customCommand,
      resumeCommand: standaloneDatasetRuntime ? undefined : resumeCommand,
      liveSessionIds,
      onCreateTag: createTag,
      sourceOptions,
      getDescendantIds,
      onClearSelectedSession: () => setSelectedSession(null),
      loading,
    }),
    [
      sessions,
      tags,
      sessionTags,
      selectedSession,
      handleSelectSession,
      moveSession,
      getTagsForSession,
      handleToggleSessionTag,
      standaloneDatasetRuntime,
      handleDeleteSession,
      handleStartConvertSession,
      requestResumeSession,
      requestCopyResumeCommand,
      handleNewSession,
      favorites,
      toggleFavorite,
      terminal,
      piPath,
      customCommand,
      resumeCommand,
      liveSessionIds,
      createTag,
      sourceOptions,
      getDescendantIds,
      setSelectedSession,
      loading,
    ],
  );

  const renderMobileFilterBar = (placeholder?: string, showSort = true) => (
    <AppMobileFilterBar
      searchQuery={sidebarSearchQuery}
      onSearchChange={setSidebarSearchQuery}
      tags={tags}
      sessionTags={sessionTags}
      filterTagIds={filterTagIds}
      onFilterChange={setFilterTagIds}
      sourceOptions={sourceOptions}
      selectedSourceSlugs={sourceFilterSlugs}
      onSourceFilterChange={setSourceFilterSlugs}
      modelOptions={modelOptions}
      selectedModel={modelFilter}
      onModelFilterChange={setModelFilter}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onCreateTag={(name, color, parentId) => {
        void createTag(name, color, undefined, parentId);
      }}
      getDescendantIds={getDescendantIds}
      totalCount={sessions.length}
      filteredCount={filteredSessions.length}
      placeholder={placeholder}
      sortBy={sessionSortBy}
      sortOrder={sessionSortOrder}
      onSortByChange={setSessionSortBy}
      onSortOrderChange={setSessionSortOrder}
      showSort={showSort}
      onSelectModeTrigger={showSort ? triggerSelectionMode : undefined}
    />
  );

  const renderSessionList = () => (
    <AppSessionListPane
      isMobile={isMobile}
      mobileFilterBar={isMobile ? renderMobileFilterBar() : null}
      listScrollRef={listScrollRef}
      sessionListCommonProps={runtimeSessionListCommonProps}
      sidebarSessions={sidebarSessions}
      sidebarLoading={sidebarLoading}
      sidebarHasMore={sidebarHasMore}
      sidebarLoadingMore={sidebarLoadingMore}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      onRefreshMobile={async () => {
        await loadSessions();
        await loadFavorites();
        await loadTags();
      }}
    />
  );

  const renderProjectList = () => (
    <AppProjectListPane
      isMobile={isMobile}
      mobileFilterBar={
        isMobile
          ? renderMobileFilterBar(
              selectedProject
                ? undefined
                : t("common.searchProjectsPlaceholder"),
              !!selectedProject,
            )
          : null
      }
      projectScrollRef={projectScrollRef}
      selectedProject={selectedProject}
      selectedProjectSummary={selectedProjectSummary}
      onBackFromProject={() => { setSelectedProject(null); navigateToSessions(); }}
      backLabel={t("project.list.back", "Back")}
      sessionListCommonProps={runtimeSessionListCommonProps}
      sidebarSessions={sidebarSessions}
      sidebarLoading={sidebarLoading}
      sidebarHasMore={sidebarHasMore}
      sidebarLoadingMore={sidebarLoadingMore}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      filteredSessions={filteredSessions}
      onSelectProject={setSelectedProject}
      loading={loading}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      liveSessionIds={liveSessionIds}
    />
  );

  const renderAppView = () => (
    <AppPluginViewPane viewId={activeAppViewId} fallback={<LoadingSpinner />} />
  );

  const handleDatasetOverviewProjectSelect = (path: string) => {
    setSelectedProject(path);
    if (isMobile) {
      setMobileTab("projects");
      return;
    }
    setActiveAppViewId(null);
    setSidebarMode("project");
    setShowFavorites(false);
  };

  const renderStandaloneDatasetOverview = () => (
    <StandaloneDatasetOverview
      currentDatasetId={standaloneDatasetId || DEFAULT_STANDALONE_DATASET_ID}
      sessions={
        selectedProject
          ? filteredSessions.filter((session) => session.cwd === selectedProject)
          : filteredSessions
      }
      selectedProject={selectedProject}
      loading={loading}
      onManageDatasets={() => setShowSettings(true)}
      onSessionSelect={handleSelectSession}
      onProjectSelect={handleDatasetOverviewProjectSelect}
    />
  );

  const renderDashboard = () => (
    <AppDashboardPane
      fallback={<LoadingSpinner />}
      DashboardComponent={Dashboard}
      sessions={sessions}
      onSessionSelect={handleSelectSession}
      onProjectSelect={handleDatasetOverviewProjectSelect}
      loading={loading}
      liveSessionIds={liveSessionIds}
    />
  );

  const renderSessionViewer = () => (
    <AppSessionViewerPane
      session={selectedSession!}
      onExport={() => setShowExportDialog(true)}
      onConvert={
        standaloneDatasetRuntime ? undefined : () => setShowConvertDialog(true)
      }
      onRename={
        standaloneDatasetRuntime ? undefined : () => setShowRenameDialog(true)
      }
      onFork={
        standaloneDatasetRuntime ? undefined : () => setShowForkDialog(true)
      }
      onBack={() => navigateToSessions()}
      onResumeSession={standaloneDatasetRuntime ? undefined : requestResumeSession}
      onWebResume={
        standaloneDatasetRuntime
          ? undefined
          : () => {
              if (selectedSession) {
                setTerminalPendingCommand(buildResumeCommand(selectedSession));
              }
              setShowTerminal(true);
            }
      }
      terminal={standaloneDatasetRuntime ? undefined : terminal}
      piPath={standaloneDatasetRuntime ? undefined : piPath}
      customCommand={standaloneDatasetRuntime ? undefined : customCommand}
      resumeCommand={standaloneDatasetRuntime ? undefined : resumeCommand}
      initialEntryId={pendingScrollEntryId || undefined}
    />
  );

  const renderSettings = () => (
    <AppSettingsPane
      isOpen={true}
      onClose={() => {
        setMobileTab("list");
        reloadTerminalConfig();
      }}
      fallback={<LoadingSpinner />}
      SettingsPanelComponent={SettingsPanel}
    />
  );

  // ─── Shared overlays ───

  const renderOverlays = () => (
    <AppOverlays
      showExportDialog={showExportDialog}
      showConvertDialog={showConvertDialog}
      showResumeDialog={showResumeDialog}
      resumeDialogMode={resumeDialogMode}
      convertResult={convertResult}
      showRenameDialog={showRenameDialog}
      showForkDialog={showForkDialog}
      showSettings={showSettings}
      showOnboarding={showOnboarding}
      selectedSession={selectedSession}
      commandContext={commandContext}
      onExportSession={onExportSession}
      onConvertSession={onConvertSession}
      onResumeToTarget={onResumeToTarget}
      onRenameSession={onRenameSession}
      onForkSession={onForkSession}
      onCloseExportDialog={() => setShowExportDialog(false)}
      onCloseConvertDialog={() => setShowConvertDialog(false)}
      onCloseResumeDialog={() => setShowResumeDialog(false)}
      onCloseConvertResultDialog={() => setConvertResult(null)}
      onCloseRenameDialog={() => setShowRenameDialog(false)}
      onCloseForkDialog={() => setShowForkDialog(false)}
      onCloseSettings={() => {
        setShowSettings(false);
        reloadTerminalConfig();
      }}
      onCompleteOnboarding={() => {
        localStorage.setItem("onboarding-completed", "true");
        setShowOnboarding(false);
      }}
      onOpenConvertedPath={handleOpenConvertedPath}
      onRunConvertedResume={handleRunConvertedResume}
      onConvertAgain={handleConvertAgain}
      resumeDefaultTarget={getFallbackExternalResumeTarget()}
      SettingsPanel={SettingsPanel}
      CommandPalette={CommandPalette}
    />
  );

  const {
    onSelectListView: handleSidebarSelectListView,
    onSelectProjectView: handleSidebarSelectProjectView,
    onToggleFavorites: handleSidebarToggleFavorites,
    onOpenCommandPalette: handleSidebarOpenCommandPalette,
    onToggleTerminal: handleSidebarToggleTerminal,
    onOpenSettings: handleSidebarOpenSettings,
    onSelectFavoriteProject: handleSelectFavoriteProject,
  } = useDesktopSidebarActions({
    setViewMode: setSidebarMode,
    setActiveAppViewId,
    setSelectedProject,
    setShowFavorites,
    setShowTerminal,
    setShowSettings,
    navigateToSessions,
  });

  // ═══════════════════════════════════
  // Mobile layout: full-screen pages + bottom nav
  // ═══════════════════════════════════
  if (isMobile) {
    return (
      <AppPluginSurfaceDataProvider value={pluginSurfaceData}>
        <AppMobileLayout
          selectedSession={selectedSession}
          mobileViewerRef={mobileViewerRef}
          mobileTab={mobileTab}
          onMobileTabChange={handleMobileTabChange}
          renderSessionViewer={renderSessionViewer}
          renderSessionList={renderSessionList}
          renderProjectList={renderProjectList}
          appViewItems={mobileAppViewItems}
          renderAppView={(viewId) => (
            <AppPluginViewPane viewId={viewId} fallback={<LoadingSpinner />} />
          )}
          renderDashboard={
            standaloneDatasetRuntime
              ? renderStandaloneDatasetOverview
              : renderDashboard
          }
          renderSettings={renderSettings}
          routeSessionPending={pendingSessionRoute || pendingAppRoute}
          renderRouteSessionPending={LoadingSpinner}
          showDashboardTab={!standaloneDatasetRuntime}
          renderOverlays={renderOverlays}
        />
        <UpdateNoticeToast
          update={updateInfo}
          onClose={closeUpdateNotice}
          onOpenRelease={openUpdateReleasePage}
        />
      </AppPluginSurfaceDataProvider>
    );
  }

  const handleSidebarShowDashboard = () => {
    setSidebarMode("list");
    setActiveAppViewId(null);
    setSelectedProject(null);
    setShowFavorites(false);
    setShowSettings(false);
    setShowTerminal(false);
    setSelectedSession(null);
    navigateToSessions();
  };

  const desktopSearchBar =
    sidebarMode === "app" ? null : (
      <AppDesktopSearchBar
        searchQuery={sidebarSearchQuery}
        onSearchChange={setSidebarSearchQuery}
        tags={tags}
        sessionTags={sessionTags}
        filterTagIds={filterTagIds}
        onFilterChange={setFilterTagIds}
        sourceOptions={sourceOptions}
        selectedSourceSlugs={sourceFilterSlugs}
        onSourceFilterChange={setSourceFilterSlugs}
        modelOptions={modelOptions}
        selectedModel={modelFilter}
        onModelFilterChange={setModelFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onCreateTag={(name, color, parentId) => {
          void createTag(name, color, undefined, parentId);
        }}
        getDescendantIds={getDescendantIds}
        totalCount={sessions.length}
        filteredCount={filteredSessions.length}
        sidebarMode={sidebarMode}
        selectedProject={selectedProject}
        sortBy={sessionSortBy}
        sortOrder={sessionSortOrder}
        onSortByChange={setSessionSortBy}
        onSortOrderChange={setSessionSortOrder}
        onSelectModeTrigger={triggerSelectionMode}
      />
    );

  const desktopSidebarContent = (
      <AppDesktopSidebarContent
        showFavorites={showFavorites}
        sidebarMode={sidebarMode}
        activeAppViewId={activeAppViewId}
        sessions={sessions}
      selectedProject={selectedProject}
      selectedSession={selectedSession}
      selectedProjectSummary={selectedProjectSummary}
      filteredSessions={filteredSessions}
      sidebarSessions={sidebarSessions}
      sidebarLoading={sidebarLoading}
      sidebarHasMore={sidebarHasMore}
      sidebarLoadingMore={sidebarLoadingMore}
      loading={loading}
      loadingFavorites={loadingFavorites}
      favorites={favorites}
      getBadgeType={getBadgeType}
      listScrollRef={listScrollRef}
      sessionListCommonProps={runtimeSessionListCommonProps}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      onSelectFavoriteProject={handleSelectFavoriteProject}
      onSelectSession={handleSelectSession}
      onSelectProject={setSelectedProject}
      onRemoveFavorite={removeFavorite}
      onToggleFavorite={toggleFavorite}
      liveSessionIds={liveSessionIds}
    />
  );

  const desktopMainContent = pendingSessionRoute || pendingAppRoute
    ? <LoadingSpinner />
    : resolveDesktopMainContent({
        selectedSession,
        sidebarMode,
        standaloneDatasetRuntime,
        renderSessionViewer,
        renderAppView,
        renderStandaloneDatasetOverview,
        renderDashboard,
      });

  const desktopTerminalPanel = standaloneDatasetRuntime ? null : (
    <AppTerminalPane
      enabled={terminalConfig.enabled}
      fallback={null}
      TerminalPanelComponent={TerminalPanel}
      isOpen={showTerminal}
      onClose={() => {
        setShowTerminal(false);
        setTerminalMaximized(false);
      }}
      onMaximizedChange={setTerminalMaximized}
      cwd={selectedSession?.cwd || selectedProject || sessions[0]?.cwd || "/"}
      defaultShell={terminalConfig.defaultShell}
      fontSize={terminalConfig.fontSize}
      pendingCommand={terminalPendingCommand}
      onCommandConsumed={() => setTerminalPendingCommand(null)}
    />
  );

  // ═══════════════════════════════════
  // Scanning gate: show loading page while initial scan is in progress
  // ═══════════════════════════════════
  const isFirstScanDone = !!localStorage.getItem("onboarding-completed");
  if (showScanningPage && sessions.length === 0 && !isFirstScanDone) {
    return (
      <div className="flex flex-col h-screen-safe bg-background text-foreground items-center justify-center">
        <div className="flex flex-col items-center gap-6" role="status" aria-live="polite">
          {/* Logo with ambient glow */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
            <img
              src="/icon-128.png"
              alt="Pi Session Manager"
              className="relative w-16 h-16 rounded-2xl shadow-lg"
            />
            <div className="absolute -right-1 -bottom-1">
              <Loader2 className="w-5 h-5 animate-spin text-accent" aria-hidden="true" />
            </div>
          </div>
          {/* Text */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">
              {t("app.splash.scanning", "Scanning sessions...")}
            </p>
            <p className="text-xs text-muted-foreground/60">
              {t("app.splash.firstLaunchHint", "This may take a moment on first launch")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════
  // Desktop layout: sidebar + content
  // ═══════════════════════════════════
  return (
    <AppPluginSurfaceDataProvider value={pluginSurfaceData}>
      <div
        className="app-shell flex flex-col h-screen-safe bg-background text-foreground"
        data-runtime={appRuntime}
      >
        <ConnectionBanner />

        {/* Version Downgrade Dialog */}
        {versionDowngradeInfo && (
          <VersionDowngradeDialog
            downgradeInfo={versionDowngradeInfo}
            currentVersion={versionDowngradeInfo.current_app_version}
            onClose={() => setVersionDowngradeInfo(null)}
            onContinue={handleContinueVersionDowngrade}
            onResetComplete={() => {
              setVersionDowngradeInfo(null);
              // Reload the app after reset
              window.location.reload();
            }}
          />
        )}

        <div className="flex flex-1 min-h-0">
          <AppDesktopSidebar
            isTauriRuntime={isTauriRuntime}
            startDragging={startDragging}
            sidebarMode={sidebarMode}
            showFavorites={showFavorites}
            showDashboardButton={!standaloneDatasetRuntime}
            terminalEnabled={!standaloneDatasetRuntime && terminalConfig.enabled}
            showTerminal={showTerminal}
            onShowDashboard={handleSidebarShowDashboard}
            onSelectListView={handleSidebarSelectListView}
            onSelectProjectView={handleSidebarSelectProjectView}
            appViewItems={appViewItems}
            onToggleFavorites={handleSidebarToggleFavorites}
            onOpenCommandPalette={handleSidebarOpenCommandPalette}
            onToggleTerminal={handleSidebarToggleTerminal}
            onOpenSettings={handleSidebarOpenSettings}
            searchBar={desktopSearchBar}
            content={desktopSidebarContent}
            listScrollRef={listScrollRef}
          />

          <AppDesktopContent
            isTauriRuntime={isTauriRuntime}
            showTerminal={showTerminal}
            terminalMaximized={terminalMaximized}
            mainContent={desktopMainContent}
            terminalPanel={desktopTerminalPanel}
          />

          {renderOverlays()}

          {pendingDeleteSession && (
            <DeleteSessionPopover
              sessions={pendingDeleteSession.sessions}
              anchorRef={pendingDeleteSession.anchorRef}
              anchorPoint={pendingDeleteSession.anchorPoint}
              onConfirm={confirmDeleteSession}
              onCancel={cancelDeleteSession}
            />
          )}
        </div>
        <UpdateNoticeToast
          update={updateInfo}
          onClose={closeUpdateNotice}
          onOpenRelease={openUpdateReleasePage}
        />
      </div>
    </AppPluginSurfaceDataProvider>
  );
}

export default App;
