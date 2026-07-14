import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import GenericToolCall from "@/components/tool-calls/GenericToolCall";
import { useClipboard } from "@/hooks/useClipboard";
import type {
  PsmCapabilityClient,
  PsmSessionViewerController,
} from "@pi-session-manager/plugin-sdk";

import {
  buildPath,
  buildSegmentPath,
  buildSessionBranchModel,
  entryRelationLabel,
  filterTimelineToSegmentScope,
  nodePrimaryText,
  formatMoney,
  formatNumber,
  formatTimestamp,
  formatTokens,
  resolveBranchNavigation,
  timelineNodes,
  truncate,
  type SessionModel,
  type SessionNode,
  type TimelineMode,
} from "@/utils/session-branch";

import {
  loadSessionEntries,
  type TraceSessionReference,
} from "./sessionEntries";

interface TraceViewProps {
  client: PsmCapabilityClient;
  session: TraceSessionReference;
  activeEntryId?: string | null;
  viewer?: PsmSessionViewerController;
  onClose: () => void;
}

const ROW_HEIGHT = 88;
const OVERSCAN = 7;
const MODES: Array<{
  value: TimelineMode;
  label: string;
  description: string;
}> = [
  {
    value: "conversation",
    label: "Conversation",
    description: "User messages and assistant replies with content",
  },
  {
    value: "context",
    label: "Effective context",
    description: "Reconstructed with Pi compaction semantics",
  },
  {
    value: "full",
    label: "Full path",
    description: "Every entry on the active ending path",
  },
  {
    value: "errors",
    label: "Errors",
    description: "Errors, aborts, and failed tool results",
  },
];

export default function TraceView({
  client,
  session,
  activeEntryId,
  viewer,
  onClose,
}: TraceViewProps) {
  const [model, setModel] = useState<SessionModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TimelineMode>("conversation");
  const [scopeSegmentUid, setScopeSegmentUid] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadSessionEntries(client, session.path)
      .then((entries) => {
        if (cancelled) return;
        setModel(
          buildSessionBranchModel(entries, {
            sessionName: session.name || session.path,
          }),
        );
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEntryId, client, session.name, session.path]);

  const activeLeafUid = model
    ? ((activeEntryId ? model.firstById.get(activeEntryId)?.uid : undefined) ??
      model.defaultLeaf.uid)
    : "";

  useEffect(() => {
    if (!model) return;
    setSelectedUid((current) =>
      current && model.uidMap.has(current) ? current : activeLeafUid,
    );
  }, [activeLeafUid, model]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(
        entry?.contentRect.height || element.clientHeight || 480,
      );
    });
    observer.observe(element);
    setViewportHeight(element.clientHeight || 480);
    return () => observer.disconnect();
  }, [model]);

  const branchPathSet = useMemo(
    () =>
      model
        ? new Set(buildPath(model, activeLeafUid).map((node) => node.uid))
        : new Set<string>(),
    [activeLeafUid, model],
  );

  useEffect(() => {
    if (!model || !selectedUid || branchPathSet.has(selectedUid)) return;
    setSelectedUid(activeLeafUid);
  }, [activeLeafUid, branchPathSet, model, selectedUid]);

  const activateNode = useCallback(
    (uid: string) => {
      const node = model?.uidMap.get(uid);
      if (!node) return;
      const navigation = resolveBranchNavigation(model, node);
      setSelectedUid(navigation.leafUid);
      if (viewer?.navigateBranch) {
        viewer.navigateBranch(navigation.leafId, navigation.targetId, {
          align: "center",
          highlight: true,
        });
      } else {
        viewer?.revealEntry(navigation.targetId, {
          align: "center",
          highlight: true,
        });
      }
    },
    [model, viewer],
  );

  const stepEnding = useCallback(
    (direction: -1 | 1) => {
      if (!model || model.terminalSegments.length === 0) return;
      const currentIndex = model.terminalSegments.findIndex(
        (segment) => segment.leaf?.uid === activeLeafUid,
      );
      const base = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex =
        (base + direction + model.terminalSegments.length) %
        model.terminalSegments.length;
      const leaf = model.terminalSegments[nextIndex]?.leaf;
      if (!leaf) return;
      setSelectedUid(leaf.uid);
      if (viewer?.navigateBranch) {
        viewer.navigateBranch(leaf.id, leaf.id, { align: "center" });
      } else {
        viewer?.revealEntry(leaf.id, { align: "center" });
      }
    },
    [activeLeafUid, model, viewer],
  );

  if (loading) {
    return <TimelineState title="Building active path…" onClose={onClose} />;
  }
  if (error) {
    return (
      <TimelineState
        title="Unable to load path timeline"
        detail={error}
        onClose={onClose}
      />
    );
  }
  if (!model) {
    return <TimelineState title="No session entries" onClose={onClose} />;
  }

  return (
    <PathTimeline
      model={model}
      activeLeafUid={activeLeafUid}
      selectedUid={selectedUid}
      mode={mode}
      scopeSegmentUid={scopeSegmentUid}
      scrollTop={scrollTop}
      viewportHeight={viewportHeight}
      scrollRef={scrollRef}
      onModeChange={setMode}
      onScopeChange={setScopeSegmentUid}
      onScrollTopChange={setScrollTop}
      onSelectNode={setSelectedUid}
      onActivateNode={activateNode}
      onStepEnding={stepEnding}
      onClose={onClose}
    />
  );
}

function PathTimeline({
  model,
  activeLeafUid,
  selectedUid,
  mode,
  scopeSegmentUid,
  scrollTop,
  viewportHeight,
  scrollRef,
  onModeChange,
  onScopeChange,
  onScrollTopChange,
  onSelectNode,
  onActivateNode,
  onStepEnding,
  onClose,
}: {
  model: SessionModel;
  activeLeafUid: string;
  selectedUid: string;
  mode: TimelineMode;
  scopeSegmentUid: string | null;
  scrollTop: number;
  viewportHeight: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  onModeChange: (mode: TimelineMode) => void;
  onScopeChange: (uid: string | null) => void;
  onScrollTopChange: (top: number) => void;
  onSelectNode: (uid: string) => void;
  onActivateNode: (uid: string) => void;
  onStepEnding: (direction: -1 | 1) => void;
  onClose: () => void;
}) {
  const pathNodes = useMemo(
    () => timelineNodes(model, activeLeafUid, mode),
    [activeLeafUid, mode, model],
  );
  const nodes = useMemo(
    () => filterTimelineToSegmentScope(pathNodes, model, scopeSegmentUid),
    [model, pathNodes, scopeSegmentUid],
  );
  const activeLeaf = model.uidMap.get(activeLeafUid) ?? model.defaultLeaf;
  const segmentPath = useMemo(
    () => buildSegmentPath(model, activeLeafUid),
    [activeLeafUid, model],
  );
  const activeSegment = activeLeaf.segment;
  const selectedNode = model.uidMap.get(selectedUid) ?? activeLeaf;
  const metrics = activeLeaf.cum;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    nodes.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = nodes.slice(startIndex, endIndex);

  useEffect(() => {
    onScrollTopChange(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeLeafUid, mode, onScrollTopChange, scopeSegmentUid, scrollRef]);

  useEffect(() => {
    onScopeChange(null);
  }, [activeLeafUid, onScopeChange]);

  useEffect(() => {
    const index = nodes.findIndex((node) => node.uid === selectedUid);
    const scroll = scrollRef.current;
    if (index < 0 || !scroll) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (
      top < scroll.scrollTop ||
      bottom > scroll.scrollTop + scroll.clientHeight
    ) {
      scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight / 3) });
    }
  }, [nodes, scrollRef, selectedUid]);

  return (
    <div className="path-timeline-workbench">
    <main className="path-timeline-view timeline-pane path-timeline-pane">
      <header className="path-timeline-header">
        <div className="path-timeline-heading">
          <div>
            <span>ACTIVE PATH · {activeSegment?.code || "B?"}</span>
            <strong>
              {truncate(
                activeSegment?.lastUserSummary ||
                  activeLeaf.lastUserSummary ||
                  activeLeaf.summary,
                110,
              )}
            </strong>
            <small>
              #{formatNumber(activeLeaf.sequence)} ending ·{" "}
              {formatNumber(segmentPath.length)} segments ·{" "}
              {formatNumber(Math.max(0, segmentPath.length - 1))} forks crossed
            </small>
          </div>
          <div className="path-timeline-actions">
            <button
              type="button"
              onClick={() => onStepEnding(-1)}
              aria-label="Previous ending"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => onStepEnding(1)}
              aria-label="Next ending"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close path timeline"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div
          className="active-segment-lineage"
          aria-label="Active segment lineage"
        >
          {segmentPath.map((segment, index) => (
            <button
              key={segment.uid}
              type="button"
              className={[
                segment.uid === activeSegment?.uid ? "is-terminal" : "",
                scopeSegmentUid === segment.uid ? "is-scope" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                onScopeChange(
                  scopeSegmentUid === segment.uid ? null : segment.uid,
                );
                onSelectNode(segment.start.uid);
              }}
              title={`${segment.code}: ${segment.firstUserSummary}`}
            >
              <b>{segment.code}</b>
              <span>
                #{formatNumber(segment.start.sequence)}–#
                {formatNumber(segment.end.sequence)}
              </span>
              {index < segmentPath.length - 1 ? <i>›</i> : null}
            </button>
          ))}
        </div>

        <div className="branch-metrics">
          <Metric label="Path" value={formatNumber(metrics.entries)} />
          <Metric label="Segments" value={formatNumber(segmentPath.length)} />
          <Metric label="User" value={formatNumber(metrics.user)} />
          <Metric label="Tools" value={formatNumber(metrics.toolResults)} />
          <Metric label="Tokens" value={formatTokens(metrics.totalTokens)} />
          <Metric label="Cost" value={formatMoney(metrics.cost)} />
          <Metric
            label="Errors"
            value={formatNumber(metrics.errors + metrics.aborted)}
            error={metrics.errors + metrics.aborted > 0}
          />
        </div>

        <div
          className="timeline-mode-switch"
          role="group"
          aria-label="Path timeline mode"
        >
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mode === item.value ? "is-active" : ""}
              title={item.description}
              onClick={() => onModeChange(item.value)}
            >
              {item.label}
            </button>
          ))}
          <span>{formatNumber(nodes.length)} records</span>
        </div>
      </header>

      {mode === "context" && metrics.compactions > 0 ? (
        <div className="context-notice">
          Effective context reconstructed from the latest Pi compaction.
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="path-timeline-scroll"
        onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
      >
        <div
          className="path-timeline-spacer"
          style={{ height: nodes.length * ROW_HEIGHT }}
        >
          {visible.map((node, visibleIndex) => {
            const index = startIndex + visibleIndex;
            return (
              <TimelineRow
                key={node.uid}
                node={node}
                index={index}
                selected={node.uid === selectedUid}
                onSelect={() => onSelectNode(node.uid)}
                onActivate={() => onActivateNode(node.uid)}
              />
            );
          })}
        </div>
        {nodes.length === 0 ? (
          <div className="path-timeline-empty">No records in this view.</div>
        ) : null}
      </div>

      <footer className="path-timeline-status" role="status">
        <span>
          {modeLabel(mode)} · {formatNumber(nodes.length)}
          {scopeSegmentUid
            ? ` · ${segmentPath.find((segment) => segment.uid === scopeSegmentUid)?.code ?? "?"}`
            : " · full ending path"}
        </span>
        <span>
          {activeSegment?.code || "B?"} ending · {activeLeaf.id}
        </span>
      </footer>
    </main>
    <TraceInspector
      model={model}
      node={selectedNode}
      onActivate={() => onActivateNode(selectedNode.uid)}
    />
    </div>
  );
}

function TraceInspector({
  model,
  node,
  onActivate,
}: {
  model: SessionModel;
  node: SessionNode;
  onActivate: () => void;
}) {
  const { copyText } = useClipboard();
  const { t } = useTranslation();
  const body = nodePrimaryText(node);
  const tool = traceToolPresentation(model, node, body);

  return (
    <aside className="path-timeline-inspector" aria-label="Selected path entry">
      <header>
        <span>{t("components.traceInspector.title", "Entry inspector")}</span>
        <strong>{roleLabel(node)}</strong>
        <button type="button" onClick={onActivate}>
          {t("components.traceInspector.locate", "Locate in session")}
        </button>
      </header>
      <dl className="path-inspector-meta">
        <div>
          <dt>{t("components.traceInspector.segment", "Segment")}</dt>
          <dd>{node.segment?.code || "B?"}</dd>
        </div>
        <div>
          <dt>{t("components.traceInspector.sequence", "Sequence")}</dt>
          <dd>#{formatNumber(node.sequence)}</dd>
        </div>
        <div>
          <dt>{t("components.traceInspector.relation", "Relation")}</dt>
          <dd>{entryRelationLabel(node)}</dd>
        </div>
        <div>
          <dt>{t("components.traceInspector.time", "Time")}</dt>
          <dd>{formatTimestamp(node.timestampMs)}</dd>
        </div>
      </dl>
      <div className="path-inspector-id">
        <code>{node.id}</code>
        <button
          type="button"
          onClick={() => void copyText(node.id)}
          aria-label={t("components.traceInspector.copyId", "Copy entry ID")}
          title={t("components.traceInspector.copyId", "Copy entry ID")}
        >
          <Copy size={13} />
        </button>
      </div>
      {tool ? (
        <GenericToolCall
          name={tool.name}
          arguments={tool.arguments}
          output={tool.output}
          isError={tool.isError}
          entryId={`trace:${node.uid}`}
        />
      ) : (
        <pre className="path-inspector-content">{body || node.summary}</pre>
      )}
    </aside>
  );
}

function traceToolPresentation(
  model: SessionModel,
  node: SessionNode,
  body: string,
): {
  name: string;
  arguments: Record<string, unknown>;
  output: string;
  isError: boolean;
} | null {
  const message = node.entry.message;
  if (!message) return null;
  if (message.role === "toolResult") {
    const call = message.toolCallId
      ? model.toolCallMap.get(String(message.toolCallId))
      : undefined;
    return {
      name: call?.name || message.toolName || "tool result",
      arguments: call?.arguments || {},
      output: body,
      isError: Boolean(message.isError),
    };
  }
  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return null;
  }
  const call = message.content.find(
    (block) => block.type === "toolCall" && block.name,
  );
  if (!call) return null;
  const result = call.id
    ? model.toolResultByCallId.get(String(call.id))?.[0]
    : undefined;
  return {
    name: call.name || "tool",
    arguments: call.arguments || {},
    output: result ? nodePrimaryText(result) : "",
    isError: Boolean(result?.entry.message?.isError),
  };
}

function TimelineRow({
  node,
  index,
  selected,
  onSelect,
  onActivate,
}: {
  node: SessionNode;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}) {
  const role = roleLabel(node);
  const model = node.actualModel ?? node.effectiveModel;
  const noteType =
    node.entry.type === "session_info"
      ? "RENAME"
      : node.entry.type === "label"
        ? "LABEL"
        : node.entry.type === "model_change"
          ? "MODEL"
          : null;
  const fork = node.children.length > 1;
  const branchStart = node.relation === "branch-start";
  return (
    <article
      className={[
        "path-timeline-row",
        selected ? "is-selected" : "",
        `kind-${node.kind}`,
        branchStart ? "is-branch-start" : "",
        fork ? "is-fork-anchor" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
      onClick={onSelect}
      onDoubleClick={onActivate}
    >
      <div className="path-sequence-column">
        <span>#{formatNumber(node.sequence)}</span>
        <b>{node.segment?.code || "B?"}</b>
        {branchStart ? <em>BRANCH</em> : fork ? <em>FORK</em> : null}
      </div>
      <span className={`path-timeline-avatar kind-${node.kind}`}>
        {role.slice(0, 1).toUpperCase()}
      </span>
      <div className="path-timeline-copy">
        <div className="path-timeline-meta">
          <strong>{role}</strong>
          <time>{formatTimestamp(node.timestampMs).slice(-8)}</time>
          <code>{node.id}</code>
          {noteType ? <mark>{noteType}</mark> : null}
          {node.label ? <mark>#{node.label}</mark> : null}
          {fork ? <mark>{node.children.length}-WAY FORK</mark> : null}
        </div>
        <p>{truncate(node.summary, 430)}</p>
        <small>
          {entryRelationLabel(node)} · segment{" "}
          {formatNumber(node.segmentIndex + 1)}/
          {formatNumber(node.segment?.nodes.length ?? 1)}
          {model ? ` · ${model.label}` : ""}
        </small>
      </div>
      <div className="path-timeline-aside">
        {node.delta.totalTokens ? (
          <span>{formatTokens(node.delta.totalTokens)} tok</span>
        ) : null}
        {node.delta.toolCalls ? (
          <span>{formatNumber(node.delta.toolCalls)} tools</span>
        ) : null}
        {node.delta.errors || node.delta.aborted ? (
          <span className="is-error">error</span>
        ) : null}
        <code>view #{index + 1}</code>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  error = false,
}: {
  label: string;
  value: string;
  error?: boolean;
}) {
  return (
    <span className={`metric-pill ${error ? "is-error" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function TimelineState({
  title,
  detail,
  onClose,
}: {
  title: string;
  detail?: string;
  onClose: () => void;
}) {
  return (
    <div className="path-timeline-state" role="status">
      <button type="button" onClick={onClose} aria-label="Close path timeline">
        <X size={15} />
      </button>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

function roleLabel(node: SessionNode): string {
  if (node.entry.type === "message") {
    const role = node.entry.message?.role;
    if (role === "toolResult")
      return node.entry.message?.toolName
        ? `tool · ${node.entry.message.toolName}`
        : "tool result";
    if (role === "bashExecution") return "bash";
    return role || "message";
  }
  if (node.entry.type === "session_info") return "rename";
  if (node.entry.type === "model_change") return "model change";
  if (node.entry.type === "thinking_level_change") return "thinking";
  return node.entry.type;
}

function modeLabel(mode: TimelineMode): string {
  if (mode === "conversation") return "Conversation";
  if (mode === "context") return "Effective context";
  if (mode === "full") return "Full path";
  return "Errors";
}
