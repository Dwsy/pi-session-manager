import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Coins,
  DollarSign,
  WalletCards,
  FolderGit2,
  Sparkles,
  ChevronsDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
} from "lucide-react";
import type { SessionInfo, SessionStats } from "@/types";
import { getPathBasename } from "@/utils/path";
import CompositionInput from "@/components/ui/CompositionInput";
import { getRuntimeStats } from "@/runtime-data/sessionSource";

type DateRange = "1d" | "7d" | "30d" | "1y" | "all";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; labelKey: string }[] = [
  { value: "1d", label: "1d", labelKey: "dashboard.insight.range.1d" },
  { value: "7d", label: "7d", labelKey: "dashboard.insight.range.7d" },
  { value: "30d", label: "30d", labelKey: "dashboard.insight.range.30d" },
  { value: "1y", label: "1y", labelKey: "dashboard.insight.range.1y" },
  { value: "all", label: "All", labelKey: "dashboard.insight.range.all" },
];

function getDateRangeMs(range: DateRange): number | null {
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case "1d": return day;
    case "7d": return 7 * day;
    case "30d": return 30 * day;
    case "1y": return 365 * day;
    case "all": return null;
  }
}

function filterSessionsByDateRange(sessions: SessionInfo[], range: DateRange): SessionInfo[] {
  const ms = getDateRangeMs(range);
  if (ms === null) return sessions;
  const cutoff = Date.now() - ms;
  return sessions.filter((s) => new Date(s.modified).getTime() >= cutoff);
}

interface DashboardInsightModalProps {
  open: boolean;
  mode: "token_cost" | "model_projects";
  stats: SessionStats;
  sessions?: SessionInfo[];
  selectedModel?: string | null;
  onClose: () => void;
}

type UsageRow = {
  provider: string;
  model: string;
  fullModel: string;
  sessions: number;
  messages: number;
  cost: number;
  input: number;
  output: number;
  cache: number;
  tokens: number;
};

type ProviderGroup = {
  provider: string;
  sessions: number;
  messages: number;
  cost: number;
  input: number;
  output: number;
  cache: number;
  tokens: number;
  models: UsageRow[];
};

type SortField = "provider" | "sessions" | "messages" | "cost" | "tokens" | "input" | "output" | "cache";
type SortDirection = "asc" | "desc";

function formatTokens(count: number): string {
  if (count === 0) return "-";
  if (count < 1_000) return count.toString();
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function formatNumber(n: number): string {
  if (n === 0) return "-";
  return n.toLocaleString();
}

function formatCost(cost: number): string {
  if (cost === 0) return "-";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(1)}`;
  return `$${Math.round(cost)}`;
}

function formatModelName(name: string): string {
  return name
    .replace(/^anthropic\//, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .replace(/-latest$/, "");
}

export default function DashboardInsightModal({
  open,
  mode,
  stats,
  sessions = [],
  selectedModel,
  onClose,
}: DashboardInsightModalProps) {
  const { t } = useTranslation();

  // Date range filter
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [filteredStats, setFilteredStats] = useState<SessionStats | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);

  useEffect(() => {
    if (!open || sessions.length === 0 || dateRange === "all") {
      setFilteredStats(null);
      return;
    }
    let cancelled = false;
    setIsFiltering(true);
    const filtered = filterSessionsByDateRange(sessions, dateRange);
    if (filtered.length === 0) {
      setFilteredStats(null);
      setIsFiltering(false);
      return;
    }
    getRuntimeStats(filtered)
      .then((result) => {
        if (!cancelled) setFilteredStats(result);
      })
      .catch(() => {
        if (!cancelled) setFilteredStats(null);
      })
      .finally(() => {
        if (!cancelled) setIsFiltering(false);
      });
    return () => { cancelled = true; };
  }, [open, sessions, dateRange]);

  const displayStats = filteredStats ?? stats;
  const totalCostIncSubagents =
    displayStats.token_details.total_cost + (displayStats.subagent_summary?.total_cost ?? 0);

  // Reset filter on open
  useEffect(() => {
    if (open) {
      setDateRange("all");
      setSearchQuery("");
    }
  }, [open]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Sort state
  const [sortField, setSortField] = useState<SortField>("cost");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Collapsed state for provider groups
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Get unique providers and models for suggestions
  const uniqueProviders = useMemo(() => {
    const providers = new Set<string>();
    for (const fullModel of Object.keys(displayStats.token_details.tokens_by_model)) {
      const provider = fullModel.includes("/") ? fullModel.split("/")[0] : fullModel;
      providers.add(provider);
    }
    return Array.from(providers).sort();
  }, [displayStats.token_details.tokens_by_model]);

  // Generate search suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const results: Array<{ type: "provider" | "model"; value: string; fullModel?: string }> = [];

    // Match providers
    for (const provider of uniqueProviders) {
      if (provider.toLowerCase().includes(query)) {
        results.push({ type: "provider", value: provider });
      }
    }

    // Match models
    for (const fullModel of Object.keys(displayStats.token_details.tokens_by_model)) {
      const model = fullModel.includes("/")
        ? fullModel.split("/").slice(1).join("/")
        : fullModel;
      const displayModel = formatModelName(model);
      if (displayModel.toLowerCase().includes(query) || model.toLowerCase().includes(query)) {
        results.push({ type: "model", value: displayModel, fullModel });
      }
    }

    return results.slice(0, 8); // Limit to 8 suggestions
  }, [searchQuery, uniqueProviders, displayStats.token_details.tokens_by_model]);

  // Handle search input change
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setShowSuggestions(value.trim().length > 0);
    setSelectedSuggestionIndex(-1);
  }, []);

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: { type: "provider" | "model"; value: string; fullModel?: string }) => {
    // For models, use fullModel for precise filtering; for providers, use the value directly
    setSearchQuery(suggestion.type === "model" && suggestion.fullModel ? suggestion.fullModel : suggestion.value);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  }, []);

  // Handle keyboard navigation in suggestions
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Escape") {
        setSearchQuery("");
        setShowSuggestions(false);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, handleSuggestionClick]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build provider groups with data
  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const groupMap = new Map<string, ProviderGroup>();

    for (const [fullModel, usage] of Object.entries(
      displayStats.token_details.tokens_by_model,
    )) {
      const provider = fullModel.includes("/")
        ? fullModel.split("/")[0]
        : fullModel;
      const model = fullModel.includes("/")
        ? fullModel.split("/").slice(1).join("/")
        : fullModel;
      const row: UsageRow = {
        provider,
        model,
        fullModel,
        sessions: displayStats.sessions_by_model[fullModel] ?? 0,
        messages: usage.messages,
        cost: usage.cost,
        input: usage.input,
        output: usage.output,
        cache: usage.cache_read + usage.cache_write,
        tokens: usage.input + usage.output,
      };

      const current = groupMap.get(provider) ?? {
        provider,
        sessions: 0,
        messages: 0,
        cost: 0,
        input: 0,
        output: 0,
        cache: 0,
        tokens: 0,
        models: [],
      };

      current.sessions += row.sessions;
      current.messages += row.messages;
      current.cost += row.cost;
      current.input += row.input;
      current.output += row.output;
      current.cache += row.cache;
      current.tokens += row.tokens;
      current.models.push(row);

      groupMap.set(provider, current);
    }

    return Array.from(groupMap.values());
  }, [displayStats.token_details.tokens_by_model, displayStats.sessions_by_model]);

  // Filter and sort provider groups
  const filteredAndSortedGroups = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // Filter groups based on search query
    const filtered = providerGroups.filter((group) => {
      if (!query) return true;

      // Check if provider name matches
      if (group.provider.toLowerCase().includes(query)) return true;

      // Check if any model in the group matches
      return group.models.some((model) => {
        const displayName = formatModelName(model.model);
        return (
          displayName.toLowerCase().includes(query) ||
          model.model.toLowerCase().includes(query) ||
          model.fullModel.toLowerCase().includes(query)
        );
      });
    });

    // Sort groups
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "provider":
          comparison = a.provider.localeCompare(b.provider);
          break;
        case "sessions":
          comparison = a.sessions - b.sessions;
          break;
        case "messages":
          comparison = a.messages - b.messages;
          break;
        case "cost":
          comparison = a.cost - b.cost;
          break;
        case "tokens":
          comparison = a.tokens - b.tokens;
          break;
        case "input":
          comparison = a.input - b.input;
          break;
        case "output":
          comparison = a.output - b.output;
          break;
        case "cache":
          comparison = a.cache - b.cache;
          break;
      }

      // For provider name, sort alphabetically
      if (sortField === "provider") {
        return sortDirection === "asc" ? comparison : -comparison;
      }

      // For numeric fields, sort by magnitude
      return sortDirection === "asc" ? comparison : -comparison;
    });

    // Sort models within each group
    return sorted.map((group) => ({
      ...group,
      models: [...group.models].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case "provider":
            comparison = a.model.localeCompare(b.model);
            break;
          case "sessions":
            comparison = a.sessions - b.sessions;
            break;
          case "messages":
            comparison = a.messages - b.messages;
            break;
          case "cost":
            comparison = a.cost - b.cost;
            break;
          case "tokens":
            comparison = a.tokens - b.tokens;
            break;
          case "input":
            comparison = a.input - b.input;
            break;
          case "output":
            comparison = a.output - b.output;
            break;
          case "cache":
            comparison = a.cache - b.cache;
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    }));
  }, [providerGroups, searchQuery, sortField, sortDirection]);

  const usageTotals = useMemo(() => {
    return filteredAndSortedGroups.reduce(
      (acc, group) => {
        acc.sessions += group.sessions;
        acc.messages += group.messages;
        acc.cost += group.cost;
        acc.input += group.input;
        acc.output += group.output;
        acc.cache += group.cache;
        acc.tokens += group.tokens;
        return acc;
      },
      {
        sessions: 0,
        messages: 0,
        cost: 0,
        input: 0,
        output: 0,
        cache: 0,
        tokens: 0,
      },
    );
  }, [filteredAndSortedGroups]);

  const modelProjects = useMemo(() => {
    if (!selectedModel) return [];
    return Object.entries(
      displayStats.model_usage_by_project?.[selectedModel] ?? {},
    ).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [selectedModel, displayStats.model_usage_by_project]);

  // Toggle provider collapse
  const toggleProviderCollapse = useCallback((provider: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }, []);

  // Handle sort click
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "provider" ? "asc" : "desc");
    }
  }, [sortField]);

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 text-info" />
    ) : (
      <ArrowDown className="w-3 h-3 text-info" />
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm ui-enter-fade"
        onClick={onClose}
      />

      <div className="relative w-full max-w-6xl rounded-2xl border border-border/25 bg-background/95 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ui-enter-fade ui-enter-zoom overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-warning" />
              Dashboard Insight
            </div>
            {mode === "token_cost" ? (
              <h3 className="text-lg font-semibold text-foreground">
                Token Usage & Cost Breakdown
              </h3>
            ) : (
              <h3 className="text-lg font-semibold text-foreground truncate">
                Model Usage by Project ·{" "}
                {selectedModel ? formatModelName(selectedModel) : "Unknown"}
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border/20 bg-muted/15 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 motion-surface motion-color motion-press focus-ring"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {mode === "token_cost" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                  icon={Coins}
                  label="Billable Tokens"
                  value={formatTokens(displayStats.total_tokens)}
                  tone="text-info"
                />
                <MetricCard
                  icon={DollarSign}
                  label="Total Cost"
                  value={formatCost(totalCostIncSubagents)}
                  tone="text-destructive"
                />
                <MetricCard
                  icon={WalletCards}
                  label="Providers / Models"
                  value={`${formatNumber(providerGroups.length)} / ${formatNumber(Object.keys(displayStats.token_details.tokens_by_model).length)}`}
                  tone="text-warning"
                />
              </div>

              {/* Search and Filter Bar */}
              {/* Date Range Filter + Search Bar */}
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <div className="flex items-center gap-1 bg-muted/20 rounded-lg p-0.5">
                  {DATE_RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDateRange(opt.value)}
                      className={`px-2 py-1 text-[11px] font-medium rounded-md motion-surface motion-color transition-colors ${
                        dateRange === opt.value
                          ? "bg-background text-foreground shadow-sm border border-border/30"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(opt.labelKey, opt.label)}
                    </button>
                  ))}
                </div>
                {isFiltering && (
                  <span className="text-[10px] text-muted-foreground animate-pulse">filtering...</span>
                )}
              </div>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <CompositionInput
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={t("dashboard.insight.searchPlaceholder", "Search providers or models...")}
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-border/30 bg-background/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-info/30 focus:border-info/50"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setShowSuggestions(false);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <div className="text-xs text-muted-foreground">
                      {filteredAndSortedGroups.length} providers
                    </div>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-1 bg-background border border-border/30 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto"
                  >
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.type}-${suggestion.value}`}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted/50 ${
                          index === selectedSuggestionIndex ? "bg-muted/50" : ""
                        }`}
                      >
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          suggestion.type === "provider"
                            ? "bg-info/20 text-info"
                            : "bg-warning/20 text-warning"
                        }`}>
                          {suggestion.type === "provider" ? "Provider" : "Model"}
                        </span>
                        <span className="text-foreground truncate">
                          {suggestion.value}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <section className="rounded-xl border border-border/20 bg-background/35 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border/20 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Provider grouped usage table</span>
                  <span>{filteredAndSortedGroups.length} providers, {filteredAndSortedGroups.reduce((sum, g) => sum + g.models.length, 0)} models</span>
                </div>

                <div className="max-h-[46vh] overflow-y-auto">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/20">
                      <tr className="text-muted-foreground">
                        <th
                          className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("provider")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Provider / Model
                            {renderSortIcon("provider")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("sessions")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Sessions
                            {renderSortIcon("sessions")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("messages")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Msgs
                            {renderSortIcon("messages")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("cost")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Cost
                            {renderSortIcon("cost")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("tokens")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Tokens
                            {renderSortIcon("tokens")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("input")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            ↑In
                            {renderSortIcon("input")}
                          </span>
                        </th>
                        <th
                          className="px-2 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("output")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            ↓Out
                            {renderSortIcon("output")}
                          </span>
                        </th>
                        <th
                          className="px-3 py-2 text-right font-medium cursor-pointer hover:bg-muted/30 select-none"
                          onClick={() => handleSort("cache")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Cache
                            {renderSortIcon("cache")}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedGroups.map((group) => (
                        <FragmentGroup
                          key={group.provider}
                          group={group}
                          isCollapsed={collapsedProviders.has(group.provider)}
                          onToggleCollapse={() => toggleProviderCollapse(group.provider)}
                        />
                      ))}
                      {filteredAndSortedGroups.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                            No providers or models match "{searchQuery}"
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border/20 bg-background/90">
                  <table className="w-full min-w-[860px] text-xs">
                    <tbody>
                      <tr className="font-semibold text-foreground">
                        <td className="px-3 py-2.5 text-left">Total</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatNumber(usageTotals.sessions)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatNumber(usageTotals.messages)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatCost(usageTotals.cost)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {formatTokens(usageTotals.tokens)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatTokens(usageTotals.input)}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatTokens(usageTotals.output)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatTokens(usageTotals.cache)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border/20 bg-muted/15 p-3.5 text-xs text-muted-foreground">
                Shows which projects used this model, sorted by number of
                sessions using that model.
              </div>

              {modelProjects.length > 0 ? (
                <div className="space-y-2 max-h-[56vh] overflow-y-auto pr-1">
                  {modelProjects.map(([projectPath, count]) => {
                    const max = modelProjects[0]?.[1] ?? 1;
                    const percent = max > 0 ? (count / max) * 100 : 0;
                    const projectName = getPathBasename(projectPath);
                    return (
                      <div
                        key={`${selectedModel}-${projectPath}`}
                        className="rounded-xl border border-border/20 bg-background/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="min-w-0 flex items-center gap-2">
                            <FolderGit2 className="w-3.5 h-3.5 text-info shrink-0" />
                            <span className="text-sm text-foreground truncate">
                              {projectName}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {count} sessions
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-info to-[#7db7ff] rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 truncate">
                          {projectPath}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-border/20 bg-muted/15 p-4 text-sm text-muted-foreground text-center">
                  No project-level usage found for this model.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FragmentGroup({
  group,
  isCollapsed,
  onToggleCollapse,
}: {
  group: ProviderGroup;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <>
      <tr
        className="bg-muted/20 text-foreground border-b border-border/10 cursor-pointer hover:bg-muted/30"
        onClick={onToggleCollapse}
      >
        <td className="px-3 py-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronsDown className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            {group.provider}
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {formatNumber(group.sessions)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {formatNumber(group.messages)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {formatCost(group.cost)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {formatTokens(group.tokens)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
          {formatTokens(group.input)}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
          {formatTokens(group.output)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {formatTokens(group.cache)}
        </td>
      </tr>

      {!isCollapsed &&
        group.models.map((row) => (
          <tr
            key={`${row.provider}-${row.fullModel}`}
            className="border-b border-border/10 last:border-b-0"
          >
            <td
              className="px-3 py-2 text-muted-foreground max-w-[320px] truncate"
              title={row.fullModel}
            >
              <span className="pl-5">{formatModelName(row.model)}</span>
            </td>
            <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
              {formatNumber(row.sessions)}
            </td>
            <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
              {formatNumber(row.messages)}
            </td>
            <td className="px-2 py-2 text-right text-foreground tabular-nums">
              {formatCost(row.cost)}
            </td>
            <td className="px-2 py-2 text-right text-foreground tabular-nums">
              {formatTokens(row.tokens)}
            </td>
            <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
              {formatTokens(row.input)}
            </td>
            <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
              {formatTokens(row.output)}
            </td>
            <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
              {formatTokens(row.cache)}
            </td>
          </tr>
        ))}
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-background/50 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3.5 h-3.5 ${tone}`} />
        {label}
      </div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
