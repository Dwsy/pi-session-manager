# PDCA Loop

<!-- pdca:gen -->
> **status:** in_progress  ·  **phase:** P2  ·  **pdca:** check
> **validation:** passed  ·  **open decisions:** D1, D2
> **next:** 按安全、CI、P1 分组提交；保留 verify blocker 与 smoke 缺口为交付前门禁
<!-- /pdca:gen -->

## Cycle 1

| Stage | Intent | Current Evidence |
| --- | --- | --- |
| Plan | Frame objective, constraints, acceptance, and decision criteria. | TBD |
| Do | Execute the smallest tracer path that can produce evidence. | TBD |
| Check | Compare evidence against acceptance and risks. | TBD |
| Act | Close, continue, or pivot based on decision D2. | TBD |

## Operating Rule

Do not move linearly by habit. At each decision phase, choose an option and record rationale in `state.json.decision_points` through the state update script.

## Markdown Sync (agents)

After each Do/Check slice: update `implementation-log.md`, this table's evidence column, and run `update-pdca-state.mjs`. It refreshes generated status strips automatically; use `bun run render` only to adopt an older folder or recover after an interrupted write. Generated regions are derived from `state.json` and must never be hand-edited.
