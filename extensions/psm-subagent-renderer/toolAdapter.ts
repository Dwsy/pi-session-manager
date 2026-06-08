import type { AppSubagentSettings } from '@/components/settings/types'
import type { SubagentDetails, TintinwebAgentDetails } from '@/types'
import { detectSubagentProviderFromPayload } from '@/utils/subagentCompatibility'
import {
  buildSubagentProviderResolutionOrder,
  providerBadgeLabel,
  type KnownSubagentProvider,
} from '@/utils/subagentProviders'

export type SubagentArgs = {
  action?: string
  agent?: string
  task?: string
  tasks?: Array<{ agent?: string; task?: string }>
}

export type HazatStartedDetails = {
  id?: string
  name: string
  task: string
  agent?: string
  sessionFile: string
  status: 'started'
}

export type NicobailonAsyncStartedDetails = {
  mode: 'single' | 'parallel' | 'chain'
  results: []
  runId?: string
  asyncId?: string
  asyncDir?: string
  workflowGraph?: unknown
}

export type ResolvedSubagentToolState =
  | { kind: 'hazat-started'; details: HazatStartedDetails; providerBadge: string | null }
  | { kind: 'nicobailon-started'; details: NicobailonAsyncStartedDetails; providerBadge: string | null; taskText: string }
  | { kind: 'tintinweb'; details: TintinwebAgentDetails; providerBadge: string | null }
  | { kind: 'pending'; providerBadge: string | null; action?: string; agentName?: string; taskText: string; output?: string; isPending: boolean }
  | { kind: 'results'; providerBadge: string | null; details: SubagentDetails }

export function resolveSubagentToolState(input: {
  settings: AppSubagentSettings
  details?: SubagentDetails | TintinwebAgentDetails
  args: SubagentArgs
  output?: string
}): ResolvedSubagentToolState {
  const detectedProvider = detectSubagentProviderFromPayload({ details: input.details })
  const providerOrder = buildSubagentProviderResolutionOrder(input.settings, detectedProvider)

  for (const provider of providerOrder) {
    if (provider === 'HazAT/pi-interactive-subagents') {
      const hazat = resolveHazatStartedState(input, provider)
      if (hazat) return hazat
      continue
    }

    if (provider === 'nicobailon/pi-subagents') {
      const nicobailon = resolveNicobailonStartedState(input, provider)
      if (nicobailon) return nicobailon
      continue
    }

    if (provider === '@tintinweb/pi-subagents') {
      const tintinweb = resolveTintinwebState(input, provider)
      if (tintinweb) return tintinweb
    }
  }

  if (!input.details || input.details.mode === 'management' || !input.details.results?.length) {
    const agentName = input.args.agent || input.args.tasks?.[0]?.agent
    const taskText = input.args.task || input.args.tasks?.[0]?.task || ''
    return {
      kind: 'pending',
      providerBadge: input.settings.showProviderBadge ? providerBadgeLabel(detectedProvider) : null,
      action: input.args.action,
      agentName,
      taskText,
      output: input.output,
      isPending: !input.details && !input.output && Boolean(agentName),
    }
  }

  return {
    kind: 'results',
    providerBadge: input.settings.showProviderBadge ? providerBadgeLabel(detectedProvider) : null,
    details: input.details,
  }
}

export function isTintinwebDetails(details?: SubagentDetails | TintinwebAgentDetails): details is TintinwebAgentDetails {
  if (!details) return false
  return 'status' in details && 'displayName' in details && !('mode' in details)
}

function resolveHazatStartedState(
  input: {
    settings: AppSubagentSettings
    details?: SubagentDetails | TintinwebAgentDetails
  },
  provider: KnownSubagentProvider,
): ResolvedSubagentToolState | null {
  if (!isHazatStartedDetails(input.details)) return null
  return {
    kind: 'hazat-started',
    details: input.details,
    providerBadge: input.settings.showProviderBadge ? providerBadgeLabel(provider) : null,
  }
}

function resolveNicobailonStartedState(
  input: {
    settings: AppSubagentSettings
    details?: SubagentDetails | TintinwebAgentDetails
    args: SubagentArgs
  },
  provider: KnownSubagentProvider,
): ResolvedSubagentToolState | null {
  if (!isNicobailonAsyncStartedDetails(input.details)) return null
  return {
    kind: 'nicobailon-started',
    details: input.details,
    providerBadge: input.settings.showProviderBadge ? providerBadgeLabel(provider) : null,
    taskText: input.args.task || input.args.tasks?.[0]?.task || '',
  }
}

function resolveTintinwebState(
  input: {
    settings: AppSubagentSettings
    details?: SubagentDetails | TintinwebAgentDetails
  },
  provider: KnownSubagentProvider,
): ResolvedSubagentToolState | null {
  if (!isTintinwebDetails(input.details)) return null
  return {
    kind: 'tintinweb',
    details: input.details,
    providerBadge: input.settings.showProviderBadge ? providerBadgeLabel(provider) : null,
  }
}

function isHazatStartedDetails(details: unknown): details is HazatStartedDetails {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false
  const value = details as Record<string, unknown>
  return value.status === 'started' && typeof value.name === 'string' && typeof value.task === 'string' && typeof value.sessionFile === 'string'
}

function isNicobailonAsyncStartedDetails(details: unknown): details is NicobailonAsyncStartedDetails {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false
  const value = details as Record<string, unknown>
  return (
    (value.mode === 'single' || value.mode === 'parallel' || value.mode === 'chain') &&
    Array.isArray(value.results) &&
    value.results.length === 0 &&
    (typeof value.asyncId === 'string' || typeof value.asyncDir === 'string' || typeof value.workflowGraph !== 'undefined')
  )
}
