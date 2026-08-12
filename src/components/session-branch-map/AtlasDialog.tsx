import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type {
  BranchFork,
  BranchSegment,
  GlobalMapSettings,
  SemanticNote,
  SessionModel,
} from "@/utils/session-branch";
import {
  buildBranchReplayCheckpoints,
  buildPath,
  buildSegmentPath,
} from "@/utils/session-branch";
import {
  formatMoney,
  formatNumber,
  formatTimestamp,
  formatTokens,
  truncate,
} from "@/utils/session-branch";
import {
  CloseIcon,
  ResetIcon,
  TargetIcon,
  PlayIcon,
  PauseIcon,
  StepIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "./Icons";
import { buildTopologyLayout } from "@/utils/session-branch";
import { useElementSize } from "./useElementSize";
import {
  GlobalMapCanvas,
  clampView,
  fitMapViewToLayout,
  type MapView,
} from "./GlobalMapCanvas";
import { entryRelationKey } from "./entryRelation";
import { GlobalMapToolbar } from "./GlobalMapToolbar";
import { useAtlasReplay } from "./useAtlasReplay";

interface AtlasDialogProps {
  open: boolean;
  model: SessionModel;
  activeLeafUid: string;
  selectedUid: string;
  settings: GlobalMapSettings;
  onSettingsChange: (settings: GlobalMapSettings) => void;
  onSelectNode: (uid: string) => void;
  onActivateNode: (uid: string) => void;
  onClose: () => void;
}

type AtlasTab = "branches" | "forks" | "notes";

export function AtlasDialog({
  open,
  model,
  activeLeafUid,
  selectedUid,
  settings,
  onSettingsChange,
  onSelectNode,
  onActivateNode,
  onClose,
}: AtlasDialogProps): React.ReactElement | null {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const mapShellRef = useRef<HTMLElement>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  const shellSize = useElementSize(mapShellRef);
  const canvasSize = useElementSize(canvasLayerRef);
  const layout = useMemo(
    () => buildTopologyLayout(model, settings.axis),
    [model, settings.axis],
  );
  const fitView = useMemo(() => {
    const w = canvasSize.width >= 8 ? canvasSize.width : shellSize.width;
    const h = canvasSize.height >= 8 ? canvasSize.height : shellSize.height;
    return fitMapViewToLayout(layout, w, h, "atlas");
  }, [
    layout,
    canvasSize.width,
    canvasSize.height,
    shellSize.width,
    shellSize.height,
  ]);
  const [view, setView] = useState<MapView>(() =>
    fitMapViewToLayout(layout, 0, 0, "atlas"),
  );
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<AtlasTab>("branches");
  const replayCheckpoints = useMemo(
    () => buildBranchReplayCheckpoints(model, activeLeafUid),
    [model, activeLeafUid],
  );
  const replay = useAtlasReplay(replayCheckpoints);

  const selectedNode = model.uidMap.get(selectedUid) ?? model.defaultLeaf;
  const selectedSegment = selectedNode.segment;
  const selectedPath = useMemo(
    () => buildPath(model, selectedNode.uid),
    [model, selectedNode.uid],
  );
  const selectedSegments = useMemo(
    () => buildSegmentPath(model, selectedNode.uid),
    [model, selectedNode.uid],
  );
  const enabledNotes = useMemo(
    () => model.notes.filter((note) => settings.enabledNotes[note.type]),
    [model, settings.enabledNotes],
  );
  const notesByType = useMemo(() => groupNotes(enabledNotes), [enabledNotes]);
  const activeTerminalIndex = model.terminalSegments.findIndex(
    (segment) => segment.leaf?.uid === activeLeafUid,
  );

  useEffect(() => {
    if (!open || shellSize.width < 8) return;
    setView(fitView);
    setFocusUid(null);
    setFocusNonce(0);
    setSidebarTab("branches");
  }, [open, model, fitView]);

  useEffect(() => {
    if (!replay.started || !replay.current) return;
    onSelectNode(replay.current.node.uid);
    focus(replay.current.node.uid);
  }, [onSelectNode, replay.current, replay.started]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        trapFocusWithinDialog(event, dialogRef.current);
        return;
      }
      if (isInteractiveShortcutTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        replay.playPause();
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        focus(selectedUid);
      }
      if (event.key === "0") {
        event.preventDefault();
        setView(fitView);
      }
      if (event.key === "1") {
        event.preventDefault();
        setSidebarTab("branches");
      }
      if (event.key === "2") {
        event.preventDefault();
        setSidebarTab("forks");
      }
      if (event.key === "3") {
        event.preventDefault();
        setSidebarTab("notes");
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, selectedUid, replay]);

  if (!open) return null;

  const isMacTauri =
    typeof document !== "undefined" &&
    Boolean(
      document.querySelector(
        '.app-shell[data-runtime="tauri"][data-os="macos"]',
      ),
    );

  function focus(uid: string): void {
    setFocusUid(uid);
    setFocusNonce((value) => value + 1);
  }

  function adjustZoom(factor: number): void {
    setView((current) =>
      clampView({ ...current, zoom: current.zoom * factor }, layout),
    );
  }

  function selectAndFocus(uid: string): void {
    replay.stop();
    onSelectNode(uid);
    focus(uid);
  }

  function handleNoteClick(note: SemanticNote): void {
    selectAndFocus(note.anchorUid);
  }

  return createPortal(
    <div
      className="atlas-backdrop branch-atlas-surface"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="atlas-dialog branch-atlas-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-atlas-title"
        tabIndex={-1}
      >
        <header
          className={`atlas-header branch-atlas-header ${isMacTauri ? "is-macos-tauri" : ""}`}
        >
          <div className="atlas-heading">
            <strong id="branch-atlas-title">
              <span>{t("components.branchMap.title", "BRANCH MAP")}</span>
            </strong>
            <small>
              {t(
                "components.branchMap.atlas.summary",
                "{{entries}} entries collapsed into {{segments}} linear segments · {{forks}} real forks · {{endings}} endings",
                {
                  entries: formatNumber(model.nodes.length),
                  segments: formatNumber(model.segments.length),
                  forks: formatNumber(model.forks.length),
                  endings: formatNumber(model.terminalSegments.length),
                },
              )}
            </small>
          </div>
          <div className="atlas-header-actions">
            <button
              type="button"
              className="toolbar-button"
              onClick={() => focus(selectedUid)}
              title={t(
                "components.branchMap.atlas.focusTitle",
                "Focus selected entry (F)",
              )}
            >
              <TargetIcon />
              {t("components.branchMap.atlas.focus", "Focus")}
            </button>
            <button
              type="button"
              className="toolbar-button"
              onClick={() => setView(fitView)}
              title={t("components.branchMap.atlas.fitTitle", "Fit to view (0)")}
            >
              <ResetIcon />
              {t("components.branchMap.atlas.fit", "Fit")}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => adjustZoom(1 / 1.35)}
              aria-label={t("components.branchMap.atlas.zoomOut", "Zoom out")}
              title={t("components.branchMap.atlas.zoomOut", "Zoom out")}
            >
              <ZoomOutIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => adjustZoom(1.35)}
              aria-label={t("components.branchMap.atlas.zoomIn", "Zoom in")}
              title={t("components.branchMap.atlas.zoomIn", "Zoom in")}
            >
              <ZoomInIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t(
                "components.branchMap.atlas.closeAtlas",
                "Close branch atlas",
              )}
              title={t("common.close", "Close")}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="atlas-filterbar">
          <GlobalMapToolbar
            model={model}
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
          <div
            className="atlas-replay-controls"
            role="group"
            aria-label={t(
              "components.branchMap.atlas.replay.group",
              "Branch replay",
            )}
          >
            <button
              type="button"
              className="icon-button"
              onClick={() => replay.step(-1)}
              disabled={!replay.index}
              title={t(
                "components.branchMap.atlas.replay.previous",
                "Previous replay node",
              )}
            >
              <StepIcon style={{ transform: "scaleX(-1)" }} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={replay.playPause}
              disabled={!replayCheckpoints.length}
              title={
                replay.playing
                  ? t(
                      "components.branchMap.atlas.replay.pause",
                      "Pause replay (Space)",
                    )
                  : t(
                      "components.branchMap.atlas.replay.play",
                      "Play replay (Space)",
                    )
              }
            >
              {replay.playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => replay.step(1)}
              disabled={replay.index >= replay.lastIndex}
              title={t(
                "components.branchMap.atlas.replay.next",
                "Next replay node",
              )}
            >
              <StepIcon />
            </button>
            <input
              type="range"
              min="0"
              max={replay.lastIndex}
              value={replay.index}
              onChange={(event) => replay.seek(Number(event.target.value))}
              aria-label={t(
                "components.branchMap.atlas.replay.progress",
                "Replay progress",
              )}
            />
            <select
              className="replay-speed"
              value={replay.speed}
              onChange={(event) =>
                replay.setSpeed(
                  Number(event.target.value) as typeof replay.speed,
                )
              }
              aria-label={t(
                "components.branchMap.atlas.replay.speed",
                "Replay speed",
              )}
            >
              {[1, 2, 4, 8, 16, 32, 64, 128].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
            <span className="replay-progress">
              {replay.index + 1}/{Math.max(1, replayCheckpoints.length)}
            </span>
            {replay.current?.fork && (
              <span className="replay-fork">
                {replay.current.fork.code} ·{" "}
                {t("components.branchMap.atlas.routes", "{{count}} routes", {
                  count: replay.current.fork.children.length,
                })}
              </span>
            )}
          </div>
          <div className="atlas-view-readout">
            <span>{Math.round(view.zoom * 100)}%</span>
            <span>{t(scopeLabelKey(settings.scope))}</span>
            <span>
              {settings.axis === "sequence"
                ? t(
                    "components.branchMap.atlas.axisSequence",
                    "Path sequence axis",
                  )
                : t("components.branchMap.atlas.axisTime", "Actual time axis")}
            </span>
          </div>
        </div>

        <div className="atlas-body branch-atlas-body">
          <main
            ref={mapShellRef}
            className="atlas-map-shell branch-atlas-map-shell branch-atlas-map-stack"
          >
            <div ref={canvasLayerRef} className="branch-atlas-canvas-layer">
              <GlobalMapCanvas
                model={model}
                activeLeafUid={activeLeafUid}
                selectedUid={selectedUid}
                settings={settings}
                mode="atlas"
                view={view}
                onViewChange={setView}
                focusUid={focusUid}
                focusNonce={focusNonce}
                onSelectNode={onSelectNode}
                onActivateNode={onActivateNode}
              />
              <div className="atlas-instructions">
                {t(
                  "components.branchMap.atlas.instructions",
                  "Drag to pan · scroll to zoom · click to inspect · double-click to switch to that ending",
                )}
              </div>
            </div>
            <div className="atlas-selection-hud branch-selection-hud branch-atlas-selection-dock">
              <div className="selection-identity">
                <span>
                  {selectedSegment?.code || "—"} · #
                  {formatNumber(selectedNode.sequence)} ·{" "}
                  {t(entryRelationKey(selectedNode))}
                </span>
                <strong>{truncate(selectedNode.summary, 165)}</strong>
                <small>
                  {t(
                    "components.branchMap.atlas.selection.meta",
                    "branch level {{level}} · segment {{position}}/{{total}} · line {{line}}",
                    {
                      level: formatNumber(selectedNode.branchLevel),
                      position: formatNumber(selectedNode.segmentIndex + 1),
                      total: formatNumber(selectedSegment?.nodes.length ?? 1),
                      line: formatNumber(selectedNode.lineNo),
                    },
                  )}
                </small>
              </div>
              <div className="selection-path-readout">
                <span>
                  <b>{formatNumber(selectedPath.length)}</b>{" "}
                  {t(
                    "components.branchMap.atlas.selection.pathEntries",
                    "path entries",
                  )}
                </span>
                <span>
                  <b>{formatNumber(selectedSegments.length)}</b>{" "}
                  {t(
                    "components.branchMap.atlas.selection.branchSegments",
                    "branch segments",
                  )}
                </span>
                <span>
                  <b>
                    {formatNumber(Math.max(0, selectedSegments.length - 1))}
                  </b>{" "}
                  {t(
                    "components.branchMap.atlas.selection.forksCrossed",
                    "forks crossed",
                  )}
                </span>
              </div>
              <div className="selection-actions">
                <button type="button" onClick={() => focus(selectedNode.uid)}>
                  {t("components.branchMap.atlas.locate", "Locate")}
                </button>
                <button
                  type="button"
                  onClick={() => onActivateNode(selectedNode.uid)}
                >
                  {t("components.branchMap.atlas.setActive", "Set active")}
                </button>
              </div>
            </div>
          </main>

          <aside className="atlas-sidebar branch-atlas-sidebar">
            <div className="atlas-sidebar-tabs" role="tablist">
              <button
                id="branch-atlas-tab-branches"
                type="button"
                role="tab"
                aria-selected={sidebarTab === "branches"}
                aria-controls="branch-atlas-panel-branches"
                tabIndex={sidebarTab === "branches" ? 0 : -1}
                className={sidebarTab === "branches" ? "is-active" : ""}
                onClick={() => setSidebarTab("branches")}
              >
                {t("components.branchMap.atlas.tabs.branches", "Segments")}{" "}
                <b>{formatNumber(model.segments.length)}</b>
                <kbd>1</kbd>
              </button>
              <button
                id="branch-atlas-tab-forks"
                type="button"
                role="tab"
                aria-selected={sidebarTab === "forks"}
                aria-controls="branch-atlas-panel-forks"
                tabIndex={sidebarTab === "forks" ? 0 : -1}
                className={sidebarTab === "forks" ? "is-active" : ""}
                onClick={() => setSidebarTab("forks")}
              >
                {t("components.branchMap.atlas.tabs.forks", "Forks")}{" "}
                <b>{formatNumber(model.forks.length)}</b>
                <kbd>2</kbd>
              </button>
              <button
                id="branch-atlas-tab-notes"
                type="button"
                role="tab"
                aria-selected={sidebarTab === "notes"}
                aria-controls="branch-atlas-panel-notes"
                tabIndex={sidebarTab === "notes" ? 0 : -1}
                className={sidebarTab === "notes" ? "is-active" : ""}
                onClick={() => setSidebarTab("notes")}
              >
                {t("components.branchMap.notes.summary", "Notes")}{" "}
                <b>{formatNumber(enabledNotes.length)}</b>
                <kbd>3</kbd>
              </button>
            </div>

            {sidebarTab === "branches" ? (
              <div id="branch-atlas-panel-branches" className="atlas-sidebar-panel" role="tabpanel" aria-labelledby="branch-atlas-tab-branches">
                <BranchSidebar
                  model={model}
                  activeLeafUid={activeLeafUid}
                  activeTerminalIndex={activeTerminalIndex}
                  selectedSegmentUid={selectedSegment?.uid || ""}
                  onFocus={selectAndFocus}
                  onActivate={onActivateNode}
                />
              </div>
            ) : sidebarTab === "forks" ? (
              <div id="branch-atlas-panel-forks" className="atlas-sidebar-panel" role="tabpanel" aria-labelledby="branch-atlas-tab-forks">
                <ForkSidebar
                  model={model}
                  onFocus={selectAndFocus}
                  onActivate={onActivateNode}
                />
              </div>
            ) : (
              <div id="branch-atlas-panel-notes" className="atlas-sidebar-panel" role="tabpanel" aria-labelledby="branch-atlas-tab-notes">
                <NotesSidebar
                  notesByType={notesByType}
                  enabledNotes={enabledNotes}
                  onNoteClick={handleNoteClick}
                />
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function BranchSidebar({
  model,
  activeLeafUid,
  activeTerminalIndex,
  selectedSegmentUid,
  onFocus,
  onActivate,
}: {
  model: SessionModel;
  activeLeafUid: string;
  activeTerminalIndex: number;
  selectedSegmentUid: string;
  onFocus: (uid: string) => void;
  onActivate: (uid: string) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section branch-reading-guide">
        <div className="side-section-head">
          <strong>
            {t("components.branchMap.atlas.guide.title", "How to read")}
          </strong>
          <span>
            {t("components.branchMap.forkOnlyHierarchy", "fork-only hierarchy")}
          </span>
        </div>
        <div className="reading-equation">
          <span>
            {t(
              "components.branchMap.atlas.guide.consecutiveParents",
              "consecutive parentId",
            )}
          </span>
          <b>→</b>
          <strong>
            {t(
              "components.branchMap.atlas.guide.linearRail",
              "one linear rail",
            )}
          </strong>
          <span>
            {t(
              "components.branchMap.atlas.guide.multipleChildren",
              "entry with multiple children",
            )}
          </span>
          <b>→</b>
          <strong>
            {t(
              "components.branchMap.atlas.guide.childBranches",
              "child branches",
            )}
          </strong>
        </div>
      </section>

      <section className="atlas-side-section">
        <div className="side-section-head">
          <strong>
            {t("components.branchMap.atlas.endings.title", "Ending branches")}
          </strong>
          <span>
            {t("components.branchMap.atlas.endings.count", "{{count}} endings", {
              count: model.terminalSegments.length,
            })}
          </span>
        </div>
        <div className="atlas-branch-list">
          {model.terminalSegments.map((segment, index) => {
            const leaf = segment.leaf ?? segment.end;
            const active = leaf.uid === activeLeafUid;
            const lineage = buildSegmentPath(model, leaf.uid);
            const metrics = leaf.cum;
            return (
              <article
                key={segment.uid}
                className={`atlas-branch-card terminal-branch-card ${active ? "is-active" : ""}`}
              >
                <div className="branch-card-title">
                  <b>L{index + 1}</b>
                  <span className="branch-code-chip">{segment.code}</span>
                  <strong>
                    {truncate(segment.lastUserSummary || leaf.summary, 86)}
                  </strong>
                  {active ? (
                    <span>
                      {t("components.branchMap.segment.active", "ACTIVE")}
                    </span>
                  ) : null}
                </div>
                <div className="branch-card-lineage">
                  {lineage.map((item, itemIndex) => (
                    <button
                      key={item.uid}
                      type="button"
                      onClick={() => onFocus(item.start.uid)}
                      title={item.firstUserSummary}
                    >
                      {item.code}
                      {itemIndex < lineage.length - 1 ? " ›" : ""}
                    </button>
                  ))}
                </div>
                <div className="branch-card-metrics">
                  <span>
                    {t(
                      "components.branchMap.atlas.endings.endAt",
                      "#{{sequence}} end",
                      { sequence: formatNumber(leaf.sequence) },
                    )}
                  </span>
                  <span>
                    {t(
                      "components.branchMap.atlas.endings.segments",
                      "{{count}} segments",
                      { count: lineage.length },
                    )}
                  </span>
                  <span>
                    {t(
                      "components.branchMap.atlas.endings.tokens",
                      "{{tokens}} tok",
                      { tokens: formatTokens(metrics.totalTokens) },
                    )}
                  </span>
                  <span>{formatMoney(metrics.cost)}</span>
                  <span>
                    {t(
                      "components.branchMap.atlas.endings.errors",
                      "{{count}} errors",
                      { count: metrics.errors + metrics.aborted },
                    )}
                  </span>
                </div>
                <div className="branch-card-actions">
                  <button type="button" onClick={() => onFocus(leaf.uid)}>
                    {t(
                      "components.branchMap.atlas.endings.focusEnd",
                      "Focus ending",
                    )}
                  </button>
                  <button type="button" onClick={() => onActivate(leaf.uid)}>
                    {active
                      ? t(
                          "components.branchMap.atlas.endings.current",
                          "Current L{{index}}",
                          { index: activeTerminalIndex + 1 },
                        )
                      : t(
                          "components.branchMap.atlas.endings.switchTo",
                          "Switch to this branch",
                        )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="atlas-side-section">
        <div className="side-section-head">
          <strong>
            {t(
              "components.branchMap.atlas.segmentIndex.title",
              "Linear segment index",
            )}
          </strong>
          <span>
            {t(
              "components.branchMap.atlas.segmentIndex.subtitle",
              "entries are flat within a segment",
            )}
          </span>
        </div>
        <div className="segment-index-list">
          {model.segments.map((segment) => (
            <SegmentIndexCard
              key={segment.uid}
              segment={segment}
              selected={segment.uid === selectedSegmentUid}
              onFocus={onFocus}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SegmentIndexCard({
  segment,
  selected,
  onFocus,
}: {
  segment: BranchSegment;
  selected: boolean;
  onFocus: (uid: string) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`segment-index-card ${selected ? "is-selected" : ""}`}
      style={{ "--segment-level": segment.level } as React.CSSProperties}
      onClick={() => onFocus(segment.start.uid)}
    >
      <span className="segment-index-rail" />
      <b>{segment.code}</b>
      <span>
        <strong>
          {truncate(segment.firstUserSummary || segment.start.summary, 84)}
        </strong>
        <small>
          {t(
            "components.branchMap.atlas.segmentIndex.meta",
            "#{{start}}–#{{end}} · {{entries}} entries · level {{level}}",
            {
              start: formatNumber(segment.start.sequence),
              end: formatNumber(segment.end.sequence),
              entries: formatNumber(segment.nodes.length),
              level: formatNumber(segment.level),
            },
          )}
        </small>
      </span>
      <em>
        {segment.terminal
          ? t("components.branchMap.segment.end", "END")
          : t("components.branchMap.atlas.segmentIndex.ways", "{{count}} WAY", {
              count: segment.children.length,
            })}
      </em>
    </button>
  );
}

function ForkSidebar({
  model,
  onFocus,
  onActivate,
}: {
  model: SessionModel;
  onFocus: (uid: string) => void;
  onActivate: (uid: string) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section fork-reading-guide">
        <div className="side-section-head">
          <strong>
            {t("components.branchMap.atlas.forks.title", "Real forks")}
          </strong>
          <span>{formatNumber(model.forks.length)}</span>
        </div>
        <p>
          {t(
            "components.branchMap.atlas.forks.description",
            "Pi only draws a visible branch when an entry has two or more direct successors. Each card below is an actual rewind and redirect.",
          )}
        </p>
      </section>
      {model.forks.map((fork) => (
        <ForkCard
          key={fork.uid}
          fork={fork}
          onFocus={onFocus}
          onActivate={onActivate}
        />
      ))}
      {!model.forks.length ? (
        <div className="atlas-empty">
          {t(
            "components.branchMap.atlas.forks.empty",
            "This session never branched: every entry belongs to a single linear sequence.",
          )}
        </div>
      ) : null}
    </div>
  );
}

function ForkCard({
  fork,
  onFocus,
  onActivate,
}: {
  fork: BranchFork;
  onFocus: (uid: string) => void;
  onActivate: (uid: string) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <section className="atlas-side-section fork-analysis-card">
      <button
        type="button"
        className="fork-analysis-head"
        onClick={() => onFocus(fork.anchor.uid)}
      >
        <b>{fork.code}</b>
        <span>
          <strong>{truncate(fork.anchor.summary, 92)}</strong>
          <small>
            {t(
              "components.branchMap.atlas.forks.anchorMeta",
              "{{code}} · anchor #{{sequence}} · line {{line}}",
              {
                code: fork.segment.code,
                sequence: formatNumber(fork.anchor.sequence),
                line: formatNumber(fork.anchor.lineNo),
              },
            )}
          </small>
        </span>
        <em>
          {t("components.branchMap.atlas.routes", "{{count}} routes", {
            count: fork.children.length,
          })}
        </em>
      </button>
      <div className="fork-route-list">
        {fork.children.map((segment, index) => {
          const destination = segment.leaf ?? segment.end.newestLeaf;
          return (
            <article key={segment.uid}>
              <div className="fork-route-number">{index + 1}</div>
              <div>
                <strong>
                  {segment.code} ·{" "}
                  {truncate(
                    segment.firstUserSummary || segment.start.summary,
                    78,
                  )}
                </strong>
                <small>
                  {t(
                    "components.branchMap.atlas.forks.routeMeta",
                    "starts #{{sequence}} · {{entries}} linear entries · {{endings}} endings",
                    {
                      sequence: formatNumber(segment.start.sequence),
                      entries: formatNumber(segment.nodes.length),
                      endings: formatNumber(segment.descendantLeaves),
                    },
                  )}
                </small>
                <span>
                  {t(
                    "components.branchMap.atlas.forks.routeStats",
                    "{{user}} user · {{tool}} tool · {{tokens}} tok · {{notes}} notes",
                    {
                      user: formatNumber(segment.metrics.user),
                      tool: formatNumber(segment.metrics.toolResults),
                      tokens: formatTokens(segment.metrics.totalTokens),
                      notes: formatNumber(segment.noteCount),
                    },
                  )}
                </span>
              </div>
              <div className="fork-route-actions">
                <button
                  type="button"
                  onClick={() => onFocus(segment.start.uid)}
                >
                  {t("components.branchMap.atlas.locate", "Locate")}
                </button>
                <button
                  type="button"
                  onClick={() => onActivate(destination.uid)}
                >
                  {t("components.branchMap.atlas.enter", "Enter")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NotesSidebar({
  notesByType,
  enabledNotes,
  onNoteClick,
}: {
  notesByType: Array<[SemanticNote["type"], SemanticNote[]]>;
  enabledNotes: SemanticNote[];
  onNoteClick: (note: SemanticNote) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section note-explainer">
        <div className="side-section-head">
          <strong>
            {t("components.branchMap.notes.title", "Semantic notes")}
          </strong>
          <span>
            {t(
              "components.branchMap.atlas.notesPanel.overlay",
              "independent overlay",
            )}
          </span>
        </div>
        <p>
          {t(
            "components.branchMap.atlas.notesPanel.description",
            "Rename, label, and model-switch events attach to the linear rails and are never read as parent-child hierarchy. Labels point to the entry they actually annotate.",
          )}
        </p>
      </section>
      {notesByType.map(([type, notes]) => (
        <section
          className={`atlas-side-section notes-group note-${type}`}
          key={type}
        >
          <div className="side-section-head">
            <strong>{t(noteTypeLabelKey(type))}</strong>
            <span>{formatNumber(notes.length)}</span>
          </div>
          <div className="atlas-note-list">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="atlas-note-card"
                onClick={() => onNoteClick(note)}
              >
                <i />
                <span>
                  <strong>{note.title}</strong>
                  <small>{truncate(note.detail, 130)}</small>
                  <em>
                    {formatTimestamp(note.timestampMs)} ·{" "}
                    {t(
                      "components.branchMap.atlas.lineNumber",
                      "line {{line}}",
                      { line: formatNumber(note.lineNo) },
                    )}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!enabledNotes.length ? (
        <div className="atlas-empty">
          {t(
            "components.branchMap.atlas.notesPanel.empty",
            'Enable event types in the "Notes" menu.',
          )}
        </div>
      ) : null}
    </div>
  );
}

function groupNotes(
  notes: SemanticNote[],
): Array<[SemanticNote["type"], SemanticNote[]]> {
  const order: SemanticNote["type"][] = [
    "user",
    "assistant_reply",
    "rename",
    "label",
    "model",
    "thinking",
    "compaction",
    "error",
  ];
  const grouped = new Map<SemanticNote["type"], SemanticNote[]>();
  for (const note of notes) {
    const list = grouped.get(note.type) ?? [];
    list.push(note);
    grouped.set(note.type, list);
  }
  return order
    .filter((type) => grouped.has(type))
    .map((type) => [type, grouped.get(type) ?? []]);
}

function noteTypeLabelKey(type: SemanticNote["type"]): string {
  if (type === "user") return "components.branchMap.noteTypes.user.label";
  if (type === "assistant_reply")
    return "components.branchMap.noteTypes.assistantReply.label";
  if (type === "rename") return "components.branchMap.noteTypes.rename.label";
  if (type === "label") return "components.branchMap.noteTypes.label.label";
  if (type === "model") return "components.branchMap.noteTypes.model.label";
  if (type === "thinking")
    return "components.branchMap.noteTypes.thinking.label";
  if (type === "compaction")
    return "components.branchMap.noteTypes.compaction.label";
  return "components.branchMap.noteTypes.error.label";
}

function scopeLabelKey(scope: GlobalMapSettings["scope"]): string {
  if (scope === "user") return "components.branchMap.atlas.scope.user";
  if (scope === "structure") return "components.branchMap.atlas.scope.structure";
  if (scope === "conversation")
    return "components.branchMap.atlas.scope.conversation";
  return "components.branchMap.atlas.scope.all";
}


function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="button"], [role="tab"], [role="slider"]'));
}

function trapFocusWithinDialog(event: KeyboardEvent, dialog: HTMLElement | null): void {
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
