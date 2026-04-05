import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
  it('focuses the sidebar search input on plain Cmd+F', () => {
    const { outsideButton, searchInput } = renderSearchFilterBar()

    outsideButton.focus()
    fireEvent.keyDown(document, { key: 'f', metaKey: true })

    expect(searchInput).toHaveFocus()
  })

  it('does not hijack Cmd+Shift+F', () => {
    const { outsideButton, searchInput } = renderSearchFilterBar()

    outsideButton.focus()
    fireEvent.keyDown(document, { key: 'f', metaKey: true, shiftKey: true })

    expect(outsideButton).toHaveFocus()
    expect(searchInput).not.toHaveFocus()
  })
})
