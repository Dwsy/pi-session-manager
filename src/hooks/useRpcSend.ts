import { useCallback, useEffect, useRef } from 'react'

import { sessionPathMatches } from '../utils/sessionPath'
import type { SessionInfo } from '../types'

interface UseRpcSendOptions {
  session: SessionInfo
  onEnsureSession?: (draftSession: SessionInfo) => Promise<SessionInfo | null>
  rpcSessionReady: boolean
  rpcActiveSessionFile: string | null
  switchSession: (path: string) => Promise<void>
  setRpcSessionReady: React.Dispatch<React.SetStateAction<boolean>>
  sendPrompt: (message: string) => Promise<void>
  sendFollowUp: (message: string) => Promise<void>
  sendSteer: (message: string) => Promise<void>
  forceFollowToBottom: () => void
  scrollToBottom: () => void
  appendOptimisticMessage?: (message: string) => void
}

interface UseRpcSendResult {
  sendPromptMessage: (message: string) => Promise<void>
  sendFollowUpMessage: (message: string) => Promise<void>
  sendSteerMessage: (message: string) => Promise<void>
}

export function useRpcSend({
  session,
  onEnsureSession,
  rpcSessionReady,
  rpcActiveSessionFile,
  switchSession,
  setRpcSessionReady,
  sendPrompt,
  sendFollowUp,
  sendSteer,
  forceFollowToBottom,
  scrollToBottom,
  appendOptimisticMessage,
}: UseRpcSendOptions): UseRpcSendResult {
  const ensureSessionPromiseRef = useRef<Promise<SessionInfo | null> | null>(null)
  const latestSessionPathRef = useRef(session.path)

  useEffect(() => {
    latestSessionPathRef.current = session.path
  }, [session.path])

  const prepareSessionPathForSend = useCallback(async (): Promise<string> => {
    let targetSessionPath = session.path

    if (session.isDraft) {
      if (!onEnsureSession) {
        throw new Error('新会话创建器未配置')
      }
      if (!ensureSessionPromiseRef.current) {
        ensureSessionPromiseRef.current = onEnsureSession(session)
      }
      const ensured = await ensureSessionPromiseRef.current.finally(() => {
        ensureSessionPromiseRef.current = null
      })
      if (!ensured?.path) {
        throw new Error('创建新会话失败，请重试')
      }
      targetSessionPath = ensured.path
      await switchSession(targetSessionPath)
      setRpcSessionReady(true)
      return targetSessionPath
    }

    if (!rpcSessionReady) {
      throw new Error('RPC 会话尚未就绪，请稍候')
    }

    if (rpcActiveSessionFile && !sessionPathMatches(targetSessionPath, rpcActiveSessionFile)) {
      await switchSession(targetSessionPath)
      setRpcSessionReady(true)
    }

    return targetSessionPath
  }, [session, onEnsureSession, switchSession, rpcSessionReady, rpcActiveSessionFile, setRpcSessionReady])

  const ensureSessionNotChanged = useCallback((expectedPath: string) => {
    if (!sessionPathMatches(expectedPath, latestSessionPathRef.current)) {
      throw new Error('会话已切换，已取消发送，请在当前会话重新发送')
    }
  }, [])

  const sendPromptMessage = useCallback(async (message: string) => {
    const expectedPath = session.path
    forceFollowToBottom()
    requestAnimationFrame(() => scrollToBottom())
    await prepareSessionPathForSend()
    ensureSessionNotChanged(expectedPath)
    appendOptimisticMessage?.(message)
    await sendPrompt(message)
  }, [session.path, prepareSessionPathForSend, ensureSessionNotChanged, sendPrompt, forceFollowToBottom, scrollToBottom, appendOptimisticMessage])

  const sendFollowUpMessage = useCallback(async (message: string) => {
    const expectedPath = session.path
    forceFollowToBottom()
    requestAnimationFrame(() => scrollToBottom())
    await prepareSessionPathForSend()
    ensureSessionNotChanged(expectedPath)
    appendOptimisticMessage?.(message)
    await sendFollowUp(message)
  }, [session.path, prepareSessionPathForSend, ensureSessionNotChanged, sendFollowUp, forceFollowToBottom, scrollToBottom, appendOptimisticMessage])

  const sendSteerMessage = useCallback(async (message: string) => {
    const expectedPath = session.path
    forceFollowToBottom()
    requestAnimationFrame(() => scrollToBottom())
    await prepareSessionPathForSend()
    ensureSessionNotChanged(expectedPath)
    appendOptimisticMessage?.(message)
    await sendSteer(message)
  }, [session.path, prepareSessionPathForSend, ensureSessionNotChanged, sendSteer, forceFollowToBottom, scrollToBottom, appendOptimisticMessage])

  return {
    sendPromptMessage,
    sendFollowUpMessage,
    sendSteerMessage,
  }
}
