import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Search,
  X,
  Loader2,
  User,
  Bot,
  FileText,
  Globe,
  ArrowUpDown,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortenPath } from "@/utils/format";
import { getPathParentName } from "@/utils/path";
import {
  applyLeadingSourceFilterToken,
  formatSourceFilterToken,
  parseLeadingSourceFilterToken,
  parseQuotedQuery,
} from "@/utils/search";
import type {
  FullTextSearchHit,
  FullTextSearchSourceFilter,
  SessionInfo,
} from "@/types";
import {
  fullTextSearchRuntime,
  getRuntimeSessionByPath,
} from "@/runtime-data/sessionSource";
import { formatShortSessionId } from "@/utils/session";
import { useCompositionInput } from "@/hooks/useCompositionInput";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { DelayedLoadingCenter } from "@/components/ui/DelayedLoading";
import CompositionInput from "@/components/ui/CompositionInput";

const HIGHLIGHT_CACHE_MAX_ENTRIES = 500;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

function getProjectDirName(path: string): string {
  return getPathParentName(path);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function getHighlightTerms(query: string): string[] {
  if (!query.trim()) {
    return [];
  }

  const parsedQuery = parseQuotedQuery(query);
  const terms = parsedQuery.hasPhrases
    ? [...parsedQuery.phrases, ...parsedQuery.remainderTokens]
    : query.trim().split(/\s+/).filter(Boolean);

  return [...new Set(terms.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
}

interface FullTextSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (session: SessionInfo, entryId: string) => void;
}

const SOURCE_FILTERS: FullTextSearchSourceFilter[] = [
  "all",
  "labels_only",
  "content_only",
];

function buildRecentSearchWindows() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const olderTo = new Date(sevenDaysAgo.getTime() - 1);

  return {
    recentFrom: sevenDaysAgo.toISOString(),
    recentTo: now.toISOString(),
    olderTo: olderTo.toISOString(),
  };
}

export default function FullTextSearch({
  isOpen,
  onClose,
  onSelectResult,
}: FullTextSearchProps) {
  const { t } = useTranslation();
  const [queryInput, setQueryInput] = useState("");
  const { inputValue, handleChange, handleCompositionStart, handleCompositionEnd } = useCompositionInput(setQueryInput, queryInput);
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "assistant">(
    "all",
  );
  const [sourceFilter, setSourceFilter] =
    useState<FullTextSearchSourceFilter>("all");
  const [globPattern, setGlobPattern] = useState("");
  const [allHits, setAllHits] = useState<FullTextSearchHit[]>([]);
  const [totalHitsCount, setTotalHitsCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitsPage, setHitsPage] = useState(0);
  const [sortMode, setSortMode] = useState<"score" | "newest" | "oldest">(
    "newest",
  );

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const showDelayedSearching = useDelayedLoading(isSearching);
  const showDelayedEmptyResultsLoading = useDelayedLoading(
    isSearching && allHits.length === 0,
  );

  const pageSize = 20;
  const parsedToken = useMemo(
    () => parseLeadingSourceFilterToken(queryInput),
    [queryInput],
  );
  const normalizedQuery = parsedToken.sourceFilter
    ? parsedToken.normalizedQuery
    : queryInput;
  const effectiveSourceFilter = parsedToken.sourceFilter || sourceFilter;
  const isLabelsBrowseMode =
    effectiveSourceFilter === "labels_only" && !normalizedQuery.trim();
  const effectiveSortMode =
    isLabelsBrowseMode && sortMode === "score" ? "newest" : sortMode;
  const highlightTerms = useMemo(
    () => getHighlightTerms(normalizedQuery),
    [normalizedQuery],
  );

  const sourceFilterSuggestions = useMemo(() => {
    const trimmed = queryInput.trim();
    if (!trimmed.startsWith("#") || /\s/.test(trimmed)) {
      return [];
    }

    const prefix = trimmed.toLowerCase();
    return SOURCE_FILTERS.filter((value) =>
      formatSourceFilterToken(value).startsWith(prefix),
    );
  }, [queryInput]);

  const getSourceFilterLabel = useCallback(
    (value: FullTextSearchSourceFilter) => {
      const key =
        value === "labels_only"
          ? "search.fullText.source.labels"
          : value === "content_only"
            ? "search.fullText.source.content"
            : "search.fullText.source.all";
      return t(key);
    },
    [t],
  );

  const rewriteInputWithSourceFilter = useCallback(
    (
      currentValue: string,
      nextSourceFilter: FullTextSearchSourceFilter,
    ): string => applyLeadingSourceFilterToken(currentValue, nextSourceFilter),
    [],
  );

  const sortedHits = useMemo(() => {
    const sorted = [...allHits];
    switch (effectiveSortMode) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        break;
      default:
        sorted.sort((a, b) => b.score - a.score);
    }
    return sorted;
  }, [allHits, effectiveSortMode]);

  const sessionCounts = useMemo(() => {
    const map = new Map<string, number>();
    allHits.forEach((hit) =>
      map.set(hit.session_id, (map.get(hit.session_id) ?? 0) + 1),
    );
    return map;
  }, [allHits]);

  const paginatedHits = useMemo(
    () => sortedHits.slice(0, (hitsPage + 1) * pageSize),
    [sortedHits, hitsPage],
  );

  const remainingToFetch = totalHitsCount - allHits.length;

  const formatRelativeTime = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;

      if (diffMs < minute) return t("common.time.justNow");
      if (diffMs < hour)
        return t("common.time.minutesAgo", {
          count: Math.floor(diffMs / minute),
        });
      if (diffMs < day)
        return t("common.time.hoursAgo", { count: Math.floor(diffMs / hour) });
      if (diffMs < 7 * day)
        return t("common.time.daysAgo", { count: Math.floor(diffMs / day) });
      return t("common.time.monthsAgo", {
        count: Math.floor(diffMs / (30 * day)),
      });
    } catch {
      return timestamp;
    }
  };

  const performSearch = useCallback(
    async (
      searchQuery: string,
      role: string,
      source: FullTextSearchSourceFilter,
      glob: string,
      pageNum: number,
      append = false,
    ) => {
      const requestId = ++requestIdRef.current;
      const allowsEmptyQuery = source === "labels_only" && !searchQuery.trim();
      if (!searchQuery.trim() && !allowsEmptyQuery) {
        setAllHits([]);
        setTotalHitsCount(0);
        setHitsPage(0);
        return;
      }

      setIsSearching(true);
      setError(null);
      try {
        const applyIfCurrent = (callback: () => void) => {
          if (requestIdRef.current !== requestId) {
            return false;
          }
          callback();
          return true;
        };

        const trimmedQuery = searchQuery.trim();
        const shouldProgressiveAppend =
          !append &&
          pageNum === 0 &&
          effectiveSortMode === "newest" &&
          trimmedQuery.length > 0 &&
          (source !== "all" || /\s/.test(trimmedQuery));

        if (shouldProgressiveAppend) {
          const { recentFrom, recentTo, olderTo } = buildRecentSearchWindows();
          const recentResponse = await fullTextSearchRuntime({
            query: searchQuery,
            roleFilter: role as "all" | "user" | "assistant",
            sourceFilter: source,
            globPattern: glob || null,
            projectPath: null,
            page: 0,
            pageSize,
            matchMode: "smart",
            sortOrder: effectiveSortMode,
            from: recentFrom,
            to: recentTo,
          });

          if (
            !applyIfCurrent(() => {
              setAllHits(recentResponse.hits);
              setTotalHitsCount(recentResponse.total_hits);
              setHitsPage(0);
            })
          ) {
            return;
          }

          const remainingPageSlots = Math.max(0, pageSize - recentResponse.hits.length);
          const olderResponse = await fullTextSearchRuntime({
            query: searchQuery,
            roleFilter: role as "all" | "user" | "assistant",
            sourceFilter: source,
            globPattern: glob || null,
            projectPath: null,
            page: 0,
            pageSize: remainingPageSlots,
            matchMode: "smart",
            sortOrder: effectiveSortMode,
            to: olderTo,
          });

          applyIfCurrent(() => {
            setAllHits([...recentResponse.hits, ...olderResponse.hits]);
            setTotalHitsCount(recentResponse.total_hits + olderResponse.total_hits);
            setHitsPage(0);
          });
          return;
        }

        const response = await fullTextSearchRuntime({
          query: searchQuery,
          roleFilter: role as "all" | "user" | "assistant",
          sourceFilter: source,
          globPattern: glob || null,
          projectPath: null,
          page: pageNum,
          pageSize: pageSize,
          matchMode: "smart",
          sortOrder: effectiveSortMode,
        });
        applyIfCurrent(() => {
          setAllHits((prev) =>
            append ? [...prev, ...response.hits] : response.hits,
          );
          setTotalHitsCount(response.total_hits);
          setHitsPage(pageNum);
        });
      } catch (err: unknown) {
        console.error("Full text search failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        if (requestIdRef.current === requestId) {
          setError(message || "Search failed");
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsSearching(false);
        }
      }
    },
    [effectiveSortMode, pageSize],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const timeout = setTimeout(() => {
      setHitsPage(0);
      performSearch(
        normalizedQuery,
        roleFilter,
        effectiveSourceFilter,
        globPattern,
        0,
      );
    }, 300);
    searchTimeoutRef.current = timeout;
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [
    normalizedQuery,
    roleFilter,
    effectiveSourceFilter,
    globPattern,
    performSearch,
  ]);

  const highlightCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    highlightCache.current.clear();
  }, [normalizedQuery]);

  useEffect(() => setHitsPage(0), [sortMode, effectiveSourceFilter]);

  const highlightContent = useCallback(
    (content: string): string => {
      if (highlightTerms.length === 0) {
        return escapeHtml(content);
      }

      let result = escapeHtml(content);
      highlightTerms.forEach((term) => {
        const escapedTerm = escapeHtml(term);
        const regex = new RegExp(
          `(${escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
          "gi",
        );
        result = result.replace(regex, "<b>$1</b>");
      });
      return result;
    },
    [highlightTerms],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const scrollContainer = document.getElementById("search-results-wrapper");
    const root = scrollContainer || sentinel.parentElement;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && remainingToFetch > 0 && !isSearching) {
          handleLoadMore();
        }
      },
      {
        root,
        rootMargin: "200px",
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => {
      observer.unobserve(sentinel);
    };
  }, [
    remainingToFetch,
    isSearching,
    hitsPage,
    normalizedQuery,
    roleFilter,
    effectiveSourceFilter,
    globPattern,
  ]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleLoadMore = () => {
    const nextPage = hitsPage + 1;
    performSearch(
      normalizedQuery,
      roleFilter,
      effectiveSourceFilter,
      globPattern,
      nextPage,
      true,
    );
  };

  const handleSelect = async (hit: FullTextSearchHit) => {
    try {
      const session = await getRuntimeSessionByPath(hit.session_path);
      if (session) {
        onSelectResult(session, hit.entry_id);
        onClose();
      }
    } catch (error) {
      console.error("Failed to get session:", error);
    }
  };

  const getSortLabel = () => {
    const keys = {
      score: "search.fullText.sortScore",
      newest: "search.fullText.sortNewest",
      oldest: "search.fullText.sortOldest",
    };
    return t(keys[effectiveSortMode]);
  };

  const cycleSort = () => {
    if (isLabelsBrowseMode) {
      setSortMode((current) => (current === "oldest" ? "newest" : "oldest"));
      return;
    }

    const modes: ("score" | "newest" | "oldest")[] = [
      "score",
      "newest",
      "oldest",
    ];
    const currentIndex = modes.indexOf(sortMode);
    setSortMode(modes[(currentIndex + 1) % 3]);
  };

  const handleSourceFilterChange = (nextSourceFilter: FullTextSearchSourceFilter) => {
    setSourceFilter(nextSourceFilter);
    setQueryInput((currentValue) =>
      rewriteInputWithSourceFilter(currentValue, nextSourceFilter),
    );
  };

  const applySuggestedSourceFilter = (nextSourceFilter: FullTextSearchSourceFilter) => {
    setSourceFilter(nextSourceFilter);
    setQueryInput((currentValue) => {
      const trimmed = currentValue.trim();
      if (trimmed.startsWith("#") && !/\s/.test(trimmed)) {
        return `${formatSourceFilterToken(nextSourceFilter)} `;
      }
      return rewriteInputWithSourceFilter(currentValue, nextSourceFilter);
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (
      sourceFilterSuggestions.length > 0 &&
      (event.key === "Tab" || event.key === "Enter")
    ) {
      event.preventDefault();
      applySuggestedSourceFilter(sourceFilterSuggestions[0]);
    }
  };

  if (!isOpen) return null;

  const inputPlaceholder =
    effectiveSourceFilter === "labels_only"
      ? t("search.fullText.labelsPlaceholder")
      : t("search.fullText.placeholder");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#1a1b26] border border-[#2a2b36] rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#2a2b36] bg-[#1f2029] relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-[#2a2b36] motion-surface motion-color motion-press focus-ring flex-shrink-0 z-10"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>

          <div className="relative flex items-center gap-3 mb-4 pr-8">
            <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleChange}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onKeyDown={handleInputKeyDown}
                placeholder={inputPlaceholder}
                className="w-full bg-transparent border-none p-0 outline-none text-base font-medium text-foreground placeholder:text-muted-foreground"
              />
              {sourceFilterSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-[#2a2b36] bg-[#16161e] shadow-xl overflow-hidden z-20">
                  {sourceFilterSuggestions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => applySuggestedSourceFilter(value)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#252636] motion-surface motion-color"
                    >
                      <span className="font-mono text-blue-700 dark:text-blue-300">
                        {formatSourceFilterToken(value)}
                      </span>
                      <span className="text-muted-foreground">
                        {getSourceFilterLabel(value)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-[#252636]/50 p-1 rounded-lg border border-[#2a2b36]/50">
              <button
                onClick={() => setRoleFilter("all")}
                className={`px-3 py-1.5 text-xs rounded-md motion-surface motion-color motion-press focus-ring flex items-center gap-1 ${
                  roleFilter === "all"
                    ? "bg-blue-500/90 text-white shadow-md shadow-blue-500/25"
                    : "text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground"
                }`}
              >
                <div className="flex -space-x-1">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <Bot className="w-3 h-3 flex-shrink-0" />
                </div>
                {t("search.fullText.role.all")}
              </button>
              <button
                onClick={() => setRoleFilter("user")}
                className={`px-3 py-1.5 text-xs rounded-md motion-surface motion-color motion-press focus-ring flex items-center gap-1 ${
                  roleFilter === "user"
                    ? "bg-blue-500/90 text-white shadow-md shadow-blue-500/25"
                    : "text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground"
                }`}
              >
                <User className="w-3 h-3 flex-shrink-0" />
                {t("search.fullText.role.user")}
              </button>
              <button
                onClick={() => setRoleFilter("assistant")}
                className={`px-3 py-1.5 text-xs rounded-md motion-surface motion-color motion-press focus-ring flex items-center gap-1 ${
                  roleFilter === "assistant"
                    ? "bg-blue-500/90 text-white shadow-md shadow-blue-500/25"
                    : "text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground"
                }`}
              >
                <Bot className="w-3 h-3 flex-shrink-0" />
                {t("search.fullText.role.assistant")}
              </button>
            </div>
            <div className="flex bg-[#252636]/50 p-1 rounded-lg border border-[#2a2b36]/50">
              {SOURCE_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleSourceFilterChange(value)}
                  className={`px-3 py-1.5 text-xs rounded-md motion-surface motion-color motion-press focus-ring flex items-center gap-1 ${
                    effectiveSourceFilter === value
                      ? "bg-blue-500/90 text-white shadow-md shadow-blue-500/25"
                      : "text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground"
                  }`}
                >
                  {value === "labels_only" ? (
                    <Tag className="w-3 h-3 flex-shrink-0" />
                  ) : value === "content_only" ? (
                    <FileText className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <Search className="w-3 h-3 flex-shrink-0" />
                  )}
                  {getSourceFilterLabel(value)}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-[200px] relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <CompositionInput
                type="text"
                value={globPattern}
                onChange={setGlobPattern}
                placeholder={t("search.fullText.globPlaceholder")}
                className="w-full pl-10 pr-4 py-2 bg-[#252636] border border-[#2a2b36]/50 rounded-lg text-sm focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 motion-surface motion-color placeholder:text-muted-foreground/70"
              />
            </div>
            <button
              onClick={cycleSort}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium motion-surface motion-color motion-press focus-ring ${
                effectiveSortMode === "score"
                  ? "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-400/30 text-blue-300 shadow-sm shadow-blue-500/10"
                  : "bg-[#252636]/50 border-[#2a2b36]/50 text-muted-foreground hover:border-blue-400/30 hover:text-blue-300 hover:bg-blue-500/5"
              }`}
              title={t("search.fullText.sortTitle")}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="font-normal">{getSortLabel()}</span>
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-[#2a2b36]/50 bg-[#1a1b26]/50 flex items-center justify-between text-xs">
          <div className="text-muted-foreground/90 font-medium">
            {showDelayedSearching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 mr-1.5 inline" />
                {t("search.searching")}
              </>
            ) : isSearching ? (
              t("search.searching")
            ) : totalHitsCount > 0 ? (
              t("search.fullText.resultsFound", { count: totalHitsCount })
            ) : null}
          </div>
          <div className="text-muted-foreground/60 flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-muted/30 border rounded-sm text-xs font-mono tracking-wider uppercase">
              Esc
            </kbd>
            <span>{t("common.close")}</span>
          </div>
        </div>
        <div
          id="search-results-wrapper"
          className="flex-1 min-h-0 overflow-hidden bg-[#16161e]/50"
        >
          <div className="flex flex-col p-4 space-y-2 custom-scrollbar">
            {error ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl">
                <X className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : showDelayedEmptyResultsLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/50">
                <DelayedLoadingCenter className="flex items-center justify-center mb-4" />
                <p className="text-lg font-medium">
                  {isLabelsBrowseMode
                    ? t("search.fullText.labelsPlaceholder")
                    : t("search.searching")}
                </p>
              </div>
            ) : isSearching && allHits.length === 0 ? (
              <div className="min-h-[200px]" aria-hidden="true" />
            ) : paginatedHits.length === 0 ? (
              !isSearching && (normalizedQuery.trim() || isLabelsBrowseMode) ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/50">
                  <Search className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">
                    {isLabelsBrowseMode
                      ? t("search.fullText.noLabels")
                      : t("search.noResults")}
                  </p>
                  {!isLabelsBrowseMode && (
                    <p className="text-sm">
                      Try adjusting your search terms or filters
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/30">
                  <div className="relative w-20 h-20 mb-6">
                    <Search className="w-20 h-20 opacity-20 absolute inset-0" />
                    <Globe className="w-12 h-12 opacity-40 absolute inset-0 m-auto text-blue-400" />
                  </div>
                  <p className="text-lg font-medium mb-1">
                    {t("search.fullText.startTyping")}
                  </p>
                </div>
              )
            ) : (
              <>
                {paginatedHits.map((hit) => {
                  const projectName = getProjectDirName(hit.session_path);
                  const title = hit.session_name?.trim() || projectName;
                  const truncatedPath = shortenPath(hit.session_path, 60);
                  const count = sessionCounts.get(hit.session_id) || 1;
                  const isSessionIdMatch =
                    hit.match_reason === "session_id_exact" ||
                    hit.match_reason === "session_id_prefix";
                  const isLabelMatch = hit.match_reason === "label";

                  const cacheKey = `${hit.entry_id || `session:${hit.session_id}`}|${normalizedQuery}`;
                  let highlightedHtml = highlightCache.current.get(cacheKey);
                  if (highlightedHtml === undefined) {
                    highlightedHtml = highlightContent(hit.content);
                    if (
                      highlightCache.current.size >= HIGHLIGHT_CACHE_MAX_ENTRIES
                    ) {
                      const oldestKey = highlightCache.current
                        .keys()
                        .next().value;
                      if (oldestKey !== undefined) {
                        highlightCache.current.delete(oldestKey);
                      }
                    }
                    highlightCache.current.set(cacheKey, highlightedHtml);
                  }

                  return (
                    <button
                      key={hit.session_id + hit.entry_id + hit.timestamp}
                      onClick={() => handleSelect(hit)}
                      className="group relative w-full p-4 rounded-xl border border-transparent hover:border-blue-500/30 hover:bg-blue-500/5 motion-surface motion-color focus-ring flex flex-col overflow-hidden shadow-sm hover:shadow-md hover:shadow-blue-500/10"
                    >
                      <div className="flex items-center justify-between p-2 bg-blue-500/5 border-b border-blue-500/20 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 group-hover:shadow-inner shadow-sm flex-shrink-0">
                            <FileText className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h3
                                className="text-sm font-semibold text-foreground truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 motion-color"
                                title={`Session: ${title}\nID: ${hit.session_id}\nPath: ${hit.session_path}`}
                              >
                                {title}
                              </h3>
                              {count > 1 && (
                                <span className="px-2 py-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full border border-blue-500/30 ml-auto flex-shrink-0">
                                  {count}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {truncatedPath}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
                              <span
                                className="inline-flex items-center rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                                title={hit.session_id}
                              >
                                {formatShortSessionId(hit.session_id)}
                              </span>
                              {isSessionIdMatch && (
                                <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {t(
                                    "search.fullText.sessionIdMatch",
                                    "session id",
                                  )}
                                </span>
                              )}
                              {isLabelMatch && (
                                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                  {t("search.fullText.labelMatch")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-1">
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                                  hit.role === "user"
                                    ? "bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-500/30"
                                    : "bg-gradient-to-r from-purple-500/20 to-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                                }`}
                              >
                                {hit.role.toUpperCase()}
                              </span>
                              <span className="font-mono whitespace-nowrap">
                                {formatRelativeTime(hit.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="relative pl-10 mb-3">
                        <div className="absolute left-9 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-muted/30 to-transparent group-hover:from-blue-400/30 group-hover:via-blue-400/60" />
                        <div
                          className="text-sm/6 text-muted-foreground leading-relaxed italic line-clamp-3 bg-[#1a1b26]/50 px-3 py-2 rounded-lg backdrop-blur-sm group-hover:bg-blue-500/5 group-hover:text-foreground/90 motion-surface motion-color fts-snippet"
                          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                        />
                      </div>
                    </button>
                  );
                })}
                {remainingToFetch > 0 && (
                  <div ref={sentinelRef} className="h-1" aria-hidden="true" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
