# Session Widget Panel SDK gap and minimal public API

> Date: 2026-05-27
> Scope: `@pi-session-manager/plugin-sdk`, session panel render props, and the minimum public contract needed for a widget list panel to reveal in-session widget/tool blocks.

## Background

`extensions/psm-generative-ui-renderer` can already render `show_widget` and `browse_widgets` tool calls, and it can already open saved widget HTML in a new popup window through `ctx.psm.windows.open(...)`.

The missing piece is session-local navigation from a plugin-owned right panel:

- list every widget used in the current session
- click a row to jump to the corresponding message/tool block inside the current session viewer
- optionally force that widget/tool block open when the current conversation mode has it collapsed

Today the SDK gives session panels enough information to render plugin UI, but not enough control to drive the host session viewer.

## Current capability boundary

| Surface | Current capability | Enough for widget list panel? | Gap |
| --- | --- | --- | --- |
| `ctx.psm.sessions.readEntries(...)` | Read full session entries from plugin code | Yes | No gap |
| `ctx.psm.widgets` + `ctx.psm.windows` | Read saved widget HTML and open popup windows | Yes | No gap |
| `PsmSessionUiRenderProps` | Session metadata, active entry id, panel/main-view open-close, width | No | Cannot command host viewer navigation |
| `PsmSessionTreeViewRenderProps` | Includes `entries`, `labelsByTargetId`, `filter`, `onNavigate` | Partially | Tree-view only; not available to panels |
| `PsmToolRenderContext.ensureExpanded` | Declared in SDK, but host currently passes a no-op | No | No stable public expansion path |

## Concrete gap list

### 1. Session panel cannot jump to a message or tool block

`registerSessionPanel(...)` currently renders with `PsmSessionUiRenderProps`, which do not expose any reveal or navigate API. A panel can know the current `activeEntryId`, but it cannot change it or request scroll positioning.

Impact:

- a widget list panel can show items, but row click cannot locate the corresponding session content in the current viewer
- plugin authors would need to depend on host-internal React state or DOM structure, which is not acceptable for a public SDK

### 2. Session panel cannot request expansion of a specific widget/tool block

The session viewer owns tool expansion state internally through `SessionViewContext`. Plugins do not receive a stable public hook into that state.

Impact:

- even if a panel could scroll near the target message, it cannot reliably expand the target widget/tool card
- a plugin would have to know internal synthesized DOM ids like `tool-result-${toolCallId}`, which is a host implementation detail and not a stable SDK contract

### 3. Existing tree-view navigation is too specific to reuse directly

`PsmSessionTreeViewRenderProps.onNavigate(leafId, targetId)` is specialized for outline/tree navigation. It assumes the plugin owns a tree projection and already has `entries` injected.

Impact:

- wiring the same API onto panels would leak tree-specific semantics into a generic panel surface
- panels need a direct “reveal this session target” capability, not a tree leaf/target pair

### 4. Public expansion target should not be based on host-private synthetic entry ids

The current tool renderer path derives synthetic render ids from `toolCallId`. That mapping is valid inside the host, but it should remain private.

Impact:

- plugins parsing session entries can naturally identify widget usage by `toolCallId`
- requiring plugins to fabricate host render ids would couple external plugins to the current renderer implementation

## Minimum viable public API design

The smallest useful addition is to extend `PsmSessionUiRenderProps` with an optional viewer controller.

```ts
export interface PsmSessionRevealOptions {
  align?: 'auto' | 'center' | 'start' | 'end'
  highlight?: boolean
}

export interface PsmSessionToolRevealOptions extends PsmSessionRevealOptions {
  expand?: boolean
}

export interface PsmSessionViewerController {
  revealEntry(entryId: string, options?: PsmSessionRevealOptions): void
  revealToolCall(toolCallId: string, options?: PsmSessionToolRevealOptions): void
}

export interface PsmSessionUiRenderProps {
  session: PsmSessionReference
  activeEntryId?: string | null
  panelOpen?: boolean
  togglePanel?: () => void
  closePanel?: () => void
  mainViewOpen?: boolean
  toggleMainView?: () => void
  closeMainView?: () => void
  width?: number
  onWidthChange?: (width: number) => void
  viewer?: PsmSessionViewerController
}
```

## Why this is the minimum

### `revealEntry(...)`

This covers generic session navigation for panels, toolbar items, and main views without forcing them into tree-view semantics.

Use cases:

- jump to a message from a summary panel citation
- jump to a tool result from a review panel
- jump to a note anchor from a future session annotation plugin

### `revealToolCall(...)`

This covers the widget panel case without exposing host-private synthesized render ids. The natural stable identifier available in session content is `toolCallId`, so that is what the public API should accept.

Use cases:

- reveal the rendered `show_widget` block from a widget list panel
- reveal another tool block from a diagnostics or review panel
- optionally expand the tool block if it is collapsed in the current viewer mode

### `viewer?` stays optional

Making the controller optional preserves backward compatibility for:

- existing plugins compiled against older SDK versions
- host environments that temporarily lag behind the latest plugin SDK

Plugins can guard usage with:

```ts
props.viewer?.revealToolCall(toolCallId, { expand: true, align: 'center' })
```

## Host-side responsibility boundary

The public SDK should expose only the controller methods above. The host remains responsible for the implementation details:

- mapping `toolCallId` to the current rendered target
- updating `activeEntryId`
- scheduling scroll/highlight behavior
- ensuring conversation-preview turns open when needed
- ensuring the target tool block expands when `expand: true`

These behaviors must stay host-owned. Plugins should not manipulate DOM ids, React context, or internal conversation grouping state directly.

## Non-goals for this API slice

- No full session mutation API.
- No direct access to host React state or `SessionViewContext`.
- No generic “run arbitrary viewer command” escape hatch.
- No exposure of tree-view-only props like `entries` or `labelsByTargetId` to panels unless a separate use case justifies it.

## Compatibility with existing contribution surfaces

### `registerSessionPanel(...)`

No semantic conflict. Panels keep their current role and simply gain an optional viewer controller on the shared render props.

### `registerSessionToolbarItem(...)`

No semantic conflict. Toolbar items already use the same `PsmSessionUiRenderProps`, so they also gain the ability to trigger reveal actions without any extra registration surface.

### `registerSessionTreeView(...)`

No semantic conflict. Tree views should keep `onNavigate(leafId, targetId)` because that contract is already aligned with outline/tree interactions.

The new `viewer` controller does not replace tree navigation. It fills the missing generic panel/toolbar/main-view reveal path.

## Recommended implementation order for the next task

1. Add `PsmSessionViewerController` and optional `viewer` to `packages/runtime-sdk/src/types.ts`.
2. Inject the controller from `AppSessionViewerPane` when rendering session panels, toolbar items, and main views.
3. Back the controller with existing host state for scroll targeting and tool expansion.
4. Keep tree-view `onNavigate` unchanged.
5. Consume the new API from `extensions/psm-generative-ui-renderer` in the following task.

## Acceptance mapping

| Task 1 acceptance requirement | Covered by this document |
| --- | --- |
| 明确能力差距清单 | `Current capability boundary` + `Concrete gap list` |
| 给出最小可行 API 设计 | `Minimum viable public API design` |
| 明确放入 `PsmSessionUiRenderProps` 或等价接口 | `viewer?: PsmSessionViewerController` |
| 确认不依赖私有宿主实现细节 | `Host-side responsibility boundary` |
| 确认不与现有 panel/tree view 语义冲突 | `Compatibility with existing contribution surfaces` |
