import type { PsmSessionJsonlEntry, PsmToolResolvedData } from '@pi-session-manager/plugin-sdk'

export const GROK_PI_TOOL_NAMES = new Set([
  'bash',
  'eval',
  'get_task_output',
  'wait_tasks',
  'kill_task',
  'spawn_subagent',
  'send_message_to_subagent',
  'get_command_or_subagent_output',
  'kill_command_or_subagent',
  'list_subagents',
  'spawn_team_agent',
  'team_send_message',
  'team_followup_task',
  'team_wait',
  'team_list',
  'team_interrupt',
  'spawn_team',
  'todo',
])

const SUBAGENT_V1_TOOLS = new Set([
  'spawn_subagent',
  'send_message_to_subagent',
  'get_command_or_subagent_output',
  'kill_command_or_subagent',
  'list_subagents',
])

const SUBAGENT_V2_TOOLS = new Set([
  'spawn_team_agent',
  'team_send_message',
  'team_followup_task',
  'team_wait',
  'team_list',
  'team_interrupt',
  'spawn_team',
])

const TASK_TOOLS = new Set(['get_task_output', 'wait_tasks', 'kill_task'])

export type GrokPiToolKind = 'bash' | 'eval' | 'task' | 'todo' | 'subagent'

export type GrokPiToolPresentation = {
  kind: GrokPiToolKind
  title: string
  primaryText: string
  version?: string
  background: boolean
  code?: string
  codeLanguage?: string
  details?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compact(value: string, limit = 120): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}…` : singleLine
}

function humanize(name: string): string {
  return name
    .split('_')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(' ')
}

export function resultDetails(data: PsmToolResolvedData): Record<string, unknown> | undefined {
  const message = asRecord(data.result?.message)
  return asRecord(message?.details)
}

export function resolveGrokPiToolPresentation(data: PsmToolResolvedData): GrokPiToolPresentation {
  const args = asRecord(data.args) ?? {}
  const details = resultDetails(data)
  const background = details?.background === true || args.is_background === true

  if (data.name === 'bash') {
    const command = text(args.command)
    return {
      kind: 'bash',
      title: 'Grok Bash',
      primaryText: text(args.task_name) || compact(command) || 'Shell command',
      background,
      code: command,
      codeLanguage: 'bash',
      details,
    }
  }

  if (data.name === 'eval') {
    const language = text(details?.language) || text(args.language) || 'js'
    const bridgeVersion = text(details?.bridgeVersion)
    const code = text(args.code)
    return {
      kind: 'eval',
      title: bridgeVersion ? `Eval ${bridgeVersion}` : 'Eval',
      primaryText: text(args.title) || compact(code) || `${language} cell`,
      version: bridgeVersion || undefined,
      background,
      code,
      codeLanguage: language === 'python' || language === 'py' ? 'python' : 'javascript',
      details,
    }
  }

  if (data.name === 'todo') {
    const version = Number(details?.version) === 2 || typeof args.action === 'string' ? 'v2' : 'v1'
    const subject = text(args.subject)
    const action = text(args.action)
    const todos = Array.isArray(args.todos) ? args.todos.length : 0
    return {
      kind: 'todo',
      title: `Todo ${version}`,
      primaryText: subject || (action ? humanize(action) : `${todos} item${todos === 1 ? '' : 's'}`),
      version,
      background: false,
      details,
    }
  }

  if (SUBAGENT_V2_TOOLS.has(data.name)) {
    const primary = text(args.task_name) || text(args.team) || text(args.target) || text(args.message) || text(args.task)
    return {
      kind: 'subagent',
      title: humanize(data.name),
      primaryText: compact(primary) || 'Subagents V2',
      version: 'v2',
      background: true,
      details,
    }
  }

  if (SUBAGENT_V1_TOOLS.has(data.name)) {
    const primary = text(args.description) || text(args.prompt) || text(args.task_id) || text(args.subagent_id) || text(args.message)
    return {
      kind: 'subagent',
      title: humanize(data.name),
      primaryText: compact(primary) || 'Subagent',
      version: 'v1',
      background: args.background === true,
      details,
    }
  }

  if (TASK_TOOLS.has(data.name)) {
    const ids = Array.isArray(args.task_ids) ? args.task_ids.map(String).join(', ') : text(args.task_id)
    return {
      kind: 'task',
      title: humanize(data.name),
      primaryText: compact(ids) || 'Managed task',
      background: true,
      details,
    }
  }

  return {
    kind: 'task',
    title: humanize(data.name),
    primaryText: data.name,
    background,
    details,
  }
}

function entryData(entry: PsmSessionJsonlEntry): Record<string, unknown> | undefined {
  return asRecord(entry.data) ?? asRecord(entry.details)
}

function markdownSection(label: string, value: unknown): string {
  const content = text(value)
  return content ? `**${label}**\n\n${content}` : ''
}

function renderSubagentEntry(customType: string, data: Record<string, unknown>): string {
  if (customType === 'pi-grok-subagent-state/v1') {
    const status = text(data.status).toUpperCase() || 'UNKNOWN'
    const description = text(data.description) || text(data.prompt) || text(data.id)
    const metrics = [
      typeof data.turnCount === 'number' ? `${data.turnCount} turns` : '',
      typeof data.toolCallCount === 'number' ? `${data.toolCallCount} tools` : '',
      typeof data.tokensUsed === 'number' ? `${data.tokensUsed} tokens` : '',
    ].filter(Boolean).join(' · ')
    return [`## Subagent ${status}`, description, metrics, markdownSection('Error', data.lastError)].filter(Boolean).join('\n\n')
  }

  const kind = text(data.kind) || 'update'
  const payload = asRecord(data.payload)
  const description = text(payload?.description) || text(payload?.prompt) || text(data.subagentId)
  return [`## Subagent ${humanize(kind)}`, description, markdownSection('Status', payload?.status), markdownSection('Error', payload?.error)].filter(Boolean).join('\n\n')
}

function toCustomMessage(entry: PsmSessionJsonlEntry, customType: string, content: string, details: unknown): PsmSessionJsonlEntry {
  return {
    ...entry,
    type: 'custom_message',
    customType,
    content,
    details,
  }
}

export function transformGrokPiEntries(entries: unknown[]): unknown[] {
  return entries.map((rawEntry) => {
    const entry = asRecord(rawEntry) as PsmSessionJsonlEntry | undefined
    if (!entry) return rawEntry
    const customType = text(entry.customType)
    if (!customType.startsWith('pi-grok-')) return rawEntry
    const data = entryData(entry) ?? {}

    if (customType === 'pi-grok-recap/v1') {
      const summary = text(data.summary)
      return summary
        ? toCustomMessage(entry, 'Grok Pi Recap', summary, data)
        : rawEntry
    }

    if (customType === 'pi-grok-btw/history/v1') {
      const question = text(data.question)
      const answer = text(data.answer)
      const content = [
        '## /btw',
        markdownSection('Question', question),
        markdownSection('Answer', answer),
        markdownSection('Model', data.modelUsed),
      ].filter(Boolean).join('\n\n')
      return toCustomMessage(entry, 'Grok Pi BTW', content, data)
    }

    if (customType === 'pi-grok-btw/v1') {
      if (data.ok !== false) return { ...entry, type: 'custom' }
      return toCustomMessage(entry, 'Grok Pi BTW', `## /btw failed\n\n${text(data.error) || 'Unknown error'}`, data)
    }

    if (customType === 'pi-grok-subagent/v1' || customType === 'pi-grok-subagent-state/v1') {
      return toCustomMessage(entry, customType === 'pi-grok-subagent/v1' ? 'Grok Pi Subagent' : 'Grok Pi Subagent State', renderSubagentEntry(customType, data), data)
    }

    if (customType === 'pi-grok-team-message/v2') {
      const content = text(entry.content) || text(data.message) || JSON.stringify(data, null, 2)
      return toCustomMessage(entry, 'Grok Pi Team Message v2', content, data)
    }

    if (customType === 'pi-grok-background-bash/v1') {
      const content = text(entry.content) || text(data.output) || JSON.stringify(data, null, 2)
      return toCustomMessage(entry, 'Grok Pi Background Bash', content, data)
    }

    return rawEntry
  })
}
