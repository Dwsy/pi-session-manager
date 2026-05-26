import { invoke as baseInvoke, isTauri } from '@/transport'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen } from '@tauri-apps/api/event'
import type { PsmTransport } from '@pi-session-manager/plugin-sdk'

async function invokeRuntimeSessionCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T | undefined> {
  const {
    getRuntimeSessionLabels,
    getSessionRuntimeMode,
    readRuntimeSessionChunk,
  } = await import('@/runtime-data/sessionSource')

  if (getSessionRuntimeMode() === 'backend') return undefined

  const path = typeof payload?.path === 'string' ? payload.path : ''
  if (command === 'read_session_file_chunk' && path) {
    return readRuntimeSessionChunk(
      path,
      typeof payload?.offset === 'number' ? payload.offset : 0,
      typeof payload?.maxBytes === 'number' ? payload.maxBytes : undefined,
    ) as Promise<T>
  }
  if (command === 'get_session_labels' && path) {
    return getRuntimeSessionLabels(path) as Promise<T>
  }

  return undefined
}

export const appPsmTransport: PsmTransport = {
  async invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    if (isTauri()) {
      return tauriInvoke<T>('plugin_dispatch_command', {
        command,
        payload: (payload ?? {}) as Record<string, unknown>,
      })
    }
    if (command === 'read_session_file_chunk' || command === 'get_session_labels') {
      const runtimeResult = await invokeRuntimeSessionCommand<T>(command, payload)
      if (runtimeResult !== undefined) return runtimeResult
    }
    return baseInvoke<T>(command, payload)
  },
  stream(command, payload, handlers) {
    if (!isTauri() || command !== 'invoke_model_text_stream') {
      return undefined
    }

    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const eventName = `psm-ai-stream:${requestId}`

    return new Promise(async (resolve, reject) => {
      let settled = false
      let unlisten: (() => void) | null = null

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        unlisten?.()
        fn()
      }

      try {
        unlisten = await tauriListen(eventName, (event) => {
          const payload = event.payload as { type?: string; error?: string; response?: unknown }
          handlers.onEvent?.(payload as never)

          if (payload.type === 'done') {
            finish(() => resolve(payload.response as never))
          } else if (payload.type === 'error') {
            const message = payload.error || 'AI stream failed'
            handlers.onError?.(message)
            finish(() => reject(new Error(message)))
          }
        })

        await tauriInvoke('plugin_dispatch_command', {
          command,
          payload: {
            ...(payload ?? {}),
            requestId,
          },
        })
      } catch (error) {
        if (settled) return
        const message = error instanceof Error ? error.message : String(error)
        handlers.onError?.(message)
        finish(() => reject(error instanceof Error ? error : new Error(message)))
      }
    })
  },
}
