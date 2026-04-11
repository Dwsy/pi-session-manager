import { useState, useMemo, useCallback, useEffect, forwardRef, memo, useRef, useImperativeHandle, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { SessionEntry } from "@/types";
import SessionTreeSearch, { type SessionTreeSearchRef } from "./SessionTreeSearch";
import { getCachedSettings } from "@/utils/settingsApi";
import { buildTree, flattenTree, buildActivePathIds, findNewestLeaf, filterFlatNodes, buildTreePrefix, getEntryDisplayText, getEntryRoleClass, getEntryToolName, type FlatNode } from "@/utils/session-tree";

const KNOWN_TOOLS = new Set(["read", "edit", "write", "bash", "search", "web_fetch"]);
const TOOL_PALETTE_SIZE = 8;
function hashToolName(name: string): number { let h = 0; for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0; return Math.abs(h); }
function getToolColorVar(n: string): string { if (KNOWN_TOOLS.has(n)) return `var(--tool-color-${n.replace(/_/g, "-")})`; return `var(--tool-palette-${hashToolName(n) % TOOL_PALETTE_SIZE})`; }
const SessionFlowView = lazy(() => import("../session-viewer/SessionFlowView"));

export interface SessionTreeRef { focusSearch: () => void; }
interface SessionTreeProps { entries: SessionEntry[]; activeLeafId?: string; onNodeClick?: (leafId: string, targetId: string) => void; filter?: "default" | "no-tools" | "user-only" | "labeled-only" | "all" | `tool-${string}`; }

const SessionTree = memo(forwardRef<SessionTreeRef, SessionTreeProps>(function SessionTree({ entries, activeLeafId, onNodeClick, filter = "no-tools" }, ref) {
  const { t } = useTranslation();
  const searchRef = useRef<SessionTreeSearchRef>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState(filter);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "flow" | "hierarchy">("tree");
  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }), []);

  const treeData = useMemo(() => buildTree(entries), [entries]);
  const activePathIds = useMemo(() => buildActivePathIds(activeLeafId, entries), [activeLeafId, entries]);
  const flatNodes = useMemo(() => flattenTree(treeData, activePathIds), [treeData]);
  const newestLeafMap = useMemo(() => findNewestLeaf(treeData), [treeData]);
  const findNewestLeafFn = useCallback((nid: string): string => newestLeafMap.get(nid) || nid, [newestLeafMap]);

  const extractContent = useCallback((c: unknown): string => {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.filter((x: any) => x.type === "text" && x.text).map((x: any) => x.text).join("");
    return "";
  }, []);
  const terms = useMemo(() => searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean), [searchQuery]);
  const matchedIds = useMemo(() => {
    if (!terms.length) return [];
    const ids: string[] = [];
    for (const fn of flatNodes) {
      const e = fn.node.entry;
      const parts: string[] = [];
      if (e.type === "message" && e.message) { parts.push(e.message.role); if (e.message.content) parts.push(extractContent(e.message.content)); }
      if (e.type === "compaction") parts.push("compaction");
      if (e.type === "branch_summary") parts.push(e.summary || "");
      if (terms.every(x => parts.join(" ").toLowerCase().includes(x))) ids.push(e.id);
    }
    return ids;
  }, [flatNodes, terms]);
  useEffect(() => { setSearchResults(matchedIds); setCurrentResultIndex(0); }, [matchedIds]);
  const searchResultSet = useMemo(() => new Set(searchResults), [searchResults]);
  const currentSearchResultId = searchResults[currentResultIndex];
  const filteredNodes = useMemo(() => filterFlatNodes(flatNodes, terms, currentFilter, extractContent), [flatNodes, terms, currentFilter, extractContent]);

  const handleNodeClick = useCallback((fn: FlatNode) => { if (onNodeClick) onNodeClick(findNewestLeafFn(fn.node.entry.id), fn.node.entry.id); }, [findNewestLeafFn, onNodeClick]);
  const handleSearchNext = useCallback(() => { if (!searchResults.length) return; const ni = (currentResultIndex + 1) % searchResults.length; setCurrentResultIndex(ni); if (onNodeClick) onNodeClick(findNewestLeafFn(searchResults[ni]), searchResults[ni]); }, [searchResults, currentResultIndex, onNodeClick, findNewestLeafFn]);
  const handleSearchPrev = useCallback(() => { if (!searchResults.length) return; const ni = (currentResultIndex - 1 + searchResults.length) % searchResults.length; setCurrentResultIndex(ni); if (onNodeClick) onNodeClick(findNewestLeafFn(searchResults[ni]), searchResults[ni]); }, [searchResults, currentResultIndex, onNodeClick, findNewestLeafFn]);

  const colorize = getCachedSettings().session?.colorizeToolCalls !== false;

  return (
    <div className="flex flex-col h-full">
      <SessionTreeSearch ref={searchRef} searchQuery={searchQuery} onSearchChange={setSearchQuery} onClear={() => { setSearchQuery(""); setSearchResults([]); setCurrentResultIndex(0); }} onNext={handleSearchNext} onPrevious={handleSearchPrev} currentIndex={currentResultIndex} totalResults={searchResults.length} />
      <div className="sidebar-filters sidebar-filters-view-mode">
        <button className={`filter-btn ${viewMode === "tree" ? "active" : ""}`} onClick={() => setViewMode("tree")}>Tree</button>
        <button className={`filter-btn ${viewMode === "flow" ? "active" : ""}`} onClick={() => setViewMode("flow")}>Flow</button>
        <button className={`filter-btn ${viewMode === "hierarchy" ? "active" : ""}`} onClick={() => setViewMode("hierarchy")}>Hierarchy</button>
      </div>
      <div className="sidebar-filters">
        <button className={`filter-btn ${currentFilter === "default" ? "active" : ""}`} onClick={() => setCurrentFilter("default")}>Default</button>
        <button className={`filter-btn ${currentFilter === "no-tools" ? "active" : ""}`} onClick={() => setCurrentFilter("no-tools")}>No Tools</button>
        <button className={`filter-btn ${currentFilter === "user-only" ? "active" : ""}`} onClick={() => setCurrentFilter("user-only")}>User</button>
        <button className={`filter-btn ${currentFilter === "labeled-only" ? "active" : ""}`} onClick={() => setCurrentFilter("labeled-only")}>Labeled</button>
        <button className={`filter-btn ${currentFilter === "all" ? "active" : ""}`} onClick={() => setCurrentFilter("all")}>All</button>
      </div>
      {viewMode === "flow" || viewMode === "hierarchy" ? (
        <div className="flex-1 min-h-0"><Suspense fallback={<div style={{ padding: 12, color: "var(--color-text-secondary)" }}>{t("session.tree.loading")}</div>}><SessionFlowView entries={entries} activeLeafId={activeLeafId} onNodeClick={onNodeClick} filter={currentFilter} viewMode={viewMode === "hierarchy" ? "hierarchy" : "flow"} onViewModeChange={(mode) => setViewMode(mode === "hierarchy" ? "hierarchy" : "flow")} /></Suspense></div>
      ) : (
        <div className="tree-container">
          {filteredNodes.map(fn => {
            const entry = fn.node.entry;
            const prefix = buildTreePrefix(fn);
            const isActive = entry.id === activeLeafId;
            const isInPath = activePathIds.has(entry.id);
            const marker = isInPath ? "•" : "·";
            const displayText = getEntryDisplayText(entry, fn.node.label);
            const roleClass = getEntryRoleClass(entry);
            const isSearchMatch = searchResultSet.has(entry.id);
            const isCurrentMatch = isSearchMatch && currentSearchResultId === entry.id;
            return (
              <div key={entry.id} className={`tree-node ${isActive ? "active" : ""} ${isInPath ? "in-path" : ""} ${isSearchMatch ? "search-match" : ""} ${isCurrentMatch ? "search-match-current" : ""}`} onClick={() => handleNodeClick(fn)}>
                <span className="tree-prefix">{prefix}</span>
                <span className="tree-marker">{marker}</span>
                {entry.type === "message" && entry.message?.role === "user" ? (
                  <span className={`tree-content tree-content-user ${roleClass}`}><p className="tree-user-label">User:<span className="tree-user-text">{displayText}</span></p></span>
                ) : (
                  <span className={`tree-content ${roleClass}`} style={colorize && getEntryToolName(entry) ? { color: getToolColorVar(getEntryToolName(entry)!) } : undefined}>{displayText}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="tree-status">{filteredNodes.length} / {flatNodes.length} entries</div>
    </div>
  );
}));

export default SessionTree;
