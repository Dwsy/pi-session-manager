// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PiLiveChatInput, { type MeshInputBinding } from './PiLiveChatInput'

const live = vi.hoisted(() => ({
  prompt: vi.fn(), steer: vi.fn(), followUp: vi.fn(), abort: vi.fn(), getCommands: vi.fn(),
}))
vi.mock('@/hooks/usePiLive', () => ({
  usePiLive: () => ({
    sessions: [{ sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isStreaming: true }],
    isEnabled: false, // Bridge / Pi Live disabled: Mesh must still work
    ...live,
  }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const mockBinding = (overrides: Partial<MeshInputBinding> = {}): MeshInputBinding => ({
  kind: 'mesh',
  available: true,
  isRunning: true,
  send: vi.fn().mockResolvedValue({ ok: true, disposition: 'started' }),
  cancel: vi.fn().mockResolvedValue({ ok: true }),
  ...overrides,
})

const noLiveControls = () => {
  for (const fn of [live.prompt, live.steer, live.followUp, live.abort, live.getCommands]) {
    expect(fn).not.toHaveBeenCalled()
  }
}

describe('Mesh-bound PSM shared composer (no Pi Live fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })
  afterEach(() => cleanup())

  it('sends slash-like Enter and Alt+Enter exclusively through Mesh and stops through Mesh', async () => {
    const binding = mockBinding()
    render(<PiLiveChatInput sessionId={target} binding={binding} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '/project --test' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(binding.send).toHaveBeenCalledWith('/project --test', 'followUp'))

    fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
    fireEvent.change(textarea, { target: { value: 'urgent message' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(binding.send).toHaveBeenCalledWith('urgent message', 'steer'))

    fireEvent.change(textarea, { target: { value: 'after current turn' } })
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true })
    await waitFor(() => expect(binding.send).toHaveBeenCalledWith('after current turn', 'followUp'))

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(binding.cancel).toHaveBeenCalledTimes(1))
    noLiveControls()
  })

  it('never routes to Live when Mesh is unavailable even if Pi Live is streaming', async () => {
    const binding = mockBinding({ available: false })
    render(<PiLiveChatInput sessionId={target} binding={binding} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'retain this draft' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true })
    expect((textarea as HTMLTextAreaElement).value).toBe('retain this draft')
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(binding.send).not.toHaveBeenCalled()
    expect(binding.cancel).not.toHaveBeenCalled()
    noLiveControls()
  })

  it('IME Enter does not send and a delayed receipt does not erase a newer draft or another target', async () => {
    let accepted!: (value: { ok: true }) => void
    const binding = mockBinding({ send: vi.fn().mockImplementation(() => new Promise((resolve) => { accepted = resolve })) })
    const rendered = render(<PiLiveChatInput sessionId={target} binding={binding} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'first version' } })
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 })
    expect(binding.send).not.toHaveBeenCalled()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(binding.send).toHaveBeenCalledTimes(1)
    fireEvent.change(textarea, { target: { value: 'updated while sending' } })

    rendered.rerender(<PiLiveChatInput sessionId={second} binding={mockBinding()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft B' } })
    accepted({ ok: true })
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft B'))
    rendered.rerender(<PiLiveChatInput sessionId={target} binding={binding} />)
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('updated while sending'))
    noLiveControls()
  })
})
