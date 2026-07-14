import type {
  AgentMessage,
  BranchFork,
  BranchSegment,
  ContentBlock,
  Diagnostic,
  EntryMetrics,
  FileMeta,
  JsonObject,
  ModelRef,
  ModelStat,
  ParsedJsonl,
  SemanticNote,
  SessionEntry,
  SessionHeader,
  SessionModel,
  SessionNode,
  ToolCallInfo,
} from "./types";
import { modelLabel, normalizeInline, truncate } from "./format";

const KNOWN_ENTRY_TYPES = new Set([
  "message",
  "thinking_level_change",
  "model_change",
  "compaction",
  "branch_summary",
  "custom",
  "custom_message",
  "label",
  "session_info",
]);

export interface BuildSessionBranchModelOptions {
  sessionName?: string;
  labelsByTargetId?: Readonly<Record<string, string>>;
  topologyQuality?: SessionModel["topologyQuality"];
}

export function buildSessionBranchModel(
  inputEntries: readonly unknown[],
  options: BuildSessionBranchModelOptions = {},
): SessionModel {
  const parsed: ParsedJsonl = {
    records: inputEntries.map((value, index) => {
      if (!isObject(value)) {
        throw new TypeError(
          `Session entry at index ${index} must be an object`,
        );
      }
      const serialized = JSON.stringify(value);
      return {
        value: JSON.parse(serialized) as JsonObject,
        lineNo: index + 1,
        charLength: serialized.length,
      };
    }),
    diagnostics: [],
    lineCount: inputEntries.length,
  };
  const file: FileMeta = {
    name: options.sessionName || "session",
    size: parsed.records.reduce(
      (total, record) => total + record.charLength,
      0,
    ),
    lastModified: Date.now(),
  };
  const diagnostics = [...parsed.diagnostics];
  const sessionRecords = parsed.records.filter(
    (record) => record.value.type === "session",
  );
  const headerRecord = sessionRecords[0] ?? null;
  const header = (headerRecord?.value ?? {
    type: "session",
    version: 3,
    id: "synthetic-session",
    timestamp: new Date(file.lastModified || Date.now()).toISOString(),
    cwd: "",
  }) as SessionHeader;

  if (!headerRecord) {
    diagnostics.push({
      severity: "warning",
      code: "missing-header",
      message: "未找到 session header，已使用临时元数据。",
    });
  }
  if (sessionRecords.length > 1) {
    diagnostics.push({
      severity: "warning",
      code: "multiple-headers",
      message: `发现 ${sessionRecords.length} 个 session header；仅使用第一个。`,
    });
  }

  const entryRecords = parsed.records.filter(
    (record) => record.value.type !== "session",
  );
  if (!entryRecords.length) throw new Error("会话没有任何 entry 记录");

  const declaredVersion = Number(header.version || 1);
  const rawEntryRecords = parsed.records.filter(
    (record) => record.value.type !== "session",
  );
  const recordsMissingParent = rawEntryRecords.filter(
    (record) => !Object.prototype.hasOwnProperty.call(record.value, "parentId"),
  ).length;
  const topologyQuality =
    options.topologyQuality ??
    (recordsMissingParent === 0
      ? "full"
      : recordsMissingParent === rawEntryRecords.length
        ? "unknown"
        : "inferred");
  // Pi's append-only JSONL omits parentId for normal continuation. An explicit
  // parentId is therefore a branch jump, while an omitted one extends the
  // immediately preceding entry. Legacy v1 records use the same sequence rule.
  let previousId: string | null = null;
  for (let index = 0; index < entryRecords.length; index += 1) {
    const entry = entryRecords[index].value as SessionEntry;
    if (entry.id == null || entry.id === "") {
      entry.id = `legacy-${String(index + 1).padStart(8, "0")}`;
      diagnostics.push({
        severity: "info",
        code: "migrated-id",
        line: entryRecords[index].lineNo,
        message: `旧版记录缺少 id，已在内存中生成 ${entry.id}。`,
      });
    } else {
      entry.id = String(entry.id);
    }
    if (
      declaredVersion < 2 ||
      !Object.prototype.hasOwnProperty.call(entry, "parentId")
    ) {
      entry.parentId = previousId;
    } else if (entry.parentId != null) {
      entry.parentId = String(entry.parentId);
    }
    if (
      declaredVersion < 3 &&
      entry.type === "message" &&
      entry.message?.role === "hookMessage"
    ) {
      entry.message.role = "custom";
    }
    previousId = entry.id;
  }

  const nodes: SessionNode[] = [];
  const firstById = new Map<string, SessionNode>();
  const idToLastNode = new Map<string, SessionNode>();
  const duplicateCounts = new Map<string, number>();
  const unknownTypes = new Map<string, number>();

  for (let index = 0; index < entryRecords.length; index += 1) {
    const record = entryRecords[index];
    const entry = record.value as SessionEntry;
    const originalId = entry.id;
    const duplicateIndex = duplicateCounts.get(originalId) ?? 0;
    duplicateCounts.set(originalId, duplicateIndex + 1);
    const uid =
      duplicateIndex === 0 ? originalId : `${originalId}~${duplicateIndex + 1}`;
    if (duplicateIndex > 0) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-id",
        line: record.lineNo,
        message: `重复 entry id：${originalId}。查看器使用内部键 ${uid} 保留该行。`,
      });
    }

    const parsedTimestamp = Date.parse(entry.timestamp ?? "");
    if (!Number.isFinite(parsedTimestamp)) {
      diagnostics.push({
        severity: "warning",
        code: "invalid-timestamp",
        line: record.lineNo,
        message: `记录 ${originalId} 的 timestamp 无效。`,
      });
    }
    if (!KNOWN_ENTRY_TYPES.has(entry.type)) {
      const unknownType = entry.type || "<missing>";
      unknownTypes.set(unknownType, (unknownTypes.get(unknownType) ?? 0) + 1);
    }

    const node = {
      uid,
      id: originalId,
      entry,
      lineNo: record.lineNo,
      charLength: record.charLength,
      fileIndex: index,
      timestampMs: Number.isFinite(parsedTimestamp) ? parsedTimestamp : index,
      parent: null,
      children: [],
      label: undefined,
      labelTimestamp: undefined,
      depth: 0,
      sequence: 1,
      descendants: 0,
      leafCount: 1,
      newestLeaf: null as unknown as SessionNode,
      lastUserSummary: "",
      kind: "setting" as const,
      summary: "",
      searchText: "",
      delta: emptyMetrics(),
      cum: emptyMetrics(),
      effectiveModel: null,
      actualModel: null,
      effectiveSessionName: undefined,
      effectiveThinking: undefined,
      segment: null,
      segmentUid: "",
      segmentIndex: 0,
      branchLevel: 0,
      relation: "root" as const,
    } satisfies SessionNode;

    nodes.push(node);
    if (!firstById.has(originalId)) firstById.set(originalId, node);
    idToLastNode.set(originalId, node);
  }

  for (const [type, count] of unknownTypes) {
    diagnostics.push({
      severity: "info",
      code: "unknown-type",
      message: `未知 entry type “${type}”：${count} 条；将以通用 JSON 方式显示。`,
    });
  }

  for (const node of nodes) {
    const parentId = node.entry.parentId;
    if (parentId == null || parentId === node.id) continue;
    const parentIdText = String(parentId);
    if ((duplicateCounts.get(parentIdText) ?? 0) > 1) {
      diagnostics.push({
        severity: "warning",
        code: "ambiguous-parent",
        line: node.lineNo,
        message: `记录 ${node.id} 引用了重复 parentId ${parentIdText}，已作为根节点显示。`,
      });
      continue;
    }
    const parent = firstById.get(parentIdText);
    if (!parent) {
      diagnostics.push({
        severity: "warning",
        code: "orphan",
        line: node.lineNo,
        message: `记录 ${node.id} 引用了不存在的 parentId ${parentId}，已作为根节点显示。`,
      });
      continue;
    }
    node.parent = parent;
    parent.children.push(node);
  }

  breakParentCycles(nodes, diagnostics);

  const stableSort = (a: SessionNode, b: SessionNode): number =>
    a.timestampMs - b.timestampMs || a.fileIndex - b.fileIndex;
  const roots = nodes.filter((node) => !node.parent).sort(stableSort);
  for (const node of nodes) node.children.sort(stableSort);
  if (roots.length !== 1) {
    diagnostics.push({
      severity: roots.length === 0 ? "error" : "warning",
      code: "root-count",
      message: `parentId 图包含 ${roots.length} 个根节点；规范的 Pi session 通常应为 1 个。`,
    });
  }

  const labelsById = new Map<string, string>();
  const labelTimestampsById = new Map<string, string>();
  let sessionName: string | undefined;
  for (const node of nodes) {
    const entry = node.entry;
    if (entry.type === "label" && entry.targetId != null) {
      const targetId = String(entry.targetId);
      const nextLabel =
        typeof entry.label === "string" ? entry.label.trim() : "";
      if (nextLabel) {
        labelsById.set(targetId, nextLabel);
        if (entry.timestamp) labelTimestampsById.set(targetId, entry.timestamp);
      } else {
        labelsById.delete(targetId);
        labelTimestampsById.delete(targetId);
      }
      if (!firstById.has(targetId)) {
        diagnostics.push({
          severity: "warning",
          code: "missing-label-target",
          line: node.lineNo,
          message: `标签目标 ${targetId} 不存在。`,
        });
      }
    }
    if (entry.type === "session_info") {
      sessionName = String(entry.name ?? "").trim() || undefined;
    }
  }
  for (const [targetId, label] of Object.entries(
    options.labelsByTargetId ?? {},
  )) {
    const normalizedLabel = label.trim();
    if (normalizedLabel) labelsById.set(targetId, normalizedLabel);
  }
  for (const node of nodes) {
    node.label = labelsById.get(node.id);
    node.labelTimestamp = labelTimestampsById.get(node.id);
  }

  const toolCallMap = new Map<string, ToolCallInfo>();
  const duplicateToolCallIds = new Set<string>();
  for (const node of nodes) {
    if (
      node.entry.type !== "message" ||
      node.entry.message?.role !== "assistant"
    )
      continue;
    const content = node.entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || block.type !== "toolCall" || !block.id) continue;
      const id = String(block.id);
      if (toolCallMap.has(id)) duplicateToolCallIds.add(id);
      toolCallMap.set(id, {
        name: String(block.name || "tool"),
        arguments: isObject(block.arguments) ? block.arguments : {},
        node,
        block,
      });
    }
  }
  if (duplicateToolCallIds.size) {
    diagnostics.push({
      severity: "warning",
      code: "duplicate-tool-call",
      message: `发现 ${duplicateToolCallIds.size} 个重复 toolCall id，配对结果可能存在歧义。`,
    });
  }

  const toolResultByCallId = new Map<string, SessionNode[]>();
  let unpairedToolResults = 0;
  for (const node of nodes) {
    if (
      node.entry.type !== "message" ||
      node.entry.message?.role !== "toolResult"
    )
      continue;
    const callId = String(node.entry.message.toolCallId || "");
    const list = toolResultByCallId.get(callId) ?? [];
    list.push(node);
    toolResultByCallId.set(callId, list);
    if (!toolCallMap.has(callId)) unpairedToolResults += 1;
  }
  const toolCallsWithoutResults = [...toolCallMap.keys()].filter(
    (id) => !toolResultByCallId.has(id),
  ).length;
  if (unpairedToolResults) {
    diagnostics.push({
      severity: "warning",
      code: "unpaired-tool-result",
      message: `${unpairedToolResults} 条 toolResult 找不到对应 toolCall。`,
    });
  }
  if (toolCallsWithoutResults) {
    diagnostics.push({
      severity: "info",
      code: "tool-call-without-result",
      message: `${toolCallsWithoutResults} 个 toolCall 没有对应 toolResult（可能因中止或文件截断）。`,
    });
  }

  const preorder: SessionNode[] = [];
  const stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (!node) break;
    preorder.push(node);
    node.depth = node.parent ? node.parent.depth + 1 : 0;
    node.sequence = node.depth + 1;
    node.delta = computeEntryMetrics(node.entry);
    node.cum = addMetrics(node.parent?.cum, node.delta);
    node.lastUserSummary = node.parent?.lastUserSummary || "";
    if (isUserMessage(node.entry)) {
      node.lastUserSummary = truncate(
        normalizeInline(extractMessageText(node.entry.message)),
        140,
      );
    }

    const inheritedModel = node.parent?.effectiveModel ?? null;
    node.effectiveModel = inheritedModel;
    if (node.entry.type === "model_change") {
      node.effectiveModel = createModelRef(
        node.entry.provider,
        node.entry.modelId,
      );
    }
    node.actualModel = actualModelForNode(node, node.effectiveModel);

    node.effectiveSessionName = node.parent?.effectiveSessionName;
    if (node.entry.type === "session_info") {
      node.effectiveSessionName =
        String(node.entry.name ?? "").trim() || undefined;
    }

    node.effectiveThinking = node.parent?.effectiveThinking;
    if (node.entry.type === "thinking_level_change") {
      node.effectiveThinking =
        String(node.entry.thinkingLevel ?? "").trim() || undefined;
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1)
      stack.push(node.children[index]);
  }

  for (let index = preorder.length - 1; index >= 0; index -= 1) {
    const node = preorder[index];
    if (!node.children.length) {
      node.descendants = 0;
      node.leafCount = 1;
      node.newestLeaf = node;
    } else {
      node.descendants = node.children.reduce(
        (sum, child) => sum + child.descendants + 1,
        0,
      );
      node.leafCount = node.children.reduce(
        (sum, child) => sum + child.leafCount,
        0,
      );
      node.newestLeaf = node.children
        .map((child) => child.newestLeaf)
        .sort(
          (a, b) => b.timestampMs - a.timestampMs || b.fileIndex - a.fileIndex,
        )[0];
    }
  }

  for (const node of nodes) {
    node.kind = classifyNode(node);
    node.summary = buildNodeSummary(node, toolCallMap);
    node.searchText = buildNodeSearchText(node, toolCallMap);
  }

  for (const node of nodes) {
    const entry = node.entry;
    if (
      entry.type === "compaction" &&
      entry.firstKeptEntryId &&
      !firstById.has(String(entry.firstKeptEntryId))
    ) {
      diagnostics.push({
        severity: "warning",
        code: "missing-first-kept",
        line: node.lineNo,
        message: `Compaction ${node.id} 的 firstKeptEntryId ${entry.firstKeptEntryId} 不存在。`,
      });
    }
    if (
      entry.type === "branch_summary" &&
      entry.fromId &&
      entry.fromId !== "root" &&
      !firstById.has(String(entry.fromId))
    ) {
      diagnostics.push({
        severity: "warning",
        code: "missing-branch-from",
        line: node.lineNo,
        message: `Branch summary ${node.id} 的 fromId ${entry.fromId} 不存在。`,
      });
    }
  }

  const uidMap = new Map(nodes.map((node) => [node.uid, node]));
  const leaves = nodes.filter((node) => !node.children.length).sort(stableSort);
  const branchPoints = nodes
    .filter((node) => node.children.length > 1)
    .sort(stableSort);
  const firstUser = nodes.find((node) => isUserMessage(node.entry));
  const title =
    sessionName ||
    truncate(
      firstUser?.lastUserSummary ||
        firstUser?.summary ||
        file.name.replace(/\.jsonl$/i, ""),
      90,
    );

  let minTime = Date.parse(header.timestamp ?? "");
  let maxTime = minTime;
  if (!Number.isFinite(minTime)) minTime = Infinity;
  if (!Number.isFinite(maxTime)) maxTime = 0;
  for (const node of nodes) {
    if (!Number.isFinite(node.timestampMs)) continue;
    if (node.timestampMs < minTime) minTime = node.timestampMs;
    if (node.timestampMs > maxTime) maxTime = node.timestampMs;
  }

  const largeEntries = nodes.filter((node) => node.charLength > 250_000);
  if (largeEntries.length) {
    diagnostics.push({
      severity: "info",
      code: "large-entry",
      message: `${largeEntries.length} 条记录大于 250 KB；查看器仅在选中时渲染其完整内容。`,
    });
  }

  const notes = buildSemanticNotes(nodes, firstById);
  const notesByAnchor = new Map<string, SemanticNote[]>();
  for (const note of notes) {
    const list = notesByAnchor.get(note.anchorUid) ?? [];
    list.push(note);
    notesByAnchor.set(note.anchorUid, list);
  }
  const models = buildModelStats(nodes);
  const branchStructure = buildBranchStructure(roots, notes);
  const defaultLeaf =
    branchStructure.terminalSegments[
      branchStructure.terminalSegments.length - 1
    ]?.leaf ??
    leaves[leaves.length - 1] ??
    nodes[nodes.length - 1];

  return {
    header,
    declaredVersion,
    topologyQuality,
    records: parsed.records,
    lineCount: parsed.lineCount,
    nodes,
    uidMap,
    roots,
    preorder,
    leaves,
    branchPoints,
    defaultLeaf,
    firstById,
    idToLastNode,
    labelsById,
    labelTimestampsById,
    toolCallMap,
    toolResultByCallId,
    diagnostics,
    title,
    sessionName,
    minTime: Number.isFinite(minTime) ? minTime : 0,
    maxTime: Number.isFinite(maxTime) ? maxTime : 0,
    durationMs:
      Number.isFinite(minTime) && Number.isFinite(maxTime)
        ? Math.max(0, maxTime - minTime)
        : 0,
    notes,
    notesByAnchor,
    models,
    segments: branchStructure.segments,
    rootSegments: branchStructure.rootSegments,
    terminalSegments: branchStructure.terminalSegments,
    segmentByUid: branchStructure.segmentByUid,
    segmentByNodeUid: branchStructure.segmentByNodeUid,
    forks: branchStructure.forks,
    forkByAnchorUid: branchStructure.forkByAnchorUid,
    maxBranchLevel: branchStructure.maxBranchLevel,
    health: {
      parseErrors: diagnostics.filter((item) => item.code === "json-parse")
        .length,
      unpairedToolResults,
      toolCallsWithoutResults,
      largeEntries,
    },
  };
}

interface BranchStructure {
  segments: BranchSegment[];
  rootSegments: BranchSegment[];
  terminalSegments: BranchSegment[];
  segmentByUid: Map<string, BranchSegment>;
  segmentByNodeUid: Map<string, BranchSegment>;
  forks: BranchFork[];
  forkByAnchorUid: Map<string, BranchFork>;
  maxBranchLevel: number;
}

/**
 * Collapse the persisted parentId tree into Pi's visual branch semantics.
 * Every maximal single-child chain becomes one linear segment. Only a node with
 * multiple children creates child segments and therefore a deeper UI level.
 */
function buildBranchStructure(
  roots: SessionNode[],
  notes: SemanticNote[],
): BranchStructure {
  const segments: BranchSegment[] = [];
  const rootSegments: BranchSegment[] = [];
  const segmentByUid = new Map<string, BranchSegment>();
  const segmentByNodeUid = new Map<string, BranchSegment>();

  const createSegment = (
    start: SessionNode,
    parent: BranchSegment | null,
    forkAnchor: SessionNode | null,
    code: string,
  ): BranchSegment => {
    const linearNodes: SessionNode[] = [];
    let cursor = start;
    while (true) {
      linearNodes.push(cursor);
      if (cursor.children.length !== 1) break;
      cursor = cursor.children[0];
    }

    const segment: BranchSegment = {
      uid: `segment:${start.uid}`,
      code,
      index: segments.length,
      parent,
      children: [],
      forkAnchor,
      start,
      end: linearNodes[linearNodes.length - 1],
      nodes: linearNodes,
      level: parent ? parent.level + 1 : 0,
      order: start.fileIndex,
      terminal: cursor.children.length === 0,
      leaf: cursor.children.length === 0 ? cursor : null,
      descendantLeaves: 0,
      metrics: sumNodeMetrics(linearNodes),
      firstUserSummary: "",
      lastUserSummary: "",
      noteCount: 0,
    };

    const userSummaries = linearNodes
      .filter((node) => isUserMessage(node.entry))
      .map((node) =>
        truncate(normalizeInline(extractMessageText(node.entry.message)), 180),
      )
      .filter(Boolean);
    segment.firstUserSummary =
      userSummaries[0] || start.lastUserSummary || start.summary;
    segment.lastUserSummary =
      userSummaries[userSummaries.length - 1] || segment.firstUserSummary;

    segments.push(segment);
    segmentByUid.set(segment.uid, segment);
    if (parent) parent.children.push(segment);
    else rootSegments.push(segment);

    linearNodes.forEach((node, index) => {
      node.segment = segment;
      node.segmentUid = segment.uid;
      node.segmentIndex = index;
      node.branchLevel = segment.level;
      node.relation =
        index === 0 ? (forkAnchor ? "branch-start" : "root") : "continuation";
      segmentByNodeUid.set(node.uid, segment);
    });

    if (cursor.children.length > 1) {
      cursor.children.forEach((child, childIndex) => {
        createSegment(child, segment, cursor, `${code}.${childIndex + 1}`);
      });
    }
    return segment;
  };

  roots.forEach((root, index) => {
    const code = roots.length === 1 ? "B0" : `B${index + 1}`;
    createSegment(root, null, null, code);
  });

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    segment.descendantLeaves = segment.terminal
      ? 1
      : segment.children.reduce(
          (sum, child) => sum + child.descendantLeaves,
          0,
        );
  }

  for (const note of notes) {
    const segment = segmentByNodeUid.get(note.anchorUid);
    if (segment) segment.noteCount += 1;
  }

  const forkSegments = segments
    .filter((segment) => segment.children.length > 1)
    .sort((a, b) => a.end.fileIndex - b.end.fileIndex || a.index - b.index);
  const forks = forkSegments.map(
    (segment, index): BranchFork => ({
      uid: `fork:${segment.end.uid}`,
      code: `F${index + 1}`,
      index,
      anchor: segment.end,
      segment,
      children: segment.children,
      level: segment.level,
    }),
  );
  const forkByAnchorUid = new Map(forks.map((fork) => [fork.anchor.uid, fork]));
  const terminalSegments = segments
    .filter((segment) => segment.terminal)
    .sort(
      (a, b) =>
        (a.leaf?.fileIndex ?? a.end.fileIndex) -
        (b.leaf?.fileIndex ?? b.end.fileIndex),
    );

  return {
    segments,
    rootSegments,
    terminalSegments,
    segmentByUid,
    segmentByNodeUid,
    forks,
    forkByAnchorUid,
    maxBranchLevel: segments.reduce(
      (max, segment) => Math.max(max, segment.level),
      0,
    ),
  };
}

function breakParentCycles(
  nodes: SessionNode[],
  diagnostics: Diagnostic[],
): void {
  const state = new Map<SessionNode, 0 | 1 | 2>();
  for (const start of nodes) {
    if ((state.get(start) ?? 0) === 2) continue;
    const path: SessionNode[] = [];
    const pathIndex = new Map<SessionNode, number>();
    let cursor: SessionNode | null = start;
    while (cursor && (state.get(cursor) ?? 0) !== 2) {
      const existingIndex = pathIndex.get(cursor);
      if (existingIndex !== undefined) {
        const cycle = path.slice(existingIndex);
        const detached = cycle[cycle.length - 1];
        if (detached.parent) {
          detached.parent.children = detached.parent.children.filter(
            (child) => child !== detached,
          );
          detached.parent = null;
        }
        diagnostics.push({
          severity: "error",
          code: "parent-cycle",
          line: detached.lineNo,
          message: `检测到 parentId 环：${cycle.map((node) => node.id).join(" → ")}。已断开 ${detached.id} 的父链接。`,
        });
        break;
      }
      pathIndex.set(cursor, path.length);
      path.push(cursor);
      state.set(cursor, 1);
      cursor = cursor.parent;
    }
    for (const node of path) state.set(node, 2);
  }
}

export function emptyMetrics(): EntryMetrics {
  return {
    entries: 0,
    user: 0,
    assistant: 0,
    toolCalls: 0,
    toolResults: 0,
    bash: 0,
    compactions: 0,
    branchSummaries: 0,
    custom: 0,
    errors: 0,
    aborted: 0,
    images: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: 0,
  };
}

export function computeEntryMetrics(entry: SessionEntry): EntryMetrics {
  const metrics = emptyMetrics();
  metrics.entries = 1;
  if (entry.type === "compaction") metrics.compactions = 1;
  if (entry.type === "branch_summary") metrics.branchSummaries = 1;
  if (entry.type === "custom" || entry.type === "custom_message")
    metrics.custom = 1;
  if (entry.type !== "message") return metrics;

  const message = entry.message ?? {};
  const role = message.role;
  if (role === "user") metrics.user = 1;
  if (role === "assistant") {
    metrics.assistant = 1;
    if (message.stopReason === "aborted") metrics.aborted = 1;
    if (message.stopReason === "error" || message.errorMessage)
      metrics.errors = 1;
    const usage = isObject(message.usage) ? message.usage : {};
    metrics.input = numberOrZero(usage.input);
    metrics.output = numberOrZero(usage.output);
    metrics.cacheRead = numberOrZero(usage.cacheRead);
    metrics.cacheWrite = numberOrZero(usage.cacheWrite);
    metrics.totalTokens =
      numberOrZero(usage.totalTokens) ||
      metrics.input + metrics.output + metrics.cacheRead + metrics.cacheWrite;
    metrics.cost = numberOrZero(isObject(usage.cost) ? usage.cost.total : 0);
  }
  if (role === "toolResult") {
    metrics.toolResults = 1;
    if (message.isError) metrics.errors = 1;
  }
  if (role === "bashExecution") {
    metrics.bash = 1;
    if (message.exitCode != null && message.exitCode !== 0) metrics.errors = 1;
  }
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block?.type === "toolCall") metrics.toolCalls += 1;
      if (block?.type === "image") metrics.images += 1;
    }
  }
  return metrics;
}

export function addMetrics(
  base: EntryMetrics | null | undefined,
  delta: EntryMetrics,
): EntryMetrics {
  const result = emptyMetrics();
  for (const key of Object.keys(result) as (keyof EntryMetrics)[]) {
    result[key] = numberOrZero(base?.[key]) + numberOrZero(delta[key]);
  }
  return result;
}

export function sumNodeMetrics(nodes: SessionNode[]): EntryMetrics {
  let result = emptyMetrics();
  for (const node of nodes) result = addMetrics(result, node.delta);
  return result;
}

export function isUserMessage(entry: SessionEntry): boolean {
  return entry.type === "message" && entry.message?.role === "user";
}

export function extractMessageText(message: AgentMessage | undefined): string {
  if (!message) return "";
  if (message.role === "bashExecution") return String(message.command || "");
  return extractContentText(message.content);
}

export function extractContentText(
  content: AgentMessage["content"] | SessionEntry["content"],
  includeThinking = false,
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && block.text != null)
      parts.push(String(block.text));
    if (includeThinking && block.type === "thinking" && block.thinking != null)
      parts.push(String(block.thinking));
  }
  return parts.join("");
}

export function hasTextContent(content: AgentMessage["content"]): boolean {
  return extractContentText(content).trim().length > 0;
}

export function getToolCalls(content: AgentMessage["content"]): ContentBlock[] {
  return Array.isArray(content)
    ? content.filter((block) => block?.type === "toolCall")
    : [];
}

function classifyNode(node: SessionNode): SessionNode["kind"] {
  const entry = node.entry;
  if (entry.type === "message") {
    const role = entry.message?.role;
    if (role === "user") return "user";
    if (role === "assistant") {
      if (entry.message?.stopReason === "error" || entry.message?.errorMessage)
        return "error";
      return "assistant";
    }
    if (role === "toolResult") return entry.message?.isError ? "error" : "tool";
    if (role === "bashExecution")
      return entry.message?.exitCode && entry.message.exitCode !== 0
        ? "error"
        : "tool";
    if (role === "custom" || role === "hookMessage") return "custom";
    return "setting";
  }
  if (entry.type === "compaction") return "compaction";
  if (entry.type === "branch_summary") return "branch";
  if (entry.type === "custom_message" || entry.type === "custom")
    return "custom";
  return "setting";
}

function buildNodeSummary(
  node: SessionNode,
  toolCallMap: Map<string, ToolCallInfo>,
): string {
  const entry = node.entry;
  if (entry.type === "message") {
    const message = entry.message ?? {};
    const role = message.role;
    if (role === "user") {
      const text = normalizeInline(extractMessageText(message));
      return text || "(空用户消息)";
    }
    if (role === "assistant") {
      const text = normalizeInline(extractContentText(message.content));
      if (text) return text;
      const calls = getToolCalls(message.content);
      if (calls.length)
        return `[tools: ${calls.map((call) => call.name || "tool").join(", ")}]`;
      if (message.stopReason === "aborted") return "(aborted)";
      if (message.errorMessage) return normalizeInline(message.errorMessage);
      const thinking = normalizeInline(
        extractContentText(message.content, true),
      );
      return thinking ? `[thinking] ${thinking}` : "(no content)";
    }
    if (role === "toolResult") {
      const call = message.toolCallId
        ? toolCallMap.get(String(message.toolCallId))
        : null;
      const label = call
        ? formatToolCall(call.name, call.arguments)
        : `[${message.toolName || "tool"}]`;
      const output = normalizeInline(extractContentText(message.content));
      return output ? `${label} ${truncate(output, 150)}` : label;
    }
    if (role === "bashExecution") {
      const command = normalizeInline(message.command || "");
      return command ? `[bash] ${command}` : "[bash]";
    }
    return `[${role || "message"}] ${normalizeInline(extractMessageText(message))}`.trim();
  }
  if (entry.type === "custom_message") {
    const content = normalizeInline(extractContentText(entry.content));
    return content || `[custom message: ${entry.customType || "extension"}]`;
  }
  if (entry.type === "compaction")
    return normalizeInline(entry.summary || "Context compaction");
  if (entry.type === "branch_summary")
    return normalizeInline(entry.summary || "Branch summary");
  if (entry.type === "model_change")
    return `model → ${modelLabel(String(entry.provider || ""), String(entry.modelId || ""))}`;
  if (entry.type === "thinking_level_change")
    return `thinking → ${entry.thinkingLevel || "default"}`;
  if (entry.type === "label")
    return entry.label
      ? `label “${entry.label}” → ${entry.targetId || "?"}`
      : `clear label → ${entry.targetId || "?"}`;
  if (entry.type === "session_info")
    return entry.name ? `rename → ${entry.name}` : "clear session name";
  if (entry.type === "custom")
    return `[custom: ${entry.customType || "extension"}]`;
  return `[${entry.type || "unknown"}]`;
}

function buildNodeSearchText(
  node: SessionNode,
  toolCallMap: Map<string, ToolCallInfo>,
): string {
  const entry = node.entry;
  const parts = [
    node.id,
    node.uid,
    entry.type,
    node.summary,
    node.label || "",
    entry.timestamp || "",
  ];
  if (entry.type === "message") {
    const message = entry.message ?? {};
    parts.push(
      message.role || "",
      message.provider || "",
      message.model || "",
      message.stopReason || "",
      message.errorMessage || "",
    );
    for (const call of getToolCalls(message.content)) {
      parts.push(call.name || "", safeCompactJson(call.arguments));
    }
    if (message.role === "toolResult" && message.toolCallId) {
      const call = toolCallMap.get(String(message.toolCallId));
      if (call) parts.push(call.name, safeCompactJson(call.arguments));
    }
  } else {
    parts.push(safeCompactJson(entry));
  }
  return parts.join(" ").toLowerCase();
}

function formatToolCall(name: string, args: JsonObject): string {
  if (name === "bash" && typeof args.command === "string")
    return `[bash: ${truncate(normalizeInline(args.command), 80)}]`;
  const path =
    typeof args.path === "string"
      ? args.path
      : typeof args.file_path === "string"
        ? args.file_path
        : "";
  if (path) return `[${name}: ${truncate(path, 80)}]`;
  return `[${name}]`;
}

function safeCompactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createModelRef(
  providerValue: unknown,
  modelValue: unknown,
): ModelRef | null {
  const provider = String(providerValue ?? "").trim();
  const modelId = String(modelValue ?? "").trim();
  if (!provider && !modelId) return null;
  const key = `${provider}\u0000${modelId}`;
  return { provider, modelId, key, label: modelLabel(provider, modelId) };
}

function actualModelForNode(
  node: SessionNode,
  inherited: ModelRef | null,
): ModelRef | null {
  if (
    node.entry.type === "message" &&
    node.entry.message?.role === "assistant"
  ) {
    return (
      createModelRef(node.entry.message.provider, node.entry.message.model) ??
      inherited
    );
  }
  return inherited;
}

function buildSemanticNotes(
  nodes: SessionNode[],
  firstById: Map<string, SessionNode>,
): SemanticNote[] {
  const notes: SemanticNote[] = [];
  for (const node of nodes) {
    const entry = node.entry;
    if (entry.type === "message" && entry.message?.role === "user") {
      const text = normalizeInline(extractContentText(entry.message.content));
      notes.push({
        id: `user:${node.uid}`,
        type: "user",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: "用户输入",
        detail: truncate(text || node.summary, 280),
        shortLabel: truncate(text || node.summary, 48),
      });
    }
    if (entry.type === "session_info") {
      const previous = node.parent?.effectiveSessionName;
      const next = String(entry.name ?? "").trim();
      notes.push({
        id: `rename:${node.uid}`,
        type: "rename",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: next ? `会话重命名：${next}` : "清除会话名称",
        detail: next
          ? `${previous || "未命名"} → ${next}`
          : `${previous || "未命名"} → 未命名`,
        shortLabel: next || "未命名",
        isRemoval: !next,
        data: { previous, next },
      });
    }
    if (entry.type === "label" && entry.targetId != null) {
      const target = firstById.get(String(entry.targetId));
      const label = String(entry.label ?? "").trim();
      notes.push({
        id: `label:${node.uid}`,
        type: "label",
        eventUid: node.uid,
        anchorUid: target?.uid ?? node.uid,
        targetUid: target?.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: label ? `标签：${label}` : "清除标签",
        detail: target
          ? `标注 entry ${target.id}`
          : `目标 ${entry.targetId} 不存在`,
        shortLabel: label || "清除标签",
        isRemoval: !label,
        data: { targetId: entry.targetId, label },
      });
    }
    if (entry.type === "model_change") {
      const previous = node.parent?.effectiveModel;
      const next = node.effectiveModel;
      const repeated = previous?.key === next?.key;
      notes.push({
        id: `model:${node.uid}`,
        type: "model",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: repeated
          ? `模型确认：${next?.label || "unknown"}`
          : `模型切换：${next?.label || "unknown"}`,
        detail: repeated
          ? "与上一个有效模型相同"
          : `${previous?.label || "未设置"} → ${next?.label || "未设置"}`,
        shortLabel: next?.modelId || next?.label || "unknown",
        data: { previous: previous?.label, next: next?.label, repeated },
      });
    }
    if (entry.type === "thinking_level_change") {
      const previous = node.parent?.effectiveThinking;
      const next = node.effectiveThinking;
      notes.push({
        id: `thinking:${node.uid}`,
        type: "thinking",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: `思考级别：${next || "default"}`,
        detail: `${previous || "default"} → ${next || "default"}`,
        shortLabel: next || "default",
        data: { previous, next },
      });
    }
    if (entry.type === "compaction") {
      notes.push({
        id: `compaction:${node.uid}`,
        type: "compaction",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: `上下文压缩${entry.tokensBefore ? ` · ${Math.round(entry.tokensBefore / 1000)}k tokens` : ""}`,
        detail:
          truncate(normalizeInline(entry.summary || ""), 220) ||
          "Compaction summary",
        shortLabel: "Compaction",
        data: {
          firstKeptEntryId: entry.firstKeptEntryId,
          tokensBefore: entry.tokensBefore,
        },
      });
    }
    const errorDetail = errorNoteForNode(node);
    if (errorDetail) {
      notes.push({
        id: `error:${node.uid}`,
        type: "error",
        eventUid: node.uid,
        anchorUid: node.uid,
        timestampMs: node.timestampMs,
        lineNo: node.lineNo,
        title: errorDetail.title,
        detail: errorDetail.detail,
        shortLabel: errorDetail.shortLabel,
      });
    }
  }
  for (const node of nodes) {
    if (node.entry.type !== "message" || node.entry.message?.role !== "user")
      continue;
    const reply = findLastAssistantAfterUser(node);
    if (!reply) continue;
    const text = normalizeInline(
      extractContentText(reply.entry.message?.content, true),
    );
    notes.push({
      id: `assistant_reply:${node.uid}`,
      type: "assistant_reply",
      eventUid: reply.uid,
      anchorUid: reply.uid,
      targetUid: node.uid,
      timestampMs: reply.timestampMs,
      lineNo: reply.lineNo,
      title: "AI 末条回复",
      detail: truncate(text || reply.summary, 280),
      shortLabel: truncate(text || reply.summary, 48),
      data: { userUid: node.uid, userSequence: node.sequence },
    });
  }

  return notes.sort(
    (a, b) => a.timestampMs - b.timestampMs || a.lineNo - b.lineNo,
  );
}

/** Last assistant message with text in the turn that starts at `user` (stops at the next user). */
function findLastAssistantAfterUser(user: SessionNode): SessionNode | null {
  let last: SessionNode | null = null;
  const queue: SessionNode[] = [...user.children];
  const seen = new Set<string>();
  while (queue.length) {
    const cursor = queue.shift()!;
    if (seen.has(cursor.uid)) continue;
    seen.add(cursor.uid);
    if (
      cursor.uid !== user.uid &&
      cursor.entry.type === "message" &&
      cursor.entry.message?.role === "user"
    ) {
      continue;
    }
    if (
      cursor.entry.type === "message" &&
      cursor.entry.message?.role === "assistant"
    ) {
      const message = cursor.entry.message;
      if (
        hasTextContent(message?.content) ||
        message?.errorMessage ||
        message?.stopReason === "aborted"
      ) {
        if (!last || cursor.sequence > last.sequence) last = cursor;
      }
    }
    for (const child of cursor.children) {
      if (
        child.entry.type === "message" &&
        child.entry.message?.role === "user"
      )
        continue;
      queue.push(child);
    }
  }
  return last;
}

function errorNoteForNode(
  node: SessionNode,
): { title: string; detail: string; shortLabel: string } | null {
  if (node.entry.type !== "message") return null;
  const message = node.entry.message ?? {};
  if (message.role === "assistant" && message.stopReason === "aborted") {
    return {
      title: "Assistant aborted",
      detail: node.summary,
      shortLabel: "aborted",
    };
  }
  if (
    message.role === "assistant" &&
    (message.stopReason === "error" || message.errorMessage)
  ) {
    return {
      title: "Assistant error",
      detail: normalizeInline(message.errorMessage || node.summary),
      shortLabel: "error",
    };
  }
  if (message.role === "toolResult" && message.isError) {
    return {
      title: `Tool error · ${message.toolName || "tool"}`,
      detail: node.summary,
      shortLabel: message.toolName || "tool",
    };
  }
  if (
    message.role === "bashExecution" &&
    message.exitCode != null &&
    message.exitCode !== 0
  ) {
    return {
      title: `Bash exit ${message.exitCode}`,
      detail: node.summary,
      shortLabel: `exit ${message.exitCode}`,
    };
  }
  return null;
}

function buildModelStats(nodes: SessionNode[]): ModelStat[] {
  const stats = new Map<string, ModelStat>();
  for (const node of nodes) {
    const model = node.actualModel ?? node.effectiveModel;
    if (!model) continue;
    const item = stats.get(model.key) ?? {
      model,
      entries: 0,
      assistants: 0,
      users: 0,
    };
    item.entries += 1;
    if (
      node.entry.type === "message" &&
      node.entry.message?.role === "assistant"
    )
      item.assistants += 1;
    if (node.entry.type === "message" && node.entry.message?.role === "user")
      item.users += 1;
    stats.set(model.key, item);
  }
  return [...stats.values()].sort(
    (a, b) =>
      b.assistants - a.assistants ||
      b.entries - a.entries ||
      a.model.label.localeCompare(b.model.label),
  );
}
