# PSM Session Summary Plugin

Built-in PSM plugin example: generate AI session summaries and store them as generic PSM plugin records.

This is a PSM plugin sample with pi-flavored construction. It is not a Pi runtime plugin package by itself. The shape mirrors Pi extension ergonomics: manifest, default activation, command/tool registration, and capability client calls.

The sample uses the published PSM plugin SDK host context type:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'
```

## Record

The plugin writes:

```text
plugin_id   = builtin.session-summary
scope_type  = session
scope_id    = <session path>
record_type = session.intelligence
```

The payload is stored in SQLite `plugin_records.payload_json` and indexed through `plugin_records_fts` via `searchable_text`.

## Model Configuration

The backend command uses normal PSM model configuration (`models.json`). Do not hard-code API keys in this plugin. Pass provider/model by name at runtime or let PSM choose defaults.

## Command

The plugin registers:

```text
command       = session-summary.refresh
tool          = session_summary_refresh
toolbar item  = builtin.session-summary.toolbar
```

The sample command calls:

```ts
await psm.records.refreshSessionIntelligence({
  path: sessionPath,
  provider,
  model,
})
```

The toolbar UI is registered through `ctx.ui.registerSessionToolbarItem(...)` and rendered by the PSM runtime host.

## UI Stack

- UI implementation: TSX inside this plugin directory
- Styling: Tailwind utility classes owned by `styles.ts`
- Icons: `lucide-react`
- Settings schema: `settings.ts` exposed through `manifest.configuration`
- I18n resources: plain JSON in `i18n.ts`, merged by PSM and consumed through injected `ctx.i18n.t`
- Manifest boundary: `manifest.ts`; `index.ts` only activates/registers contributions
- Host contract: `ctx.ui.registerSessionToolbarItem(...)`
- Capability access: injected `ctx.psm`; the UI does not import app transport directly

Backend command:

```text
refresh_session_intelligence_record
```

HTTP endpoint for external testing:

```text
POST /v1/plugin-records/session-intelligence/refresh
{ "path": "/path/to/session.jsonl", "provider": "...", "model": "..." }
```
