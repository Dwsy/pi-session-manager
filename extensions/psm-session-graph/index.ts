import { createElement } from 'react'
import type { PsmPluginHostContext, PsmSessionTreeViewRenderProps } from '@pi-session-manager/plugin-sdk'

import SessionGraphView from './SessionGraphView'
import { manifest } from './manifest'

export { manifest }

function renderGraphView(props: PsmSessionTreeViewRenderProps, viewMode: 'flow' | 'hierarchy') {
  return createElement(SessionGraphView, {
    entries: props.entries,
    activeEntryId: props.activeEntryId ?? undefined,
    onNavigate: props.onNavigate,
    filter: props.filter as any,
    viewMode,
    labelsByTargetId: props.labelsByTargetId,
  })
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionTreeView({
    id: 'builtin.session-graph.flow',
    title: 'Flow',
    icon: 'Network',
    render: (props) => renderGraphView(props, 'flow'),
  })

  ctx.ui.registerSessionTreeView({
    id: 'builtin.session-graph.hierarchy',
    title: 'Hierarchy',
    icon: 'GitBranch',
    render: (props) => renderGraphView(props, 'hierarchy'),
  })
}
