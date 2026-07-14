import type {
  BranchSegment,
  SessionModel,
  SessionNode,
  TimelineMode,
  TreeFilter,
} from "./types";
import {
  extractContentText,
  hasTextContent,
  isUserMessage,
} from "./buildSessionModel";

export interface SegmentTreeItem {
  kind: "segment";
  key: string;
  segment: BranchSegment;
  indent: number;
  ancestorContinuation: boolean[];
  isLastSibling: boolean;
  activeLineage: boolean;
  activeTerminal: boolean;
  visibleEntryCount: number;
  matchingEntryCount: number;
}

export interface EntryTreeItem {
  kind: "entry";
  key: string;
  node: SessionNode;
  segment: BranchSegment;
  indent: number;
  ancestorContinuation: boolean[];
  matchesSearch: boolean;
  isForkAnchor: boolean;
}

export type TreeItem = SegmentTreeItem | EntryTreeItem;

export function buildPath(
  model: SessionModel,
  uid: string | null | undefined,
): SessionNode[] {
  const path: SessionNode[] = [];
  let cursor = uid ? (model.uidMap.get(uid) ?? null) : null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.uid)) {
    seen.add(cursor.uid);
    path.push(cursor);
    cursor = cursor.parent;
  }
  return path.reverse();
}

export function pathSet(
  model: SessionModel,
  uid: string | null | undefined,
): Set<string> {
  return new Set(buildPath(model, uid).map((node) => node.uid));
}

export function buildSegmentPath(
  model: SessionModel,
  uid: string | null | undefined,
): BranchSegment[] {
  const node = uid ? model.uidMap.get(uid) : null;
  const result: BranchSegment[] = [];
  let cursor = node?.segment ?? null;
  while (cursor) {
    result.push(cursor);
    cursor = cursor.parent;
  }
  return result.reverse();
}

export function segmentPathSet(
  model: SessionModel,
  uid: string | null | undefined,
): Set<string> {
  return new Set(buildSegmentPath(model, uid).map((segment) => segment.uid));
}

export function isConversationNode(node: SessionNode): boolean {
  const entry = node.entry;
  if (entry.type === "custom_message" || entry.type === "branch_summary")
    return true;
  if (entry.type !== "message") return false;
  const role = entry.message?.role;
  if (role === "user") return true;
  if (role === "assistant") {
    return (
      hasTextContent(entry.message?.content) ||
      Boolean(entry.message?.errorMessage) ||
      entry.message?.stopReason === "aborted"
    );
  }
  return false;
}

export function isErrorNode(node: SessionNode): boolean {
  if (node.kind === "error") return true;
  return (
    node.entry.type === "message" &&
    node.entry.message?.stopReason === "aborted"
  );
}

export function buildEffectiveContext(
  path: SessionNode[],
  model: SessionModel,
): SessionNode[] {
  let lastCompactionIndex = -1;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index].entry.type === "compaction") lastCompactionIndex = index;
  }
  if (lastCompactionIndex < 0) return path;

  const compaction = path[lastCompactionIndex];
  const firstKeptId = compaction.entry.firstKeptEntryId;
  if (!firstKeptId) return path.slice(lastCompactionIndex);
  const firstKeptNode = model.firstById.get(String(firstKeptId));
  const firstKeptIndex = firstKeptNode
    ? path.findIndex((node) => node.uid === firstKeptNode.uid)
    : -1;
  if (firstKeptIndex < 0 || firstKeptIndex > lastCompactionIndex)
    return path.slice(lastCompactionIndex);
  return [
    compaction,
    ...path.slice(firstKeptIndex, lastCompactionIndex),
    ...path.slice(lastCompactionIndex + 1),
  ];
}

export function timelineNodes(
  model: SessionModel,
  activeLeafUid: string,
  mode: TimelineMode,
): SessionNode[] {
  const path = buildPath(model, activeLeafUid);
  if (mode === "full") return path;
  if (mode === "context") return buildEffectiveContext(path, model);
  if (mode === "errors") return path.filter(isErrorNode);
  return path.filter(isConversationNode);
}

/** Keep only nodes on the active branch path that lie on the chosen segment or its ancestors. */
export function filterTimelineToSegmentScope(
  nodes: SessionNode[],
  model: SessionModel,
  scopeSegmentUid: string | null,
): SessionNode[] {
  if (!scopeSegmentUid) return nodes;
  const scope = model.segments.find(
    (segment) => segment.uid === scopeSegmentUid,
  );
  if (!scope) return nodes;
  const allowed = new Set<string>();
  let cursor: BranchSegment | null = scope;
  while (cursor) {
    for (const node of cursor.nodes) allowed.add(node.uid);
    cursor = cursor.parent;
  }
  return nodes.filter((node) => allowed.has(node.uid));
}

export function entryPassesTreeFilter(
  node: SessionNode,
  filter: TreeFilter,
  activeLeafUid: string,
): boolean {
  const entry = node.entry;
  const isCurrent = node.uid === activeLeafUid;
  if (
    entry.type === "message" &&
    entry.message?.role === "assistant" &&
    !isCurrent
  ) {
    const exceptional =
      entry.message.stopReason &&
      !["stop", "toolUse"].includes(entry.message.stopReason);
    if (!hasTextContent(entry.message.content) && !exceptional) return false;
  }

  const setting = [
    "label",
    "custom",
    "model_change",
    "thinking_level_change",
    "session_info",
  ].includes(entry.type);
  if (filter === "user-only") return isUserMessage(entry);
  if (filter === "no-tools") {
    return (
      !(
        entry.type === "message" &&
        ["toolResult", "bashExecution"].includes(entry.message?.role || "")
      ) && !setting
    );
  }
  if (filter === "labeled-only")
    return Boolean(node.label) || entry.type === "label";
  if (filter === "all") return true;
  if (setting) return false;
  return !(
    entry.type === "message" &&
    ["toolResult", "bashExecution"].includes(entry.message?.role || "")
  );
}

/**
 * Build the TUI-compatible branch outline. Entries are grouped by linear
 * segment and never receive deeper indentation merely because parentId points
 * to the preceding entry. Only child segments created at a fork are nested.
 */
export function buildTreeItems(options: {
  model: SessionModel;
  activeLeafUid: string;
  filter: TreeFilter;
  search: string;
  includeSearchContext: boolean;
  collapsed: Set<string>;
}): TreeItem[] {
  const { model, activeLeafUid, filter, includeSearchContext, collapsed } =
    options;
  const tokens = options.search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = new Set<string>();
  const visible = new Set<string>();

  for (const node of model.nodes) {
    const passesFilter = entryPassesTreeFilter(node, filter, activeLeafUid);
    const passesSearch =
      !tokens.length ||
      tokens.every((token) => node.searchText.includes(token));
    if (passesFilter && passesSearch) {
      matches.add(node.uid);
      visible.add(node.uid);
    }
  }

  if (tokens.length && includeSearchContext) {
    for (const uid of matches) {
      const node = model.uidMap.get(uid);
      if (!node?.segment) continue;
      const index = node.segmentIndex;
      for (let offset = -1; offset <= 1; offset += 1) {
        const neighbor = node.segment.nodes[index + offset];
        if (neighbor && entryPassesTreeFilter(neighbor, filter, activeLeafUid))
          visible.add(neighbor.uid);
      }
      if (
        node.segment.forkAnchor &&
        entryPassesTreeFilter(node.segment.forkAnchor, filter, activeLeafUid)
      ) {
        visible.add(node.segment.forkAnchor.uid);
      }
    }
  }
  visible.add(activeLeafUid);

  const activeSegments = segmentPathSet(model, activeLeafUid);
  const activeTerminal = model.uidMap.get(activeLeafUid)?.segmentUid ?? "";
  const items: TreeItem[] = [];

  type StackItem = {
    segment: BranchSegment;
    continuation: boolean[];
    isLast: boolean;
  };
  const orderChildren = (segments: BranchSegment[]): BranchSegment[] =>
    [...segments].sort((a, b) => {
      const aActive = activeSegments.has(a.uid) ? 1 : 0;
      const bActive = activeSegments.has(b.uid) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return a.order - b.order || a.index - b.index;
    });

  const roots = orderChildren(model.rootSegments);
  const stack: StackItem[] = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({
      segment: roots[index],
      continuation: [],
      isLast: index === roots.length - 1,
    });
  }

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const segment = current.segment;
    const visibleNodes = segment.nodes.filter((node) => visible.has(node.uid));
    const matchingEntryCount = segment.nodes.filter((node) =>
      matches.has(node.uid),
    ).length;
    items.push({
      kind: "segment",
      key: segment.uid,
      segment,
      indent: segment.level,
      ancestorContinuation: current.continuation,
      isLastSibling: current.isLast,
      activeLineage: activeSegments.has(segment.uid),
      activeTerminal: segment.uid === activeTerminal,
      visibleEntryCount: visibleNodes.length,
      matchingEntryCount,
    });

    if (collapsed.has(segment.uid)) continue;

    for (const node of visibleNodes) {
      items.push({
        kind: "entry",
        key: node.uid,
        node,
        segment,
        indent: segment.level,
        ancestorContinuation: [...current.continuation, !current.isLast],
        matchesSearch: matches.has(node.uid),
        isForkAnchor: node.children.length > 1,
      });
    }

    const children = orderChildren(segment.children);
    const nextContinuation = [...current.continuation, !current.isLast];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({
        segment: children[index],
        continuation: nextContinuation,
        isLast: index === children.length - 1,
      });
    }
  }

  return items;
}

export function nodePrimaryText(node: SessionNode): string {
  if (node.entry.type === "message") {
    return (
      extractContentText(node.entry.message?.content, true) || node.summary
    );
  }
  if (node.entry.type === "custom_message")
    return extractContentText(node.entry.content, true) || node.summary;
  return node.entry.summary || node.summary;
}

export function lowestCommonAncestor(
  a: SessionNode,
  b: SessionNode,
): SessionNode | null {
  const seen = new Set<string>();
  let cursor: SessionNode | null = a;
  while (cursor) {
    seen.add(cursor.uid);
    cursor = cursor.parent;
  }
  cursor = b;
  while (cursor) {
    if (seen.has(cursor.uid)) return cursor;
    cursor = cursor.parent;
  }
  return null;
}

export function entryRelationLabel(node: SessionNode): string {
  if (node.relation === "branch-start") return "分支起点";
  if (node.relation === "root") return "序列起点";
  if (node.children.length > 1) return "分叉锚点";
  return "线性续接";
}
