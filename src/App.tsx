import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  lazy,
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
import { useIsMobile } from "./hooks/useIsMobile";
import { useAppBootstrap } from "./hooks/app/useAppBootstrap";
import { useDesktopSidebarActions } from "./hooks/app/useDesktopSidebarActions";
import { useFavorites } from "./hooks/app/useFavorites";
import { useSidebarSessions } from "./hooks/app/useSidebarSessions";
import ConnectionBanner from "./components/ConnectionBanner";
import { useTags } from "./hooks/useTags";
import type { SessionInfo } from "./types";
import type { SearchContext } from "./plugins/types";
import { invoke, isTauri } from "./transport";
import { getCachedSettings } from "./utils/settingsApi";
import AppMobileLayout, { type MobileTab } from "./components/app/AppMobileLayout";
import AppDesktopSidebar from "./components/app/AppDesktopSidebar";
import AppDesktopContent from "./components/app/AppDesktopContent";
import AppDesktopSearchBar from "./components/app/AppDesktopSearchBar";
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

const startDragging = () => {
  if (isTauri()) {
    getCurrentWindow().startDragging();
  }
};

// Lazy load heavy components
const Dashboard = lazy(() => import("./components/Dashboard"));
const KanbanBoard = lazy(() => import("./components/kanban/KanbanBoard"));
const SettingsPanel = lazy(() => import("./components/settings/SettingsPanel"));
const TerminalPanel = lazy(() => import("./components/TerminalPanel"));
const FullTextSearch = lazy(() => import("./components/FullTextSearch"));
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
    pendingDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
    handleRenameSession,
  } = useSessions();

  const { terminal, piPath, customCommand, loadSettings } = useAppSettings();
  const { handleExportSession } = useSessionActions();
  const { getBadgeType, clearBadge } = useSessionBadges(sessions);
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
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem("onboarding-completed");
  });
  const [showTerminal, setShowTerminal] = useState(false);
  const [showFullTextSearch, setShowFullTextSearch] = useState(false);
  const [pendingScrollEntryId, setPendingScrollEntryId] = useState<
    string | null
  >(null);
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

  // Apply body lock when any modal is open on mobile
  useEffect(() => {
    if (!isMobile) return;
    const isAnyModalOpen =
      showExportDialog ||
      showRenameDialog ||
      !!pendingDeleteSession ||
      showSettings ||
      showFullTextSearch ||
      showOnboarding ||
      mobileTab === "settings";

    if (isAnyModalOpen) {
      document.body.classList.add("mobile-modal-open");
    } else {
      document.body.classList.remove("mobile-modal-open");
    }

    return () => {
      document.body.classList.remove("mobile-modal-open");
    };
  }, [
    isMobile,
    showExportDialog,
    showRenameDialog,
    pendingDeleteSession,
    showSettings,
    showFullTextSearch,
    showOnboarding,
    mobileTab,
  ]);

  const reloadTerminalConfig = useCallback(() => {
    try {
      const s = getCachedSettings();
      setTerminalConfig({
        enabled: s.terminal?.builtinTerminalEnabled !== false,
        defaultShell:
          s.terminal?.defaultShell || getPlatformDefaults().defaultShell,
        fontSize: s.terminal?.terminalFontSize || 13,
      });
      if (s.terminal?.builtinTerminalEnabled === false) {
        setShowTerminal(false);
      }
    } catch {}
  }, []);

  const handleSelectSession = useCallback(
    (session: SessionInfo) => {
      setSelectedSession(session);
      clearBadge(session.id);
    },
    [setSelectedSession, clearBadge],
  );

  const handleFTSResultSelect = useCallback(
    (session: SessionInfo, entryId: string) => {
      setSelectedSession(session);
      setPendingScrollEntryId(entryId);
    },
    [setSelectedSession],
  );

  useEffect(() => {
    registerBuiltinPlugins();
    reloadTerminalConfig();

    // Apply appearance settings from cache
    const s = getCachedSettings();
    const root = document.documentElement;
    if (s.appearance) {
      const {
        theme,
        customTheme,
        fontFamily,
        fontFamilyMono,
        sidebarWidth,
        fontSize,
        messageSpacing,
        codeBlockTheme,
      } = s.appearance;
      root.classList.remove("theme-dark", "theme-light");
      if (theme === "dark") {
        root.classList.add("theme-dark");
      } else if (theme === "light") {
        root.classList.add("theme-light");
      }
      // For custom theme, applyPiChatTheme will set the theme class automatically
      if (sidebarWidth)
        root.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
      const fontMap: Record<string, string> = {
        small: "14px",
        medium: "16px",
        large: "18px",
      };
      if (fontSize)
        root.style.setProperty("--font-size-base", fontMap[fontSize] || "16px");
      if (fontFamily) root.style.setProperty("--font-family", fontFamily);
      if (fontFamilyMono)
        root.style.setProperty("--font-family-mono", fontFamilyMono);
      const spacingMap: Record<string, string> = {
        compact: "8px",
        comfortable: "16px",
        spacious: "24px",
      };
      if (messageSpacing)
        root.style.setProperty(
          "--spacing-base",
          spacingMap[messageSpacing] || "16px",
        );
      if (codeBlockTheme) root.setAttribute("data-code-theme", codeBlockTheme);
      applyPiChatTheme(theme === "custom" ? customTheme : "app-default");
    }

    const initialize = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      setIsInitialized(true);
    };

    initialize();
  }, []);

  // F12 to toggle devtools in production builds
  useEffect(() => {
    if (!isTauri()) return;
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        try {
          await invoke("toggle_devtools");
        } catch (error) {
          console.warn("Failed to toggle devtools:", error);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isInitialized || hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    loadSessions();
    loadSettings();
  }, [isInitialized, loadSessions, loadSettings]);

  useFileWatcher({
    enabled: true,
    debounceMs: 2000,
    onDiff: patchSessions,
  });

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
        pi_path: piPath || null,
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

  const shortcuts = useMemo(
    () => ({
      "cmd+r": handleResumeSession,
      "cmd+e": handleExportAndOpen,
      "cmd+p": () => {
        setViewMode("project");
        setSelectedProject(null);
        setShowFavorites(false);
      },
      "cmd+,": () => setShowSettings(true),
      "cmd+`": () => {
        if (terminalConfig.enabled) setShowTerminal((v) => !v);
      },
      "cmd+shift+f": () => setShowFullTextSearch(true),
      escape: () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (showExportDialog) {
          setShowExportDialog(false);
        } else if (showRenameDialog) {
          setShowRenameDialog(false);
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
      showTerminal,
      terminalMaximized,
      selectedProject,
      setSelectedSession,
      handleResumeSession,
      handleExportAndOpen,
      terminalConfig.enabled,
    ],
  );

  useKeyboardShortcuts(shortcuts);

  // Restore browser-like refresh shortcuts (Cmd+Shift+R, F5, Ctrl+Shift+R)
  useEffect(() => {
    const handleRefresh = (e: KeyboardEvent) => {
      const isCmdShiftR =
        (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "r";
      const isF5 = e.key === "F5";
      if (isCmdShiftR || isF5) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleRefresh);
    return () => window.removeEventListener("keydown", handleRefresh);
  }, []);

  // Clear pending scroll entry after it's been passed to SessionViewer
  useEffect(() => {
    if (pendingScrollEntryId && selectedSession) {
      const timer = setTimeout(() => setPendingScrollEntryId(null), 0);
      return () => clearTimeout(timer);
    }
  }, [pendingScrollEntryId, selectedSession]);

  const commandContext = useMemo<SearchContext>(
    () => ({
      sessions,
      selectedProject,
      selectedSession,
      setSelectedSession,
      setSelectedProject,
      closeCommandMenu: () => {},
      searchCurrentProjectOnly: false,
      t,
    }),
    [sessions, selectedProject, selectedSession, t, setSelectedSession],
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
    getBadgeType,
    terminal,
    piPath,
    customCommand,
    favorites,
    onToggleFavorite: toggleFavorite,
    tags,
    getTagsForSession,
    assignTag,
    removeTagFromSession,
    createTag,
  });

  const onRenameSession = async (newName: string) => {
    if (!selectedSession) return;
    await handleRenameSession(selectedSession, newName);
    setShowRenameDialog(false);
  };

  const onExportSession = async (format: "html" | "md" | "json") => {
    if (!selectedSession) return;
    await handleExportSession(selectedSession, format);
    setShowExportDialog(false);
  };

  // ─── Shared content renderers ───

  const renderMobileFilterBar = (placeholder?: string) => (
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
      showSettings={showSettings}
      showFullTextSearch={showFullTextSearch}
      showOnboarding={showOnboarding}
      selectedSession={selectedSession}
      pendingDeleteSession={pendingDeleteSession}
      commandContext={commandContext}
      onExportSession={onExportSession}
      onRenameSession={onRenameSession}
      onCloseExportDialog={() => setShowExportDialog(false)}
      onCloseRenameDialog={() => setShowRenameDialog(false)}
      onConfirmDeleteSession={confirmDeleteSession}
      onCancelDeleteSession={cancelDeleteSession}
      onCloseSettings={() => {
        setShowSettings(false);
        reloadTerminalConfig();
      }}
      onCloseFullTextSearch={() => setShowFullTextSearch(false)}
      onSelectFullTextSearchResult={handleFTSResultSelect}
      onCompleteOnboarding={() => {
        localStorage.setItem("onboarding-completed", "true");
        setShowOnboarding(false);
      }}
      SettingsPanel={SettingsPanel}
      CommandPalette={CommandPalette}
      FullTextSearch={FullTextSearch}
    />
  );

  // ═══════════════════════════════════
  // Mobile layout: full-screen pages + bottom nav
  // ═══════════════════════════════════
  if (isMobile) {
    return (
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
    );
  }

  const handleSidebarShowDashboard = () => {
    setSelectedSession(null);
  };

  const handleSidebarSelectListView = () => {
    setViewMode("list");
    setSelectedProject(null);
    setShowFavorites(false);
  };

  const handleSidebarSelectProjectView = () => {
    setViewMode("project");
    setSelectedProject(null);
    setShowFavorites(false);
  };

  const handleSidebarSelectKanbanView = () => {
    setViewMode("kanban");
    setSelectedSession(null);
    setShowFavorites(false);
  };

  const handleSidebarToggleFavorites = () => {
    setShowFavorites((prev) => !prev);
  };

  const handleSidebarOpenCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true }),
    );
  };

  const handleSidebarToggleTerminal = () => {
    setShowTerminal((prev) => !prev);
  };

  const handleSidebarOpenSettings = () => {
    setShowSettings(true);
  };

  const handleSelectKanbanFilterProject = (project: string | null) => {
    setSelectedProject(project);
    setSelectedSession(null);
  };

  const handleSelectFavoriteProject = (path: string) => {
    setSelectedProject(path);
    setViewMode("project");
    setShowFavorites(false);
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
    />
  );

  const desktopSidebarContent = (
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
    </div>
  );
}

export default App;
