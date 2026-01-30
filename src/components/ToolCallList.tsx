import type { Content } from '../types'
import BashExecution from './BashExecution'
import ReadExecution from './ReadExecution'
import WriteExecution from './WriteExecution'
import EditExecution from './EditExecution'
import GenericToolCall from './GenericToolCall'

interface ToolCallListProps {
  toolCalls: Content[]
  entries?: any[]
}

export default function ToolCallList({ toolCalls, entries = [] }: ToolCallListProps) {
  const findToolResult = (toolCallId: string) => {
    return entries.find(
      (e: any) => e.type === 'message' &&
      e.message?.role === 'toolResult' &&
      e.message?.content.some((c: any) => c.id === toolCallId)
    )
  }

  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall, index) => {
        const name = toolCall.name || 'unknown'
        const args = toolCall.arguments || {}
        const result = findToolResult(toolCall.id || '')

        const isError = result?.message?.isError || false
        const output = result?.message?.output
        const timestamp = result?.timestamp

        // Route to specific component based on tool name
        switch (name) {
          case 'bash':
            return (
              <BashExecution
                key={index}
                command={args.command || ''}
                output={output}
                exitCode={result?.message?.exitCode}
                cancelled={result?.message?.cancelled}
                timestamp={timestamp}
                entryId={result?.id || `tool-${index}`}
              />
            )

          case 'read':
            return (
              <ReadExecution
                key={index}
                filePath={args.file_path || args.path || ''}
                offset={args.offset}
                limit={args.limit}
                output={output}
                images={result?.message?.content?.filter((c: any) => c.type === 'image') || []}
                timestamp={timestamp}
              />
            )

          case 'write':
            return (
              <WriteExecution
                key={index}
                filePath={args.file_path || args.path || ''}
                content={args.content || ''}
                output={output}
                timestamp={timestamp}
              />
            )

          case 'edit':
            return (
              <EditExecution
                key={index}
                filePath={args.file_path || args.path || ''}
                diff={result?.details?.diff}
                output={output}
                timestamp={timestamp}
              />
            )

          default:
            return (
              <GenericToolCall
                key={index}
                name={name}
                arguments={args}
                output={output}
                isError={isError}
                timestamp={timestamp}
              />
            )
        }
      })}
    </div>
  )
}