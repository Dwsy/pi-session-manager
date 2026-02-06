import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '../transport'
import { rpcError } from '../utils/rpcDebug'

import type { RPCModel } from '../components/ModelSelector'
import type { ThinkingLevel } from '../components/ThinkingLevelSelector'

interface UseRpcModelStateOptions {
  enabled: boolean
  rpcConnected: boolean
  rpcSessionReady: boolean
  restartRPC: (piPath?: string) => Promise<void>
  piPath?: string
}

interface UseRpcModelStateResult {
  models: RPCModel[]
  currentModel: RPCModel | null
  thinkingLevel: ThinkingLevel | null
  commands: string[]
  contextLabel: string
  contextHint: string
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  selectModel: (model: RPCModel) => Promise<void>
  selectThinkingLevel: (level: ThinkingLevel) => Promise<void>
  clearError: () => void
}

function normalizeThinkingLevel(value: unknown): ThinkingLevel | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  switch (normalized) {
    case 'off':
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return normalized
    default:
      return null
  }
}

function extractContextWindowSize(model: RPCModel | null | undefined): number | null {
  if (!model) return null
  const anyModel = model as RPCModel & { context_window?: number; contextWindow?: number }
  const candidate = anyModel.context_window ?? anyModel.contextWindow
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
    return candidate
  }
  return null
}

function formatCostUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

export function useRpcModelState({
  enabled,
  rpcConnected,
  rpcSessionReady,
  restartRPC,
  piPath,
}: UseRpcModelStateOptions): UseRpcModelStateResult {
  const [models, setModels] = useState<RPCModel[]>([])
  const [currentModel, setCurrentModel] = useState<RPCModel | null>(null)
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(null)
  const [commands, setCommands] = useState<string[]>([])
  const [contextLabel, setContextLabel] = useState('上下文')
  const [contextHint, setContextHint] = useState('上下文窗口数据未就绪')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retryRef = useRef<NodeJS.Timeout | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled || !rpcConnected || !rpcSessionReady) return
    setLoading(true)
    setError(null)
    try {
      const state = await invoke<{ model?: RPCModel; thinking_level?: string; thinkingLevel?: string }>('get_rpc_state')
      if (state?.model) {
        setCurrentModel(state.model)
      }
      setThinkingLevel(normalizeThinkingLevel(state?.thinking_level ?? state?.thinkingLevel))

      const availableModels = await invoke<RPCModel[]>('get_rpc_available_models')
      setModels(availableModels)
      const commandList = await invoke<{ name: string }[]>('get_rpc_commands')
      setCommands(commandList.map(command => command.name))

      try {
        const stats = await invoke<{ tokens?: { total?: number }; cost?: number }>('get_rpc_session_stats')
        const contextWindow = extractContextWindowSize(state?.model ?? null)
        const totalTokens = stats?.tokens?.total
        const totalCost = typeof stats?.cost === 'number' ? stats.cost : null

        const hintParts: string[] = []
        let label = '上下文'

        if (typeof totalTokens === 'number' && contextWindow && contextWindow > 0) {
          const usage = Math.min((totalTokens / contextWindow) * 100, 100)
          const usageText = `${usage.toFixed(0)}%`
          label = `上下文 ${usageText}`
          hintParts.push(
            `窗口占用 ${usageText}（${totalTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens）`
          )
        } else if (typeof totalTokens === 'number') {
          label = `上下文 ${Math.round(totalTokens / 1000)}k`
          hintParts.push(`已累计 ${totalTokens.toLocaleString()} tokens`)
        } else if (contextWindow && contextWindow > 0) {
          label = '上下文'
          hintParts.push(`当前模型上下文窗口 ${contextWindow.toLocaleString()} tokens`)
        }

        if (totalCost !== null) {
          hintParts.push(`累计成本 ${formatCostUsd(totalCost)}`)
        }

        setContextLabel(label)
        setContextHint(hintParts.length > 0 ? hintParts.join(' · ') : '上下文窗口数据未就绪')
      } catch {
        setContextLabel('上下文')
        setContextHint('上下文窗口数据未就绪')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const transientFailure =
        message.includes('RPC client not connected') ||
        message.includes('Timeout waiting for response') ||
        message.includes('Broken pipe') ||
        message.includes('Failed to write to stdin') ||
        message.includes('Response channel closed')

      if (transientFailure) {
        if (message.includes('Broken pipe') || message.includes('Failed to write to stdin')) {
          try {
            await restartRPC(piPath)
          } catch (restartErr) {
            rpcError('SessionViewer', 'failed to restart rpc for model reload', restartErr)
          }
        }
        if (!retryRef.current) {
          retryRef.current = setTimeout(() => {
            retryRef.current = null
            if (enabled && rpcConnected && rpcSessionReady) {
              void refresh()
            }
          }, 800)
        }
      } else {
        rpcError('SessionViewer', 'failed to load rpc models', err)
        setError(err instanceof Error ? err.message : '模型加载失败')
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, rpcConnected, rpcSessionReady, restartRPC, piPath])

  const selectModel = useCallback(async (model: RPCModel) => {
    try {
      await invoke('set_rpc_model', { provider: model.provider, modelId: model.id })
      setCurrentModel(model)
    } catch (err) {
      console.error('[SessionViewer] Failed to set model:', err)
    }
  }, [])

  const selectThinkingLevel = useCallback(async (level: ThinkingLevel) => {
    try {
      await invoke('set_rpc_thinking_level', { level })
      setThinkingLevel(level)
    } catch (err) {
      console.error('[SessionViewer] Failed to set thinking level:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current)
        retryRef.current = null
      }
    }
  }, [refresh])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    models,
    currentModel,
    thinkingLevel,
    commands,
    contextLabel,
    contextHint,
    loading,
    error,
    refresh,
    selectModel,
    selectThinkingLevel,
    clearError,
  }
}
