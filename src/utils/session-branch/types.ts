export type JsonObject = Record<string, unknown>;

export interface SessionHeader extends JsonObject {
  type: "session";
  version?: number;
  id?: string;
  timestamp?: string;
  cwd?: string;
  parentSession?: string;
}

export interface SessionEntryBase extends JsonObject {
  type: string;
  id: string;
  parentId?: string | null;
  timestamp?: string;
}

export interface ContentBlock extends JsonObject {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: JsonObject;
  data?: string;
  mimeType?: string;
}

export interface AgentMessage extends JsonObject {
  role?: string;
  content?: string | ContentBlock[];
  provider?: string;
  model?: string;
  usage?: JsonObject;
  stopReason?: string;
  errorMessage?: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  command?: string;
  exitCode?: number;
}

export interface MessageEntry extends SessionEntryBase {
  type: "message";
  message: AgentMessage;
}

export type SessionEntry = SessionEntryBase & {
  message?: AgentMessage;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  fromId?: string;
  customType?: string;
  content?: string | ContentBlock[];
  display?: boolean;
  targetId?: string;
  label?: string;
  name?: string;
};

export interface RawRecord {
  value: JsonObject;
  lineNo: number;
  charLength: number;
}

export interface ParsedJsonl {
  records: RawRecord[];
  diagnostics: Diagnostic[];
  lineCount: number;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  line?: number;
}

export interface EntryMetrics {
  entries: number;
  user: number;
  assistant: number;
  toolCalls: number;
  toolResults: number;
  bash: number;
  compactions: number;
  branchSummaries: number;
  custom: number;
  errors: number;
  aborted: number;
  images: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

export type NodeKind =
  | "user"
  | "assistant"
  | "tool"
  | "error"
  | "compaction"
  | "branch"
  | "custom"
  | "setting";

export interface ModelRef {
  provider: string;
  modelId: string;
  key: string;
  label: string;
}

/**
 * Storage relationship. Pi writes every new entry with parentId = current leaf.
 * That link forms the path history, but it is not the visual hierarchy used by
 * the TUI. Visual hierarchy is represented by BranchSegment below.
 */
export type EntryRelation = "root" | "continuation" | "branch-start";

export interface SessionNode {
  uid: string;
  id: string;
  entry: SessionEntry;
  lineNo: number;
  charLength: number;
  fileIndex: number;
  timestampMs: number;
  parent: SessionNode | null;
  children: SessionNode[];
  label?: string;
  labelTimestamp?: string;
  /** Position in the persisted parentId path; this is sequence, not UI nesting. */
  depth: number;
  sequence: number;
  descendants: number;
  leafCount: number;
  newestLeaf: SessionNode;
  lastUserSummary: string;
  kind: NodeKind;
  summary: string;
  searchText: string;
  delta: EntryMetrics;
  cum: EntryMetrics;
  effectiveModel: ModelRef | null;
  actualModel: ModelRef | null;
  effectiveSessionName?: string;
  effectiveThinking?: string;
  /** Maximal single-child run containing this entry. Filled after tree indexing. */
  segment: BranchSegment | null;
  segmentUid: string;
  segmentIndex: number;
  branchLevel: number;
  relation: EntryRelation;
}

/**
 * A maximal linear run. Entries in one segment are peers in the visual outline.
 * A new level is created only after a node has multiple children (a real fork).
 */
export interface BranchSegment {
  uid: string;
  code: string;
  index: number;
  parent: BranchSegment | null;
  children: BranchSegment[];
  forkAnchor: SessionNode | null;
  start: SessionNode;
  end: SessionNode;
  nodes: SessionNode[];
  level: number;
  order: number;
  terminal: boolean;
  leaf: SessionNode | null;
  descendantLeaves: number;
  metrics: EntryMetrics;
  firstUserSummary: string;
  lastUserSummary: string;
  noteCount: number;
}

export interface BranchFork {
  uid: string;
  code: string;
  index: number;
  anchor: SessionNode;
  segment: BranchSegment;
  children: BranchSegment[];
  level: number;
}

export interface ToolCallInfo {
  name: string;
  arguments: JsonObject;
  node: SessionNode;
  block: ContentBlock;
}

export type SemanticNoteType =
  | "rename"
  | "label"
  | "model"
  | "thinking"
  | "compaction"
  | "error"
  | "user"
  | "assistant_reply";

export interface SemanticNote {
  id: string;
  type: SemanticNoteType;
  eventUid: string;
  anchorUid: string;
  targetUid?: string;
  timestampMs: number;
  lineNo: number;
  title: string;
  detail: string;
  shortLabel: string;
  isRemoval?: boolean;
  data?: JsonObject;
}

export interface ModelStat {
  model: ModelRef;
  entries: number;
  assistants: number;
  users: number;
}

export type BranchTopologyQuality = "full" | "inferred" | "unknown";

export interface SessionModel {
  header: SessionHeader;
  declaredVersion: number;
  topologyQuality: BranchTopologyQuality;
  records: RawRecord[];
  lineCount: number;
  nodes: SessionNode[];
  uidMap: Map<string, SessionNode>;
  roots: SessionNode[];
  preorder: SessionNode[];
  leaves: SessionNode[];
  branchPoints: SessionNode[];
  defaultLeaf: SessionNode;
  firstById: Map<string, SessionNode>;
  idToLastNode: Map<string, SessionNode>;
  labelsById: Map<string, string>;
  labelTimestampsById: Map<string, string>;
  toolCallMap: Map<string, ToolCallInfo>;
  toolResultByCallId: Map<string, SessionNode[]>;
  diagnostics: Diagnostic[];
  title: string;
  sessionName?: string;
  minTime: number;
  maxTime: number;
  durationMs: number;
  notes: SemanticNote[];
  notesByAnchor: Map<string, SemanticNote[]>;
  models: ModelStat[];
  segments: BranchSegment[];
  rootSegments: BranchSegment[];
  terminalSegments: BranchSegment[];
  segmentByUid: Map<string, BranchSegment>;
  segmentByNodeUid: Map<string, BranchSegment>;
  forks: BranchFork[];
  forkByAnchorUid: Map<string, BranchFork>;
  maxBranchLevel: number;
  health: {
    parseErrors: number;
    unpairedToolResults: number;
    toolCallsWithoutResults: number;
    largeEntries: SessionNode[];
  };
}

export interface FileMeta {
  name: string;
  size: number;
  lastModified: number;
}

export type TreeFilter =
  | "default"
  | "no-tools"
  | "user-only"
  | "labeled-only"
  | "all";
export type TimelineMode = "conversation" | "context" | "full" | "errors";
export type TopologyAxis = "sequence" | "time";
export type TopologyScope = "structure" | "user" | "conversation" | "all";

export interface GlobalMapSettings {
  scope: TopologyScope;
  axis: TopologyAxis;
  /** Collapse adjacent model notes + scale-aware fork/annotation spacing on the map. */
  smartMapLayout: boolean;
  enabledNotes: Record<SemanticNoteType, boolean>;
  selectedModels: string[];
  showBridgeCounts: boolean;
  showSegmentLabels: boolean;
  showForkLabels: boolean;
}
