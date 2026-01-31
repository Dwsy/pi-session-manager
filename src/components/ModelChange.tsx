import { useTranslation } from 'react-i18next'
import { escapeHtml } from '../utils/markdown'
import { formatDate } from '../utils/format'

interface ModelChangeProps {
  provider?: string
  modelId?: string
  timestamp?: string
}

export default function ModelChange({ provider, modelId, timestamp }: ModelChangeProps) {
  const { t } = useTranslation()
  return (
    <div className="model-change">
      {timestamp && <span>{formatDate(timestamp)}</span>}
      <span>{t('components.modelChange.switchedToModel')} </span>
      <span className="model-name">
        {escapeHtml(provider ? `${provider}/${modelId}` : modelId || t('components.toolCall.unknown'))}
      </span>
    </div>
  )
}