# PSM Session Summary Plugin (POC)

First proof-of-concept plugin for issue #36: generate AI session summaries and store them as generic PSM plugin records.

This is a PSM plugin sample with pi-flavored construction. It is not a Pi runtime plugin package by itself. The shape mirrors Pi extension ergonomics: manifest, default activation, command/tool registration, and capability client calls.

The sample uses the PSM runtime SDK host context type:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '../../src/plugins/runtime-sdk'
```

For a future npm package, that import should come from the published SDK package instead:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@psm/runtime-sdk'
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

The sample command calls:

```ts
await psm.records.refreshSessionIntelligence({
  path: sessionPath,
  provider,
  model,
})
```

When the sample is wired through `createPluginCapabilityClient(...)`, use a matching permission context:

```ts
createPluginCapabilityClient({
  transport: appPsmTransport,
  permissions: {
    pluginId: 'builtin.session-summary',
    permissions: ['records:read', 'records:write', 'model:invoke'],
  },
})
```

Backend command:

```text
refresh_session_intelligence_record
```

HTTP endpoint for external testing:

```text
POST /v1/plugin-records/session-intelligence/refresh
{ "path": "/path/to/session.jsonl", "provider": "...", "model": "..." }
```
