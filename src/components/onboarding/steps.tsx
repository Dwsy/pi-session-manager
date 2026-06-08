import type { ReactNode } from 'react'
import { FolderOpen, Search, GitBranch, Settings, Sparkles, Server, Bot } from 'lucide-react'

export interface OnboardingStepConfig {
  icon: ReactNode
  titleKey: string
  descriptionKey: string
  hintKey?: string
  interactiveKind?: 'services' | 'subagents'
}

export const ONBOARDING_STEPS: readonly OnboardingStepConfig[] = [
  {
    icon: <Sparkles className="h-12 w-12 text-info" />,
    titleKey: 'onboarding.steps.welcome.title',
    descriptionKey: 'onboarding.steps.welcome.description',
  },
  {
    icon: <FolderOpen className="h-12 w-12 text-blue-400" />,
    titleKey: 'onboarding.steps.browse.title',
    descriptionKey: 'onboarding.steps.browse.description',
    hintKey: 'onboarding.steps.browse.hint',
  },
  {
    icon: <Search className="h-12 w-12 text-emerald-400" />,
    titleKey: 'onboarding.steps.search.title',
    descriptionKey: 'onboarding.steps.search.description',
    hintKey: 'onboarding.steps.search.hint',
  },
  {
    icon: <GitBranch className="h-12 w-12 text-purple-400" />,
    titleKey: 'onboarding.steps.tree.title',
    descriptionKey: 'onboarding.steps.tree.description',
    hintKey: 'onboarding.steps.tree.hint',
  },
  {
    icon: <Server className="h-12 w-12 text-orange-400" />,
    titleKey: 'onboarding.steps.services.title',
    descriptionKey: 'onboarding.steps.services.description',
    interactiveKind: 'services',
  },
  {
    icon: <Bot className="h-12 w-12 text-cyan-400" />,
    titleKey: 'onboarding.steps.subagents.title',
    descriptionKey: 'onboarding.steps.subagents.description',
    interactiveKind: 'subagents',
  },
  {
    icon: <Settings className="h-12 w-12 text-amber-400" />,
    titleKey: 'onboarding.steps.settings.title',
    descriptionKey: 'onboarding.steps.settings.description',
    hintKey: 'onboarding.steps.settings.hint',
  },
]
