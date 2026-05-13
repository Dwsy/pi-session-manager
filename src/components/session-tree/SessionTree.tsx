import {
  Suspense,
  forwardRef,
  lazy,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { useSessionTreeLookup } from "@/hooks/useSessionTreeLookup";
import type { SessionEntry } from "@/types";
import { parseQuotedQuery } from "@/utils/search";
import { getCachedSettings } from "@/utils/settingsApi";
import {
  buildActivePathIds,
  buildTree,
  filterFlatNodes,
  findNewestLeaf,
  flattenTree,
  getEntryDisplayText,
  getEntryRoleClass,
  getEntryToolName,
  getSearchableText,
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

// ─── Lazy flow view ───
const SessionFlowView = lazy(
  () => import("../session-viewer/SessionFlowView"),
);

// ─── Public API ───
export interface SessionTreeRef {
  focusSearch: () => void;
}

interface SessionTreeProps {
  entries: SessionEntry[];
  activeLeafId?: string;
  onNodeClick?: (leafId: string, targetId: string) => void;
  resolvedLabelsByTargetId?: Record<string, string>;
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
      filter = "no-tools",
    },
    ref,
  ) {
    const { t } = useTranslation();
    const searchRef = useRef<SessionTreeSearchRef>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentFilter, setCurrentFilter] = useState(filter);
    const [currentResultIndex, setCurrentResultIndex] = useState(0);
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<"tree" | "flow" | "hierarchy">("tree");
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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
    const filteredNodes = useMemo(
      () => filterFlatNodes(flatNodes, searchTerms, currentFilter, extractContent),
      [currentFilter, extractContent, flatNodes, searchTerms],
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

    useEffect(() => {
      if (!selectedNodeId && activeLeafId) {
        setSelectedNodeId(activeLeafId);
      }
    }, [activeLeafId, selectedNodeId]);

    // ─── Navigation ───
    const navigateToEntry = useCallback(
      (entryId: string) => {
        if (!onNodeClick) return;
        const targetId = resolveScrollTarget(entryId);
        onNodeClick(findNewestLeafFn(targetId), targetId);
      },
      [findNewestLeafFn, onNodeClick, resolveScrollTarget],
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

        <div className="sidebar-filters sidebar-filters-view-mode">
          <button
            className={`filter-btn ${viewMode === "tree" ? "active" : ""}`}
            onClick={() => setViewMode("tree")}
          >
            Tree
          </button>
          <button
            className={`filter-btn ${viewMode === "flow" ? "active" : ""}`}
            onClick={() => setViewMode("flow")}
          >
            Flow
          </button>
          <button
            className={`filter-btn ${viewMode === "hierarchy" ? "active" : ""}`}
            onClick={() => setViewMode("hierarchy")}
          >
            Hierarchy
          </button>
        </div>

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

        {viewMode === "flow" || viewMode === "hierarchy" ? (
          <div className="flex-1 min-h-0">
            <Suspense
              fallback={
                <div style={{ padding: 12, color: "var(--color-text-secondary)" }}>
                  {t("session.tree.loading")}
                </div>
              }
            >
              <SessionFlowView
                entries={entries}
                activeLeafId={activeLeafId}
                onNodeClick={onNodeClick}
                filter={currentFilter}
                viewMode={viewMode === "hierarchy" ? "hierarchy" : "flow"}
                onViewModeChange={(mode) =>
                  setViewMode(mode === "hierarchy" ? "hierarchy" : "flow")
                }
              />
            </Suspense>
          </div>
        ) : (
          <div className="tree-container">
            {stickyShift > 0 ? (
              <div className="tree-sticky-depth">
                Sticky-left · depth {stickyShift + 1}+
              </div>
            ) : null}
            {filteredNodes.map((flatNode, index) => {
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

              return (
                <div key={entry.id}>
                  {isUserMessage ? (
                    <div
                      className="tree-user-sticky"
                      style={{ top: stickyShift > 0 ? 28 : 0 }}
                    >
                      <span className="tree-user-sticky-label">User</span>
                      <span className="tree-user-sticky-text">
                        {displayText}
                      </span>
                      <span className="tree-user-sticky-index">
                        {index + 1}/{filteredNodes.length}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className={`tree-node ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${isInPath ? "in-path" : ""} ${isSearchMatch ? "search-match" : ""} ${isCurrentMatch ? "search-match-current" : ""} ${isUserMessage ? "tree-node-user" : ""}`}
                    onClick={() => handleNodeClick(flatNode)}
                  >
                    <TreeGutter flatNode={flatNode} stickyShift={stickyShift} />
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
        )}

        <div className="tree-detail-pane">
          {selectedFlatNode ? (
            <>
              <div className="tree-detail-meta">
                <span>
                  row{" "}
                  {filteredNodes.findIndex(
                    (node) =>
                      node.node.entry.id === selectedFlatNode.node.entry.id,
                  ) + 1}{" "}
                  of {filteredNodes.length}
                </span>
                <span>depth {getDisplayIndent(selectedFlatNode) + 1}</span>
                <span>{getEntryKind(selectedFlatNode.node.entry)}</span>
                <span>
                  {formatEntryTime(selectedFlatNode.node.entry.timestamp)}
                </span>
                {selectedFlatNode.node.entry.id === activeLeafId ? (
                  <span>current</span>
                ) : null}
              </div>
              <div className="tree-detail-body">
                {getEntryDetailText(selectedFlatNode.node.entry)}
              </div>
            </>
          ) : (
            <div className="tree-detail-empty">No selection</div>
          )}
        </div>

        <div className="tree-status">
          {filteredNodes.length} / {flatNodes.length} entries
        </div>
      </div>
    );
  }),
);

export default SessionTree;
