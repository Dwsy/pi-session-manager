import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  X,
  Activity,
  BarChart3,
  Bot,
  Coins,
  DollarSign,
  WalletCards,
  FolderGit2,
  Clock,
  MessageSquare,
  ChevronsDown,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Target,
  User,
} from "lucide-react";
import type { SessionInfo, SessionStats } from "@/types";
import { getPathBasename, hasPathSeparator, pathsEqual } from "@/utils/path";
import { formatTokens as formatTokensCompact } from "@/utils/format";
import { emptyDashboardStats } from "./dashboardTimeRange";
import CompositionInput from "@/components/ui/CompositionInput";
import { getRuntimeStats } from "@/runtime-data/sessionSource";
import DashboardDialog from "./DashboardDialog";
import { deriveDashboardInsights } from "./dashboardInsights";

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
  if (ms === null || sessions.length === 0) return sessions;
  const latestSessionTime = sessions.reduce((latest, session) => {
    const time = new Date(session.modified).getTime();
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
  const anchor = latestSessionTime > 0 ? Math.min(Date.now(), latestSessionTime) : Date.now();
  const cutoff = anchor - ms;
  return sessions.filter((session) => {
    const time = new Date(session.modified).getTime();
    return Number.isFinite(time) && time >= cutoff && time <= anchor;
  });
}

export type DashboardInsightMode =
  | "session_overview"
  | "message_mix"
  | "activity_rhythm"
  | "token_cost"
  | "model_projects"
  | "project_sessions";

interface DashboardInsightModalProps {
  open: boolean;
  mode: DashboardInsightMode;
  stats: SessionStats;
  sessions?: SessionInfo[];
  liveSessionIds?: Set<string>;
  selectedModel?: string | null;
  selectedProject?: string | null;
  onProjectSelect?: (projectPath: string) => void;
  onInspectProject?: (projectPath: string) => void;
  onPreviewSession?: (session: SessionInfo) => void;
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
  // "-" keeps zero cells quiet in dense usage tables.
  if (count === 0) return "-";
  return formatTokensCompact(count);
}

export function formatNumber(n: number): string {
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

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value)}%`;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function sessionModels(session: SessionInfo): string[] {
  const models = session.models?.length ? session.models : session.model ? [session.model] : [];
  return Array.from(new Set(models.filter(Boolean)));
}

function getHourLabel(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
}

function getModalTitle(
  mode: DashboardInsightModalProps["mode"],
  t: TFunction,
  selectedModel?: string | null,
): string {
  switch (mode) {
    case "session_overview":
      return t("dashboard.insight.sessionOverview", "Session Overview");
    case "message_mix":
      return t("dashboard.insight.messageMix", "Message Distribution Insight");
    case "activity_rhythm":
      return t("dashboard.insight.activityRhythm", "Activity Rhythm Insight");
    case "token_cost":
      return t("dashboard.insight.tokenCost", "Token Usage & Cost Breakdown");
    case "model_projects":
      return t("dashboard.insight.modelProjects", "Model Usage by Project · {{model}}", {
        model: selectedModel ? formatModelName(selectedModel) : "Unknown",
      });
    case "project_sessions":
      return t("dashboard.insight.projectSessions", "Project Insight");
  }
}

function InsightRow({
  label,
  value,
  hint,
  percent,
  tone = "bg-info",
}: {
  label: string;
  value: string;
  hint?: string;
  percent: number;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm text-foreground truncate">{label}</div>
          {hint ? <div className="text-[10px] text-muted-foreground truncate">{hint}</div> : null}
        </div>
        <div className="text-sm font-semibold text-foreground tabular-nums">{value}</div>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardInsightModal({
  open,
  mode,
  stats,
  sessions = [],
  liveSessionIds,
  selectedModel,
  selectedProject,
  onProjectSelect,
  onInspectProject,
  onPreviewSession,
  onClose,
}: DashboardInsightModalProps) {
  const { t, i18n } = useTranslation();

  // Date range filter
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [filteredSnapshot, setFilteredSnapshot] = useState<{
    range: Exclude<DateRange, "all">;
    scopeKey: string;
    sessions: SessionInfo[];
    stats: SessionStats;
  } | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [filterRetryNonce, setFilterRetryNonce] = useState(0);
  const filterRequestRef = useRef(0);

  const filteredSessions = useMemo(
    () => filterSessionsByDateRange(sessions, dateRange),
    [sessions, dateRange],
  );
  const rangeHasNoSessions = dateRange !== "all" && filteredSessions.length === 0;
  const filteredScopeKey = useMemo(() => {
    const first = filteredSessions[0];
    const last = filteredSessions[filteredSessions.length - 1];
    return [dateRange, filteredSessions.length, first?.path || "", first?.modified || "", last?.path || "", last?.modified || ""].join("|");
  }, [dateRange, filteredSessions]);
  const snapshotMatchesRange =
    dateRange !== "all"
    && filteredSnapshot?.range === dateRange
    && filteredSnapshot.scopeKey === filteredScopeKey;
  const hasResolvedRange = dateRange === "all" || snapshotMatchesRange;
  const displaySessions = dateRange === "all"
    ? sessions
    : snapshotMatchesRange
      ? filteredSnapshot.sessions
      : [];
  const displayStats = dateRange === "all"
    ? stats
    : snapshotMatchesRange
      ? filteredSnapshot.stats
      : emptyDashboardStats();

  useEffect(() => {
    const requestId = ++filterRequestRef.current;
    if (!open || sessions.length === 0 || dateRange === "all") {
      setFilteredSnapshot(null);
      setFilterError(null);
      setIsFiltering(false);
      return;
    }
    setFilterError(null);
    if (filteredSessions.length === 0) {
      setFilteredSnapshot(null);
      setIsFiltering(false);
      return;
    }
    setIsFiltering(true);
    getRuntimeStats(filteredSessions)
      .then((result) => {
        if (requestId !== filterRequestRef.current) return;
        setFilteredSnapshot({
          range: dateRange,
          scopeKey: filteredScopeKey,
          sessions: filteredSessions,
          stats: result,
        });
      })
      .catch((error) => {
        if (requestId !== filterRequestRef.current) return;
        setFilteredSnapshot(null);
        setFilterError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (requestId === filterRequestRef.current) setIsFiltering(false);
      });
    return () => {
      if (requestId === filterRequestRef.current) filterRequestRef.current += 1;
    };
  }, [dateRange, filterRetryNonce, filteredScopeKey, filteredSessions, open, sessions.length]);

  const totalCostIncSubagents =
    displayStats.token_details.total_cost + (displayStats.subagent_summary?.total_cost ?? 0);

  // Reset filter on open
  useEffect(() => {
    if (open) {
      setDateRange("all");
      setFilteredSnapshot(null);
      setFilterError(null);
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
    const selectedShortName = selectedModel.split("/").pop();
    const exactProjects = new Map<string, number>();
    for (const session of displaySessions) {
      const usesSelectedModel = sessionModels(session).some((model) =>
        model === selectedModel || model.split("/").pop() === selectedShortName,
      );
      if (!usesSelectedModel || !session.cwd) continue;
      exactProjects.set(session.cwd, (exactProjects.get(session.cwd) || 0) + 1);
    }
    const entries = exactProjects.size > 0
      ? Array.from(exactProjects.entries())
      : Object.entries(displayStats.model_usage_by_project?.[selectedModel] ?? {});
    return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [displaySessions, displayStats.model_usage_by_project, selectedModel]);

  const selectedModelSummary = useMemo(() => {
    if (!selectedModel) return null;
    const usage = displayStats.token_details.tokens_by_model[selectedModel];
    const cache = (usage?.cache_read || 0) + (usage?.cache_write || 0);
    const tokens = (usage?.input || 0) + (usage?.output || 0) + cache;
    const projectSessions = modelProjects.reduce((sum, [, count]) => sum + count, 0);
    return {
      projects: modelProjects.length,
      sessions: displayStats.sessions_by_model[selectedModel] || projectSessions,
      messages: usage?.messages || 0,
      input: usage?.input || 0,
      output: usage?.output || 0,
      cache,
      tokens,
      cost: usage?.cost || 0,
    };
  }, [displayStats.sessions_by_model, displayStats.token_details.tokens_by_model, modelProjects, selectedModel]);

  const sessionOverview = useMemo(() => {
    const sortedSessions = [...displaySessions].sort((a, b) => b.message_count - a.message_count);
    const depths = displaySessions.map((session) => session.message_count);
    const projects = new Map<string, { path: string; sessions: number; messages: number }>();
    for (const session of displaySessions) {
      const current = projects.get(session.cwd) || { path: session.cwd, sessions: 0, messages: 0 };
      current.sessions += 1;
      current.messages += session.message_count;
      projects.set(session.cwd, current);
    }
    const topProjects = Array.from(projects.values())
      .sort((left, right) => right.sessions - left.sessions || right.messages - left.messages)
      .slice(0, 6);
    const liveCount = displaySessions.filter(
      (session) => session.isLive || (liveSessionIds?.has(session.id) ?? false),
    ).length;
    return {
      topProjects,
      topSessions: sortedSessions.slice(0, 5),
      liveCount,
      medianMessages: percentile(depths, 0.5),
      p90Messages: percentile(depths, 0.9),
      topSession: sortedSessions[0] || null,
      avgMessages: displayStats.average_messages_per_session,
    };
  }, [displayStats.average_messages_per_session, displaySessions, liveSessionIds]);

  const messageMix = useMemo(() => {
    const userPercent = displayStats.total_messages > 0
      ? (displayStats.user_messages / displayStats.total_messages) * 100
      : 0;
    const assistantPercent = displayStats.total_messages > 0
      ? (displayStats.assistant_messages / displayStats.total_messages) * 100
      : 0;
    const ratio = displayStats.assistant_messages / Math.max(displayStats.user_messages, 1);
    const topMessageDays = Object.entries(displayStats.messages_by_date)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
    return { userPercent, assistantPercent, ratio, topMessageDays };
  }, [
    displayStats.assistant_messages,
    displayStats.messages_by_date,
    displayStats.total_messages,
    displayStats.user_messages,
  ]);

  const displaySessionAnchor = useMemo(() => {
    const latest = displaySessions.reduce((current, session) => {
      const time = new Date(session.modified).getTime();
      return Number.isFinite(time) ? Math.max(current, time) : current;
    }, 0);
    return new Date(latest > 0 ? Math.min(Date.now(), latest) : Date.now());
  }, [displaySessions]);

  const derivedInsights = useMemo(
    () => deriveDashboardInsights(displayStats, displaySessions, displaySessionAnchor),
    [displaySessionAnchor, displayStats, displaySessions],
  );

  const activityRhythm = useMemo(() => {
    const activeDays = displayStats.heatmap_data.filter((point) => point.level > 0).length;
    const hourMap = new Map(displayStats.time_distribution.map((point) => [point.hour, point.message_count]));
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, message_count: hourMap.get(hour) || 0 }));
    const peakHour = hours.reduce((best, point) => point.message_count > best.message_count ? point : best, hours[0]);
    const topHours = [...hours].filter((point) => point.message_count > 0).sort((a, b) => b.message_count - a.message_count).slice(0, 3);
    const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const weekdays = weekdayOrder.map((day) => [day, displayStats.messages_by_day_of_week[day] || 0] as const);
    const strongestWeekday = [...weekdays].sort((left, right) => right[1] - left[1])[0];
    return {
      activeDays,
      coverageDays: displayStats.heatmap_data.length,
      streak: derivedInsights.currentStreak,
      longestStreak: derivedInsights.longestStreak,
      peakHour,
      topHours,
      hours,
      weekdays,
      strongestWeekday,
    };
  }, [displayStats.heatmap_data, displayStats.messages_by_day_of_week, displayStats.time_distribution, derivedInsights.currentStreak, derivedInsights.longestStreak]);

  const projectSessions = useMemo(() => {
    if (!selectedProject) return [];
    const selectedName = getPathBasename(selectedProject);
    const selectedIsPath = hasPathSeparator(selectedProject);
    return displaySessions
      .filter((session) => selectedIsPath ? pathsEqual(session.cwd, selectedProject) : getPathBasename(session.cwd) === selectedName)
      .sort((left, right) => new Date(right.modified).getTime() - new Date(left.modified).getTime());
  }, [displaySessions, selectedProject]);

  const projectOverview = useMemo(() => {
    const depths = projectSessions.map((session) => session.message_count);
    const modelCounts = new Map<string, number>();
    let firstActivity = Number.POSITIVE_INFINITY;
    let latestActivity = 0;
    let liveCount = 0;
    let messages = 0;
    for (const session of projectSessions) {
      messages += session.message_count;
      if (session.isLive || (liveSessionIds?.has(session.id) ?? false)) liveCount += 1;
      const modified = new Date(session.modified).getTime();
      if (Number.isFinite(modified)) {
        firstActivity = Math.min(firstActivity, modified);
        latestActivity = Math.max(latestActivity, modified);
      }
      const models = sessionModels(session);
      for (const model of new Set(models.length ? models : ["unknown"])) modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    }
    return {
      messages,
      liveCount,
      average: projectSessions.length ? messages / projectSessions.length : 0,
      median: percentile(depths, 0.5),
      p90: percentile(depths, 0.9),
      firstActivity: Number.isFinite(firstActivity) ? firstActivity : 0,
      latestActivity,
      activeSpanDays: firstActivity !== Number.POSITIVE_INFINITY && latestActivity ? Math.max(1, Math.ceil((latestActivity - firstActivity) / (24 * 60 * 60 * 1000)) + 1) : 0,
      topModels: Array.from(modelCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 6),
    };
  }, [liveSessionIds, projectSessions]);

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

  const detailDateFormatter = new Intl.DateTimeFormat(i18n.language || undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const renderSessionOverview = () => (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={BarChart3} label={t("dashboard.insight.sessions", "Sessions")} value={formatNumber(displayStats.total_sessions)} tone="text-info" />
        <MetricCard icon={MessageSquare} label={t("dashboard.insight.messages", "Messages")} value={formatNumber(displayStats.total_messages)} tone="text-success" />
        <MetricCard icon={Target} label={t("dashboard.insight.medianLength", "Median length")} value={formatNumber(sessionOverview.medianMessages)} tone="text-warning" />
        <MetricCard icon={Activity} label={t("dashboard.insight.p90Length", "P90 length")} value={formatNumber(sessionOverview.p90Messages)} tone="text-purple" />
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/15 p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-foreground">{t("dashboard.insight.depthProfile", "Session depth profile")}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.depthProfileHint", "Average, median, and tail depth reveal whether work is fragmented or sustained.")}</div>
            </div>
            <span className="rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">{sessionOverview.liveCount} {t("dashboard.insight.liveShort", "live")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.average", "Average")}</div><strong className="mt-1 block text-lg tabular-nums text-foreground">{sessionOverview.avgMessages.toFixed(1)}</strong></div>
            <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.median", "Median")}</div><strong className="mt-1 block text-lg tabular-nums text-foreground">{formatNumber(sessionOverview.medianMessages)}</strong></div>
            <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">P90</div><strong className="mt-1 block text-lg tabular-nums text-foreground">{formatNumber(sessionOverview.p90Messages)}</strong></div>
          </div>
          {sessionOverview.topSession ? (
            <button type="button" onClick={() => onPreviewSession?.(sessionOverview.topSession!)} disabled={!onPreviewSession} className={`mt-3 flex w-full items-center gap-3 rounded border border-border bg-background/50 p-3 text-left ${onPreviewSession ? "focus-ring hover:bg-muted/25" : "cursor-default"}`}>
              <ChevronsDown className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block text-[9px] text-muted-foreground">{t("dashboard.insight.deepestSession", "Deepest session")}</span><span className="mt-0.5 block truncate text-xs font-medium text-foreground" title={sessionOverview.topSession.name || sessionOverview.topSession.first_message}>{sessionOverview.topSession.name || sessionOverview.topSession.first_message || t("common.untitled", "Untitled")}</span></span>
              <strong className="shrink-0 text-sm tabular-nums text-foreground">{sessionOverview.topSession.message_count}</strong>
              {onPreviewSession ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
            </button>
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-muted/15 p-3.5">
          <div className="mb-3 text-xs font-medium text-foreground">{t("dashboard.insight.topProjectsBySessions", "Top projects by sessions")}</div>
          <div className="space-y-1.5">
            {sessionOverview.topProjects.map((project, index) => {
              const share = displayStats.total_sessions > 0 ? project.sessions / displayStats.total_sessions : 0;
              const content = <><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-info/10 text-[9px] font-semibold text-info">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground" title={project.path}>{getPathBasename(project.path) || project.path}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{project.messages} {t("dashboard.insight.msgsUnit", "msgs")} · {Math.round(share * 100)}%</span></span><strong className="text-sm tabular-nums text-foreground">{project.sessions}</strong>{onInspectProject ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}</>;
              return onInspectProject ? <button key={project.path} type="button" onClick={() => onInspectProject(project.path)} className="focus-ring flex w-full items-center gap-2 rounded border border-border/60 bg-background/45 px-2.5 py-2 text-left hover:bg-muted/25">{content}</button> : <div key={project.path} className="flex items-center gap-2 rounded border border-border/60 bg-background/45 px-2.5 py-2">{content}</div>;
            })}
            {sessionOverview.topProjects.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.insight.noProjectData", "No project data.")}</div> : null}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-muted/15 p-3.5">
        <div className="mb-3"><div className="text-xs font-medium text-foreground">{t("dashboard.insight.deepestSessions", "Deepest sessions")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.deepestSessionsHint", "Open a session to inspect why it accumulated depth.")}</div></div>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {sessionOverview.topSessions.map((session, index) => {
            const name = session.name || session.first_message || t("common.untitled", "Untitled");
            const content = <><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-semibold text-primary">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs text-foreground" title={name}>{name}</span><span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{getPathBasename(session.cwd)} · {detailDateFormatter.format(new Date(session.modified))}</span></span><strong className="shrink-0 text-sm tabular-nums text-foreground">{session.message_count}</strong></>;
            return onPreviewSession ? <button key={session.id} type="button" onClick={() => onPreviewSession(session)} className="focus-ring flex items-center gap-2 rounded border border-border/60 bg-background/45 p-2 text-left hover:bg-muted/25">{content}</button> : <div key={session.id} className="flex items-center gap-2 rounded border border-border/60 bg-background/45 p-2">{content}</div>;
          })}
        </div>
      </section>
    </>
  );

  const renderMessageMix = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard icon={MessageSquare} label={t("dashboard.insight.totalMessages", "Total Messages")} value={formatNumber(displayStats.total_messages)} tone="text-info" />
        <MetricCard icon={User} label={t("dashboard.insight.userShare", "User Share")} value={formatPercent(messageMix.userPercent)} tone="text-info" />
        <MetricCard icon={Bot} label={t("dashboard.insight.assistantShare", "Assistant Share")} value={formatPercent(messageMix.assistantPercent)} tone="text-success" />
        <MetricCard icon={Target} label={t("dashboard.insight.assistantUserRatio", "Assistant / User")} value={`1:${messageMix.ratio.toFixed(1)}`} tone="text-warning" />
      </div>

      <section className="rounded-md border border-border bg-muted/15 p-3.5">
        <div className="text-xs font-medium text-foreground mb-3">{t("dashboard.insight.roleBalance", "Role balance")}</div>
        <div className="space-y-3">
          <InsightRow label={t("dashboard.insight.userMessages", "User messages")} value={formatNumber(displayStats.user_messages)} percent={messageMix.userPercent} tone="bg-info" />
          <InsightRow label={t("dashboard.insight.assistantMessages", "Assistant messages")} value={formatNumber(displayStats.assistant_messages)} percent={messageMix.assistantPercent} tone="bg-success" />
        </div>
      </section>

      <section className="rounded-md border border-border bg-muted/15 p-3.5">
        <div className="text-xs font-medium text-foreground mb-3">{t("dashboard.insight.busiestMessageDays", "Busiest message days")}</div>
        <div className="space-y-2">
          {messageMix.topMessageDays.map(([date, count]) => (
            <InsightRow
              key={date}
              label={date}
              value={`${formatNumber(count)} ${t("dashboard.insight.msgsUnit", "msgs")}`}
              percent={(count / Math.max(messageMix.topMessageDays[0]?.[1] ?? 1, 1)) * 100}
              tone="bg-warning"
            />
          ))}
          {messageMix.topMessageDays.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">{t("dashboard.insight.noMessageTimelineData", "No message timeline data.")}</div>
          ) : null}
        </div>
      </section>
    </>
  );

  const renderActivityRhythm = () => {
    const maxHour = Math.max(...activityRhythm.hours.map((point) => point.message_count), 1);
    const maxWeekday = Math.max(...activityRhythm.weekdays.map(([, count]) => count), 1);
    const coverage = activityRhythm.coverageDays > 0 ? activityRhythm.activeDays / activityRhythm.coverageDays : 0;
    return (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard icon={Calendar} label={t("dashboard.insight.activeDays", "Active Days")} value={`${activityRhythm.activeDays}/${activityRhythm.coverageDays || 0}`} tone="text-info" />
          <MetricCard icon={Activity} label={t("dashboard.insight.currentStreak", "Current Streak")} value={`${activityRhythm.streak}d`} tone="text-success" />
          <MetricCard icon={Target} label={t("dashboard.insight.longestStreak", "Longest Streak")} value={`${activityRhythm.longestStreak}d`} tone="text-purple" />
          <MetricCard icon={Clock} label={t("dashboard.insight.peakHour", "Peak Hour")} value={`${getHourLabel(activityRhythm.peakHour.hour, i18n.language)} · ${formatNumber(activityRhythm.peakHour.message_count)}`} tone="text-warning" />
        </div>

        <section className="rounded-md border border-border bg-muted/15 p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-xs font-medium text-foreground">{t("dashboard.insight.hourlyProfile", "24-hour activity profile")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.hourlyProfileHint", "Chronological distribution; empty hours remain visible instead of disappearing from the ranking.")}</div></div><span className="rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">{Math.round(coverage * 100)}% {t("dashboard.insight.dayCoverage", "day coverage")}</span></div>
          <div className="overflow-x-auto pb-1">
            <div className="grid h-36 min-w-[720px] items-end gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(20px, 1fr))" }} role="img" aria-label={t("dashboard.insight.hourlyProfile", "24-hour activity profile")}>
              {activityRhythm.hours.map((point) => (
                <div key={point.hour} className="flex h-full flex-col justify-end gap-1 text-center" title={`${getHourLabel(point.hour, i18n.language)} · ${point.message_count}`}>
                  <span className="text-[8px] tabular-nums text-muted-foreground">{point.message_count || ""}</span>
                  <span className="mx-auto w-full max-w-5 rounded-t bg-warning/75" style={{ height: `${Math.max(point.message_count > 0 ? 6 : 2, (point.message_count / maxHour) * 92)}px` }} aria-hidden="true" />
                  <span className="text-[8px] text-muted-foreground">{point.hour % 3 === 0 ? getHourLabel(point.hour, i18n.language) : ""}</span>
                </div>
              ))}
            </div>
          </div>
          {activityRhythm.topHours.length ? <div className="mt-3 flex flex-wrap gap-1.5">{activityRhythm.topHours.map((point, index) => <span key={point.hour} className="rounded border border-border bg-background px-2 py-1 text-[9px] text-muted-foreground">#{index + 1} {getHourLabel(point.hour, i18n.language)} · {point.message_count}</span>)}</div> : null}
        </section>

        <section className="rounded-md border border-border bg-muted/15 p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-xs font-medium text-foreground">{t("dashboard.insight.weekdayRhythm", "Weekday rhythm")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.weekdayOrderHint", "Monday through Sunday stays in calendar order for direct comparison.")}</div></div>{activityRhythm.strongestWeekday ? <span className="rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground">{t("dashboard.insight.strongestDay", "Strongest")}: {t(`dashboard.insight.weekdays.${activityRhythm.strongestWeekday[0].toLowerCase()}`, activityRhythm.strongestWeekday[0])}</span> : null}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {activityRhythm.weekdays.map(([day, count]) => (
              <div key={day} className="rounded border border-border/60 bg-background/45 p-2.5">
                <div className="truncate text-[10px] font-medium text-foreground">{t(`dashboard.insight.weekdays.${day.toLowerCase()}`, day)}</div>
                <strong className="mt-2 block text-lg tabular-nums text-foreground">{formatNumber(count)}</strong>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60"><div className="h-full rounded-full bg-success" style={{ width: `${(count / maxWeekday) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  };

  if (!open) return null;

  const dateRangeActions = mode === "model_projects" || mode === "project_sessions" ? null : (
    <div className="flex overflow-hidden rounded border border-border" role="group" aria-label={t("dashboard.insight.dateRange", "Date range")}>
      {DATE_RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setDateRange(option.value)}
          aria-pressed={dateRange === option.value}
          className={`focus-ring h-7 border-r border-border px-2 text-[10px] font-medium last:border-r-0 ${dateRange === option.value ? "theme-accent-bg-soft theme-accent-ring theme-accent-fg font-semibold" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}
        >
          {t(option.labelKey, option.label)}
        </button>
      ))}
      {isFiltering ? <span className="flex items-center px-2 text-[9px] text-muted-foreground">{t("dashboard.insight.filtering", "filtering...")}</span> : null}
    </div>
  );

  return (
    <DashboardDialog
      open
      onClose={onClose}
      title={mode === "project_sessions" && selectedProject
        ? t("dashboard.insight.projectSessionsTitle", "Project Insight · {{project}}", { project: getPathBasename(selectedProject) })
        : getModalTitle(mode, t, selectedModel)}
      eyebrow={t("dashboard.insight.title", "Dashboard Insight")}
      subtitle={mode === "model_projects"
        ? t("dashboard.insight.modelScopeSubtitle", "{{projects}} projects · {{sessions}} sessions · {{tokens}} measured tokens", { projects: selectedModelSummary?.projects ?? 0, sessions: selectedModelSummary?.sessions ?? 0, tokens: formatTokens(selectedModelSummary?.tokens ?? 0) })
        : mode === "project_sessions"
          ? t("dashboard.insight.projectScopeSubtitle", "{{sessions}} sessions in the current dashboard scope", { sessions: projectSessions.length })
          : t("dashboard.insight.scopeSubtitle", "{{sessions}} sessions in the selected scope", { sessions: displaySessions.length })}
      actions={dateRangeActions}
      className="max-w-6xl"
      bodyClassName="space-y-4"
    >
      {rangeHasNoSessions ? (
        <div className="grid min-h-64 place-items-center rounded border border-dashed border-border text-center">
          <div>
            <Calendar className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div className="mt-2 text-sm font-medium text-foreground">{t("dashboard.insight.noSessionsInRange", "No sessions in this range")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.insight.chooseAnotherRange", "Choose a wider date range to inspect activity.")}</p>
          </div>
        </div>
      ) : filterError && !hasResolvedRange ? (
        <div className="grid min-h-64 place-items-center rounded border border-destructive/35 bg-destructive/5 px-6 text-center" role="alert">
          <div className="max-w-md">
            <Activity className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
            <div className="mt-2 text-sm font-medium text-foreground">{t("dashboard.insight.filterErrorTitle", "Insight statistics could not be loaded")}</div>
            <p className="mt-1 break-words text-xs text-muted-foreground">{filterError}</p>
            <button type="button" onClick={() => setFilterRetryNonce((value) => value + 1)} className="focus-ring mt-3 h-8 rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-muted/30">
              {t("dashboard.insight.retry", "Retry")}
            </button>
          </div>
        </div>
      ) : !hasResolvedRange ? (
        <div className="grid min-h-64 place-items-center rounded border border-border bg-muted/10" role="status" aria-live="polite">
          <div className="text-center text-xs text-muted-foreground">
            <Activity className="mx-auto mb-2 h-5 w-5 animate-pulse text-primary" aria-hidden="true" />
            {t("dashboard.insight.loadingRange", "Loading insight for the selected range…")}
          </div>
        </div>
      ) : mode === "session_overview" ? (
            renderSessionOverview()
          ) : mode === "message_mix" ? (
            renderMessageMix()
          ) : mode === "activity_rhythm" ? (
            renderActivityRhythm()
          ) : mode === "token_cost" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard
                  icon={Coins}
                  label={t("dashboard.insight.billableTokens", "Billable Tokens")}
                  value={formatTokens(displayStats.total_tokens)}
                  tone="text-info"
                />
                <MetricCard
                  icon={DollarSign}
                  label={t("dashboard.insight.totalCost", "Total Cost")}
                  value={formatCost(totalCostIncSubagents)}
                  tone="text-destructive"
                />
                <MetricCard
                  icon={WalletCards}
                  label={t("dashboard.insight.providersModels", "Providers / Models")}
                  value={`${formatNumber(providerGroups.length)} / ${formatNumber(Object.keys(displayStats.token_details.tokens_by_model).length)}`}
                  tone="text-warning"
                />
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
                      className="focus-ring w-full rounded-md border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        aria-label={t("dashboard.insight.clearSearch", "Clear search")}
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
                      {t("dashboard.insight.providersCount", "{{count}} providers", { count: filteredAndSortedGroups.length })}
                    </div>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
                  >
                    {suggestions.map((suggestion, index) => (
                      <button
                        type="button"
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
                          {suggestion.type === "provider" ? t("dashboard.insight.provider", "Provider") : t("dashboard.insight.model", "Model")}
                        </span>
                        <span className="text-foreground truncate">
                          {suggestion.value}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <section className="rounded-md border border-border bg-background/35 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>{t("dashboard.insight.providerGroupedTable", "Provider grouped usage table")}</span>
                  <span>
                    {t("dashboard.insight.providersModelsCount", "{{providers}} providers, {{models}} models", {
                      providers: filteredAndSortedGroups.length,
                      models: filteredAndSortedGroups.reduce((sum, g) => sum + g.models.length, 0),
                    })}
                  </span>
                </div>

                <div className="max-h-[46vh] overflow-y-auto">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead className="sticky top-0 z-10 bg-background border-b border-border">
                      <tr className="text-muted-foreground">
                        <th className="p-0 text-left font-medium">
                          <button type="button" onClick={() => handleSort("provider")} className="focus-ring flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-muted/30">
                            {t("dashboard.insight.providerModelHeader", "Provider / Model")}
                            {renderSortIcon("provider")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("sessions")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.sessionsHeader", "Sessions")}
                            {renderSortIcon("sessions")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("messages")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.msgsHeader", "Msgs")}
                            {renderSortIcon("messages")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("cost")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.costHeader", "Cost")}
                            {renderSortIcon("cost")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("tokens")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.tokensHeader", "Tokens")}
                            {renderSortIcon("tokens")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("input")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.inHeader", "↑In")}
                            {renderSortIcon("input")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("output")} className="focus-ring flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.outHeader", "↓Out")}
                            {renderSortIcon("output")}
                          </button>
                        </th>
                        <th className="p-0 text-right font-medium">
                          <button type="button" onClick={() => handleSort("cache")} className="focus-ring flex w-full items-center justify-end gap-1 px-3 py-2 hover:bg-muted/30">
                            {t("dashboard.insight.cacheHeader", "Cache")}
                            {renderSortIcon("cache")}
                          </button>
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
                            {t("dashboard.insight.noMatch", 'No providers or models match "{{query}}"', { query: searchQuery })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border bg-background/90">
                  <table className="w-full min-w-[860px] text-xs">
                    <tbody>
                      <tr className="font-semibold text-foreground">
                        <td className="px-3 py-2.5 text-left">{t("dashboard.insight.totalRow", "Total")}</td>
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
          ) : mode === "model_projects" ? (
            <>
              {selectedModelSummary ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricCard icon={FolderGit2} label={t("dashboard.insight.projectsUsingModel", "Projects")} value={formatNumber(selectedModelSummary.projects)} tone="text-warning" />
                  <MetricCard icon={BarChart3} label={t("dashboard.insight.sessions", "Sessions")} value={formatNumber(selectedModelSummary.sessions)} tone="text-info" />
                  <MetricCard icon={Coins} label={t("dashboard.insight.measuredTokens", "Measured tokens")} value={formatTokens(selectedModelSummary.tokens)} tone="text-purple" />
                  <MetricCard icon={DollarSign} label={t("dashboard.insight.totalCost", "Total Cost")} value={formatCost(selectedModelSummary.cost)} tone="text-destructive" />
                </div>
              ) : null}

              {selectedModelSummary ? (
                <section className="rounded-md border border-border bg-muted/15 p-3.5">
                  <div className="mb-3"><div className="text-xs font-medium text-foreground">{t("dashboard.insight.modelTokenMix", "Model token mix")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.modelTokenMixHint", "Input, output, and cache are shown separately so heavy cache use is not mistaken for generation.")}</div></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {[
                      { label: t("dashboard.insight.inputTokens", "Input"), value: selectedModelSummary.input, tone: "bg-info" },
                      { label: t("dashboard.insight.outputTokens", "Output"), value: selectedModelSummary.output, tone: "bg-success" },
                      { label: t("dashboard.insight.cacheTokens", "Cache"), value: selectedModelSummary.cache, tone: "bg-warning" },
                    ].map(({ label, value, tone }) => {
                      const share = selectedModelSummary.tokens > 0 ? value / selectedModelSummary.tokens : 0;
                      return <div key={label} className="rounded border border-border/60 bg-background/45 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{label}</span><strong className="text-sm tabular-nums text-foreground">{formatTokens(value)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60"><div className={`h-full rounded-full ${tone}`} style={{ width: `${share * 100}%` }} /></div><div className="mt-1 text-right text-[9px] text-muted-foreground">{Math.round(share * 100)}%</div></div>;
                    })}
                  </div>
                </section>
              ) : null}

              <div className="rounded-md border border-border bg-muted/15 p-3.5 text-xs text-muted-foreground">
                {t("dashboard.insight.modelProjectsDescription", "Each project is ranked by its share of sessions that used this model. Open a project for exact session and model context.")}
              </div>

              {modelProjects.length > 0 ? (
                <div className="grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                  {modelProjects.map(([projectPath, count], index) => {
                    const total = Math.max(modelProjects.reduce((sum, [, projectCount]) => sum + projectCount, 0), 1);
                    const share = count / total;
                    const projectName = getPathBasename(projectPath) || projectPath;
                    const content = <><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-warning/10 text-[10px] font-semibold text-warning">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground" title={projectPath}>{projectName}</span><span className="mt-1 block text-[9px] text-muted-foreground">{t("dashboard.insight.modelProjectShare", "{{count}} sessions · {{share}} of model use", { count, share: `${Math.round(share * 100)}%` })}</span></span><strong className="text-sm tabular-nums text-foreground">{count}</strong>{onInspectProject ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}</>;
                    return onInspectProject ? <button key={`${selectedModel}-${projectPath}`} type="button" onClick={() => onInspectProject(projectPath)} className="focus-ring flex items-center gap-2 rounded border border-border bg-background/50 p-3 text-left hover:bg-muted/25">{content}</button> : <div key={`${selectedModel}-${projectPath}`} className="flex items-center gap-2 rounded border border-border bg-background/50 p-3">{content}</div>;
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/15 p-4 text-center text-sm text-muted-foreground">{t("dashboard.topModels.noProjectUsage", "No project-level usage found for this model.")}</div>
              )}
            </>
          ) : mode === "project_sessions" ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard icon={FolderGit2} label={t("dashboard.insight.sessions", "Sessions")} value={formatNumber(projectSessions.length)} tone="text-warning" />
                <MetricCard icon={MessageSquare} label={t("dashboard.insight.messages", "Messages")} value={formatNumber(projectOverview.messages)} tone="text-success" />
                <MetricCard icon={Target} label={t("dashboard.insight.medianLength", "Median length")} value={formatNumber(projectOverview.median)} tone="text-purple" />
                <MetricCard icon={Activity} label={t("dashboard.insight.liveSessions", "Live Sessions")} value={formatNumber(projectOverview.liveCount)} tone="text-info" />
              </div>

              <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/15 p-3.5">
                  <div className="mb-3"><div className="text-xs font-medium text-foreground">{t("dashboard.insight.projectActivityWindow", "Project activity window")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.projectActivityWindowHint", "Dates and depth use only sessions from this exact project path in the current dashboard scope.")}</div></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.firstActivity", "First activity")}</div><div className="mt-1 text-xs font-medium text-foreground">{projectOverview.firstActivity ? detailDateFormatter.format(projectOverview.firstActivity) : "—"}</div></div>
                    <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.latestActivity", "Latest activity")}</div><div className="mt-1 text-xs font-medium text-foreground">{projectOverview.latestActivity ? detailDateFormatter.format(projectOverview.latestActivity) : "—"}</div></div>
                    <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.activeSpan", "Active span")}</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{projectOverview.activeSpanDays}d</div></div>
                    <div className="rounded border border-border/60 bg-background/45 p-2.5"><div className="text-[9px] text-muted-foreground">{t("dashboard.insight.avgP90", "Avg / P90")}</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{projectOverview.average.toFixed(1)} / {projectOverview.p90}</div></div>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/15 p-3.5">
                  <div className="mb-3"><div className="text-xs font-medium text-foreground">{t("dashboard.insight.projectModelMix", "Project model mix")}</div><div className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.insight.projectModelMixHint", "Counts represent sessions where each model appeared; multi-model sessions may contribute to more than one row.")}</div></div>
                  <div className="space-y-1.5">
                    {projectOverview.topModels.map(([model, count], index) => <div key={model} className="flex items-center gap-2 rounded border border-border/60 bg-background/45 px-2.5 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple/10 text-[9px] font-semibold text-purple">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs text-foreground" title={model}>{model === "unknown" ? t("dashboard.insight.unknownModel", "Unknown model") : model}</span><strong className="text-sm tabular-nums text-foreground">{count}</strong></div>)}
                    {projectOverview.topModels.length === 0 ? <div className="py-6 text-center text-xs text-muted-foreground">{t("dashboard.insight.noModelData", "No model data for these sessions.")}</div> : null}
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/15 px-3 py-2.5">
                <div><div className="text-xs font-medium text-foreground">{t("dashboard.insight.projectSessionsDescription", "Sessions assigned to this exact project, newest first.")}</div><div className="mt-0.5 max-w-2xl truncate text-[10px] text-muted-foreground" title={selectedProject || undefined}>{selectedProject || t("dashboard.insight.projectPrivacy", "Only project-scoped sessions are shown.")}</div></div>
                {selectedProject && onProjectSelect ? <button type="button" onClick={() => onProjectSelect(selectedProject)} className="focus-ring h-8 rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-muted/30">{t("dashboard.insight.filterToProject", "Filter dashboard to project")}</button> : null}
              </div>

              {projectSessions.length ? (
                <div className="max-h-[46vh] divide-y divide-border/50 overflow-y-auto rounded border border-border">
                  {projectSessions.map((session) => {
                    const name = session.name || session.first_message || t("common.untitled", "Untitled");
                    const models = sessionModels(session);
                    const content = <><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${session.isLive || liveSessionIds?.has(session.id) ? "bg-success" : "bg-muted-foreground/45"}`} aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground" title={name}>{name}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground"><span>{t("dashboard.insight.sessionMessageSummary", "{{count}} messages · modified {{date}}", { count: session.message_count, date: detailDateFormatter.format(new Date(session.modified)) })}</span>{models.slice(0, 2).map((model) => <span key={model} className="max-w-48 truncate rounded bg-purple/10 px-1.5 py-0.5 text-[9px] text-purple" title={model}>{model}</span>)}</span></span>{onPreviewSession ? <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}</>;
                    return onPreviewSession ? <button key={session.id} type="button" onClick={() => onPreviewSession(session)} className="focus-ring flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/25">{content}</button> : <div key={session.id} className="flex items-start gap-2.5 px-3 py-2.5">{content}</div>;
                  })}
                </div>
              ) : (
                <div className="grid min-h-48 place-items-center rounded border border-dashed border-border text-sm text-muted-foreground">{t("dashboard.insight.noProjectSessions", "No sessions were found for this exact project path.")}</div>
              )}
            </>
          ) : null}
    </DashboardDialog>
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
      <tr className="border-b border-border/10 bg-muted/20 text-foreground">
        <td className="p-0 font-medium">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            className="focus-ring flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/30"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronsDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            )}
            {group.provider}
          </button>
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
    <div className="rounded-md border border-border bg-background/50 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3.5 h-3.5 ${tone}`} />
        {label}
      </div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
