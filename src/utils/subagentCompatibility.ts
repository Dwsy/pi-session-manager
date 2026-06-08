import type {
  AppSubagentSettings,
  ForcedSubagentProvider,
} from '@/components/settings/types'
import type { PiSettingsFull } from '@/types'

export type DetectedSubagentProvider =
  | Exclude<ForcedSubagentProvider, 'none'>
  | 'generic'
  | 'unknown'

const PROVIDER_SOURCES: Array<{
  provider: Exclude<ForcedSubagentProvider, 'none'>
  matchers: string[]
}> = [
  {
    provider: 'nicobailon/pi-subagents',
    matchers: ['npm:pi-subagents', 'github.com/nicobailon/pi-subagents'],
  },
  {
    provider: 'HazAT/pi-interactive-subagents',
    matchers: ['github.com/HazAT/pi-interactive-subagents'],
  },
  {
    provider: '@tintinweb/pi-subagents',
    matchers: ['npm:@tintinweb/pi-subagents'],
  },
]

export function normalizeSubagentCompatibilitySettings(
  value: unknown,
): AppSubagentSettings {
  const raw = isRecord(value) ? value : {}
  const mode = raw.mode === 'forced' ? 'forced' : 'smart'
  const forcedProvider =
    mode === 'forced' && isForcedProvider(raw.forcedProvider)
      ? raw.forcedProvider
      : undefined

  return {
    mode,
    forcedProvider,
    showProviderBadge: raw.showProviderBadge !== false,
    enableAsyncStatusProbe: raw.enableAsyncStatusProbe !== false,
  }
}

export interface PiSubagentProviderSummary {
  enabledProviders: Array<Exclude<ForcedSubagentProvider, 'none'>>
  disabledProviders: Array<Exclude<ForcedSubagentProvider, 'none'>>
  recommendedProvider: Exclude<ForcedSubagentProvider, 'none'>
}

export function detectConfiguredSubagentProviders(
  settings?: Pick<PiSettingsFull, 'packages' | 'extensions'> | null,
): PiSubagentProviderSummary {
  const enabled = new Set<Exclude<ForcedSubagentProvider, 'none'>>()
  const disabled = new Set<Exclude<ForcedSubagentProvider, 'none'>>()

  for (const item of settings?.packages ?? []) {
    const resolved = resolveConfiguredProvider(item)
    if (!resolved) continue
    if (resolved.enabled) {
      enabled.add(resolved.provider)
      disabled.delete(resolved.provider)
    } else if (!enabled.has(resolved.provider)) {
      disabled.add(resolved.provider)
    }
  }

  const enabledProviders = Array.from(enabled)
  const disabledProviders = Array.from(disabled)

  return {
    enabledProviders,
    disabledProviders,
    recommendedProvider:
      enabledProviders[0] ?? 'nicobailon/pi-subagents',
  }
}

export function detectSubagentProviderFromPayload(input: {
  customType?: string
  details?: unknown
}): DetectedSubagentProvider {
  if (input.customType === 'subagent_result') {
    return 'HazAT/pi-interactive-subagents'
  }
  if (
    input.customType === 'subagent-notify' ||
    input.customType === 'subagent-slash-result'
  ) {
    return 'nicobailon/pi-subagents'
  }

  const details = isRecord(input.details) ? input.details : null
  if (!details) return 'unknown'

  if (
    typeof details.displayName === 'string' &&
    typeof details.subagentType === 'string' &&
    typeof details.status === 'string'
  ) {
    return '@tintinweb/pi-subagents'
  }

  if (
    details.status === 'started' &&
    typeof details.name === 'string' &&
    typeof details.sessionFile === 'string'
  ) {
    return 'HazAT/pi-interactive-subagents'
  }

  if (typeof details.mode === 'string' && Array.isArray(details.results)) {
    if (
      typeof details.asyncId === 'string' ||
      typeof details.asyncDir === 'string' ||
      'workflowGraph' in details ||
      'outputs' in details ||
      'controlEvents' in details
    ) {
      return 'nicobailon/pi-subagents'
    }
    return 'generic'
  }

  return 'unknown'
}

export function resolveSubagentProviderPreference(
  settings: AppSubagentSettings | undefined,
  detected: DetectedSubagentProvider,
): DetectedSubagentProvider {
  if (settings?.mode === 'forced' && settings.forcedProvider && settings.forcedProvider !== 'none') {
    return settings.forcedProvider
  }
  return detected
}

function resolveConfiguredProvider(
  item: unknown,
): { provider: Exclude<ForcedSubagentProvider, 'none'>; enabled: boolean } | null {
  if (typeof item === 'string') {
    const enabled = !item.trim().startsWith('-')
    const source = enabled ? item.trim() : item.trim().slice(1)
    const provider = providerFromSource(source)
    return provider ? { provider, enabled } : null
  }

  if (!isRecord(item) || typeof item.source !== 'string') {
    return null
  }

  const provider = providerFromSource(item.source)
  if (!provider) return null

  const extensions = Array.isArray(item.extensions) ? item.extensions : []
  const enabled = extensions.some((entry) => typeof entry === 'string' && entry.trim().startsWith('+'))
  return { provider, enabled }
}

function providerFromSource(
  source: string,
): Exclude<ForcedSubagentProvider, 'none'> | null {
  const normalized = source.trim()
  for (const candidate of PROVIDER_SOURCES) {
    if (candidate.matchers.some((matcher) => normalized.includes(matcher))) {
      return candidate.provider
    }
  }
  return null
}

function isForcedProvider(value: unknown): value is ForcedSubagentProvider {
  return (
    value === 'nicobailon/pi-subagents' ||
    value === 'HazAT/pi-interactive-subagents' ||
    value === '@tintinweb/pi-subagents' ||
    value === 'none'
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
