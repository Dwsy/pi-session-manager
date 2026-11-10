import type { PsmPluginHostContext } from '@dwsy/plugin-sdk'

import {
  buildOpenBotAgentIndex,
  resolveGeneratedDirectoryIdentity,
  resolveOpenBotAgentIdentity,
  type OpenBotAgentIndex,
} from './identity'
import { manifest } from './manifest'

export { manifest }

export const AGENT_PROVIDER_ID = 'builtin.project-identity.openbot-agents'
export const GENERATED_PROVIDER_ID = 'builtin.project-identity.generated-directories'

/** Agent metadata is optional; any failure keeps the directory-name fallback. */
export async function loadOpenBotAgentIndex(
  ctx: Pick<PsmPluginHostContext, 'psm' | 'log'>,
): Promise<OpenBotAgentIndex> {
  try {
    return buildOpenBotAgentIndex(await ctx.psm.openbot.listAgents())
  } catch (error) {
    ctx.log.warn('OpenBot agent metadata unavailable; keeping directory names', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return buildOpenBotAgentIndex([])
  }
}

export default async function activate(ctx: PsmPluginHostContext) {
  const agents = await loadOpenBotAgentIndex(ctx)

  if (agents.byId.size > 0) {
    ctx.ui.registerProjectIdentityProvider({
      id: AGENT_PROVIDER_ID,
      priority: 10,
      resolve: (project) => resolveOpenBotAgentIdentity(project, agents),
    })
  }

  ctx.ui.registerProjectIdentityProvider({
    id: GENERATED_PROVIDER_ID,
    priority: 100,
    resolve: resolveGeneratedDirectoryIdentity,
  })
}
