// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}))

vi.mock('@/components/search/SearchFilterBar', () => ({
  default: ({ className = '' }: { className?: string }) => <div data-testid="search-filter-bar" className={className} />,
}))

vi.mock('@/components/search/ActiveFilterChips', () => ({
  default: () => <div data-testid="active-filter-chips" />,
}))

import AppDesktopSearchBar from '../AppDesktopSearchBar'
import type { AppDesktopSearchBarProps } from '../AppDesktopSearchBar'

const baseProps: AppDesktopSearchBarProps = {
  searchQuery: '',
  onSearchChange: () => {},
  tags: [],
  sessionTags: [],
  filterTagIds: [],
  onFilterChange: () => {},
  onCreateTag: () => {},
  getDescendantIds: () => [],
  sidebarMode: 'list',
  selectedProject: null,
  sortBy: 'modified',
  sortOrder: 'desc',
  onSortByChange: () => {},
  onSortOrderChange: () => {},
  onSelectModeTrigger: vi.fn(),
}

describe('AppDesktopSearchBar select mode trigger', () => {
  it('keeps the desktop search controls compact so trailing actions are not squeezed out', () => {
    render(<AppDesktopSearchBar {...baseProps} />)

    expect(screen.getByTestId('search-filter-bar').className).toContain('flex-[0_1_220px]')
  })

  it('renders current-session locate at the right side of the search controls', () => {
    const onLocateCurrentSession = vi.fn()
    render(
      <AppDesktopSearchBar
        {...baseProps}
        onLocateCurrentSession={onLocateCurrentSession}
        canLocateCurrentSession
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /locate current session/i }))
    expect(onLocateCurrentSession).toHaveBeenCalledTimes(1)
  })

  it('shows select mode only when a SessionList is visible', () => {
    const { rerender } = render(<AppDesktopSearchBar {...baseProps} />)

    expect(screen.getByRole('button', { name: /select mode/i })).toBeTruthy()

    rerender(<AppDesktopSearchBar {...baseProps} sidebarMode="project" selectedProject={null} />)
    expect(screen.queryByRole('button', { name: /select mode/i })).toBeNull()

    rerender(<AppDesktopSearchBar {...baseProps} sidebarMode="project" selectedProject="/tmp/project" />)
    expect(screen.getByRole('button', { name: /select mode/i })).toBeTruthy()

    rerender(<AppDesktopSearchBar {...baseProps} sidebarMode="app" selectedProject={null} />)
    expect(screen.queryByRole('button', { name: /select mode/i })).toBeNull()
  })
})
