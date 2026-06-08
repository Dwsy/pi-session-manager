import type { AppSubagentSettings } from '@/components/settings/types'
import type { DetectedSubagentProvider } from './subagentCompatibility'

export type KnownSubagentProvider = Exclude<DetectedSubagentProvider, 'generic' | 'unknown'>

export const KNOWN_SUBAGENT_PROVIDERS: KnownSubagentProvider[] = [
  'nicobailon/pi-subagents',
  'HazAT/pi-interactive-subagents',
  '@tintinweb/pi-subagents',
]

export function providerBadgeLabel(provider: DetectedSubagentProvider): string | null {
  switch (provider) {
    case 'nicobailon/pi-subagents':
      return 'nicobailon'
    case 'HazAT/pi-interactive-subagents':
      return 'HazAT'
    case '@tintinweb/pi-subagents':
      return '@tintinweb'
    default:
      return null
  }
}

export function buildSubagentProviderResolutionOrder(
  settings: AppSubagentSettings | undefined,
  detected: DetectedSubagentProvider,
): DetectedSubagentProvider[] {
  const ordered: DetectedSubagentProvider[] = []

  if (
    settings?.mode === 'forced' &&
    settings.forcedProvider &&
    settings.forcedProvider !== 'none'
  ) {
    ordered.push(settings.forcedProvider)
  }

  ordered.push(detected)

  for (const provider of KNOWN_SUBAGENT_PROVIDERS) {
    ordered.push(provider)
  }

  ordered.push('generic', 'unknown')

  return ordered.filter((provider, index, array) => array.indexOf(provider) === index)
}
