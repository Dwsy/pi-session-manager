---
name: pi-session-jsonl
description: Indexes, searches, inspects, and audits raw Pi coding-agent session JSONL files, including branches, compactions, tool-call/result links, failures, file activity, and unanswered turns. Use when summarizing, recovering, debugging, handing off, or locating exact evidence in `~/.pi/agent/sessions/**/*.jsonl` or another Pi session trace.
compatibility: Requires Node.js 22.18 or newer with built-in TypeScript type stripping.
---

# Pi Session JSONL

Treat a session as an evidence tree, not a flat transcript. Use the bundled TypeScript CLI to create a compact index, query narrow evidence, and open exact records only when needed.

## Resolve the script

Use the absolute path to this skill directory from the `read` call that loaded `SKILL.md`:

```bash
node --experimental-strip-types <skill-dir>/scripts/pi-session-index.ts --help
```

Never copy the whole raw JSONL into model context.

## Workflow

1. For a quick active-branch check, run `overview`.
2. For a large, branching, or unfinished session, run `index` with `--scope all`.
3. Use `search` to locate user requests, tool calls, failures, paths, validation markers, compactions, and summaries.
4. Use `show` with an entry ID, JSONL line, or tool-call ID to inspect exact evidence.
5. Read generated Markdown chunks only for the semantic phases needed by the answer.

```bash
SCRIPT=<skill-dir>/scripts/pi-session-index.ts
SESSION=/absolute/path/session.jsonl
INDEX=/tmp/pi-session-index

node --experimental-strip-types "$SCRIPT" overview "$SESSION"
node --experimental-strip-types "$SCRIPT" index "$SESSION" --out-dir "$INDEX" --scope all
node --experimental-strip-types "$SCRIPT" search "$INDEX" --query 'FAIL|BUILD FAILED|errorCode' --regex --limit 30
node --experimental-strip-types "$SCRIPT" search "$INDEX" --tool bash --failed-only --limit 30
node --experimental-strip-types "$SCRIPT" search "$INDEX" --path 'src/auth.ts' --limit 30
node --experimental-strip-types "$SCRIPT" show "$INDEX" --tool-call call_123 --raw
```

`index` writes `overview.json`, `index.jsonl`, `timeline.jsonl`, `manifest.json`, and `chunks/*.md`. The CLI reports when an index is stale relative to its source JSONL.

## Query guidance

- Prefer literal `--query`; add `--regex` only for a real pattern.
- Narrow with `--kind`, `--role`, `--tool`, `--path`, or `--failed-only` before increasing `--limit`.
- Use `--scope active` for the inferred/current path and `--scope all` when abandoned branches matter.
- Use `--leaf <entry-id>` when the intended branch is known. Otherwise, active-leaf selection is explicitly marked as inferred.
- `show --raw` is the source-of-truth check after search results point to decisive lines.

## Evidence rules

- Link `assistant.toolCall.id` to `toolResult.toolCallId`; parentage is not the tool link.
- `toolResult.isError=false` only means the wrapper did not throw. Inspect embedded exit codes, `FAIL`, compile errors, and validation markers.
- Treat compaction and branch summaries as navigation aids until corroborated by mutation and validation evidence.
- Separate deterministic `write`/`edit` evidence from bash mutation candidates.
- Distinguish verified complete, implemented but unverified, attempted, claimed, and unresolved work.
- State when the final user turn has no complete assistant answer or when production/device verification was not performed.

See [references/pi-session-format.md](references/pi-session-format.md) for format and index semantics.
