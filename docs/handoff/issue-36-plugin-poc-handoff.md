# Issue 36 Plugin POC Handoff

Date: 2026-05-23

## Goal

Implement the first proof-of-concept for issue #36: lightweight PSM plugin API plus an AI session summary/metadata plugin. PSM plugins serve Pi Session Manager. They may borrow pi-style construction patterns, but they are not pi runtime plugins.

## Completed Commits

- `03170dd` `pi-agent: Rust plugin records`
  - Added generic `plugin_records` storage substrate.
  - Added `plugin_records_fts` and `plugin_record_index_values`.
  - Added Rust data layer, commands, dispatch, HTTP routes, and tests.

- `7a3eac2` `pi-agent: Capability surface`
  - Expanded TS `runtime-sdk` capability client.
  - Capabilities now include important first-stage PSM surfaces:
    - sessions: scan/list/readEntries/readFileChunk/getLabels/open
    - records: get/list/search/upsert/refreshSessionIntelligence
    - search: fulltext/pluginRecords
    - kanban: listTags/createTag/assignTag/removeTag/listSessionTags
  - Added `kanban:read` and `kanban:write` permission declarations.

- `27a75f0` `pi-agent: AI summary POC`
  - Added `refresh_session_intelligence_record` command.
  - Reads session entries, builds summary context, calls existing session summary domain, stores a `session.intelligence` plugin record.
  - Added HTTP route: `POST /v1/plugin-records/session-intelligence/refresh`.
  - Added pi-flavored PSM plugin sample under `extensions/psm-session-summary`.
  - Added OpenAI reasoning model fallback: `max_completion_tokens` first, fallback to `max_tokens` on 400/404/422.

## Verification Already Run

Passing:

- `npx vitest run src/plugins/runtime-sdk/__tests__/manifest.test.ts src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx`
  - Result: PASS 7 / FAIL 0
- `npx tsc --noEmit`
  - Result: No errors
- `cargo test --test plugin_records_test -- --nocapture`
  - Result: 5 passed
- `cargo test --lib --quiet`
  - Result: 99 passed
- `cargo clippy -- -D warnings`
  - Result: 0 errors, 1 existing workspace profile warning
- `rustfmt --check` on touched Rust files
  - Result: pass
- Secret scan over repo-relevant paths
  - Result: no provided local API key persisted in repo changes

Partial live verification:

- A verification subagent attempted real `generate_session_summary(context, Some("3838"), Some("gpt-5.5"))`.
- It reached model config parsing, then stopped before network/model request because local `~/.pi/agent/models.json` is malformed:
  - `Parse models.json: trailing comma at line 48 column 7`
- No API key was printed, saved, or committed.
- Verdict: code POC passes focused tests; live E2E is blocked by local models.json JSON syntax.

## Important Constraints

- Do not write or repeat the user's local API key.
- Do not modify `~/.pi/agent/models.json` without explicit user approval.
- Do not touch unrelated uncommitted UI changes.
- Preserve PSM plugin boundary: PSM plugin, pi-flavored authoring style only.

## Current Worktree Notes

At time of handoff, repo had unrelated uncommitted UI changes not made by this POC flow:

- `src/components/__tests__/SessionTree.test.tsx`
- `src/components/session-tree/SessionTree.tsx`
- `src/components/session-viewer/SessionFlowView.tsx`

Leave them alone unless user asks.

## Suggested Next Steps

1. If user wants full live E2E, ask permission to fix local `~/.pi/agent/models.json` trailing comma or provide a temporary valid model config path/hook.
2. Re-run live summary check after config is valid.
3. Consider a small follow-up issue for real permission enforcement; current SDK/manifest declares permissions, but backend enforcement is not complete.
4. Consider adding a UI trigger for `refresh_session_intelligence_record` if user wants the POC exposed beyond plugin sample/API.
