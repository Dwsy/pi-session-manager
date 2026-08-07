import { useEffect, useMemo, useState } from "react";
import type {
  PsmCapabilityClient,
  PsmSessionJsonlEntry,
  PsmSessionReference,
} from "@pi-session-manager/plugin-sdk";

import {
  AtlasDialog,
  GlobalMap,
  readBranchMapSettings,
  writeBranchMapSettings,
} from "@/components/session-branch-map";
import {
  buildSessionBranchModel,
  resolveBranchNavigation,
  type GlobalMapSettings,
} from "@/utils/session-branch";

import { refreshDecisionGraphWithAgent } from "./decisionGraphAgent";
import {
  DECISION_GRAPH_RECORD_TYPE,
  decisionGraphPayloadFromRecord,
  isDecisionGraphFresh,
  type DecisionGraphEdgeKind,
  type DecisionGraphNodeKind,
  type DecisionGraphNodeStatus,
  type DecisionGraphPayload,
} from "./decisionGraphTypes";

type GraphMode = "decisions" | "topology";

const NODE_KIND_LABEL: Record<DecisionGraphNodeKind, string> = {
  decision: "Decision",
  checkpoint: "Checkpoint",
  outcome: "Outcome",
  open_question: "Open question",
};

const NODE_STATUS_LABEL: Record<DecisionGraphNodeStatus, string> = {
  active: "Active",
  superseded: "Superseded",
  resolved: "Resolved",
  open: "Open",
};

const EDGE_KIND_LABEL: Record<DecisionGraphEdgeKind, string> = {
  leads_to: "leads to",
  depends_on: "depends on",
  supersedes: "supersedes",
  resolves: "resolves",
};

interface SessionGraphViewProps {
  client: PsmCapabilityClient;
  session: PsmSessionReference;
  entries: PsmSessionJsonlEntry[];
  labelsByTargetId?: Record<string, string>;
  activeEntryId?: string | null;
  onNavigate?: (leafId: string, targetId: string) => void;
}

export default function SessionGraphView({
  client,
  session,
  entries,
  labelsByTargetId = {},
  activeEntryId,
  onNavigate,
}: SessionGraphViewProps) {
  const model = useMemo(
    () =>
      entries.length > 0
        ? buildSessionBranchModel(entries, {
            labelsByTargetId,
            sessionName: "Branch Map",
          })
        : null,
    [entries, labelsByTargetId],
  );
  const activeLeafUid = model
    ? ((activeEntryId ? model.firstById.get(activeEntryId)?.uid : undefined) ??
      model.defaultLeaf.uid)
    : "";
  const [selectedUid, setSelectedUid] = useState(activeLeafUid);
  const [settings, setSettings] = useState<GlobalMapSettings>(
    readBranchMapSettings,
  );
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [mode, setMode] = useState<GraphMode>("decisions");
  const [decisionGraph, setDecisionGraph] = useState<DecisionGraphPayload | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [decisionRefreshing, setDecisionRefreshing] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;
    setSelectedUid((current) =>
      model.uidMap.has(current) ? current : activeLeafUid,
    );
  }, [activeLeafUid, model]);

  useEffect(() => {
    writeBranchMapSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadDecisionGraph() {
      setDecisionLoading(true);
      setDecisionError(null);
      try {
        const records = await client.records.listForScope({
          scopeType: "session",
          scopeId: session.path,
          recordType: DECISION_GRAPH_RECORD_TYPE,
          limit: 1,
        });
        if (cancelled) return;
        const payload = decisionGraphPayloadFromRecord(records[0], entries);
        setDecisionGraph(payload);
      } catch (error) {
        if (!cancelled) {
          setDecisionGraph(null);
          setDecisionError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setDecisionLoading(false);
      }
    }

    void loadDecisionGraph();
    return () => {
      cancelled = true;
    };
  }, [client, entries, session.path]);

  const decisionGraphFresh = decisionGraph
    ? isDecisionGraphFresh(decisionGraph, entries)
    : false;
  const decisionNodesById = useMemo(
    () => new Map((decisionGraph?.nodes ?? []).map((node) => [node.id, node])),
    [decisionGraph],
  );

  const activateNode = (uid: string) => {
    const node = model?.uidMap.get(uid);
    if (!model || !node) return;
    const navigation = resolveBranchNavigation(model, node);
    setSelectedUid(navigation.leafUid);
    onNavigate?.(navigation.leafId, navigation.targetId);
  };

  const navigateToEntry = (entryId: string) => {
    const node = model?.firstById.get(entryId);
    if (!model || !node) return;
    const navigation = resolveBranchNavigation(model, node);
    setSelectedUid(navigation.leafUid);
    onNavigate?.(navigation.leafId, navigation.targetId);
  };

  const refreshDecisionGraph = async () => {
    if (entries.length === 0) return;
    setDecisionRefreshing(true);
    setDecisionError(null);
    try {
      const payload = await refreshDecisionGraphWithAgent(client, {
        path: session.path,
        entries,
      });
      setDecisionGraph(payload);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : String(error));
    } finally {
      setDecisionRefreshing(false);
      setDecisionLoading(false);
    }
  };

  if (!model) {
    return (
      <div className="branch-map-empty" role="status">
        No session entries available for Branch Map.
      </div>
    );
  }

  return (
    <div className="branch-map-view">
      <div className="branch-map-modebar" role="toolbar" aria-label="Branch map mode">
        <div className="branch-map-mode-switch" role="group" aria-label="Map mode">
          <button
            type="button"
            className={mode === "decisions" ? "is-active" : undefined}
            aria-pressed={mode === "decisions"}
            onClick={() => setMode("decisions")}
          >
            Decisions
          </button>
          <button
            type="button"
            className={mode === "topology" ? "is-active" : undefined}
            aria-pressed={mode === "topology"}
            onClick={() => setMode("topology")}
          >
            Topology
          </button>
        </div>
        {mode === "decisions" ? (
          <button
            type="button"
            className="decision-map-refresh"
            disabled={decisionRefreshing}
            onClick={() => void refreshDecisionGraph()}
          >
            {decisionRefreshing ? "Analyzing…" : decisionGraph ? "Refresh" : "Generate"}
          </button>
        ) : null}
      </div>

      {mode === "topology" ? (
        <div className="branch-map-topology">
          <GlobalMap
            model={model}
            activeLeafUid={activeLeafUid}
            selectedUid={selectedUid}
            settings={settings}
            collapsed={false}
            onCollapsedChange={() => {}}
            onSettingsChange={setSettings}
            onSelectNode={setSelectedUid}
            onActivateNode={activateNode}
            onOpenAtlas={() => setAtlasOpen(true)}
          />
        </div>
      ) : (
        <div className="decision-map-surface" aria-busy={decisionLoading || decisionRefreshing}>
          <header className="decision-map-header">
            <div>
              <div className="decision-map-eyebrow">Session semantics</div>
              <h2>Decision map</h2>
            </div>
            {decisionGraph ? (
              <span className={`decision-map-freshness ${decisionGraphFresh ? "is-current" : "is-stale"}`}>
                {decisionGraphFresh ? "Current" : "Stale"}
              </span>
            ) : null}
          </header>

          {decisionError ? (
            <div className="decision-map-message is-error" role="alert">
              <strong>Decision map unavailable.</strong>
              <span>{decisionError}</span>
            </div>
          ) : null}

          {!decisionError && decisionLoading ? (
            <div className="decision-map-message" role="status">
              Reading saved decision map…
            </div>
          ) : null}

          {!decisionLoading && decisionGraph && !decisionGraphFresh ? (
            <div className="decision-map-message is-stale" role="status">
              This map predates the latest session entries. Refresh to include the newest decisions.
            </div>
          ) : null}

          {!decisionLoading && !decisionGraph && !decisionError ? (
            <div className="decision-map-empty-state">
              <strong>No decision map yet.</strong>
              <span>Generate one to extract decisions, checkpoints, outcomes, and open questions from this session.</span>
              <button type="button" disabled={decisionRefreshing} onClick={() => void refreshDecisionGraph()}>
                {decisionRefreshing ? "Analyzing session…" : "Generate decision map"}
              </button>
            </div>
          ) : null}

          {!decisionLoading && decisionGraph && decisionGraph.nodes.length === 0 ? (
            <div className="decision-map-empty-state" role="status">
              <strong>No high-signal decisions found.</strong>
              <span>The generated map is valid, but it did not identify any decisions worth surfacing.</span>
            </div>
          ) : null}

          {decisionGraph && decisionGraph.nodes.length > 0 ? (
            <div className="decision-map-graph" role="list" aria-label="Session decision graph">
              {decisionGraph.nodes.map((node, index) => {
                const outgoing = decisionGraph.edges.filter((edge) => edge.from === node.id);
                const evidenceEntryIds = [node.anchorEntryId, ...node.evidenceEntryIds.filter((id) => id !== node.anchorEntryId)];
                return (
                  <article
                    key={node.id}
                    className={`decision-map-node kind-${node.kind}${node.status ? ` status-${node.status}` : ""}`}
                    role="listitem"
                  >
                    <div className="decision-map-node-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="decision-map-node-body">
                      <div className="decision-map-node-meta">
                        <span className="decision-map-kind">{NODE_KIND_LABEL[node.kind]}</span>
                        {node.status ? (
                          <span className="decision-map-status">{NODE_STATUS_LABEL[node.status]}</span>
                        ) : null}
                      </div>
                      <h3>{node.title}</h3>
                      <p>{node.summary}</p>

                      {outgoing.length > 0 ? (
                        <div className="decision-map-relations" aria-label="Relationships">
                          {outgoing.map((edge) => {
                            const target = decisionNodesById.get(edge.to);
                            return (
                              <span key={`${edge.from}:${edge.kind}:${edge.to}`} className="decision-map-relation">
                                {EDGE_KIND_LABEL[edge.kind]} → {target?.title ?? edge.to}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="decision-map-evidence" aria-label={`Evidence for ${node.title}`}>
                        {evidenceEntryIds.map((entryId, evidenceIndex) => (
                          <button
                            key={entryId}
                            type="button"
                            aria-label={`${evidenceIndex === 0 ? "Source" : `Evidence ${evidenceIndex}`} ${entryId}`}
                            onClick={() => navigateToEntry(entryId)}
                            title={`Reveal session entry ${entryId}`}
                          >
                            {evidenceIndex === 0 ? "Source" : `Evidence ${evidenceIndex}`}
                            <span>{entryId.slice(0, 8)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      <AtlasDialog
        open={atlasOpen}
        model={model}
        activeLeafUid={activeLeafUid}
        selectedUid={selectedUid}
        settings={settings}
        onSettingsChange={setSettings}
        onSelectNode={setSelectedUid}
        onActivateNode={activateNode}
        onClose={() => setAtlasOpen(false)}
      />
    </div>
  );
}

export const resolveBranchMapNavigation = resolveBranchNavigation;
