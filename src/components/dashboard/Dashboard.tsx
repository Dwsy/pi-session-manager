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
import SessionPreviewModal from "@/components/session-preview/SessionPreviewModal";
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
  const { t } = useTranslation();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<HeatmapPoint | null>(null);
  const [dayStats, setDayStats] = useState<DayStats | undefined>(undefined);
  const [isLoadingDayStats, setIsLoadingDayStats] = useState(false);
  const [insightModalMode, setInsightModalMode] = useState<
    DashboardInsightMode | null
  >(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null);
  const isLoadingRef = useRef(false);
  const hasLoadedOnce = useRef(false);
  const warmRetryDone = useRef(false);
  const prevProjectRef = useRef(projectName);
  const statsKey = useMemo(() => {
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    return [
      projectName ?? "all",
      sessions.length,
      first?.path ?? "",
      first?.modified ?? "",
      last?.path ?? "",
      last?.modified ?? "",
    ].join("|");
  }, [projectName, sessions]);

  // Reload stats when sessions or project changes
  useEffect(() => {
    if (parentLoading) return;

    // Reset on project switch and show skeleton UI
    if (prevProjectRef.current !== projectName) {
      prevProjectRef.current = projectName;
      hasLoadedOnce.current = false;
      warmRetryDone.current = false;
      setStats(null);
    }

    if (sessions.length === 0) {
      setStats(null);
      hasLoadedOnce.current = false;
      warmRetryDone.current = false;
      return;
    }
    loadStats();
  }, [statsKey, parentLoading]);

  const loadStats = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    // Show refresh indicator only on subsequent updates; do not replace entire UI
    if (hasLoadedOnce.current) {
      setIsRefreshing(true);
    }

    try {
      const result = await getRuntimeStats(sessions);
      setStats(result);
      hasLoadedOnce.current = true;

      // Cold start: backend uses header-only parse for bootstrap so stats come back
      // with zero tokens. A background task warms the cache; retry once after a delay.
      if (
        !warmRetryDone.current &&
        result.total_tokens === 0 &&
        sessions.length > 0
      ) {
        warmRetryDone.current = true;
        setTimeout(() => {
          isLoadingRef.current = false;
          void loadStats();
        }, 3000);
        return;
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    } finally {
      isLoadingRef.current = false;
      setIsRefreshing(false);
    }
  };

  const handleDayClick = async (point: HeatmapPoint) => {
    setSelectedDay(point);
    setIsLoadingDayStats(true);
    setDayStats(undefined);

    try {
      const result = await getRuntimeDayStats(point.date, sessions);
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

    const matchedSession = sessions.find((session) => {
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
    const targetSession = sessions.find(
      (session) => pathsEqual(session.path, sessionPath),
    );
    if (targetSession) {
      setPreviewSession(targetSession);
      handleCloseModal();
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
    setInsightModalMode("model_projects");
  };

  // Show skeleton only on first load with no data
  if (
    !hasLoadedOnce.current &&
    stats === null &&
    (parentLoading || sessions.length > 0)
  ) {
    return <DashboardSkeleton />;
  }

  // Do not show loading state; display empty or actual data directly
  const displayStats: SessionStats = stats || {
    total_sessions: 0,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    total_tokens: 0,
    sessions_by_project: {},
    sessions_by_model: {},
    model_usage_by_project: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 0,
    heatmap_data: [],
    time_distribution: [],
    token_details: {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_cost: 0,
      tokens_by_model: {},
    },
    subagent_summary: {
      total_cost: 0,
      total_runs: 0,
      total_tokens: 0,
      runs_by_agent: {},
      runs_by_model: {},
    },
  };

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-2xl font-bold text-gradient mb-0.5 truncate">
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
          onClick={loadStats}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 md:gap-2 md:px-3 md:py-2 glass-card rounded-lg text-xs motion-surface motion-color motion-press focus-ring hover:scale-105 group flex-shrink-0"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 motion-transform ${isRefreshing ? "animate-spin" : "group-hover:rotate-180"}`}
          />
          <span className="hidden md:inline">{t("common.refresh")}</span>
        </button>
      </div>

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
              color="#569cd6"
              onClick={openSessionOverviewInsight}
            />
            <StatCard
              icon={Activity}
              label={t("components.displayStats.cards.messages")}
              value={displayStats.total_messages}
              color="#7ee787"
              onClick={openMessageMixInsight}
            />
            <StatCard
              icon={Clock}
              label={t("components.displayStats.cards.avgPerSession")}
              value={displayStats.average_messages_per_session.toFixed(1)}
              color="#ffa657"
              onClick={openActivityRhythmInsight}
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
              color="#c792ea"
              onClick={openTokenCostInsight}
            />
            <div className="col-span-2 md:col-span-1">
              <StatCard
                icon={DollarSign}
                label={t("components.displayStats.cards.totalCost")}
                value={costValue}
                color="#ff6b6b"
                onClick={openTokenCostInsight}
              />
            </div>
          </div>
        );
      })()}

      {/* Main Grid - Dense Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left Column - 8 cols */}
        <div className="md:col-span-8 space-y-3">
          {/* Token Trend Chart - Full Width */}
          <TokenTrendChart stats={displayStats} days={30} />

          {/* Message Distribution + Heatmap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MessageDistribution
              stats={displayStats}
              onClick={openMessageMixInsight}
            />
            <ActivityHeatmap
              data={displayStats.heatmap_data}
              size="mini"
              showLabels={false}
              onDayClick={handleDayClick}
              onProjectFilter={handleFilterProjectFromHeatmap}
            />
          </div>

          {/* Recent Sessions */}
          <RecentSessions
            sessions={sessions}
            limit={8}
            onSessionSelect={onSessionSelect}
            liveSessionIds={liveSessionIds}
          />
        </div>

        {/* Right Column - 4 cols */}
        <div className="md:col-span-4 space-y-3">
          {/* Top Models */}
          <TopModelsChart
            stats={displayStats}
            limit={5}
            onModelClick={openModelProjectsInsight}
          />

          {/* Projects */}
          <ProjectsChart
            stats={displayStats}
            sessions={sessions}
            limit={5}
            onProjectSelect={onProjectSelect}
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
          sessions={sessions}
          liveSessionIds={liveSessionIds}
          selectedModel={selectedModel}
          onClose={closeInsightModal}
        />
      )}
    </div>
  );
}
