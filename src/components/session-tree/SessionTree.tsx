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
  buildTreePrefix,
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

const KNOWN_TOOLS = new Set([
  "read",
  "edit",
  "write",
  "bash",
  "search",
  "web_fetch",
]);
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

const SessionFlowView = lazy(
  () => import("../session-viewer/SessionFlowView"),
);

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
    const [viewMode, setViewMode] = useState<"tree" | "flow" | "hierarchy">(
      "tree",
    );

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

    const extractContent = useCallback((content: unknown): string => {
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((block: any) => block.type === "text" && block.text)
          .map((block: any) => block.text)
          .join("");
      }
      return "";
    }, []);

    const searchTerms = useMemo(() => {
      if (!searchQuery.trim()) {
        return [];
      }

      const parsedQuery = parseQuotedQuery(searchQuery);
      return (
        parsedQuery.hasPhrases
          ? [...parsedQuery.phrases, ...parsedQuery.remainderTokens]
          : parsedQuery.remainderTokens
      )
        .map((term) => term.toLowerCase())
        .filter(Boolean);
    }, [searchQuery]);

    const matchedIds = useMemo(() => {
      if (!searchTerms.length) {
        return [];
      }

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

    const searchResultSet = useMemo(
      () => new Set(searchResults),
      [searchResults],
    );
    const currentSearchResultId = searchResults[currentResultIndex];
    const filteredNodes = useMemo(
      () =>
        filterFlatNodes(flatNodes, searchTerms, currentFilter, extractContent),
      [currentFilter, extractContent, flatNodes, searchTerms],
    );

    const navigateToEntry = useCallback(
      (entryId: string) => {
        if (!onNodeClick) {
          return;
        }

        const targetId = resolveScrollTarget(entryId);
        onNodeClick(findNewestLeafFn(targetId), targetId);
      },
      [findNewestLeafFn, onNodeClick, resolveScrollTarget],
    );

    const handleNodeClick = useCallback(
      (flatNode: FlatNode) => {
        navigateToEntry(flatNode.node.entry.id);
      },
      [navigateToEntry],
    );

    const handleSearchNext = useCallback(() => {
      if (!searchResults.length) {
        return;
      }

      const nextIndex = (currentResultIndex + 1) % searchResults.length;
      setCurrentResultIndex(nextIndex);
      navigateToEntry(searchResults[nextIndex]);
    }, [currentResultIndex, navigateToEntry, searchResults]);

    const handleSearchPrev = useCallback(() => {
      if (!searchResults.length) {
        return;
      }

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
                <div
                  style={{
                    padding: 12,
                    color: "var(--color-text-secondary)",
                  }}
                >
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
            {filteredNodes.map((flatNode) => {
              const entry = flatNode.node.entry;
              const label = flatNode.node.label;
              const prefix = buildTreePrefix(flatNode);
              const isActive = entry.id === activeLeafId;
              const isInPath = activePathIds.has(entry.id);
              const marker = isInPath ? "•" : "·";
              const displayText = getEntryDisplayText(entry);
              const roleClass = getEntryRoleClass(entry);
              const toolName = getEntryToolName(entry);
              const isSearchMatch = searchResultSet.has(entry.id);
              const isCurrentMatch =
                isSearchMatch && currentSearchResultId === entry.id;

              return (
                <div
                  key={entry.id}
                  className={`tree-node ${isActive ? "active" : ""} ${isInPath ? "in-path" : ""} ${isSearchMatch ? "search-match" : ""} ${isCurrentMatch ? "search-match-current" : ""}`}
                  onClick={() => handleNodeClick(flatNode)}
                >
                  <span className="tree-prefix">{prefix}</span>
                  <span className="tree-marker">{marker}</span>
                  {entry.type === "message" && entry.message?.role === "user" ? (
                    <span className={`tree-content tree-content-user ${roleClass}`}>
                      <p className="tree-user-label">
                        {label ? <span className="tree-label-badge">[{label}]</span> : null}
                        User:
                        <span className="tree-user-text">{displayText}</span>
                      </p>
                    </span>
                  ) : (
                    <span
                      className={`tree-content ${roleClass}`}
                      style={
                        colorizeToolCalls && toolName
                          ? { color: getToolColorVar(toolName) }
                          : undefined
                      }
                    >
                      {label ? <span className="tree-label-badge">[{label}]</span> : null}
                      {displayText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="tree-status">
          {filteredNodes.length} / {flatNodes.length} entries
        </div>
      </div>
    );
  }),
);

export default SessionTree;
