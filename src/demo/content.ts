import type { FavoriteItem, SessionEntry, SessionInfo, SessionTag, Tag } from '../types'

import {
  DEMO_FAVORITES,
  DEMO_SESSION_SEEDS,
  DEMO_SESSION_TAGS,
  DEMO_TAGS,
  TOKEN_RATES,
  type DemoSessionSeed,
} from './seed'

export interface DemoStoreSeedData {
  sessions: SessionInfo[]
  favorites: FavoriteItem[]
  tags: Tag[]
  sessionTags: SessionTag[]
  entriesByPath: Map<string, SessionEntry[]>
  sizeBytesByPath: Map<string, number>
  seedByPath: Map<string, DemoSessionSeed>
  nextUserTagId: number
}

type DemoToolResultMessage = NonNullable<SessionEntry['message']>
type DemoToolResultContentItem = DemoToolResultMessage['content'][number]

const DEMO_READ_PREVIEW_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP8z8DwnwEIAQH/t7tM2QAAAABJRU5ErkJggg=='

const DEMO_EDIT_DIFF = [
  '  18 export default function ToolCallList({ toolCalls, toolResultByCallId }: ToolCallListProps) {',
  '  19   return (',
  '- 20     <div className="tool-call-list compact">',
  '+ 20     <div className="tool-call-list">',
  '  21       {toolCalls.map((toolCall, index) => {',
  '  22         const name = toolCall.name || "unknown"',
  '  23         const args = toolCall.arguments || {}',
  '+ 24         const normalizedArgs = normalizeToolArgs(args)',
  '  25         switch (name) {',
  '  26           // ...',
  '  27         }',
  '  28       })}',
  '  29     </div>',
  '  30   )',
  '  31 }',
].join('\n')

function toIsoWithOffset(baseIso: string, minuteOffset: number): string {
  const base = new Date(baseIso).getTime()
  return new Date(base + minuteOffset * 60_000).toISOString()
}

function cloneTag(tag: Tag): Tag {
  return {
    ...tag,
  }
}

function cloneSessionTag(st: SessionTag): SessionTag {
  return {
    ...st,
  }
}

function cloneFavorite(favorite: FavoriteItem): FavoriteItem {
  return {
    ...favorite,
  }
}

export function estimateCost(seed: DemoSessionSeed): number {
  const rates = TOKEN_RATES[seed.model] || TOKEN_RATES.default
  return (seed.tokenUsage.input / 1_000_000) * rates.input + (seed.tokenUsage.output / 1_000_000) * rates.output
}

export function buildSessionInfo(seed: DemoSessionSeed): SessionInfo {
  const searchableText = [
    seed.firstMessage,
    seed.lastMessage,
    seed.assistantSummary,
    seed.toolName,
    seed.toolOutput,
    seed.keywords.join(' '),
  ]

  return {
    id: seed.id,
    path: seed.path,
    cwd: seed.cwd,
    name: seed.name,
    created: seed.created,
    modified: seed.modified,
    message_count: seed.messageCount,
    first_message: seed.firstMessage,
    last_message: seed.lastMessage,
    last_message_role: 'assistant',
    all_messages_text: searchableText.join(' '),
    user_messages_text: `${seed.firstMessage} ${seed.keywords.join(' ')}`,
    assistant_messages_text: `${seed.assistantSummary} ${seed.lastMessage}`,
  }
}

function buildSubagentToolResult(seed: DemoSessionSeed): SessionEntry | null {
  if (!seed.subagent) {
    return null
  }

  const usageInput = Math.floor(seed.subagent.tokens * 0.55)
  const usageOutput = Math.floor(seed.subagent.tokens * 0.45)

  return {
    type: 'message',
    id: `${seed.id}-tool-result-subagent`,
    parentId: `${seed.id}-assistant-2`,
    timestamp: toIsoWithOffset(seed.created, 12),
    message: {
      role: 'toolResult',
      toolCallId: `${seed.id}-tool-subagent`,
      content: [
        {
          type: 'text',
          text: `${seed.subagent.agent} finished the analysis. Prioritize retrieval parameter fixes first.`,
        },
      ],
      details: {
        mode: 'parallel',
        results: [
          {
            agent: seed.subagent.agent,
            task: 'Cluster retrieval errors on sampled misses and output tuning suggestions',
            exitCode: 0,
            model: seed.subagent.model,
            usage: {
              input: usageInput,
              output: usageOutput,
              cacheRead: 0,
              cacheWrite: 0,
              cost: seed.subagent.cost,
              turns: 4,
            },
            progressSummary: {
              toolCount: 4,
              tokens: seed.subagent.tokens,
              durationMs: 38_000,
            },
            messages: [
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'Sample false-positive cases first, then run cluster analysis.' }],
                timestamp: toIsoWithOffset(seed.created, 11),
              },
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'Clustering finished. Parameter suggestions are ready.' }],
                timestamp: toIsoWithOffset(seed.created, 12),
              },
            ],
          },
        ],
      },
    },
  }
}

function buildMainToolResultMessage(seed: DemoSessionSeed, toolCallId: string): DemoToolResultMessage {
  const message: DemoToolResultMessage = {
    role: 'toolResult',
    toolCallId,
    content: [
      {
        type: 'text',
        text: seed.toolOutput,
      },
    ],
    isError: Boolean(seed.includeToolError),
    output: seed.toolOutput,
  }

  if (seed.toolName === 'bash') {
    message.exitCode = seed.includeToolError ? 1 : 0
    return message
  }

  if (seed.toolName === 'read') {
    const readContent: Record<string, unknown> = {
      type: 'text',
      text: seed.toolOutput,
      output: seed.toolOutput,
      content: [
        {
          type: 'image',
          mimeType: 'image/png',
          data: DEMO_READ_PREVIEW_IMAGE_BASE64,
        },
      ],
    }
    message.content = [readContent as unknown as DemoToolResultContentItem]
    return message
  }

  if (seed.toolName === 'edit') {
    const diffFromArgs = typeof seed.toolArgs.diff === 'string' ? seed.toolArgs.diff : ''
    const diff = diffFromArgs || DEMO_EDIT_DIFF
    const editContent: Record<string, unknown> = {
      type: 'text',
      text: seed.toolOutput,
      diff,
      details: { diff },
    }
    message.content = [editContent as unknown as DemoToolResultContentItem]
    return message
  }

  return message
}

export function buildSessionEntries(seed: DemoSessionSeed): SessionEntry[] {
  const toolCallId = `${seed.id}-tool-main`
  const mainToolResultMessage = buildMainToolResultMessage(seed, toolCallId)
  const entries: SessionEntry[] = [
    {
      type: 'session',
      id: `${seed.id}-session`,
      timestamp: seed.created,
    },
    {
      type: 'message',
      id: `${seed.id}-user-1`,
      parentId: `${seed.id}-session`,
      timestamp: toIsoWithOffset(seed.created, 1),
      message: {
        role: 'user',
        content: [{ type: 'text', text: seed.firstMessage }],
      },
    },
    {
      type: 'model_change',
      id: `${seed.id}-model-change`,
      parentId: `${seed.id}-user-1`,
      timestamp: toIsoWithOffset(seed.created, 2),
      provider: seed.provider,
      modelId: seed.model,
    },
    {
      type: 'message',
      id: `${seed.id}-assistant-1`,
      parentId: `${seed.id}-model-change`,
      timestamp: toIsoWithOffset(seed.created, 3),
      message: {
        role: 'assistant',
        provider: seed.provider,
        model: seed.model,
        usage: {
          input: Math.floor(seed.tokenUsage.input * 0.28),
          output: Math.floor(seed.tokenUsage.output * 0.25),
          cacheRead: Math.floor(seed.tokenUsage.cacheRead * 0.35),
          cacheWrite: Math.floor(seed.tokenUsage.cacheWrite * 0.35),
        },
        content: [
          {
            type: 'thinking',
            thinking: `Map the critical path in ${seed.name} first, then make focused changes instead of a broad rewrite.`,
          },
          {
            type: 'text',
            text: 'I will gather context and validate the main assumptions first, then propose a canary-safe fix path.',
          },
          {
            type: 'toolCall',
            id: toolCallId,
            name: seed.toolName,
            arguments: { ...seed.toolArgs },
          },
        ],
      },
    },
    {
      type: 'message',
      id: `${seed.id}-tool-result-1`,
      parentId: `${seed.id}-assistant-1`,
      timestamp: toIsoWithOffset(seed.created, 4),
      message: mainToolResultMessage,
    },
    {
      type: 'message',
      id: `${seed.id}-assistant-2`,
      parentId: `${seed.id}-tool-result-1`,
      timestamp: toIsoWithOffset(seed.created, 6),
      message: {
        role: 'assistant',
        provider: seed.provider,
        model: seed.model,
        usage: {
          input: Math.floor(seed.tokenUsage.input * 0.32),
          output: Math.floor(seed.tokenUsage.output * 0.37),
          cacheRead: Math.floor(seed.tokenUsage.cacheRead * 0.28),
          cacheWrite: Math.floor(seed.tokenUsage.cacheWrite * 0.28),
        },
        content: [
          {
            type: 'text',
            text: `${seed.assistantSummary}\n\nRecommend a three-step rollout: isolate -> canary -> observe. I will annotate the key metrics.`,
          },
        ],
      },
    },
  ]

  const subagentResultEntry = buildSubagentToolResult(seed)

  if (seed.subagent) {
    entries.push({
      type: 'message',
      id: `${seed.id}-assistant-subagent-call`,
      parentId: `${seed.id}-assistant-2`,
      timestamp: toIsoWithOffset(seed.created, 10),
      message: {
        role: 'assistant',
        provider: seed.provider,
        model: seed.model,
        content: [
          {
            type: 'text',
            text: 'I will run a subagent review in parallel to avoid missing edge cases.',
          },
          {
            type: 'toolCall',
            id: `${seed.id}-tool-subagent`,
            name: 'subagent',
            arguments: {
              agent: seed.subagent.agent,
              task: 'Review parameter-change risks and provide rollback conditions',
            },
          },
        ],
      },
    })

    if (subagentResultEntry) {
      entries.push(subagentResultEntry)
    }
  }

  if (seed.includeCompaction) {
    entries.push({
      type: 'compaction',
      id: `${seed.id}-compaction`,
      parentId: seed.subagent ? `${seed.id}-tool-result-subagent` : `${seed.id}-assistant-2`,
      timestamp: toIsoWithOffset(seed.created, 13),
      tokensBefore: Math.floor(seed.tokenUsage.input * 1.6),
      summary: `- Preserved key evidence and thresholds\n- Compressed historical context to control token cost\n- Next step: run canary verification`,
    })
  }

  if (seed.includeBranchSummary) {
    entries.push({
      type: 'branch_summary',
      id: `${seed.id}-branch-summary`,
      parentId: seed.includeCompaction
        ? `${seed.id}-compaction`
        : seed.subagent
          ? `${seed.id}-tool-result-subagent`
          : `${seed.id}-assistant-2`,
      timestamp: toIsoWithOffset(seed.created, 15),
      summary: `### Branch Conclusion\n- Primary risk points identified\n- Recommend two-stage canary rollout\n- Rollback condition: error rate > 1.2%`,
    })
  }

  if (seed.includeCustomMessage) {
    entries.push({
      type: 'custom_message',
      id: `${seed.id}-custom-message`,
      parentId: seed.includeBranchSummary
        ? `${seed.id}-branch-summary`
        : seed.includeCompaction
          ? `${seed.id}-compaction`
          : seed.subagent
            ? `${seed.id}-tool-result-subagent`
            : `${seed.id}-assistant-2`,
      timestamp: toIsoWithOffset(seed.created, 16),
      customType: 'quality_gate',
      content: {
        owner: 'qa-bot',
        status: 'pass',
        notes: 'Critical regression cases passed. Approved for canary rollout.',
      },
    })
  }

  entries.push(
    {
      type: 'message',
      id: `${seed.id}-user-2`,
      parentId: seed.includeCustomMessage
        ? `${seed.id}-custom-message`
        : seed.includeBranchSummary
          ? `${seed.id}-branch-summary`
          : seed.includeCompaction
            ? `${seed.id}-compaction`
            : seed.subagent
              ? `${seed.id}-tool-result-subagent`
              : `${seed.id}-assistant-2`,
      timestamp: toIsoWithOffset(seed.created, 18),
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Sounds good. Proceed with your plan and give me a copy-paste execution checklist.',
          },
        ],
      },
    },
    {
      type: 'message',
      id: `${seed.id}-assistant-3`,
      parentId: `${seed.id}-user-2`,
      timestamp: toIsoWithOffset(seed.created, 21),
      message: {
        role: 'assistant',
        provider: seed.provider,
        model: seed.model,
        usage: {
          input: Math.floor(seed.tokenUsage.input * 0.4),
          output: Math.floor(seed.tokenUsage.output * 0.38),
          cacheRead: Math.max(0, seed.tokenUsage.cacheRead - Math.floor(seed.tokenUsage.cacheRead * 0.63)),
          cacheWrite: Math.max(0, seed.tokenUsage.cacheWrite - Math.floor(seed.tokenUsage.cacheWrite * 0.63)),
        },
        content: [
          {
            type: 'text',
            text: `Execution checklist:\n1. Canary 10% traffic during off-peak hours\n2. Monitor error-rate and latency SLOs\n3. Expand to 50% after stable metrics\n4. Full rollout and clean up temporary flags\n\n${seed.lastMessage}`,
          },
        ],
      },
    }
  )

  return entries
}

export function toJsonl(entries: SessionEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n')
}

export function buildInitialStoreData(): DemoStoreSeedData {
  const sessions = DEMO_SESSION_SEEDS.map(buildSessionInfo)
  const favorites = DEMO_FAVORITES.map(cloneFavorite)
  const favoritePathSet = new Set(
    favorites
      .filter((item) => item.type === 'session')
      .map((item) => item.path)
  )

  const normalizedSessions = sessions.map((session) => ({
    ...session,
    isFavorite: favoritePathSet.has(session.path),
  }))

  const entriesByPath = new Map<string, SessionEntry[]>()
  const sizeBytesByPath = new Map<string, number>()
  const seedByPath = new Map<string, DemoSessionSeed>()

  for (const seed of DEMO_SESSION_SEEDS) {
    const entries = buildSessionEntries(seed)
    const jsonl = toJsonl(entries)
    entriesByPath.set(seed.path, entries)
    sizeBytesByPath.set(seed.path, new TextEncoder().encode(jsonl).length)
    seedByPath.set(seed.path, seed)
  }

  const maxUserTagId = DEMO_TAGS
    .map((tag) => {
      const matched = tag.id.match(/^tag-user-(\d+)$/)
      if (!matched) return 0
      return Number.parseInt(matched[1], 10)
    })
    .reduce((max, value) => Math.max(max, value), 0)

  return {
    sessions: normalizedSessions,
    favorites,
    tags: DEMO_TAGS.map(cloneTag),
    sessionTags: DEMO_SESSION_TAGS.map(cloneSessionTag),
    entriesByPath,
    sizeBytesByPath,
    seedByPath,
    nextUserTagId: maxUserTagId + 1,
  }
}
