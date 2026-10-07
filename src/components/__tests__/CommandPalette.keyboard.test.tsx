// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'

import i18n from '../../i18n'
import CommandPalette from '../command/CommandPalette'
import { commandPaletteStore } from '@/hooks/useCommandMenu'
import { useDesktopSidebarActions } from '@/hooks/app/useDesktopSidebarActions'
import { useSearchPlugins } from '@/hooks/useSearchPlugins'
import type { SearchContext } from '@/plugins/types'

vi.mock('@/hooks/useSearchPlugins', () => ({
  useSearchPlugins: vi.fn(),
}))

vi.mock('../command/SessionPreviewPanel', () => ({
  default: () => <div data-testid="session-preview-panel" />,
}))

// Stable identities: the search effect re-runs when `registry` changes, so an
// unstable mock return value would loop React renders forever.
beforeEach(() => {
  vi.mocked(useSearchPlugins).mockReturnValue({
    registry: new Map() as any,
    search: vi.fn(async () => []),
  })
})

function createContext(): SearchContext {
  return {
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    searchCurrentProjectOnly: false,
    setSelectedSession: vi.fn(),
    setSelectedProject: vi.fn(),
    closeCommandMenu: vi.fn(),
    setPendingScrollEntryId: vi.fn(),
    t: i18n.t.bind(i18n),
  }
}

function renderPalette(context = createContext()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CommandPalette context={context} />
    </I18nextProvider>,
  )
}

function searchInput(): HTMLInputElement {
  return document.querySelector('[data-cmdk-input]') as HTMLInputElement
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

async function afterCloseAnimation() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
}

describe('CommandPalette keyboard toggles & focus', () => {
  beforeEach(() => {
    act(() => commandPaletteStore.close())
  })

  afterEach(() => {
    cleanup()
    act(() => commandPaletteStore.close())
  })

  it('opens and closes with Cmd+K', async () => {
    renderPalette()

    expect(searchInput()).toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(commandPaletteStore.isOpen()).toBe(true)
    expect(searchInput()).not.toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(commandPaletteStore.isOpen()).toBe(false)
    await afterCloseAnimation()
    expect(searchInput()).toBeNull()
  })

  it('toggles with Cmd+P, F1 and closes with Escape', () => {
    renderPalette()

    fireEvent.keyDown(window, { key: 'F1' })
    expect(commandPaletteStore.isOpen()).toBe(true)

    fireEvent.keyDown(window, { key: 'p', metaKey: true })
    expect(commandPaletteStore.isOpen()).toBe(false)

    fireEvent.keyDown(window, { key: 'p', metaKey: true, shiftKey: true })
    expect(commandPaletteStore.isOpen()).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(commandPaletteStore.isOpen()).toBe(false)
  })

  it('focuses the search input on open', async () => {
    renderPalette()

    act(() => commandPaletteStore.open())
    await nextFrame()

    expect(document.activeElement).toBe(searchInput())
  })

  it('keeps focusing the search input across a quick close/reopen', async () => {
    renderPalette()

    act(() => commandPaletteStore.open())
    await nextFrame()
    expect(document.activeElement).toBe(searchInput())

    // Close and reopen within the unmount window: no remount happens, so the
    // input must be refocused by the open effect, not by autoFocus.
    act(() => commandPaletteStore.close())
    act(() => commandPaletteStore.open())
    await nextFrame()

    expect(commandPaletteStore.isOpen()).toBe(true)
    expect(document.activeElement).toBe(searchInput())
    await afterCloseAnimation()
    expect(searchInput()).not.toBeNull()
  })

  it('restores focus to the previously focused element on close', async () => {
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <button data-testid="outside-anchor">anchor</button>
        <CommandPalette context={createContext()} />
      </I18nextProvider>,
    )

    const anchor = getByTestId('outside-anchor')
    anchor.focus()
    expect(document.activeElement).toBe(anchor)

    act(() => commandPaletteStore.open())
    await nextFrame()
    expect(document.activeElement).toBe(searchInput())

    act(() => commandPaletteStore.close())
    expect(document.activeElement).toBe(anchor)
  })

  it('announces itself as a modal dialog', () => {
    act(() => commandPaletteStore.open())
    renderPalette()

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBeTruthy()
  })
})

describe('sidebar command palette action', () => {
  afterEach(() => {
    cleanup()
    act(() => commandPaletteStore.close())
  })

  it('opens the palette through the shared store instead of synthetic events', () => {
    const actions = renderHookActions()
    expect(commandPaletteStore.isOpen()).toBe(false)

    act(() => actions.onOpenCommandPalette())

    expect(commandPaletteStore.isOpen()).toBe(true)
  })
})

function renderHookActions() {
  const setters = {
    setViewMode: vi.fn(),
    setActiveAppViewId: vi.fn(),
    setSelectedProject: vi.fn(),
    setShowTerminal: vi.fn(),
    setShowSettings: vi.fn(),
    navigateToSessions: vi.fn(),
    navigateToProjects: vi.fn(),
    navigateToProject: vi.fn(),
  }
  let actions!: ReturnType<typeof useDesktopSidebarActions>
  function Probe() {
    actions = useDesktopSidebarActions(setters)
    return null
  }
  render(<Probe />)
  return actions
}
