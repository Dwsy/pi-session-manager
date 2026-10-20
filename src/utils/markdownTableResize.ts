/**
 * Progressive enhancement for Markdown tables: wraps each table in a scroll
 * container and adds pointer-drag handles for column width and table height.
 * Optional memoization stores sizes in localStorage keyed by a content hash;
 * it is OFF unless explicitly enabled via options.
 */

const MIN_COLUMN_WIDTH = 48
const MIN_TABLE_HEIGHT = 48

const STORAGE_PREFIX = 'psm:md-table-resize:'
const STORAGE_MAX_ENTRIES = 200

interface SavedTableSize {
  cols: number[]
  height?: number
}

export interface MarkdownTableResizeOptions {
  /** Persist sizes in localStorage keyed by table content hash. Default false. */
  memoize?: boolean
}

export function enableMarkdownTableResize(root: HTMLElement, options: MarkdownTableResizeOptions = {}): void {
  const memoize = options.memoize === true
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>('table'))
  for (const table of tables) {
    // Guard against double enhancement when DOM nodes are reused.
    if (table.parentElement?.classList.contains('markdown-table-scroll')) {
      continue
    }
    enhanceTable(table, memoize)
  }
}

function enhanceTable(table: HTMLTableElement, memoize: boolean): void {
  const headerCells = table.querySelector('tr')?.cells
  if (!headerCells || headerCells.length === 0) {
    return
  }
  const storageKey = memoize ? STORAGE_PREFIX + hashTableContent(table) : null

  const wrapper = document.createElement('div')
  wrapper.className = 'markdown-table-resize'
  const scroller = document.createElement('div')
  scroller.className = 'markdown-table-scroll'

  table.parentElement?.insertBefore(wrapper, table)
  wrapper.appendChild(scroller)
  scroller.appendChild(table)

  for (let index = 0; index < headerCells.length; index += 1) {
    const handle = document.createElement('div')
    handle.className = 'md-table-col-handle'
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', `Resize column ${index + 1}`)
    handle.title = 'Drag to resize column'
    headerCells[index].appendChild(handle)
    attachColumnDrag(table, handle, index, headerCells.length, storageKey)
  }

  const heightHandle = document.createElement('div')
  heightHandle.className = 'md-table-height-handle'
  heightHandle.setAttribute('role', 'separator')
  heightHandle.setAttribute('aria-orientation', 'horizontal')
  heightHandle.setAttribute('aria-label', 'Resize table height')
  heightHandle.title = 'Drag to resize table height'
  wrapper.appendChild(heightHandle)
  attachHeightDrag(scroller, heightHandle, table, storageKey)

  applySavedSize(table, scroller, storageKey, headerCells.length)
}

/**
 * Content-based identity: normalized cell text joined per row. Handles are
 * injected after hashing, so the handle labels never pollute the key.
 */
function hashTableContent(table: HTMLTableElement): string {
  const rows = Array.from(table.rows)
    .map((row) => Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? '').join('\t'))
    .join('\n')

  let hash = 5381
  for (let i = 0; i < rows.length; i += 1) {
    hash = ((hash << 5) + hash) ^ rows.charCodeAt(i)
  }
  return `${rows.length}:${(hash >>> 0).toString(16)}`
}

function loadSavedSize(storageKey: string): SavedTableSize | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as SavedTableSize
    if (!Array.isArray(parsed.cols) || parsed.cols.some((w) => !Number.isFinite(w) || w < MIN_COLUMN_WIDTH)) {
      return null
    }
    if (parsed.height !== undefined && (!Number.isFinite(parsed.height) || parsed.height < MIN_TABLE_HEIGHT)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function saveSize(storageKey: string, size: SavedTableSize): void {
  try {
    pruneIfNeeded()
    localStorage.setItem(storageKey, JSON.stringify(size))
  } catch {
    // Quota exceeded or storage disabled: resize still works in-memory.
  }
}

/** Cap entry count by evicting oldest keys (localStorage key insertion order). */
function pruneIfNeeded(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) {
      keys.push(key)
    }
  }
  if (keys.length < STORAGE_MAX_ENTRIES) {
    return
  }
  for (const key of keys.slice(0, keys.length - STORAGE_MAX_ENTRIES + 1)) {
    localStorage.removeItem(key)
  }
}

/**
 * Freeze the first row's current pixel widths into a colgroup and switch to
 * fixed layout so col widths become deterministic during drag. When savedCols
 * is provided it overrides the measured widths.
 */
function lockTableLayout(
  table: HTMLTableElement,
  columnCount: number,
  savedCols?: number[],
): HTMLTableColElement[] {
  let colgroup = table.querySelector(':scope > colgroup')
  if (!colgroup) {
    colgroup = document.createElement('colgroup')
    table.insertBefore(colgroup, table.firstChild)
  }
  while (colgroup.children.length < columnCount) {
    colgroup.appendChild(document.createElement('col'))
  }
  const columns = Array.from(colgroup.children) as HTMLTableColElement[]

  if (table.style.tableLayout !== 'fixed') {
    const cells = table.rows[0]?.cells
    let totalWidth = 0
    for (let i = 0; i < columnCount; i += 1) {
      const width = savedCols?.[i] ?? Math.max(MIN_COLUMN_WIDTH, cells?.[i]?.offsetWidth ?? MIN_COLUMN_WIDTH)
      columns[i].style.width = `${width}px`
      totalWidth += width
    }
    table.style.tableLayout = 'fixed'
    table.style.width = `${totalWidth}px`
  }
  return columns
}

/**
 * Restore memoized sizes only when the table shape (column count) still
 * matches what was saved; layout is frozen lazily with the saved widths.
 */
function applySavedSize(
  table: HTMLTableElement,
  scroller: HTMLElement,
  storageKey: string | null,
  columnCount: number,
): void {
  if (!storageKey) {
    return
  }
  const saved = loadSavedSize(storageKey)
  if (!saved || saved.cols.length !== columnCount) {
    return
  }
  if (saved.height !== undefined) {
    scroller.style.height = `${saved.height}px`
  }
  lockTableLayout(table, columnCount, saved.cols)
}

function collectCols(table: HTMLTableElement): number[] {
  const colgroup = table.querySelector(':scope > colgroup')
  if (!colgroup) {
    return []
  }
  return Array.from(colgroup.children).map(
    (col) => parseFloat((col as HTMLTableColElement).style.width) || MIN_COLUMN_WIDTH,
  )
}

function persistSize(storageKey: string | null, table: HTMLTableElement, scroller: HTMLElement): void {
  if (!storageKey) {
    return
  }
  saveSize(storageKey, { cols: collectCols(table), height: scroller.offsetHeight || undefined })
}

function attachColumnDrag(
  table: HTMLTableElement,
  handle: HTMLElement,
  columnIndex: number,
  columnCount: number,
  storageKey: string | null,
): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    const columns = lockTableLayout(table, columnCount)
    const startX = event.clientX
    const startWidth = Math.max(MIN_COLUMN_WIDTH, table.rows[0]?.cells[columnIndex]?.offsetWidth ?? MIN_COLUMN_WIDTH)

    handle.classList.add('is-dragging')
    if (typeof handle.setPointerCapture === 'function') {
      handle.setPointerCapture(event.pointerId)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      columns[columnIndex].style.width = `${Math.max(MIN_COLUMN_WIDTH, startWidth + delta)}px`
    }
    const onEnd = () => {
      handle.classList.remove('is-dragging')
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)
      const scroller = table.closest<HTMLElement>('.markdown-table-scroll')
      if (scroller) {
        persistSize(storageKey, table, scroller)
      }
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
  })
}

function attachHeightDrag(
  scroller: HTMLElement,
  handle: HTMLElement,
  table: HTMLTableElement,
  storageKey: string | null,
): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = scroller.offsetHeight

    handle.classList.add('is-dragging')
    if (typeof handle.setPointerCapture === 'function') {
      handle.setPointerCapture(event.pointerId)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY
      scroller.style.height = `${Math.max(MIN_TABLE_HEIGHT, startHeight + delta)}px`
    }
    const onEnd = () => {
      handle.classList.remove('is-dragging')
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)
      persistSize(storageKey, table, scroller)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
  })
}
