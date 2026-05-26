// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) => {
      if (fallback?.includes('{{current}}') && options) {
        return fallback
          .replace('{{current}}', String(options.current ?? ''))
          .replace('{{latest}}', String(options.latest ?? ''))
      }
      return fallback ?? _key
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

describe('UpdateNoticeToast', () => {
  it('shows the correct version text and opens the release callback', () => {
    const onOpenRelease = vi.fn()
    const onClose = vi.fn()

    render(
      <UpdateNoticeToast
        update={{
          channel: 'beta',
          currentVersion: '0.6.3',
          latestVersion: '0.7.0-beta.2',
          releaseUrl: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.7.0-beta.2',
          releaseName: 'Pi Session Manager 0.7.0-beta.2',
          releaseNotes: 'Beta notes',
          releaseNotesMarkdown: '## Beta notes',
          publishedAt: '2026-05-26T00:00:00Z',
        }}
        onClose={onClose}
        onOpenRelease={onOpenRelease}
      />,
    )

    expect(screen.getByText('Current v0.6.3, latest v0.7.0-beta.2')).not.toBeNull()
    expect(screen.getByText('Beta notes')).not.toBeNull()

    fireEvent.click(screen.getAllByText('Download')[0])
    expect(onOpenRelease).toHaveBeenCalledTimes(1)
  })

  it('shows release name in notes modal', () => {
    render(
      <UpdateNoticeToast
        update={{
          channel: 'stable',
          currentVersion: '0.6.3',
          latestVersion: '0.6.4',
          releaseUrl: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.6.4',
          releaseName: 'Pi Session Manager 0.6.4',
          releaseNotes: 'Stable notes',
          releaseNotesMarkdown: '## Stable notes',
          publishedAt: '2026-05-26T00:00:00Z',
        }}
        onClose={() => undefined}
        onOpenRelease={() => undefined}
      />,
    )

    fireEvent.click(screen.getByText('View release notes'))
    expect(screen.getByText('Pi Session Manager 0.6.4')).not.toBeNull()
    expect(screen.getByText('## Stable notes')).not.toBeNull()
  })
})
