// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  clearPersistedPluginDiagnostics,
  getPersistedPluginDiagnostics,
  pluginDiagnostic,
  recordPersistedPluginDiagnostic,
} from '../diagnostics'

describe('plugin runtime diagnostics ledger', () => {
  afterEach(() => {
    clearPersistedPluginDiagnostics()
  })

  it('persists and coalesces repeated plugin failures', () => {
    const diagnostic = pluginDiagnostic({
      level: 'error',
      phase: 'command',
      contributionId: 'plugin.command',
      message: 'Command plugin.command failed: boom',
      error: new Error('boom'),
    })

    recordPersistedPluginDiagnostic('plugin.bad', diagnostic)
    recordPersistedPluginDiagnostic('plugin.bad', diagnostic)

    expect(getPersistedPluginDiagnostics('plugin.bad')).toEqual([
      expect.objectContaining({
        level: 'error',
        phase: 'command',
        contributionId: 'plugin.command',
        message: 'Command plugin.command failed: boom',
        count: 2,
      }),
    ])
  })

  it('clears one plugin without clearing another plugin ledger', () => {
    recordPersistedPluginDiagnostic('plugin.one', pluginDiagnostic({
      level: 'error',
      phase: 'tool',
      contributionId: 'one_tool',
      message: 'Tool one_tool failed: boom',
    }))
    recordPersistedPluginDiagnostic('plugin.two', pluginDiagnostic({
      level: 'warn',
      phase: 'ui-render',
      contributionId: 'two.view',
      message: 'UI contribution two.view failed to render: boom',
    }))

    clearPersistedPluginDiagnostics('plugin.one')

    expect(getPersistedPluginDiagnostics('plugin.one')).toEqual([])
    expect(getPersistedPluginDiagnostics('plugin.two')).toHaveLength(1)
  })
})
