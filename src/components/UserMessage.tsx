import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Streamdown } from 'streamdown'
import type { BundledTheme } from 'shiki'

import MermaidBlock from './MermaidBlock'

import { useAllSettings } from '../hooks/useAllSettings'
import { useCodeTheme } from '../hooks/useCodeTheme'
import { useStreamdownPlugins } from '../hooks/useStreamdownPlugins'
import { formatDate } from '../utils/format'
import { splitMermaidSegments } from '../utils/mermaid'

import type { Content } from '../types'

interface UserMessageProps {
  id: string
  timestamp?: string
  content: Content[]
  className?: string
}

export default memo(function UserMessage({ id, timestamp, content, className = '' }: UserMessageProps) {
  const { t } = useTranslation()
  const { settings } = useAllSettings()
  const theme = useCodeTheme()
  const shikiTheme = useMemo(
    () => [theme as BundledTheme, theme as BundledTheme] as [BundledTheme, BundledTheme],
    [theme]
  )
  const streamdownPlugins = useStreamdownPlugins(theme)
  
  // Extract images
  const images = content.filter(c => c.type === 'image' && c.data)

  // Extract text content
  const text = useMemo(() => {
    const textItems = content.filter(c => c.type === 'text' && c.text)
    return textItems.map(c => c.text).join('\n')
  }, [content])

  const segments = useMemo(() => splitMermaidSegments(text), [text])

  return (
    <div className={`user-message ${className}`} id={`entry-${id}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}

      {images.length > 0 && (
        <div className="message-images">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              className="message-image"
              alt={t('components.userMessage.imageAlt')}
            />
          ))}
        </div>
      )}

      {segments.map((segment, index) => {
        if (segment.type === 'mermaid') {
          return (
            <MermaidBlock
              key={`mermaid-${id}-${index}`}
              code={segment.content}
              mode={settings.appearance.mermaidRenderMode}
            />
          )
        }

        return (
          <div key={`text-${id}-${index}`} className="markdown-content">
            <Streamdown mode="static" shikiTheme={shikiTheme} plugins={streamdownPlugins}>
              {segment.content}
            </Streamdown>
          </div>
        )
      })}
    </div>
  )
})
