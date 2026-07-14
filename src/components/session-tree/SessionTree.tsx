import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useSessionTreeLookup } from "@/hooks/useSessionTreeLookup";
import type { SessionEntry } from "@/types";
import { parseQuotedQuery } from "@/utils/search";
import { PluginContributionBoundary, PluginContributionSlot } from "@/plugins/runtime-host";
import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import { getCachedSettings } from "@/utils/settingsApi";
import {
  buildActivePathIds,
  buildTree,
  buildTreePrefix,
  buildVisibleTreeMaps,
  filterCollapsedFlatNodes,
  filterFlatNodes,
  findNewestLeaf,
  flattenTree,
  getEntryDisplayText,
  getEntryRoleClass,
  getEntryToolName,
  getSearchableText,
  isFoldableNode,
  isNoneParent,
  type FlatNode,
} from "@/utils/session-tree";
import {
  createTreeControllerState,
  reduceTreeAction,
  TREE_FILTER_MODES,
  treeKeyToAction,
  type SessionTreeControllerState,
  type TreeAction,
  type TreeFilterMode,
} from "@/utils/sessionTreeController";

import SessionTreeSearch, { type SessionTreeSearchRef } from "./SessionTreeSearch";

const KNOWN_TOOLS = new Set(["read", "edit", "write", "bash", "search", "web_fetch"]);
const TOOL_PALETTE_SIZE = 8;
const FILTER_LABELS: Record<TreeFilterMode, string> = {
  default: "Default",
  "no-tools": "No tools",
  "user-only": "User",
  "labeled-only": "Labeled",
  all: "All",
};

function hashToolName(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getToolColorVar(toolName: string): string {
  if (KNOWN_TOOLS.has(toolName)) {
    return `var(--tool-color-${toolName.replace(/_/g, "-")})`;
  }
  return `var(--tool-palette-${hashToolName(toolName) % TOOL_PALETTE_SIZE})`;
}

function getDisplayIndent(flatNode: FlatNode): number {
  return flatNode.multipleRoots ? Math.max(0, flatNode.indent - 1) : flatNode.indent;
}

function countHiddenDescendants(entryId: string, allFlatNodes: FlatNode[]): number {
  const hidden = new Set<string>();
  for (const flatNode of allFlatNodes) {
    const { id, parentId } = flatNode.node.entry;
    if (parentId != null && (parentId === entryId || hidden.has(parentId))) {
      hidden.add(id);
    }
  }
  return hidden.size;
}

function expandPathInFolded(
  foldedIds: ReadonlySet<string>,
  entryId: string,
  entryById: Map<string, SessionEntry>,
): Set<string> {
  const next = new Set(foldedIds);
  let currentId: string | undefined = entryId;
  while (currentId) {
    next.delete(currentId);
    const parentId: string | null | undefined = entryById.get(currentId)?.parentId;
    if (!parentId || isNoneParent(parentId) || parentId === currentId) break;
    currentId = parentId;
  }
  return next;
}

export interface SessionTreeRef {
  focusSearch: () => void;
}

interface SessionTreeProps {
  entries: SessionEntry[];
  activeLeafId?: string;
  onNodeClick?: (leafId: string, targetId: string) => void;
  resolvedLabelsByTargetId?: Record<string, string>;
  pluginViews?: PsmSessionTreeViewRuntimeRegistration[];
  sessionPath?: string;
  filter?: TreeFilterMode | `tool-${string}`;
  onRequestClose?: () => void;
}

const SessionTree = memo(
  forwardRef<SessionTreeRef, SessionTreeProps>(function SessionTree(
    {
      entries,
      activeLeafId,
      onNodeClick,
      resolvedLabelsByTargetId = {},
      pluginViews = [],
      sessionPath = "",
      filter = "no-tools",
      onRequestClose,
    },
    ref,
  ) {
    const searchRef = useRef<SessionTreeSearchRef>(null);
    const treeRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef(new Map<string, HTMLDivElement>());

    const [state, setState] = useState<SessionTreeControllerState>(() =>
      createTreeControllerState({
        filterMode: TREE_FILTER_MODES.includes(filter as TreeFilterMode)
          ? (filter as TreeFilterMode)
          : "no-tools",
        focusedId: activeLeafId ?? null,
        selectedId: activeLeafId ?? null,
      }),
    );
    const [activePluginViewId, setActivePluginViewId] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focusSearch: () => searchRef.current?.focus(),
      }),
      [],
    );

    const treeData = useMemo(
      () => buildTree(entries, resolvedLabelsByTargetId),
      [entries, resolvedLabelsByTargetId],
    );
    const activePathIds = useMemo(
      () => buildActivePathIds(activeLeafId, entries),
      [activeLeafId, entries],
    );
    const flatNodes = useMemo(
      () => flattenTree(treeData, activePathIds),
      [treeData, activePathIds],
    );
    const newestLeafMap = useMemo(() => findNewestLeaf(treeData), [treeData]);
    const findNewestLeafFn = useCallback(
      (nodeId: string): string => newestLeafMap.get(nodeId) || nodeId,
      [newestLeafMap],
    );
    const { resolveScrollTarget } = useSessionTreeLookup(entries, activeLeafId);
    const entryById = useMemo(
      () => new Map(entries.map((entry) => [entry.id, entry])),
      [entries],
    );

    const extractContent = useCallback((content: unknown): string => {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((block: any) => block.type === "text" && block.text)
          .map((block: any) => block.text)
          .join("");
      }
      return "";
    }, []);

    const searchTerms = useMemo(() => {
      if (!state.searchQuery.trim()) return [];
      const parsedQuery = parseQuotedQuery(state.searchQuery);
      return (parsedQuery.hasPhrases
        ? [...parsedQuery.phrases, ...parsedQuery.remainderTokens]
        : parsedQuery.remainderTokens
      )
        .map((term) => term.toLowerCase())
        .filter(Boolean);
    }, [state.searchQuery]);

    const filterMatchedNodes = useMemo(
      () =>
        filterFlatNodes(flatNodes, searchTerms, state.filterMode, extractContent),
      [extractContent, flatNodes, searchTerms, state.filterMode],
    );
    const filteredNodes = useMemo(
      () =>
        filterCollapsedFlatNodes(filterMatchedNodes, flatNodes, state.foldedIds),
      [filterMatchedNodes, flatNodes, state.foldedIds],
    );
    const visibleIds = useMemo(
      () => filteredNodes.map((node) => node.node.entry.id),
      [filteredNodes],
    );
    const searchMatchIds = useMemo(() => {
      if (!searchTerms.length) return [] as string[];
      return flatNodes
        .filter((flatNode) => {
          const searchableText = getSearchableText(
            flatNode.node.entry,
            extractContent,
            flatNode.node.label,
          ).toLowerCase();
          return searchTerms.every((term) => searchableText.includes(term));
        })
        .map((flatNode) => flatNode.node.entry.id)
        .filter((id) => visibleIds.includes(id));
    }, [extractContent, flatNodes, searchTerms, visibleIds]);

    const visibleMaps = useMemo(
      () => buildVisibleTreeMaps(filteredNodes, flatNodes),
      [filteredNodes, flatNodes],
    );

    const controllerContext = useMemo(
      () => ({
        visibleIds,
        searchMatchIds,
        visibleParentById: visibleMaps.visibleParentById,
        visibleChildrenById: visibleMaps.visibleChildrenById,
      }),
      [searchMatchIds, visibleIds, visibleMaps],
    );

    const stateRef = useRef(state);
    stateRef.current = state;
    const contextRef = useRef(controllerContext);
    contextRef.current = controllerContext;

    const applyAction = useCallback(
      (action: TreeAction) => {
        const result = reduceTreeAction(
          stateRef.current,
          action,
          contextRef.current,
        );
        stateRef.current = result.state;
        setState(result.state);
        if (result.effect.type === "request-close") {
          onRequestClose?.();
        }
        return result;
      },
      [onRequestClose],
    );

    useEffect(() => {
      setState((prev) =>
        reduceTreeAction(
          prev,
          {
            type: "SYNC_VISIBLE",
            preferredId: prev.focusedId ?? prev.selectedId ?? activeLeafId ?? null,
          },
          {
            visibleIds,
            searchMatchIds,
            visibleParentById: visibleMaps.visibleParentById,
            visibleChildrenById: visibleMaps.visibleChildrenById,
          },
        ).state,
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleIds.join("|")]);

    useEffect(() => {
      if (!activeLeafId) return;
      setState((prev) => ({
        ...prev,
        foldedIds: expandPathInFolded(prev.foldedIds, activeLeafId, entryById),
        focusedId: prev.focusedId ?? activeLeafId,
        selectedId: prev.selectedId ?? activeLeafId,
      }));
    }, [activeLeafId, entryById]);

    useEffect(() => {
      const focusedId = state.focusedId;
      if (!focusedId) return;
      rowRefs.current.get(focusedId)?.scrollIntoView({ block: "nearest" });
    }, [filteredNodes, state.focusedId]);

    const navigateToEntry = useCallback(
      (entryId: string) => {
        setState((prev) => ({
          ...prev,
          foldedIds: expandPathInFolded(prev.foldedIds, entryId, entryById),
          focusedId: entryId,
          selectedId: entryId,
        }));

        if (!onNodeClick) return;
        const targetId = resolveScrollTarget(entryId);
        const leafId = targetId === entryId ? entryId : findNewestLeafFn(entryId);
        onNodeClick(leafId, targetId);
      },
      [entryById, findNewestLeafFn, onNodeClick, resolveScrollTarget],
    );

    const handleTreeKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (state.focusedId) navigateToEntry(state.focusedId);
          return;
        }
        if (event.key === " ") {
          event.preventDefault();
          if (state.focusedId) {
            applyAction({ type: "SET_SELECTED", id: state.focusedId });
          }
          return;
        }

        const action = treeKeyToAction(event.nativeEvent, {
          pageSize: Math.max(
            5,
            Math.floor((treeRef.current?.clientHeight ?? 240) / 24),
          ),
        });
        if (!action) return;
        event.preventDefault();
        applyAction(action);
      },
      [applyAction, navigateToEntry, state.focusedId],
    );

    const activePluginView = useMemo(
      () => pluginViews.find((view) => view.id === activePluginViewId) ?? null,
      [activePluginViewId, pluginViews],
    );

    useEffect(() => {
      if (!activePluginViewId) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setActivePluginViewId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown, { capture: true });
      return () =>
        window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [activePluginViewId]);

    const colorizeToolCalls =
      getCachedSettings().session?.colorizeToolCalls !== false;
    const currentSearchResultId =
      searchMatchIds[state.searchMatchIndex] ?? searchMatchIds[0] ?? null;
    const searchResultSet = useMemo(() => new Set(searchMatchIds), [searchMatchIds]);

    const contextFlatNode = useMemo(() => {
      if (!filteredNodes.length) return null;
      const selectedIndex = Math.max(
        0,
        filteredNodes.findIndex((node) => node.node.entry.id === state.focusedId),
      );
      for (let index = selectedIndex; index >= 0; index -= 1) {
        const entry = filteredNodes[index]?.node.entry;
        if (entry?.type === "message" && entry.message?.role === "user") {
          return filteredNodes[index];
        }
      }
      return null;
    }, [filteredNodes, state.focusedId]);

    return (
      <div className="flex h-full flex-col session-tree-shell">
        <SessionTreeSearch
          ref={searchRef}
          searchQuery={state.searchQuery}
          onSearchChange={(query) => applyAction({ type: "SET_QUERY", query })}
          onClear={() => applyAction({ type: "SET_QUERY", query: "" })}
          onNext={() => applyAction({ type: "SEARCH_NEXT" })}
          onPrevious={() => applyAction({ type: "SEARCH_PREV" })}
          onSubmit={() => {
            const id = currentSearchResultId ?? state.focusedId;
            if (id) navigateToEntry(id);
          }}
          currentIndex={state.searchMatchIndex}
          totalResults={searchMatchIds.length}
        />

        {pluginViews.length > 0 ? (
          <div className="tree-toolbar tree-toolbar-views">
            {pluginViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className="filter-btn"
                onClick={() => setActivePluginViewId(view.id)}
                title={view.title}
              >
                {view.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="tree-toolbar">
          <label className="tree-filter-label">
            <span className="sr-only">Tree filter</span>
            <select
              className="tree-filter-select"
              value={state.filterMode}
              onChange={(event) =>
                applyAction({
                  type: "SET_FILTER",
                  filter: event.target.value as TreeFilterMode,
                })
              }
              aria-label="Tree filter"
            >
              {TREE_FILTER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {FILTER_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <span className="tree-toolbar-meta">
            {filteredNodes.length}/{flatNodes.length}
          </span>
        </div>

        {contextFlatNode ? (
          <div className="tree-user-sticky">
            <span className="tree-user-sticky-label">Thread</span>
            <span className="tree-user-sticky-text">
              {getEntryDisplayText(contextFlatNode.node.entry)}
            </span>
            <span className="tree-user-sticky-index">
              {Math.max(
                1,
                filteredNodes.findIndex(
                  (node) => node.node.entry.id === contextFlatNode.node.entry.id,
                ) + 1,
              )}
              /{filteredNodes.length}
            </span>
          </div>
        ) : null}

        <div
          ref={treeRef}
          className="tree-container"
          role="tree"
          tabIndex={0}
          aria-label="Session tree"
          onKeyDown={handleTreeKeyDown}
        >
          {filteredNodes.map((flatNode) => {
            const entry = flatNode.node.entry;
            const label = flatNode.node.label;
            const isActive = entry.id === activeLeafId;
            const isFocused = state.focusedId === entry.id;
            const isSelected = state.selectedId === entry.id;
            const isInPath = activePathIds.has(entry.id);
            const displayText = getEntryDisplayText(entry, label);
            const roleClass = getEntryRoleClass(entry);
            const toolName = getEntryToolName(entry);
            const isSearchMatch = searchResultSet.has(entry.id);
            const isCurrentMatch =
              isSearchMatch && currentSearchResultId === entry.id;
            const isUserMessage =
              entry.type === "message" && entry.message?.role === "user";
            const foldable = isFoldableNode(
              entry.id,
              visibleMaps.visibleParentById,
              visibleMaps.visibleChildrenById,
            );
            const isCollapsed = state.foldedIds.has(entry.id);
            // After folding, visible children disappear; keep the control so the user can expand.
            const showFoldControl = foldable || isCollapsed;
            const hiddenCount = isCollapsed
              ? countHiddenDescendants(entry.id, flatNodes)
              : 0;
            const prefix = buildTreePrefix(flatNode, {
              folded: isCollapsed,
              foldable: showFoldControl,
            });
            const level = getDisplayIndent(flatNode) + 1;

            return (
              <div
                key={entry.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(entry.id, element);
                  else rowRefs.current.delete(entry.id);
                }}
                role="treeitem"
                aria-level={level}
                aria-selected={isSelected || isFocused}
                aria-expanded={showFoldControl ? !isCollapsed : undefined}
                tabIndex={isFocused ? 0 : -1}
                className={[
                  "tree-node",
                  isActive ? "active" : "",
                  isSelected ? "selected" : "",
                  isFocused ? "focused" : "",
                  isInPath ? "in-path" : "",
                  isSearchMatch ? "search-match" : "",
                  isCurrentMatch ? "search-match-current" : "",
                  isUserMessage ? "tree-node-user" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    focusedId: entry.id,
                    selectedId: entry.id,
                  }));
                }}
                onDoubleClick={() => navigateToEntry(entry.id)}
              >
                {showFoldControl ? (
                  <button
                    type="button"
                    className="tree-prefix tree-prefix-button"
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} branch ${displayText}`}
                    title={`${isCollapsed ? "Expand" : "Collapse"} branch ${displayText}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      applyAction({ type: "TOGGLE_FOLD", id: entry.id });
                    }}
                  >
                    {prefix}
                  </button>
                ) : (
                  <span className="tree-prefix" aria-hidden="true">
                    {prefix}
                  </span>
                )}
                <span
                  className={`tree-marker ${
                    isActive
                      ? "current"
                      : isSelected
                        ? "selected"
                        : isInPath
                          ? "path"
                          : ""
                  }`}
                  aria-hidden="true"
                >
                  {isInPath || isActive || isSelected ? "•" : " "}
                </span>
                <span
                  className={`tree-content ${isUserMessage ? "tree-content-user" : ""} ${roleClass}`}
                  style={
                    !isUserMessage && colorizeToolCalls && toolName
                      ? { color: getToolColorVar(toolName) }
                      : undefined
                  }
                >
                  {label ? <span className="tree-label-badge">{label}</span> : null}
                  <span className="tree-node-text">{displayText}</span>
                  {hiddenCount > 0 ? (
                    <span className="tree-hidden-count"> · {hiddenCount} hidden</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        <div className="tree-status" role="status">
          {FILTER_LABELS[state.filterMode]} · {filteredNodes.length}/{flatNodes.length}
          {state.focusedId ? ` · focus ${state.focusedId.slice(0, 8)}` : ""}
          {activeLeafId ? ` · leaf ${activeLeafId.slice(0, 8)}` : ""}
        </div>

        {activePluginView && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-md"
                role="dialog"
                aria-modal="true"
              >
                <div
                  className="flex h-[100dvh] w-[100vw] min-w-[320px] flex-col overflow-hidden rounded-none border border-border/70 bg-surface-dark/90 shadow-2xl sm:h-[80vh] sm:w-[80vw] sm:rounded-xl"
                  data-no-window-drag
                >
                  <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 bg-background/20 px-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {activePluginView.title}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {entries.length} JSONL entries
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background/35 text-muted-foreground hover:bg-background/55 hover:text-foreground"
                      onClick={() => setActivePluginViewId(null)}
                      aria-label="Close"
                      title="Close"
                    >
                      ×
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden bg-background/10">
                    <PluginContributionBoundary
                      pluginId={activePluginView.pluginId}
                      contributionId={activePluginView.id}
                      title={activePluginView.title}
                    >
                      <PluginContributionSlot
                        render={() =>
                          activePluginView.render({
                            session: { path: sessionPath },
                            activeEntryId: activeLeafId ?? null,
                            entries: entries as any,
                            labelsByTargetId: resolvedLabelsByTargetId,
                            filter: state.filterMode,
                            closeView: () => setActivePluginViewId(null),
                            onNavigate: onNodeClick,
                          })
                        }
                      />
                    </PluginContributionBoundary>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  }),
);

export default SessionTree;
