import { useTranslation } from 'react-i18next'
import { escapeHtml } from '@/utils/markdown'

interface ModelChangeProps {
  provider?: string
  modelId?: string
  timestamp?: string
}

export default function ModelChange({ provider, modelId }: ModelChangeProps) {
  const { t } = useTranslation()
  const fullModelName = provider ? `${provider}/${modelId}` : modelId || t('components.toolCall.unknown')

  return (
    <div className="model-change">
      <svg className="model-change-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2L3 5V11L8 14L13 11V5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 8L3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 8V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 8L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="model-change-text">
        {t('components.modelChange.switchedToModel')} <span className="model-change-name">{escapeHtml(fullModelName)}</span>
      </span>
    </div>
  )
}