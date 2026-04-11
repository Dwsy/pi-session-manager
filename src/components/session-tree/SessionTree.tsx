import { useState, useMemo, useCallback, useEffect, forwardRef, memo, useRef, useImperativeHandle, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { SessionEntry } from "@/types";
import SessionTreeSearch, { type SessionTreeSearchRef } from "./SessionTreeSearch";
import { getCachedSettings } from "@/utils/settingsApi";

const KNOWN_TOOLS = new Set(["read", "edit", "write", "bash", "search", "web_fetch"]);
const TOOL_PALETTE_SIZE = 8;
function hashToolName(name: string): number { let h = 0; for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0; return Math.abs(h); }
function getToolColorVar(n: string): string { if (KNOWN_TOOLS.has(n)) return `var(--tool-color-${n.replace(/_/g, "-")})`; return `var(--tool-palette-${hashToolName(n) % TOOL_PALETTE_SIZE})`; }
const SessionFlowView = lazy(() => import("../session-viewer/SessionFlowView"));

export interface SessionTreeRef { focusSearch: () => void; }

interface TreeNodeData { entry: SessionEntry; children: TreeNodeData[]; label?: string; }
interface FlatNode { node: TreeNodeData; indent: number; showConnector: boolean; isLast: boolean; gutters: Array<{ position: number; show: boolean }>; isVirtualRootChild: boolean; multipleRoots: boolean; }

const SessionTree = memo(forwardRef<SessionTreeRef, { entries: SessionEntry[]; activeLeafId?: string; onNodeClick?: (leafId: string, targetId: string) => void; filter?: "default" | "no-tools" | "user-only" | "labeled-only" | "all" | `tool-${string}` }>(function SessionTree({ entries, activeLeafId, onNodeClick, filter = "no-tools" }, ref) {
  const { t } = useTranslation();
  const searchRef = useRef<SessionTreeSearchRef>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState(filter);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"tree" | "flow" | "hierarchy">("tree");

  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }), []);

  // ========== BUILD TREE ==========
  const treeData = useMemo(() => {
    const byId = new Map<string, SessionEntry>();
    const cm = new Map<string, TreeNodeData[]>();
    const labelMap = new Map<string, string>();
    for (const e of entries) { byId.set(e.id, e); cm.set(e.id, []); }
    for (const e of entries) { if (e.type === "label" && e.targetId && e.label) labelMap.set(e.targetId, e.label); }
    for (const e of entries) {
      const pid = e.parentId;
      const ep = (pid == null || pid === "None" || pid === "null" || pid === "NONE") ? null : pid;
      if (ep && byId.has(ep)) cm.get(ep)!.push({ entry: e, children: cm.get(e.id)!, label: labelMap.get(e.id) });
    }
    const roots: TreeNodeData[] = [];
    for (const e of entries) {
      const pid = e.parentId;
      const ep = (pid == null || pid === "None" || pid === "null" || pid === "NONE") ? null : pid;
      if (!ep || !byId.has(ep)) roots.push({ entry: e, children: cm.get(e.id)!, label: labelMap.get(e.id) });
    }
    // Sort children AND roots by timestamp — STABLE ORDER
    const sc = (n: TreeNodeData) => { n.children.sort((a, b) => new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime()); n.children.forEach(sc); };
    roots.forEach(sc);
    return roots;
  }, [entries]);

  // ========== ACTIVE PATH ==========
  const byId = useMemo(() => { const m = new Map<string, SessionEntry>(); for (const e of entries) m.set(e.id, e); return m; }, [entries]);
  const activePathIds = useMemo(() => {
    const ids = new Set<string>();
    let cur: string | undefined = activeLeafId;
    while (cur) { ids.add(cur); const e = byId.get(cur); if (!e?.parentId || e.parentId === e.id) break; cur = e.parentId; }
    return ids;
  }, [activeLeafId, byId]);

  // ========== FLATTEN TREE — NO SORTING BY containsActive ==========
  // Key fix: flatNodes order depends ONLY on treeData (timestamp-sorted), NOT on activeLeafId.
  // This means clicking any node NEVER changes the tree order.
  const flatNodes = useMemo(() => {
    const result: FlatNode[] = [];
    const multipleRoots = treeData.length > 1;
    type StackItem = [TreeNodeData, number, boolean, boolean, boolean, Array<{ position: number; show: boolean }>, boolean];
    const stack: StackItem[] = [];
    // Roots in timestamp order (treeData is already sorted)
    for (let i = treeData.length - 1; i >= 0; i--) stack.push([treeData[i], multipleRoots ? 1 : 0, multipleRoots, multipleRoots, i === treeData.length - 1, [], multipleRoots]);

    while (stack.length > 0) {
      const [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] = stack.pop()!;
      result.push({ node, indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots });

      const children = node.children;
      const multipleChildren = children.length > 1;
      // NO containsActive sorting — children stay in timestamp order
      const childIndent = multipleChildren ? indent + 1 : (justBranched && indent > 0 ? indent + 1 : indent);
      const conn = showConnector && !isVirtualRootChild;
      const disp = multipleRoots ? Math.max(0, indent - 1) : indent;
      const pos = Math.max(0, disp - 1);
      const childGutters = conn ? [...gutters, { position: pos, show: !isLast }] : gutters;
      for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], childIndent, multipleChildren, multipleChildren, i === children.length - 1, childGutters, false]);
    }
    return result;
  }, [treeData]);

  // ========== FILTER ==========
  const extractContent = (c: unknown): string => { if (typeof c === "string") return c; if (Array.isArray(c)) return c.filter((x: any) => x.type === "text" && x.text).map((x: any) => x.text).join(""); return ""; };
  const isSettings = (e: SessionEntry) => ["session", "session_info", "label", "model_change", "thinking_level_change"].includes(e.type);
  const terms = useMemo(() => searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean), [searchQuery]);

  const filteredNodes = useMemo(() => {
    const baseFiltered = flatNodes.filter(fn => {
      const entry = fn.node.entry;
      if (terms.length > 0) {
        const parts: string[] = [];
        if (entry.type === "message" && entry.message) { parts.push(entry.message.role); if (entry.message.content) parts.push(extractContent(entry.message.content)); }
        if (entry.type === "compaction") parts.push("compaction");
        if (entry.type === "branch_summary") parts.push(entry.summary || "");
        if (entry.type === "model_change") parts.push(entry.modelId || "");
        if (!terms.every(t => parts.join(" ").toLowerCase().includes(t))) return false;
      }
      switch (currentFilter) {
        case "user-only": return entry.type === "message" && entry.message?.role === "user";
        case "no-tools": if (entry.type === "message" && entry.message?.role === "toolResult") return false; return !isSettings(entry);
        case "default": return !isSettings(entry);
        case "labeled-only": return !!fn.node.label;
        case "all": return true;
        default:
          if (currentFilter.startsWith("tool-")) {
            const tn = currentFilter.slice(5);
            if (entry.type === "message" && entry.message?.role === "assistant") {
              const c = Array.isArray(entry.message.content) ? entry.message.content : [];
              return c.some((x: any) => x.type === "toolCall" && x.name === tn);
            }
            return false;
          }
          return true;
      }
    });

    // recalculateVisualStructure when filtering
    if (terms.length > 0 || currentFilter !== "no-tools") {
      if (baseFiltered.length === 0) return baseFiltered;
      const visibleIds = new Set(baseFiltered.map(n => n.node.entry.id));
      const entryMap = new Map<string, FlatNode>();
      for (const fn of flatNodes) entryMap.set(fn.node.entry.id, fn);
      const findVisibleAncestor = (nid: string): string | null => {
        let cid: string | undefined = entryMap.get(nid)?.node.entry.parentId;
        while (cid != null) { if (visibleIds.has(cid)) return cid; cid = entryMap.get(cid)?.node.entry.parentId; }
        return null;
      };
      const visibleChildren = new Map<string | null, string[]>();
      visibleChildren.set(null, []);
      for (const fn of baseFiltered) { const nid = fn.node.entry.id; const aid = findVisibleAncestor(nid); if (!visibleChildren.has(aid ?? null)) visibleChildren.set(aid ?? null, []); visibleChildren.get(aid ?? null)!.push(nid); }
      const visibleRootIds = visibleChildren.get(null) ?? [];
      const mr = visibleRootIds.length > 1;
      const fMap = new Map<string, FlatNode>();
      for (const fn of baseFiltered) fMap.set(fn.node.entry.id, fn);
      type StackItem = [string, number, boolean, boolean, boolean, Array<{ position: number; show: boolean }>, boolean];
      const stack: StackItem[] = [];
      for (let i = visibleRootIds.length - 1; i >= 0; i--) stack.push([visibleRootIds[i], mr ? 1 : 0, mr, mr, i === visibleRootIds.length - 1, [], mr]);
      while (stack.length > 0) {
        const [nid, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] = stack.pop()!;
        const fn = fMap.get(nid); if (!fn) continue;
        fn.indent = indent; fn.showConnector = showConnector; fn.isLast = isLast; fn.gutters = gutters; fn.isVirtualRootChild = isVirtualRootChild; fn.multipleRoots = mr;
        const children = visibleChildren.get(nid) ?? [];
        const mc = children.length > 1;
        const ci = mc ? indent + 1 : (justBranched && indent > 0 ? indent + 1 : indent);
        const conn = showConnector && !isVirtualRootChild;
        const disp = mr ? Math.max(0, indent - 1) : indent;
        const pos = Math.max(0, disp - 1);
        const cg = conn ? [...gutters, { position: pos, show: !isLast }] : gutters;
        for (let i = children.length - 1; i >= 0; i--) stack.push([children[i], ci, mc, mc, i === children.length - 1, cg, false]);
      }
    }
    return baseFiltered;
  }, [flatNodes, terms, currentFilter]);

  // ========== SEARCH ==========
  const matchedIds = useMemo(() => {
    if (!terms.length) return [];
    const ids: string[] = [];
    for (const fn of flatNodes) {
      const e = fn.node.entry;
      const parts: string[] = [];
      if (e.type === "message" && e.message) { parts.push(e.message.role); if (e.message.content) parts.push(extractContent(e.message.content)); }
      if (e.type === "compaction") parts.push("compaction");
      if (e.type === "branch_summary") parts.push(e.summary || "");
      if (terms.every(t => parts.join(" ").toLowerCase().includes(t))) ids.push(e.id);
    }
    return ids;
  }, [flatNodes, terms]);
  useEffect(() => { setSearchResults(matchedIds); setCurrentResultIndex(0); }, [matchedIds]);
  const searchResultSet = useMemo(() => new Set(searchResults), [searchResults]);
  const currentSearchResultId = searchResults[currentResultIndex];

  // ========== NEWEST LEAF ==========
  const newestLeafById = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (n: TreeNodeData): string => {
      let leaf = n.entry.id;
      for (const c of n.children) walk(c);
      if (n.children.length > 0) { const lc = n.children[n.children.length - 1]; leaf = map.get(lc.entry.id) || lc.entry.id; }
      map.set(n.entry.id, leaf);
      return leaf;
    };
    treeData.forEach(walk);
    return map;
  }, [treeData]);
  const findNewestLeaf = useCallback((nid: string): string => newestLeafById.get(nid) || nid, [newestLeafById]);

  // ========== DISPLAY ==========
  const buildPrefix = (fn: FlatNode): string => {
    const { indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots } = fn;
    const disp = multipleRoots ? Math.max(0, indent - 1) : indent;
    const conn = showConnector && !isVirtualRootChild ? (isLast ? "└─ " : "├─ ") : "";
    const cp = conn ? disp - 1 : -1;
    const chars: string[] = [];
    for (let i = 0; i < disp * 3; i++) { const lv = Math.floor(i / 3), pi2 = i % 3; const g = gutters.find(x => x.position === lv); if (g) chars.push(pi2 === 0 ? (g.show ? "│" : " ") : " "); else if (conn && lv === cp) chars.push(pi2 === 0 ? (isLast ? "└" : "├") : pi2 === 1 ? "─" : " "); else chars.push(" "); }
    return chars.join("");
  };

  const getDisplayText = (e: SessionEntry, label?: string): string => {
    if (label) return label;
    const tr = (s: string, m = 100) => s.length <= m ? s : s.slice(0, m) + "...";
    if (e.type === "message" && e.message) {
      if (e.message.role === "user") { const t = extractContent(e.message.content); return tr(t) || "User"; }
      if (e.message.role === "assistant") {
        const c = Array.isArray(e.message.content) ? e.message.content : [];
        const tc = c.find((x: any) => x.type === "toolCall") as { name?: string; arguments?: unknown } | undefined;
        if (tc?.name) { const a = tc.arguments as Record<string, unknown> | undefined; const p = a?.path || a?.file_path || ""; const cmd = a?.command || ""; return `${tc.name}: ${tr(String(p || cmd), 50)}`; }
        return tr(extractContent(e.message.content)) || "Assistant";
      }
      if (e.message.role === "toolResult") return "tool result";
    }
    if (e.type === "model_change") return `Model: ${e.modelId}`;
    if (e.type === "compaction") return "Compaction";
    if (e.type === "custom_message") return e.customType || "Custom";
    return e.type;
  };
  const getRoleClass = (e: SessionEntry): string => {
    if (e.type === "message" && e.message?.role === "user") return "tree-role-user";
    if (e.type === "message" && e.message?.role === "assistant") return "tree-role-assistant";
    if (e.type === "message" && e.message?.role === "toolResult") return "tree-role-tool";
    if (e.type === "compaction") return "tree-compaction";
    return "tree-muted";
  };
  const getToolName = (e: SessionEntry): string | null => {
    if (e.type !== "message" || e.message?.role !== "assistant") return null;
    const c = Array.isArray(e.message.content) ? e.message.content : [];
    return (c.find((x: any) => x.type === "toolCall") as { name?: string } | undefined)?.name || null;
  };

  // ========== HANDLERS ==========
  const handleNodeClick = useCallback((fn: FlatNode) => {
    const e = fn.node.entry;
    const leafId = findNewestLeaf(e.id);
    if (onNodeClick) onNodeClick(leafId, e.id);
  }, [findNewestLeaf, onNodeClick]);
  const handleSearchNext = useCallback(() => {
    if (!searchResults.length) return; const ni = (currentResultIndex + 1) % searchResults.length; setCurrentResultIndex(ni); const id = searchResults[ni]; if (onNodeClick) onNodeClick(findNewestLeaf(id), id);
  }, [searchResults, currentResultIndex, onNodeClick, findNewestLeaf]);
  const handleSearchPrev = useCallback(() => {
    if (!searchResults.length) return; const ni = (currentResultIndex - 1 + searchResults.length) % searchResults.length; setCurrentResultIndex(ni); const id = searchResults[ni]; if (onNodeClick) onNodeClick(findNewestLeaf(id), id);
  }, [searchResults, currentResultIndex, onNodeClick, findNewestLeaf]);

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
            const prefix = buildPrefix(fn);
            const isActive = entry.id === activeLeafId;
            const isInPath = activePathIds.has(entry.id);
            const marker = isInPath ? "•" : "·";
            const displayText = getDisplayText(entry, fn.node.label);
            const roleClass = getRoleClass(entry);
            const isSearchMatch = searchResultSet.has(entry.id);
            const isCurrentMatch = isSearchMatch && currentSearchResultId === entry.id;
            return (
              <div key={entry.id} className={`tree-node ${isActive ? "active" : ""} ${isInPath ? "in-path" : ""} ${isSearchMatch ? "search-match" : ""} ${isCurrentMatch ? "search-match-current" : ""}`} onClick={() => handleNodeClick(fn)}>
                <span className="tree-prefix">{prefix}</span>
                <span className="tree-marker">{marker}</span>
                {entry.type === "message" && entry.message?.role === "user" ? (
                  <span className={`tree-content tree-content-user ${roleClass}`}><p className="tree-user-label">User:<span className="tree-user-text">{displayText}</span></p></span>
                ) : (
                  <span className={`tree-content ${roleClass}`} style={colorize && getToolName(entry) ? { color: getToolColorVar(getToolName(entry)!) } : undefined}>{displayText}</span>
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
