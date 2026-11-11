import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type {
  PsmSessionHighlight,
  PsmSessionReference,
  PsmSessionSelection,
} from '@dwsy/plugin-sdk'

import {
  PluginContributionBoundary,
  requestOpenSessionPanel,
  usePsmPluginSessionUi,
  type PsmSelectionActionRuntimeRegistration,
  type PsmSessionHighlightProviderRuntimeRegistration,
} from '@/plugins/runtime-host'
import { buildSessionSelection, resolveTranscriptSelection, sessionSelectionStore } from '@/utils/sessionSelection'
import { entryIdFromElement } from '@/utils/sessionSelection'
import { findQuoteRange, wrapRange } from '@/utils/textQuote'
import HighlightPopover, { type HighlightPopoverState } from './HighlightPopover'
import SelectionActionsMenu, { rectForRange, selectionMenuStateFor, type SelectionMenuState } from './SelectionActionsMenu'

const MARK_CLASS = 'psm-text-highlight'
const REAPPLY_DELAYS_MS = [300, 800, 1600, 3000]
const SCROLL_REAPPLY_DEBOUNCE_MS = 200

interface HighlightRef {
  provider: PsmSessionHighlightProviderRuntimeRegistration
  highlight: PsmSessionHighlight
}

interface ActiveMenu extends SelectionMenuState {
  selection: PsmSessionSelection
}

interface SessionSelectionLayerProps {
  containerRef?: RefObject<HTMLElement | null> | null
  session: PsmSessionReference
  /** Bumped by the caller when transcript DOM may have been rebuilt. */
  revisionKey?: number | string
}

function highlightKey(ref: HighlightRef): string {
  return `${ref.provider.id}\u0000${ref.highlight.id}`
}

function findEntryElement(container: HTMLElement, entryId: string): Element | null {
  const candidates = container.querySelectorAll('[data-entry-id], [id^="entry-"]')
  for (const element of candidates) {
    if (entryIdFromElement(element) === entryId) return element
  }
  return null
}

/**
 * Host-side bridge between the transcript DOM and plugin contributions:
 * - text selection -> floating menu of registered selection actions
 * - registered text highlights -> re-anchored marks + plugin popover content
 */
export default function SessionSelectionLayer({
  containerRef,
  session,
  revisionKey,
}: SessionSelectionLayerProps) {
  const { selectionActions, highlightProviders } = usePsmPluginSessionUi()
  const [menu, setMenu] = useState<ActiveMenu | null>(null)
  const [popover, setPopover] = useState<HighlightPopoverState | null>(null)
  const highlightsRef = useRef<HighlightRef[]>([])
  const retryTimersRef = useRef<number[]>([])

  const applyHighlights = useCallback(() => {
    const container = containerRef?.current
    if (!container) return
    const live = new Set<string>()
    for (const ref of highlightsRef.current) live.add(highlightKey(ref))

    // Drop marks whose highlight no longer exists, keep the rest.
    const appliedKeys = new Set<string>()
    container.querySelectorAll<HTMLElement>(`mark.${MARK_CLASS}[data-psm-key]`).forEach((mark) => {
      const key = mark.dataset.psmKey ?? ''
      if (!live.has(key)) {
        mark.replaceWith(...Array.from(mark.childNodes))
        return
      }
      appliedKeys.add(key)
    })

    for (const ref of highlightsRef.current) {
      const key = highlightKey(ref)
      if (appliedKeys.has(key)) continue
      const entryElement = findEntryElement(container, ref.highlight.entryId)
      if (!entryElement) continue
      const range = findQuoteRange(entryElement, ref.highlight.textQuote)
      if (!range) continue
      const mark = document.createElement('mark')
      mark.className = MARK_CLASS
      mark.dataset.psmKey = key
      mark.dataset.psmProvider = ref.provider.id
      mark.dataset.psmHighlight = ref.highlight.id
      if (ref.highlight.label) mark.title = ref.highlight.label
      if (typeof ref.highlight.hue === 'number') {
        mark.style.setProperty('--psm-highlight-hue', String(ref.highlight.hue))
      }
      wrapRange(range, mark)
    }
  }, [containerRef])

  const scheduleApply = useCallback(() => {
    applyHighlights()
    for (const timer of retryTimersRef.current) window.clearTimeout(timer)
    retryTimersRef.current = REAPPLY_DELAYS_MS.map((delay) =>
      window.setTimeout(applyHighlights, delay),
    )
  }, [applyHighlights])

  // Resolve plugin highlights for this session and re-anchor them after every
  // transcript DOM rebuild (virtual scroll remounts, streaming updates).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const resolved: HighlightRef[] = []
      for (const provider of highlightProviders) {
        try {
          const highlights = await provider.resolveHighlights({ session })
          for (const highlight of highlights) resolved.push({ provider, highlight })
        } catch (error) {
          console.error(`[PSM highlights] Provider failed: ${provider.id}`, error)
        }
      }
      if (cancelled) return
      highlightsRef.current = resolved
      scheduleApply()
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [session, highlightProviders, scheduleApply])

  useEffect(() => {
    scheduleApply()
  }, [revisionKey, scheduleApply])

  useEffect(() => {
    return () => {
      for (const timer of retryTimersRef.current) window.clearTimeout(timer)
    }
  }, [])

  // Re-anchor after rows come back into the virtual window.
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(applyHighlights, SCROLL_REAPPLY_DEBOUNCE_MS)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      container.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, applyHighlights])

  // Reset per-session transient state.
  useEffect(() => {
    sessionSelectionStore.set(null)
    setMenu(null)
    setPopover(null)
  }, [session.path])

  // Selection -> menu.
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return

    const refreshMenu = () => {
      const anchor = resolveTranscriptSelection(window.getSelection())
      if (!anchor || !container.contains(anchor.entryElement)) {
        setMenu(null)
        return
      }
      const selection = buildSessionSelection(session, anchor)
      if (!selection) {
        setMenu(null)
        return
      }
      sessionSelectionStore.set(selection)
      setMenu({ selection, ...selectionMenuStateFor(rectForRange(anchor.range)) })
    }
    const onMouseUp = () => window.requestAnimationFrame(refreshMenu)
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key.startsWith('Arrow')) onMouseUp()
    }
    const onScroll = () => setMenu(null)
    const onDocumentMouseDown = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.psm-selection-menu')) return
      setMenu(null)
    }

    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('keyup', onKeyUp)
    container.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mousedown', onDocumentMouseDown, true)
    return () => {
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('keyup', onKeyUp)
      container.removeEventListener('scroll', onScroll)
      document.removeEventListener('mousedown', onDocumentMouseDown, true)
    }
  }, [containerRef, session])

  // Highlight activation -> plugin popover.
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return
    const onClick = (event: MouseEvent) => {
      const mark = (event.target as HTMLElement | null)?.closest(`mark.${MARK_CLASS}`) as HTMLElement | null
      if (!mark) return
      const key = mark.dataset.psmKey
      const ref = highlightsRef.current.find((item) => highlightKey(item) === key)
      if (!ref?.provider.renderPopover) return
      event.preventDefault()
      const content = ref.provider.renderPopover({
        session,
        highlight: ref.highlight,
        anchor: mark,
        close: () => setPopover(null),
      })
      setPopover({
        anchor: mark,
        content: (
          <PluginContributionBoundary
            pluginId={ref.provider.pluginId}
            contributionId={ref.provider.id}
            title={ref.provider.id}
          >
            {content as ReactNode}
          </PluginContributionBoundary>
        ),
      })
    }
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [containerRef, session])

  const runAction = useCallback(
    (action: PsmSelectionActionRuntimeRegistration) => {
      const selection = menu?.selection
      if (!selection) return
      setMenu(null)
      void Promise.resolve(
        action.run({ selection, close: () => setMenu(null), openPanel: requestOpenSessionPanel }),
      ).catch((error) => {
        console.error(`[PSM selection] Action failed: ${action.id}`, error)
      })
    },
    [menu],
  )

  return (
    <>
      {menu && selectionActions.length > 0 && (
        <SelectionActionsMenu
          state={menu}
          actions={selectionActions}
          onRun={runAction}
          onClose={() => setMenu(null)}
        />
      )}
      {popover && <HighlightPopover state={popover} onClose={() => setPopover(null)} />}
    </>
  )
}
