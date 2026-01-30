import { escapeHtml } from '../utils/markdown'
import { formatDate } from '../utils/format'

interface ModelChangeProps {
  provider?: string
  modelId?: string
  timestamp?: string
}

export default function ModelChange({ provider, modelId, timestamp }: ModelChangeProps) {
  return (
    <div className="model-change">
      {timestamp && <span>{formatDate(timestamp)}</span>}
      <span>Switched to model: </span>
      <span className="model-name">
        {escapeHtml(provider ? `${provider}/${modelId}` : modelId || 'unknown')}
      </span>
    </div>
  )
}