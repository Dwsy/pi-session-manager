# Restart Prompt

Continue `work/20260714-windows-linux-ux/` as a PDCA goal loop.

Read:

1. `work/20260714-windows-linux-ux/state.json`
2. `work/20260714-windows-linux-ux/implementation-log.md` (last section)
3. `work/20260714-windows-linux-ux/task.md`
4. `work/20260714-windows-linux-ux/pdca.md`
5. `work/20260714-windows-linux-ux/decisions.md`
6. `work/20260714-windows-linux-ux/history/events.jsonl`

Rules:

- Keep `state.json` current through `update-pdca-state.mjs`.
- Never overwrite `state.json` without archiving the previous version.
- Do not move past a decision point without recording selected option and rationale.
- Do not mark complete until acceptance evidence is verified.
- After implementation: sync `implementation-log.md`; `update-pdca-state.mjs` refreshes generated regions. Use `bun run render` only for older folders or interrupted updates.

## Current Progress

<!-- pdca:gen -->
**Phase:** P3 (act)
**Status:** in_progress
**Next:** 等待 PR #42 新一轮 CI；lint/check 均通过后再向用户报告可合并状态
<!-- /pdca:gen -->
