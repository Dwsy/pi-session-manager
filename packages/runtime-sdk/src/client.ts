import type {
  CreatePsmClientOptions,
  DbPluginRecord,
  PluginRecord,
  PluginRecordListParams,
  PluginRecordSearchHit,
  PluginRecordSearchParams,
  PluginRecordUpsertParams,
  PsmAiTextParams,
  PsmAiTextResponse,
  PsmAiTextStreamEvent,
  PsmAiTextStreamHandlers,
  PsmCapabilityClient,
  PsmCreateTagParams,
  PsmFullTextSearchParams,
  PsmModelOption,
  PsmPermissionContext,
  PsmSessionListParams,
  PsmSessionOpenOptions,
  PsmSessionReadChunkOptions,
  PsmSideChatAskParams,
  PsmSideChatCitation,
  PsmSideChatResponse,
  PsmSideChatStreamHandlers,
} from './types'

const DEFAULT_SIDECHAT_LIMIT = 6
const MAX_SIDECHAT_LIMIT = 12
const MAX_SNIPPET_CHARS = 700
const MAX_SIDECHAT_CONTEXT_CHARS = 8000

function parsePayload(record: DbPluginRecord): PluginRecord {
  let payload: unknown = null
  try {
    payload = JSON.parse(record.payload_json)
  } catch {
    payload = null
  }

  return {
    ...record,
    payload,
  }
}

function toSessionListPayload(params: PsmSessionListParams = {}) {
  return {
    offset: params.offset,
    limit: params.limit,
    searchQuery: params.searchQuery,
    projectFilter: params.projectFilter,
    filterTagIds: params.filterTagIds,
    sourceFilterSlugs: params.sourceFilterSlugs,
    sortBy: params.sortBy,
  }
}

function toFulltextPayload(params: PsmFullTextSearchParams) {
  return {
    query: params.query,
    roleFilter: params.roleFilter ?? 'all',
    globPattern: params.globPattern,
    projectPath: params.projectPath,
    page: params.page ?? 0,
    pageSize: params.pageSize ?? 20,
    matchMode: params.matchMode,
    sortOrder: params.sortOrder,
    sourceFilter: params.sourceFilter,
    from: params.from,
    to: params.to,
  }
}

function toCreateTagPayload(params: PsmCreateTagParams) {
  return {
    name: params.name,
    color: params.color,
    icon: params.icon,
    parentId: params.parentId,
  }
}

function toSideChatPayload(params: PsmSideChatAskParams) {
  return {
    provider: params.provider,
    model: params.model,
    reasoning: params.thinkingLevel,
  }
}

function toAiTextPayload(params: PsmAiTextParams) {
  return {
    systemPrompt: params.systemPrompt,
    prompt: params.prompt,
    provider: params.provider,
    model: params.model,
    reasoning: params.reasoning,
  }
}

function withPermissionContext(payload: Record<string, unknown> | undefined, permissions: PsmPermissionContext | undefined) {
  if (!permissions?.pluginId && (!permissions?.permissions || permissions.permissions.length === 0)) {
    return payload
  }

  return {
    ...(payload ?? {}),
    __psm: {
      pluginId: permissions.pluginId,
      permissions: permissions.permissions,
    },
  }
}

function isMissingCommand(error: unknown, command: string) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes(command.toLowerCase()) && normalized.includes('command') && (normalized.includes('not found') || normalized.includes('unknown command'))
}

function extractEntryText(entry: unknown) {
  if (!entry || typeof entry !== 'object') return ''
  const message = (entry as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      const candidate = block as { type?: unknown; text?: unknown }
      return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text.trim() : ''
    })
    .filter(Boolean)
    .join('\n')
}

function entryRole(entry: unknown) {
  const message = entry && typeof entry === 'object' ? (entry as { message?: unknown }).message : null
  return message && typeof message === 'object' && typeof (message as { role?: unknown }).role === 'string'
    ? (message as { role: string }).role
    : ''
}

function entryStringField(entry: unknown, key: string) {
  return entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>)[key] === 'string'
    ? String((entry as Record<string, unknown>)[key])
    : undefined
}

function tokenizeQuery(question: string) {
  return Array.from(new Set(question.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []))
}

function truncateSnippet(text: string) {
  return text.length > MAX_SNIPPET_CHARS ? `${text.slice(0, MAX_SNIPPET_CHARS)}...` : text
}

function selectSideChatSnippets(entries: unknown[], question: string, limit: number): PsmSideChatCitation[] {
  const terms = tokenizeQuery(question)
  const boundedLimit = Math.max(1, Math.min(MAX_SIDECHAT_LIMIT, limit || DEFAULT_SIDECHAT_LIMIT))
  const candidates = entries
    .map<PsmSideChatCitation | null>((entry, index) => {
      const role = entryRole(entry)
      if (role !== 'user' && role !== 'assistant') return null
      const text = extractEntryText(entry)
      if (!text || text.startsWith('[Tool:') || text.startsWith('[Tool Output]')) return null
      const lower = text.toLowerCase()
      const score = terms.length === 0
        ? 0
        : terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0) / terms.length
      return {
        entryId: entryStringField(entry, 'id') ?? `entry-${index}`,
        role,
        timestamp: entryStringField(entry, 'timestamp'),
        snippet: truncateSnippet(text),
        score,
        source: score > 0 ? 'session-entry' : 'recent',
      }
    })
    .filter((candidate): candidate is PsmSideChatCitation => Boolean(candidate))

  const scored = candidates
    .filter((candidate) => (candidate.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, boundedLimit)

  const selected = scored.length > 0 ? scored : candidates.slice(-boundedLimit)
  return limitSideChatContext(selected)
}

function limitSideChatContext(citations: PsmSideChatCitation[]) {
  let total = 0
  const selected: PsmSideChatCitation[] = []
  for (const citation of citations) {
    if (total >= MAX_SIDECHAT_CONTEXT_CHARS) break
    const remaining = MAX_SIDECHAT_CONTEXT_CHARS - total
    const snippet = citation.snippet.length > remaining ? `${citation.snippet.slice(0, Math.max(0, remaining - 3))}...` : citation.snippet
    selected.push({ ...citation, snippet })
    total += snippet.length
  }
  return selected
}

function buildSideChatSystemPrompt(language?: string, thinkingLevel?: string) {
  const languageLine = language ? `Respond in the user's UI language: ${language}.` : 'Respond in the same language as the user when possible.'
  const thinkingLine = thinkingLevel && thinkingLevel !== 'off'
    ? `Use ${thinkingLevel} reasoning internally, but keep the final answer concise and directly useful.`
    : 'Keep the answer concise and directly useful.'
  return [
    'You answer questions about one local coding-agent session.',
    'Use only the provided session snippets as evidence. If the snippets are insufficient, say what is missing.',
    'Prefer concrete decisions, blockers, files, commands, and next steps over generic advice.',
    languageLine,
    thinkingLine,
  ].join('\n')
}

function buildSideChatContext(question: string, citations: PsmSideChatCitation[]) {
  const snippets = citations.map((citation, index) => {
    const role = citation.role || 'context'
    const timestamp = citation.timestamp ? ` @ ${citation.timestamp}` : ''
    return `[${index + 1}] ${role}${timestamp}\n${citation.snippet}`
  })
  return [`Question:\n${question}`, '', 'Relevant session snippets:', snippets.join('\n\n')].join('\n')
}

export function createPluginCapabilityClient(options: CreatePsmClientOptions): PsmCapabilityClient {
  const { transport, permissions } = options

  const invoke = <T>(command: string, payload?: Record<string, unknown>) => transport.invoke<T>(command, withPermissionContext(payload, permissions))
  const stream = <TEvent, TResult>(
    command: string,
    payload: Record<string, unknown> | undefined,
    handlers: { onEvent?: (event: TEvent) => void; onError?: (error: string) => void },
  ) => transport.stream?.<TEvent, TResult>(command, withPermissionContext(payload, permissions), handlers)

  const records = {
    async search(params: PluginRecordSearchParams) {
      const hits = await invoke<PluginRecordSearchHit[]>('search_plugin_records', {
        query: params.query,
        recordType: params.recordType,
        pluginId: params.pluginId,
        limit: params.limit,
      })
      return hits.map((hit) => ({
        ...parsePayload(hit.record),
        score: hit.rank,
      }))
    },

    async listForScope(params: PluginRecordListParams) {
      const records = await invoke<DbPluginRecord[]>('list_plugin_records_for_scope', {
        scopeType: params.scopeType,
        scopeId: params.scopeId,
        recordType: params.recordType,
        limit: params.limit,
      })
      return records.map(parsePayload)
    },

    async upsert(params: PluginRecordUpsertParams) {
      await invoke<void>('upsert_plugin_record', {
        record: {
          id: `${params.pluginId}:${params.scopeType}:${params.scopeId}:${params.recordType}`,
          plugin_id: params.pluginId,
          scope_type: params.scopeType,
          scope_id: params.scopeId,
          record_type: params.recordType,
          schema_version: params.schemaVersion,
          payload_json: JSON.stringify(params.payload),
          searchable_text: params.searchableText ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      })
    },

    async refreshSessionIntelligence(params: { path: string; provider?: string; model?: string; language?: string }) {
      const record = await invoke<DbPluginRecord>('refresh_session_intelligence_record', {
        path: params.path,
        provider: params.provider,
        model: params.model,
        language: params.language,
      })
      return parsePayload(record)
    },
  }

  async function generateText(params: PsmAiTextParams) {
    return invoke<PsmAiTextResponse>('invoke_model_text', toAiTextPayload(params))
  }

  async function streamText(params: PsmAiTextParams, handlers?: PsmAiTextStreamHandlers) {
    const payload = toAiTextPayload(params)
    let receivedDelta = false
    let streamError: string | null = null
    const streamed = stream<PsmAiTextStreamEvent, PsmAiTextResponse>('invoke_model_text_stream', payload, {
      onEvent(event) {
        if (event.type === 'delta') {
          receivedDelta = true
          handlers?.onDelta?.(event.delta)
        } else if (event.type === 'done') {
          handlers?.onDone?.(event.response)
        } else if (event.type === 'error') {
          streamError = event.error
        }
      },
      onError(error) {
        streamError = error
      },
    })

    if (streamed) {
      try {
        return await streamed
      } catch (error) {
        if (!receivedDelta && isMissingCommand(error, 'invoke_model_text_stream')) {
          const response = await generateText(params)
          handlers?.onDelta?.(response.text)
          handlers?.onDone?.(response)
          return response
        }
        handlers?.onError?.(streamError ?? (error instanceof Error ? error.message : String(error)))
        throw error
      }
    }

    const response = await generateText(params)
    handlers?.onDelta?.(response.text)
    handlers?.onDone?.(response)
    return response
  }

  async function askSideChatStream(params: PsmSideChatAskParams, handlers?: PsmSideChatStreamHandlers) {
    const entries = await invoke<unknown[]>('get_session_entries', { path: params.sessionPath })

    const citations = selectSideChatSnippets(entries, params.question, params.limit ?? DEFAULT_SIDECHAT_LIMIT)
    const systemPrompt = buildSideChatSystemPrompt(params.language, params.thinkingLevel)
    const prompt = buildSideChatContext(params.question, citations)

    const aiResponse = await streamText(
      {
        ...toSideChatPayload(params),
        systemPrompt,
        prompt,
      },
      {
        onDelta: handlers?.onDelta,
        onError: handlers?.onError,
      },
    )
    const response: PsmSideChatResponse = {
      answer: aiResponse.text,
      citations,
      provider: aiResponse.provider,
      model: aiResponse.model,
    }
    handlers?.onDone?.(response)
    return response
  }

  return {
    records,
    sessions: {
      scan() {
        return invoke<unknown[]>('scan_sessions')
      },
      list(params) {
        return invoke('scan_sessions_paginated', toSessionListPayload(params))
      },
      readEntries(sessionPath, _readOptions) {
        return invoke<unknown[]>('get_session_entries', {
          path: sessionPath,
        })
      },
      readFileChunk(sessionPath, readOptions?: PsmSessionReadChunkOptions) {
        return invoke('read_session_file_chunk', {
          path: sessionPath,
          offset: readOptions?.offset,
          maxBytes: readOptions?.maxBytes,
        })
      },
      getLabels(sessionPath) {
        return invoke<Record<string, string>>('get_session_labels', {
          path: sessionPath,
        })
      },
      async open(sessionPath, openOptions?: PsmSessionOpenOptions) {
        if (openOptions?.target === 'terminal') {
          await invoke<void>('open_session_in_terminal', {
            path: sessionPath,
            cwd: openOptions.cwd ?? '',
            terminal: openOptions.terminal,
            piPath: openOptions.piPath,
            resumeCommand: openOptions.resumeCommand,
          })
          return
        }

        await invoke<void>('open_session_in_browser', { path: sessionPath })
      },
    },
    search: {
      fulltext(params) {
        return invoke('full_text_search', toFulltextPayload(params))
      },
      pluginRecords(params) {
        return records.search(params)
      },
    },
    ai: {
      generateText,
      streamText,
    },
    sidechat: {
      ask(params) {
        return askSideChatStream(params)
      },
      askStream(params, handlers) {
        return askSideChatStream(params, handlers)
      },
    },
    models: {
      listOptions() {
        return invoke<PsmModelOption[]>('list_model_options_fast')
      },
    },
    tags: {
      listTags() {
        return invoke('get_all_tags')
      },
      createTag(params) {
        return invoke('create_tag', toCreateTagPayload(params))
      },
      async assignTag(sessionId, tagId) {
        await invoke<void>('assign_tag', { sessionId, tagId })
      },
      async removeTag(sessionId, tagId) {
        await invoke<void>('remove_tag_from_session', { sessionId, tagId })
      },
      async listSessionTags(sessionId) {
        const tags = await invoke<Array<{ sessionId?: string; session_id?: string; tagId?: string; tag_id?: string; position: number; assignedAt?: string; assigned_at?: string }>>('get_all_session_tags')
        if (!sessionId) return tags
        return tags.filter((tag) => (tag.sessionId ?? tag.session_id) === sessionId)
      },
    },
    config: {
      read(key, options) {
        return invoke('read_psm_plugin_json_config', {
          key,
          defaultValue: options?.defaultValue,
        })
      },
      async write(key, value) {
        await invoke<void>('write_psm_plugin_json_config', {
          key,
          value,
        })
      },
    },
  }
}
