// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorBoundary } from '../ErrorBoundary'

// Mock console.error to avoid noise in test output
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})

afterEach(() => {
  cleanup()
  console.error = originalConsoleError
})

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Child content')).toBeDefined()
  })

  it('renders error message when child component throws', () => {
    // Suppress React's error boundary console output
    const spy = vi.spyOn(console, 'error')
    spy.mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText('Test error message')).toBeDefined()

    spy.mockRestore()
  })

  it('renders generic error message when error has no message', () => {
    const spy = vi.spyOn(console, 'error')
    spy.mockImplementation(() => {})

    function ThrowEmptyError() {
      throw new Error()
    }

    render(
      <ErrorBoundary>
        <ThrowEmptyError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText('An unexpected error occurred')).toBeDefined()

    spy.mockRestore()
  })

  it('logs error to console when error occurs', () => {
    const consoleSpy = vi.spyOn(console, 'error')
    consoleSpy.mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(consoleSpy).toHaveBeenCalledWith(
      'Uncaught error:',
      expect.any(Error),
      expect.any(Object)
    )

    consoleSpy.mockRestore()
  })

  it('renders with correct styling classes', () => {
    const spy = vi.spyOn(console, 'error')
    spy.mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    const container = screen.getByText('Something went wrong').closest('div')
    expect(container?.parentElement?.className).toContain('flex')
    expect(container?.parentElement?.className).toContain('items-center')
    expect(container?.parentElement?.className).toContain('justify-center')

    spy.mockRestore()
  })
})
