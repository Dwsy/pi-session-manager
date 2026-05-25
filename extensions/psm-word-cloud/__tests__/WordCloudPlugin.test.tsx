// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../host-react', () => ({
  hostReact: () => React,
}))

import activate, { layoutWordCloudWords } from '../index'
import type { SessionInfo } from '@/types'

const canvasContexts: Array<Record<string, any>> = []

const session: SessionInfo = {
  id: 'session-1',
  path: '/tmp/session-1.jsonl',
  name: 'Session 1',
  cwd: '/tmp/project',
  modified: '2026-05-24T12:00:00.000Z',
  message_count: 3,
  first_message: 'alpha alpha beta',
  last_message: 'gamma',
  last_message_role: 'user',
}

function createPluginContext() {
  const appViews: any[] = []
  const appSidebarViews: any[] = []
  const commands: any[] = []
  const readEntries = vi.fn().mockRejectedValue(new Error('word cloud must not read JSONL entries'))
  const configRead = vi.fn().mockResolvedValue([])
  const configWrite = vi.fn().mockResolvedValue(undefined)

  const ctx = {
    settings: {
      get: (_key: string, fallback: unknown) => fallback,
    },
    psm: {
      sessions: {
        readEntries,
      },
      config: {
        read: configRead,
        write: configWrite,
      },
    },
    ui: {
      registerAppView: (view: any) => appViews.push(view),
      registerAppSidebarView: (view: any) => appSidebarViews.push(view),
    },
    registerCommand: (command: any) => commands.push(command),
  }

  activate(ctx as any)
  return { appViews, appSidebarViews, commands, readEntries, configRead, configWrite }
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

beforeEach(() => {
  canvasContexts.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 9 })),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    }
    canvasContexts.push(context)
    return context as unknown as CanvasRenderingContext2D
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('word cloud plugin', () => {
  it('scales canvas word sizes by frequency', () => {
    const layout = layoutWordCloudWords([
      { word: 'alpha', count: 100 },
      { word: 'beta', count: 30 },
      { word: 'gamma', count: 5 },
    ], 720, 420, (text, fontSize) => text.length * fontSize * 0.58)

    expect(layout[0].fontSize).toBeGreaterThanOrEqual(72)
    expect(layout[0].fontSize).toBeGreaterThan(layout[1].fontSize)
    expect(layout[1].fontSize).toBeGreaterThan(layout[2].fontSize)
    expect(layout[0].fontSize / layout[2].fontSize).toBeGreaterThan(2)
  })

  it('lays out canvas words without overlapping rectangles', () => {
    const words = [
      { word: 'alpha', count: 20 },
      { word: 'beta', count: 18 },
      { word: 'gamma', count: 16 },
      { word: 'delta', count: 14 },
      { word: 'epsilon', count: 12 },
      { word: 'zeta', count: 10 },
      { word: 'theta', count: 8 },
      { word: 'lambda', count: 6 },
    ]
    const layout = layoutWordCloudWords(words, 720, 420, (text, fontSize) => text.length * fontSize * 0.58)

    expect(layout.length).toBe(words.length)
    for (let i = 0; i < layout.length; i += 1) {
      for (let j = i + 1; j < layout.length; j += 1) {
        expect(overlaps(layout[i], layout[j])).toBe(false)
      }
    }
  })

  it('fits the default 50-word cloud density on one screen', () => {
    const words = Array.from({ length: 50 }, (_item, index) => ({
      word: `word${index}`,
      count: 100 - index,
    }))
    const layout = layoutWordCloudWords(words, 720, 420, (text, fontSize) => text.length * fontSize * 0.58)

    expect(layout.length).toBeGreaterThanOrEqual(45)
    expect(layout[0].fontSize).toBeGreaterThan(layout[layout.length - 1].fontSize)
    for (let i = 0; i < layout.length; i += 1) {
      for (let j = i + 1; j < layout.length; j += 1) {
        expect(overlaps(layout[i], layout[j])).toBe(false)
      }
    }
  })

  it('opens the app view from its command registration', () => {
    const { commands } = createPluginContext()
    const openAppView = vi.fn()

    commands.find((command) => command.id === 'word-cloud.openGlobal').run({}, {
      navigate: { openAppView },
    })

    expect(openAppView).toHaveBeenCalledWith('builtin.word-cloud.view')
  })

  it('filters projects in the plugin sidebar', async () => {
    const { appSidebarViews } = createPluginContext()
    const alphaSession = { ...session, cwd: '/tmp/alpha-project' }
    const betaSession = { ...session, id: 'session-2', cwd: '/tmp/beta-project' }

    render(appSidebarViews[0].render({
      viewId: appSidebarViews[0].id,
      active: true,
      data: { sessions: [alphaSession, betaSession] },
    }))

    expect(screen.getByText('alpha-project')).not.toBeNull()
    expect(screen.getByText('beta-project')).not.toBeNull()

    fireEvent.change(screen.getByPlaceholderText('Search projects'), { target: { value: 'beta' } })

    await waitFor(() => expect(screen.queryByText('alpha-project')).toBeNull())
    expect(screen.getByText('beta-project')).not.toBeNull()
  })

  it('builds words from DB preview fields without reading JSONL entries', async () => {
    const { appViews, readEntries } = createPluginContext()

    render(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [session] },
    }))

    await waitFor(() => expect(screen.getAllByText('alpha').length).toBeGreaterThan(0))

    expect(readEntries).not.toHaveBeenCalled()
    expect(screen.getByText('2')).not.toBeNull()
    expect(screen.queryByText('ignored')).toBeNull()
  })

  it('keeps the word snapshot stable until refresh when session data changes', async () => {
    const { appViews } = createPluginContext()
    const { rerender } = render(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [session] },
    }))

    await waitFor(() => expect(screen.getAllByText('alpha').length).toBeGreaterThan(0))

    rerender(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [{ ...session, first_message: 'delta delta epsilon', last_message: '' }] },
    }))

    expect(screen.queryByText('delta')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(screen.getAllByText('delta').length).toBeGreaterThan(0))
    expect(screen.queryByText('alpha')).toBeNull()
  })

  it('refreshes automatically when maxWords changes', async () => {
    const { appViews } = createPluginContext()
    const element = appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [{ ...session, first_message: 'alpha beta gamma delta', last_message: '' }] },
    })
    const { rerender } = render(React.cloneElement(element, { maxWords: 2 }))

    await waitFor(() => expect(screen.getAllByText('alpha').length).toBeGreaterThan(0))
    expect(screen.queryByText('gamma')).toBeNull()

    rerender(React.cloneElement(element, { maxWords: 4 }))

    await waitFor(() => expect(screen.getAllByText('gamma').length).toBeGreaterThan(0))
  })

  it('draws computed words directly on the canvas', async () => {
    const { appViews } = createPluginContext()

    render(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [session] },
    }))

    await waitFor(() => {
      expect(canvasContexts.some((context) => context.fillText.mock.calls.some((call: unknown[]) => call[0] === 'alpha'))).toBe(true)
    })
  })

  it('uses full user message text and exposes word search', async () => {
    const { appViews } = createPluginContext()
    const richSession = {
      ...session,
      user_messages_text: 'omega omega searchableword searchableword searchableword',
    }

    render(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [richSession] },
    }))

    await waitFor(() => expect(screen.getAllByText('searchableword').length).toBeGreaterThan(0))
    fireEvent.change(screen.getByPlaceholderText('Search words'), { target: { value: 'omega' } })

    await waitFor(() => expect(screen.getAllByText('omega').length).toBeGreaterThan(0))
    expect(screen.queryByText('searchableword')).toBeNull()
  })

  it('shows more than the old fixed top-word limit', async () => {
    const { appViews } = createPluginContext()
    const manyWords = Array.from({ length: 35 }, (_item, index) => `word${index}`).join(' ')

    render(appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [{ ...session, first_message: manyWords, last_message: '' }] },
    }))

    await waitFor(() => expect(screen.getByText('word34')).not.toBeNull())
  })

  it('stores clicked words as globally hidden words', async () => {
    const { appViews, configWrite } = createPluginContext()

    const element = appViews[0].render({
      viewId: appViews[0].id,
      active: true,
      data: { sessions: [session] },
    })
    expect(element.props.configClient.write).toBe(configWrite)
    render(element)

    await waitFor(() => expect(screen.getAllByText('alpha').length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByText('alpha')[0].closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Hide globally' }))

    await waitFor(() => expect(configWrite).toHaveBeenCalledWith('hiddenWords', ['alpha']))
    await waitFor(() => expect(screen.queryByText('alpha')).toBeNull())
  })
})
