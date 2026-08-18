import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Wrench,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  PsmCapabilityClient,
  PsmSessionViewerController,
} from "@pi-session-manager/plugin-sdk";
import {
  buildSessionBranchModel,
  formatMoney,
  formatNumber,
  formatTokens,
  resolveBranchNavigation,
  type SessionModel,
} from "@/utils/session-branch";

import TraceInspector, { type TraceInspectorTab } from "./TraceInspector";
import TraceLanes from "./TraceLanes";
import TraceStepList from "./TraceStepList";
import {
  buildTraceTimeline,
  filterTraceSteps,
  formatLatency,
  formatPercent,
  type TraceLane,
  type TraceLens,
  type TraceStats,
} from "./traceModel";
import {
  loadSessionEntries,
  type TraceLoadProgress,
  type TraceSessionReference,
} from "./sessionEntries";

interface TraceViewProps {
  client: PsmCapabilityClient;
  session: TraceSessionReference;
  activeEntryId?: string | null;
  viewer?: PsmSessionViewerController;
  onClose: () => void;
}

const LENSES: Array<{ value: TraceLens; icon: typeof Clock; fallback: string }> = [
  { value: "duration", icon: Clock, fallback: "Duration" },
  { value: "turns", icon: Layers, fallback: "Turns" },
  { value: "calls", icon: Wrench, fallback: "Calls" },
  { value: "errors", icon: AlertTriangle, fallback: "Errors" },
];

export default function TraceView({
  client,
  session,
  activeEntryId,
  viewer,
  onClose,
}: TraceViewProps) {
  const { t } = useTranslation();
  const [model, setModel] = useState<SessionModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadProgress, setLoadProgress] = useState<TraceLoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadedSessionPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const replacingSession = loadedSessionPathRef.current !== session.path;
    if (replacingSession) {
      setModel(null);
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setLoadProgress(null);
    setError(null);
    void loadSessionEntries(client, session.path, (progress) => {
      if (!cancelled) setLoadProgress(progress);
    })
      .then((entries) => {
        if (cancelled) return;
        setModel(
          buildSessionBranchModel(entries, {
            sessionName: session.name || session.path,
          }),
        );
        loadedSessionPathRef.current = session.path;
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeEntryId, client, reloadNonce, session.name, session.path]);

  if (loading) {
    return (
      <TraceState
        title={t("components.trace.loading", "Building execution trace…")}
        detail={formatLoadProgress(loadProgress)}
        onClose={onClose}
      />
    );
  }
  if (error && !model) {
    return (
      <TraceState
        title={t("components.trace.loadFailed", "Unable to load the trace")}
        detail={error}
        isError
        onRetry={() => setReloadNonce((value) => value + 1)}
        onClose={onClose}
      />
    );
  }
  if (!model) {
    return (
      <TraceState title={t("components.trace.empty", "No session entries")} onClose={onClose} />
    );
  }

  return (
    <TraceWorkbench
      model={model}
      activeEntryId={activeEntryId}
      viewer={viewer}
      refreshing={refreshing}
      refreshError={error}
      onRetry={() => setReloadNonce((value) => value + 1)}
      onClose={onClose}
    />
  );
}

function TraceWorkbench({
  model,
  activeEntryId,
  viewer,
  refreshing,
  refreshError,
  onRetry,
  onClose,
}: {
  model: SessionModel;
  activeEntryId?: string | null;
  viewer?: PsmSessionViewerController;
  refreshing: boolean;
  refreshError: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [lens, setLens] = useState<TraceLens>("duration");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState("");
  const [inspectorTab, setInspectorTab] = useState<TraceInspectorTab>("summary");
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const activeLeafUid =
    (activeEntryId ? model.firstById.get(activeEntryId)?.uid : undefined) ??
    model.defaultLeaf.uid;

  const timeline = useMemo(
    () => buildTraceTimeline(model, activeLeafUid),
    [activeLeafUid, model],
  );
  const steps = useMemo(
    () => filterTraceSteps(timeline.steps, lens, search),
    [lens, search, timeline.steps],
  );

  const selected =
    timeline.steps.find((step) => step.uid === selectedUid) ??
    steps[steps.length - 1] ??
    timeline.steps[timeline.steps.length - 1];

  useEffect(() => {
    if (selected && selected.uid !== selectedUid) setSelectedUid(selected.uid);
  }, [selected, selectedUid]);

  useEffect(() => {
    setInspectorTab("summary");
  }, [selectedUid]);

  const locate = useCallback(
    (uid: string) => {
      const node = model.uidMap.get(uid);
      if (!node) return;
      const navigation = resolveBranchNavigation(model, node);
      if (viewer?.navigateBranch) {
        viewer.navigateBranch(navigation.leafId, navigation.targetId, {
          align: "center",
          highlight: true,
        });
      } else {
        viewer?.revealEntry(navigation.targetId, { align: "center", highlight: true });
      }
    },
    [model, viewer],
  );

  const stepSelection = useCallback(
    (direction: -1 | 1) => {
      if (!steps.length) return;
      const index = steps.findIndex((step) => step.uid === selectedUid);
      const next = index < 0 ? 0 : (index + direction + steps.length) % steps.length;
      setSelectedUid(steps[next].uid);
    },
    [selectedUid, steps],
  );

  const laneLabels: Record<TraceLane, string> = {
    input: t("components.trace.lanes.input", "Input"),
    model: t("components.trace.lanes.model", "Model"),
    tools: t("components.trace.lanes.tools", "Tools"),
  };

  return (
    <div className="psm-trace">
      <div className="psm-trace__main">
        <div className="psm-trace-toolbar">
          <div className="psm-trace-lens" role="group" aria-label={t("components.trace.lens", "Trace lens")}>
            {LENSES.map((item) => {
              const Icon = item.icon;
              const isErrorLens = item.value === "errors";
              if (isErrorLens && timeline.stats.errors === 0) return null;
              return (
                <button
                  key={item.value}
                  type="button"
                  data-lens={item.value}
                  className={lens === item.value ? "is-active" : ""}
                  aria-pressed={lens === item.value}
                  onClick={() => setLens(item.value)}
                >
                  <Icon size={12} />
                  <span>{t(`components.trace.lenses.${item.value}`, item.fallback)}</span>
                  {isErrorLens ? <em>{formatNumber(timeline.stats.errors)}</em> : null}
                </button>
              );
            })}
          </div>

          <div className="psm-trace-search">
            <Search size={11} />
            <input
              type="search"
              value={search}
              placeholder={t("components.trace.searchPlaceholder", "Search steps…")}
              aria-label={t("components.trace.searchPlaceholder", "Search steps…")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="psm-trace-toolbar__actions">
            <button
              type="button"
              className="psm-trace-icon-button"
              onClick={() => stepSelection(-1)}
              disabled={steps.length < 2}
              title={t("components.trace.previousStep", "Previous step")}
              aria-label={t("components.trace.previousStep", "Previous step")}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              className="psm-trace-icon-button"
              onClick={() => stepSelection(1)}
              disabled={steps.length < 2}
              title={t("components.trace.nextStep", "Next step")}
              aria-label={t("components.trace.nextStep", "Next step")}
            >
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              className={`psm-trace-icon-button ${inspectorOpen ? "is-active" : ""}`}
              onClick={() => setInspectorOpen((value) => !value)}
              aria-pressed={inspectorOpen}
              title={t("components.trace.toggleInspector", "Toggle inspector")}
              aria-label={t("components.trace.toggleInspector", "Toggle inspector")}
            >
              {inspectorOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            </button>
            <button
              type="button"
              className="psm-trace-icon-button"
              onClick={onClose}
              title={t("components.trace.close", "Close trace")}
              aria-label={t("components.trace.close", "Close trace")}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {refreshing || refreshError ? (
          <div className={`psm-trace-banner ${refreshError ? "is-error" : ""}`} role="status">
            <span>
              {refreshError
                ? t("components.trace.refreshFailed", "Refresh failed: {{message}}", {
                    message: refreshError,
                  })
                : t("components.trace.refreshing", "Refreshing trace…")}
            </span>
            {refreshError ? (
              <button type="button" onClick={onRetry}>
                {t("components.trace.retry", "Retry")}
              </button>
            ) : null}
          </div>
        ) : null}

        <TraceLanes
          timeline={timeline}
          selectedUid={selectedUid}
          labels={laneLabels}
          onSelect={setSelectedUid}
        />

        <TraceStepList
          steps={steps}
          selectedUid={selectedUid}
          emptyLabel={t("components.trace.noSteps", "No steps in this view.")}
          turnLabel={(turn) =>
            turn > 0
              ? t("components.trace.turn", "Turn {{turn}}", { turn })
              : t("components.trace.setup", "Setup")
          }
          onSelect={setSelectedUid}
          onActivate={locate}
        />

        <TraceStatusBar stats={timeline.stats} visible={steps.length} />
      </div>

      {inspectorOpen && selected ? (
        <TraceInspector
          model={model}
          step={selected}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onSelect={setSelectedUid}
          onLocate={() => locate(selected.uid)}
          onClose={() => setInspectorOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TraceStatusBar({ stats, visible }: { stats: TraceStats; visible: number }) {
  const { t } = useTranslation();
  return (
    <footer className="psm-trace-status" role="status">
      <span>
        <b>{formatNumber(stats.turns)}</b> {t("components.trace.turnsUnit", "turns")} ·{" "}
        <b>{formatNumber(visible)}</b>/{formatNumber(stats.steps)}{" "}
        {t("components.trace.stepsUnit", "steps")}
      </span>
      <span>
        LLM <b>{formatLatency(stats.modelMs)}</b> ·{" "}
        {t("components.trace.toolTime", "tools")} <b>{formatLatency(stats.toolMs)}</b>
      </span>
      <span>
        <b>{formatLatency(stats.msPerModelStep)}</b>/{t("components.trace.stepUnit", "step")} ·{" "}
        <b>{stats.outputPerSecond.toFixed(0)}</b> tok/s
      </span>
      <span>
        {t("components.trace.cacheHit", "cache")} <b>{formatPercent(stats.cacheHitRate)}</b>
      </span>
      <span>
        <b>{formatTokens(stats.input + stats.cacheRead)}</b> in ·{" "}
        <b>{formatTokens(stats.output)}</b> out · <b>{formatMoney(stats.cost)}</b>
      </span>
      {stats.errors > 0 ? (
        <span className="is-error">
          <b>{formatNumber(stats.errors)}</b> {t("components.trace.errorsUnit", "errors")}
        </span>
      ) : null}
    </footer>
  );
}

function TraceState({
  title,
  detail,
  isError = false,
  onRetry,
  onClose,
}: {
  title: string;
  detail?: string;
  isError?: boolean;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`psm-trace-state ${isError ? "is-error" : ""}`} role="status">
      <button
        type="button"
        className="psm-trace-icon-button psm-trace-state__close"
        onClick={onClose}
        aria-label={t("components.trace.close", "Close trace")}
      >
        <X size={13} />
      </button>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {onRetry ? (
        <button type="button" className="psm-trace-state__retry" onClick={onRetry}>
          {t("components.trace.retry", "Retry")}
        </button>
      ) : null}
    </div>
  );
}

function formatLoadProgress(progress: TraceLoadProgress | null): string | undefined {
  if (!progress) return undefined;
  if (!progress.totalBytes) return `${formatNumber(progress.loadedBytes)} bytes`;
  const percent = Math.min(
    100,
    Math.round((progress.loadedBytes / progress.totalBytes) * 100),
  );
  return `${percent}% · ${formatNumber(progress.loadedBytes)} / ${formatNumber(progress.totalBytes)} bytes`;
}
