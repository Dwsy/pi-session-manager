import { createElement } from 'react'
import type {
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@pi-session-manager/plugin-sdk'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'

import { manifest } from './manifest'
import { SemanticSearchView, SEMANTIC_SEARCH_VIEW_ID } from './SemanticSearchView'
import { runSemanticSearchAgent } from './agentSearch'

export { manifest }
export { runSemanticSearchAgent }

const SEMANTIC_SEARCH_TOOL = 'semantic_search'

function openSearchCommand(ctx: PsmPluginHostContext) {
  return async (args: Record<string, unknown>, context?: { navigate?: { openAppView?: (id: string) => void } }) => {
    context?.navigate?.openAppView?.(SEMANTIC_SEARCH_VIEW_ID)

    if (typeof args.query === 'string' && args.query.trim()) {
      return runSemanticSearchAgent(ctx, args)
    }

    return { success: true, opened: true }
  }
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerAppView({
    id: SEMANTIC_SEARCH_VIEW_ID,
    title: ctx.i18n.t('plugins.semanticSearch.title', 'Semantic Search'),
    route: '/semantic-search',
    icon: 'search',
    shortcut: 'Cmd+Shift+F',
    render: (props) => createElement(SemanticSearchView, {
      ...(props as PsmAppViewRenderProps<AppPluginSurfaceData>),
      ctx,
    }),
  })

  ctx.registerTool(SEMANTIC_SEARCH_TOOL, {
    description: 'Run a native Pi SDK ReAct workflow over PSM sessions using controlled search/session tools.',
    run: (args) => runSemanticSearchAgent(ctx, args),
  })

  ctx.registerCommand('semantic-search.open', openSearchCommand(ctx))
  ctx.registerCommand('semantic-search.search', async (args) => runSemanticSearchAgent(ctx, args))
}
