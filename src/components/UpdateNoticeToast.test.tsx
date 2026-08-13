// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const template = fallback ?? key
      if (!options) return template
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options[name] ?? ''),
      )
    },
  }),
}))

vi.mock('./ui/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}))

import UpdateNoticeToast from './UpdateNoticeToast'

afterEach(() => {
  cleanup()
})

const betaUpdate = {
  channel: 'beta' as const,
  currentVersion: '0.6.3',
  latestVersion: '0.7.0-beta.2',
  releaseUrl: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.7.0-beta.2',
  releaseName: 'Pi Session Manager 0.7.0-beta.2',
  releaseNotes: 'Beta notes',
  releaseNotesMarkdown: '## Beta notes',
  publishedAt: '2026-05-26T00:00:00Z',
}

const stableUpdate = {
  channel: 'stable' as const,
  currentVersion: '0.6.3',
  latestVersion: '0.6.4',
  releaseUrl: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.6.4',
  releaseName: 'Pi Session Manager 0.6.4',
  releaseNotes: 'Stable notes',
  releaseNotesMarkdown: '## Stable notes',
  publishedAt: '2026-05-26T00:00:00Z',
}

describe('UpdateNoticeToast', () => {
  it('shows the correct version text and opens the Updates section', () => {
    const onOpenUpdateSettings = vi.fn()

    render(
      <UpdateNoticeToast
        notice={{ kind: 'available', update: betaUpdate }}
        onDismiss={() => undefined}
        onOpenUpdateSettings={onOpenUpdateSettings}
        onRestart={() => undefined}
      />,
    )

    expect(screen.getByText('Current v0.6.3, latest v0.7.0-beta.2')).not.toBeNull()
    expect(screen.getByText('Beta notes')).not.toBeNull()

    fireEvent.click(screen.getAllByText('Go to Updates')[0])
    expect(onOpenUpdateSettings).toHaveBeenCalledTimes(1)
  })

  it('shows release name in notes modal', () => {
    render(
      <UpdateNoticeToast
        notice={{ kind: 'available', update: stableUpdate }}
        onDismiss={() => undefined}
        onOpenUpdateSettings={() => undefined}
        onRestart={() => undefined}
      />,
    )

    fireEvent.click(screen.getByText('View release notes'))
    expect(screen.getByText('Pi Session Manager 0.6.4')).not.toBeNull()
    expect(screen.getByText('## Stable notes')).not.toBeNull()
  })

  it('asks for a restart once a build is staged', () => {
    const onRestart = vi.fn()
    const onDismiss = vi.fn()

    render(
      <UpdateNoticeToast
        notice={{ kind: 'ready', channel: 'stable', version: '0.7.4' }}
        onDismiss={onDismiss}
        onOpenUpdateSettings={() => undefined}
        onRestart={onRestart}
      />,
    )

    expect(screen.getByText('Update ready: v0.7.4')).not.toBeNull()

    fireEvent.click(screen.getByText('Restart now'))
    expect(onRestart).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Later'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
