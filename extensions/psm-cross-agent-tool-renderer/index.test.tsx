import { describe, expect, it } from 'vitest'

import { crossAgentToolRenderer } from './index'

describe('crossAgentToolRenderer', () => {
  it('keeps matching legacy cross-agent tool names', () => {
    for (const name of ['Bash', 'bash', 'shell', 'Read', 'read_file', 'Write', 'write_file', 'Edit', 'MultiEdit', 'edit_file', 'apply_patch', 'search', 'find']) {
      expect(crossAgentToolRenderer.match({ type: 'toolCall', name })).toBe(true)
    }
  })

  it('matches every canonical OMP built-in tool', () => {
    const ompBuiltins = [
      'read', 'bash', 'edit', 'ast_grep', 'ast_edit', 'ask', 'debug', 'eval', 'github', 'glob',
      'grep', 'lsp', 'inspect_image', 'browser', 'computer', 'checkpoint', 'rewind', 'security_scan',
      'task', 'hub', 'todo', 'web_search', 'write', 'memory_edit', 'retain', 'recall', 'reflect',
      'learn', 'manage_skill', 'yield', 'goal',
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
      name: 'bash',
      arguments: { command: 'cargo test' },
    }
    const data = crossAgentToolRenderer.resolveData!(toolCall, 0, new Map())

    expect(crossAgentToolRenderer.getPreview!(toolCall, data)).toBe('Shell: cargo test')
  })

  it('recognizes OMP grep and todo tools', () => {
    const grepCall = {
      type: 'toolCall' as const,
      id: 'call-grep',
      name: 'grep',
      arguments: { pattern: 'upload', i: 'find upload references' },
    }
    const todoCall = {
      type: 'toolCall' as const,
      id: 'call-todo',
      name: 'todo',
      arguments: { op: 'init', i: 'init deploy tasks', items: ['build', 'deploy'] },
    }

    expect(crossAgentToolRenderer.match(grepCall)).toBe(true)
    expect(crossAgentToolRenderer.match(todoCall)).toBe(true)
    expect(crossAgentToolRenderer.getPreview!(grepCall, crossAgentToolRenderer.resolveData!(grepCall, 0, new Map()))).toBe('Grep: find upload references')
    expect(crossAgentToolRenderer.getPreview!(todoCall, crossAgentToolRenderer.resolveData!(todoCall, 0, new Map()))).toBe('Tasks: init deploy tasks')
  })

  it('links OMP message-level tool results into renderer output', () => {
    const toolCall = {
      type: 'toolCall' as const,
      id: 'call-grep',
      name: 'grep',
      arguments: { pattern: 'upload' },
    }
    const result = {
      type: 'message',
      id: 'omp-result',
      message: {
        role: 'toolResult',
        toolCallId: 'call-grep',
        toolName: 'grep',
        content: [{ type: 'text', text: 'src/upload.ts:42' }],
        isError: false,
      },
    } as any
    const data = crossAgentToolRenderer.resolveData!(
      toolCall,
      0,
      new Map([['call-grep', result]]),
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
