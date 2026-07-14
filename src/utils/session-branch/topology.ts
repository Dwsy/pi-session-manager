import type {
  BranchFork,
  BranchSegment,
  GlobalMapSettings,
  SemanticNote,
  SessionModel,
  SessionNode,
  TopologyAxis,
  TopologyScope,
} from "./types";
import { hasTextContent } from "./buildSessionModel";
import { clamp, normalizeInline } from "./format";

export interface TopologyPoint {
  node: SessionNode;
  x: number;
  y: number;
}

export interface TopologySegmentLayout {
  segment: BranchSegment;
  x: number;
  startY: number;
  endY: number;
  minY: number;
  maxY: number;
}

export interface TopologyForkLink {
  fork: BranchFork;
  child: BranchSegment;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface TopologyLayout {
  model: SessionModel;
  axis: TopologyAxis;
  points: TopologyPoint[];
  pointByUid: Map<string, TopologyPoint>;
  segments: TopologySegmentLayout[];
  segmentByUid: Map<string, TopologySegmentLayout>;
  forkLinks: TopologyForkLink[];
  maxSequence: number;
  minTime: number;
  maxTime: number;
}

export interface ProjectedEvent {
  node: SessionNode;
  point: TopologyPoint;
  scopeMatch: boolean;
  modelMatch: boolean;
  forced: boolean;
}

export interface TopologyProjection {
  layout: TopologyLayout;
  events: ProjectedEvent[];
  eventByUid: Map<string, ProjectedEvent>;
  notes: SemanticNote[];
  scopeMatchCount: number;
  modelMatchCount: number;
}

/**
 * Branch-map layout: every maximal single-child segment receives one fixed x.
 * Entries in a linear conversation therefore sit on the same vertical rail.
 * Only a real fork creates links to child rails.
 */
export function buildTopologyLayout(
  model: SessionModel,
  axis: TopologyAxis,
): TopologyLayout {
  const terminal = model.terminalSegments;
  const xBySegment = new Map<string, number>();
  const laneStart = terminal.length > 1 ? 0.1 : 0.5;
  const laneSpan = terminal.length > 1 ? 0.8 : 0;

  terminal.forEach((segment, index) => {
    const x =
      terminal.length > 1
        ? laneStart + (index / Math.max(1, terminal.length - 1)) * laneSpan
        : 0.5;
    xBySegment.set(segment.uid, x);
  });

  for (let index = model.segments.length - 1; index >= 0; index -= 1) {
    const segment = model.segments[index];
    if (xBySegment.has(segment.uid)) continue;
    if (!segment.children.length) {
      xBySegment.set(segment.uid, 0.5);
      continue;
    }
    let weighted = 0;
    let total = 0;
    for (const child of segment.children) {
      const weight = Math.max(1, child.descendantLeaves);
      weighted += (xBySegment.get(child.uid) ?? 0.5) * weight;
      total += weight;
    }
    xBySegment.set(segment.uid, total ? weighted / total : 0.5);
  }

  const maxSequence = Math.max(1, ...model.nodes.map((node) => node.sequence));
  const minTime = model.minTime;
  const maxTime = Math.max(model.maxTime, minTime + 1);
  const timeSpan = Math.max(1, maxTime - minTime);
  const yByNode = new Map<string, number>();

  for (const node of model.nodes) {
    const raw =
      axis === "time"
        ? (node.timestampMs - minTime) / timeSpan
        : (node.sequence - 1) / Math.max(1, maxSequence - 1);
    const fallback = node.fileIndex / Math.max(1, model.nodes.length - 1);
    yByNode.set(node.uid, clamp(Number.isFinite(raw) ? raw : fallback, 0, 1));
  }

  const points = model.nodes.map(
    (node): TopologyPoint => ({
      node,
      x: clamp(xBySegment.get(node.segmentUid) ?? 0.5, 0, 1),
      y: yByNode.get(node.uid) ?? 0,
    }),
  );
  const pointByUid = new Map(points.map((point) => [point.node.uid, point]));

  const segments = model.segments.map((segment): TopologySegmentLayout => {
    const ys = segment.nodes.map((node) => yByNode.get(node.uid) ?? 0);
    const startY = yByNode.get(segment.start.uid) ?? 0;
    const endY = yByNode.get(segment.end.uid) ?? startY;
    return {
      segment,
      x: xBySegment.get(segment.uid) ?? 0.5,
      startY,
      endY,
      minY: Math.min(...ys, startY, endY),
      maxY: Math.max(...ys, startY, endY),
    };
  });
  const segmentByUid = new Map(
    segments.map((item) => [item.segment.uid, item]),
  );

  const forkLinks: TopologyForkLink[] = [];
  for (const fork of model.forks) {
    const anchor = pointByUid.get(fork.anchor.uid);
    if (!anchor) continue;
    for (const child of fork.children) {
      const childStart = pointByUid.get(child.start.uid);
      if (!childStart) continue;
      forkLinks.push({
        fork,
        child,
        from: { x: anchor.x, y: anchor.y },
        to: { x: childStart.x, y: childStart.y },
      });
    }
  }

  return {
    model,
    axis,
    points,
    pointByUid,
    segments,
    segmentByUid,
    forkLinks,
    maxSequence,
    minTime,
    maxTime,
  };
}

function topologyPointExtent(layout: TopologyLayout): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (!layout.points.length) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of layout.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Tight [0,1] bounds with small label padding (visibility / hit tests). */
export function computeTopologyWorldBounds(layout: TopologyLayout): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const { minX, minY, maxX, maxY } = topologyPointExtent(layout);
  const padX = 0.06;
  const padY = 0.05;
  return {
    minX: clamp(minX - padX, 0, 1),
    minY: clamp(minY - padY, 0, 1),
    maxX: clamp(maxX + padX, 0, 1),
    maxY: clamp(maxY + padY, 0, 1),
  };
}

/**
 * Bounds for auto-fit: expand around content so the map is not flush to the plot edge.
 * May extend outside [0,1] so Atlas pan can bring corners toward the viewport center.
 */
function topologyBoundsWithMargin(
  layout: TopologyLayout,
  margin: number,
  minPad: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { minX, minY, maxX, maxY } = topologyPointExtent(layout);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfX = Math.max(0.015, (maxX - minX) / 2);
  const halfY = Math.max(0.015, (maxY - minY) / 2);
  const expandX = Math.max(halfX * (1 + margin), halfX + minPad);
  const expandY = Math.max(halfY * (1 + margin), halfY + minPad);
  return {
    minX: cx - expandX,
    minY: cy - expandY,
    maxX: cx + expandX,
    maxY: cy + expandY,
  };
}

export function computeTopologyFitBounds(
  layout: TopologyLayout,
  mode: "overview" | "atlas",
): { minX: number; minY: number; maxX: number; maxY: number } {
  const margin = mode === "atlas" ? 0.52 : 0.32;
  const minPad = mode === "atlas" ? 0.14 : 0.08;
  return topologyBoundsWithMargin(layout, margin, minPad);
}

/** Wider world extent for pan/zoom clamp so corners can be dragged to the viewport center. */
export function computeTopologyPanBounds(
  layout: TopologyLayout,
  mode: "overview" | "atlas",
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (mode !== "atlas") {
    return topologyBoundsWithMargin(layout, 0.32, 0.08);
  }
  const { minX, minY, maxX, maxY } = topologyPointExtent(layout);
  const spanY = Math.max(0.08, maxY - minY);
  const spanX = Math.max(0.08, maxX - minX);
  const padX = Math.max(0.75, spanX * 0.85);
  const padTop = Math.max(0.42, spanY * 0.35);
  const padBottom = Math.max(2.1, spanY * 1.85);
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padTop,
    maxY: maxY + padBottom,
  };
}

export type MapNoteScope = "sidebar" | "atlas";

export function buildTopologyProjection(
  layout: TopologyLayout,
  settings: GlobalMapSettings,
  activeLeafUid: string,
  selectedUid: string,
  noteScope: MapNoteScope = "sidebar",
): TopologyProjection {
  const selectedModels = new Set(settings.selectedModels);
  const forced = new Set([activeLeafUid, selectedUid]);
  const events: ProjectedEvent[] = [];
  const eventByUid = new Map<string, ProjectedEvent>();
  let scopeMatchCount = 0;
  let modelMatchCount = 0;

  for (const point of layout.points) {
    const scopeMatch = nodeMatchesScope(point.node, settings.scope);
    const modelMatch = nodeMatchesModels(point.node, selectedModels);
    if (scopeMatch) scopeMatchCount += 1;
    if (scopeMatch && modelMatch) modelMatchCount += 1;
    if (!(scopeMatch && modelMatch) && !forced.has(point.node.uid)) continue;
    const event = {
      node: point.node,
      point,
      scopeMatch,
      modelMatch,
      forced: forced.has(point.node.uid),
    };
    events.push(event);
    eventByUid.set(point.node.uid, event);
  }

  let enabled = layout.model.notes.filter(
    (note) => settings.enabledNotes[note.type],
  );
  if (noteScope === "atlas") {
    enabled = enabled.filter(
      (note) => note.type === "user" || note.type === "assistant_reply",
    );
  }
  let notes = settings.smartMapLayout
    ? collapseConsecutiveSmartMapNotes(enabled)
    : enabled;
  if (settings.smartMapLayout) {
    notes = collapseConsecutiveDuplicateUserNotes(notes);
  }
  return {
    layout,
    events,
    eventByUid,
    notes,
    scopeMatchCount,
    modelMatchCount,
  };
}

/**
 * On the branch map, consecutive model / thinking-level notes collapse to the last
 * one in each run (separate runs per type).
 */
export function collapseConsecutiveSmartMapNotes(
  notes: SemanticNote[],
): SemanticNote[] {
  const result: SemanticNote[] = [];
  let run: SemanticNote[] = [];
  let runType: SemanticNote["type"] | null = null;
  const flush = (): void => {
    if (run.length) {
      result.push(run[run.length - 1]);
      run = [];
      runType = null;
    }
  };
  for (const note of notes) {
    if (note.type === "model" || note.type === "thinking") {
      if (runType !== note.type) {
        flush();
        runType = note.type;
      }
      run.push(note);
    } else {
      flush();
      result.push(note);
    }
  }
  flush();
  return result;
}

function userNoteTextKey(note: SemanticNote): string {
  return normalizeInline(note.detail || note.shortLabel);
}

/** Adjacent user-input notes with identical text → one callout with ×N (map only). */
export function collapseConsecutiveDuplicateUserNotes(
  notes: SemanticNote[],
): SemanticNote[] {
  const result: SemanticNote[] = [];
  let run: SemanticNote[] = [];
  let runKey: string | null = null;
  const flush = (): void => {
    if (!run.length) return;
    const anchor = run[run.length - 1];
    if (run.length === 1) {
      result.push(anchor);
    } else {
      const count = run.length;
      const base = truncateUserLabel(anchor.shortLabel);
      result.push({
        ...anchor,
        title: `用户输入 ×${count}`,
        shortLabel: `${base} ×${count}`,
        data: {
          ...anchor.data,
          collapsedCount: count,
          collapsedEventUids: run.map((item) => item.eventUid),
        },
      });
    }
    run = [];
    runKey = null;
  };
  for (const note of notes) {
    if (note.type !== "user") {
      flush();
      result.push(note);
      continue;
    }
    const key = userNoteTextKey(note);
    if (!key) {
      flush();
      result.push(note);
      continue;
    }
    if (runKey === key) {
      run.push(note);
    } else {
      flush();
      runKey = key;
      run = [note];
    }
  }
  flush();
  return result;
}

function truncateUserLabel(label: string): string {
  return label.replace(/\s*×\d+\s*$/, "").trim();
}

/** @deprecated Use collapseConsecutiveSmartMapNotes */
export function collapseConsecutiveModelMapNotes(
  notes: SemanticNote[],
): SemanticNote[] {
  return collapseConsecutiveSmartMapNotes(notes);
}

export function nodeMatchesScope(
  node: SessionNode,
  scope: TopologyScope,
): boolean {
  if (scope === "all") return true;
  if (scope === "structure") return false;
  if (node.entry.type === "message") {
    const role = node.entry.message?.role;
    if (scope === "user") return role === "user";
    if (scope === "conversation") {
      return (
        role === "user" ||
        (role === "assistant" &&
          (hasTextContent(node.entry.message?.content) ||
            Boolean(node.entry.message?.errorMessage)))
      );
    }
  }
  return (
    scope === "conversation" &&
    ["custom_message", "branch_summary"].includes(node.entry.type)
  );
}

export function nodeMatchesModels(
  node: SessionNode,
  selectedModels: Set<string>,
): boolean {
  if (!selectedModels.size) return true;
  const model = node.actualModel ?? node.effectiveModel;
  return Boolean(model && selectedModels.has(model.key));
}
