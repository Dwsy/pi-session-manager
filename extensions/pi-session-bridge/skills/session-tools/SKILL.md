---
name: psm-session-tools
description: High-performance session recall, statistics, search, and inspection powered by PSM CLI.
---

# PSM Session Tools

Use progressive disclosure. Load only the reference needed for your current intent; do not read every reference by default.

## Route First

- **Find past decisions, tasks, code snippets, or bug-fix history**:
  Run `pi-session-cli recall "<query>" --before 2 --after 2 --max 3`.
  If you know the specific `.jsonl` file, run `pi-session-cli recall <session.jsonl> --query "<query>"`.
  For deeper guidance, see `references/recall-guide.md`.

- **Project retrospective / Token & cost stats / "What was done recently"**:
  Stats for current project: `pi-session-cli stats --cwd .`.
  Stats for any disk file: `pi-session-cli stats <path/to/session.jsonl>`.
  Stats for entire session folder: `pi-session-cli stats --target ~/.pi/agent/sessions/`.
  For deeper guidance, see `references/stats-analysis.md`.

- **Session diagnostics / Tool failures / Branch tree & active path inspection**:
  Inspect single session: `pi-session-cli inspect <session.jsonl> --scope active`.
  For deeper guidance, see `references/session-inspection.md`.

- **Kanban workflow status / Move session to columns / Inspect board**:
  View Kanban board: `pi-session-cli kanban board` (or `pi-session-cli kanban board --project <name>`).
  Move session to column: `pi-session-cli kanban move <session_id> <column_name>`.
  Inspect session status: `pi-session-cli kanban status <session_id>`.
  Manage GitHub labels: `pi-session-cli kanban label <session_id> <label_name>`.
  For deeper guidance, see `references/kanban-workflow.md`.

- **Global full text search across sessions**:
  Run `pi-session-cli search "<query>"`.

## Ecosystem Co-existence & Non-Redundancy

- **Current Active Pi Session**: If you are triaging or modifying the *current conversation* inside a running Pi session, prefer the Bridge extension tools (`session_status`, `session_label`, `session_rename`) from `psm-session-metadata`.
- **Deep Disk-Chunked Forensic Auditing**: If you need to generate persistent chunk files (`chunks/*.md`) on disk for multi-turn timeline auditing of raw JSONLs, use `pi-session-jsonl`.
- **Fast Recall, Token/Cost Stats, Quick Inspection & Global Kanban Board**: Use `pi-session-cli` (`psm-session-tools`).

## Invariants

1. **Token Budget First**: NEVER dump large JSONL session files into context with `cat` or `read`. Always use `recall` or `inspect` so the native Rust engine handles windowing and truncation.
2. **Evidence Graph Over Raw Transcript**: Sessions are evidence graphs. Extract the minimal dialogue window needed to verify facts.
3. **Structured Consumption**: Append `--json` to any command when programmatic parsing is required.

## Minimal Commands Cheat Sheet

```bash
# 1. Recall small dialogue windows around matches
pi-session-cli recall "Tantivy index" --max 3 --json

# 2. Recall directly from a disk file
pi-session-cli recall ./history.jsonl --query "connection error"

# 3. Retrieve Token and model usage stats
pi-session-cli stats ./history.jsonl
pi-session-cli stats --cwd $(pwd)

# 4. Deep inspection of tool errors and branches
pi-session-cli inspect ./history.jsonl --json

# 5. Kanban board view and session workflow movement
pi-session-cli kanban board
pi-session-cli kanban move <session_id> "Todo"
pi-session-cli kanban status <session_id>
```
