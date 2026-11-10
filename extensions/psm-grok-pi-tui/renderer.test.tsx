// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PsmToolRenderContext, PsmToolResolvedData } from '@dwsy/plugin-sdk'

import { grokPiToolRenderer } from './renderer'

afterEach(() => {
  cleanup()
})

function createMockContext(overrides: Partial<PsmToolRenderContext> = {}): PsmToolRenderContext {
  return {
    isExpanded: true,
    toggleExpanded: vi.fn(),
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
    t: vi.fn((_key: string, fallback?: string) => fallback ?? _key),
    disableSuccessStyle: false,
    ...overrides,
  }
}

describe('GrokPiToolRenderer compact layout', () => {
  const Component = grokPiToolRenderer.component

  it('renders compact tool-sections layout when expanded without space-y-3 or p-3', () => {
    const resolvedData: PsmToolResolvedData = {
      name: 'bash',
      args: {
        command: 'SELECT * FROM stores;',
        task_name: '读取门店上下文查询SQL',
        timeout: 30000,
      },
      toolCallId: 'call-bash-1',
      entryId: 'entry-bash-1',
      output: 'store_id | store_name\n1 | Downtown',
      isError: false,
    }

    const { container } = render(
      <Component
        toolCall={{ type: 'toolCall', name: 'bash', arguments: resolvedData.args }}
        resolvedData={resolvedData}
        context={createMockContext({ isExpanded: true })}
      />
    )

    // Verify container uses .tool-sections instead of space-y-3 p-3
    const toolSections = container.querySelector('.tool-sections')
    expect(toolSections).not.toBeNull()
    expect(toolSections?.className).toContain('tool-sections')
    expect(toolSections?.className).not.toContain('space-y-3')
    expect(toolSections?.className).not.toContain('p-3')

    // Verify each child section has .tool-section.tool-output
    const sections = container.querySelectorAll('.tool-section')
    expect(sections.length).toBe(3) // Command, Arguments, Output

    for (const section of sections) {
      expect(section.classList.contains('tool-output')).toBe(true)
    }

    // Verify Command, Arguments, Output headers exist
    expect(screen.getByText('Command')).not.toBeNull()
    expect(screen.getByText('Arguments')).not.toBeNull()
    expect(screen.getByText('Output')).not.toBeNull()

    // Verify arguments JSON content is rendered in tool-output-plain
    const plainOutputs = container.querySelectorAll('.tool-output-plain')
    expect(plainOutputs.length).toBe(1) // Arguments
    expect(plainOutputs[0].textContent).toContain('读取门店上下文查询SQL')
  })

  it('does not render tool-sections when collapsed', () => {
    const resolvedData: PsmToolResolvedData = {
      name: 'bash',
      args: {
        command: 'pwd',
        task_name: 'Check pwd',
      },
      toolCallId: 'call-bash-2',
      entryId: 'entry-bash-2',
      output: '/home/user',
      isError: false,
    }

    const { container } = render(
      <Component
        toolCall={{ type: 'toolCall', name: 'bash', arguments: resolvedData.args }}
        resolvedData={resolvedData}
        context={createMockContext({ isExpanded: false })}
      />
    )

    expect(container.querySelector('.tool-sections')).toBeNull()
  })
})
