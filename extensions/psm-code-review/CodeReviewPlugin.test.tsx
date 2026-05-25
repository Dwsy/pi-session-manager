// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import type { SessionEntry } from '@/types'
import activate, { manifest } from './index'

function assistantToolEntry(content: NonNullable<SessionEntry['message']>['content']): SessionEntry {
  return {
    type: 'message',
    id: 'assistant-1',
    timestamp: '2026-05-19T10:00:00.000Z',
    message: {
      role: 'assistant',
      content,
    },
  }
}

function createHostContext(entries: SessionEntry[]) {
  const registeredCommands: Array<{ id: string; run: (args: Record<string, unknown>, context?: unknown) => unknown }> = []
  const toolbarItems: Array<{ id: string; render: (props: unknown) => unknown }> = []
  const ctx = {
    manifest,
    psm: {
      sessions: {
        readEntries: vi.fn().mockResolvedValue(entries),
      },
    },
    permissions: { pluginId: manifest.id, permissions: manifest.permissions },
    events: { subscribe: vi.fn() },
    settings: { get: vi.fn((_key, fallback) => fallback), all: vi.fn(() => ({})) },
    i18n: { language: 'en-US', t: vi.fn((_key, fallback) => fallback) },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerCommand: vi.fn((command) => {
      registeredCommands.push(command)
    }),
    registerTool: vi.fn(),
    ui: {
      registerAppView: vi.fn(),
      registerAppSidebarView: vi.fn(),
      registerSessionToolbarItem: vi.fn((item) => {
        toolbarItems.push(item)
      }),
      registerSessionPanel: vi.fn(),
      registerSessionTreeView: vi.fn(),
      registerSessionMainView: vi.fn(),
      registerToolRenderer: vi.fn(),
    },
  }

  activate(ctx as never)
  return { ctx, registeredCommands, toolbarItems }
}

describe('code review plugin', () => {
  it('registers a session toolbar contribution and inspect command', async () => {
    const { registeredCommands, toolbarItems } = createHostContext([
      assistantToolEntry([
        {
          type: 'toolCall',
          id: 'call-write',
          name: 'write',
          arguments: {
            file_path: 'src/example.ts',
            content: 'export const value = 1;',
          },
        },
      ]),
    ])

    expect(manifest).toMatchObject({
      id: 'builtin.code-review',
      permissions: ['sessions:read'],
    })
    expect(toolbarItems).toMatchObject([{ id: 'builtin.code-review.toolbar' }])

    const command = registeredCommands.find((item) => item.id === 'code-review.inspect')
    expect(command).toBeTruthy()

    const result = await command!.run({ sessionPath: '/tmp/session.jsonl' }) as {
      count: number
      operations: Array<{ toolName: string; filePath: string }>
    }
    expect(result.count).toBe(1)
    expect(result.operations[0]).toMatchObject({
      toolName: 'write',
      filePath: 'src/example.ts',
    })
  })
})
