import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml } from '../utils/markdown'
import CodeBlock from './CodeBlock'
import HoverPreview from './HoverPreview'

interface ExpandableOutputProps {
  text: string
  maxLines?: number
  language?: string
  code?: boolean
}

export default function ExpandableOutput({
  text,
  maxLines = 20,
  language,
  code = false
}: ExpandableOutputProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const lines = text.split('\n')
  const previewLines = lines.slice(0, maxLines)
  const remaining = lines.length - maxLines

  const renderContent = (content: string) => {
    if (code && language) {
      return <CodeBlock code={content} language={language} showLineNumbers={false} />
    }
    return content.split('\n').map((line, idx) => (
      <div key={idx}>{escapeHtml(line)}</div>
    ))
  }

  if (remaining <= 0) {
    return (
      <div className="tool-output">
        {renderContent(text)}
      </div>
    )
  }

  return (
    <div className="tool-output">
      <div className="output-preview">
        {renderContent(previewLines.join('\n'))}
        <HoverPreview
          content={
            <div 
              className="expand-hint"
              onClick={() => setExpanded(!expanded)}
              style={{ cursor: 'pointer' }}
            >
              ... ({t('components.expandableOutput.moreLinesText', { count: remaining })})
            </div>
          }
          previewContent={
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderContent(text)}
            </div>
          }
        />
      </div>
      {expanded && (
        <div className="output-full">
          {renderContent(text)}
          <div 
            className="expand-hint"
            onClick={() => setExpanded(false)}
            style={{ cursor: 'pointer' }}
          >
            Show less
          </div>
        </div>
      )}
    </div>
  )
}