// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionEntry, SystemPromptSnapshot } from '@/types'

const { invokeMock, copyTextMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  copyTextMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/transport', () => ({ invoke: invokeMock }))

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copyText: copyTextMock }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, second?: unknown, third?: unknown) => {
      const options = second && typeof second === 'object' ? second as Record<string, unknown> : third as Record<string, unknown> | undefined
      const template = typeof second === 'string' ? second : (options?.defaultValue as string | undefined) ?? _key
      let text = template
      if (options) {
        for (const [name, value] of Object.entries(options)) {
          if (name === 'defaultValue') continue
          text = text.split(`{{${name}}}`).join(String(value))
        }
      }
      return text
    },
  }),
}))

import SystemPromptDialog from './SystemPromptDialog'
import SystemMessage from './SystemMessage'
import { SystemMessageProvider } from './SystemMessageContext'

afterEach(cleanup)

const sessionPath = '/tmp/sanitized-session.jsonl'

function snapshot(version: number, overrides: Partial<SystemPromptSnapshot> = {}): SystemPromptSnapshot {
  return {
    id: `sys-${version}`,
    timestamp: `2026-01-0${version}T00:00:00.000Z`,
    version,
    content: '',
    prompt: '',
    sections: [],
    tools: [],
    changedSections: [],
    removedSections: [],
    toolsAdded: [],
    toolsRemoved: [],
    ...overrides,
  }
}

const snapshots: SystemPromptSnapshot[] = [
  snapshot(1, {
    prompt: 'Preamble\n\nRules version one',
    sections: [
      { name: 'preamble', text: 'Preamble' },
      { name: 'rules', text: 'Rules version one' },
    ],
    changedSections: ['preamble', 'rules'],
    tools: [
      { name: 'read', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
    ],
    toolsAdded: ['read'],
  }),
  snapshot(2, {
    prompt: 'Preamble\n\nRules version two\n\nSkills block',
    sections: [
      { name: 'preamble', text: 'Preamble' },
      { name: 'rules', text: 'Rules version two' },
      { name: 'skills', text: 'Skills block' },
    ],
    changedSections: ['rules', 'skills'],
    removedSections: ['docs'],
    tools: [
      { name: 'read', description: 'Read a file', parameters: { type: 'object' } },
      { name: 'bash', description: 'Run a command', parameters: { type: 'object' } },
    ],
    toolsAdded: ['bash'],
    toolsRemoved: ['legacy'],
  }),
]

const entries: SessionEntry[] = [
  {
    type: 'message',
    id: 'a1',
    timestamp: '2026-01-01T00:00:01.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'toolCall', name: 'read', id: 'call-1' },
        { type: 'toolCall', name: 'bash', id: 'call-2' },
      ],
    },
  },
  {
    type: 'message',
    id: 'a2',
    timestamp: '2026-01-01T00:00:02.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'toolCall', name: 'read', id: 'call-3' },
        { type: 'toolCall', name: 'grep', id: 'call-4' },
      ],
    },
  },
]

function mockSnapshotLoad(history: SystemPromptSnapshot[], fallback = '') {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'get_session_system_prompt_snapshots') return Promise.resolve(history)
    if (command === 'get_session_system_prompt') return Promise.resolve(fallback)
    if (command === 'get_system_prompt') return Promise.resolve(fallback)
    return Promise.resolve(null)
  })
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof SystemPromptDialog>> = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <SystemPromptDialog
      isOpen
      onClose={onClose}
      entries={entries}
      sessionPath={sessionPath}
      {...overrides}
    />,
  )
  return { onClose }
}

beforeEach(() => {
  invokeMock.mockReset()
  copyTextMock.mockClear()
})

describe('System message snapshots', () => {
  it('shows effective state and opens the selected historical version without another fetch', async () => {
    invokeMock.mockResolvedValue(snapshots)
    const systemEntries = snapshots.map((item) => ({ type: 'message', id: item.id, timestamp: item.timestamp, message: { role: 'system', content: [] } } as SessionEntry))
    render(<SystemMessageProvider entries={systemEntries} sessionPath={sessionPath}>
      {systemEntries.map((entry) => <SystemMessage key={entry.id} entryId={entry.id} message={entry.message!} />)}
    </SystemMessageProvider>)
    const prompt = await screen.findByRole('button', { name: /System prompt.*Rules version one/ })
    const firstCard = prompt.closest('.system-message-card') as HTMLElement
    expect(within(firstCard).getByRole('button', { name: /Tools.*\+1.*−0.*\+read/ })).toBeTruthy()
    fireEvent.click(prompt)
    expect(await screen.findByRole('combobox', { name: 'Version' })).toHaveProperty('value', '1')
    expect(screen.getByRole('dialog').textContent).toContain('Rules version one')
    expect(invokeMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(within(firstCard).getByRole('button', { name: /Tools.*\+1.*−0/ }))
    expect(await screen.findByRole('tab', { name: /Tools Used/, selected: true })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Version' })).toHaveProperty('value', '1')
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})

describe('SystemPromptDialog', () => {
  it('renders skills XML as cards and copies the original section', async () => {
    const skills = '<skills>\nUse the read tool.\n<available_skills>\n<skill>\n<name>example-skill</name>\n<description>Example &amp; description\nSecond line</description>\n<location>/example/SKILL.md</location>\n</skill>\n</available_skills>\n</skills>'
    mockSnapshotLoad([snapshot(1, {
      prompt: `Rules\n\n${skills}`,
      sections: [{ name: 'rules', text: 'Rules' }, { name: 'skills', text: skills }],
      changedSections: ['rules', 'skills'],
    })])
    renderDialog()

    expect(await screen.findByText('example-skill')).toBeTruthy()
    expect(screen.getByText('Use the read tool.')).toBeTruthy()
    expect(screen.getByText(/Example & description/).textContent).toContain('Second line')
    expect(screen.getByText('/example/SKILL.md')).toBeTruthy()
    expect(screen.queryByText('Changed')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^skills/i }))
    expect(screen.getByText('example-skill')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /copy skills/i }))
    expect(copyTextMock).toHaveBeenCalledWith(skills)
    fireEvent.click(screen.getByRole('button', { name: /copy full prompt/i }))
    expect(copyTextMock).toHaveBeenCalledWith(`Rules\n\n${skills}`)
  })

  it.each([
    '<skills><available_skills><skill><name>broken</name></skills>',
    '<skills><available_skills><skill><name>extra</name><description>desc</description><location>path</location><extra>keep me</extra></skill></available_skills></skills>',
  ])('preserves unparseable or unfamiliar skills XML as raw text', async (skills) => {
    mockSnapshotLoad([snapshot(1, { prompt: skills, sections: [{ name: 'skills', text: skills }] })])
    renderDialog()
    expect(await screen.findByText((_text, element) => element?.tagName === 'PRE' && element.textContent === skills)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /copy skills/i }))
    expect(copyTextMock).toHaveBeenCalledWith(skills)
  })

  it('shows the latest recorded snapshot and browses sections and versions', async () => {
    mockSnapshotLoad(snapshots)
    renderDialog()

    expect(await screen.findByText('Rules version two')).toBeTruthy()
    expect(screen.getByText('Skills block')).toBeTruthy()
    expect(screen.getAllByText('Changed')).toHaveLength(2)
    expect(screen.getByText('docs')).toBeTruthy()

    const versionSelect = screen.getByRole('combobox', { name: 'Version' })
    fireEvent.change(versionSelect, { target: { value: '1' } })

    expect(screen.getByText('Rules version one')).toBeTruthy()
    expect(screen.queryByText('Changed')).toBeNull()
    expect(screen.queryByText('Rules version two')).toBeNull()

    const rulesButton = screen.getByRole('button', { name: /^rules/i })
    fireEvent.click(rulesButton)

    expect(screen.getByText('Rules version one')).toBeTruthy()
    expect(screen.queryByText('Preamble')).toBeNull()
  })

  it('copies the full prompt and individual sections', async () => {
    mockSnapshotLoad(snapshots)
    renderDialog()

    await screen.findByText('Rules version two')

    fireEvent.click(screen.getByRole('button', { name: /copy full prompt/i }))
    expect(copyTextMock).toHaveBeenCalledWith('Preamble\n\nRules version two\n\nSkills block')

    fireEvent.click(screen.getByRole('button', { name: /copy rules/i }))
    expect(copyTextMock).toHaveBeenCalledWith('Rules version two')
  })

  it('merges declared tools with session usage and filters them', async () => {
    mockSnapshotLoad(snapshots)
    renderDialog()

    fireEvent.click(screen.getByRole('tab', { name: /Tools Used/ }))

    expect(await screen.findByText('Read a file')).toBeTruthy()
    expect(screen.getByText('Run a command')).toBeTruthy()
    expect(screen.getByText('Not declared')).toBeTruthy()
    expect(screen.getByText('2 calls')).toBeTruthy()
    expect(screen.getByText('legacy')).toBeTruthy()

    const bashRow = screen.getByRole('button', { name: /bash/i })
    fireEvent.click(bashRow)
    expect(screen.getByText('Parameters')).toBeTruthy()
    expect(screen.getByText(/"type": "object"/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter tools' }), { target: { value: 'bash' } })
    expect(screen.queryByText('Read a file')).toBeNull()
    expect(screen.getByText('Run a command')).toBeTruthy()
  })

  it('falls back to the generated prompt when the session has no system message', async () => {
    mockSnapshotLoad([], 'Generated prompt text')
    renderDialog()

    expect(await screen.findByText('Generated prompt text')).toBeTruthy()
    expect(screen.getByText(/No recorded system message/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Tools Used/ }))
    expect(screen.getAllByText('Not declared').length).toBe(3)
  })

  it('shows a load error and retries', async () => {
    invokeMock.mockRejectedValue(new Error('backend unavailable'))
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Failed to load system prompt')).toBeTruthy()

    mockSnapshotLoad(snapshots)
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))

    await waitFor(() => {
      expect(screen.getByText('Rules version two')).toBeTruthy()
    })
  })

  it('closes on Escape', async () => {
    mockSnapshotLoad(snapshots)
    const { onClose } = renderDialog()

    await screen.findByText('Rules version two')
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
