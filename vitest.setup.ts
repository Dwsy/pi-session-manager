// Global test setup for jsdom environments.
//
// jsdom deliberately does NOT implement layout APIs (ResizeObserver,
// Element.scrollIntoView, etc.) because it has no real layout engine.
// Components under test (virtual scroll, auto-grow textareas, terminal panels,
// auto-scroll-to-bottom message viewers) rely on these. Without polyfills they
// throw "X is not defined" / "not a function" and the test never reaches the
// assertion. These are inert no-op shims — enough for React effects to run.

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// @testing-library/react auto-registers cleanup via the vitest global `afterEach`
// hook — but only when `test.globals` is enabled. This project runs with
// `globals: false`, so we wire cleanup up explicitly here to prevent DOM from
// leaking between tests (which causes spurious "multiple elements" failures).
afterEach(() => {
  cleanup()
})

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    readonly root: Element | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}

if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // no-op: jsdom has no layout to scroll
  }
}

if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollTo !== 'function'
) {
  Element.prototype.scrollTo = function scrollTo(): void {
    // no-op
  }
}

// jsdom lacks window.matchMedia; some components query prefers-color-scheme etc.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// Silence "not implemented" navigation errors from jsdom that flood the log
// when a component renders <a href> clicked in tests.
if (typeof window !== 'undefined') {
  const origError = console.error
  console.error = (...args: unknown[]) => {
    const first = args[0]
    if (
      typeof first === 'string' &&
      first.includes('Not implemented: navigation')
    ) {
      return
    }
    origError(...(args as Parameters<typeof console.error>))
  }
}
