// @vitest-environment jsdom

import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../host-react', () => ({
  hostReact: () => React,
}))

import activate, { layoutWordCloudWords } from '../index'
import type { SessionInfo } from '@/types'

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

afterEach(() => cleanup())

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

  it('opens the app view from its command registration', () => {
    const { commands } = createPluginContext()
    const openAppView = vi.fn()

    commands.find((command) => command.id === 'word-cloud.openGlobal').run({}, {
      navigate: { openAppView },
    })

    expect(openAppView).toHaveBeenCalledWith('builtin.word-cloud.view')
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
