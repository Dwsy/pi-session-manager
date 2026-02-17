import React from 'react'

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-background text-foreground">
          <div className="text-center px-4">
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm opacity-70 max-w-md mx-auto">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
