use anyhow::{anyhow, Result};
use colored::*;
use pi_session_manager::{assign_tag, create_tag, delete_tag, get_all_session_tags, get_all_tags, move_session_tag, remove_tag_from_session, SessionTagItem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanCard {
    pub session_id: String,
    pub session_name: String,
    pub cwd: String,
    pub position: i64,
    pub message_count: usize,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanColumnView {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub cards: Vec<KanbanCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanBoard {
    pub total_columns: usize,
    pub total_cards: usize,
    pub columns: Vec<KanbanColumnView>,
}

/// Helper to load session basic info from SQLite cache
fn load_session_lookup() -> HashMap<String, (String, String, usize)> {
    let mut lookup = HashMap::new();
    let config = match pi_session_manager::config::load_config() {
        Ok(c) => c,
        Err(_) => return lookup,
    };

    let conn = match pi_session_manager::data::sqlite::init_db_with_config(&config) {
        Ok(c) => c,
        Err(_) => return lookup,
    };

    if let Ok(sessions) = pi_session_manager::data::sqlite::get_all_sessions_for_list(&conn) {
        for s in sessions {
            let name = s.name.unwrap_or_else(|| {
                if !s.first_message.is_empty() {
                    let preview: String = s.first_message.chars().take(40).collect();
                    preview.replace('\n', " ")
                } else {
                    s.id.chars().take(8).collect()
                }
            });
            lookup.insert(s.id, (name, s.cwd, s.message_count));
        }
    }

    lookup
}

pub async fn build_kanban_board(project_filter: Option<&str>, limit_per_col: usize) -> Result<KanbanBoard> {
    let tags = get_all_tags().await.map_err(|e| anyhow!("{e}"))?;
    let session_tags = get_all_session_tags().await.map_err(|e| anyhow!("{e}"))?;
    let session_info = load_session_lookup();

    let mut col_map: HashMap<String, Vec<KanbanCard>> = HashMap::new();
    for t in &tags {
        col_map.insert(t.id.clone(), Vec::new());
    }

    let mut total_cards = 0;
    for st in session_tags {
        let (name, cwd, count) = session_info.get(&st.session_id).cloned().unwrap_or_else(|| (st.session_id.chars().take(8).collect(), String::new(), 0));

        if let Some(proj) = project_filter {
            if !cwd.to_lowercase().contains(&proj.to_lowercase()) {
                continue;
            }
        }

        if let Some(cards) = col_map.get_mut(&st.tag_id) {
            cards.push(KanbanCard { session_id: st.session_id, session_name: name, cwd, position: st.position, message_count: count, assigned_at: st.assigned_at });
            total_cards += 1;
        }
    }

    let mut columns = Vec::new();
    for t in tags {
        let mut cards = col_map.remove(&t.id).unwrap_or_default();
        cards.sort_by_key(|c| c.position);
        if limit_per_col > 0 && cards.len() > limit_per_col {
            cards.truncate(limit_per_col);
        }
        columns.push(KanbanColumnView { id: t.id, name: t.name, color: t.color, sort_order: t.sort_order, cards });
    }

    columns.sort_by_key(|c| c.sort_order);

    Ok(KanbanBoard { total_columns: columns.len(), total_cards, columns })
}

pub async fn execute_show_board(project: Option<String>, limit: usize, json: bool) -> Result<()> {
    let board = build_kanban_board(project.as_deref(), limit).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&board)?);
        return Ok(());
    }

    println!("{}", "📋 Kanban Board".green().bold());
    println!("{}", "═════════════════════════════════════════════════════".blue());
    if let Some(p) = &project {
        println!("  Project Filter:     {}", p.cyan());
    }
    println!("  Total Columns:      {} | Total Active Cards: {}", board.total_columns.to_string().yellow().bold(), board.total_cards.to_string().yellow().bold());
    println!("{}", "═════════════════════════════════════════════════════".blue());

    if board.columns.is_empty() {
        println!("{}", "No Kanban columns defined. Use `pi-session-cli kanban add-column <name>` to create one.".dimmed());
        return Ok(());
    }

    for col in &board.columns {
        let header = format!("─── [{}] ({} cards) ───", col.name, col.cards.len());
        println!("\n{}", header.cyan().bold());
        println!("  ID: {}", col.id.dimmed());

        if col.cards.is_empty() {
            println!("  {}", "(empty)".dimmed());
        } else {
            for (idx, card) in col.cards.iter().enumerate() {
                let id_short: String = card.session_id.chars().take(8).collect();
                let proj_name = card.cwd.rsplit(['/', '\\']).next().unwrap_or(&card.cwd);
                let msgs = if card.message_count > 0 { format!("{} msgs", card.message_count).dimmed().to_string() } else { String::new() };

                println!("  {}. [{}] {} {} {}", idx + 1, id_short.yellow(), card.session_name.bold(), if proj_name.is_empty() { String::new() } else { format!("({})", proj_name).blue().to_string() }, msgs);
            }
        }
    }

    println!("\n{}", "═════════════════════════════════════════════════════".blue());
    Ok(())
}

pub async fn execute_list_columns() -> Result<()> {
    let tags = get_all_tags().await.map_err(|e| anyhow!("{e}"))?;
    let session_tags = get_all_session_tags().await.map_err(|e| anyhow!("{e}"))?;

    let mut counts: HashMap<String, usize> = HashMap::new();
    for st in session_tags {
        *counts.entry(st.tag_id).or_insert(0) += 1;
    }

    println!("{}", "📋 Kanban Columns (Workflow Statuses)".green().bold());
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    for t in tags {
        let count = counts.get(&t.id).copied().unwrap_or(0);
        println!("  • {:<20} {:<12} (cards: {:>3}) [ID: {}]", t.name.cyan().bold(), t.color.dimmed(), count.to_string().yellow(), t.id.dimmed());
    }
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    Ok(())
}

pub async fn execute_add_column(name: String, color: Option<String>) -> Result<()> {
    let col = color.unwrap_or_else(|| "#0969da".to_string());
    let tag = create_tag(name.clone(), col, None, None).await.map_err(|e| anyhow!("{e}"))?;
    let lang = crate::i18n::current_language();
    println!("{} {}", "✓".green().bold(), crate::i18n::get_text("kanban_column_created", lang).replace("{name}", &tag.name).replace("{id}", &tag.id).green());
    Ok(())
}

pub async fn execute_remove_column(id: String) -> Result<()> {
    delete_tag(id.clone()).await.map_err(|e| anyhow!("{e}"))?;
    let lang = crate::i18n::current_language();
    println!("{} {}", "✓".green().bold(), crate::i18n::get_text("kanban_column_deleted", lang).replace("{id}", &id).green());
    Ok(())
}

pub async fn execute_move_session(session_id: String, status_target: String, position: Option<i64>) -> Result<()> {
    let tags = get_all_tags().await.map_err(|e| anyhow!("{e}"))?;
    let s_lower = status_target.trim().to_lowercase();

    // Find column by exact id or fuzzy name match
    let matched_tag = tags.iter().find(|t| t.id == status_target).or_else(|| tags.iter().find(|t| t.name.to_lowercase() == s_lower)).or_else(|| tags.iter().find(|t| t.name.to_lowercase().contains(&s_lower)));

    let target_tag_id = match matched_tag {
        Some(t) => t.id.clone(),
        None => {
            // Auto create new column if not found
            let created = create_tag(status_target.clone(), "#0969da".to_string(), None, None).await.map_err(|e| anyhow!("{e}"))?;
            created.id
        }
    };

    // Check existing assignment
    let session_tags = get_all_session_tags().await.map_err(|e| anyhow!("{e}"))?;
    let current_assignment = session_tags.iter().find(|st| st.session_id == session_id);

    let pos = position.unwrap_or(0);
    if let Some(curr) = current_assignment {
        move_session_tag(session_id.clone(), Some(curr.tag_id.clone()), target_tag_id.clone(), pos).await.map_err(|e| anyhow!("{e}"))?;
    } else {
        assign_tag(session_id.clone(), target_tag_id.clone()).await.map_err(|e| anyhow!("{e}"))?;
    }

    let lang = crate::i18n::current_language();
    println!("{} {}", "✓".green().bold(), crate::i18n::get_text("kanban_session_moved", lang).replace("{session}", &session_id).replace("{column}", &status_target).green());
    Ok(())
}

pub async fn execute_clear_session(session_id: String) -> Result<()> {
    let session_tags = get_all_session_tags().await.map_err(|e| anyhow!("{e}"))?;
    let assignments: Vec<SessionTagItem> = session_tags.into_iter().filter(|st| st.session_id == session_id).collect();

    for st in assignments {
        let _ = remove_tag_from_session(session_id.clone(), st.tag_id).await;
    }

    let lang = crate::i18n::current_language();
    println!("{} {}", "✓".green().bold(), crate::i18n::get_text("kanban_session_cleared", lang).replace("{session}", &session_id).green());
    Ok(())
}

pub async fn execute_inspect_session_status(session_id: String) -> Result<()> {
    let tags = get_all_tags().await.map_err(|e| anyhow!("{e}"))?;
    let session_tags = get_all_session_tags().await.map_err(|e| anyhow!("{e}"))?;

    let assignment = session_tags.iter().find(|st| st.session_id == session_id);

    println!("{}", format!("📋 Kanban Status: {}", session_id).green().bold());
    println!("{}", "─────────────────────────────────────────────────────".dimmed());

    if let Some(curr) = assignment {
        let col_name = tags.iter().find(|t| t.id == curr.tag_id).map(|t| t.name.as_str()).unwrap_or("unknown");
        println!("  Current Column:     {} (ID: {})", col_name.cyan().bold(), curr.tag_id.dimmed());
        println!("  Column Position:    {}", curr.position);
        println!("  Assigned At:        {}", curr.assigned_at.dimmed());
    } else {
        println!("  Current Column:     {}", "(Untagged / None)".yellow());
    }

    // GitHub Labels inspection
    let labels_file = load_labels_file();
    let assigned_labels: Vec<&RawLabelItem> = labels_file.assignments.iter().filter(|a| a.session_id == session_id).filter_map(|a| labels_file.labels.iter().find(|l| l.id == a.label_id)).collect();

    if !assigned_labels.is_empty() {
        let label_strs: Vec<String> = assigned_labels.iter().map(|l| format!("{}({})", l.name, l.color)).collect();
        println!("  GitHub Labels:      {}", label_strs.join(", ").blue());
    } else {
        println!("  GitHub Labels:      {}", "(none)".dimmed());
    }

    println!("\n  Available Columns:");
    for t in tags {
        let is_current = assignment.map(|a| a.tag_id == t.id).unwrap_or(false);
        let bullet = if is_current { "(●)".green() } else { "( )".dimmed() };
        println!("    {} {} [{}]", bullet, t.name, t.id.dimmed());
    }
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawLabelItem {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawSessionLabelAssignment {
    #[serde(rename = "sessionId", alias = "session_id")]
    pub session_id: String,
    #[serde(rename = "labelId", alias = "label_id")]
    pub label_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LabelsFile {
    pub version: u32,
    #[serde(default)]
    pub labels: Vec<RawLabelItem>,
    #[serde(default)]
    pub assignments: Vec<RawSessionLabelAssignment>,
}

fn labels_file_path() -> Result<std::path::PathBuf> {
    let home = pi_session_manager::paths::home_dir().map_err(|e| anyhow!("{e}"))?;
    Ok(home.join(".pi").join("pi-session-manager").join("plugin-config").join("builtin.kanban-board").join("labels.json"))
}

fn load_labels_file() -> LabelsFile {
    if let Ok(p) = labels_file_path() {
        if p.exists() {
            if let Ok(content) = std::fs::read_to_string(&p) {
                if let Ok(f) = serde_json::from_str::<LabelsFile>(&content) {
                    return f;
                }
            }
        }
    }
    LabelsFile { version: 1, labels: vec![], assignments: vec![] }
}

fn save_labels_file(file: &LabelsFile) -> Result<()> {
    let p = labels_file_path()?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(file)?;
    std::fs::write(p, content)?;
    Ok(())
}

pub async fn execute_list_labels() -> Result<()> {
    let file = load_labels_file();
    println!("{}", "🏷️  GitHub-style Labels".green().bold());
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    if file.labels.is_empty() {
        println!("  {}", "(no labels created yet)".dimmed());
    } else {
        for l in &file.labels {
            let count = file.assignments.iter().filter(|a| a.label_id == l.id).count();
            println!("  • {:<16} {:<10} (sessions: {:>2}) [ID: {}]", l.name.cyan().bold(), l.color.dimmed(), count, l.id.dimmed());
        }
    }
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    Ok(())
}

pub async fn execute_assign_label(session_id: String, label_name: String, color: Option<String>) -> Result<()> {
    let mut file = load_labels_file();
    let l_lower = label_name.trim().to_lowercase();

    let target_label_id = match file.labels.iter().find(|l| l.name.to_lowercase() == l_lower) {
        Some(l) => l.id.clone(),
        None => {
            let id = format!("label-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
            let new_label = RawLabelItem { id: id.clone(), name: label_name.clone(), color: color.unwrap_or_else(|| "#0969da".to_string()), description: None };
            file.labels.push(new_label);
            id
        }
    };

    if !file.assignments.iter().any(|a| a.session_id == session_id && a.label_id == target_label_id) {
        file.assignments.push(RawSessionLabelAssignment { session_id: session_id.clone(), label_id: target_label_id });
        save_labels_file(&file)?;
    }

    println!("{} {}", "✓".green().bold(), format!("Assigned label '{label_name}' to session {session_id}").green());
    Ok(())
}

pub async fn execute_remove_label(session_id: String, label_name: String) -> Result<()> {
    let mut file = load_labels_file();
    let l_lower = label_name.trim().to_lowercase();

    let target_label = file.labels.iter().find(|l| l.name.to_lowercase() == l_lower);
    if let Some(target) = target_label {
        let tid = target.id.clone();
        let prev_len = file.assignments.len();
        file.assignments.retain(|a| !(a.session_id == session_id && a.label_id == tid));
        if file.assignments.len() < prev_len {
            save_labels_file(&file)?;
        }
    }

    println!("{} {}", "✓".green().bold(), format!("Removed label '{label_name}' from session {session_id}").green());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kanban_card_structure() {
        let card = KanbanCard { session_id: "s123".to_string(), session_name: "Test session".to_string(), cwd: "/tmp/test".to_string(), position: 0, message_count: 5, assigned_at: "2026-04-01T00:00:00Z".to_string() };
        assert_eq!(card.session_id, "s123");
        assert_eq!(card.position, 0);
    }
}
