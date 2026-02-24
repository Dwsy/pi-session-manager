import type { Content } from '../types'
import BashExecution from './BashExecution'
import ReadExecution from './ReadExecution'
import WriteExecution from './WriteExecution'
import EditExecution from './EditExecution'
import GenericToolCall from './GenericToolCall'
import SubagentToolCall from './SubagentToolCall'

interface ToolCallListProps {
  toolCalls: Content[]
  entries?: any[]
}

export default function ToolCallList({ toolCalls, entries = [] }: ToolCallListProps) {
  const findToolResult = (toolCallId: string) => {
    return entries.find(
      (e: any) => e.type === 'message' &&
      e.message?.role === 'toolResult' &&
      e.message?.toolCallId === toolCallId
    )
  }

  const getToolResultContent = (toolCallId: string) => {
    const result = findToolResult(toolCallId)
    if (!result?.message?.content) return null

    return result.message.content[0] || null
  }

  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall, index) => {
        const name = toolCall.name || 'unknown'
        const args = toolCall.arguments || {}
        const toolCallId = toolCall.id || ''
        const result = findToolResult(toolCallId)
        const toolResultContent = getToolResultContent(toolCallId)

        const isError = result?.message?.isError || toolResultContent?.isError || false

        const output = toolResultContent?.text || toolResultContent?.output || result?.message?.output || ''

        const diff = toolResultContent?.details?.diff || toolResultContent?.diff || result?.message?.details?.diff
        const timestamp = result?.timestamp

        const entryId = result?.id || `tool-${toolCallId || index}`

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
                entryId={entryId}
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
                images={toolResultContent?.content?.filter((c: any) => c.type === 'image') || []}
                timestamp={timestamp}
                entryId={entryId}
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
                entryId={entryId}
              />
            )

          case 'edit':
            return (
              <EditExecution
                key={index}
                filePath={args.file_path || args.path || ''}
                diff={diff}
                output={output}
                timestamp={timestamp}
                entryId={entryId}
              />
            )

          case 'subagent':
            return (
              <SubagentToolCall
                key={index}
                arguments={args}
                details={result?.message?.details}
                output={output}
                timestamp={timestamp}
                entryId={entryId}
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
                entryId={entryId}
              />
            )
        }
      })}
    </div>
  )
}
