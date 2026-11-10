use anyhow::{anyhow, Result};
use colored::*;
use std::fs;
use std::path::PathBuf;

pub const SKILL_MARKDOWN: &str = r#"---
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
"#;

pub const RECALL_GUIDE: &str = r#"# Session Recall Guide

## Why use recall?
Raw session files (`.jsonl`) can contain hundreds of messages, large tool results, and chain-of-thought blocks. Reading raw files rapidly exhausts context windows.
`pi-session-cli recall` filters and extracts tightly bounded dialogue windows in native Rust, safely truncating oversized entries.

## Usage

### 1. Global Recall
```bash
pi-session-cli recall "refactor config module" --before 2 --after 2 --max 3
```

### 2. File-Direct Recall
```bash
pi-session-cli recall /path/to/session.jsonl --query "TypeError" --max 2
```

### 3. JSON Output
```bash
pi-session-cli recall "fix verification" --json
```
"#;

pub const STATS_ANALYSIS: &str = r#"# Session Stats & Cost Analysis

## Capabilities
`pi-session-cli stats` computes Token totals, costs, model distributions, and message counts in milliseconds without requiring a background server.

## Usage

### 1. Single File Stats
```bash
pi-session-cli stats /path/to/session.jsonl
```

### 2. Directory Stats
```bash
pi-session-cli stats /path/to/sessions/
```

### 3. JSON Output
```bash
pi-session-cli stats /path/to/session.jsonl --json
```
"#;

pub const SESSION_INSPECTION: &str = r#"# Session Inspection & Forensics

## Capabilities
`pi-session-cli inspect` diagnoses individual JSONL sessions:
- Extracts Session ID, working directory, creation timestamp
- Summarizes tool failures and specific error snippets
- Maps parent-child branch trees and active branch depth
- Calculates total Tokens and estimated costs

## Usage
```bash
# Inspect session
pi-session-cli inspect ./error-session.jsonl

# Machine-readable format
pi-session-cli inspect ./error-session.jsonl --json
```
"#;

pub const KANBAN_WORKFLOW: &str = r##"# Kanban Workflow & Labels Guide

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
"##;

#[derive(Debug, Clone, Default)]
pub struct ExportSkillOptions {
    pub output_dir: Option<String>,
    pub force: bool,
}

pub fn get_skill_markdown() -> &'static str {
    SKILL_MARKDOWN
}

pub fn print_skill_markdown() {
    print!("{}", get_skill_markdown());
}

pub fn export_skill_to_dir(opts: ExportSkillOptions) -> Result<PathBuf> {
    let out_dir_str = opts.output_dir.unwrap_or_else(|| ".pi/skills/psm-session-tools".to_string());
    let out_path = PathBuf::from(out_dir_str);

    if out_path.exists() && !opts.force {
        if let Ok(entries) = fs::read_dir(&out_path) {
            if entries.count() > 0 {
                return Err(anyhow!(
                    "Target directory already exists and is not empty: {}. Use --force to overwrite.",
                    out_path.display()
                ));
            }
        }
    }

    let refs_dir = out_path.join("references");
    fs::create_dir_all(&refs_dir)?;

    fs::write(out_path.join("SKILL.md"), SKILL_MARKDOWN)?;
    fs::write(refs_dir.join("recall-guide.md"), RECALL_GUIDE)?;
    fs::write(refs_dir.join("stats-analysis.md"), STATS_ANALYSIS)?;
    fs::write(refs_dir.join("session-inspection.md"), SESSION_INSPECTION)?;
    fs::write(refs_dir.join("kanban-workflow.md"), KANBAN_WORKFLOW)?;

    Ok(out_path)
}

pub fn default_agents_skill_dir() -> Result<PathBuf> {
    let home = pi_session_manager::paths::home_dir().map_err(|e| anyhow!("{e}"))?;
    Ok(home.join(".agents").join("skills").join("psm-session-tools"))
}

pub fn install_skill_to_agents(dest: Option<String>, force: bool) -> Result<PathBuf> {
    let target = match dest {
        Some(d) => PathBuf::from(d),
        None => default_agents_skill_dir()?,
    };
    export_skill_to_dir(ExportSkillOptions {
        output_dir: Some(target.to_string_lossy().to_string()),
        force,
    })
}

pub async fn execute_install_skill(dest: Option<String>, force: bool) -> Result<()> {
    let target_dir = install_skill_to_agents(dest, force)?;
    let lang = crate::i18n::current_language();
    println!(
        "{} {}",
        "✓".green().bold(),
        crate::i18n::get_text("skill_installed", lang)
            .replace("{path}", &target_dir.display().to_string())
            .green()
            .bold()
    );
    println!("  Installed files:");
    println!("    • {}/SKILL.md", target_dir.display());
    println!("    • {}/references/recall-guide.md", target_dir.display());
    println!("    • {}/references/stats-analysis.md", target_dir.display());
    println!("    • {}/references/session-inspection.md", target_dir.display());
    println!("    • {}/references/kanban-workflow.md", target_dir.display());
    println!(
        "\n{}",
        "The skill is now available to all agents discovering ~/.agents/skills/.".dimmed()
    );
    Ok(())
}

pub async fn execute_export_skill(opts: ExportSkillOptions) -> Result<()> {
    let target_dir = export_skill_to_dir(opts)?;
    println!(
        "{} {}",
        "✓ PSM Skill exported successfully to:".green().bold(),
        target_dir.display().to_string().cyan().bold()
    );
    println!("  Generated:");
    println!("    • {}/SKILL.md", target_dir.display());
    println!("    • {}/references/recall-guide.md", target_dir.display());
    println!("    • {}/references/stats-analysis.md", target_dir.display());
    println!("    • {}/references/session-inspection.md", target_dir.display());
    println!("\n{}", "To use in your agent harness, reference or mount this directory as a skill.".dimmed());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_get_skill_markdown() {
        let md = get_skill_markdown();
        assert!(md.contains("name: psm-session-tools"));
        assert!(md.contains("pi-session-cli recall"));
        assert!(md.contains("Route First"));
    }

    #[test]
    fn test_export_skill_generation() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("psm-tools");

        let opts = ExportSkillOptions {
            output_dir: Some(target.to_str().unwrap().to_string()),
            force: true,
        };

        let result = export_skill_to_dir(opts).unwrap();
        assert!(result.join("SKILL.md").exists());
        assert!(result.join("references/recall-guide.md").exists());
        assert!(result.join("references/stats-analysis.md").exists());
        assert!(result.join("references/session-inspection.md").exists());
        assert!(result.join("references/kanban-workflow.md").exists());

        let skill_content = fs::read_to_string(result.join("SKILL.md")).unwrap();
        assert!(skill_content.contains("name: psm-session-tools"));
    }

    #[test]
    fn test_install_skill_custom_dest() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("installed-skill");

        let result = install_skill_to_agents(Some(target.to_str().unwrap().to_string()), true).unwrap();
        assert!(result.join("SKILL.md").exists());
        assert!(result.join("references/recall-guide.md").exists());
        assert!(result.join("references/stats-analysis.md").exists());
        assert!(result.join("references/session-inspection.md").exists());
        assert!(result.join("references/kanban-workflow.md").exists());
    }
}
