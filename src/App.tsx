import {
  useState,
  useMemo,
  useRef,
  useCallback,
  lazy,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSwipe } from "./hooks/useSwipe";
import { triggerHaptic } from "./utils/haptics";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionBadges } from "./hooks/useSessionBadges";
import { useSessions } from "./hooks/useSessions";
import { useAppSettings } from "./hooks/useAppSettings";
import { useSessionActions } from "./hooks/useSessionActions";
import { useAppearance } from "./hooks/useAppearance";
import { useToolStyles } from "./hooks/useToolStyles";
import { useIsMobile } from "./hooks/useIsMobile";
import { useAppBootstrap } from "./hooks/app/useAppBootstrap";
import { useAppUiEffects } from "./hooks/app/useAppUiEffects";
import { useUpdateChecker } from "./hooks/app/useUpdateChecker";
import { useDesktopSidebarActions } from "./hooks/app/useDesktopSidebarActions";
import { useFavorites } from "./hooks/app/useFavorites";
import { useSidebarSessions } from "./hooks/app/useSidebarSessions";
import { registerBuiltinToolPlugins, registerExtensionToolPlugins } from "./plugins/tools-render";
import ConnectionBanner from "./components/ConnectionBanner";
import UpdateNoticeToast from "./components/UpdateNoticeToast";
import PiLivePanel from "./components/PiLivePanel";
import { useTags } from "./hooks/useTags";
import type { SessionInfo } from "./types";
import type { SearchContext } from "./plugins/types";
import { invoke, isTauri } from "./transport";
import { isDemoModeEnabled } from "./demo";
import { getCachedSettings } from "./utils/settingsApi";
import AppMobileLayout, { type MobileTab } from "./components/app/AppMobileLayout";
import AppDesktopSidebar from "./components/app/AppDesktopSidebar";
import AppDesktopContent from "./components/app/AppDesktopContent";
import AppDesktopSearchBar from "./components/app/AppDesktopSearchBar";
import { usePiLiveSessions } from "./hooks/usePiLiveSessions";
import AppDesktopSidebarContent from "./components/app/AppDesktopSidebarContent";
import AppOverlays from "./components/app/AppOverlays";
import AppSessionListPane from "./components/app/AppSessionListPane";
import AppProjectListPane from "./components/app/AppProjectListPane";
import AppKanbanPane from "./components/app/AppKanbanPane";
import AppDashboardPane from "./components/app/AppDashboardPane";
import AppSessionViewerPane from "./components/app/AppSessionViewerPane";
import AppMobileFilterBar from "./components/app/AppMobileFilterBar";
import AppSettingsPane from "./components/app/AppSettingsPane";
import AppTerminalPane from "./components/app/AppTerminalPane";
import {
  DEFAULT_SESSION_SORT_BY,
  DEFAULT_SESSION_SORT_ORDER,
} from "./types/sessionSort";

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
  "cmd+b",
  "cmd+,",
  "cmd+`",
  "cmd+shift+f",
];

// Lazy load heavy components
const Dashboard = lazy(() => import("./components/Dashboard"));
const KanbanBoard = lazy(() => import("./components/kanban/KanbanBoard"));
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel"));
const TerminalPanel = lazy(() => import("./components/TerminalPanel"));
const CommandPalette = lazy(() =>
  import("./components/command").then((m) => ({ default: m.CommandPalette })),
);

// Loading fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

function App() {
  const { t } = useTranslation();

  // Register tool render plugins
  useEffect(() => {
    registerBuiltinToolPlugins();
    registerExtensionToolPlugins();
  }, []);
  const isMobile = useIsMobile();

  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const listScrollRef = useRef<HTMLDivElement>(null);
  const projectScrollRef = useRef<HTMLDivElement>(null);

  const mobileViewerRef = useRef<HTMLDivElement>(null);

  useSwipe(mobileViewerRef, {
    onSwipeRight: () => {
      triggerHaptic("light");
      setSelectedSession(null);
    },
    threshold: 40,
    edgeZone: 40,
  });

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
  } = useSessions();

  const { terminal, piPath, customCommand, resumeCommand, loadSettings } = useAppSettings();
  const { handleExportSession } = useSessionActions();
  const { getBadgeType, clearBadge } = useSessionBadges(
    sessions,
    selectedSession?.id ?? null,
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
  } = useTags();
  useAppearance();
  useToolStyles();
  const { liveSessionIds } = usePiLiveSessions();

  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "project" | "kanban">(
    () => {
      const saved = getCachedSettings().session?.defaultViewMode;
      return saved === "list"
        ? "list"
        : saved === "kanban"
          ? "kanban"
          : "project";
    },
  );
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [sessionSortBy, setSessionSortBy] = useState(DEFAULT_SESSION_SORT_BY);
  const [sessionSortOrder, setSessionSortOrder] = useState(
    DEFAULT_SESSION_SORT_ORDER,
  );
  const [selectionModeTrigger, setSelectionModeTrigger] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (isDemoModeEnabled()) {
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
  const [showPiLive, setShowPiLive] = useState(false);
  const togglePiLive = useCallback(() => {
    setShowPiLive((prev) => !prev);
    if (showFavorites) setShowFavorites(false);
  }, [showFavorites]);
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
  const { isInitialized, terminalConfig, reloadTerminalConfig } =
    useAppBootstrap({
      loadSessions,
      loadSettings,
      patchSessions,
      onBuiltinTerminalDisabled: handleBuiltinTerminalDisabled,
    });
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
    },
    [setSelectedSession, clearBadge],
  );


  const buildResumeCommand = useCallback(
    (session: SessionInfo) => {
      const pi = piPath || "pi";
      return `cd "${session.cwd}" && ${pi} --session "${session.path}"`;
    },
    [piPath],
  );

  const handleResumeSession = useCallback(async () => {
    if (!selectedSession) return;
    if (!isTauri()) {
      setTerminalPendingCommand(buildResumeCommand(selectedSession));
      setShowTerminal(true);
      return;
    }
    try {
      await invoke("open_session_in_terminal", {
        path: selectedSession.path,
        cwd: selectedSession.cwd,
        terminal: terminal === "custom" ? customCommand : terminal,
        piPath: piPath || null,
        resumeCommand: resumeCommand || null,
      });
    } catch (err) {
      console.error("Failed to resume session:", err);
    }
  }, [selectedSession, terminal, customCommand, piPath, buildResumeCommand]);

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
    showRenameDialog ||
    showForkDialog ||
    showOnboarding ||
    showTerminal;

  const shortcuts = useMemo(
    () => ({
      "cmd+r": handleResumeSession,
      "cmd+e": handleExportAndOpen,
      "cmd+backspace": () => {
        if (!selectedSession || isBlockingShortcutOverlayOpen) {
          return;
        }

        void handleDeleteSession(selectedSession);
      },
      "cmd+l": () => {
        setViewMode("list");
        setSelectedProject(null);
        setShowFavorites(false);
      },
      "cmd+p": () => {
        setViewMode("project");
        setSelectedProject(null);
        setShowFavorites(false);
      },
      "cmd+b": () => {
        setViewMode("kanban");
        setSelectedSession(null);
        setShowFavorites(false);
      },
      "cmd+,": () => setShowSettings(true),
      "cmd+`": () => {
        if (terminalConfig.enabled) setShowTerminal((v) => !v);
      },
      escape: () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (showExportDialog) {
          setShowExportDialog(false);
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
        } else {
          setSelectedSession(null);
        }
      },
    }),
    [
      showSettings,
      showExportDialog,
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
      terminalConfig.enabled,
    ],
  );

  const shouldHandleGlobalShortcutEvent = useCallback(
    () => {
      return true;
    },
    [],
  );

  useKeyboardShortcuts(shortcuts, {
    shouldHandleEvent: shouldHandleGlobalShortcutEvent,
    allowInTextEntry: GLOBAL_SHORTCUTS_ALLOWED_IN_TEXT_ENTRY,
  });

  const commandContext = useMemo<SearchContext>(
    () => ({
      sessions,
      selectedProject,
      selectedSession,
      setSelectedSession,
      setSelectedProject,
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
      setSelectedSession,
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
    viewMode,
    showFavorites,
    sidebarSearchQuery,
    filterTagIds,
    sessionTags,
    getDescendantIds,
    onSelectSession: handleSelectSession,
    onDeleteSession: handleDeleteSession,
    onDeleteSessions: handleDeleteSessions,
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

  const onRenameSession = async (newName: string) => {
    if (!selectedSession) return;
    await handleRenameSession(selectedSession, newName);
    setShowRenameDialog(false);
  };

  const onForkSession = async (targetName?: string) => {
    if (!selectedSession) return;
    const newSession = await forkSession(selectedSession.path, targetName);
    if (newSession) {
      setSelectedSession(newSession);
      setShowForkDialog(false);
    }
  };

  const onExportSession = async (format: "html" | "md" | "json") => {
    if (!selectedSession) return;
    await handleExportSession(selectedSession, format);
    setShowExportDialog(false);
  };

  // ─── Shared content renderers ───

  const renderMobileFilterBar = (placeholder?: string, showSort = true) => (
    <AppMobileFilterBar
      searchQuery={sidebarSearchQuery}
      onSearchChange={setSidebarSearchQuery}
      tags={tags}
      sessionTags={sessionTags}
      filterTagIds={filterTagIds}
      onFilterChange={setFilterTagIds}
      onCreateTag={(name, color, parentId) => {
        void createTag(name, color, undefined, parentId);
      }}
      getDescendantIds={getDescendantIds}
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
      sessionListCommonProps={sessionListCommonProps}
      sidebarSessions={sidebarSessions}
      sidebarLoading={sidebarLoading}
      sidebarHasMore={sidebarHasMore}
      sidebarLoadingMore={sidebarLoadingMore}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      onRefreshMobile={async () => {
        await loadSessions();
        await loadFavorites();
      }}
    />
  );

  const renderProjectList = () => (
    <AppProjectListPane
      isMobile={isMobile}
      mobileFilterBar={
        isMobile
          ? renderMobileFilterBar(
              selectedProject ? undefined : t("common.searchProjectsPlaceholder"),
              !!selectedProject,
            )
          : null
      }
      projectScrollRef={projectScrollRef}
      selectedProject={selectedProject}
      selectedProjectSummary={selectedProjectSummary}
      onBackFromProject={() => setSelectedProject(null)}
      backLabel={t("project.list.back", "Back")}
      sessionListCommonProps={sessionListCommonProps}
      sidebarSessions={sidebarSessions}
      sidebarLoading={sidebarLoading}
      sidebarHasMore={sidebarHasMore}
      sidebarLoadingMore={sidebarLoadingMore}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      filteredSessions={filteredSessions}
      selectedSession={selectedSession}
      onSelectSession={handleSelectSession}
      onSelectProject={setSelectedProject}
      onDeleteSession={handleDeleteSession}
      loading={loading}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      getBadgeType={getBadgeType}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
    />
  );

  const renderKanban = () => (
    <AppKanbanPane
      fallback={<LoadingSpinner />}
      KanbanBoardComponent={KanbanBoard}
      sessions={filteredSessions}
      tags={tags}
      sessionTags={sessionTags}
      selectedSession={selectedSession}
      onSelectSession={handleSelectSession}
      onMoveSession={moveSession}
      getTagsForSession={getTagsForSession}
      onToggleTag={handleToggleSessionTag}
      onDeleteSession={handleDeleteSession}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      onCreateTag={createTag}
      projectFilter={selectedProject}
      filterTagIds={filterTagIds}
      onFilterChange={setFilterTagIds}
      getDescendantIds={getDescendantIds}
    />
  );

  const handleDashboardProjectSelect = (path: string) => {
    setSelectedProject(path);
    if (isMobile) {
      setMobileTab("projects");
      return;
    }
    setViewMode("project");
    setShowFavorites(false);
  };

  const renderDashboard = () => (
    <AppDashboardPane
      fallback={<LoadingSpinner />}
      DashboardComponent={Dashboard}
      sessions={
        selectedProject
          ? sessions.filter((s) => s.cwd === selectedProject)
          : sessions
      }
      onSessionSelect={setSelectedSession}
      onProjectSelect={handleDashboardProjectSelect}
      projectName={selectedProject || undefined}
      loading={loading}
    />
  );

  const renderSessionViewer = () => (
    <AppSessionViewerPane
      session={selectedSession!}
      onExport={() => setShowExportDialog(true)}
      onRename={() => setShowRenameDialog(true)}
      onFork={() => setShowForkDialog(true)}
      onBack={() => setSelectedSession(null)}
      onWebResume={() => {
        if (selectedSession) {
          setTerminalPendingCommand(buildResumeCommand(selectedSession));
        }
        setShowTerminal(true);
      }}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
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
      showRenameDialog={showRenameDialog}
      showForkDialog={showForkDialog}
      showSettings={showSettings}
      showOnboarding={showOnboarding}
      selectedSession={selectedSession}
      commandContext={commandContext}
      onExportSession={onExportSession}
      onRenameSession={onRenameSession}
      onForkSession={onForkSession}
      onCloseExportDialog={() => setShowExportDialog(false)}
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
      SettingsPanel={SettingsPanel}
      CommandPalette={CommandPalette}
    />
  );

  const {
    onSelectListView: handleSidebarSelectListView,
    onSelectProjectView: handleSidebarSelectProjectView,
    onSelectKanbanView: handleSidebarSelectKanbanView,
    onToggleFavorites: handleSidebarToggleFavorites,
    onOpenCommandPalette: handleSidebarOpenCommandPalette,
    onToggleTerminal: handleSidebarToggleTerminal,
    onOpenSettings: handleSidebarOpenSettings,
    onSelectKanbanFilterProject: handleSelectKanbanFilterProject,
    onSelectFavoriteProject: handleSelectFavoriteProject,
  } = useDesktopSidebarActions({
    setViewMode,
    setSelectedProject,
    setSelectedSession,
    setShowFavorites,
    setShowTerminal,
    setShowSettings,
  });

  // ═══════════════════════════════════
  // Mobile layout: full-screen pages + bottom nav
  // ═══════════════════════════════════
  if (isMobile) {
    return (
      <>
        <AppMobileLayout
          selectedSession={selectedSession}
          mobileViewerRef={mobileViewerRef}
          mobileTab={mobileTab}
          onMobileTabChange={setMobileTab}
          renderSessionViewer={renderSessionViewer}
          renderSessionList={renderSessionList}
          renderProjectList={renderProjectList}
          renderKanban={renderKanban}
          renderDashboard={renderDashboard}
          renderSettings={renderSettings}
          renderOverlays={renderOverlays}
        />
        <UpdateNoticeToast
          update={updateInfo}
          onClose={closeUpdateNotice}
          onOpenRelease={openUpdateReleasePage}
        />
      </>
    );
  }

  const handleSidebarShowDashboard = () => {
    setSelectedSession(null);
  };

  const desktopSearchBar = (
    <AppDesktopSearchBar
      searchQuery={sidebarSearchQuery}
      onSearchChange={setSidebarSearchQuery}
      tags={tags}
      sessionTags={sessionTags}
      filterTagIds={filterTagIds}
      onFilterChange={setFilterTagIds}
      onCreateTag={(name, color, parentId) => {
        void createTag(name, color, undefined, parentId);
      }}
      getDescendantIds={getDescendantIds}
      viewMode={viewMode}
      selectedProject={selectedProject}
      sortBy={sessionSortBy}
      sortOrder={sessionSortOrder}
      onSortByChange={setSessionSortBy}
      onSortOrderChange={setSessionSortOrder}
      onSelectModeTrigger={triggerSelectionMode}
    />
  );

  const desktopSidebarContent = showPiLive
    ? (<PiLivePanel />)
    : (
    <AppDesktopSidebarContent
      showFavorites={showFavorites}
      viewMode={viewMode}
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
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      getBadgeType={getBadgeType}
      listScrollRef={listScrollRef}
      sessionListCommonProps={sessionListCommonProps}
      onLoadMoreSidebarSessions={loadMoreSidebarSessions}
      onSelectKanbanFilterProject={handleSelectKanbanFilterProject}
      onSelectFavoriteProject={handleSelectFavoriteProject}
      onSelectSession={handleSelectSession}
      onSelectProject={setSelectedProject}
      onDeleteSession={handleDeleteSession}
      onRemoveFavorite={removeFavorite}
      onToggleFavorite={toggleFavorite}
    />
  );

  const desktopMainContent = selectedSession
    ? renderSessionViewer()
    : viewMode === "kanban"
      ? renderKanban()
      : renderDashboard();

  const desktopTerminalPanel = (
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
  // Desktop layout: sidebar + content
  // ═══════════════════════════════════
  return (
    <div className="flex flex-col h-screen-safe bg-background text-foreground">
      <ConnectionBanner />
      <div className="flex flex-1 min-h-0">
        <AppDesktopSidebar
          isTauriRuntime={isTauri()}
          startDragging={startDragging}
          viewMode={viewMode}
          showFavorites={showFavorites}
          terminalEnabled={terminalConfig.enabled}
          showTerminal={showTerminal}
          showPiLive={showPiLive}
          onTogglePiLive={togglePiLive}
          onShowDashboard={handleSidebarShowDashboard}
          onSelectListView={handleSidebarSelectListView}
          onSelectProjectView={handleSidebarSelectProjectView}
          onSelectKanbanView={handleSidebarSelectKanbanView}
          onToggleFavorites={handleSidebarToggleFavorites}
          onOpenCommandPalette={handleSidebarOpenCommandPalette}
          onToggleTerminal={handleSidebarToggleTerminal}
          onOpenSettings={handleSidebarOpenSettings}
          searchBar={desktopSearchBar}
          content={desktopSidebarContent}
          listScrollRef={listScrollRef}
        />

        <AppDesktopContent
          isTauriRuntime={isTauri()}
          showTerminal={showTerminal}
          terminalMaximized={terminalMaximized}
          mainContent={desktopMainContent}
          terminalPanel={desktopTerminalPanel}
        />

        {renderOverlays()}
      </div>
      <UpdateNoticeToast
        update={updateInfo}
        onClose={closeUpdateNotice}
        onOpenRelease={openUpdateReleasePage}
      />
    </div>
  );
}

export default App;
