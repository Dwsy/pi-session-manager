# PSM Sidechat Plugin

Built-in PSM plugin example for session Q&A.
The command and tool names keep the existing sidechat integration points, but
the AI work is performed by host-managed Pi Agent sessions through
`ctx.psm.agent`.

This plugin registers:

- command: `sidechat.ask`
- tool: `sidechat_ask`
- session toolbar button: `builtin.sidechat.toolbar`
- session right panel: `builtin.sidechat.panel`
- permissions: `sessions:read`, `model:invoke`, `agent:invoke`, `records:read`, `records:write`

## UI Stack

- UI implementation: TSX inside this plugin directory
- Styling: Tailwind utility classes owned by `styles.ts`
- Icons: `lucide-react`
- Settings schema: `settings.ts` exposed through `manifest.configuration`
- I18n resources: plain JSON in `i18n.ts`, merged by PSM and consumed through injected `ctx.i18n.t`
- Manifest boundary: `manifest.ts`; `index.ts` only activates/registers contributions
- Host contract: `ctx.ui.registerSessionToolbarItem(...)` + `ctx.ui.registerSessionPanel(...)`
- Capability access: injected `ctx.psm`; the UI does not import app transport directly
- Generation path: `ctx.psm.agent.createSession(...)` + `ctx.psm.agent.runStream(...)`

Do not use the legacy `ctx.psm.sidechat` helper for new sidechat plugin code.
Keep `sidechat.ask` / `sidechat_ask` as contribution IDs for compatibility, and
use `ctx.psm.agent` plus `agent:invoke` for generation.

The npm package shape is the same as other PSM plugins:

```json
{
  "name": "@example/psm-sidechat",
  "type": "module",
  "psm": {
    "extensions": ["./dist/index.js"]
  }
}
```

The published entry must be a browser-compatible ESM bundle and export `manifest`
plus `activate(ctx)` or a default activation function.
