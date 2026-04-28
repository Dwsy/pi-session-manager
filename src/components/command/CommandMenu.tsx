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
import { getPathBasename } from "@/utils/path";
import { formatSourceFilterToken } from "@/utils/search";
import type { MessageSearchPluginOptions } from "@/plugins/message/MessageSearchPlugin";
import type { FullTextSearchSourceFilter } from "@/types";
import CommandSearchInput from "./CommandSearchInput";
import CommandFilterBar from "./CommandFilterBar";
import CommandResultList from "./CommandResultList";
import SessionPreviewPanel from "./SessionPreviewPanel";
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
}: CommandMenuProps) {
  const { t } = useTranslation();
  const { registry, search } = useSearchPlugins(context);
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // Collapsible preview panel - persisted to localStorage
  const [previewCollapsed, setPreviewCollapsed] = useState(() => {
    try {
      return localStorage.getItem("command-preview-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const togglePreview = useCallback(() => {
    setPreviewCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("command-preview-collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    registryRef.current = registry;
  }, [registry, registryRef]);

  const currentProjectName = context.selectedProject
    ? getPathBasename(context.selectedProject)
    : null;

  const {
    normalizedQuery,
    effectiveSourceFilter,
    effectiveSortMode,
    isLabelsBrowseMode,
    supportsMessageFilters,
    searchError,
    loadMore,
    handleQueryChange,
    handleSourceFilterChange,
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
    const filters: FullTextSearchSourceFilter[] = [
      "all",
      "labels_only",
      "content_only",
    ];
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

  const tabCounts = useMemo(() => {
    return TABS.reduce(
      (acc: Record<TabType, number>, tab) => {
        acc[tab.id] = tab.pluginId
          ? groupedResults[tab.pluginId]?.length || 0
          : results.length;
        return acc;
      },
      {} as Record<TabType, number>,
    );
  }, [groupedResults, results.length]);

  const selectedPlugin = selectedResult
    ? registry.get(selectedResult.pluginId)
    : null;

  // Check if a result corresponds to the currently active session/project
  const isResultActive = useCallback((result: SearchPluginResult | null): boolean => {
    if (!result) return false;

    if (result.pluginId === 'session-search') {
      const session = result.metadata?.session;
      return session && context.selectedSession?.id === session.id;
    }

    if (result.pluginId === 'message-search') {
      const sessionId = result.metadata?.sessionId;
      return sessionId && context.selectedSession?.id === sessionId;
    }

    if (result.pluginId === 'project-search') {
      const project = result.metadata?.project;
      return project && context.selectedProject === project;
    }

    return false;
  }, [context.selectedSession, context.selectedProject]);

  const handleSelect = useCallback(() => {
    if (!selectedResult || !selectedPlugin) return;

    // If the result is for the currently active session/project, close the menu and navigate
    if (isResultActive(selectedResult)) {
      selectedPlugin.onSelect(selectedResult, context);
      onClose();
    } else {
      // Otherwise, just activate it without closing the menu
      selectedPlugin.onSelect(selectedResult, context);
    }
  }, [selectedResult, selectedPlugin, context, onClose, isResultActive]);

  const inputPlaceholder =
    effectiveSourceFilter === "labels_only"
      ? t("search.fullText.labelsPlaceholder", "Browse all labels...")
      : t("command.placeholder", "Search sessions, projects, messages...");

  const handleInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (
        sourceFilterSuggestions.length > 0 &&
        (event.key === "Tab" || event.key === "Enter")
      ) {
        event.preventDefault();
        applySuggestedSourceFilter(sourceFilterSuggestions[0]);
      }
    },
    [applySuggestedSourceFilter, sourceFilterSuggestions],
  );

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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tabCounts={tabCounts}
          supportsMessageFilters={supportsMessageFilters}
          ftsOptions={ftsOptions}
          setFtsOptions={setFtsOptions}
          effectiveSourceFilter={effectiveSourceFilter}
          onSourceFilterChange={handleSourceFilterChange}
          effectiveSortMode={effectiveSortMode}
        />
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[400px] flex-shrink-0 border-r border-border/70 flex flex-col h-full overflow-hidden bg-surface/[0.22]">
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
            loadMore={loadMore}
          />
        </div>

        <div
          className={`flex-1 h-full min-h-0 overflow-hidden bg-background transition-[width] duration-200 ease-in-out ${previewCollapsed ? "w-0" : "w-auto"}`}
        >
          <SessionPreviewPanel
            result={selectedResult}
            context={context}
            onClose={onClose}
            onNavigate={handleSelect}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-border/70 bg-background flex-shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1 hover:bg-surface/60 motion-color transition-colors"
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
          onClick={handleSelect}
          disabled={!selectedResult}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-all ${
            selectedResult
              ? "border-foreground/10 bg-foreground text-background hover:opacity-90 cursor-pointer"
              : "border-border/60 text-muted-foreground/45 cursor-not-allowed bg-surface/30"
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>{t("command.actions.go")}</span>
          <kbd
            className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
              selectedResult
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
