# PSM Tool Renderer Plugin Guide

PSM tool renderer plugins customize how tool calls appear in the session viewer.
They are PSM plugins that call `ctx.ui.registerToolRenderer(...)` during activation.

This guide covers the public SDK contract, first-party builtin plugin layout, and the
minimal steps for adding a new renderer.

## When To Add A Tool Renderer

Add a renderer when a tool result has domain structure that the generic renderer cannot
show clearly.

Good candidates:

- planning tools with task lists and acceptance criteria
- user-interaction tools with questions, choices, and answers
- agent orchestration tools with status, model, token, and artifact metadata
- tools whose output mixes arguments, result details, and human-facing text

Do not add a renderer only to change colors or labels. The generic renderer is enough
for simple tools.

## Runtime Shape

```text
PSM startup
  -> register core renderers from src/plugins/tools-render/builtins
  -> initializePsmPluginHost()
  -> load default builtin PSM plugins from src/plugins/runtime-host/builtins.ts
  -> plugin activate(ctx)
  -> ctx.ui.registerToolRenderer(renderer)
  -> runtime-host bridges renderer into toolRenderRegistry
  -> AssistantMessage resolves matching renderer for each tool call
```

The renderer lifecycle is owned by the PSM plugin host:

- plugin disabled: renderer is not registered
- plugin reload: old renderer is unregistered, then the plugin activates again
- activation failure: renderer IDs registered by that activation are unregistered
- duplicate renderer ID: first registration wins, later plugin gets a `warn` diagnostic

## Public SDK Contract

Import renderer types from the SDK:

```ts
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmToolCallContent,
} from '@pi-session-manager/plugin-sdk'
```

A renderer registration contains:

```ts
export const myRenderer: PsmToolRendererRegistration = {
  id: 'builtin-my-tool-renderer',
  name: 'My Tool Renderer',
  match: 'my_tool',
  priority: 120,
  component: MyToolRenderer,
  getSearchSegments: getSearchSegments,
  getPreview: (_toolCall, data) => data.output,
}
```

Matcher forms:

```ts
match: 'ask_user_question'
match: /^(Agent|subagent)$/
match: (toolCall) => toolCall.name?.startsWith('my_prefix_') === true
```

`priority` defaults to the registry default. Use a higher priority than generic/builtin
fallbacks when a tool could match multiple renderers.

## Renderer Props

`component` receives `PsmToolRenderProps`:

```ts
function MyToolRenderer({ resolvedData, searchQuery, context }: PsmToolRenderProps) {
  const { name, args, output, result, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded, theme, isMobile, copyToClipboard } = context
  return null
}
```

Important fields:

| Field | Meaning |
| --- | --- |
| `resolvedData.name` | tool name |
| `resolvedData.args` | tool call arguments from `toolCall.arguments` |
| `resolvedData.output` | human-renderable text extracted from the tool result |
| `resolvedData.result` | raw session entry for the tool result |
| `resolvedData.result?.message?.details` | structured details returned by the tool, if any |
| `resolvedData.isError` | error flag inferred from result content/details |
| `context.isExpanded` | current expansion state for this tool card |
| `context.toggleExpanded()` | toggles expanded state |
| `context.disableSuccessStyle` | user setting for suppressing success styling |

Treat `result.message.details` as `unknown` at the boundary. Narrow it with local helper
functions instead of assuming a shape.

## First-Party Builtin Layout

Default builtin renderers live under `extensions/psm-*` and are loaded from
`src/plugins/runtime-host/builtins.ts`.

Current examples:

| Plugin | Tool(s) | Purpose |
| --- | --- | --- |
| `extensions/psm-ask-user-question-renderer` | `ask_user_question` | render structured questions, options, answers, notes, and previews |
| `extensions/psm-loop-renderer` | `submit_loop_plan`, `signal_loop_success` | render loop plan tasks and loop progress/results |
| `extensions/psm-subagent-renderer` | `Agent`, `subagent` | render subagent status cards and detail modal |

Recommended file shape:

```text
extensions/psm-my-tool-renderer/
└── index.tsx
```

Use extra component files only when the renderer is large:

```text
extensions/psm-subagent-renderer/
├── index.ts
├── SubagentToolRenderer.tsx
└── SubagentModal.tsx
```

## Minimal Builtin Renderer Example

```tsx
import { CheckCircle2 } from 'lucide-react'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
} from '@pi-session-manager/plugin-sdk'

function ExampleRenderer({ resolvedData, context }: PsmToolRenderProps) {
  const { args, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded, disableSuccessStyle } = context
  const statusClass = isError ? 'error' : disableSuccessStyle ? '' : 'success'

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <div className="tool-header select-none" onClick={toggleExpanded}>
        <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        <span className="tool-name inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          Example tool
        </span>
        <span className="tool-meta">{String(args.kind ?? 'ready')}</span>
      </div>

      <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
        <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded && <div className="p-3 whitespace-pre-wrap text-sm">{output}</div>}
        </div>
      </div>
    </div>
  )
}

export const exampleRenderer: PsmToolRendererRegistration = {
  id: 'builtin-example-renderer',
  name: 'Example Renderer',
  match: 'example_tool',
  priority: 120,
  component: ExampleRenderer,
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.example-renderer',
  name: 'Example Renderer',
  version: '1.0.0',
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(exampleRenderer)
}
```

Register it as a default builtin:

```ts
// src/plugins/runtime-host/builtins.ts
export const builtinPsmPluginEntries: PsmPluginLoadEntry[] = [
  {
    source: 'builtin',
    sourceId: 'extensions/psm-my-tool-renderer',
    load: () => import('../../../extensions/psm-my-tool-renderer/index'),
  },
  // ...
]
```

Add a default-entry test:

```ts
expect(sourceIds).toContain('extensions/psm-my-tool-renderer')
```

## Rendering Rules

Use existing tool card structure so all renderers feel native:

- outer card: `tool-execution`, plus `success` or `error` where appropriate
- clickable header: `tool-header select-none`
- expand indicator: `tool-expand-indicator`
- title: `tool-name`
- compact metadata: `tool-meta`
- body wrapper: `tool-output-wrapper collapsible`
- inner expansion: `tool-expand-content`

Use Tailwind utility classes inside plugin-owned bodies for small layout needs. Prefer
existing semantic tokens/classes (`border-border`, `bg-surface`, `text-muted-foreground`,
`text-accent`) over hard-coded colors.

Do not put page-level cards inside tool cards. Tool renderer content should remain compact,
scannable, and stable at narrow widths.

## Data Normalization Pattern

Keep raw data at the edge and normalize before render:

```ts
type MyToolDetails = {
  items?: unknown
  error?: unknown
}

function getDetails(data: PsmToolResolvedData): MyToolDetails {
  const message = data.result?.message as { details?: MyToolDetails } | undefined
  return message?.details ?? {}
}

function asItems(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}
```

This avoids leaking untyped result shapes into JSX.

## Search And Preview

If the renderer hides structured fields behind collapsed UI, add search segments:

```ts
function getSearchSegments(_toolCall: PsmToolCallContent, data: PsmToolResolvedData): string[] {
  return [data.name, data.output, String(data.args.title ?? '')].filter(Boolean)
}
```

Use `getPreview` for compact summaries in session lists or future overview surfaces:

```ts
getPreview: (_toolCall, data) => `Example: ${String(data.args.title ?? '')}`
```

## Verification Checklist

Run these after adding a renderer:

```bash
pnpm exec tsc --noEmit
pnpm vitest run src/plugins/runtime-host/__tests__/host.test.ts
pnpm exec tsc -p packages/runtime-sdk/tsconfig.json --emitDeclarationOnly
```

Also inspect for stale direct registrations:

```bash
rg -n "registerExtensionToolPlugins|toolRenderRegistry.register|<old renderer name>" src extensions docs packages -g '*.{ts,tsx,md}'
```

Expected result:

- new renderer is loaded from `src/plugins/runtime-host/builtins.ts`
- no app startup direct registration remains
- old renderer-specific files are not left under `src/components/tool-calls/` unless shared by non-plugin UI
- TypeScript and focused runtime-host tests pass

## Boundaries

Allowed for first-party builtin renderers:

- importing React-compatible components from the app when needed
- importing `lucide-react`
- using app semantic CSS classes
- using SDK renderer types

Avoid:

- importing `appPsmTransport`, runtime-host internals, or Tauri APIs directly
- registering the same renderer from both App startup and plugin activation
- assuming external npm plugins can import `@/components` or `@/utils`
- hard-coding dark-only colors
- adding renderer-specific state outside the renderer or plugin lifecycle

External npm plugins should depend only on `@pi-session-manager/plugin-sdk` and normal peer
runtime libraries. App-local imports are for repo-local builtin plugins only.
