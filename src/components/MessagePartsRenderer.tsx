import { useMemo, type ReactNode } from 'react'
import { Streamdown } from 'streamdown'
import type { BundledTheme } from 'shiki'

import MermaidBlock from './MermaidBlock'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from './ToolCallList'

import { useSessionView } from '../contexts/SessionViewContext'
import { useAllSettings } from '../hooks/useAllSettings'
import { useCodeTheme } from '../hooks/useCodeTheme'
import { useStreamdownPlugins } from '../hooks/useStreamdownPlugins'
import { splitMermaidSegments } from '../utils/mermaid'

import type { Content, SessionEntry } from '../types'

interface MessagePartsRendererProps {
  role: string
  content: Content[]
  entries?: SessionEntry[]
  showToolCalls?: boolean
  hiddenToolCallIds?: string[]
  isStreaming?: boolean
}

export default function MessagePartsRenderer({
  role,
  content,
  entries = [],
  showToolCalls = true,
  hiddenToolCallIds = [],
  isStreaming = false,
}: MessagePartsRendererProps) {
  const { showThinking } = useSessionView()
  const { settings } = useAllSettings()
  const codeTheme = useCodeTheme()
  const shikiTheme = useMemo(
    () => [codeTheme as BundledTheme, codeTheme as BundledTheme] as [BundledTheme, BundledTheme],
    [codeTheme]
  )
  const streamdownPlugins = useStreamdownPlugins(codeTheme)
  const hiddenIdSet = new Set(hiddenToolCallIds)
  const toolCalls: Content[] = []
  const renderedParts: ReactNode[] = []

  content.forEach((part, index) => {
    if (part.type === 'toolCall') {
      if (!part.id || !hiddenIdSet.has(part.id)) {
        toolCalls.push(part)
      }
      return
    }
    if (part.type === 'thinking' && part.thinking) {
      if (role === 'assistant' && showThinking) {
        renderedParts.push(
          <ThinkingBlock key={`thinking-${index}`} content={part.thinking} />
        )
      }
      return
    }
    if (part.type === 'text' && part.text) {
      const segments = splitMermaidSegments(part.text)
      const lastMarkdownIndex = segments
        .map((segment, segmentIndex) => (segment.type === 'markdown' ? segmentIndex : -1))
        .filter(segmentIndex => segmentIndex >= 0)
        .pop()

      segments.forEach((segment, segmentIndex) => {
        if (segment.type === 'mermaid') {
          renderedParts.push(
            <MermaidBlock
              key={`mermaid-${index}-${segmentIndex}`}
              code={segment.content}
              mode={settings.appearance.mermaidRenderMode}
            />
          )
          return
        }

        const showCursor = Boolean(isStreaming && segmentIndex === lastMarkdownIndex)
        renderedParts.push(
          <div key={`text-${index}-${segmentIndex}`} className="assistant-text streaming-text markdown-content">
            <Streamdown
              mode={isStreaming ? 'streaming' : 'static'}
              isAnimating={isStreaming}
              shikiTheme={shikiTheme}
              plugins={streamdownPlugins}
            >
              {segment.content}
            </Streamdown>
            {showCursor && <span className="streaming-cursor" aria-hidden="true" />}
          </div>
        )
      })
    }
  })

  return (
    <>
      {renderedParts}
      {role === 'assistant' && showToolCalls && toolCalls.length > 0 && (
        <ToolCallList toolCalls={toolCalls} entries={entries} />
      )}
    </>
  )
}
