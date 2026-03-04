const DEBUG_KEY = 'pi:debug:kanban-preview'

let sequence = 0

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function isKanbanPreviewDebugEnabled(): boolean {
  if (!isBrowser()) return false

  const flag = window.localStorage.getItem(DEBUG_KEY)
  if (flag === '1' || flag === 'true' || flag === 'on') {
    return true
  }

  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('debugKanbanPreview') === '1'
  } catch {
    return false
  }
}

export function logKanbanPreview(event: string, payload?: Record<string, unknown>): void {
  if (!isKanbanPreviewDebugEnabled()) return

  sequence += 1
  const nowIso = new Date().toISOString()
  const perfNow = typeof performance !== 'undefined' && performance.now
    ? Number(performance.now().toFixed(2))
    : Date.now()

  const label = `[KANBAN_PREVIEW][${sequence}] ${event}`
  const record = {
    seq: sequence,
    event,
    time: nowIso,
    perf: perfNow,
    payload: payload ?? null,
  }

  console.groupCollapsed(label)
  console.log('time', nowIso)
  console.log('perf', perfNow)
  if (payload) {
    console.log(payload)
  }
  console.log('json', JSON.stringify(record))
  console.groupEnd()
}

export function getKanbanPreviewDebugKey(): string {
  return DEBUG_KEY
}
