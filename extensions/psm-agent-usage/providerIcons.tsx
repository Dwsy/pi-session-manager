import type { ComponentType, CSSProperties, SVGProps } from 'react'
import {
  Amp,
  Antigravity,
  ClaudeCode,
  Codex,
  Copilot,
  Cursor,
  Devin,
  Grok,
  Kimi,
  Minimax,
  OpenCode,
  OpenRouter,
  Zhipu,
} from '@lobehub/icons'
import { Bot } from 'lucide-react'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & {
  size?: number | string
  className?: string
  style?: CSSProperties
}>

const PROVIDER_ICONS: Record<string, IconComponent> = {
  antigravity: Antigravity as IconComponent,
  amp: Amp as IconComponent,
  claude: ClaudeCode as IconComponent,
  codex: Codex as IconComponent,
  copilot: Copilot as IconComponent,
  cursor: Cursor as IconComponent,
  devin: Devin as IconComponent,
  factory: Bot as IconComponent,
  grok: Grok as IconComponent,
  openrouter: OpenRouter as IconComponent,
  'opencode-go': OpenCode as IconComponent,
  kimi: Kimi as IconComponent,
  minimax: Minimax as IconComponent,
  zai: Zhipu as IconComponent,
}

export function ProviderIcon({
  id,
  className = 'h-4 w-4',
  size = 16,
}: {
  id: string
  className?: string
  size?: number
}) {
  const Icon = PROVIDER_ICONS[id] ?? Bot
  return <Icon className={className} size={size} aria-hidden="true" />
}
