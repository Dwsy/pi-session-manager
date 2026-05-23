# PSM Session Summary Plugin (POC)

First proof-of-concept plugin for issue #36: generate AI session summaries and store them as generic PSM plugin records.

This is a PSM plugin sample with pi-flavored construction. It is not a Pi runtime plugin package by itself. The shape mirrors Pi extension ergonomics: default factory, manifest, command/tool registration, and capability client calls.

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

Backend command:

```text
refresh_session_intelligence_record
```

HTTP endpoint for external testing:

```text
POST /v1/plugin-records/session-intelligence/refresh
{ "path": "/path/to/session.jsonl", "provider": "...", "model": "..." }
```
