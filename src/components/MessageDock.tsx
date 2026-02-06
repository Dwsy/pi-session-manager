import { forwardRef } from 'react'

import MessageInput from './MessageInput'
import ModelSelector, { type RPCModel } from './ModelSelector'
import ThinkingLevelSelector, { type ThinkingLevel } from './ThinkingLevelSelector'

interface MessageDockProps {
  sessionKey: string
  enabled: boolean
  isStreaming: boolean
  disabledReason: string | null
  commands: string[]
  models: RPCModel[]
  currentModel: RPCModel | null
  modelLoading: boolean
  modelError: string | null
  thinkingLevel: ThinkingLevel | null
  onSelectModel: (model: RPCModel) => void
  onSelectThinkingLevel: (level: ThinkingLevel) => void
  onSendPrompt: (message: string) => Promise<void>
  onSendFollowUp: (message: string) => Promise<void>
  onSendSteer: (message: string) => Promise<void>
  onAbort: () => Promise<void>
  onFileQuery: (query: string) => Promise<string[]>
  contextLabel: string
  contextHint: string
}

const MessageDock = forwardRef<HTMLDivElement, MessageDockProps>(function MessageDock(
  {
    sessionKey,
    enabled,
    isStreaming,
    disabledReason,
    commands,
    models,
    currentModel,
    modelLoading,
    modelError,
    thinkingLevel,
    onSelectModel,
    onSelectThinkingLevel,
    onSendPrompt,
    onSendFollowUp,
    onSendSteer,
    onAbort,
    onFileQuery,
    contextLabel,
    contextHint,
  },
  ref
) {
  return (
    <div className="message-input-wrapper" ref={ref}>
      <MessageInput
        sessionKey={sessionKey}
        isStreaming={isStreaming}
        onSend={onSendPrompt}
        onFollowUp={onSendFollowUp}
        onSteer={onSendSteer}
        onAbort={onAbort}
        commands={commands}
        onFileQuery={onFileQuery}
        disabled={!enabled}
        disabledReason={disabledReason}
        contextLabel={contextLabel}
        contextHint={contextHint}
        contextControls={
          <>
            <ModelSelector
              models={models}
              currentModel={currentModel}
              onSelect={onSelectModel}
              loading={modelLoading}
              disabled={modelLoading || !!modelError}
            />
            <ThinkingLevelSelector
              currentLevel={thinkingLevel}
              onSelect={onSelectThinkingLevel}
              disabled={modelLoading || !!modelError}
            />
          </>
        }
      />
    </div>
  )
})

export default MessageDock
