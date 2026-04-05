import { useTranslation } from 'react-i18next'
import { Brain } from 'lucide-react'
import { formatDate } from '@/utils/format'

interface ThinkingLevelChangeProps {
  thinkingLevel?: string
  timestamp?: string
}

export default function ThinkingLevelChange({ thinkingLevel, timestamp }: ThinkingLevelChangeProps) {
  const { t } = useTranslation()

  const levelLabels: Record<string, string> = {
    low: t('components.thinkingLevel.low', 'Low'),
    medium: t('components.thinkingLevel.medium', 'Medium'),
    high: t('components.thinkingLevel.high', 'High'),
  }

  const level = thinkingLevel?.toLowerCase() || 'medium'
  const levelLabel = levelLabels[level] || level

  return (
    <div className="thinking-level-change flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-500/30 rounded-lg bg-purple-500/10 my-1">
      <Brain className="h-3.5 w-3.5 text-purple-500" />
      <span className="text-purple-500">
        {t('components.thinkingLevel.changed', { level: levelLabel })}
      </span>
      {timestamp && (
        <span className="text-xs text-muted-foreground/60 ml-auto">
          {formatDate(timestamp)}
        </span>
      )}
    </div>
  )
}
