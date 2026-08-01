import {
  forwardRef,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  AtlasDialog,
  GlobalMap,
  readBranchMapSettings,
  writeBranchMapSettings,
} from "@/components/session-branch-map";
import { useSessionTreeLookup } from "@/hooks/useSessionTreeLookup";
import {
  PluginContributionBoundary,
  PluginContributionSlot,
} from "@/plugins/runtime-host";
import type { PsmSessionTreeViewRuntimeRegistration } from "@/plugins/runtime-host/types";
import type { SessionEntry } from "@/types";
import {
  buildSessionBranchModel,
  buildTreeItems,
  formatNumber,
  formatTimestamp,
  pathSet,
  truncate,
  type EntryTreeItem,
  type GlobalMapSettings,
  type SegmentTreeItem,
  type SessionModel,
  type SessionNode,
  type TreeFilter,
  type TreeItem,
} from "@/utils/session-branch";
import type { TreeFilterMode } from "@/utils/sessionTreeController";

import SessionTreeSearch, {
  type SessionTreeSearchRef,
} from "./SessionTreeSearch";

const ROW_HEIGHT = 36;
const OVERSCAN = 10;
const MAP_COLLAPSED_STORAGE_KEY = "pi-session-manager:branch-map-collapsed";
const FILTERS: Array<{
  value: TreeFilter;
  translationKey: string;
  fallback: string;
}> = [
  {
    value: "default",
    translationKey: "components.branchMap.filters.default",
    fallback: "Default",
  },
  {
    value: "no-tools",
    translationKey: "components.branchMap.filters.noTools",
    fallback: "No tools",
  },
  {
    value: "user-only",
    translationKey: "components.branchMap.filters.user",
    fallback: "User",
  },
  {
    value: "labeled-only",
    translationKey: "components.branchMap.filters.labels",
    fallback: "Labels",
  },
  {
    value: "all",
    translationKey: "components.branchMap.filters.all",
    fallback: "All",
  },
];

function readMapCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MAP_COLLAPSED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
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
  hasMoreHistory?: boolean;
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
      hasMoreHistory = false,
      filter = "no-tools",
      onRequestClose,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const searchRef = useRef<SessionTreeSearchRef>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [viewportHeight, setViewportHeight] = useState(320);
    const [scrollTop, setScrollTop] = useState(0);
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [treeFilter, setTreeFilter] = useState<TreeFilter>(() =>
      normalizeTreeFilter(filter),
    );
    const [includeSearchContext, setIncludeSearchContext] = useState(true);
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [mapCollapsed, setMapCollapsed] = useState(readMapCollapsed);
    const [atlasOpen, setAtlasOpen] = useState(false);
    const [mapSettings, setMapSettings] = useState<GlobalMapSettings>(
      readBranchMapSettings,
    );
    const [focusedUid, setFocusedUid] = useState<string | null>(null);
    const [selectedUid, setSelectedUid] = useState<string | null>(null);
    const [searchMatchIndex, setSearchMatchIndex] = useState(0);
    const [activePluginViewId, setActivePluginViewId] = useState<string | null>(
      null,
    );

    useImperativeHandle(
      ref,
      () => ({ focusSearch: () => searchRef.current?.focus() }),
      [],
    );

    const model = useMemo<SessionModel | null>(() => {
      if (entries.length === 0) return null;
      return buildSessionBranchModel(entries, {
        sessionName: sessionPath.split(/[\\/]/).pop() || "session",
        labelsByTargetId: resolvedLabelsByTargetId,
      });
    }, [entries, resolvedLabelsByTargetId, sessionPath]);

    const activeLeafUid = useMemo(() => {
      if (!model) return "";
      return (
        (activeLeafId ? model.firstById.get(activeLeafId)?.uid : undefined) ??
        model.defaultLeaf.uid
      );
    }, [activeLeafId, model]);
    const activePath = useMemo(
      () => (model ? pathSet(model, activeLeafUid) : new Set<string>()),
      [activeLeafUid, model],
    );
    const { resolveScrollTarget } = useSessionTreeLookup(entries, activeLeafId);

    const items = useMemo(
      () =>
        model
          ? buildTreeItems({
              model,
              activeLeafUid,
              filter: treeFilter,
              search: deferredSearch,
              includeSearchContext,
              collapsed,
            })
          : [],
      [
        activeLeafUid,
        collapsed,
        deferredSearch,
        includeSearchContext,
        model,
        treeFilter,
      ],
    );
    const entryItems = useMemo(
      () =>
        items.filter((item): item is EntryTreeItem => item.kind === "entry"),
      [items],
    );
    const visibleEntryUids = useMemo(
      () => entryItems.map((item) => item.node.uid),
      [entryItems],
    );
    const searchMatches = useMemo(
      () =>
        search
          ? entryItems
              .filter((item) => item.matchesSearch)
              .map((item) => item.node.uid)
          : [],
      [entryItems, search],
    );

    useEffect(() => {
      const element = scrollRef.current;
      if (!element || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(([entry]) => {
        setViewportHeight(
          entry?.contentRect.height || element.clientHeight || 320,
        );
      });
      observer.observe(element);
      setViewportHeight(element.clientHeight || 320);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      setSearch("");
      setTreeFilter(normalizeTreeFilter(filter));
      setCollapsed(new Set());
      setSearchMatchIndex(0);
      setScrollTop(0);
      setFocusedUid(activeLeafUid || null);
      setSelectedUid(activeLeafUid || null);
      scrollRef.current?.scrollTo({ top: 0 });
    }, [filter, sessionPath]);

    useEffect(() => {
      if (!search) return;
      setCollapsed(new Set());
      setSearchMatchIndex(0);
    }, [search]);

    useEffect(() => {
      writeBranchMapSettings(mapSettings);
    }, [mapSettings]);

    useEffect(() => {
      try {
        window.localStorage.setItem(
          MAP_COLLAPSED_STORAGE_KEY,
          String(mapCollapsed),
        );
      } catch {
        // Storage can be unavailable in hardened WebViews; the in-memory state
        // still keeps the control usable for the current session.
      }
    }, [mapCollapsed]);

    useEffect(() => {
      if (!activeLeafUid) return;
      setFocusedUid((current) => current ?? activeLeafUid);
      setSelectedUid((current) => current ?? activeLeafUid);
      setCollapsed((current) =>
        expandSegmentPath(current, model, activeLeafUid),
      );
    }, [activeLeafUid, model]);

    useEffect(() => {
      if (visibleEntryUids.length === 0) {
        setFocusedUid(null);
        return;
      }
      if (focusedUid && visibleEntryUids.includes(focusedUid)) return;
      const fallback =
        (selectedUid && visibleEntryUids.includes(selectedUid) ? selectedUid : null) ??
        (activeLeafUid && visibleEntryUids.includes(activeLeafUid) ? activeLeafUid : null) ??
        visibleEntryUids[0];
      setFocusedUid(fallback ?? null);
      if (!selectedUid || !visibleEntryUids.includes(selectedUid)) {
        setSelectedUid(fallback ?? null);
      }
    }, [activeLeafUid, focusedUid, selectedUid, visibleEntryUids]);

    useEffect(() => {
      if (!focusedUid) return;
      const index = items.findIndex(
        (item) => item.kind === "entry" && item.node.uid === focusedUid,
      );
      const scroll = scrollRef.current;
      if (index < 0 || !scroll) return;
      const top = index * ROW_HEIGHT;
      const bottom = top + ROW_HEIGHT;
      if (top < scroll.scrollTop) scroll.scrollTo({ top });
      if (bottom > scroll.scrollTop + scroll.clientHeight) {
        scroll.scrollTo({ top: Math.max(0, bottom - scroll.clientHeight) });
      }
    }, [focusedUid, items]);

    const activateNode = useCallback(
      (uid: string) => {
        const node = model?.uidMap.get(uid);
        if (!node) return;
        const leaf = node.children.length > 0 ? node.newestLeaf : node;
        const targetId = resolveScrollTarget(node.id);
        setFocusedUid(uid);
        setSelectedUid(uid);
        setCollapsed((current) => expandSegmentPath(current, model, uid));
        onNodeClick?.(leaf.id, targetId);
      },
      [model, onNodeClick, resolveScrollTarget],
    );

    const selectNode = useCallback((uid: string) => {
      setFocusedUid(uid);
      setSelectedUid(uid);
    }, []);

    const moveFocus = useCallback(
      (delta: number) => {
        if (visibleEntryUids.length === 0) return;
        const currentIndex = focusedUid
          ? visibleEntryUids.indexOf(focusedUid)
          : -1;
        const base = currentIndex < 0 ? (delta > 0 ? -1 : 0) : currentIndex;
        const nextIndex = Math.max(
          0,
          Math.min(visibleEntryUids.length - 1, base + delta),
        );
        setFocusedUid(visibleEntryUids[nextIndex] ?? null);
      },
      [focusedUid, visibleEntryUids],
    );

    const toggleSegment = useCallback((segmentUid: string) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(segmentUid)) next.delete(segmentUid);
        else next.add(segmentUid);
        return next;
      });
    }, []);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!model) return;
        const pageSize = Math.max(5, Math.floor(viewportHeight / ROW_HEIGHT));
        if (event.key === "ArrowUp") moveFocus(-1);
        else if (event.key === "ArrowDown") moveFocus(1);
        else if (event.key === "PageUp") moveFocus(-pageSize);
        else if (event.key === "PageDown") moveFocus(pageSize);
        else if (event.key === "Home")
          setFocusedUid(visibleEntryUids[0] ?? null);
        else if (event.key === "End")
          setFocusedUid(visibleEntryUids.at(-1) ?? null);
        else if (event.key === "Enter" && focusedUid) activateNode(focusedUid);
        else if (event.key === " " && focusedUid) setSelectedUid(focusedUid);
        else if (event.key === "ArrowLeft" && focusedUid) {
          const node = model.uidMap.get(focusedUid);
          const segment = node?.segment;
          if (!segment) return;
          if (!collapsed.has(segment.uid)) toggleSegment(segment.uid);
          else if (segment.parent) setFocusedUid(segment.parent.end.uid);
        } else if (event.key === "ArrowRight" && focusedUid) {
          const node = model.uidMap.get(focusedUid);
          const segment = node?.segment;
          if (!segment) return;
          if (collapsed.has(segment.uid)) toggleSegment(segment.uid);
          else if (segment.children[0])
            setFocusedUid(segment.children[0].start.uid);
        } else if (event.key === "Escape") {
          if (search) setSearch("");
          else onRequestClose?.();
        } else return;
        event.preventDefault();
      },
      [
        activateNode,
        collapsed,
        focusedUid,
        model,
        moveFocus,
        onRequestClose,
        search,
        toggleSegment,
        viewportHeight,
        visibleEntryUids,
      ],
    );

    const goToSearchMatch = useCallback(
      (direction: 1 | -1) => {
        if (searchMatches.length === 0) return;
        setSearchMatchIndex((current) => {
          const next =
            (current + direction + searchMatches.length) % searchMatches.length;
          setFocusedUid(searchMatches[next] ?? null);
          return next;
        });
      },
      [searchMatches],
    );

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN,
    );
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
    );
    const visibleItems = items.slice(startIndex, endIndex);
    const stickyHeaders = useMemo(
      () => computeStickySegmentHeaders(items, scrollTop, ROW_HEIGHT),
      [items, scrollTop],
    );
    const stickyKeys = useMemo(
      () => new Set(stickyHeaders.map((item) => item.key)),
      [stickyHeaders],
    );
    const currentSearchUid =
      searchMatches[searchMatchIndex] ?? searchMatches[0] ?? null;
    const activePluginView =
      pluginViews.find((view) => view.id === activePluginViewId) ?? null;

    useEffect(() => {
      if (!activePluginViewId) return;
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setActivePluginViewId(null);
      };
      window.addEventListener("keydown", closeOnEscape, { capture: true });
      return () =>
        window.removeEventListener("keydown", closeOnEscape, { capture: true });
    }, [activePluginViewId]);

    return (
      <div className="flex h-full min-h-0 flex-col session-tree-shell branch-outline-shell">
        {model && !hasMoreHistory ? (
          <div
            className={`branch-map-view branch-map-overview ${mapCollapsed ? "is-collapsed" : ""}`}
          >
            <GlobalMap
              model={model}
              activeLeafUid={activeLeafUid}
              selectedUid={selectedUid ?? activeLeafUid}
              settings={mapSettings}
              collapsed={mapCollapsed}
              onCollapsedChange={setMapCollapsed}
              onSettingsChange={setMapSettings}
              onSelectNode={selectNode}
              onActivateNode={activateNode}
              onOpenAtlas={() => setAtlasOpen(true)}
            />
          </div>
        ) : hasMoreHistory ? (
          <div className="branch-map-loading" role="status">
            {t(
              "components.branchMap.loadingTopology",
              "Loading complete branch topology...",
            )}
          </div>
        ) : null}

        <SessionTreeSearch
          ref={searchRef}
          searchQuery={search}
          onSearchChange={setSearch}
          onClear={() => setSearch("")}
          onNext={() => goToSearchMatch(1)}
          onPrevious={() => goToSearchMatch(-1)}
          onSubmit={() => {
            const uid = currentSearchUid ?? focusedUid;
            if (uid) activateNode(uid);
          }}
          currentIndex={searchMatchIndex}
          totalResults={searchMatches.length}
        />

        <div className="branch-outline-controls">
          <label className="branch-filter-field">
            <span className="sr-only">
              {t("components.branchMap.filters.label", "Tree filter")}
            </span>
            <select
              className="tree-filter-select"
              aria-label={t(
                "components.branchMap.filters.label",
                "Tree filter",
              )}
              value={treeFilter}
              onChange={(event) => {
                setTreeFilter(event.target.value as TreeFilter);
                setCollapsed(new Set());
              }}
            >
              {FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.translationKey, item.fallback)}
                </option>
              ))}
            </select>
          </label>
          {search ? (
            <label className="branch-search-context">
              <input
                type="checkbox"
                checked={includeSearchContext}
                onChange={(event) =>
                  setIncludeSearchContext(event.target.checked)
                }
              />
              {t("components.branchMap.filters.context", "Context")}
            </label>
          ) : null}
          {pluginViews.length > 0 ? (
            <details className="tree-view-menu">
              <summary>
                <span>
                  {t("components.branchMap.views.label", "Views")}
                </span>
                <b>{pluginViews.length}</b>
              </summary>
              <div
                className="tree-view-popover"
                role="toolbar"
                aria-label={t(
                  "components.branchMap.views.menu",
                  "Plugin views",
                )}
              >
                {pluginViews.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className="tree-plugin-view-button"
                    aria-haspopup="dialog"
                    onClick={() => setActivePluginViewId(view.id)}
                    title={view.title}
                  >
                    {view.title}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div
          ref={scrollRef}
          className="tree-container branch-outline-scroll"
          role="tree"
          aria-label={t(
            "components.branchMap.treeAriaLabel",
            "Session branch outline",
          )}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div
            className="branch-virtual-spacer"
            style={{ height: items.length * ROW_HEIGHT }}
          >
            {stickyHeaders.length > 0 ? (
              <div className="branch-sticky-anchor">
                <div className="branch-sticky-inner">
                  {stickyHeaders.map((item, stackIndex) => (
                    <SegmentRow
                      key={`sticky:${item.key}`}
                      item={item}
                      top={stackIndex * ROW_HEIGHT}
                      sticky
                      collapsed={collapsed.has(item.segment.uid)}
                      onToggle={() => toggleSegment(item.segment.uid)}
                      onSelect={() => selectNode(item.segment.start.uid)}
                      onActivate={() => activateNode(item.segment.end.uid)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {visibleItems.map((item, visibleIndex) => {
              const index = startIndex + visibleIndex;
              if (item.kind === "segment") {
                if (stickyKeys.has(item.key)) return null;
                return (
                  <SegmentRow
                    key={item.key}
                    item={item}
                    top={index * ROW_HEIGHT}
                    collapsed={collapsed.has(item.segment.uid)}
                    onToggle={() => toggleSegment(item.segment.uid)}
                    onSelect={() => selectNode(item.segment.start.uid)}
                    onActivate={() => activateNode(item.segment.end.uid)}
                  />
                );
              }
              return (
                <EntryRow
                  key={item.key}
                  item={item}
                  top={index * ROW_HEIGHT}
                  selected={item.node.uid === selectedUid}
                  focused={item.node.uid === focusedUid}
                  activeLeaf={item.node.uid === activeLeafUid}
                  activePath={activePath.has(item.node.uid)}
                  searchActive={Boolean(search)}
                  onSelect={() => selectNode(item.node.uid)}
                  onActivate={() => activateNode(item.node.uid)}
                  onFocus={() => setFocusedUid(item.node.uid)}
                />
              );
            })}
          </div>
          {items.length === 0 ? (
            <div className="tree-empty">{t("components.branchMap.noMatchingEntries", "No matching entries")}</div>
          ) : null}
        </div>

        <footer className="tree-status branch-outline-status" role="status">
          <span>
            {t("components.branchMap.status.compact", {
              entries: formatNumber(entryItems.length),
              segments: formatNumber(
                items.filter((item) => item.kind === "segment").length,
              ),
              endings: formatNumber(model?.terminalSegments.length ?? 0),
              forks: formatNumber(model?.forks.length ?? 0),
              defaultValue:
                "{{entries}} entries · {{segments}} segments · {{endings}} endings · {{forks}} forks",
            })}
          </span>
          {model?.topologyQuality !== "full" ? (
            <span className="branch-topology-quality">
              {model?.topologyQuality === "unknown"
                ? t(
                    "components.branchMap.status.linearFallback",
                    "linear fallback",
                  )
                : t(
                    "components.branchMap.status.inferredTopology",
                    "inferred topology",
                  )}
            </span>
          ) : null}
        </footer>

        {model && !hasMoreHistory ? (
          <AtlasDialog
            open={atlasOpen}
            model={model}
            activeLeafUid={activeLeafUid}
            selectedUid={selectedUid ?? activeLeafUid}
            settings={mapSettings}
            onSettingsChange={setMapSettings}
            onSelectNode={selectNode}
            onActivateNode={activateNode}
            onClose={() => setAtlasOpen(false)}
          />
        ) : null}

        {activePluginView && typeof document !== "undefined"
          ? createPortal(
              <div
                className="session-tree-plugin-dialog-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setActivePluginViewId(null);
                }}
              >
                <section
                  className="session-tree-plugin-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="session-tree-plugin-dialog-title"
                  data-no-window-drag
                >
                  <header className="session-tree-plugin-dialog-header">
                    <div className="min-w-0">
                      <h2 id="session-tree-plugin-dialog-title" className="session-tree-plugin-dialog-title">
                        {activePluginView.title}
                      </h2>
                      <div className="session-tree-plugin-dialog-subtitle">
                        {t("components.branchMap.views.dialogEntryCount", {
                          count: entries.length,
                          defaultValue: "{{count}} JSONL entries",
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="session-tree-plugin-dialog-close"
                      onClick={() => setActivePluginViewId(null)}
                      aria-label={t(
                        "components.branchMap.views.close",
                        "Close",
                      )}
                    >
                      ×
                    </button>
                  </header>
                  <div className="session-tree-plugin-dialog-body">
                    <PluginContributionBoundary
                      pluginId={activePluginView.pluginId}
                      contributionId={activePluginView.id}
                      title={activePluginView.title}
                    >
                      <PluginContributionSlot
                        render={() =>
                          hasMoreHistory ? (
                            <div className="branch-map-loading" role="status">
                              {t(
                                "components.branchMap.loadingTopology",
                                "Loading complete branch topology...",
                              )}
                            </div>
                          ) : (
                            activePluginView.render({
                              session: { path: sessionPath },
                              activeEntryId: activeLeafId ?? null,
                              entries: entries as any,
                              labelsByTargetId: resolvedLabelsByTargetId,
                              filter: treeFilter,
                              closeView: () => setActivePluginViewId(null),
                              onNavigate: onNodeClick,
                            })
                          )
                        }
                      />
                    </PluginContributionBoundary>
                  </div>
                </section>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  }),
);

function normalizeTreeFilter(
  filter: TreeFilterMode | `tool-${string}`,
): TreeFilter {
  return FILTERS.some((item) => item.value === filter)
    ? (filter as TreeFilter)
    : "no-tools";
}

function expandSegmentPath(
  collapsed: ReadonlySet<string>,
  model: SessionModel | null,
  uid: string,
): Set<string> {
  const next = new Set(collapsed);
  let segment = model?.uidMap.get(uid)?.segment ?? null;
  while (segment) {
    next.delete(segment.uid);
    segment = segment.parent;
  }
  return next;
}

export function computeStickySegmentHeaders(
  items: TreeItem[],
  scrollTop: number,
  rowHeight: number,
): SegmentTreeItem[] {
  const byLevel = new Map<number, SegmentTreeItem>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind !== "segment" || index * rowHeight > scrollTop) continue;
    let end = index + 1;
    while (end < items.length) {
      const next = items[end];
      if (next?.kind === "segment" && next.indent <= item.indent) break;
      end += 1;
    }
    if (scrollTop < end * rowHeight) byLevel.set(item.indent, item);
  }
  return [...byLevel.keys()]
    .sort((left, right) => left - right)
    .map((level) => byLevel.get(level)!);
}

function SegmentRow({
  item,
  top,
  sticky = false,
  collapsed,
  onToggle,
  onSelect,
  onActivate,
}: {
  item: SegmentTreeItem;
  top: number;
  sticky?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onActivate: () => void;
}) {
  const { t } = useTranslation();
  const { segment } = item;
  const style: CSSProperties = sticky
    ? { top }
    : { transform: `translateY(${top}px)` };
  return (
    <div
      className={[
        "branch-segment-row",
        sticky ? "is-sticky-header" : "",
        item.activeLineage ? "is-active-lineage" : "",
        item.activeTerminal ? "is-active-terminal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="treeitem"
      aria-level={item.indent + 1}
      aria-expanded={!collapsed}
      onClick={onSelect}
      onDoubleClick={onActivate}
    >
      <BranchRails
        continuation={item.ancestorContinuation}
        level={item.indent}
        segment
      />
      <button
        type="button"
        className="branch-segment-fold"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={t(
          collapsed
            ? "components.branchMap.segment.expand"
            : "components.branchMap.segment.collapse",
          {
            code: segment.code,
            defaultValue: `${collapsed ? "Expand" : "Collapse"} {{code}}`,
          },
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      <span className="branch-segment-code">{segment.code}</span>
      <div className="branch-segment-copy">
        <div>
          <strong>
            {segment.level === 0
              ? t("components.branchMap.segment.mainLine", "Main line")
              : t("components.branchMap.segment.branch", "Branch")}
          </strong>
          <span>
            {truncate(segment.firstUserSummary || segment.start.summary, 120)}
          </span>
        </div>
        <small>
          {t("components.branchMap.segment.entries", {
            count: segment.nodes.length,
            defaultValue: "{{count}} entries",
          })}
          {segment.forkAnchor
            ? ` · ${t("components.branchMap.segment.from", {
                sequence: segment.forkAnchor.sequence,
                defaultValue: "from #{{sequence}}",
              })}`
            : ` · ${t(
                "components.branchMap.segment.sessionRoot",
                "session root",
              )}`}
          {segment.noteCount
            ? ` · ${t("components.branchMap.segment.notes", {
                count: segment.noteCount,
                defaultValue: "{{count}} notes",
              })}`
            : ""}
        </small>
      </div>
      <div className="branch-segment-state">
        {item.activeTerminal ? (
          <b>{t("components.branchMap.segment.active", "ACTIVE")}</b>
        ) : item.activeLineage ? (
          <b>{t("components.branchMap.segment.path", "PATH")}</b>
        ) : null}
        {segment.children.length > 1 ? (
          <span>
            {t("components.branchMap.segment.forks", {
              count: segment.children.length,
              defaultValue: "{{count}} forks",
            })}
          </span>
        ) : segment.terminal ? (
          <span>{t("components.branchMap.segment.end", "END")}</span>
        ) : null}
        {item.visibleEntryCount !== segment.nodes.length ? (
          <em>
            {item.visibleEntryCount}/{segment.nodes.length}
          </em>
        ) : null}
      </div>
    </div>
  );
}

function EntryRow({
  item,
  top,
  selected,
  focused,
  activeLeaf,
  activePath,
  searchActive,
  onSelect,
  onActivate,
  onFocus,
}: {
  item: EntryTreeItem;
  top: number;
  selected: boolean;
  focused: boolean;
  activeLeaf: boolean;
  activePath: boolean;
  searchActive: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onFocus: () => void;
}) {
  const { t } = useTranslation();
  const { node } = item;
  const relationLabel =
    node.relation === "branch-start"
      ? t(
          "components.branchMap.entry.relation.branchStart",
          "Branch start",
        )
      : node.relation === "root"
        ? t("components.branchMap.entry.relation.root", "Sequence start")
        : node.children.length > 1
          ? t(
              "components.branchMap.entry.relation.forkAnchor",
              "Fork anchor",
            )
          : t(
              "components.branchMap.entry.relation.linear",
              "Linear continuation",
            );
  return (
    <div
      className={[
        "branch-entry-row",
        selected ? "is-selected" : "",
        focused ? "is-focused" : "",
        activeLeaf ? "is-active-leaf" : "",
        activePath ? "is-active-path" : "",
        item.matchesSearch && searchActive ? "is-match" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: `translateY(${top}px)` }}
      role="treeitem"
      aria-level={item.indent + 2}
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={onSelect}
      onDoubleClick={onActivate}
    >
      <BranchRails
        continuation={item.ancestorContinuation}
        level={item.indent}
      />
      <span className="branch-entry-sequence">#{node.sequence}</span>
      <span className={`branch-entry-kind kind-${node.kind}`}>
        {nodeKindBadge(node)}
      </span>
      <div className="branch-entry-copy">
        <div>
          {node.label ? <mark>#{node.label}</mark> : null}
          {node.entry.type === "session_info" ? (
            <mark>{t("components.branchMap.entry.rename", "RENAME")}</mark>
          ) : null}
          {node.entry.type === "model_change" ? (
            <mark>{t("components.branchMap.entry.model", "MODEL")}</mark>
          ) : null}
          {node.entry.type === "label" ? (
            <mark>{t("components.branchMap.entry.label", "LABEL")}</mark>
          ) : null}
          <span>{truncate(node.summary, 180)}</span>
        </div>
        <small>
          {relationLabel} · {node.id} · {formatTimestamp(node.timestampMs).slice(-8)}
        </small>
      </div>
      {item.isForkAnchor ? (
        <span className="branch-fork-chip">
          {t("components.branchMap.entry.fork", {
            count: node.children.length,
            defaultValue: "FORK {{count}}",
          })}
        </span>
      ) : null}
      {activePath ? (
        <span
          className="branch-path-dot"
          aria-label={t(
            "components.branchMap.entry.activePath",
            "Active path",
          )}
        >
          ●
        </span>
      ) : null}
    </div>
  );
}

function BranchRails({
  continuation,
  level,
  segment = false,
}: {
  continuation: boolean[];
  level: number;
  segment?: boolean;
}) {
  return (
    <div
      className={`branch-rails ${segment ? "is-segment" : ""}`}
      style={{ width: Math.max(12, (level + 1) * 16) }}
      aria-hidden="true"
    >
      {continuation.map((show, index) => (
        <i
          key={index}
          className={show ? "show-line" : ""}
          style={{ left: index * 16 + 7 }}
        />
      ))}
      <i className="current-rail" style={{ left: level * 16 + 7 }} />
      {segment && level > 0 ? (
        <i className="branch-elbow" style={{ left: level * 16 - 9 }} />
      ) : null}
    </div>
  );
}

function nodeKindBadge(node: SessionNode): string {
  if (node.entry.type === "message") {
    const role = node.entry.message?.role;
    if (role === "user") return "U";
    if (role === "assistant") return "A";
    if (role === "toolResult") return "T";
    if (role === "bashExecution") return "$";
    return "M";
  }
  if (node.entry.type === "model_change") return "◇";
  if (node.entry.type === "session_info") return "R";
  if (node.entry.type === "label") return "#";
  if (node.entry.type === "compaction") return "C";
  if (node.entry.type === "branch_summary") return "B";
  return "·";
}

export default SessionTree;
