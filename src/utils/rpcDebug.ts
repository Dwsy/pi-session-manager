type AnyRecord = Record<string, unknown>

function readDebugMode(): boolean {
  try {
    const raw = localStorage.getItem('pi-session-manager-settings')
    if (!raw) return false
    const parsed = JSON.parse(raw) as { advanced?: { debugMode?: boolean } }
    return parsed?.advanced?.debugMode === true
  } catch {
    return false
  }
}

export function isRPCDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true
  if (import.meta.env.VITE_RPC_DEBUG === '1') return true
  return readDebugMode()
}

export function rpcDebug(scope: string, message: string, payload?: unknown): void {
  if (!isRPCDebugEnabled()) return
  const prefix = `[RPC-DEBUG][${scope}] ${message} ${new Date().toISOString()}`
  if (payload === undefined) {
    console.log(prefix)
    return
  }
  console.log(prefix, payload)
}

export function rpcWarn(scope: string, message: string, payload?: unknown): void {
  const prefix = `[RPC-WARN][${scope}] ${message} ${new Date().toISOString()}`
  if (payload === undefined) {
    console.warn(prefix)
    return
  }
  console.warn(prefix, payload)
}

export function rpcError(scope: string, message: string, payload?: unknown): void {
  const prefix = `[RPC-ERROR][${scope}] ${message} ${new Date().toISOString()}`
  if (payload === undefined) {
    console.error(prefix)
    return
  }
  console.error(prefix, payload)
}

export function summarizePayload(payload: unknown): AnyRecord | unknown {
  if (!payload || typeof payload !== 'object') return payload
  const data = payload as AnyRecord
  const summary: AnyRecord = {}
  for (const key of Object.keys(data)) {
    const value = data[key]
    if (typeof value === 'string' && value.length > 180) {
      summary[key] = `${value.slice(0, 180)}...(${value.length})`
    } else {
      summary[key] = value
    }
  }
  return summary
}
