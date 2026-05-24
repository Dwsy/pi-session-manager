import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  baseInvoke: vi.fn(),
  isTauri: vi.fn(),
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('@/transport', () => ({
  invoke: mocks.baseInvoke,
  isTauri: mocks.isTauri,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.tauriInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.tauriListen,
}))

vi.mock('@/runtime-data/sessionSource', () => ({
  getRuntimeSessionLabels: vi.fn(),
  getSessionRuntimeMode: vi.fn(() => 'backend'),
  readRuntimeSessionChunk: vi.fn(),
}))

import { appPsmTransport } from '../appTransport'

describe('appPsmTransport', () => {
  beforeEach(() => {
    mocks.baseInvoke.mockReset()
    mocks.isTauri.mockReset()
    mocks.tauriInvoke.mockReset()
    mocks.tauriListen.mockReset()
  })

  it('falls back to non-stream transports outside Tauri', () => {
    mocks.isTauri.mockReturnValue(false)

    const result = appPsmTransport.stream?.('invoke_model_text_stream', {}, {})

    expect(result).toBeUndefined()
    expect(mocks.tauriListen).not.toHaveBeenCalled()
    expect(mocks.tauriInvoke).not.toHaveBeenCalled()
  })

  it('bridges sidechat stream events through Tauri events', async () => {
    mocks.isTauri.mockReturnValue(true)
    const unlisten = vi.fn()
    let eventName = ''
    let listener: ((event: { payload: unknown }) => void) | null = null

    mocks.tauriListen.mockImplementation(async (name, callback) => {
      eventName = name
      listener = callback
      return unlisten
    })
    mocks.tauriInvoke.mockImplementation(async (command, payload) => {
      expect(command).toBe('plugin_dispatch_command')
      expect(payload).toMatchObject({
        command: 'invoke_model_text_stream',
        payload: {
          systemPrompt: 'You are helpful',
          prompt: 'Summarize',
        },
      })
      expect(payload.payload.requestId).toMatch(/^ai-/)
      expect(eventName).toBe(`psm-ai-stream:${payload.payload.requestId}`)

      listener?.({ payload: { type: 'delta', delta: 'hello' } })
      listener?.({
        payload: {
          type: 'done',
          response: { text: 'hello', provider: 'local', model: 'test' },
        },
      })
    })

    const events: unknown[] = []
    const response = await appPsmTransport.stream?.(
      'invoke_model_text_stream',
      { systemPrompt: 'You are helpful', prompt: 'Summarize' },
      { onEvent: (event) => events.push(event) },
    )

    expect(response).toEqual({ text: 'hello', provider: 'local', model: 'test' })
    expect(events).toEqual([
      { type: 'delta', delta: 'hello' },
      { type: 'done', response: { text: 'hello', provider: 'local', model: 'test' } },
    ])
    expect(unlisten).toHaveBeenCalledOnce()
  })
})
