// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import SearchFilterBar from '../search/SearchFilterBar'
import i18n from '../../i18n'

function renderSearchFilterBar() {
  render(
    <I18nextProvider i18n={i18n}>
      <div>
        <button type="button">outside</button>
        <SearchFilterBar
          searchQuery=""
          onSearchChange={() => {}}
          tags={[]}
          sessionTags={[]}
          filterTagIds={[]}
          onFilterChange={() => {}}
          getDescendantIds={() => []}
        />
      </div>
    </I18nextProvider>
  )

  return {
    outsideButton: screen.getByRole('button', { name: 'outside' }),
    searchInput: screen.getByRole('textbox'),
  }
}

describe('SearchFilterBar', () => {
  afterEach(() => {
    cleanup()
  })
  it('focuses the sidebar search input on plain Cmd+F', () => {
    const { outsideButton, searchInput } = renderSearchFilterBar()

    outsideButton.focus()
    fireEvent.keyDown(document, { key: 'f', metaKey: true })

    expect(document.activeElement).toBe(searchInput)
  })

  it('does not hijack Cmd+Shift+F', () => {
    const { outsideButton, searchInput } = renderSearchFilterBar()

    outsideButton.focus()
    fireEvent.keyDown(document, { key: 'f', metaKey: true, shiftKey: true })

    expect(document.activeElement).toBe(outsideButton)
    expect(document.activeElement).not.toBe(searchInput)
  })
})
