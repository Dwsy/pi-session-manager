import type * as ReactRuntime from 'react'

type HostReact = typeof ReactRuntime

export function hostReact(): HostReact {
  const value = (globalThis as Record<string, unknown>).__PSM_HOST_REACT__ as HostReact | undefined
  if (!value) {
    throw new Error('PSM host React runtime is not available')
  }
  return value
}

const runtime = hostReact()
export const createElement = runtime.createElement
export const forwardRef = runtime.forwardRef
