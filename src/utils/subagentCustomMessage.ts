import type { AppSubagentSettings } from '@/components/settings/types'
import { detectSubagentProviderFromPayload, type DetectedSubagentProvider } from './subagentCompatibility'
import {
  buildSubagentProviderResolutionOrder,
  providerBadgeLabel,
  type KnownSubagentProvider,
} from './subagentProviders'

export type CanonicalSubagentMessageStatus = 'completed' | 'failed' | 'paused'

export interface CanonicalSubagentCustomMessage {
  provider: Exclude<DetectedSubagentProvider, 'generic' | 'unknown'>
  providerBadge: string | null
  title: string
  task?: string
  status: CanonicalSubagentMessageStatus
  summary: string
  sessionFile?: string
  durationMs?: number
}

export function resolveSubagentCustomMessage(input: {
  customType?: string
  content?: unknown
  details?: unknown
  settings?: AppSubagentSettings
}): CanonicalSubagentCustomMessage | null {
  const detected = detectSubagentProviderFromPayload({
    customType: input.customType,
    details: input.details,
  })
  const providerOrder = buildSubagentProviderResolutionOrder(
    input.settings,
    detected,
  )

  for (const provider of providerOrder) {
    if (provider === 'HazAT/pi-interactive-subagents') {
      const hazat = parseHazatResult(input.details, input.content, provider)
      if (hazat) return hazat
      continue
    }

    if (provider === 'nicobailon/pi-subagents') {
      const nicobailon = parseNicobailonNotify(
        input.customType,
        input.content,
        provider,
      )
      if (nicobailon) return nicobailon
    }
  }

  return null
}

function parseHazatResult(
  details: unknown,
  content: unknown,
  provider: KnownSubagentProvider,
): CanonicalSubagentCustomMessage | null {
  if (!isRecord(details) || typeof details.name !== 'string') return null

  const exitCode = typeof details.exitCode === 'number' ? details.exitCode : 0
  const status: CanonicalSubagentMessageStatus = exitCode === 0 ? 'completed' : 'failed'
  const rawContent = contentToText(content)
  const sessionFile = typeof details.sessionFile === 'string'
    ? details.sessionFile
    : parseSessionPath(rawContent)
  const summary = stripSessionLine(rawContent)
    .replace(/^Sub-agent\s+".+?"\s+(completed|failed)\s*\([^)]*\)\.\s*/i, '')
    .replace(/^Sub-agent\s+".+?"\s+failed\s*\(exit code \d+\)\.\s*/i, '')
    .trim()

  return {
    provider: 'HazAT/pi-interactive-subagents',
    providerBadge: providerBadgeLabel(provider),
    title: details.name,
    task: typeof details.task === 'string' ? details.task : undefined,
    status,
    summary: summary || '(no output)',
    sessionFile,
    durationMs: typeof details.elapsed === 'number' ? details.elapsed * 1000 : undefined,
  }
}

function parseNicobailonNotify(
  customType: string | undefined,
  content: unknown,
  provider: KnownSubagentProvider,
): CanonicalSubagentCustomMessage | null {
  if (customType !== 'subagent-notify' && customType !== 'subagent-slash-result') return null
  const rawContent = contentToText(content)
  if (!rawContent.trim()) return null

  const lines = rawContent.split('\n')
  const header = lines[0] ?? ''
  const match = header.match(/^Background task (completed|failed|paused): \*\*(.+?)\*\*(?:\s+(\([^)]*\)))?$/)
  if (!match) return null

  const status = match[1] as CanonicalSubagentMessageStatus
  const title = match[2]!
  const bodyLines = lines.slice(2)
  const sessionFile = parseSessionPath(rawContent)
  const summary = stripSessionLine(bodyLines.join('\n')).trim() || '(no output)'

  return {
    provider: 'nicobailon/pi-subagents',
    providerBadge: providerBadgeLabel(provider),
    title,
    status,
    summary,
    sessionFile,
  }
}

function parseSessionPath(text: string): string | undefined {
  const match = text.match(/^(?:Session|Session file):\s+(.+)$/m)
  return match?.[1]?.trim() || undefined
}

function stripSessionLine(text: string): string {
  return text
    .replace(/^Session file:\s+.+$/gm, '')
    .replace(/^Session:\s+.+$/gm, '')
    .replace(/^Session share error:\s+.+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (content == null) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
