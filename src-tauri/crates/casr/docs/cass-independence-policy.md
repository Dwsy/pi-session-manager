# CASS Independence Policy

casr **must not** depend on `coding_agent_session_search` (CASS) at runtime. This is a hard architectural constraint, not a suggestion.

## Rules

1. **No Cargo dependency.** `Cargo.toml` must never contain a `path`, `git`, or `crates.io` reference to `coding_agent_session_search`. CI enforces this with a grep guardrail.

2. **Vendored code is self-contained.** Any logic adapted from CASS must compile and run solely within the casr crate. No `extern crate`, no `use coding_agent_session_search::*`.

3. **New provider adaptations follow the same policy.** If CASS adds a new connector that we want to port, we vendor-adapt the relevant parsing/writing logic into `src/providers/`.

4. **Attribution is required.** Adapted code must cite the CASS source file and commit hash in a comment or in `docs/cass-porting-notes.md`.

## Rationale

- **Different concerns.** CASS indexes sessions for search; casr converts them for resumption. The dependency trees diverge (CASS pulls SQLite, tantivy, etc.).
- **Binary size.** casr ships as a lean static binary (<5 MB target). A CASS dependency would balloon this.
- **Release independence.** Breaking changes in CASS model types should not force casr releases.

## Enforcement

- **CI guardrail:** `.github/workflows/ci.yml` fails if `Cargo.toml` or `Cargo.lock` references `coding_agent_session_search`.
- **Code review:** PRs adding external crate dependencies are reviewed for CASS leakage.

## See Also

- [CASS Porting Notes](./cass-porting-notes.md) — maps CASS source files to their casr adaptations.
