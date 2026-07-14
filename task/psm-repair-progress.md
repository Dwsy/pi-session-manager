# PSM Repair Progress

> Source: `/Users/dengwenyu/Downloads/PSM_CODEX_REPAIR_PACKET_2026-07-14.md`
> Branch: `work/codex-repair-20260714`
> Status: IN_PROGRESS

## Current status

- Scope implemented: P0 auth/token/origin/Markdown/CI baseline plus selected P1 skill, docs, pnpm and keyboard semantics fixes.
- Verification: `pnpm exec tsc --noEmit`, `pnpm exec tsc -p tsconfig.extensions.json --noEmit`, targeted Vitest, Rust auth tests, Rust package checks, release version check.
- Known gaps: full Vitest currently reports 539 tests passed but 4 suites fail during module/setup evaluation; motion inventory and desktop/three-platform smoke remain incomplete.
- Next action: review the diff, resolve remaining full-suite failures, then create commits and PR record.

- Status: IN_PROGRESS
- Files changed: none
- Tests added: pending
- Commands: baseline environment recorded; full dependency verification pending
- Evidence: Current code still has loopback auth bypass, untrusted XFF, wildcard CORS, query token, fixed token, and public bind defaults.
- Remaining: shared policy implementation and regression tests.

## P0-SEC-04
- Status: IN_PROGRESS
- Files changed: none
- Tests added: pending
- Commands: not run
- Evidence: Markdown sink and Tauri config require hardening.
- Remaining: sanitizer, tests, CSP/capability smoke.

## P0-CI-01
- Status: IN_PROGRESS
- Files changed: none
- Tests added: pending
- Commands: `node scripts/release-version.mjs check` → exit 0
- Evidence: package scripts lack test/verify; extension coverage is incomplete.
- Remaining: scripts, tsconfig, CI, parser fix, old script cleanup.

## P1
- Status: NOT_STARTED
- Remaining: server deduplication, pnpm/lock cleanup, scan_skills, docs, motion, keyboard semantics.

## Blockers
- None confirmed yet. Rust, pnpm and Node are installed in this environment; network/dependency state still needs verification.

## Next action
- Implement the shared auth/token/origin policy after reading the complete server call chain.
