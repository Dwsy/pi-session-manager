import type {
  PsmCapabilityClient,
  PsmSessionJsonlEntry,
} from '@pi-session-manager/plugin-sdk'

import { buildDecisionGraphContext } from './decisionGraphContext'
import {
  DECISION_GRAPH_PLUGIN_ID,
  DECISION_GRAPH_RECORD_TYPE,
  DECISION_GRAPH_SCHEMA_VERSION,
  decisionGraphSource,
  parseDecisionGraphPayload,
  type DecisionGraphPayload,
} from './decisionGraphTypes'

const DECISION_GRAPH_PROMPT = `You analyze an AI coding session and extract only high-signal decisions from supplied evidence.

Reason carefully before producing the result, but keep that reasoning private. Do not output analysis, candidate lists, confidence notes, or chain-of-thought. The only visible output is the final JSON object.

Return exactly one JSON object with this shape:
{
  "nodes": [
    {
      "id": "short-unique-id",
      "kind": "decision | checkpoint | outcome | open_question",
      "title": "short title",
      "summary": "one concise explanation of what happened and why it matters",
      "anchorEntryId": "an ENTRY id supplied in the input",
      "evidenceEntryIds": ["zero or more supplied ENTRY ids"],
      "status": "active | superseded | resolved | open"
    }
  ],
  "edges": [
    {
      "from": "node id",
      "to": "node id",
      "kind": "leads_to | depends_on | supersedes | resolves"
    }
  ]
}

Rules:
- Prefer fewer, higher-signal nodes. Ordinary implementation steps are not decisions.
- Apply an evidence gate before emitting every node: identify the claim, locate the strongest supplied ENTRY that directly supports it, and discard the node when the evidence is only implied or speculative.
- A decision is a meaningful choice or commitment between directions. Anchor it where the choice or commitment is stated, not where implementation merely follows it.
- A checkpoint is a material change in goal, constraint, or execution direction. Require explicit evidence of the change.
- An outcome closes or materially updates an earlier decision. Tool calls alone do not prove outcomes; require a result, assistant conclusion, or user confirmation.
- An open_question can change future work and is not yet resolved. Do not emit it if later supplied evidence answers it.
- Never invent an entry id. anchorEntryId and evidenceEntryIds MUST come from ENTRY ids in the supplied context.
- Use anchorEntryId for the strongest single source. Use evidenceEntryIds only for additional entries that materially support the rationale, constraint, alternative, or consequence; keep this list minimal.
- Summaries should state the decision/change/result and why it mattered, but only include rationale or consequences supported by supplied entries.
- Preserve chronology and causality. Chronological proximity alone is not proof of causality. Add an edge only when the supplied evidence supports that relation.
- Mark superseded decisions instead of deleting their history.
- Use status only when it adds information. Use "open" for unresolved open_question nodes.
- If the evidence is insufficient for any high-signal node, return {"nodes":[],"edges":[]}.
- Respond with JSON only. No markdown fences or explanation.`

interface RawDecisionGraphResponse {
  nodes?: unknown
  edges?: unknown
}

export interface RefreshDecisionGraphParams {
  path: string
  entries: PsmSessionJsonlEntry[]
}

export interface RefreshDecisionGraphHandlers {
  onDelta?: (delta: string) => void
  onDone?: (payload: DecisionGraphPayload) => void
  onError?: (error: string) => void
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const start = trimmed.indexOf('\n')
    if (start >= 0) {
      const afterFence = trimmed.slice(start + 1)
      const end = afterFence.lastIndexOf('```')
      return (end >= 0 ? afterFence.slice(0, end) : afterFence).trim()
    }
  }
  if (trimmed.startsWith('{')) return trimmed
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Decision graph response did not contain a JSON object')
  }
  return trimmed.slice(start, end + 1)
}

export function parseDecisionGraphResponse(
  text: string,
  entries: PsmSessionJsonlEntry[],
  generatedAt = new Date().toISOString(),
): DecisionGraphPayload {
  const parsed = JSON.parse(extractJsonPayload(text)) as RawDecisionGraphResponse
  return parseDecisionGraphPayload(
    {
      schemaVersion: DECISION_GRAPH_SCHEMA_VERSION,
      generatedAt,
      source: decisionGraphSource(entries),
      nodes: parsed.nodes ?? [],
      edges: parsed.edges ?? [],
    },
    entries,
  )
}

export async function refreshDecisionGraphWithAgent(
  client: PsmCapabilityClient,
  params: RefreshDecisionGraphParams,
  handlers?: RefreshDecisionGraphHandlers,
): Promise<DecisionGraphPayload> {
  const session = await client.agent.createSession({
    purpose: 'session-decision-map',
    systemPrompt: DECISION_GRAPH_PROMPT,
    model: 'host-default',
    thinkingLevel: 'high',
    tools: [],
    storage: { scope: 'memory' },
  })

  try {
    const result = await client.agent.runStream(
      {
        sessionId: session.sessionId,
        prompt: buildDecisionGraphContext(params.entries),
      },
      {
        onDelta: handlers?.onDelta,
      },
    )

    const payload = parseDecisionGraphResponse(result.text, params.entries)
    await client.records.upsert({
      id: `${DECISION_GRAPH_PLUGIN_ID}:${params.path}`,
      pluginId: DECISION_GRAPH_PLUGIN_ID,
      scopeType: 'session',
      scopeId: params.path,
      recordType: DECISION_GRAPH_RECORD_TYPE,
      schemaVersion: DECISION_GRAPH_SCHEMA_VERSION,
      payload,
      searchableText: payload.nodes
        .flatMap((node) => [node.title, node.summary])
        .join(' '),
    })
    handlers?.onDone?.(payload)
    return payload
  } catch (error) {
    handlers?.onError?.(error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    await client.agent.dispose(session.sessionId).catch(() => undefined)
  }
}
