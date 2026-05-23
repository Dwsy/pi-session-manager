import { Component, type ErrorInfo, type ReactNode } from 'react'

import { psmPluginHost } from './host'

interface PluginContributionBoundaryProps {
  children: ReactNode
  contributionId: string
  pluginId: string
  title: string
}

interface PluginContributionBoundaryState {
  error: string | null
}

export class PluginContributionBoundary extends Component<PluginContributionBoundaryProps, PluginContributionBoundaryState> {
  state: PluginContributionBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): PluginContributionBoundaryState {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    psmPluginHost.recordUiRenderError(this.props.pluginId, this.props.contributionId, error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="inline-flex min-h-7 max-w-[280px] items-center rounded-md border border-warning/35 bg-warning/10 px-2 py-1 text-xs text-warning">
          <span className="truncate" title={`${this.props.title}: ${this.state.error}`}>Plugin UI failed</span>
        </div>
      )
    }

    return this.props.children
  }
}

export function PluginContributionSlot({ render }: { render: () => unknown }) {
  return <>{render() as ReactNode}</>
}
