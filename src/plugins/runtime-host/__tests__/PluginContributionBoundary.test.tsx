// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PluginContributionBoundary, PluginContributionSlot } from '../PluginContributionBoundary'

describe('PluginContributionBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('isolates a bad contribution render without hiding sibling contributions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div>
        <PluginContributionBoundary pluginId="builtin.bad" contributionId="bad.toolbar" title="Bad toolbar">
          <PluginContributionSlot render={() => {
            throw new Error('boom')
          }} />
        </PluginContributionBoundary>
        <PluginContributionBoundary pluginId="builtin.good" contributionId="good.toolbar" title="Good toolbar">
          <PluginContributionSlot render={() => <button type="button">Good plugin</button>} />
        </PluginContributionBoundary>
      </div>,
    )

    expect(screen.getByText('Plugin UI failed')).toBeTruthy()
    expect(screen.getByText('Good plugin')).toBeTruthy()
  })
})
