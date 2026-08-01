import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Clock,
  RefreshCw,
  Activity,
  Zap,
  DollarSign,
} from "lucide-react";

import type {
  HeatmapPoint,
  SessionInfo,
  SessionStats,
  DayStats,
} from "@/types";
import StatCard from "./StatCard";
import ActivityHeatmap from "./ActivityHeatmap";
import HeatmapDayModal from "./HeatmapDayModal";
import MessageDistribution from "./MessageDistribution";
import ProjectsChart from "./ProjectsChart";
import RecentSessions from "./RecentSessions";
import TopModelsChart from "./TopModelsChart";
import TimeDistribution from "./TimeDistribution";
import DashboardInsightModal from "./DashboardInsightModal";
import type { DashboardInsightMode } from "./DashboardInsightModal";
import TokenTrendChart from "./TokenTrendChart";
import DashboardPulse from "./DashboardPulse";
import DashboardTimeFilter from "./DashboardTimeFilter";
import DashboardRangeDetail from "./DashboardRangeDetail";
import { deriveDashboardInsights } from "./dashboardInsights";
import {
  buildDashboardHeatmapData,
  createDefaultDashboardTimeSelection,
  dashboardCombinedCost,
  dashboardCombinedTokens,
  dashboardPercentChange,
  dashboardSelectionEquals,
  emptyDashboardStats,
  filterDashboardSessionsByBounds,
  filterDashboardSessionsByProject,
  filterDashboardSessionsByWindow,
  formatDashboardTimeRange,
  getDashboardDateBounds,
  getDashboardTimeAnchor,
  getDashboardTimeOptions,
  getNaturalMonthWindow,
  getNaturalWeekWindow,
  normalizeDashboardTimeSelection,
  type DashboardPeriodComparisonData,
} from "./dashboardTimeRange";
import SessionPreviewModal from "@/components/session-preview/SessionPreviewModal";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import {
  getRuntimeDayStats,
  getRuntimeStats,
} from "@/runtime-data/sessionSource";
import { getPathBasename, hasPathSeparator, pathsEqual } from "@/utils/path";
import { buildSessionPreviewModalActions } from "@/utils/sessionPreviewActions";
import type { TerminalType } from "@/components/settings/types";

interface DashboardProps {
  sessions: SessionInfo[];
  onSessionSelect?: (session: SessionInfo) => void;
  onProjectSelect?: (projectPath: string) => void;
  onPreviewExportSession?: (session: SessionInfo) => void;
  onOpenPreviewRenameDialog?: (session: SessionInfo) => void;
  onPreviewRenameSession?: (
    session: SessionInfo,
    newName: string,
  ) => void | Promise<void>;
  onPreviewForkSession?: (session: SessionInfo) => void;
  onPreviewConvertSession?: (session: SessionInfo) => void;
  onPreviewResumeSession?: (session: SessionInfo) => void | Promise<void>;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  projectName?: string;
  loading?: boolean;
  liveSessionIds?: Set<string>;
}

// Helper function to extract project name from path
function getProjectName(path: string): string {
  return getPathBasename(path);
}

function formatTokensForPulse(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

function formatCostForPulse(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export default function Dashboard({
  sessions,
  onSessionSelect,
  onProjectSelect,
  onPreviewExportSession,
  onOpenPreviewRenameDialog,
  onPreviewRenameSession,
  onPreviewForkSession,
  onPreviewConvertSession,
  onPreviewResumeSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  projectName,
  loading: parentLoading = false,
  liveSessionIds,
}: DashboardProps) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [weekComparison, setWeekComparison] = useState<DashboardPeriodComparisonData | null>(null);
  const [monthComparison, setMonthComparison] = useState<DashboardPeriodComparisonData | null>(null);
  const [timeSelection, setTimeSelection] = useState(createDefaultDashboardTimeSelection);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<HeatmapPoint | null>(null);
  const [dayStats, setDayStats] = useState<DayStats | undefined>(undefined);
  const [isLoadingDayStats, setIsLoadingDayStats] = useState(false);
  const [insightModalMode, setInsightModalMode] = useState<
    DashboardInsightMode | null
  >(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null);
  const statsRequestRef = useRef(0);
  const loadedScopeKeyRef = useRef<string | null>(null);
  const currentScopeKeyRef = useRef("");
  const warmRetryKeysRef = useRef(new Set<string>());

  const projectScopedSessions = useMemo(
    () => filterDashboardSessionsByProject(sessions, projectName),
    [projectName, sessions],
  );
  const effectiveTimeSelection = useMemo(
    () => normalizeDashboardTimeSelection(projectScopedSessions, timeSelection),
    [projectScopedSessions, timeSelection],
  );
  const timeOptions = useMemo(
    () => getDashboardTimeOptions(projectScopedSessions, effectiveTimeSelection),
    [effectiveTimeSelection, projectScopedSessions],
  );
  const dashboardBounds = useMemo(
    () => getDashboardDateBounds(effectiveTimeSelection),
    [effectiveTimeSelection],
  );
  const visibleSessions = useMemo(
    () => filterDashboardSessionsByBounds(projectScopedSessions, dashboardBounds),
    [dashboardBounds, projectScopedSessions],
  );
  const periodAnchor = useMemo(
    () => getDashboardTimeAnchor(dashboardBounds),
    [dashboardBounds],
  );
  const weekWindow = useMemo(() => getNaturalWeekWindow(periodAnchor), [periodAnchor]);
  const monthWindow = useMemo(() => getNaturalMonthWindow(periodAnchor), [periodAnchor]);
  const periodSessionGroups = useMemo(() => ({
    weekCurrent: filterDashboardSessionsByWindow(projectScopedSessions, weekWindow.currentStart, weekWindow.currentEnd),
    weekPrevious: filterDashboardSessionsByWindow(projectScopedSessions, weekWindow.previousStart, weekWindow.previousEnd),
    monthCurrent: filterDashboardSessionsByWindow(projectScopedSessions, monthWindow.currentStart, monthWindow.currentEnd),
    monthPrevious: filterDashboardSessionsByWindow(projectScopedSessions, monthWindow.previousStart, monthWindow.previousEnd),
  }), [monthWindow, projectScopedSessions, weekWindow]);
  const statsKey = useMemo(() => {
    const first = visibleSessions[0];
    const last = visibleSessions[visibleSessions.length - 1];
    return [
      projectName ?? "all",
      effectiveTimeSelection.granularity,
      effectiveTimeSelection.year,
      effectiveTimeSelection.month,
      effectiveTimeSelection.day,
      visibleSessions.length,
      first?.path ?? "",
      first?.modified ?? "",
      last?.path ?? "",
      last?.modified ?? "",
    ].join("|");
  }, [effectiveTimeSelection, projectName, visibleSessions]);
  currentScopeKeyRef.current = statsKey;

  useEffect(() => {
    if (dashboardSelectionEquals(timeSelection, effectiveTimeSelection)) return;
    setTimeSelection(effectiveTimeSelection);
  }, [effectiveTimeSelection, timeSelection]);

  useEffect(() => {
    if (parentLoading) return;
    const requestId = ++statsRequestRef.current;
    const scopeChanged = loadedScopeKeyRef.current !== statsKey;

    // Preserve the last complete snapshot while a new project/time scope loads.
    // Clearing here unmounts the entire dashboard and causes a visible flash.
    setStatsError(null);

    if (visibleSessions.length === 0) {
      loadedScopeKeyRef.current = statsKey;
      setStats(null);
      setWeekComparison(null);
      setMonthComparison(null);
      setIsStatsLoading(false);
      setIsRefreshing(false);
      return;
    }

    setIsStatsLoading(true);
    if (!scopeChanged || reloadNonce > 0) setIsRefreshing(true);

    const getStatsOrEmpty = (target: SessionInfo[]) =>
      target.length ? getRuntimeStats(target) : Promise.resolve(emptyDashboardStats());

    Promise.all([
      getRuntimeStats(visibleSessions),
      getStatsOrEmpty(periodSessionGroups.weekCurrent),
      getStatsOrEmpty(periodSessionGroups.weekPrevious),
      getStatsOrEmpty(periodSessionGroups.monthCurrent),
      getStatsOrEmpty(periodSessionGroups.monthPrevious),
    ])
      .then(([main, weekCurrent, weekPrevious, monthCurrent, monthPrevious]) => {
        if (requestId !== statsRequestRef.current || currentScopeKeyRef.current !== statsKey) return;
        setStats({
          ...main,
          heatmap_data: buildDashboardHeatmapData(visibleSessions, main, dashboardBounds),
        });
        setWeekComparison({ current: weekCurrent, previous: weekPrevious, window: weekWindow });
        setMonthComparison({ current: monthCurrent, previous: monthPrevious, window: monthWindow });
        loadedScopeKeyRef.current = statsKey;

        if (main.total_tokens === 0 && !warmRetryKeysRef.current.has(statsKey)) {
          warmRetryKeysRef.current.add(statsKey);
          window.setTimeout(() => {
            if (currentScopeKeyRef.current === statsKey) setReloadNonce((value) => value + 1);
          }, 3000);
        }
      })
      .catch((error) => {
        if (requestId !== statsRequestRef.current) return;
        console.error("Failed to load dashboard stats:", error);
        setStatsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (requestId !== statsRequestRef.current) return;
        setIsStatsLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      if (requestId === statsRequestRef.current) statsRequestRef.current += 1;
    };
  }, [dashboardBounds, monthWindow, parentLoading, periodSessionGroups, reloadNonce, statsKey, visibleSessions, weekWindow]);

  const handleDayClick = async (point: HeatmapPoint) => {
    setSelectedDay(point);
    setIsLoadingDayStats(true);
    setDayStats(undefined);

    try {
      const result = await getRuntimeDayStats(point.date, visibleSessions);
      setDayStats(result);
    } catch {
      // Fallback: use the data from the heatmap point
      setDayStats(undefined);
    } finally {
      setIsLoadingDayStats(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedDay(null);
    setDayStats(undefined);
  };

  const resolveProjectPath = (projectPathOrName: string): string | null => {
    if (!projectPathOrName) return null;

    if (hasPathSeparator(projectPathOrName)) {
      return projectPathOrName;
    }

    const matchedSession = visibleSessions.find((session) => {
      const nameFromPath = getPathBasename(session.cwd);
      return nameFromPath === projectPathOrName;
    });

    return matchedSession?.cwd || null;
  };

  const handleFilterProjectFromHeatmap = (projectName: string) => {
    if (!onProjectSelect) return;
    const resolvedPath = resolveProjectPath(projectName);
    if (resolvedPath) {
      onProjectSelect(resolvedPath);
    }
  };

  const handleFilterProjectFromModal = (projectPathOrName: string) => {
    if (!onProjectSelect) return;
    const resolvedPath = resolveProjectPath(projectPathOrName);
    if (resolvedPath) {
      onProjectSelect(resolvedPath);
      handleCloseModal();
    }
  };

  const handleOpenSessionFromModal = (sessionPath: string) => {
    const targetSession = visibleSessions.find(
      (session) => pathsEqual(session.path, sessionPath),
    );
    if (targetSession) {
      handleCloseModal();
      setPreviewSession(targetSession);
    }
  };

  const handleExpandPreviewSession = () => {
    if (!previewSession || !onSessionSelect) return;
    onSessionSelect(previewSession);
    setPreviewSession(null);
  };

  const closeInsightModal = () => {
    setInsightModalMode(null);
    setSelectedModel(null);
    setSelectedProject(null);
  };

  const openTokenCostInsight = () => {
    setInsightModalMode("token_cost");
    setSelectedModel(null);
  };

  const openSessionOverviewInsight = () => {
    setInsightModalMode("session_overview");
    setSelectedModel(null);
  };

  const openMessageMixInsight = () => {
    setInsightModalMode("message_mix");
    setSelectedModel(null);
  };

  const openActivityRhythmInsight = () => {
    setInsightModalMode("activity_rhythm");
    setSelectedModel(null);
  };

  const openModelProjectsInsight = (model: string) => {
    setSelectedModel(model);
    setSelectedProject(null);
    setInsightModalMode("model_projects");
  };

  const openProjectSessionsInsight = (projectPath: string) => {
    setSelectedProject(projectPath);
    setSelectedModel(null);
    setInsightModalMode("project_sessions");
  };

  const handleFilterProjectFromInsight = (projectPath: string) => {
    if (!onProjectSelect) return;
    const resolvedPath = resolveProjectPath(projectPath) || projectPath;
    closeInsightModal();
    onProjectSelect(resolvedPath);
  };

  const handlePreviewSessionFromInsight = (session: SessionInfo) => {
    closeInsightModal();
    setPreviewSession(session);
  };

  const isInitialDashboardLoading =
    stats === null &&
    !statsError &&
    (parentLoading ||
      (visibleSessions.length > 0 &&
        (isStatsLoading || loadedScopeKeyRef.current !== statsKey)));
  const isScopeTransition =
    stats !== null &&
    loadedScopeKeyRef.current !== statsKey &&
    isStatsLoading;
  const showScopeTransition = useDelayedLoading(isScopeTransition);
  const scopeLoadFailed = Boolean(
    statsError && loadedScopeKeyRef.current !== statsKey,
  );

  if (isInitialDashboardLoading) {
    return (
      <div
        className="h-full"
        role="status"
        aria-live="polite"
        aria-label={t("dashboard.loading", "Loading dashboard...")}
      >
        <DashboardSkeleton />
      </div>
    );
  }

  const displayStats: SessionStats = stats || emptyDashboardStats();
  const dashboardInsights = deriveDashboardInsights(displayStats, visibleSessions, periodAnchor);
  const weekSessionChange = weekComparison
    ? dashboardPercentChange(weekComparison.current.total_sessions, weekComparison.previous.total_sessions)
    : null;
  const weekMessageChange = weekComparison
    ? dashboardPercentChange(weekComparison.current.total_messages, weekComparison.previous.total_messages)
    : null;
  const weekTokenChange = weekComparison
    ? dashboardPercentChange(dashboardCombinedTokens(weekComparison.current), dashboardCombinedTokens(weekComparison.previous))
    : null;
  const weekCostChange = weekComparison
    ? dashboardPercentChange(dashboardCombinedCost(weekComparison.current), dashboardCombinedCost(weekComparison.previous))
    : null;
  const monthSessionChange = monthComparison
    ? dashboardPercentChange(monthComparison.current.total_sessions, monthComparison.previous.total_sessions)
    : null;
  const monthMessageChange = monthComparison
    ? dashboardPercentChange(monthComparison.current.total_messages, monthComparison.previous.total_messages)
    : null;
  const monthTokenChange = monthComparison
    ? dashboardPercentChange(dashboardCombinedTokens(monthComparison.current), dashboardCombinedTokens(monthComparison.previous))
    : null;
  const monthCostChange = monthComparison
    ? dashboardPercentChange(dashboardCombinedCost(monthComparison.current), dashboardCombinedCost(monthComparison.previous))
    : null;
  const comparisonChanges = effectiveTimeSelection.granularity === "week"
    ? { sessions: weekSessionChange, messages: weekMessageChange, tokens: weekTokenChange, cost: weekCostChange }
    : effectiveTimeSelection.granularity === "month"
      ? { sessions: monthSessionChange, messages: monthMessageChange, tokens: monthTokenChange, cost: monthCostChange }
      : null;
  const formatChange = (value: number | null) =>
    value === null ? t("dashboard.insight.newActivity", "new") : `${value > 0 ? "+" : ""}${Math.round(value)}%`;
  const activeDaysInScope = displayStats.heatmap_data.filter((point) => point.level > 0).length;
  const pulsePrimary = effectiveTimeSelection.granularity === "day"
    ? {
        label: t("dashboard.pulse.selectedDay", "Selected day"),
        value: displayStats.total_messages.toLocaleString(),
        detail: t("dashboard.pulse.selectedDayDetail", "{{count}} sessions in this day", { count: displayStats.total_sessions }),
      }
    : {
        label: t("dashboard.pulse.rangeActivity", "Range activity"),
        value: activeDaysInScope.toLocaleString(),
        detail: t("dashboard.pulse.activeDaysDetail", "active days in the selected range"),
      };
  const rangeLabel = formatDashboardTimeRange(effectiveTimeSelection, i18n.language);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="mb-0.5 truncate text-lg font-semibold text-foreground md:text-xl">
            {projectName ? (
              <>
                {t("dashboard.title")} -{" "}
                <span className="text-info">{getProjectName(projectName)}</span>
              </>
            ) : (
              t("dashboard.title")
            )}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {projectName
              ? t("dashboard.projectSubtitle")
              : t("dashboard.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadNonce((value) => value + 1)}
          disabled={isRefreshing || visibleSessions.length === 0}
          className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded border border-border/60 bg-card/45 px-2.5 text-xs text-muted-foreground motion-surface hover:bg-card/70 hover:text-foreground focus-ring md:gap-2 md:px-3"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          <span className="hidden md:inline">{t("common.refresh")}</span>
        </button>
      </div>

      <div className="mb-4">
        <DashboardTimeFilter
          selection={effectiveTimeSelection}
          options={timeOptions}
          rangeLabel={rangeLabel}
          resultCount={visibleSessions.length}
          totalCount={projectScopedSessions.length}
          onChange={setTimeSelection}
        />
      </div>

      {visibleSessions.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded border border-dashed border-border bg-muted/10 px-6 text-center">
          <div>
            <Clock className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div className="mt-2 text-sm font-medium text-foreground">
              {t("dashboard.timeFilter.emptyTitle", "No sessions in this time range")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.timeFilter.emptyDescription", "Choose another year, month, or day. The dashboard will not fall back to all data.")}
            </p>
          </div>
        </div>
      ) : scopeLoadFailed ? (
        <div className="grid min-h-72 place-items-center rounded border border-destructive/35 bg-destructive/5 px-6 text-center" role="alert">
          <div className="max-w-md">
            <Activity className="mx-auto h-5 w-5 text-destructive" aria-hidden="true" />
            <div className="mt-2 text-sm font-medium text-foreground">
              {t("dashboard.loadError.title", "Dashboard statistics could not be loaded")}
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">{statsError}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((value) => value + 1)}
              className="focus-ring mt-3 h-8 rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-muted/30"
            >
              {t("dashboard.loadError.retry", "Retry")}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative" aria-busy={isScopeTransition}>
          {isScopeTransition ? (
            <div className={`absolute inset-0 z-20 cursor-wait ${showScopeTransition ? "bg-background/35 backdrop-blur-[1px]" : "bg-transparent"}`}>
              {showScopeTransition ? (
                <div className="sticky top-2 mx-auto flex w-fit items-center gap-2 rounded border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-lg" role="status" aria-live="polite">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {t("dashboard.timeFilter.updating", "Updating selected range…")}
                </div>
              ) : null}
            </div>
          ) : null}
      {/* Stats Grid - Compact - 5 cards */}
      {(() => {
        const subagentCost = displayStats.subagent_summary?.total_cost ?? 0;
        const subagentTokens = displayStats.subagent_summary?.total_tokens ?? 0;
        const combinedCost =
          displayStats.token_details.total_cost + subagentCost;
        const combinedTokens = displayStats.total_tokens + subagentTokens;

        const formatCost = (cost: number) =>
          cost < 0.01
            ? `$${cost.toFixed(4)}`
            : cost < 1
              ? `$${cost.toFixed(3)}`
              : `$${cost.toFixed(2)}`;

        const costValue = (
          <>
            <span>{formatCost(combinedCost)}</span>
            {subagentCost > 0 && (
              <div className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal mt-0.5">
                incl. {formatCost(subagentCost)} subagents
              </div>
            )}
          </>
        );

        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-3 mb-4">
            <StatCard
              icon={BarChart3}
              label={t("components.displayStats.cards.sessions")}
              value={displayStats.total_sessions}
              tone="info"
              hint={t("dashboard.kpi.scopeSessionsHint", "{{count}} sessions · {{days}} active days in the selected range", { count: displayStats.total_sessions, days: activeDaysInScope })}
              onClick={openSessionOverviewInsight}
            />
            <StatCard
              icon={Activity}
              label={t("components.displayStats.cards.messages")}
              value={displayStats.total_messages}
              tone="success"
              hint={t("dashboard.kpi.messageHint", "{{ratio}}× assistant messages per user message", { ratio: dashboardInsights.assistantUserRatio.toFixed(1) })}
              onClick={openMessageMixInsight}
            />
            <StatCard
              icon={Clock}
              label={t("components.displayStats.cards.avgPerSession")}
              value={displayStats.average_messages_per_session.toFixed(1)}
              tone="warning"
              hint={t("dashboard.kpi.depthHint", "median {{median}} · p90 {{p90}} messages", { median: Math.round(dashboardInsights.medianMessagesPerSession), p90: dashboardInsights.p90MessagesPerSession })}
              onClick={openSessionOverviewInsight}
            />
            <StatCard
              icon={Zap}
              label={t("components.displayStats.cards.totalTokens")}
              value={
                combinedTokens > 1000000
                  ? `${(combinedTokens / 1000000).toFixed(1)}M`
                  : combinedTokens > 1000
                    ? `${(combinedTokens / 1000).toFixed(1)}k`
                    : combinedTokens
              }
              tone="purple"
              hint={t("dashboard.kpi.scopeTokenHint", "{{tokens}} tokens in the selected range", { tokens: combinedTokens.toLocaleString() })}
              onClick={openTokenCostInsight}
            />
            <div className="col-span-2 md:col-span-1">
              <StatCard
                icon={DollarSign}
                label={t("components.displayStats.cards.totalCost")}
                value={costValue}
                tone="destructive"
                hint={t("dashboard.kpi.scopeCostHint", "{{cost}} in the selected range", { cost: formatCost(combinedCost) })}
                onClick={openTokenCostInsight}
              />
            </div>
          </div>
        );
      })()}

      <div className="mb-3">
        <DashboardPulse
          insights={dashboardInsights}
          primary={pulsePrimary}
          comparison={comparisonChanges ? {
            periodLabel: effectiveTimeSelection.granularity === "week"
              ? t("dashboard.pulse.weekSummary", "This week compared with the previous week")
              : t("dashboard.pulse.monthSummary", "This month compared with the previous month"),
            previousLabel: effectiveTimeSelection.granularity === "week"
              ? t("dashboard.period.previousWeek", "Previous week")
              : t("dashboard.period.previousMonth", "Previous month"),
            metrics: [
              { key: "sessions", label: t("dashboard.period.sessions", "Sessions"), value: displayStats.total_sessions.toLocaleString(), previous: (effectiveTimeSelection.granularity === "week" ? weekComparison?.previous.total_sessions : monthComparison?.previous.total_sessions)?.toLocaleString() || "0", change: formatChange(comparisonChanges.sessions), onClick: openSessionOverviewInsight },
              { key: "messages", label: t("dashboard.period.messages", "Messages"), value: displayStats.total_messages.toLocaleString(), previous: (effectiveTimeSelection.granularity === "week" ? weekComparison?.previous.total_messages : monthComparison?.previous.total_messages)?.toLocaleString() || "0", change: formatChange(comparisonChanges.messages), onClick: openMessageMixInsight },
              { key: "tokens", label: t("dashboard.period.tokens", "Tokens"), value: formatTokensForPulse(dashboardCombinedTokens(displayStats)), previous: formatTokensForPulse(dashboardCombinedTokens((effectiveTimeSelection.granularity === "week" ? weekComparison?.previous : monthComparison?.previous) ?? emptyDashboardStats())), change: formatChange(comparisonChanges.tokens), onClick: openTokenCostInsight },
              { key: "cost", label: t("dashboard.period.cost", "Cost"), value: formatCostForPulse(dashboardCombinedCost(displayStats)), previous: formatCostForPulse(dashboardCombinedCost((effectiveTimeSelection.granularity === "week" ? weekComparison?.previous : monthComparison?.previous) ?? emptyDashboardStats())), change: formatChange(comparisonChanges.cost), onClick: openTokenCostInsight },
            ],
          } : null}
          onOpenSessions={openSessionOverviewInsight}
          onOpenActivity={openActivityRhythmInsight}
        />
      </div>

      <div className="mb-3">
        <DashboardRangeDetail
          granularity={effectiveTimeSelection.granularity}
          stats={displayStats}
          rangeStart={dashboardBounds.start}
          rangeEnd={dashboardBounds.end}
        />
      </div>


      {/* Main Grid - Dense Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left Column - 8 cols */}
        <div className="min-w-0 space-y-3 md:col-span-8">
          {/* Token Trend Chart - Full Width */}
          <TokenTrendChart
            stats={displayStats}
            days={30}
            rangeStart={dashboardBounds.start}
            rangeEnd={dashboardBounds.end}
            rangeLabel={rangeLabel}
            granularity={effectiveTimeSelection.granularity}
          />

          {/* Message Distribution + Heatmap */}
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <MessageDistribution
              stats={displayStats}
              onClick={openMessageMixInsight}
              granularity={effectiveTimeSelection.granularity}
              rangeLabel={rangeLabel}
            />
            <ActivityHeatmap
              data={displayStats.heatmap_data}
              size="mini"
              showLabels={false}
              onDayClick={handleDayClick}
              onProjectFilter={handleFilterProjectFromHeatmap}
              rangeStart={dashboardBounds.start}
              rangeEnd={dashboardBounds.end}
              granularity={effectiveTimeSelection.granularity}
            />
          </div>

          {/* Recent Sessions */}
          <RecentSessions
            sessions={visibleSessions}
            limit={8}
            onSessionSelect={setPreviewSession}
            liveSessionIds={liveSessionIds}
          />
        </div>

        {/* Right Column - 4 cols */}
        <div className="min-w-0 space-y-3 md:col-span-4">
          {/* Top Models */}
          <TopModelsChart
            stats={displayStats}
            limit={5}
            onModelClick={openModelProjectsInsight}
          />

          {/* Projects */}
          <ProjectsChart
            stats={displayStats}
            sessions={visibleSessions}
            limit={5}
            onProjectSelect={onProjectSelect}
            onProjectInspect={openProjectSessionsInsight}
          />

          {/* Time Distribution */}
          <TimeDistribution
            stats={displayStats}
            type="hourly"
            onClick={openActivityRhythmInsight}
          />
        </div>
      </div>

      {/* Heatmap Day Detail Modal */}
      {selectedDay && (
        <HeatmapDayModal
          point={selectedDay}
          onClose={handleCloseModal}
          dayStats={dayStats}
          loading={isLoadingDayStats}
          onFilterProject={handleFilterProjectFromModal}
          onOpenSession={handleOpenSessionFromModal}
          tokenTrend={displayStats.heatmap_data}
        />
      )}

      {previewSession && (() => {
        const previewActions =
          onPreviewExportSession &&
          onOpenPreviewRenameDialog &&
          onPreviewRenameSession
            ? buildSessionPreviewModalActions(previewSession, {
                onPreviewExportSession,
                onOpenPreviewRenameDialog,
                onPreviewRenameSession,
                onPreviewForkSession,
                onPreviewConvertSession,
              })
            : null;
        return (
          <SessionPreviewModal
            session={previewSession}
            isOpen
            onClose={() => setPreviewSession(null)}
            onExpand={handleExpandPreviewSession}
            onExport={previewActions?.onExport ?? (() => {})}
            onConvert={previewActions?.onConvert}
            onRename={previewActions?.onRename ?? (() => {})}
            onRenameSession={previewActions?.onRenameSession}
            onFork={previewActions?.onFork}
            onResumeSession={onPreviewResumeSession}
            terminal={terminal}
            piPath={piPath}
            customCommand={customCommand}
            resumeCommand={resumeCommand}
          />
        );
      })()}

      {insightModalMode && (
        <DashboardInsightModal
          open={Boolean(insightModalMode)}
          mode={insightModalMode}
          stats={displayStats}
          sessions={visibleSessions}
          liveSessionIds={liveSessionIds}
          selectedModel={selectedModel}
          selectedProject={selectedProject}
          onProjectSelect={handleFilterProjectFromInsight}
          onInspectProject={(projectPath) => {
            setSelectedProject(resolveProjectPath(projectPath) || projectPath);
            setSelectedModel(null);
            setInsightModalMode("project_sessions");
          }}
          onPreviewSession={handlePreviewSessionFromInsight}
          onClose={closeInsightModal}
        />
      )}
        </div>
      )}
    </div>
  );
}
