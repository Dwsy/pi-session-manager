import { describe, expect, it } from 'vitest'

import { crossAgentToolRenderer } from './index'

describe('crossAgentToolRenderer', () => {
  it('keeps matching legacy cross-agent aliases', () => {
    for (const name of ['Bash', 'shell', 'Read', 'read_file', 'Write', 'write_file', 'Edit', 'MultiEdit', 'edit_file', 'apply_patch', 'search']) {
      expect(crossAgentToolRenderer.match({ type: 'toolCall', name })).toBe(true)
    }
  })

  it('leaves Pi built-in tool names to the core renderer', () => {
    for (const name of ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']) {
      expect(crossAgentToolRenderer.match({ type: 'toolCall', name })).toBe(false)
    }
  })

  it('matches canonical OMP-only built-in tools', () => {
    const ompBuiltins = [
      'ast_grep', 'ast_edit', 'ask', 'debug', 'eval', 'github', 'glob', 'lsp', 'inspect_image',
      'browser', 'computer', 'checkpoint', 'rewind', 'security_scan', 'task', 'hub', 'todo',
      'web_search', 'memory_edit', 'retain', 'recall', 'reflect', 'learn', 'manage_skill', 'yield', 'goal',
    ]

    for (const name of ompBuiltins) {
      expect(crossAgentToolRenderer.match({ type: 'toolCall', name })).toBe(true)
    }
  })

  it('uses generic OMP arguments in collapsed previews', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-ask',
      name: 'ask',
      arguments: { prompt: 'Choose a strategy' },
    }
    const data = crossAgentToolRenderer.resolveData!(toolCall, 0, new Map())

    expect(crossAgentToolRenderer.getPreview!(toolCall, data)).toBe('Ask: Choose a strategy')
  })

  it('keeps legacy structured shell arguments in the preview', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'legacy-call',
      name: 'Bash',
      arguments: { command: 'cargo test' },
    }
    const data = crossAgentToolRenderer.resolveData!(toolCall, 0, new Map())

    expect(crossAgentToolRenderer.getPreview!(toolCall, data)).toBe('Shell: cargo test')
  })

  it('recognizes OMP search and todo tools', () => {
    const searchCall = {
      type: 'toolCall' as const,
      id: 'call-glob',
      name: 'glob',
      arguments: { pattern: '**/*.ts', i: 'find TypeScript files' },
    }
    const todoCall = {
      type: 'toolCall' as const,
      id: 'call-todo',
      name: 'todo',
      arguments: { op: 'init', i: 'init deploy tasks', items: ['build', 'deploy'] },
    }

    expect(crossAgentToolRenderer.match(searchCall)).toBe(true)
    expect(crossAgentToolRenderer.match(todoCall)).toBe(true)
    expect(crossAgentToolRenderer.getPreview!(searchCall, crossAgentToolRenderer.resolveData!(searchCall, 0, new Map()))).toBe('Glob: find TypeScript files')
    expect(crossAgentToolRenderer.getPreview!(todoCall, crossAgentToolRenderer.resolveData!(todoCall, 0, new Map()))).toBe('Tasks: init deploy tasks')
  })

  it('links OMP message-level tool results into renderer output', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-glob',
      name: 'glob',
      arguments: { pattern: '**/*.ts' },
    }
    const result = {
      type: 'message',
      id: 'omp-result',
      message: {
        role: 'toolResult',
        toolCallId: 'call-glob',
        toolName: 'glob',
        content: [{ type: 'text', text: 'src/upload.ts:42' }],
        isError: false,
      },
    } as any
    const data = crossAgentToolRenderer.resolveData!(
      toolCall,
      0,
      new Map([['call-glob', result]]),
    )

    expect(data.result).toBe(result)
    expect(data.output).toBe('src/upload.ts:42')
    expect(data.isError).toBe(false)
  })

  it('recognizes Codex collaboration and wait tools', () => {
    for (const name of ['spawn_agent', 'list_agents', 'wait', 'wait_agent']) {
      expect(crossAgentToolRenderer.match({ type: 'toolCall', name })).toBe(true)
    }
  })

  it('uses raw Codex exec input as the collapsed preview', () => {
    const script = 'const result = await tools.exec_command({ cmd: "cargo test" });'
    const data = crossAgentToolRenderer.resolveData!(
      { type: 'toolCall', id: 'call-1', name: 'exec', arguments: script },
      0,
      new Map(),
    )

    expect(crossAgentToolRenderer.getPreview!({ type: 'toolCall', name: 'exec' }, data)).toBe(`Shell: ${script}`)
  })

  it('summarizes Codex wait durations', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-2',
      name: 'wait',
      arguments: { yield_time_ms: 10_000 },
    }
    const data = crossAgentToolRenderer.resolveData!(toolCall, 0, new Map())

    expect(crossAgentToolRenderer.getPreview!(toolCall, data)).toBe('Wait: 10000 ms')
  })
})
