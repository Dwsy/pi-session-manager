import type { Content } from '../types'
import ThinkingBlock from './ThinkingBlock'
import { useSessionView } from '../contexts/SessionViewContext'

interface StreamingMessageProps {
  content: Content[]
}

export default function StreamingMessage({ content }: StreamingMessageProps) {
  const { showThinking } = useSessionView()
  const textBlocks = content.filter(c => c.type === 'text' && c.text)
  const thinkingBlocks = content.filter(c => c.type === 'thinking' && c.thinking)
  const text = textBlocks.map(block => block.text ?? '').join('')
  const thinking = thinkingBlocks.map(block => block.thinking ?? '').join('')

  return (
    <div className="assistant-message streaming-message">
      <div className="streaming-row">
        <span className="streaming-indicator" />
        <div className="streaming-body">
          {showThinking && thinking && (
            <ThinkingBlock content={thinking} />
          )}

          {text ? (
            <div className="assistant-text streaming-text">
              <span className="streaming-plain">{text}</span>
              <span className="streaming-cursor" aria-hidden="true" />
            </div>
          ) : (
            <div className="assistant-text streaming-placeholder">
              正在生成...
              <span className="streaming-cursor" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
