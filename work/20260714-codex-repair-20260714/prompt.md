# Restart Prompt

Continue `work/20260714-codex-repair-20260714/` as a PDCA goal loop.

Read:

1. `work/20260714-codex-repair-20260714/state.json`
2. `work/20260714-codex-repair-20260714/implementation-log.md` (last section)
3. `work/20260714-codex-repair-20260714/task.md`
4. `work/20260714-codex-repair-20260714/pdca.md`
5. `work/20260714-codex-repair-20260714/decisions.md`
6. `work/20260714-codex-repair-20260714/history/events.jsonl`

Rules:

- Keep `state.json` current through `update-pdca-state.mjs`.
- Never overwrite `state.json` without archiving the previous version.
- Do not move past a decision point without recording selected option and rationale.
- Do not mark complete until acceptance evidence is verified.
- After implementation: sync `implementation-log.md`; `update-pdca-state.mjs` refreshes generated regions. Use `bun run render` only for older folders or interrupted updates.

## Current Progress

<!-- pdca:gen -->
**Phase:** P2 (check)
**Status:** in_progress
**Next:** 按安全、CI、P1 分组提交；保留 verify blocker 与 smoke 缺口为交付前门禁
<!-- /pdca:gen -->
