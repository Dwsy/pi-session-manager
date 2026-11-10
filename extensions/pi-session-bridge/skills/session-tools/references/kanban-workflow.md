# Kanban Workflow & Labels Guide

## Status vs Labels
In Pi Session Manager, workflow Status and GitHub-style Labels are distinct:
- **Workflow Status**: Single column on the Kanban board (e.g., Todo, In Progress, Done, Important, Archive). A session has at most one status.
- **Labels**: Multi-value tags with colors (e.g., bug, frontend, urgent). A session can have multiple labels.

## Usage

### 1. View Board
```bash
# View board with top cards
pi-session-cli kanban board

# Filter by project
pi-session-cli kanban board --project my-app

# JSON output
pi-session-cli kanban board --json
```

### 2. Move Session Workflow Status
```bash
# Move session to "In Progress" (creates column if missing)
pi-session-cli kanban move <session-id> "In Progress"

# Check session status
pi-session-cli kanban status <session-id>

# Clear status (returns to untagged)
pi-session-cli kanban clear <session-id>
```

### 3. Manage Labels
```bash
# List all labels
pi-session-cli kanban labels

# Add label to session
pi-session-cli kanban label <session-id> "bug" --color "#cf222e"

# Remove label from session
pi-session-cli kanban unlabel <session-id> "bug"
```
