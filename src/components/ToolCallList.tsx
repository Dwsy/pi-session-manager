import type { Content, SessionEntry } from '../types'
import BashExecution from './BashExecution'
import ReadExecution from './ReadExecution'
import WriteExecution from './WriteExecution'
import EditExecution from './EditExecution'
import GenericToolCall from './GenericToolCall'
import SubagentToolCall from './SubagentToolCall'
import { resolveToolCallDisplayData } from '../utils/toolCallDisplay'

interface ToolCallListProps {
  toolCalls: Content[]
  toolResultByCallId?: Map<string, SessionEntry>
  searchQuery?: string
}

function ToolCallList({
  toolCalls,
  toolResultByCallId = new Map(),
  searchQuery = '',
}: ToolCallListProps) {
  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall, index) => {
        const {
          name,
          args,
          entryId,
          result,
          output,
          diff,
          isError,
          images,
        } = resolveToolCallDisplayData(toolCall, index, toolResultByCallId)

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
                searchQuery={searchQuery}
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
                images={images}
                entryId={entryId}
                searchQuery={searchQuery}
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
                searchQuery={searchQuery}
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
                searchQuery={searchQuery}
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
                searchQuery={searchQuery}
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
                searchQuery={searchQuery}
              />
            )
        }
      })}
    </div>
  )
}

export default ToolCallList
