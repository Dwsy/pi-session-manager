import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ListFilter, Check, Plus, Search, Calendar, ChevronRight, ArrowLeft, ArrowUpDown, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import type { Tag as TagType, SessionTag, DateRange } from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import CompositionInput from "@/components/ui/CompositionInput";
import { AgentIcon } from "@/components/session-viewer/AgentIcon";

const COLOR_CSS: Record<string, string> = {
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f97316",
  destructive: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  indigo: "#6366f1",
  amber: "#f59e0b",
  emerald: "#10b981",
  cyan: "#06b6d4",
  slate: "#64748b",
  ring: "#06b6d4",
};

function resolveColor(color: string): string {
  if (color.startsWith("#")) return color;
  return COLOR_CSS[color] || "#3b82f6";
}

function LabelIcon({
  color,
  hasChildren,
}: {
  color: string;
  hasChildren?: boolean;
}) {
  const fill = resolveColor(color);
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
      <circle cx="4" cy="4" r="3.5" fill={fill} />
      {hasChildren && (
        <circle
          cx="4"
          cy="4"
          r="1.2"
          fill="var(--background, #1a1a2e)"
          fillOpacity="0.85"
        />
      )}
    </svg>
  );
}

function isToday(range: DateRange): boolean {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return range.start.getTime() === startOfDay.getTime();
}

function isLast24h(range: DateRange): boolean {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return Math.abs(range.start.getTime() - start.getTime()) < 60 * 1000;
}

function isLast2Days(range: DateRange): boolean {
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  return Math.abs(range.start.getTime() - start.getTime()) < 60 * 1000;
}

function isLast7Days(range: DateRange): boolean {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return range.start.getTime() === start.getTime();
}

function isLast30Days(range: DateRange): boolean {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return range.start.getTime() === start.getTime();
}

const SORT_OPTIONS: Array<{ value: SessionSortBy; labelKey: string; fallback: string }> = [
  { value: "modified", labelKey: "session.sort.short.modified", fallback: "Modified" },
  { value: "created", labelKey: "session.sort.short.created", fallback: "Created" },
  { value: "name", labelKey: "session.sort.short.name", fallback: "Name" },
  { value: "size", labelKey: "session.sort.short.size", fallback: "Size" },
];

interface LabelFilterProps {
  tags: TagType[];
  sessionTags: SessionTag[];
  filterTagIds: string[];
  onFilterChange: (tagIds: string[]) => void;
  sourceOptions?: Array<{ slug: string; label: string }>;
  selectedSourceSlugs?: string[];
  onSourceFilterChange?: (slugs: string[]) => void;
  modelOptions?: string[];
  selectedModel?: string;
  onModelFilterChange?: (model: string) => void;
  dateRange?: DateRange | null;
  onDateRangeChange?: (range: DateRange | null) => void;
  sortBy?: SessionSortBy;
  sortOrder?: SessionSortOrder;
  onSortByChange?: (sortBy: SessionSortBy) => void;
  onSortOrderChange?: (sortOrder: SessionSortOrder) => void;
  onCreateTag?: (name: string, color: string, parentId?: string) => void;
  getDescendantIds: (tagId: string) => string[];
}

type MenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
  transform: string;
  transformOrigin: "top left" | "bottom left";
};

export default function LabelFilter({
  tags,
  sessionTags,
  filterTagIds,
  onFilterChange,
  sourceOptions = [],
  selectedSourceSlugs = [],
  onSourceFilterChange,
  modelOptions = [],
  selectedModel,
  onModelFilterChange,
  dateRange,
  onDateRangeChange,
  sortBy = "modified",
  sortOrder = "desc",
  onSortByChange,
  onSortOrderChange,
  onCreateTag,
  getDescendantIds,
}: LabelFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"sources" | "models" | "dates" | "statuses" | "labels" | "sort" | null>(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const clickPointRef = useRef<{ x: number; y: number } | null>(null);
  const [menuReady, setMenuReady] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    maxHeight: 360,
    transform: "translateY(0)",
    transformOrigin: "top left",
  });

  const activeCount =
    filterTagIds.length +
    selectedSourceSlugs.length +
    (selectedModel ? 1 : 0) +
    (dateRange ? 1 : 0);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSubmenu(null);
        setFilter("");
        setCreating(false);
        setNewName("");
        setMenuReady(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (submenu) {
          setSubmenu(null);
        } else {
          setOpen(false);
          setFilter("");
          setCreating(false);
          setNewName("");
          setMenuReady(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, submenu]);

  useEffect(() => {
    if (!open) return;
    const rafId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(rafId);
  }, [open]);

  const updateMenuPosition = useCallback(() => {
    const viewportPadding = 8;
    const gap = 10;
    const menuWidth =
      menuRef.current?.offsetWidth ??
      Math.min(280, Math.max(180, window.innerWidth - viewportPadding * 2));
    const menuHeight = menuRef.current?.offsetHeight ?? 360;
    const anchor = clickPointRef.current;
    const fallbackRect = triggerRef.current?.getBoundingClientRect();

    const originX =
      anchor?.x ?? (fallbackRect ? fallbackRect.right : window.innerWidth / 2);
    const originY =
      anchor?.y ?? (fallbackRect ? fallbackRect.bottom : window.innerHeight / 2);

    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
    const boundedMenuWidth = Math.min(menuWidth, availableWidth || menuWidth);
    const spaceBelow = window.innerHeight - originY - gap - viewportPadding;
    const spaceAbove = originY - gap - viewportPadding;
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      120,
      Math.floor(openUpward ? spaceAbove : spaceBelow),
    );

    let left = originX + gap;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - boundedMenuWidth - viewportPadding),
    );

    const top = openUpward ? originY - gap : originY + gap;

    setMenuPosition({
      top,
      left,
      maxHeight,
      transform: openUpward ? "translateY(-100%)" : "translateY(0)",
      transformOrigin: openUpward ? "bottom left" : "top left",
    });
    setMenuReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    setMenuReady(false);
    updateMenuPosition();
    const rafId = requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  const countMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of sessionTags) {
      map.set(st.tagId, (map.get(st.tagId) || 0) + 1);
    }
    return map;
  }, [sessionTags]);

  const flatItems = useMemo(() => {
    const result: { tag: TagType; parentPath: string; depth: number }[] = [];
    const walk = (parentId: string | null, path: string, depth: number) => {
      const children = tags
        .filter((t) => (t.parentId || null) === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      for (const tag of children) {
        result.push({ tag, parentPath: path, depth });
        walk(tag.id, path ? `${path} / ${tag.name}` : tag.name, depth + 1);
      }
    };
    walk(null, "", 0);
    return result;
  }, [tags]);

  const statusItems = useMemo(
    () => flatItems.filter((i) => i.tag.isBuiltin),
    [flatItems],
  );
  const labelItems = useMemo(
    () => flatItems.filter((i) => !i.tag.isBuiltin),
    [flatItems],
  );

  const filteredStatuses = useMemo(() => {
    if (!filter.trim()) return statusItems;
    const q = filter.toLowerCase();
    return statusItems.filter((i) => i.tag.name.toLowerCase().includes(q));
  }, [statusItems, filter]);

  const filteredLabels = useMemo(() => {
    if (!filter.trim()) return labelItems;
    const q = filter.toLowerCase();
    return labelItems.filter(
      (i) =>
        i.tag.name.toLowerCase().includes(q) ||
        i.parentPath.toLowerCase().includes(q),
    );
  }, [labelItems, filter]);

  const handleToggle = useCallback(
    (tagId: string) => {
      const allIds = [tagId, ...getDescendantIds(tagId)];
      const anyActive = allIds.some((id) => filterTagIds.includes(id));
      if (anyActive) {
        onFilterChange(filterTagIds.filter((id) => !allIds.includes(id)));
      } else {
        onFilterChange([...new Set([...filterTagIds, ...allIds])]);
      }
    },
    [filterTagIds, onFilterChange, getDescendantIds],
  );

  if (tags.length === 0 && !onCreateTag) return null;

  const renderItem = ({
    tag,
    parentPath,
    depth,
  }: {
    tag: TagType;
    parentPath: string;
    depth: number;
  }) => {
    const isSelected = filterTagIds.includes(tag.id);
    const hasChildren = tags.some((t) => t.parentId === tag.id);
    const descendantIds = getDescendantIds(tag.id);
    const totalCount =
      (countMap.get(tag.id) || 0) +
      descendantIds.reduce((sum, id) => sum + (countMap.get(id) || 0), 0);

    return (
      <button
        key={tag.id}
        onClick={() => handleToggle(tag.id)}
        className="flex w-full select-none items-center gap-2.5 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
        style={{
          paddingLeft: `${8 + depth * 14}px`,
          width: "calc(100% - 8px)",
        }}
      >
        <LabelIcon color={tag.color} hasChildren={hasChildren} />
        <span className="flex-1 min-w-0 truncate text-left">
          {filter.trim() && parentPath ? (
            <>
              <span className="text-muted-foreground/50">{parentPath} / </span>
              {tag.name}
            </>
          ) : (
            tag.name
          )}
        </span>
        {totalCount > 0 && (
          <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
            {totalCount}
          </span>
        )}
        {isSelected && (
          <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
        )}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={(event) => {
          if (open) {
            setOpen(false);
            setMenuReady(false);
            return;
          }
          clickPointRef.current = { x: event.clientX, y: event.clientY };
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] text-[12px] select-none motion-color motion-press focus-ring ${
          activeCount > 0
            ? "bg-foreground/[0.08] text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]"
        }`}
      >
        <ListFilter className="h-3 w-3" />
        {activeCount > 0 && (
          <span className="text-[11px] font-medium tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              maxHeight: menuPosition.maxHeight,
              transform: menuPosition.transform,
              transformOrigin: menuPosition.transformOrigin,
              opacity: menuReady ? 1 : 0,
              pointerEvents: menuReady ? "auto" : "none",
            }}
            className="z-[70] flex w-[280px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[8px] border border-border/50 bg-popover text-popover-foreground shadow-lg transition-opacity duration-75"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <span className="text-[13px] font-medium">
                {t("tags.filter.filterChats")}
              </span>
              {activeCount > 0 && (
                <button
                  onClick={() => {
                    onFilterChange([]);
                    onSourceFilterChange?.([]);
                    onModelFilterChange?.("");
                    onDateRangeChange?.(null);
                    setFilter("");
                    setSubmenu(null);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
                >
                  {t("tags.filter.clearFilter")}
                </button>
              )}
            </div>

            {/* Search */}
            <div className="border-b border-border/50 px-3 py-2 flex items-center gap-2">
              <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <CompositionInput
                ref={inputRef}
                type="text"
                value={filter}
                onChange={setFilter}
                placeholder={t("tags.filter.searchPlaceholder")}
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Menu content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {submenu === null ? (
                /* Main menu: category list */
                <div className="py-1">
                  {/* Sources */}
                  {onSourceFilterChange && sourceOptions.length > 0 && (
                    <button
                      onClick={() => setSubmenu("sources")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <span className="flex-1 text-left">{t("tags.filter.sources", "Sources")}</span>
                      {selectedSourceSlugs.length > 0 && (
                        <span className="text-[11px] text-muted-foreground/60">{selectedSourceSlugs.length}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </button>
                  )}
                  {/* Models */}
                  {onModelFilterChange && modelOptions.length > 0 && (
                    <button
                      onClick={() => setSubmenu("models")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <span className="flex-1 text-left">{t("tags.filter.models", "Models")}</span>
                      {selectedModel && (
                        <span className="text-[11px] text-muted-foreground/60 truncate max-w-[100px]">{selectedModel}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </button>
                  )}
                  {/* Date Range */}
                  {onDateRangeChange && (
                    <button
                      onClick={() => setSubmenu("dates")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="flex-1 text-left">{t("tags.filter.dateRange", "Date Range")}</span>
                      {dateRange && (
                        <span className="text-[11px] text-muted-foreground/60">{t("tags.filter.active", "Active")}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </button>
                  )}
                  {/* Sort */}
                  {onSortByChange && (
                    <button
                      onClick={() => setSubmenu("sort")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="flex-1 text-left">{t("session.sort.label", "Sort")}</span>
                      <span className="text-[11px] text-muted-foreground/60 truncate max-w-[80px] flex items-center gap-0.5">
                        {t(SORT_OPTIONS.find(o => o.value === sortBy)?.labelKey || "", { defaultValue: SORT_OPTIONS.find(o => o.value === sortBy)?.fallback || "" })}
                        {sortOrder === "desc" ? (
                          <ArrowDownWideNarrow className="h-3 w-3" />
                        ) : (
                          <ArrowUpNarrowWide className="h-3 w-3" />
                        )}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </button>
                  )}
                  {/* Statuses */}
                  {filteredStatuses.length > 0 && (
                    <button
                      onClick={() => setSubmenu("statuses")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <span className="flex-1 text-left">{t("tags.filter.statuses")}</span>
                      {filterTagIds.some(id => filteredStatuses.some(s => s.tag.id === id)) && (
                        <span className="text-[11px] text-muted-foreground/60">
                          {filterTagIds.filter(id => filteredStatuses.some(s => s.tag.id === id)).length}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                    </button>
                  )}
                  {/* Labels */}
                  <button
                    onClick={() => setSubmenu("labels")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                  >
                    <span className="flex-1 text-left">{t("tags.filter.labels")}</span>
                    {filterTagIds.some(id => filteredLabels.some(l => l.tag.id === id)) && (
                      <span className="text-[11px] text-muted-foreground/60">
                        {filterTagIds.filter(id => filteredLabels.some(l => l.tag.id === id)).length}
                      </span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </button>
                </div>
              ) : (
                /* Submenu: back button + items */
                <>
                  <button
                    onClick={() => setSubmenu(null)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] motion-color motion-press focus-ring border-b border-border/50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>{t("tags.filter.back", "Back")}</span>
                  </button>
                  <div className="py-1">
                    {submenu === "sources" && onSourceFilterChange && (
                      <>
                        {sourceOptions.map((source) => {
                          const selected = selectedSourceSlugs.includes(source.slug);
                          return (
                            <button
                              key={source.slug}
                              onClick={() => {
                                if (selected) {
                                  onSourceFilterChange(selectedSourceSlugs.filter((slug) => slug !== source.slug));
                                } else {
                                  onSourceFilterChange([...new Set([...selectedSourceSlugs, source.slug])]);
                                }
                              }}
                              className="flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                              style={{ width: "calc(100% - 8px)" }}
                            >
                              <AgentIcon source={source.slug} size={13} className="text-foreground/80 shrink-0" />
                              <span className="flex-1 text-left">{source.label}</span>
                              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                            </button>
                          );
                        })}
                      </>
                    )}
                    {submenu === "models" && onModelFilterChange && (
                      <>
                        <button
                          onClick={() => onModelFilterChange("")}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            !selectedModel ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <span className="flex-1 text-left">{t("tags.filter.allModels", "All models")}</span>
                          {!selectedModel && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        {modelOptions.map((model) => (
                          <button
                            key={model}
                            onClick={() => onModelFilterChange(model)}
                            className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                              selectedModel === model ? "text-foreground" : "text-muted-foreground"
                            }`}
                            style={{ width: "calc(100% - 8px)" }}
                          >
                            <span className="flex-1 text-left truncate">{model}</span>
                            {selectedModel === model && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                          </button>
                        ))}
                      </>
                    )}
                    {submenu === "dates" && onDateRangeChange && (
                      <>
                        <button
                          onClick={() => { onDateRangeChange(null); setSubmenu(null); }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            !dateRange ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.allTime", "All time")}</span>
                          {!dateRange && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            onDateRangeChange({ start, end: now });
                            setSubmenu(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            dateRange && isToday(dateRange) ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.today", "Today")}</span>
                          {dateRange && isToday(dateRange) && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                            onDateRangeChange({ start, end: now });
                            setSubmenu(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            dateRange && isLast24h(dateRange) ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.last24h", "Last 24 hours")}</span>
                          {dateRange && isLast24h(dateRange) && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
                            onDateRangeChange({ start, end: now });
                            setSubmenu(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            dateRange && isLast2Days(dateRange) ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.last2Days", "Last 2 days")}</span>
                          {dateRange && isLast2Days(dateRange) && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                            onDateRangeChange({ start, end: now });
                            setSubmenu(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            dateRange && isLast7Days(dateRange) ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.last7Days", "Last 7 days")}</span>
                          {dateRange && isLast7Days(dateRange) && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                            onDateRangeChange({ start, end: now });
                            setSubmenu(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                            dateRange && isLast30Days(dateRange) ? "text-foreground" : "text-muted-foreground"
                          }`}
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="flex-1 text-left">{t("tags.filter.last30Days", "Last 30 days")}</span>
                          {dateRange && isLast30Days(dateRange) && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
                        </button>
                      </>
                    )}
                    {submenu === "sort" && onSortByChange && (
                      <>
                        {SORT_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              if (sortBy === option.value) {
                                onSortOrderChange?.(sortOrder === "desc" ? "asc" : "desc");
                              } else {
                                onSortByChange(option.value);
                              }
                            }}
                            className={`flex w-full items-center gap-2 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring ${
                              sortBy === option.value ? "text-foreground" : "text-muted-foreground"
                            }`}
                            style={{ width: "calc(100% - 8px)" }}
                          >
                            <span className="flex-1 text-left">{t(option.labelKey, { defaultValue: option.fallback })}</span>
                            {sortBy === option.value && (
                              sortOrder === "desc" ? (
                                <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                              ) : (
                                <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                              )
                            )}
                          </button>
                        ))}
                      </>
                    )}
                    {submenu === "statuses" && (
                      <>
                        {filteredStatuses.length > 0 ? (
                          filteredStatuses.map(renderItem)
                        ) : (
                          <div className="px-3 py-1.5 text-[12px] text-muted-foreground/40">
                            {t("tags.empty")}
                          </div>
                        )}
                      </>
                    )}
                    {submenu === "labels" && (
                      <>
                        {filteredLabels.length > 0 && filteredLabels.map(renderItem)}
                        {filteredLabels.length === 0 && !creating && (
                          <div className="px-3 py-1.5 text-[12px] text-muted-foreground/40">
                            {t("tags.empty")}
                          </div>
                        )}
                        {onCreateTag && (
                          <div className="mx-1 mt-0.5">
                            {creating ? (
                              <form
                                className="flex items-center gap-1.5 px-2 py-1.5"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (newName.trim()) {
                                    onCreateTag(newName.trim(), "info");
                                    setNewName("");
                                    setCreating(false);
                                  }
                                }}
                              >
                                <input
                                  ref={createInputRef}
                                  type="text"
                                  value={newName}
                                  onChange={(e) => setNewName(e.target.value)}
                                  onBlur={() => {
                                    if (!newName.trim()) setCreating(false);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                      setCreating(false);
                                      setNewName("");
                                    }
                                  }}
                                  placeholder={t("tags.namePlaceholder")}
                                  className="flex-1 min-w-0 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  disabled={!newName.trim()}
                                  className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-30 motion-color motion-press focus-ring"
                                >
                                  {t("tags.add")}
                                </button>
                              </form>
                            ) : (
                              <button
                                onClick={() => {
                                  setCreating(true);
                                  setTimeout(() => createInputRef.current?.focus(), 0);
                                }}
                                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-[6px] text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                              >
                                <Plus className="h-3 w-3" />
                                {t("tags.createNew")}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
