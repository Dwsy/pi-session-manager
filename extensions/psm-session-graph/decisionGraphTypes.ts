import type {
  PluginRecord,
  PsmSessionJsonlEntry,
} from '@pi-session-manager/plugin-sdk'

export const DECISION_GRAPH_PLUGIN_ID = 'builtin.session-graph'
export const DECISION_GRAPH_RECORD_TYPE = 'session.decision_graph'
export const DECISION_GRAPH_SCHEMA_VERSION = 1

export type DecisionGraphNodeKind =
  | 'decision'
  | 'checkpoint'
  | 'outcome'
  | 'open_question'

export type DecisionGraphNodeStatus =
  | 'active'
  | 'superseded'
  | 'resolved'
  | 'open'

export type DecisionGraphEdgeKind =
  | 'leads_to'
  | 'depends_on'
  | 'supersedes'
  | 'resolves'

export interface DecisionGraphSource {
  entryCount: number
  lastEntryId: string | null
}

export interface DecisionGraphNode {
  id: string
  kind: DecisionGraphNodeKind
  title: string
  summary: string
  anchorEntryId: string
  evidenceEntryIds: string[]
  status?: DecisionGraphNodeStatus
}

export interface DecisionGraphEdge {
  from: string
  to: string
  kind: DecisionGraphEdgeKind
}

export interface DecisionGraphPayload {
  schemaVersion: 1
  generatedAt: string
  source: DecisionGraphSource
  nodes: DecisionGraphNode[]
  edges: DecisionGraphEdge[]
}

const NODE_KINDS: Record<DecisionGraphNodeKind, true> = {
  decision: true,
  checkpoint: true,
  outcome: true,
  open_question: true,
}

const NODE_STATUSES: Record<DecisionGraphNodeStatus, true> = {
  active: true,
  superseded: true,
  resolved: true,
  open: true,
}

const EDGE_KINDS: Record<DecisionGraphEdgeKind, true> = {
  leads_to: true,
  depends_on: true,
  supersedes: true,
  resolves: true,
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Decision graph ${field} must be a non-empty string`)
  }
  return value.trim()
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Decision graph ${field} must be an array`)
  }
  return value.map((item, index) => requiredString(item, `${field}[${index}]`))
}

export function decisionGraphSource(entries: PsmSessionJsonlEntry[]): DecisionGraphSource {
  return {
    entryCount: entries.length,
    lastEntryId: entries.length > 0 ? entries[entries.length - 1]?.id ?? null : null,
  }
}

export function isDecisionGraphFresh(
  payload: DecisionGraphPayload,
  entries: PsmSessionJsonlEntry[],
): boolean {
  const current = decisionGraphSource(entries)
  return payload.source.entryCount === current.entryCount
    && payload.source.lastEntryId === current.lastEntryId
}

export function parseDecisionGraphPayload(
  value: unknown,
  entries?: PsmSessionJsonlEntry[],
): DecisionGraphPayload {
  const input = asObject(value)
  if (!input) throw new Error('Decision graph payload must be an object')
  if (input.schemaVersion !== DECISION_GRAPH_SCHEMA_VERSION) {
    throw new Error(`Unsupported decision graph schema version: ${String(input.schemaVersion)}`)
  }

  const generatedAt = requiredString(input.generatedAt, 'generatedAt')
  const sourceObject = asObject(input.source)
  if (!sourceObject) throw new Error('Decision graph source must be an object')
  const entryCount = sourceObject.entryCount
  if (!Number.isInteger(entryCount) || Number(entryCount) < 0) {
    throw new Error('Decision graph source.entryCount must be a non-negative integer')
  }
  const lastEntryId = sourceObject.lastEntryId
  if (lastEntryId !== null && typeof lastEntryId !== 'string') {
    throw new Error('Decision graph source.lastEntryId must be a string or null')
  }

  if (!Array.isArray(input.nodes)) throw new Error('Decision graph nodes must be an array')
  if (!Array.isArray(input.edges)) throw new Error('Decision graph edges must be an array')

  const validEntryIds = entries ? new Set(entries.map((entry) => entry.id)) : null
  const seenNodeIds = new Set<string>()
  const nodes = input.nodes.map((value, index): DecisionGraphNode => {
    const node = asObject(value)
    if (!node) throw new Error(`Decision graph nodes[${index}] must be an object`)

    const id = requiredString(node.id, `nodes[${index}].id`)
    if (seenNodeIds.has(id)) throw new Error(`Duplicate decision graph node id: ${id}`)
    seenNodeIds.add(id)

    const kind = requiredString(node.kind, `nodes[${index}].kind`) as DecisionGraphNodeKind
    if (!NODE_KINDS[kind]) throw new Error(`Unsupported decision graph node kind: ${kind}`)

    const statusValue = node.status
    const status = statusValue === undefined
      ? undefined
      : requiredString(statusValue, `nodes[${index}].status`) as DecisionGraphNodeStatus
    if (status && !NODE_STATUSES[status]) {
      throw new Error(`Unsupported decision graph node status: ${status}`)
    }

    const anchorEntryId = requiredString(node.anchorEntryId, `nodes[${index}].anchorEntryId`)
    const evidenceEntryIds = stringArray(node.evidenceEntryIds ?? [], `nodes[${index}].evidenceEntryIds`)

    if (validEntryIds) {
      if (!validEntryIds.has(anchorEntryId)) {
        throw new Error(`Unknown decision graph anchor entry: ${anchorEntryId}`)
      }
      for (const evidenceEntryId of evidenceEntryIds) {
        if (!validEntryIds.has(evidenceEntryId)) {
          throw new Error(`Unknown decision graph evidence entry: ${evidenceEntryId}`)
        }
      }
    }

    return {
      id,
      kind,
      title: requiredString(node.title, `nodes[${index}].title`),
      summary: requiredString(node.summary, `nodes[${index}].summary`),
      anchorEntryId,
      evidenceEntryIds: [...new Set(evidenceEntryIds)],
      ...(status ? { status } : {}),
    }
  })

  const edges = input.edges.map((value, index): DecisionGraphEdge => {
    const edge = asObject(value)
    if (!edge) throw new Error(`Decision graph edges[${index}] must be an object`)
    const from = requiredString(edge.from, `edges[${index}].from`)
    const to = requiredString(edge.to, `edges[${index}].to`)
    const kind = requiredString(edge.kind, `edges[${index}].kind`) as DecisionGraphEdgeKind
    if (!EDGE_KINDS[kind]) throw new Error(`Unsupported decision graph edge kind: ${kind}`)
    if (!seenNodeIds.has(from) || !seenNodeIds.has(to)) {
      throw new Error(`Decision graph edge references an unknown node: ${from} -> ${to}`)
    }
    return { from, to, kind }
  })

  return {
    schemaVersion: DECISION_GRAPH_SCHEMA_VERSION,
    generatedAt,
    source: {
      entryCount: Number(entryCount),
      lastEntryId: lastEntryId as string | null,
    },
    nodes,
    edges,
  }
}

export function decisionGraphPayloadFromRecord(
  record: PluginRecord | null | undefined,
  entries?: PsmSessionJsonlEntry[],
): DecisionGraphPayload | null {
  if (!record) return null
  if (record.record_type !== DECISION_GRAPH_RECORD_TYPE) return null
  return parseDecisionGraphPayload(record.payload, entries)
}
