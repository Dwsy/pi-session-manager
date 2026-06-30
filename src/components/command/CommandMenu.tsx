import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  memo,
} from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { SearchPluginResult, SearchContext } from "@/plugins/types";
import { useSearchPlugins } from "@/hooks/useSearchPlugins";
import { psmPluginHost, usePsmPluginCommands } from "@/plugins/runtime-host";
import { getPathBasename } from "@/utils/path";
import { formatSourceFilterToken } from "@/utils/search";
import type { MessageSearchPluginOptions } from "@/plugins/message/MessageSearchPlugin";
import type { FullTextSearchSourceFilter } from "@/types";
import CommandSearchInput from "./CommandSearchInput";
import CommandFilterBar from "./CommandFilterBar";
import CommandActionList from "./CommandActionList";
import CommandResultList from "./CommandResultList";
import CommandDevPanel from "./CommandDevPanel";
import SessionPreviewPanel from "./SessionPreviewPanel";
import type { CommandActionItem, CommandPaletteMode } from "./commandActions";
import { useCommandSearch } from "./hooks/useCommandSearch";
import { TABS, type TabType } from "./utils";

interface CommandMenuProps {
  query: string;
  setQuery: (query: string) => void;
  results: SearchPluginResult[];
  setResults: (results: SearchPluginResult[]) => void;
  isSearching: boolean;
  setIsSearching: (isSearching: boolean) => void;
  context: SearchContext;
  onClose: () => void;
  searchCurrentProjectOnly: boolean;
  setSearchCurrentProjectOnly: (value: boolean) => void;
  ftsOptions: MessageSearchPluginOptions;
  setFtsOptions: (options: MessageSearchPluginOptions) => void;
  selectedResult: SearchPluginResult | null;
  setSelectedResult: (result: SearchPluginResult | null) => void;
  registryRef: React.MutableRefObject<any>;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  mode: CommandPaletteMode;
  setMode: (mode: CommandPaletteMode | ((mode: CommandPaletteMode) => CommandPaletteMode)) => void;
}

// Memoize CommandMenu to prevent unnecessary re-renders when results change
export default memo(function CommandMenu({
  query,
  setQuery,
  results,
  setResults,
  isSearching,
  setIsSearching,
  context,
  onClose,
  searchCurrentProjectOnly,
  setSearchCurrentProjectOnly,
  ftsOptions,
  setFtsOptions,
  selectedResult,
  setSelectedResult,
  registryRef,
  activeTab,
  setActiveTab,
  mode,
  setMode,
}: CommandMenuProps) {
  const { t } = useTranslation();
  const { registry, search } = useSearchPlugins(context);
  const pluginCommands = usePsmPluginCommands();
  const [selectedAction, setSelectedAction] = useState<CommandActionItem | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  const togglePreview = useCallback(() => {
    setPreviewCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    registryRef.current = registry;
  }, [registry, registryRef]);

  const currentProjectName = context.selectedProject
    ? getPathBasename(context.selectedProject)
    : null;

  const {
    normalizedQuery,
    effectiveSortMode,
    isLabelsBrowseMode,
    supportsMessageFilters,
    searchError,
    sourceFilterPaginationEnabled,
    hasMore,
    totalHits,
    isLoadingMore,
    loadMoreError,
    loadMore,
    handleQueryChange,
    applySuggestedSourceFilter,
  } = useCommandSearch({
    query,
    setQuery,
    activeTab,
    ftsOptions,
    setFtsOptions,
    search,
    registry,
    results,
    setResults,
    setIsSearching,
    context,
  });

  const sourceFilterSuggestions = useMemo(() => {
    if (!supportsMessageFilters || !query.startsWith("#") || /\s/.test(query)) {
      return [];
    }

    const prefix = query.toLowerCase();
    const filters: FullTextSearchSourceFilter[] = ["labels_only", "content_only"];
    return filters.filter(
      (value) =>
        formatSourceFilterToken(value).startsWith(prefix) &&
        formatSourceFilterToken(value) !== prefix,
    );
  }, [query, supportsMessageFilters]);

  const groupedResults = useMemo(() => {
    return results.reduce(
      (acc: Record<string, SearchPluginResult[]>, r) => {
        if (!acc[r.pluginId]) acc[r.pluginId] = [];
        acc[r.pluginId].push(r);
        return acc;
      },
      {} as Record<string, SearchPluginResult[]>,
    );
  }, [results]);

  const commandContext = useMemo(() => ({
    selectedProject: context.selectedProject,
    selectedSession: context.selectedSession
      ? {
          path: context.selectedSession.path,
          id: context.selectedSession.id,
          name: context.selectedSession.name,
          cwd: context.selectedSession.cwd,
        }
      : null,
    query,
    closeCommandMenu: onClose,
    navigate: {
      openAppView: context.openAppView,
      openSession: (sessionPath: string) => {
        const session = context.sessions.find((item) => item.path === sessionPath)
        if (session) context.setSelectedSession(session)
      },
      openProject: context.setSelectedProject,
    },
  }), [context, onClose, query]);

  const commandActions = useMemo<CommandActionItem[]>(() => {
    const normalized = query.trim().toLowerCase()
    return pluginCommands
      .map((command): CommandActionItem => {
        let disabledReason: string | undefined
        if (command.scope === 'project' && !context.selectedProject && !context.selectedSession?.cwd) {
          disabledReason = t('command.commands.requiresProject', 'Requires an active project')
        }
        if (command.scope === 'session' && !context.selectedSession) {
          disabledReason = t('command.commands.requiresSession', 'Requires an active session')
        }
        if (!disabledReason && command.when && !command.when(commandContext)) {
          disabledReason = t('command.commands.unavailable', 'Unavailable in the current context')
        }
        return {
          id: command.id,
          title: command.title,
          description: command.description,
          category: command.category ?? command.pluginId,
          pluginId: command.pluginId,
          shortcut: command.shortcut,
          disabled: Boolean(disabledReason),
          disabledReason,
          command,
        }
      })
      .filter((action) => {
        if (!normalized) return true
        const haystack = [
          action.title,
          action.description,
          action.category,
          action.command.id,
          action.pluginId,
          ...(action.command.keywords ?? []),
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(normalized)
      })
  }, [commandContext, context.selectedProject, context.selectedSession, pluginCommands, query, t]);

  const tabCounts = useMemo(() => {
    return TABS.reduce(
      (acc: Record<TabType, number>, tab) => {
        if (tab.id === 'labels') {
          acc[tab.id] = activeTab === 'labels' ? results.length : 0;
          return acc;
        }
        if (tab.id === 'message') {
          acc[tab.id] = activeTab === 'labels' ? 0 : groupedResults[tab.pluginId!]?.length || 0;
          return acc;
        }
        acc[tab.id] = tab.pluginId
          ? groupedResults[tab.pluginId]?.length || 0
          : results.length;
        return acc;
      },
      {} as Record<TabType, number>,
    );
  }, [activeTab, groupedResults, results.length]);

  const selectedPlugin = selectedResult
    ? registry.get(selectedResult.pluginId)
    : null;

  const handleActiveTabChange = useCallback((nextTab: TabType) => {
    const sourceFilter: FullTextSearchSourceFilter =
      nextTab === 'labels'
        ? 'labels_only'
        : nextTab === 'message'
          ? 'content_only'
          : 'all';
    setActiveTab(nextTab);
    setFtsOptions({ ...ftsOptions, sourceFilter, page: 0 });
  }, [ftsOptions, setActiveTab, setFtsOptions]);

  const handleSelect = useCallback(() => {
    if (!selectedResult || !selectedPlugin) return;

    selectedPlugin.onSelect(selectedResult, context);
    onClose();
  }, [selectedResult, selectedPlugin, context, onClose]);

  const handleRunCommand = useCallback(() => {
    const action = selectedAction;
    if (!action || action.disabled) return;
    setCommandError(null);
    onClose();
    void psmPluginHost.executeCommand(action.command.id, {}, commandContext).catch((error) => {
      console.error("[PSM plugins] Failed to execute command:", error);
    });
  }, [commandContext, onClose, selectedAction]);

  useEffect(() => {
    if (mode !== 'commands') return;
    setSelectedAction(commandActions[0] ?? null);
  }, [commandActions, mode]);

  const inputPlaceholder =
    mode === 'commands'
      ? t("command.commands.placeholder", "Search plugin commands...")
      : mode === 'dev'
      ? t("command.dev.placeholder", "Inspect dev plugins...")
      : isLabelsBrowseMode
      ? t("search.fullText.labelsPlaceholder", "Browse all labels...")
      : activeTab === 'message'
      ? t("search.fullText.messagesPlaceholder", "Search messages...")
      : t("command.placeholder", "Search sessions, projects, messages...");

  const cycleMode = useCallback((direction: 1 | -1 = 1) => {
    const modes: CommandPaletteMode[] = ['search', 'commands', 'dev'];
    setMode((value) => {
      const index = modes.indexOf(value);
      return modes[(index + direction + modes.length) % modes.length];
    });
    setCommandError(null);
  }, [setMode]);

  const handleInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (
        mode === 'search' &&
        sourceFilterSuggestions.length > 0 &&
        (event.key === "Tab" || event.key === "Enter")
      ) {
        event.preventDefault();
        applySuggestedSourceFilter(sourceFilterSuggestions[0]);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        cycleMode(event.shiftKey ? -1 : 1);
        return;
      }

      if (mode === 'commands' && (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        if (event.key === 'Enter') {
          void handleRunCommand();
          return;
        }
        const currentIndex = selectedAction
          ? commandActions.findIndex((action) => action.id === selectedAction.id)
          : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = commandActions.length === 0
          ? -1
          : (currentIndex + delta + commandActions.length) % commandActions.length;
        setSelectedAction(nextIndex >= 0 ? commandActions[nextIndex] : null);
      }
    },
    [applySuggestedSourceFilter, commandActions, cycleMode, handleRunCommand, mode, selectedAction, sourceFilterSuggestions],
  );

  useEffect(() => {
    if (mode !== 'commands') return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.key === 'Enter') {
          handleRunCommand();
          return;
        }
        const currentIndex = selectedAction
          ? commandActions.findIndex((action) => action.id === selectedAction.id)
          : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = commandActions.length === 0
          ? -1
          : (currentIndex + delta + commandActions.length) % commandActions.length;
        setSelectedAction(nextIndex >= 0 ? commandActions[nextIndex] : null);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [commandActions, handleRunCommand, mode, selectedAction]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-background">
      <div className="px-5 pt-5 pb-4 border-b border-border/80 bg-background/95 flex-shrink-0">
        <CommandSearchInput
          query={query}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          isSearching={isSearching}
          sourceFilterSuggestions={sourceFilterSuggestions}
          onApplySuggestion={applySuggestedSourceFilter}
          currentProjectName={currentProjectName}
          searchCurrentProjectOnly={searchCurrentProjectOnly}
          setSearchCurrentProjectOnly={setSearchCurrentProjectOnly}
          inputPlaceholder={inputPlaceholder}
        />

        <CommandFilterBar
          mode={mode}
          setMode={setMode}
          activeTab={activeTab}
          setActiveTab={handleActiveTabChange}
          tabCounts={tabCounts}
          supportsMessageFilters={supportsMessageFilters}
          ftsOptions={ftsOptions}
          setFtsOptions={setFtsOptions}
          effectiveSortMode={effectiveSortMode}
        />
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          className={`${previewCollapsed || mode !== 'search' ? "flex-1 w-auto" : "w-[400px] flex-shrink-0"} border-r border-border/70 flex flex-col h-full overflow-hidden bg-surface/[0.22]`}
        >
          {mode === 'commands' ? (
            <CommandActionList
              actions={commandActions}
              query={query}
              selectedAction={selectedAction}
              setSelectedAction={setSelectedAction}
              error={commandError}
            />
          ) : mode === 'dev' ? (
            <CommandDevPanel />
          ) : (
            <CommandResultList
              results={results}
              isSearching={isSearching}
              searchError={searchError}
              normalizedQuery={normalizedQuery}
              isLabelsBrowseMode={isLabelsBrowseMode}
              activeTab={activeTab}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              registry={registry}
              sourceFilterPaginationEnabled={sourceFilterPaginationEnabled}
              hasMore={hasMore}
              totalHits={totalHits}
              isLoadingMore={isLoadingMore}
              loadMoreError={loadMoreError}
              loadMore={loadMore}
            />
          )}
        </div>
        <div
          className={`${previewCollapsed || mode !== 'search' ? "flex-none w-0" : "flex-1 w-auto"} h-full min-h-0 overflow-hidden bg-background motion-layout`}
        >
          {!previewCollapsed && mode === 'search' && (
            <SessionPreviewPanel
              result={selectedResult}
              context={context}
              onClose={onClose}
              onNavigate={handleSelect}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-border/70 bg-background flex-shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1">
            <kbd className="text-[10px] font-mono">Tab</kbd>
            <span className="text-[11px]">
              {mode === 'search'
                ? t("command.actions.commands", "Commands")
                : mode === 'commands'
                ? t("command.actions.dev", "Dev")
                : t("command.actions.search", "Search")}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1">
            <kbd className="text-[10px] font-mono">↑↓</kbd>
            <span className="text-[11px]">
              {t("command.actions.navigate", "Navigate")}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1">
            <kbd className="text-[10px] font-mono">↵</kbd>
            <span className="text-[11px]">
              {t("command.actions.open", "Open")}
            </span>
          </div>
          <button
            onClick={togglePreview}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1 hover:bg-surface/60 motion-color"
            title={previewCollapsed ? t("command.actions.showPreview", "Show preview") : t("command.actions.hidePreview", "Hide preview")}
          >
            {previewCollapsed ? (
              <PanelRightOpen className="w-3 h-3" />
            ) : (
              <PanelRightClose className="w-3 h-3" />
            )}
            <span className="text-[11px]">
              {previewCollapsed ? t("command.actions.preview", "Preview") : t("command.actions.hide", "Hide")}
            </span>
          </button>
        </div>
        <button
          onClick={mode === 'commands' ? () => void handleRunCommand() : handleSelect}
          disabled={mode === 'commands' ? !selectedAction || selectedAction.disabled : mode === 'search' ? !selectedResult : true}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium motion-surface motion-color ${
            mode === 'commands' ? selectedAction && !selectedAction.disabled : mode === 'search' ? selectedResult : false
              ? "border-foreground/10 bg-foreground text-background hover:opacity-90"
              : "border-border/60 text-muted-foreground/45 cursor-not-allowed bg-surface/30"
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>{mode === 'commands' ? t("command.actions.run", "Run") : mode === 'dev' ? t("command.actions.inspect", "Inspect") : t("command.actions.go")}</span>
          <kbd
            className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
              mode === 'commands' ? selectedAction && !selectedAction.disabled : mode === 'search' ? selectedResult : false
                ? "bg-background/10 text-background/90"
                : "bg-surface text-muted-foreground/55"
            }`}
          >
            ↵
          </kbd>
        </button>
      </div>
    </div>
  );
})
