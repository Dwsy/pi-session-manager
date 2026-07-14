import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BranchFork,
  BranchSegment,
  GlobalMapSettings,
  SemanticNote,
  SessionModel,
  SessionNode,
} from "@/utils/session-branch";
import {
  buildTopologyLayout,
  buildTopologyProjection,
  computeTopologyFitBounds,
  computeTopologyPanBounds,
  type ProjectedEvent,
  type TopologyLayout,
  type TopologyPoint,
  type TopologyProjection,
} from "@/utils/session-branch";
import {
  buildPath,
  buildSegmentPath,
  entryRelationLabel,
  nodePrimaryText,
} from "@/utils/session-branch";
import {
  clamp,
  formatDuration,
  formatNumber,
  formatTimestamp,
  truncate,
} from "@/utils/session-branch";
import { useElementSize } from "./useElementSize";

export interface MapView {
  zoom: number;
  centerX: number;
  centerY: number;
  /** Overview auto-fit: map this world rectangle onto the plot (normalized 0–1 coords). */
  worldRect?: { left: number; top: number; width: number; height: number };
}

export interface GlobalMapCanvasProps {
  model: SessionModel;
  activeLeafUid: string;
  selectedUid: string;
  settings: GlobalMapSettings;
  mode: "overview" | "atlas";
  view?: MapView;
  onViewChange?: (view: MapView) => void;
  focusUid?: string | null;
  focusNonce?: number;
  onSelectNode: (uid: string) => void;
  onActivateNode: (uid: string) => void;
  className?: string;
}

type HoverTarget =
  | { kind: "event"; node: SessionNode; localX: number; localY: number }
  | {
      kind: "note";
      note: SemanticNote;
      node: SessionNode;
      localX: number;
      localY: number;
    }
  | { kind: "fork"; fork: BranchFork; localX: number; localY: number }
  | { kind: "segment"; segment: BranchSegment; localX: number; localY: number };

interface CircleHit {
  kind: "event" | "fork";
  x: number;
  y: number;
  radius: number;
  node?: SessionNode;
  fork?: BranchFork;
  priority: number;
}

interface RectHit {
  kind: "note" | "segment";
  x: number;
  y: number;
  width: number;
  height: number;
  note?: SemanticNote;
  node?: SessionNode;
  segment?: BranchSegment;
}

interface RenderCache {
  transform: CanvasTransform;
  layout: TopologyLayout;
  circleHits: CircleHit[];
  rectHits: RectHit[];
}

interface CanvasTransform {
  dpr: number;
  width: number;
  height: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  worldLeft: number;
  worldTop: number;
  worldWidth: number;
  worldHeight: number;
  toScreen: (point: Pick<TopologyPoint, "x" | "y">) => { x: number; y: number };
  fromScreen: (x: number, y: number) => { x: number; y: number };
}

interface ColorSet {
  bg: string;
  panel: string;
  panel2: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  muted: string;
  base: string;
  accent: string;
  accentStrong: string;
  blue: string;
  user: string;
  assistant: string;
  tool: string;
  warning: string;
  error: string;
  purple: string;
  cyan: string;
}

interface DrawState {
  mode: "overview" | "atlas";
  activeLeafUid: string;
  selectedUid: string;
  activeNodePath: Set<string>;
  activeSegmentPath: Set<string>;
  selectedSegmentUid: string;
  settings: GlobalMapSettings;
  hover: HoverTarget | null;
}

const DEFAULT_VIEW: MapView = { zoom: 1, centerX: 0.5, centerY: 0.5 };
/** World units visible height = 1/zoom; values below 1 allow zooming out past the full session. */
export const MIN_MAP_ZOOM = 0.06;
export const MAX_MAP_ZOOM = 18;

const OVERVIEW_MARGINS = { left: 22, right: 13, top: 10, bottom: 20 };
const ATLAS_MARGINS = { left: 56, right: 24, top: 36, bottom: 28 };

/** Atlas plot insets when the selection HUD is docked below the canvas (not overlaying it). */
export function atlasPlotMarginsForSize(
  width: number,
  height: number,
): typeof ATLAS_MARGINS {
  const top = height < 420 ? 30 : 36;
  const bottom = height < 420 ? 22 : 28;
  const left = width < 520 ? 48 : 56;
  return { left, right: 24, top, bottom };
}

/** Fit the normalized topology bounds into the stage plot (overview + atlas reset). */
export function fitMapViewToLayout(
  layout: TopologyLayout,
  width: number,
  height: number,
  mode: "overview" | "atlas",
): MapView {
  if (width < 8 || height < 8) return DEFAULT_VIEW;
  const bounds = computeTopologyFitBounds(layout, mode);
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
  const margins =
    mode === "overview"
      ? OVERVIEW_MARGINS
      : atlasPlotMarginsForSize(width, height);
  const plotW = Math.max(1, width - margins.left - margins.right);
  const plotH = Math.max(1, height - margins.top - margins.bottom);
  const plotAspect = plotW / plotH;
  const boundsAspect = spanX / spanY;
  let zoom: number;
  if (plotAspect >= boundsAspect) {
    zoom = 1 / spanY;
  } else {
    zoom = plotAspect / boundsAspect / spanX;
  }
  const screenInset = mode === "atlas" ? 0.78 : 0.82;
  zoom = clamp(zoom * screenInset, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const rectInset = mode === "overview" ? 1 / screenInset : 1;
  const halfRectX = (spanX / 2) * rectInset;
  const halfRectY = (spanY / 2) * rectInset;
  return {
    zoom,
    centerX,
    centerY,
    worldRect: {
      left: centerX - halfRectX,
      top: centerY - halfRectY,
      width: halfRectX * 2,
      height: halfRectY * 2,
    },
  };
}

export function GlobalMapCanvas({
  model,
  activeLeafUid,
  selectedUid,
  settings,
  mode,
  view = DEFAULT_VIEW,
  onViewChange,
  focusUid,
  focusNonce,
  onSelectNode,
  onActivateNode,
  className,
}: GlobalMapCanvasProps): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(stageRef);
  const renderCacheRef = useRef<RenderCache | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startView: MapView;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const refresh = () => setThemeVersion((version) => version + 1);
    const observer = new MutationObserver(refresh);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(
    () => buildTopologyLayout(model, settings.axis),
    [model, settings.axis],
  );
  const projection = useMemo(
    () =>
      buildTopologyProjection(
        layout,
        settings,
        activeLeafUid,
        selectedUid,
        mode === "atlas" ? "atlas" : "sidebar",
      ),
    [layout, settings, activeLeafUid, selectedUid, mode],
  );
  const activeNodePath = useMemo(
    () => new Set(buildPath(model, activeLeafUid).map((node) => node.uid)),
    [model, activeLeafUid],
  );
  const activeSegmentPath = useMemo(
    () =>
      new Set(
        buildSegmentPath(model, activeLeafUid).map((segment) => segment.uid),
      ),
    [model, activeLeafUid],
  );
  const selectedSegmentUid = model.uidMap.get(selectedUid)?.segmentUid ?? "";

  const overviewFitView = useMemo(
    () => fitMapViewToLayout(layout, size.width, size.height, "overview"),
    [layout, size.width, size.height],
  );
  const effectiveView = mode === "overview" ? overviewFitView : view;

  useEffect(() => {
    if (mode !== "atlas" || !focusUid || !onViewChange) return;
    const point = layout.pointByUid.get(focusUid);
    if (!point) return;
    onViewChange(
      clampView(
        {
          zoom: Math.max(3.1, view.zoom),
          centerX: point.x,
          centerY: point.y,
        },
        layout,
      ),
    );
    // focusNonce intentionally lets repeated focus actions run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUid, focusNonce, mode, layout, onViewChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const transform = createTransform(
      size.width,
      size.height,
      mode,
      effectiveView,
    );
    const cache = drawCanvas(canvas, projection, transform, readColors(), {
      mode,
      activeLeafUid,
      selectedUid,
      activeNodePath,
      activeSegmentPath,
      selectedSegmentUid,
      settings,
      hover,
    });
    renderCacheRef.current = cache;
  }, [
    size.width,
    size.height,
    projection,
    mode,
    effectiveView,
    activeLeafUid,
    selectedUid,
    activeNodePath,
    activeSegmentPath,
    selectedSegmentUid,
    settings,
    hover,
    themeVersion,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "atlas" || !onViewChange) return;
    const handleNativeWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const cache = renderCacheRef.current;
      const stage = stageRef.current;
      if (!cache || !stage) return;
      const rect = stage.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const worldPoint = cache.transform.fromScreen(localX, localY);
      const factor = Math.exp(-event.deltaY * 0.0016);
      const nextZoom = clamp(view.zoom * factor, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
      const nextWorldWidth = 1 / nextZoom;
      const nextWorldHeight = 1 / nextZoom;
      const ratioX = clamp(
        (localX - cache.transform.plotLeft) /
          Math.max(1, cache.transform.plotWidth),
        0,
        1,
      );
      const ratioY = clamp(
        (localY - cache.transform.plotTop) /
          Math.max(1, cache.transform.plotHeight),
        0,
        1,
      );
      const worldLeft = worldPoint.x - ratioX * nextWorldWidth;
      const worldTop = worldPoint.y - ratioY * nextWorldHeight;
      onViewChange(
        clampView(
          {
            zoom: nextZoom,
            centerX: worldLeft + nextWorldWidth / 2,
            centerY: worldTop + nextWorldHeight / 2,
          },
          layout,
        ),
      );
    };
    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleNativeWheel);
  }, [mode, onViewChange, layout, view.zoom, view.centerX, view.centerY]);

  function resolveTarget(event: {
    clientX: number;
    clientY: number;
  }): HoverTarget | null {
    const stage = stageRef.current;
    const cache = renderCacheRef.current;
    if (!stage || !cache) return null;
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (let index = cache.rectHits.length - 1; index >= 0; index -= 1) {
      const hit = cache.rectHits[index];
      if (
        x < hit.x ||
        x > hit.x + hit.width ||
        y < hit.y ||
        y > hit.y + hit.height
      )
        continue;
      if (hit.kind === "note" && hit.note && hit.node) {
        return {
          kind: "note",
          note: hit.note,
          node: hit.node,
          localX: x,
          localY: y,
        };
      }
      if (hit.kind === "segment" && hit.segment) {
        return { kind: "segment", segment: hit.segment, localX: x, localY: y };
      }
    }

    let best: CircleHit | null = null;
    let bestScore = Infinity;
    for (const hit of cache.circleHits) {
      const dx = x - hit.x;
      const dy = y - hit.y;
      const distance = dx * dx + dy * dy;
      const radius = Math.max(8, hit.radius + 5);
      if (distance > radius * radius) continue;
      const score = distance - hit.priority * 4;
      if (score < bestScore) {
        best = hit;
        bestScore = score;
      }
    }
    if (best?.kind === "fork" && best.fork)
      return { kind: "fork", fork: best.fork, localX: x, localY: y };
    if (best?.node)
      return { kind: "event", node: best.node, localX: x, localY: y };
    if (mode === "atlas") {
      const railNode = resolveNearestRailEntry(cache, x, y);
      if (railNode)
        return { kind: "event", node: railNode, localX: x, localY: y };
    }
    return null;
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): void {
    if (mode !== "atlas" || !onViewChange) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startView: view,
      moved: false,
    };
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): void {
    const drag = dragRef.current;
    const cache = renderCacheRef.current;
    if (drag && cache && mode === "atlas" && onViewChange) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const { transform } = cache;
      onViewChange(
        clampView(
          {
            zoom: drag.startView.zoom,
            centerX:
              drag.startView.centerX -
              (dx / Math.max(1, transform.plotWidth)) * transform.worldWidth,
            centerY:
              drag.startView.centerY -
              (dy / Math.max(1, transform.plotHeight)) * transform.worldHeight,
          },
          layout,
        ),
      );
      setHover(null);
      return;
    }
    setHover(resolveTarget(event));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      suppressClickRef.current = drag.moved;
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already be released.
      }
    }
  }

  function targetNode(target: HoverTarget): SessionNode {
    if (target.kind === "event" || target.kind === "note") return target.node;
    if (target.kind === "fork") return target.fork.anchor;
    return target.segment.end;
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const target = resolveTarget(event);
    if (target) onSelectNode(targetNode(target).uid);
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const target = resolveTarget(event);
    if (target) onActivateNode(targetNode(target).uid);
  }

  return (
    <div
      ref={stageRef}
      className={`global-map-stage ${mode === "atlas" ? "is-atlas" : "is-overview"} ${className || ""}`}
    >
      <canvas
        ref={canvasRef}
        className="global-map-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) setHover(null);
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        aria-label="Pi branch segment map"
      />
      {hover ? (
        <MapTooltip
          target={hover}
          width={size.width}
          height={size.height}
          mode={mode}
        />
      ) : null}
    </div>
  );
}

function resolveNearestRailEntry(
  cache: RenderCache,
  localX: number,
  localY: number,
): SessionNode | null {
  const { transform, layout } = cache;
  if (
    localX < transform.plotLeft - 4 ||
    localX > transform.plotLeft + transform.plotWidth + 4 ||
    localY < transform.plotTop ||
    localY > transform.plotTop + transform.plotHeight
  ) {
    return null;
  }
  const world = transform.fromScreen(localX, localY);
  const railThresholdX = 18;
  let bestNode: SessionNode | null = null;
  let bestScore = Infinity;
  for (const item of layout.segments) {
    const railX = transform.toScreen({ x: item.x, y: world.y }).x;
    if (Math.abs(localX - railX) > railThresholdX) continue;
    if (world.y < item.minY - 0.015 || world.y > item.maxY + 0.015) continue;
    for (const node of item.segment.nodes) {
      const point = layout.pointByUid.get(node.uid);
      if (!point) continue;
      const screen = transform.toScreen(point);
      const score =
        Math.abs(screen.x - localX) + Math.abs(screen.y - localY) * 0.85;
      if (score < bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
  }
  return bestScore <= 96 ? bestNode : null;
}

function MapTooltip({
  target,
  width,
  height,
  mode,
}: {
  target: HoverTarget;
  width: number;
  height: number;
  mode: "overview" | "atlas";
}): React.ReactElement {
  const rich = mode === "atlas" && target.kind === "event";
  const tooltipWidth = rich ? Math.min(420, Math.max(280, width * 0.38)) : 250;
  const left = clamp(
    target.localX + 14,
    8,
    Math.max(8, width - tooltipWidth - 8),
  );
  const top =
    target.localY > height * 0.55
      ? Math.max(8, target.localY - (rich ? 220 : 112))
      : target.localY + 14;

  if (target.kind === "segment") {
    const segment = target.segment;
    return (
      <div className="map-tooltip" style={{ left, top, width: tooltipWidth }}>
        <span>LINEAR SEGMENT · {segment.code}</span>
        <strong>{segment.level === 0 ? "主干序列" : "分支序列"}</strong>
        <p>
          {truncate(segment.firstUserSummary || segment.start.summary, 150)}
        </p>
        <small>
          {formatNumber(segment.nodes.length)} entries · branch level{" "}
          {formatNumber(segment.level)} ·{" "}
          {segment.terminal
            ? "terminal"
            : `${segment.children.length} next branches`}
        </small>
      </div>
    );
  }

  if (target.kind === "fork") {
    const fork = target.fork;
    return (
      <div className="map-tooltip" style={{ left, top, width: tooltipWidth }}>
        <span>REAL FORK · {fork.code}</span>
        <strong>
          从序列 #{formatNumber(fork.anchor.sequence)} 分出{" "}
          {fork.children.length} 条线性分支
        </strong>
        <p>{truncate(fork.anchor.summary, 150)}</p>
        <small>
          {fork.anchor.id} · branch level {formatNumber(fork.level)}
        </small>
      </div>
    );
  }

  if (target.kind === "note") {
    return (
      <div
        className={`map-tooltip note-${target.note.type}`}
        style={{ left, top, width: tooltipWidth }}
      >
        <span>{noteTypeLabel(target.note.type)}</span>
        <strong>{target.note.title}</strong>
        <p>{truncate(target.note.detail, 160)}</p>
        <small>
          {target.node.segment?.code} · #{formatNumber(target.node.sequence)} ·
          line {formatNumber(target.note.lineNo)}
        </small>
      </div>
    );
  }

  const node = target.node;
  const body = nodePrimaryText(node);
  if (rich) {
    return (
      <div
        className="map-tooltip map-tooltip-rich global-map-tooltip"
        style={{ left, top, width: tooltipWidth }}
      >
        <span className="tooltip-kicker">
          {nodeRoleLabel(node)} · {node.segment?.code} · #
          {formatNumber(node.sequence)}
        </span>
        <strong>{truncate(node.summary, 200)}</strong>
        <pre className="map-tooltip-body">{truncate(body, 2400)}</pre>
        <small>
          {entryRelationLabel(node)} · level {formatNumber(node.branchLevel)} ·{" "}
          {node.id}
        </small>
      </div>
    );
  }
  return (
    <div
      className="map-tooltip global-map-tooltip"
      style={{ left, top, width: tooltipWidth }}
    >
      <span>
        {nodeRoleLabel(node)} · {node.segment?.code}
      </span>
      <strong>{truncate(node.summary, 150)}</strong>
      <p>{truncate(body, 280)}</p>
      <small>
        sequence #{formatNumber(node.sequence)} · branch level{" "}
        {formatNumber(node.branchLevel)} · {node.id}
      </small>
    </div>
  );
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  projection: TopologyProjection,
  transform: CanvasTransform,
  colors: ColorSet,
  state: DrawState,
): RenderCache {
  const { dpr, width, height } = transform;
  const bitmapW = Math.round(width * dpr);
  const bitmapH = Math.round(height * dpr);
  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW;
    canvas.height = bitmapH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx)
    return {
      transform,
      layout: projection.layout,
      circleHits: [],
      rectHits: [],
    };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const circleHits: CircleHit[] = [];
  const rectHits: RectHit[] = [];
  drawBackground(ctx, projection.layout, transform, colors, state.mode);
  drawSegmentRails(ctx, projection.layout, transform, colors, state, rectHits);
  drawForks(ctx, projection.layout, transform, colors, state, circleHits);
  drawEvents(ctx, projection.events, transform, colors, state, circleHits);
  drawNotes(ctx, projection, transform, colors, state, rectHits);
  drawAxis(ctx, projection.layout, transform, colors, state.mode);
  drawSemanticBadge(
    ctx,
    projection.layout.model,
    transform,
    colors,
    state.mode,
  );

  return { transform, layout: projection.layout, circleHits, rectHits };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  layout: TopologyLayout,
  transform: CanvasTransform,
  colors: ColorSet,
  mode: "overview" | "atlas",
): void {
  ctx.fillStyle = colors.panel;
  ctx.fillRect(0, 0, transform.width, transform.height);

  const gridCount = mode === "atlas" ? 8 : 5;
  ctx.strokeStyle = alpha(colors.border, mode === "atlas" ? 0.58 : 0.42);
  ctx.lineWidth = 1;
  for (let index = 0; index <= gridCount; index += 1) {
    const worldY =
      transform.worldTop + (index / gridCount) * transform.worldHeight;
    const y = transform.toScreen({ x: transform.worldLeft, y: worldY }).y;
    ctx.beginPath();
    ctx.moveTo(transform.plotLeft, y + 0.5);
    ctx.lineTo(transform.plotLeft + transform.plotWidth, y + 0.5);
    ctx.stroke();
  }

  const terminalXs = new Set(
    layout.model.terminalSegments
      .map((segment) => layout.segmentByUid.get(segment.uid)?.x)
      .filter((x): x is number => x != null),
  );
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = alpha(colors.borderStrong, 0.25);
  for (const xWorld of terminalXs) {
    const x = transform.toScreen({ x: xWorld, y: transform.worldTop }).x;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, transform.plotTop);
    ctx.lineTo(x + 0.5, transform.plotTop + transform.plotHeight);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawSegmentRails(
  ctx: CanvasRenderingContext2D,
  layout: TopologyLayout,
  transform: CanvasTransform,
  colors: ColorSet,
  state: DrawState,
  rectHits: RectHit[],
): void {
  const ordered = [...layout.segments].sort((a, b) => {
    const aActive = state.activeSegmentPath.has(a.segment.uid) ? 1 : 0;
    const bActive = state.activeSegmentPath.has(b.segment.uid) ? 1 : 0;
    return aActive - bActive || a.segment.level - b.segment.level;
  });

  for (const item of ordered) {
    if (!rangeVisible(item.minY, item.maxY, transform, 0.02)) continue;
    const active = state.activeSegmentPath.has(item.segment.uid);
    const selected = state.selectedSegmentUid === item.segment.uid;
    const start = transform.toScreen({ x: item.x, y: item.startY });
    const end = transform.toScreen({ x: item.x, y: item.endY });
    const minHeight = state.mode === "overview" ? 3 : 5;
    const endY =
      Math.abs(end.y - start.y) < minHeight ? start.y + minHeight : end.y;

    if (active) {
      ctx.strokeStyle = alpha(colors.accent, 0.16);
      ctx.lineWidth = state.mode === "atlas" ? 10 : 7;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, endY);
      ctx.stroke();
    }

    ctx.strokeStyle = active
      ? colors.accent
      : selected
        ? colors.blue
        : alpha(colors.base, 0.76);
    ctx.lineWidth = active
      ? state.mode === "atlas"
        ? 3.2
        : 2.7
      : selected
        ? 2.4
        : state.mode === "atlas"
          ? 1.45
          : 1.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, endY);
    ctx.stroke();

    if (state.settings.showSegmentLabels) {
      const labelY = clamp(
        start.y - (state.mode === "atlas" ? 15 : 12),
        transform.plotTop + 3,
        transform.plotTop + transform.plotHeight - 13,
      );
      const label = item.segment.code;
      ctx.font = `700 ${state.mode === "atlas" ? 9 : 7}px ${fontMono()}`;
      const width = ctx.measureText(label).width + 10;
      const x = clamp(
        start.x - width / 2,
        transform.plotLeft,
        transform.plotLeft + transform.plotWidth - width,
      );
      roundedRect(ctx, x, labelY, width, state.mode === "atlas" ? 15 : 12, 4);
      ctx.fillStyle = active ? alpha(colors.accent, 0.15) : colors.panel2;
      ctx.fill();
      ctx.strokeStyle = active ? alpha(colors.accent, 0.65) : colors.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = active ? colors.accentStrong : colors.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        label,
        x + width / 2,
        labelY + (state.mode === "atlas" ? 7.5 : 6),
      );
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      rectHits.push({
        kind: "segment",
        x,
        y: labelY,
        width,
        height: state.mode === "atlas" ? 15 : 12,
        segment: item.segment,
      });
    }
  }
}

function drawForks(
  ctx: CanvasRenderingContext2D,
  layout: TopologyLayout,
  transform: CanvasTransform,
  colors: ColorSet,
  state: DrawState,
  circleHits: CircleHit[],
): void {
  for (const link of layout.forkLinks) {
    if (
      !isPointVisible(link.from, transform, 0.04) &&
      !isPointVisible(link.to, transform, 0.04)
    )
      continue;
    const from = transform.toScreen(link.from);
    const to = transform.toScreen(link.to);
    const active = state.activeSegmentPath.has(link.child.uid);
    ctx.strokeStyle = active ? colors.accent : alpha(colors.base, 0.76);
    ctx.lineWidth = active ? (state.mode === "atlas" ? 2.8 : 2.2) : 1.25;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const spread = mapLayoutSpread(
      transform,
      state.mode,
      state.settings.smartMapLayout,
    );
    const minBend = (state.mode === "atlas" ? 30 : 20) * spread;
    const dy = Math.max(minBend, Math.abs(to.y - from.y));
    const midY = from.y + dy * 0.58;
    ctx.bezierCurveTo(from.x, midY, to.x, midY, to.x, to.y);
    ctx.stroke();
  }

  for (const fork of layout.model.forks) {
    const point = layout.pointByUid.get(fork.anchor.uid);
    if (!point || !isPointVisible(point, transform, 0.04)) continue;
    const p = transform.toScreen(point);
    const active = state.activeNodePath.has(fork.anchor.uid);
    const radius = state.mode === "atlas" ? 6 : 4.8;
    ctx.fillStyle = colors.panel;
    ctx.strokeStyle = active ? colors.accentStrong : colors.warning;
    ctx.lineWidth = active ? 2.6 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? colors.accent : colors.warning;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.4, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();
    circleHits.push({
      kind: "fork",
      x: p.x,
      y: p.y,
      radius,
      fork,
      priority: 8,
    });

    if (state.settings.showForkLabels) {
      ctx.font = `800 ${state.mode === "atlas" ? 9 : 7}px ${fontMono()}`;
      ctx.fillStyle = active ? colors.accentStrong : colors.warning;
      const spread = mapLayoutSpread(
        transform,
        state.mode,
        state.settings.smartMapLayout,
      );
      ctx.fillText(
        fork.code,
        p.x + (radius + 4 * spread),
        p.y - (radius + 2 * spread),
      );
    }
  }

  layout.model.terminalSegments.forEach((segment, index) => {
    const point = layout.pointByUid.get(segment.end.uid);
    if (!point || !isPointVisible(point, transform, 0.04)) return;
    const p = transform.toScreen(point);
    const active = segment.leaf?.uid === state.activeLeafUid;
    const selected = segment.uid === state.selectedSegmentUid;
    const radius = state.mode === "atlas" ? 5.2 : 4.2;
    ctx.fillStyle = active
      ? colors.accent
      : selected
        ? colors.blue
        : colors.panel;
    ctx.strokeStyle = active
      ? colors.accentStrong
      : selected
        ? colors.blue
        : colors.textSecondary;
    ctx.lineWidth = active ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    circleHits.push({
      kind: "event",
      x: p.x,
      y: p.y,
      radius,
      node: segment.end,
      priority: active ? 10 : 5,
    });

    ctx.font = `800 ${state.mode === "atlas" ? 9 : 7}px ${fontMono()}`;
    ctx.textAlign = "center";
    ctx.fillStyle = active ? colors.accentStrong : colors.muted;
    ctx.fillText(
      `L${index + 1}`,
      p.x,
      Math.min(
        transform.height - 4,
        p.y + radius + (state.mode === "atlas" ? 14 : 11),
      ),
    );
    ctx.textAlign = "start";
  });
}

function drawEvents(
  ctx: CanvasRenderingContext2D,
  events: ProjectedEvent[],
  transform: CanvasTransform,
  colors: ColorSet,
  state: DrawState,
  circleHits: CircleHit[],
): void {
  const densityScale =
    events.length > 1000 ? 0.58 : events.length > 400 ? 0.75 : 1;
  for (const event of events) {
    if (!isPointVisible(event.point, transform, 0.02)) continue;
    const p = transform.toScreen(event.point);
    const selected = event.node.uid === state.selectedUid;
    const activeLeaf = event.node.uid === state.activeLeafUid;
    const activePath = state.activeNodePath.has(event.node.uid);
    const radius = (state.mode === "atlas" ? 3.5 : 2.8) * densityScale;
    const color = nodeColor(event.node, colors);
    const opacity =
      event.scopeMatch && event.modelMatch ? (activePath ? 1 : 0.82) : 0.35;

    if (event.node.kind === "tool" && !selected && !activeLeaf) {
      ctx.strokeStyle = alpha(color, opacity);
      ctx.lineWidth = Math.max(1, radius * 0.55);
      ctx.beginPath();
      ctx.moveTo(p.x - radius, p.y);
      ctx.lineTo(p.x + radius, p.y);
      ctx.stroke();
    } else if (event.node.kind === "assistant") {
      roundedRect(
        ctx,
        p.x - radius,
        p.y - radius,
        radius * 2,
        radius * 2,
        Math.max(1, radius * 0.35),
      );
      ctx.fillStyle = alpha(color, opacity);
      ctx.fill();
    } else if (event.node.kind === "error") {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - radius * 1.25);
      ctx.lineTo(p.x + radius * 1.12, p.y + radius);
      ctx.lineTo(p.x - radius * 1.12, p.y + radius);
      ctx.closePath();
      ctx.fillStyle = alpha(colors.error, opacity);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = alpha(color, opacity);
      ctx.fill();
    }

    if (event.node.relation === "branch-start") {
      ctx.strokeStyle = activePath ? colors.accentStrong : colors.warning;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 2.1, Math.PI * 1.05, Math.PI * 1.92);
      ctx.stroke();
    }

    if (selected || activeLeaf) {
      ctx.strokeStyle = activeLeaf ? colors.accentStrong : colors.blue;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        radius + (state.mode === "atlas" ? 4.2 : 3.5),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    if (
      state.mode === "atlas" ||
      selected ||
      activeLeaf ||
      event.node.kind === "user" ||
      event.scopeMatch
    ) {
      circleHits.push({
        kind: "event",
        x: p.x,
        y: p.y,
        radius: Math.max(radius, 3),
        node: event.node,
        priority:
          selected || activeLeaf ? 10 : event.node.kind === "user" ? 4 : 1,
      });
    }
  }
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  projection: TopologyProjection,
  transform: CanvasTransform,
  colors: ColorSet,
  state: DrawState,
  rectHits: RectHit[],
): void {
  const notesByAnchor = new Map<string, SemanticNote[]>();
  for (const note of projection.notes) {
    const list = notesByAnchor.get(note.anchorUid) ?? [];
    list.push(note);
    notesByAnchor.set(note.anchorUid, list);
  }

  const occupied: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  for (const [anchorUid, notes] of notesByAnchor) {
    const point = projection.layout.pointByUid.get(anchorUid);
    const node = projection.layout.model.uidMap.get(anchorUid);
    if (!point || !node || !isPointVisible(point, transform, 0.06)) continue;
    const anchor = transform.toScreen(point);

    const spread = mapLayoutSpread(
      transform,
      state.mode,
      state.settings.smartMapLayout,
    );
    notes.forEach((note, index) => {
      const color = noteColor(note.type, colors);
      const side = point.x > 0.72 ? -1 : 1;
      const glyphX = anchor.x + side * (12 + index * 7) * spread;
      const glyphY = anchor.y - (8 + index * 13) * spread;
      const lead = 10 * spread;
      const ctrlX = anchor.x + side * lead * 0.55;
      const ctrlY = anchor.y - lead * 0.45;
      ctx.strokeStyle = alpha(color, 0.7);
      ctx.lineWidth = spread > 1.35 ? 1.15 : 1;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.quadraticCurveTo(ctrlX, ctrlY, glyphX, glyphY);
      ctx.stroke();
      drawNoteGlyph(
        ctx,
        note.type,
        glyphX,
        glyphY,
        color,
        colors.panel,
        state.mode === "atlas" ? 4.5 : 3.8,
      );

      const showCallout =
        state.mode === "atlas" ||
        note.type === "user" ||
        note.type === "assistant_reply" ||
        note.type === "rename" ||
        note.type === "label" ||
        note.type === "model" ||
        (state.hover?.kind === "note" && state.hover.note.id === note.id);
      if (!showCallout) {
        rectHits.push({
          kind: "note",
          x: glyphX - 7,
          y: glyphY - 7,
          width: 14,
          height: 14,
          note,
          node,
        });
        return;
      }

      ctx.font = `700 ${state.mode === "atlas" ? 9 : 7}px ${fontMono()}`;
      const label =
        state.mode === "atlas"
          ? `${noteTypeAbbreviation(note.type)} · ${note.shortLabel}`
          : `${noteTypeAbbreviation(note.type)} ${note.shortLabel}`;
      const textWidth = Math.min(
        state.mode === "atlas" ? 180 : 125,
        ctx.measureText(label).width + 14,
      );
      const height = state.mode === "atlas" ? 18 : 15;
      const calloutGap = 8 * spread;
      let x = side > 0 ? glyphX + calloutGap : glyphX - textWidth - calloutGap;
      let y = glyphY - height / 2;
      x = clamp(
        x,
        transform.plotLeft,
        transform.plotLeft + transform.plotWidth - textWidth,
      );
      y = clamp(
        y,
        transform.plotTop,
        transform.plotTop + transform.plotHeight - height,
      );
      for (
        let attempt = 0;
        attempt < 12 &&
        occupied.some((box) =>
          intersects({ x, y, width: textWidth, height }, box),
        );
        attempt += 1
      ) {
        y = clamp(
          y + (attempt % 2 === 0 ? height + 3 : -(height + 3) * 1.5),
          transform.plotTop,
          transform.plotTop + transform.plotHeight - height,
        );
      }
      occupied.push({ x, y, width: textWidth, height });

      roundedRect(ctx, x, y, textWidth, height, 4);
      ctx.fillStyle = colors.panel2;
      ctx.fill();
      ctx.strokeStyle = alpha(color, 0.78);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.fillText(fitText(ctx, label, textWidth - 10), x + 5, y + height / 2);
      ctx.textBaseline = "alphabetic";
      rectHits.push({
        kind: "note",
        x,
        y,
        width: textWidth,
        height,
        note,
        node,
      });
    });
  }
}

/** Map world Y to axis value; layout Y is normalized to session extent only. */
function axisValueAtWorldY(
  layout: TopologyLayout,
  worldY: number,
): { sequence: number; timeMs: number } {
  const y = clamp(worldY, 0, 1);
  return {
    sequence: Math.max(1, Math.round(1 + y * (layout.maxSequence - 1))),
    timeMs: layout.minTime + y * (layout.maxTime - layout.minTime),
  };
}

function drawAxis(
  ctx: CanvasRenderingContext2D,
  layout: TopologyLayout,
  transform: CanvasTransform,
  colors: ColorSet,
  mode: "overview" | "atlas",
): void {
  ctx.font = `600 ${mode === "atlas" ? 9 : 7}px ${fontMono()}`;
  ctx.fillStyle = colors.muted;
  ctx.textBaseline = "middle";
  const count = mode === "atlas" ? 5 : 2;
  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1);
    const worldY = transform.worldTop + ratio * transform.worldHeight;
    const y = transform.toScreen({ x: transform.worldLeft, y: worldY }).y;
    const axisValue = axisValueAtWorldY(layout, worldY);
    const label =
      layout.axis === "sequence"
        ? `#${formatNumber(axisValue.sequence)}`
        : formatTimestamp(axisValue.timeMs).slice(mode === "atlas" ? 0 : -8);
    ctx.fillText(label, mode === "atlas" ? 7 : 3, y);
  }
  ctx.textBaseline = "alphabetic";

  if (mode === "overview") {
    ctx.textAlign = "right";
    ctx.fillText(
      layout.axis === "sequence"
        ? "sequence"
        : formatDuration(layout.maxTime - layout.minTime),
      transform.width - 5,
      transform.height - 5,
    );
    ctx.textAlign = "start";
  }
}

function drawSemanticBadge(
  ctx: CanvasRenderingContext2D,
  model: SessionModel,
  transform: CanvasTransform,
  colors: ColorSet,
  mode: "overview" | "atlas",
): void {
  const label = `${formatNumber(model.segments.length)} linear segments · ${formatNumber(model.forks.length)} forks · level ${formatNumber(model.maxBranchLevel)}`;
  ctx.font = `700 ${mode === "atlas" ? 9 : 7}px ${fontMono()}`;
  const width = ctx.measureText(label).width + 14;
  const height = mode === "atlas" ? 18 : 14;
  const x = transform.plotLeft + 4;
  const y = transform.plotTop + 4;
  roundedRect(ctx, x, y, width, height, 5);
  ctx.fillStyle = alpha(colors.panel2, 0.94);
  ctx.fill();
  ctx.strokeStyle = alpha(colors.accent, 0.35);
  ctx.stroke();
  ctx.fillStyle = colors.textSecondary;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 7, y + height / 2);
  ctx.textBaseline = "alphabetic";
}

function createTransform(
  width: number,
  height: number,
  mode: "overview" | "atlas",
  rawView: MapView,
): CanvasTransform {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const margins =
    mode === "overview"
      ? OVERVIEW_MARGINS
      : atlasPlotMarginsForSize(width, height);
  const plotWidth = Math.max(1, width - margins.left - margins.right);
  const plotHeight = Math.max(1, height - margins.top - margins.bottom);
  const view = rawView.worldRect ? rawView : clampView(rawView);
  let worldLeft: number;
  let worldTop: number;
  let worldWidth: number;
  let worldHeight: number;
  if (view.worldRect && view.worldRect.width > 0 && view.worldRect.height > 0) {
    worldLeft = view.worldRect.left;
    worldTop = view.worldRect.top;
    worldWidth = view.worldRect.width;
    worldHeight = view.worldRect.height;
  } else {
    worldWidth = 1 / view.zoom;
    worldHeight = 1 / view.zoom;
    const halfW = worldWidth / 2;
    const halfH = worldHeight / 2;
    worldLeft = view.centerX - halfW;
    worldTop = view.centerY - halfH;
    if (mode === "overview" && worldWidth <= 1 && worldHeight <= 1) {
      worldLeft = clamp(worldLeft, 0, 1 - worldWidth);
      worldTop = clamp(worldTop, 0, 1 - worldHeight);
    }
  }
  return {
    dpr,
    width,
    height,
    plotLeft: margins.left,
    plotTop: margins.top,
    plotWidth,
    plotHeight,
    worldLeft,
    worldTop,
    worldWidth,
    worldHeight,
    toScreen: (point) => ({
      x: margins.left + ((point.x - worldLeft) / worldWidth) * plotWidth,
      y: margins.top + ((point.y - worldTop) / worldHeight) * plotHeight,
    }),
    fromScreen: (x, y) => ({
      x: worldLeft + ((x - margins.left) / plotWidth) * worldWidth,
      y: worldTop + ((y - margins.top) / plotHeight) * worldHeight,
    }),
  };
}

export function clampView(view: MapView, layout?: TopologyLayout): MapView {
  const zoom = clamp(view.zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  const half = 1 / zoom / 2;
  if (layout) {
    const pan = computeTopologyPanBounds(layout, "atlas");
    const pad = 0.04;
    const minCX = pan.minX + pad + half;
    const maxCX = pan.maxX - pad - half;
    const minCY = pan.minY + pad + half;
    const maxCY = pan.maxY - pad - half;
    const cx =
      minCX <= maxCX
        ? clamp(view.centerX, minCX, maxCX)
        : (pan.minX + pan.maxX) / 2;
    const cy =
      minCY <= maxCY
        ? clamp(view.centerY, minCY, maxCY)
        : (pan.minY + pan.maxY) / 2;
    return { zoom, centerX: cx, centerY: cy };
  }
  if (half >= 0.5) {
    return { zoom, centerX: 0.5, centerY: 0.5 };
  }
  return {
    zoom,
    centerX: clamp(view.centerX, half, 1 - half),
    centerY: clamp(view.centerY, half, 1 - half),
  };
}

function mapWorldToScreenScale(transform: CanvasTransform): number {
  const scaleY = transform.plotHeight / Math.max(1e-6, transform.worldHeight);
  const scaleX = transform.plotWidth / Math.max(1e-6, transform.worldWidth);
  return (scaleY + scaleX) / 2;
}

/** When the whole session fits in the plot, stretch annotation/fork spacing (screen-space). */
function mapLayoutSpread(
  transform: CanvasTransform,
  mode: "overview" | "atlas",
  smart: boolean,
): number {
  if (!smart) return 1;
  const scale = mapWorldToScreenScale(transform);
  const baseline = mode === "atlas" ? 300 : 190;
  return clamp(scale / baseline, 1, 4.2);
}

function rangeVisible(
  minY: number,
  maxY: number,
  transform: CanvasTransform,
  padding: number,
): boolean {
  return (
    maxY >= transform.worldTop - padding &&
    minY <= transform.worldTop + transform.worldHeight + padding
  );
}

function isPointVisible(
  point: Pick<TopologyPoint, "x" | "y">,
  transform: CanvasTransform,
  padding: number,
): boolean {
  return (
    point.x >= transform.worldLeft - padding &&
    point.x <= transform.worldLeft + transform.worldWidth + padding &&
    point.y >= transform.worldTop - padding &&
    point.y <= transform.worldTop + transform.worldHeight + padding
  );
}

function nodeColor(node: SessionNode, colors: ColorSet): string {
  if (node.kind === "user") return colors.user;
  if (node.kind === "assistant") return colors.assistant;
  if (node.kind === "tool") return colors.tool;
  if (node.kind === "error") return colors.error;
  if (node.kind === "compaction" || node.kind === "branch")
    return colors.warning;
  if (node.kind === "setting") return colors.blue;
  return colors.cyan;
}

function drawNoteGlyph(
  ctx: CanvasRenderingContext2D,
  type: SemanticNote["type"],
  x: number,
  y: number,
  color: string,
  background: string,
  radius: number,
): void {
  ctx.fillStyle = background;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (type === "label") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius, y);
    ctx.closePath();
  } else if (type === "rename") {
    roundedRect(ctx, x - radius, y - radius, radius * 2, radius * 2, 2);
  } else if (type === "model") {
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (type === "error") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius, y + radius);
    ctx.lineTo(x - radius, y + radius);
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  if (type === "model") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius * 0.28), 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}…`).width <= maxWidth)
      low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low)}…`;
}

function noteColor(type: SemanticNote["type"], colors: ColorSet): string {
  if (type === "user") return colors.user;
  if (type === "assistant_reply") return colors.assistant;
  if (type === "rename") return colors.purple;
  if (type === "label") return colors.warning;
  if (type === "model") return colors.blue;
  if (type === "thinking") return colors.cyan;
  if (type === "compaction") return colors.warning;
  return colors.error;
}

function noteTypeAbbreviation(type: SemanticNote["type"]): string {
  if (type === "user") return "U";
  if (type === "assistant_reply") return "A";
  if (type === "rename") return "RN";
  if (type === "label") return "LB";
  if (type === "model") return "MD";
  if (type === "thinking") return "TH";
  if (type === "compaction") return "CP";
  return "ER";
}

function noteTypeLabel(type: SemanticNote["type"]): string {
  if (type === "user") return "USER";
  if (type === "assistant_reply") return "ASSISTANT REPLY";
  if (type === "rename") return "RENAME";
  if (type === "label") return "LABEL";
  if (type === "model") return "MODEL SWITCH";
  if (type === "thinking") return "THINKING";
  if (type === "compaction") return "COMPACTION";
  return "ERROR";
}

function nodeRoleLabel(node: SessionNode): string {
  if (node.entry.type === "message")
    return String(node.entry.message?.role || "message").toUpperCase();
  return node.entry.type.toUpperCase();
}

function readColors(): ColorSet {
  const style = getComputedStyle(document.documentElement);
  const raw = (name: string): string => style.getPropertyValue(name).trim();
  const rgbToken = (name: string, fallback: string): string => {
    const value = raw(name);
    if (!value) return fallback;
    if (/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/.test(value)) {
      return `rgb(${value})`;
    }
    return value;
  };
  const accent = raw("--accent") || rgbToken("--color-ring", style.color);
  return {
    bg: rgbToken("--color-background", style.backgroundColor),
    panel: rgbToken("--color-card", style.backgroundColor),
    panel2: rgbToken("--color-surface", style.backgroundColor),
    border: rgbToken("--color-border", accent),
    borderStrong: rgbToken("--color-ring", accent),
    text: rgbToken("--color-foreground", style.color),
    textSecondary: raw("--text-secondary") || style.color,
    muted: rgbToken("--color-muted-foreground", style.color),
    base: rgbToken("--color-muted-foreground", style.color),
    accent,
    accentStrong: accent,
    blue: rgbToken("--color-info", accent),
    user: accent,
    assistant: rgbToken("--color-success", style.color),
    tool: rgbToken("--color-muted-foreground", style.color),
    warning: rgbToken("--color-warning", accent),
    error: rgbToken("--color-destructive", accent),
    purple: rgbToken("--color-purple", accent),
    cyan: rgbToken("--color-info", accent),
  };
}

function alpha(color: string, opacity: number): string {
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${opacity})`;
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex =
      color.length === 4
        ? color
            .slice(1)
            .split("")
            .map((char) => char + char)
            .join("")
        : color.slice(1);
    return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${opacity})`;
  }
  return color;
}

function fontMono(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-family-mono")
      .trim() || "ui-monospace, monospace"
  );
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
