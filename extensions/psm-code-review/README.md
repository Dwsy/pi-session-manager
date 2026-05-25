# PSM Code Review

Built-in PSM browser plugin that owns the session code-review surface.

## Contributions

- Session toolbar item: `builtin.code-review.toolbar`
- Command: `code-review.inspect`
- UI: Tool Call Review modal, file tree, diff/detail panels

## Data Access

The plugin declares `sessions:read` and loads entries through
`ctx.psm.sessions.readEntries(session.path)`. The app conversation preview keeps
only the collapsed process summary; review extraction and rendering live here.

## Verification

```bash
pnpm exec vitest run extensions/psm-code-review/CodeReviewPlugin.test.tsx extensions/psm-code-review/ToolCallReviewModal.test.ts extensions/psm-code-review/tool-review/viewModel.test.ts
```
