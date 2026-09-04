import type { PsmCapabilityClient } from '@pi-session-manager/plugin-sdk'

const SUBAGENT_STATE_SUFFIX = '.subagents.jsonl'
const READ_CHUNK_BYTES = 256 * 1024

export interface GrokPiTeamAgent {
  agentPath: string
  parentAgentPath: string
  team?: string
  description: string
  type: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  childSessionFile: string
  agentSessionId: string
}

interface PersistedTeamRecord extends GrokPiTeamAgent {
  version: 1
  id: string
}

function persistedTeamRecord(value: unknown): PersistedTeamRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (
    item.version !== 1 ||
    typeof item.id !== 'string' ||
    typeof item.agentPath !== 'string' ||
    typeof item.parentAgentPath !== 'string' ||
    typeof item.description !== 'string' ||
    typeof item.type !== 'string' ||
    typeof item.startedAt !== 'number' ||
    typeof item.childSessionFile !== 'string' ||
    typeof item.agentSessionId !== 'string' ||
    !['running', 'completed', 'failed', 'cancelled'].includes(String(item.status)) ||
    (item.team !== undefined && typeof item.team !== 'string')
  ) return undefined
  return item as unknown as PersistedTeamRecord
}

export function parseTeamSidecar(content: string): PersistedTeamRecord[] {
  const latestByRun = new Map<string, PersistedTeamRecord>()
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      const record = persistedTeamRecord(JSON.parse(line))
      if (record) latestByRun.set(record.id, record)
    } catch {
      // A truncated/malformed line must not hide the rest of a usable sidecar.
    }
  }
  return [...latestByRun.values()]
}

async function readWholeSessionFile(client: PsmCapabilityClient, path: string): Promise<string> {
  let offset = 0
  let content = ''
  for (;;) {
    const chunk = await client.sessions.readFileChunk(path, { offset, maxBytes: READ_CHUNK_BYTES })
    content += chunk.content
    if (!chunk.has_more || chunk.next_offset <= offset) return content
    offset = chunk.next_offset
  }
}

export async function loadGrokPiTeam(client: PsmCapabilityClient, rootSessionPath: string): Promise<GrokPiTeamAgent[]> {
  const visited = new Set<string>()
  const latestByPath = new Map<string, PersistedTeamRecord>()

  async function visit(sessionPath: string): Promise<void> {
    const sidecar = `${sessionPath}${SUBAGENT_STATE_SUFFIX}`
    if (visited.has(sidecar)) return
    visited.add(sidecar)

    let records: PersistedTeamRecord[]
    try {
      records = parseTeamSidecar(await readWholeSessionFile(client, sidecar))
    } catch {
      return
    }

    for (const record of records) {
      const previous = latestByPath.get(record.agentPath)
      if (!previous || record.startedAt >= previous.startedAt) latestByPath.set(record.agentPath, record)
    }
    await Promise.all(records.map((record) => visit(record.childSessionFile)))
  }

  await visit(rootSessionPath)
  return [...latestByPath.values()].sort((left, right) =>
    left.startedAt - right.startedAt
      || left.agentPath.localeCompare(right.agentPath, undefined, { numeric: true }),
  )
}

export interface GrokPiTeamTreeNode extends GrokPiTeamAgent {
  children: GrokPiTeamTreeNode[]
}

export function buildGrokPiTeamTree(agents: GrokPiTeamAgent[]): GrokPiTeamTreeNode[] {
  const nodes = new Map<string, GrokPiTeamTreeNode>()
  for (const agent of agents) nodes.set(agent.agentPath, { ...agent, children: [] })

  const roots: GrokPiTeamTreeNode[] = []
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentAgentPath)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (items: GrokPiTeamTreeNode[]) => {
    items.sort((a, b) =>
      a.startedAt - b.startedAt
        || a.agentPath.localeCompare(b.agentPath, undefined, { numeric: true }),
    )
    for (const item of items) sort(item.children)
  }
  sort(roots)
  return roots
}
