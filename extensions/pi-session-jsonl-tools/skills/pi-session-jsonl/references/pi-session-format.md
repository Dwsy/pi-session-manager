# Pi session JSONL and index reference

## Raw format

- The first non-empty line is a `session` header and is not part of the entry tree.
- Version 2+ entries use `id` and `parentId`; version 3 renamed the persisted hook-message role to `custom`.
- Entries form a tree. Without stronger session-manager state, the CLI infers the active leaf from the last persisted entry and records that inference.
- Assistant `toolCall.id` links to `toolResult.toolCallId`; tree parentage is independent.
- `custom` persists extension state but does not enter LLM context.
- `custom_message` does enter LLM context.
- `branch_summary` records an abandoned branch from `fromId`.
- Newer `compaction` entries can contain `retainedTail`; older ones use `firstKeptEntryId`.
- Persisted assistant stop reasons are `stop`, `length`, `toolUse`, `error`, or `aborted`.

## Generated files

- `overview.json`: source metadata, selection, tree integrity, statistics, terminal state, file activity, failures, and suspicious wrapper successes.
- `index.jsonl`: one searchable record per message, tool call, tool result, summary, custom message, or metadata entry.
- `timeline.jsonl`: compact entry-level chronology with linked tool-call/result details.
- `chunks/*.md`: bounded human-readable evidence chunks.
- `manifest.json`: schema version, source fingerprint, selected scope/leaf, counts, and generated file list.

Each search record includes source `line`, `entryId`, `parentId`, `kind`, optional role/tool fields, extracted paths, evidence markers, a bounded text payload, and a normalized search corpus. Search output returns these locators rather than raw session bodies.

## Context semantics

For an active path, walk from the selected leaf to the root. A compaction with `retainedTail` is a self-contained checkpoint; older compactions retain the range beginning at `firstKeptEntryId`. Archival indexing can still include every persisted entry with `--scope all`, but a final summary must distinguish active-path context from abandoned branches.

## Evidence cautions

- `isError=false` is not proof a command passed. Shell pipelines and wrappers can return success while output contains failure markers.
- A recap, compaction, or assistant claim is not mutation evidence.
- A path mentioned in a command is not proof the path changed.
- A later successful focused check supersedes an earlier failure only for the same scope.
- An index is stale when the source size or modification time differs from the manifest fingerprint; rebuild it before making current-state claims.
