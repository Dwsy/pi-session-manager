import type { Content, SessionEntry } from '../types'
import BashExecution from './BashExecution'
import ReadExecution from './ReadExecution'
import WriteExecution from './WriteExecution'
import EditExecution from './EditExecution'
import GenericToolCall from './GenericToolCall'
import SubagentToolCall from './SubagentToolCall'

type ToolResultContent = {
  type?: string
  text?: string
  output?: string
  isError?: boolean
  diff?: string
  details?: { diff?: string }
  content?: Array<{ type?: string; mimeType?: string; data?: string; [key: string]: any }>
}

interface ToolCallListProps {
  toolCalls: Content[]
  toolResultByCallId?: Map<string, SessionEntry>
}

function ToolCallList({ toolCalls, toolResultByCallId = new Map() }: ToolCallListProps) {
  const getToolResult = (toolCallId: string) => {
    if (!toolCallId) return undefined
    return toolResultByCallId.get(toolCallId)
  }

  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall, index) => {
        const name = toolCall.name || 'unknown'
        const args = toolCall.arguments || {}
        const toolCallId = toolCall.id || ''
        const result = getToolResult(toolCallId)
        const toolResultContent = (result?.message?.content?.[0] || null) as ToolResultContent | null

        const isError = result?.message?.isError || toolResultContent?.isError || false

        const output = toolResultContent?.text || toolResultContent?.output || result?.message?.output || ''

        const detailsWithDiff = result?.message?.details as { diff?: string } | undefined
        const diff = toolResultContent?.details?.diff || toolResultContent?.diff || detailsWithDiff?.diff

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
                images={toolResultContent?.content?.filter((c): c is { type: 'image'; mimeType: string; data: string } => c.type === 'image' && typeof c.mimeType === 'string' && typeof c.data === 'string') || []}
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
                isError={isError}
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
                entryId={entryId}
              />
            )
        }
      })}
    </div>
  )
}

export default ToolCallList
