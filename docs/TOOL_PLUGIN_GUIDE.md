# Tool Render Plugin System Guide

## Quick Start

### 1. System Auto-Initialization

Built-in plugins are automatically registered in `App.tsx`. No extra action needed.

### 2. Create Custom Tool Plugin

```typescript
import type { ToolRenderPlugin, ToolRenderProps } from './plugins/tools'
import { toolRenderRegistry } from './plugins/tools'

// Create render component
function MyCustomToolRender({ resolvedData, context, searchQuery }: ToolRenderProps) {
  const { args, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded } = context

  return (
    <div className={`tool-execution ${isError ? 'error' : 'success'}`}>
      <div className="tool-header cursor-pointer" onClick={toggleExpanded}>
        <span>{isExpanded ? '▾' : '▸'}</span>
        <span>My Tool: {args.name}</span>
      </div>
      {isExpanded && (
        <div className="tool-output">
          {output}
        </div>
      )}
    </div>
  )
}

// Define plugin
const myToolPlugin: ToolRenderPlugin = {
  id: 'my-custom-tool',
  name: 'My Custom Tool',
  match: /^mytool_/,  // Match all tools starting with mytool_
  priority: 100,
  component: MyCustomToolRender,
  getSearchSegments: (toolCall, data) => {
    return [data.args.name, data.output]
  },
  getPreview: (toolCall, data) => `MyTool: ${data.args.name}`,
}

// Register plugin
toolRenderRegistry.register(myToolPlugin)
```

### 3. Match Patterns

```typescript
// Exact match
match: 'bash'

// Regex match
match: /^mcp__/

// Function match
match: (toolCall) => toolCall.name?.startsWith('custom_')

// Multi-condition match
match: (toolCall) => {
  const name = toolCall.name || ''
  return name === 'read' || name === 'write'
}
```

### 4. Full Plugin Interface

```typescript
interface ToolRenderPlugin {
  // Required
  id: string                    // Unique identifier
  name: string                  // Display name
  match: ToolMatcher            // Match logic
  component: React.ComponentType<ToolRenderProps>

  // Optional
  icon?: React.ComponentType
  description?: string
  priority?: number             // Priority (default 50)

  // Data resolution
  resolveData?: (toolCall, index, resultMap) => ResolvedToolData | null

  // Search integration
  getSearchSegments?: (toolCall, data) => string[]
  getPreview?: (toolCall, data) => string

  // Lifecycle
  isEnabled?: () => boolean
  onMount?: () => void
  onUnmount?: () => void

  // Styling
  styles?: string | CSSProperties
}
```

### 5. Built-in Plugins

| Plugin ID | Match | Description | Category |
|-----------|-------|-------------|----------|
| `builtin-bash` | `bash` | Command execution | Core |
| `builtin-read` | `read` | File read | Core |
| `builtin-write` | `write` | File write | Core |
| `builtin-edit` | `edit` | File edit with diff | Core |
| `builtin-ask-user-question-renderer` | `ask_user_question` | Structured user question rendering | PSM builtin plugin (`extensions/psm-ask-user-question-renderer`) |
| `builtin-loop-renderer` | `submit_loop_plan`, `signal_loop_success` | Loop progress and plan rendering | PSM builtin plugin (`extensions/psm-loop-renderer`) |
| `builtin-subagent` | `/^(Agent\|subagent)$/` | Subagent | PSM builtin plugin (`extensions/psm-subagent-renderer`) |
| `builtin-generic` | `() => true` | Generic fallback | Core |

### 6. Unregister Plugins

```typescript
// Unregister single plugin
toolRenderRegistry.unregister('my-custom-tool')

// Clear all plugins
toolRenderRegistry.clear()
```

## Architecture

### Directory Structure

```
src/plugins/tools/
├── types.ts              # Core type definitions
├── registry.ts           # Plugin registry
├── index.ts              # Unified exports
├── utils/
│   ├── resolveData.ts    # Default data resolver
│   ├── searchSegments.ts # Search segment generator
│   └── index.ts
├── builtins/             # Core built-in plugins (simple tools)
│   ├── index.ts          # Register: bash, read, write, edit, generic
│   ├── bash.tsx
│   ├── read.tsx
│   ├── write.tsx
│   ├── edit.tsx
│   └── generic.tsx       # Fallback
└── extensions/           # Legacy extension entrypoint
    └── index.ts          # No-op; extension renderers now load through PSM plugins
```

Extension renderers now live in default-enabled PSM builtin plugins:

```
extensions/psm-ask-user-question-renderer/
└── index.tsx                # ask_user_question renderer plugin

extensions/psm-loop-renderer/
└── index.tsx                # Loop tool renderer plugin

extensions/psm-subagent-renderer/
├── index.ts                 # PSM plugin manifest + activate(ctx)
├── SubagentModal.tsx        # Subagent details modal
└── SubagentToolRenderer.tsx # ctx.ui.registerToolRenderer payload
```

### Directory Layer Philosophy

| Directory | Purpose | Plugins |
|-----------|---------|---------|
| `builtins/` | Core simple tools | bash, read, write, edit, generic |
| `extensions/` | Legacy no-op entrypoint | none |
| `extensions/psm-ask-user-question-renderer/` | Default-enabled PSM builtin plugin | ask_user_question renderer |
| `extensions/psm-loop-renderer/` | Default-enabled PSM builtin plugin | loop tool call renderer |
| `extensions/psm-subagent-renderer/` | Default-enabled PSM builtin plugin | subagent (with Modal, multi-format support) |

### Why Separate Extensions?

- **Subagent** is complex (includes Modal, supports multiple formats like @tintinweb)
- It now loads as a default-enabled PSM builtin plugin instead of app startup direct registration
- Extensions may have heavier dependencies
- Allows independent versioning and maintenance
- Clear boundary between core and advanced features

## Advanced Usage

### Custom Data Resolution

```typescript
const customPlugin: ToolRenderPlugin = {
  id: 'custom',
  match: 'custom',
  component: CustomRender,
  resolveData: (toolCall, index, resultMap) => {
    // Custom data processing
    const base = defaultResolveData(toolCall, index, resultMap)
    return {
      ...base,
      customField: toolCall.arguments?.special
    }
  }
}
```

### Style Injection

```typescript
const styledPlugin: ToolRenderPlugin = {
  id: 'styled',
  match: 'styled',
  component: StyledRender,
  styles: `
    .my-tool {
      border-color: var(--custom-color);
    }
  `
}
```

## Migration from Old System

If you have existing tool components:

1. Move component to `builtins/` or `extensions/`
2. Wrap with `ToolRenderProps` interface
3. Export plugin definition
4. Register in respective `index.ts`

No breaking changes - the old `ToolCallList.tsx` components are preserved as reference.
