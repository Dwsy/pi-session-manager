---
name: psm-session-metadata
description: Manage Pi Session Manager workflow Status and GitHub-style Labels for the current Pi session. Use when the user asks to organize, classify, triage, label, tag, move, mark, or inspect the current session's Kanban status or labels.
---

# PSM Session Metadata

Use the Pi Session Manager tools registered by this extension. Status and Labels are separate metadata systems and must stay separate.

## Workflow Status

A session has at most one workflow Status.

- Inspect available statuses and the current assignment with `session_status` action `list`.
- Assign a status with `session_status` action `set` and `status` set to the requested name.
- Clear it with `session_status` action `clear`.
- If the requested status does not exist, `set` creates it.

## Labels

A session may have multiple GitHub-style Labels.

- Inspect available and assigned labels with `session_label` action `list`.
- Assign with `session_label` action `set` and `label` set to the requested name.
- Remove with `session_label` action `remove`.
- When creating a new label, optional `color` must be `#RRGGBB`; optional `description` explains its purpose.

## Rules

- Do not use workflow Status as a substitute for Labels or vice versa.
- Prefer existing names returned by the list actions before creating new metadata.
- For ambiguous requests such as "mark this done", inspect statuses first and choose the matching existing workflow Status.
- For descriptive classifications such as `bug`, `frontend`, or `urgent`, use Labels unless the user explicitly calls it a workflow status.
- Report the resulting Status/Labels after changing them.
