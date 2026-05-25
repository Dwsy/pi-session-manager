# Pi SDK Agent Bridge Interface Draft

## Goal

Expose native Pi SDK agent execution to built-in PSM plugins through a host-owned bridge. Plugins should not import Pi SDK directly from the WebView bundle. PSM owns model resolution, permissions, and plugin-scoped session storage.

## Verified Existing PSM Plugin Boundaries

- `PsmPluginHostContext.registerCommand(command, handler)` registers plugin commands in the runtime host.
- `PsmPluginHostContext.registerTool(name, tool)` registers thin plugin tools with only `description` and `run(args)`.
- `createPluginCapabilityClient()` builds the current `ctx.psm` client from `appPsmTransport` and permission context.
- `PsmCapabilityClient` currently exposes `records`, `sessions`, `search`, `agent`, `models`, `tags`, and `config`.

Current limitation: `registerTool` is host-callable, but it is not a native Pi SDK `AgentSession` runtime. It does not own model state, message history, tool execution events, compaction, or ReAct turn lifecycle.

## Verified Pi SDK Capabilities

- `createAgentSession()` creates an `AgentSession` with model, tools, auth/model registry, resource loader, settings manager, and session manager.
- `SessionManager.inMemory()`, `SessionManager.create(cwd)`, `SessionManager.continueRecent(cwd)`, and `SessionManager.open(path)` control persistence.
- `tools: [...]` selects built-in tool names. Custom tools are provided through the Pi extension runtime path.
- `session.prompt()` runs an agent turn and waits for completion.
- `session.subscribe()` streams message, tool execution, turn, queue, compaction, and retry events.
- `session.abort()` cancels current work and `session.dispose()` releases runtime resources.
- `session.agent.state.tools` exposes the actual model-callable `AgentTool[]` state.

## Minimal Bridge Shape

```ts
interface PsmAgentClient {
  createSession(params: PsmAgentCreateSessionParams): Promise<PsmAgentSessionHandle>
  run(params: PsmAgentRunParams): Promise<PsmAgentRunResult>
  runStream(params: PsmAgentRunParams, handlers?: PsmAgentRunStreamHandlers): Promise<PsmAgentRunResult>
  abort(sessionId: string): Promise<void>
  dispose(sessionId: string): Promise<void>
}

interface PsmAgentCreateSessionParams {
  cwd?: string
  purpose: string
  systemPrompt?: string
  model?: { provider?: string; id?: string } | 'host-default'
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  tools: PsmAgentToolRef[]
  storage?: {
    scope: 'memory' | 'plugin'
    key?: string
  }
}

interface PsmAgentToolRef {
  name: 'psm.search.fulltext' | 'psm.sessions.readEntries' | 'psm.sessions.open' | string
  permission: string
}

interface PsmAgentRunParams {
  sessionId: string
  prompt: string
  images?: Array<{ mimeType: string; data: string }>
  streamingBehavior?: 'steer' | 'followUp'
}
```

## Host Responsibilities

- Resolve model from PSM settings and existing auth/model configuration.
- Create Pi SDK `AgentSession` in host/sidecar runtime, not inside plugin UI bundle.
- Adapt allowed PSM capabilities into Pi SDK tools.
- Enforce plugin manifest permissions before exposing tools.
- Persist plugin agent sessions through a plugin-scoped storage adapter.
- Stream Pi SDK events to plugin UI with stable session IDs.

## Semantic Search First Use

The `psm-semantic-search` plugin should call `ctx.psm.agent.createSession()` with controlled tools:

- `psm.search.fulltext`
- `psm.sessions.readEntries`
- `psm.sessions.open`

Then call `ctx.psm.agent.run()` with the user's query. The UI renders streamed tool trace and final answer. Search expansion, iteration, evidence selection, and answer synthesis become native Pi SDK ReAct behavior rather than plugin-local `generateText` logic.
