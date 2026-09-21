# Restart Prompt

Continue `work/20260910-pi-live-bridge-correctness/` as a PDCA goal loop.

Read:

1. `work/20260910-pi-live-bridge-correctness/state.json`
2. `work/20260910-pi-live-bridge-correctness/implementation-log.md` (last section)
3. `work/20260910-pi-live-bridge-correctness/task.md`
4. `work/20260910-pi-live-bridge-correctness/pdca.md`
5. `work/20260910-pi-live-bridge-correctness/decisions.md`
6. `work/20260910-pi-live-bridge-correctness/history/events.jsonl`

Rules:

- Keep `state.json` current through `update-pdca-state.mjs`.
- Never overwrite `state.json` without archiving the previous version.
- Do not move past a decision point without recording selected option and rationale.
- Do not mark complete until acceptance evidence is verified.
- After implementation: sync `implementation-log.md`; `update-pdca-state.mjs` refreshes generated regions. Use `bun run render` only for older folders or interrupted updates.

## Current Progress

<!-- pdca:gen -->
**Phase:** P3 (act)
**Status:** completed
**Next:** Cycle closed; hand off verified diff and Workhub PR change record without pushing.
<!-- /pdca:gen -->
