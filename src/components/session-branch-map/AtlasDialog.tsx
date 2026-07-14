import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  BranchFork,
  BranchSegment,
  GlobalMapSettings,
  SemanticNote,
  SessionModel,
} from "@/utils/session-branch";
import {
  buildPath,
  buildSegmentPath,
  entryRelationLabel,
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
import { GlobalMapToolbar } from "./GlobalMapToolbar";

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
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key.toLowerCase() === "f") focus(selectedUid);
      if (event.key === "0") setView(fitView);
      if (event.key === "1") setSidebarTab("branches");
      if (event.key === "2") setSidebarTab("forks");
      if (event.key === "3") setSidebarTab("notes");
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, selectedUid]);

  if (!open) return null;

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
        className="atlas-dialog branch-atlas-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pi Branch Atlas"
      >
        <header className="atlas-header branch-atlas-header">
          <div className="atlas-heading">
            <span>PI BRANCH ATLAS</span>
            <strong>分支地图</strong>
            <small>
              {formatNumber(model.nodes.length)} entries 被折叠为{" "}
              {formatNumber(model.segments.length)} 条线性段 ·{" "}
              {formatNumber(model.forks.length)} 个真实分叉 ·{" "}
              {formatNumber(model.terminalSegments.length)} 个终点
            </small>
          </div>
          <div
            className="atlas-semantic-contract"
            title="这是本视图最重要的语义约束"
          >
            <b>LINEAR ≠ HIERARCHY</b>
            <span>parentId 是路径前驱；只有 fork 才创建分支层级</span>
          </div>
          <div className="atlas-header-actions">
            <button
              type="button"
              className="toolbar-button"
              onClick={() => focus(selectedUid)}
              title="聚焦当前选中记录 (F)"
            >
              <TargetIcon />
              聚焦
            </button>
            <button
              type="button"
              className="toolbar-button"
              onClick={() => setView(fitView)}
              title="适应全局 (0)"
            >
              <ResetIcon />
              全局
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => adjustZoom(1 / 1.35)}
              title="缩小"
            >
              <ZoomOutIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => adjustZoom(1.35)}
              title="放大"
            >
              <ZoomInIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              title="关闭"
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
          <div className="atlas-view-readout">
            <span>{Math.round(view.zoom * 100)}%</span>
            <span>{scopeLabel(settings.scope)}</span>
            <span>
              {settings.axis === "sequence" ? "路径序列轴" : "实际时间轴"}
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
                拖拽平移 · 滚轮缩放 · 单击检查 · 双击切换到该记录所在终点
              </div>
            </div>
            <div className="atlas-selection-hud branch-selection-hud branch-atlas-selection-dock">
              <div className="selection-identity">
                <span>
                  {selectedSegment?.code || "B?"} · #
                  {formatNumber(selectedNode.sequence)} ·{" "}
                  {entryRelationLabel(selectedNode)}
                </span>
                <strong>{truncate(selectedNode.summary, 165)}</strong>
                <small>
                  branch level {formatNumber(selectedNode.branchLevel)} ·
                  segment {formatNumber(selectedNode.segmentIndex + 1)}/
                  {formatNumber(selectedSegment?.nodes.length ?? 1)} · line{" "}
                  {formatNumber(selectedNode.lineNo)}
                </small>
              </div>
              <div className="selection-path-readout">
                <span>
                  <b>{formatNumber(selectedPath.length)}</b> path entries
                </span>
                <span>
                  <b>{formatNumber(selectedSegments.length)}</b> branch segments
                </span>
                <span>
                  <b>
                    {formatNumber(Math.max(0, selectedSegments.length - 1))}
                  </b>{" "}
                  forks crossed
                </span>
              </div>
              <div className="selection-actions">
                <button type="button" onClick={() => focus(selectedNode.uid)}>
                  定位
                </button>
                <button
                  type="button"
                  onClick={() => onActivateNode(selectedNode.uid)}
                >
                  设为活跃
                </button>
              </div>
            </div>
          </main>

          <aside className="atlas-sidebar branch-atlas-sidebar">
            <div className="atlas-sidebar-tabs" role="tablist">
              <button
                type="button"
                className={sidebarTab === "branches" ? "is-active" : ""}
                onClick={() => setSidebarTab("branches")}
              >
                分支段 <b>{formatNumber(model.segments.length)}</b>
                <kbd>1</kbd>
              </button>
              <button
                type="button"
                className={sidebarTab === "forks" ? "is-active" : ""}
                onClick={() => setSidebarTab("forks")}
              >
                分叉 <b>{formatNumber(model.forks.length)}</b>
                <kbd>2</kbd>
              </button>
              <button
                type="button"
                className={sidebarTab === "notes" ? "is-active" : ""}
                onClick={() => setSidebarTab("notes")}
              >
                注记 <b>{formatNumber(enabledNotes.length)}</b>
                <kbd>3</kbd>
              </button>
            </div>

            {sidebarTab === "branches" ? (
              <BranchSidebar
                model={model}
                activeLeafUid={activeLeafUid}
                activeTerminalIndex={activeTerminalIndex}
                selectedSegmentUid={selectedSegment?.uid || ""}
                onFocus={selectAndFocus}
                onActivate={onActivateNode}
              />
            ) : sidebarTab === "forks" ? (
              <ForkSidebar
                model={model}
                onFocus={selectAndFocus}
                onActivate={onActivateNode}
              />
            ) : (
              <NotesSidebar
                notesByType={notesByType}
                enabledNotes={enabledNotes}
                onNoteClick={handleNoteClick}
              />
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
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section branch-reading-guide">
        <div className="side-section-head">
          <strong>如何阅读</strong>
          <span>fork-only hierarchy</span>
        </div>
        <div className="reading-equation">
          <span>连续 parentId</span>
          <b>→</b>
          <strong>同一条线性轨道</strong>
          <span>一个 entry 有多个 children</span>
          <b>→</b>
          <strong>生成子分支</strong>
        </div>
      </section>

      <section className="atlas-side-section">
        <div className="side-section-head">
          <strong>终点分支</strong>
          <span>{formatNumber(model.terminalSegments.length)} endings</span>
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
                  {active ? <span>ACTIVE</span> : null}
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
                  <span>#{formatNumber(leaf.sequence)} end</span>
                  <span>{formatNumber(lineage.length)} segments</span>
                  <span>{formatTokens(metrics.totalTokens)} tok</span>
                  <span>{formatMoney(metrics.cost)}</span>
                  <span>
                    {formatNumber(metrics.errors + metrics.aborted)} errors
                  </span>
                </div>
                <div className="branch-card-actions">
                  <button type="button" onClick={() => onFocus(leaf.uid)}>
                    聚焦终点
                  </button>
                  <button type="button" onClick={() => onActivate(leaf.uid)}>
                    {active
                      ? `当前 L${activeTerminalIndex + 1}`
                      : "切换到此分支"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="atlas-side-section">
        <div className="side-section-head">
          <strong>线性段索引</strong>
          <span>消息在段内平级</span>
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
          #{formatNumber(segment.start.sequence)}–#
          {formatNumber(segment.end.sequence)} ·{" "}
          {formatNumber(segment.nodes.length)} entries · level{" "}
          {formatNumber(segment.level)}
        </small>
      </span>
      <em>{segment.terminal ? "END" : `${segment.children.length} WAY`}</em>
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
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section fork-reading-guide">
        <div className="side-section-head">
          <strong>真实分叉</strong>
          <span>{formatNumber(model.forks.length)}</span>
        </div>
        <p>
          只有某条记录拥有两个或更多直接后继时，Pi
          才产生可视分支。下方每张卡片都对应一次真实的回退与改道。
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
          这个会话没有发生分支切换：全部记录都属于一条线性序列。
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
            {fork.segment.code} · anchor #{formatNumber(fork.anchor.sequence)} ·
            line {formatNumber(fork.anchor.lineNo)}
          </small>
        </span>
        <em>{fork.children.length} routes</em>
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
                  starts #{formatNumber(segment.start.sequence)} ·{" "}
                  {formatNumber(segment.nodes.length)} linear entries ·{" "}
                  {formatNumber(segment.descendantLeaves)} endings
                </small>
                <span>
                  {formatNumber(segment.metrics.user)} user ·{" "}
                  {formatNumber(segment.metrics.toolResults)} tool ·{" "}
                  {formatTokens(segment.metrics.totalTokens)} tok ·{" "}
                  {formatNumber(segment.noteCount)} notes
                </span>
              </div>
              <div className="fork-route-actions">
                <button
                  type="button"
                  onClick={() => onFocus(segment.start.uid)}
                >
                  定位
                </button>
                <button
                  type="button"
                  onClick={() => onActivate(destination.uid)}
                >
                  进入
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
  return (
    <div className="atlas-sidebar-scroll">
      <section className="atlas-side-section note-explainer">
        <div className="side-section-head">
          <strong>语义注记</strong>
          <span>独立覆盖层</span>
        </div>
        <p>
          Rename、Label、模型切换等事件附着在线性轨道上，不会被误读为父子层级。Label
          会定位到它实际标注的 target entry。
        </p>
      </section>
      {notesByType.map(([type, notes]) => (
        <section
          className={`atlas-side-section notes-group note-${type}`}
          key={type}
        >
          <div className="side-section-head">
            <strong>{noteTypeLabel(type)}</strong>
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
                    {formatTimestamp(note.timestampMs)} · line{" "}
                    {formatNumber(note.lineNo)}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!enabledNotes.length ? (
        <div className="atlas-empty">在“注记”菜单中启用事件类型。</div>
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

function noteTypeLabel(type: SemanticNote["type"]): string {
  if (type === "user") return "用户输入";
  if (type === "assistant_reply") return "AI 末条回复";
  if (type === "rename") return "Rename / Session Info";
  if (type === "label") return "Labels";
  if (type === "model") return "Model Switches";
  if (type === "thinking") return "Thinking Level";
  if (type === "compaction") return "Compaction";
  return "Errors / Aborted";
}

function scopeLabel(scope: GlobalMapSettings["scope"]): string {
  if (scope === "user") return "用户消息事件";
  if (scope === "structure") return "仅分支骨架";
  if (scope === "conversation") return "对话事件";
  return "全部 entry 事件";
}
