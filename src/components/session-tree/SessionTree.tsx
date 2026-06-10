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
import { ChevronDown, ChevronRight } from "lucide-react";

import { useSessionTreeLookup } from "@/hooks/useSessionTreeLookup";
import type { SessionEntry } from "@/types";
import { parseQuotedQuery } from "@/utils/search";
import { PluginContributionBoundary, PluginContributionSlot } from "@/plugins/runtime-host";
import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import { getCachedSettings } from "@/utils/settingsApi";
import {
  buildActivePathIds,
  buildTree,
  filterCollapsedFlatNodes,
  filterFlatNodes,
  findNewestLeaf,
  flattenTree,
  getEntryDisplayText,
  getEntryRoleClass,
  getEntryToolName,
  getSearchableText,
  isNoneParent,
  type FlatNode,
} from "@/utils/session-tree";

import SessionTreeSearch, { type SessionTreeSearchRef } from "./SessionTreeSearch";

// ─── Gutter layout constants ───
const TREE_GUTTER_STEP = 14;
const TREE_GUTTER_BASE = 8;
const TREE_GUTTER_MAX_WIDTH = 104;

function getDisplayIndent(flatNode: FlatNode): number {
  return flatNode.multipleRoots ? Math.max(0, flatNode.indent - 1) : flatNode.indent;
}

function getStickyShift(flatNodes: FlatNode[]): number {
  if (flatNodes.length === 0) return 0;
  const maxIndent = Math.max(...flatNodes.map(getDisplayIndent));
  return Math.max(0, maxIndent - 5);
}

function getEntryKind(entry: SessionEntry): string {
  if (entry.type === "message" && entry.message?.role) {
    if (entry.message.role === "toolResult") return "tool";
    return entry.message.role;
  }
  switch (entry.type) {
    case "branch_summary": return "summary";
    case "model_change": return "model";
    case "thinking_level_change": return "thinking";
    case "session_info": return "session";
    default: return entry.type;
  }
}

function getEntryKindLabel(entry: SessionEntry): string {
  const kind = getEntryKind(entry);
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getEntryDetailText(entry: SessionEntry, label?: string): string {
  if (label) return label;

  if (entry.type === "message" && entry.message) {
    const content = entry.message.content;
    if (typeof content === "string") return String(content).trim() || "(empty)";
    if (Array.isArray(content)) {
      const parts = content
        .map((block: any) => {
          if (block.type === "text") return block.text;
          if (block.type === "toolCall") {
            const args = block.arguments ? JSON.stringify(block.arguments, null, 2) : "";
            return args ? `${block.name}\n${args}` : block.name;
          }
          if (block.type === "image") return "[image]";
          return "";
        })
        .filter(Boolean);
      return parts.join("\n\n").trim() || "(empty)";
    }
  }

  if (entry.type === "branch_summary") return entry.summary || "(empty)";
  if (entry.type === "compaction") return entry.summary || "Compaction";
  if (entry.type === "label") return entry.label || "Label cleared";
  if (entry.type === "session_info") return entry.name || "Session";

  return getEntryDisplayText(entry, label);
}

function formatEntryTime(timestamp?: string): string {
  if (!timestamp) return "unknown time";
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return "unknown time";

  const diffMinutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatEntryId(id?: string): string {
  if (!id) return "none";
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function getEntryJsonlShape(entry: SessionEntry): string {
  if (entry.type === "message" && entry.message?.role) {
    return `message.${entry.message.role}`;
  }
  if (entry.type === "label" && entry.targetId) return "label.target";
  if (entry.type === "model_change") return "event.model";
  if (entry.type === "thinking_level_change") return "event.thinking";
  return entry.type;
}

function getEntryRelationText(entry: SessionEntry): string {
  const parts = [`id ${formatEntryId(entry.id)}`];
  if (entry.parentId) parts.push(`parent ${formatEntryId(entry.parentId)}`);
  if (entry.targetId) parts.push(`target ${formatEntryId(entry.targetId)}`);
  return parts.join(" · ");
}

function getEntryPreviewTitle(entry: SessionEntry, label?: string): string {
  if (label) return label;
  const text = getEntryDisplayText(entry);
  return text === "(empty)" ? getEntryKindLabel(entry) : text;
}

function getEntryPreviewHint(entry: SessionEntry): string {
  if (entry.type === "message" && entry.message?.role === "toolResult") {
    return "Tool result bound to prior tool call";
  }
  if (entry.type === "label") return "Label entry points at targetId while tree keeps raw parent order";
  if (entry.type === "message") return "Pi Agent JSONL message entry";
  if (entry.type === "branch_summary") return "Branch summary entry";
  if (entry.type === "compaction") return "Compaction entry";
  return "Pi Agent JSONL entry";
}

// ─── Tool color palette ───
const KNOWN_TOOLS = new Set(["read", "edit", "write", "bash", "search", "web_fetch"]);
const TOOL_PALETTE_SIZE = 8;

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

// ─── Gutter component ───
function TreeGutter({ flatNode, stickyShift }: { flatNode: FlatNode; stickyShift: number }) {
  const displayIndent = Math.max(0, getDisplayIndent(flatNode) - stickyShift);
  const gutterWidth = Math.min(
    TREE_GUTTER_MAX_WIDTH,
    TREE_GUTTER_BASE + Math.max(1, displayIndent + 1) * TREE_GUTTER_STEP,
  );
  const shiftedGutters = flatNode.gutters
    .map((gutter) => ({ ...gutter, position: gutter.position - stickyShift }))
    .filter((gutter) => gutter.position >= 0 && gutter.position <= 6);
  const connectorPosition = Math.max(0, displayIndent - 1);

  return (
    <span className="tree-gutter" style={{ width: gutterWidth }} aria-hidden="true">
      {shiftedGutters.map((gutter) => (
        <span
          key={`${gutter.position}-${gutter.show ? "show" : "hide"}`}
          className={`tree-gutter-rail ${gutter.show ? "visible" : "faded"}`}
          style={{ left: TREE_GUTTER_BASE + gutter.position * TREE_GUTTER_STEP }}
        />
      ))}
      {flatNode.showConnector && !flatNode.isVirtualRootChild ? (
        <span
          className={`tree-gutter-elbow ${flatNode.isLast ? "last" : "branch"}`}
          style={{
            left: TREE_GUTTER_BASE + connectorPosition * TREE_GUTTER_STEP,
            width: TREE_GUTTER_STEP,
          }}
        />
      ) : null}
    </span>
  );
}

// ─── Public API ───
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
  filter?:
    | "default"
    | "no-tools"
    | "user-only"
    | "labeled-only"
    | "all"
    | `tool-${string}`;
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
    },
    ref,
  ) {
    const searchRef = useRef<SessionTreeSearchRef>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentFilter, setCurrentFilter] = useState(filter);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
    const [activePluginViewId, setActivePluginViewId] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      focusSearch: () => searchRef.current?.focus(),
    }), []);

    // ─── Tree data ───
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
    const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

    // ─── Search ───
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
      if (!searchQuery.trim()) return [];
      const parsedQuery = parseQuotedQuery(searchQuery);
      return (parsedQuery.hasPhrases
        ? [...parsedQuery.phrases, ...parsedQuery.remainderTokens]
        : parsedQuery.remainderTokens
      )
        .map((term) => term.toLowerCase())
        .filter(Boolean);
    }, [searchQuery]);

    const matchedIds = useMemo(() => {
      if (!searchTerms.length) return [];
      return flatNodes
        .filter((flatNode) => {
          const searchableText = getSearchableText(
            flatNode.node.entry,
            extractContent,
            flatNode.node.label,
          ).toLowerCase();
          return searchTerms.every((term) => searchableText.includes(term));
        })
        .map((flatNode) => flatNode.node.entry.id);
    }, [extractContent, flatNodes, searchTerms]);

    useEffect(() => {
      setSearchResults(matchedIds);
      setCurrentResultIndex(0);
    }, [matchedIds]);

    const searchResultSet = useMemo(() => new Set(searchResults), [searchResults]);
    const currentSearchResultId = searchResults[currentResultIndex];
    const filterMatchedNodes = useMemo(
      () => filterFlatNodes(flatNodes, searchTerms, currentFilter, extractContent),
      [currentFilter, extractContent, flatNodes, searchTerms],
    );
    const filteredNodes = useMemo(
      () => filterCollapsedFlatNodes(filterMatchedNodes, flatNodes, collapsedNodeIds),
      [collapsedNodeIds, filterMatchedNodes, flatNodes],
    );
    const stickyShift = useMemo(() => getStickyShift(filteredNodes), [filteredNodes]);
    const selectedFlatNode = useMemo(
      () =>
        filteredNodes.find((flatNode) => flatNode.node.entry.id === selectedNodeId) ||
        filteredNodes.find((flatNode) => flatNode.node.entry.id === activeLeafId) ||
        filteredNodes[0] ||
        null,
      [activeLeafId, filteredNodes, selectedNodeId],
    );
    const selectedVisibleIndex = useMemo(
      () =>
        selectedFlatNode
          ? filteredNodes.findIndex(
              (flatNode) =>
                flatNode.node.entry.id === selectedFlatNode.node.entry.id,
            ) + 1
          : 0,
      [filteredNodes, selectedFlatNode],
    );
    const contextFlatNode = useMemo(() => {
      if (!filteredNodes.length) return null;
      const selectedIndex = Math.max(0, selectedVisibleIndex - 1);
      for (let index = selectedIndex; index >= 0; index -= 1) {
        const entry = filteredNodes[index].node.entry;
        if (entry.type === "message" && entry.message?.role === "user") {
          return { flatNode: filteredNodes[index], index };
        }
      }
      return null;
    }, [filteredNodes, selectedVisibleIndex]);

    useEffect(() => {
      if (!selectedNodeId && activeLeafId) {
        setSelectedNodeId(activeLeafId);
      }
    }, [activeLeafId, selectedNodeId]);

    const expandEntryPath = useCallback(
      (entryId: string) => {
        setCollapsedNodeIds((prev) => {
          if (prev.size === 0) return prev;

          const next = new Set(prev);
          let currentId: string | undefined = entryId;
          let changed = false;

          while (currentId) {
            if (next.delete(currentId)) changed = true;
            const currentEntry = entryById.get(currentId);
            const parentId = currentEntry?.parentId;
            if (!parentId || isNoneParent(parentId) || parentId === currentId) break;
            currentId = parentId;
          }

          return changed ? next : prev;
        });
      },
      [entryById],
    );

    useEffect(() => {
      if (activeLeafId) {
        expandEntryPath(activeLeafId);
      }
    }, [activeLeafId, expandEntryPath]);

    const handleToggleCollapse = useCallback((entryId: string) => {
      setSelectedNodeId(entryId);
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) {
          next.delete(entryId);
        } else {
          next.add(entryId);
        }
        return next;
      });
    }, []);

    // ─── Navigation ───
    const navigateToEntry = useCallback(
      (entryId: string) => {
        expandEntryPath(entryId);
        if (!onNodeClick) return;
        const targetId = resolveScrollTarget(entryId);
        const leafId = targetId === entryId ? entryId : findNewestLeafFn(entryId);
        onNodeClick(leafId, targetId);
      },
      [expandEntryPath, findNewestLeafFn, onNodeClick, resolveScrollTarget],
    );

    const handleNodeClick = useCallback(
      (flatNode: FlatNode) => {
        setSelectedNodeId(flatNode.node.entry.id);
        navigateToEntry(flatNode.node.entry.id);
      },
      [navigateToEntry],
    );

    const handleSearchNext = useCallback(() => {
      if (!searchResults.length) return;
      const nextIndex = (currentResultIndex + 1) % searchResults.length;
      setCurrentResultIndex(nextIndex);
      navigateToEntry(searchResults[nextIndex]);
    }, [currentResultIndex, navigateToEntry, searchResults]);

    const handleSearchPrev = useCallback(() => {
      if (!searchResults.length) return;
      const nextIndex =
        (currentResultIndex - 1 + searchResults.length) % searchResults.length;
      setCurrentResultIndex(nextIndex);
      navigateToEntry(searchResults[nextIndex]);
    }, [currentResultIndex, navigateToEntry, searchResults]);

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
      return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, [activePluginViewId]);

    const colorizeToolCalls =
      getCachedSettings().session?.colorizeToolCalls !== false;

    return (
      <div className="flex flex-col h-full">
        <SessionTreeSearch
          ref={searchRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={() => {
            setSearchQuery("");
            setSearchResults([]);
            setCurrentResultIndex(0);
          }}
          onNext={handleSearchNext}
          onPrevious={handleSearchPrev}
          currentIndex={currentResultIndex}
          totalResults={searchResults.length}
        />

        {pluginViews.length > 0 ? (
          <div className="sidebar-filters sidebar-filters-tree-views">
            {pluginViews.map((view) => (
              <button
                key={view.id}
                className="filter-btn"
                onClick={() => setActivePluginViewId(view.id)}
                title={view.title}
              >
                {view.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="sidebar-filters">
          <button
            className={`filter-btn ${currentFilter === "default" ? "active" : ""}`}
            onClick={() => setCurrentFilter("default")}
          >
            Default
          </button>
          <button
            className={`filter-btn ${currentFilter === "no-tools" ? "active" : ""}`}
            onClick={() => setCurrentFilter("no-tools")}
          >
            No Tools
          </button>
          <button
            className={`filter-btn ${currentFilter === "user-only" ? "active" : ""}`}
            onClick={() => setCurrentFilter("user-only")}
          >
            User
          </button>
          <button
            className={`filter-btn ${currentFilter === "labeled-only" ? "active" : ""}`}
            onClick={() => setCurrentFilter("labeled-only")}
          >
            Labeled
          </button>
          <button
            className={`filter-btn ${currentFilter === "all" ? "active" : ""}`}
            onClick={() => setCurrentFilter("all")}
          >
            All
          </button>
        </div>

        <>
          {contextFlatNode ? (
              <div className="tree-user-sticky">
                <span className="tree-user-sticky-label">Thread context</span>
                <span className="tree-user-sticky-text">
                  {getEntryDisplayText(contextFlatNode.flatNode.node.entry)}
                </span>
                <span className="tree-user-sticky-index">
                  {contextFlatNode.index + 1}/{filteredNodes.length}
                </span>
              </div>
            ) : null}
            {stickyShift > 0 ? (
              <div className="tree-sticky-depth">
                Sticky-left · depth {stickyShift + 1}+
              </div>
            ) : null}
            <div className="tree-container">
            {filteredNodes.map((flatNode) => {
              const entry = flatNode.node.entry;
              const label = flatNode.node.label;
              const isActive = entry.id === activeLeafId;
              const isSelected = selectedFlatNode?.node.entry.id === entry.id;
              const isInPath = activePathIds.has(entry.id);
              const displayText = getEntryDisplayText(entry);
              const roleClass = getEntryRoleClass(entry);
              const toolName = getEntryToolName(entry);
              const isSearchMatch = searchResultSet.has(entry.id);
              const isCurrentMatch =
                isSearchMatch && currentSearchResultId === entry.id;
              const isUserMessage =
                entry.type === "message" && entry.message?.role === "user";
              const isCollapsible = flatNode.node.children.length > 0;
              const isCollapsed = collapsedNodeIds.has(entry.id);
              const disclosureLabel = `${isCollapsed ? "Expand" : "Collapse"} branch ${displayText}`;

              return (
                <div key={entry.id}>
                  <div
                    className={`tree-node ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${isInPath ? "in-path" : ""} ${isSearchMatch ? "search-match" : ""} ${isCurrentMatch ? "search-match-current" : ""} ${isUserMessage ? "tree-node-user" : ""}`}
                    onClick={() => handleNodeClick(flatNode)}
                  >
                    <TreeGutter flatNode={flatNode} stickyShift={stickyShift} />
                    {isCollapsible ? (
                      <button
                        type="button"
                        className="tree-disclosure"
                        aria-label={disclosureLabel}
                        title={disclosureLabel}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleCollapse(entry.id);
                        }}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span className="tree-disclosure-spacer" aria-hidden="true" />
                    )}
                    <span
                      className={`tree-marker ${isActive ? "current" : isSelected ? "selected" : isInPath ? "path" : ""}`}
                    />
                    <span
                      className={`tree-content ${isUserMessage ? "tree-content-user" : ""} ${roleClass}`}
                      style={
                        !isUserMessage && colorizeToolCalls && toolName
                          ? { color: getToolColorVar(toolName) }
                          : undefined
                      }
                    >
                      {label ? (
                        <span className="tree-label-badge">{label}</span>
                      ) : null}
                      <span className="tree-node-text">{displayText}</span>
                    </span>
                    <span className="tree-kind">{getEntryKindLabel(entry)}</span>
                  </div>
                </div>
              );
            })}
            </div>
        </>

        <div className="tree-detail-pane">
          {selectedFlatNode ? (() => {
            const selectedEntry = selectedFlatNode.node.entry;
            const selectedLabel = selectedFlatNode.node.label;
            const visibleIndex = selectedVisibleIndex;
            const sourceIndex = entries.findIndex((entry) => entry.id === selectedEntry.id) + 1;
            const isCurrent = selectedEntry.id === activeLeafId;

            return (
              <>
                <div className="tree-detail-header">
                  <div className="tree-detail-title">
                    {getEntryPreviewTitle(selectedEntry, selectedLabel)}
                  </div>
                  <div className="tree-detail-badges">
                    <span>JSONL</span>
                    {isCurrent ? <span>current</span> : null}
                  </div>
                </div>
                <div className="tree-detail-meta">
                  <span>row {visibleIndex} of {filteredNodes.length}</span>
                  {sourceIndex > 0 ? <span>source {sourceIndex} of {entries.length}</span> : null}
                  <span>depth {getDisplayIndent(selectedFlatNode) + 1}</span>
                  <span>{getEntryJsonlShape(selectedEntry)}</span>
                  <span>{formatEntryTime(selectedEntry.timestamp)}</span>
                </div>
                <div className="tree-detail-relation">
                  {getEntryRelationText(selectedEntry)}
                </div>
                <div className="tree-detail-body">
                  {getEntryDetailText(selectedEntry, selectedLabel)}
                </div>
                <div className="tree-detail-hint">
                  {getEntryPreviewHint(selectedEntry)}
                </div>
              </>
            );
          })() : (
            <div className="tree-detail-empty">No selection</div>
          )}
        </div>

        <div className="tree-status">
          {filteredNodes.length} / {flatNodes.length} entries
        </div>

        {activePluginView && typeof document !== "undefined" ? createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
            <div className="flex h-[100dvh] w-[100vw] min-w-[320px] flex-col overflow-hidden rounded-none border border-border/70 bg-surface-dark/90 shadow-2xl sm:h-[80vh] sm:w-[80vw] sm:rounded-xl" data-no-window-drag>
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 bg-background/20 px-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{activePluginView.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{entries.length} JSONL entries</div>
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
                <PluginContributionBoundary pluginId={activePluginView.pluginId} contributionId={activePluginView.id} title={activePluginView.title}>
                  <PluginContributionSlot render={() => activePluginView.render({
                    session: { path: sessionPath },
                    activeEntryId: activeLeafId ?? null,
                    entries: entries as any,
                    labelsByTargetId: resolvedLabelsByTargetId,
                    filter: currentFilter,
                    closeView: () => setActivePluginViewId(null),
                    onNavigate: onNodeClick,
                  })} />
                </PluginContributionBoundary>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    );
  }),
);

export default SessionTree;
