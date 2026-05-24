export interface PsmRuntimeEventEnvelope<Name extends string = string, Payload = unknown> {
  name: Name
  payload: Payload
}

type PsmRuntimeEventListener = (event: PsmRuntimeEventEnvelope) => void

class PsmRuntimeEventBus {
  private readonly listeners = new Map<string, Set<PsmRuntimeEventListener>>()

  subscribe<Name extends string, Payload = unknown>(
    eventName: Name,
    listener: (event: PsmRuntimeEventEnvelope<Name, Payload>) => void,
  ): () => void {
    const normalizedEventName = String(eventName)
    if (!normalizedEventName.trim()) {
      throw new Error('eventName is required')
    }

    const listeners = this.listeners.get(normalizedEventName) ?? new Set<PsmRuntimeEventListener>()
    this.listeners.set(normalizedEventName, listeners)

    const wrappedListener = listener as PsmRuntimeEventListener
    listeners.add(wrappedListener)

    return () => {
      if (!listeners.has(wrappedListener)) return
      listeners.delete(wrappedListener)
      if (listeners.size === 0) {
        this.listeners.delete(normalizedEventName)
      }
    }
  }

  emit<Name extends string, Payload = unknown>(eventName: Name, payload: Payload): void {
    const listeners = this.listeners.get(String(eventName))
    if (!listeners || listeners.size === 0) return

    const event = { name: eventName, payload } as PsmRuntimeEventEnvelope<Name, Payload>
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch (error) {
        console.error(`[PSM runtime events] Listener failed for ${String(eventName)}:`, error)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

export const psmRuntimeEventBus = new PsmRuntimeEventBus()

export function emitPsmRuntimeEvent<Name extends string, Payload = unknown>(
  eventName: Name,
  payload: Payload,
): void {
  psmRuntimeEventBus.emit(eventName, payload)
}
