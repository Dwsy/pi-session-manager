import type { PsmSessionReference, PsmSessionSelection } from '@dwsy/plugin-sdk'

import { extractTextQuote } from './textQuote'

/**
 * Bridges native transcript DOM selections to the plugin `PsmSessionSelection`
 * contract. Selection is intentionally limited to a single transcript entry;
 * cross-entry selections are rejected at the boundary (v1 scope).
 */

const ENTRY_SELECTOR = '[data-entry-id], [id^="entry-"]'

export interface TranscriptSelectionAnchor {
  entryId: string
  entryElement: Element
  range: Range
}

export function resolveEntryElement(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return element?.closest(ENTRY_SELECTOR) ?? null
}

export function entryIdFromElement(element: Element): string | null {
  const dataId = element.getAttribute('data-entry-id')
  if (dataId) return dataId
  const id = element.id
  return id.startsWith('entry-') ? id.slice('entry-'.length) : null
}

/** Non-empty selection contained within one transcript entry, else null. */
export function resolveTranscriptSelection(selection: Selection | null): TranscriptSelectionAnchor | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null

  const startEntry = resolveEntryElement(range.startContainer)
  const endEntry = resolveEntryElement(range.endContainer)
  if (!startEntry || startEntry !== endEntry) return null

  const entryId = entryIdFromElement(startEntry)
  if (!entryId) return null
  return { entryId, entryElement: startEntry, range: range.cloneRange() }
}

export function buildSessionSelection(
  session: PsmSessionReference,
  anchor: TranscriptSelectionAnchor,
  entryRole?: string,
): PsmSessionSelection | null {
  const textQuote = extractTextQuote(anchor.entryElement, anchor.range)
  if (!textQuote) return null
  const selectedText = textQuote.exact
  return {
    sessionPath: session.path,
    sessionId: session.id,
    entryId: anchor.entryId,
    entryRole,
    selectedText,
    textQuote,
  }
}

/**
 * Latest transcript selection, readable by `selection`-scoped command
 * execution. Selection state lives outside React because command dispatch
 * runs outside the viewer's component tree.
 */
type Listener = () => void

class SessionSelectionStore {
  private current: PsmSessionSelection | null = null
  private readonly listeners = new Set<Listener>()

  // Arrow properties keep `this` intact when passed as bare callbacks
  // (e.g. useSyncExternalStore's subscribe).
  get = (): PsmSessionSelection | null => this.current

  set = (selection: PsmSessionSelection | null): void => {
    if (this.current === selection) return
    this.current = selection
    for (const listener of [...this.listeners]) listener()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const sessionSelectionStore = new SessionSelectionStore()
