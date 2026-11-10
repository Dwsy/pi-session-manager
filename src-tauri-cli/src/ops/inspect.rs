use anyhow::{anyhow, Result};
use colored::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectReport {
    pub session_id: String,
    pub session_path: String,
    pub cwd: Option<String>,
    pub created_at: Option<String>,
    pub total_lines: usize,
    pub total_entries: usize,
    pub substantive_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub custom_messages: usize,
    pub compaction_count: usize,
    pub forks_count: usize,
    pub leaves_count: usize,
    pub active_branch_length: usize,
    pub tools_called: HashMap<String, usize>,
    pub tool_failures: Vec<ToolFailure>,
    pub total_tokens: u64,
    pub estimated_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFailure {
    pub tool_name: String,
    pub tool_call_id: Option<String>,
    pub error_snippet: String,
}

#[derive(Debug, Clone)]
pub struct InspectOptions {
    pub file_path: String,
    pub scope: String,
    pub json: bool,
}

impl Default for InspectOptions {
    fn default() -> Self {
        Self {
            file_path: String::new(),
            scope: "active".to_string(),
            json: false,
        }
    }
}

pub fn inspect_session_file(path_str: &str, _scope: &str) -> Result<InspectReport> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(anyhow!("Session file does not exist: {}", path_str));
    }
    if !path.is_file() {
        return Err(anyhow!("Path is not a regular file: {}", path_str));
    }

    let file = File::open(path)?;
    let reader = BufReader::new(file);

    let mut session_id = String::new();
    let mut cwd = None;
    let mut created_at = None;
    let mut total_lines = 0;
    let mut total_entries = 0;
    let mut user_messages = 0;
    let mut assistant_messages = 0;
    let mut custom_messages = 0;
    let mut compaction_count = 0;

    let mut entry_ids: HashSet<String> = HashSet::new();
    let mut parent_to_children: HashMap<String, Vec<String>> = HashMap::new();
    let mut child_to_parent: HashMap<String, Option<String>> = HashMap::new();
    let mut last_entry_id = None;

    let mut tools_called: HashMap<String, usize> = HashMap::new();
    let mut tool_failures: Vec<ToolFailure> = Vec::new();

    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;
    let mut estimated_cost = 0.0f64;

    for line_res in reader.lines() {
        let line = line_res?;
        total_lines += 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(val) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        total_entries += 1;

        let entry_type = val.get("type").and_then(Value::as_str).unwrap_or("");

        if entry_type == "session" {
            if session_id.is_empty() {
                session_id = val.get("id").and_then(Value::as_str).unwrap_or("").to_string();
                cwd = val.get("cwd").and_then(Value::as_str).map(String::from);
                created_at = val.get("created").and_then(Value::as_str).map(String::from);
            }
            continue;
        }

        if let Some(id) = val.get("id").and_then(Value::as_str) {
            entry_ids.insert(id.to_string());
            last_entry_id = Some(id.to_string());
            let parent_id = val.get("parentId").and_then(Value::as_str).map(String::from);
            child_to_parent.insert(id.to_string(), parent_id.clone());

            if let Some(p) = parent_id {
                parent_to_children.entry(p).or_default().push(id.to_string());
            }
        }

        match entry_type {
            "compaction" => compaction_count += 1,
            "custom" | "custom_message" => custom_messages += 1,
            "message" => {
                if let Some(msg) = val.get("message") {
                    let role = msg.get("role").and_then(Value::as_str).unwrap_or("");
                    if role == "user" {
                        user_messages += 1;
                    } else if role == "assistant" {
                        assistant_messages += 1;
                    }

                    // Inspect tool call content
                    if let Some(content) = msg.get("content").and_then(Value::as_array) {
                        for c in content {
                            let c_type = c.get("type").and_then(Value::as_str).unwrap_or("");
                            if c_type == "toolCall" || c_type == "tool_use" {
                                let name = c.get("name").or_else(|| c.get("toolName")).and_then(Value::as_str).unwrap_or("unknown");
                                *tools_called.entry(name.to_string()).or_insert(0) += 1;
                            } else if c_type == "toolResult" || c_type == "tool_result" {
                                let is_error = c.get("isError").and_then(Value::as_bool).unwrap_or(false);
                                if is_error {
                                    let name = c.get("name").or_else(|| c.get("toolName")).and_then(Value::as_str).unwrap_or("unknown");
                                    let tool_call_id = c.get("toolCallId").and_then(Value::as_str).map(String::from);
                                    let text = c.get("text").or_else(|| c.get("content")).and_then(Value::as_str).unwrap_or("");
                                    let error_snippet: String = text.chars().take(200).collect();
                                    tool_failures.push(ToolFailure {
                                        tool_name: name.to_string(),
                                        tool_call_id,
                                        error_snippet,
                                    });
                                }
                            }
                        }
                    }

                    // Check top-level tool_name / is_error
                    if msg.get("isError").and_then(Value::as_bool) == Some(true) {
                        let name = msg.get("name").or_else(|| msg.get("toolName")).and_then(Value::as_str).unwrap_or("unknown");
                        let text = msg.get("content").and_then(Value::as_str).unwrap_or("");
                        let error_snippet: String = text.chars().take(200).collect();
                        tool_failures.push(ToolFailure {
                            tool_name: name.to_string(),
                            tool_call_id: msg.get("toolCallId").and_then(Value::as_str).map(String::from),
                            error_snippet,
                        });
                    }

                    // Usage
                    if let Some(usage) = msg.get("usage") {
                        input_tokens += usage.get("input").and_then(Value::as_u64).unwrap_or(0);
                        output_tokens += usage.get("output").and_then(Value::as_u64).unwrap_or(0);
                        if let Some(cost) = usage.get("cost") {
                            let in_cost = cost.get("input").and_then(Value::as_f64).unwrap_or(0.0);
                            let out_cost = cost.get("output").and_then(Value::as_f64).unwrap_or(0.0);
                            estimated_cost += in_cost + out_cost;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Graph calculations
    let mut forks_count = 0;
    for children in parent_to_children.values() {
        if children.len() > 1 {
            forks_count += 1;
        }
    }

    let mut leaves_count = 0;
    for id in &entry_ids {
        if !parent_to_children.contains_key(id) {
            leaves_count += 1;
        }
    }

    // Active branch length back to root
    let mut active_branch_length = 0;
    let mut curr = last_entry_id;
    while let Some(c_id) = curr {
        active_branch_length += 1;
        curr = child_to_parent.get(&c_id).cloned().flatten();
    }

    Ok(InspectReport {
        session_id,
        session_path: path_str.to_string(),
        cwd,
        created_at,
        total_lines,
        total_entries,
        substantive_messages: user_messages + assistant_messages,
        user_messages,
        assistant_messages,
        custom_messages,
        compaction_count,
        forks_count,
        leaves_count,
        active_branch_length,
        tools_called,
        tool_failures,
        total_tokens: input_tokens + output_tokens,
        estimated_cost,
    })
}

pub async fn execute_inspect(opts: InspectOptions) -> Result<()> {
    let report = inspect_session_file(&opts.file_path, &opts.scope)?;

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!("{}", format!("🔍 Session Inspection: {}", report.session_path).green().bold());
    println!("{}", "═════════════════════════════════════════════════════".blue());
    println!("  Session ID:         {}", if report.session_id.is_empty() { "(unknown)".dimmed().to_string() } else { report.session_id.cyan().to_string() });
    if let Some(cwd) = &report.cwd {
        println!("  Working Directory:  {}", cwd.cyan());
    }
    if let Some(created) = &report.created_at {
        println!("  Created:            {}", created.dimmed());
    }
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    println!("  Structure & Flow:");
    println!("    • Total JSONL Lines:      {:>6}", report.total_lines);
    println!("    • Total Valid Entries:    {:>6}", report.total_entries);
    println!("    • User Messages:          {:>6}", report.user_messages);
    println!("    • Assistant Messages:     {:>6}", report.assistant_messages);
    println!("    • Compactions:            {:>6}", report.compaction_count);
    println!("    • Branch Forks:           {:>6}", report.forks_count);
    println!("    • Active Branch Depth:    {:>6}", report.active_branch_length);
    println!("{}", "─────────────────────────────────────────────────────".dimmed());
    println!("  Token & Cost Profile:");
    println!("    • Total Tokens:           {:>10}", format!("{}", report.total_tokens).yellow().bold());
    println!("    • Estimated Cost:         {:>10}", format!("${:.4}", report.estimated_cost).green().bold());

    if !report.tools_called.is_empty() {
        println!("{}", "─────────────────────────────────────────────────────".dimmed());
        println!("  Tools Invoked:");
        let mut sorted_tools: Vec<(&String, &usize)> = report.tools_called.iter().collect();
        sorted_tools.sort_by(|a, b| b.1.cmp(a.1));
        for (name, count) in sorted_tools {
            println!("    • {:<24} {:>4} call(s)", name.cyan(), count);
        }
    }

    if !report.tool_failures.is_empty() {
        println!("{}", "─────────────────────────────────────────────────────".dimmed());
        println!("{}", format!("  ⚠ Tool Errors Encountered ({}):", report.tool_failures.len()).red().bold());
        for (i, fail) in report.tool_failures.iter().enumerate().take(5) {
            println!(
                "    {}. [{}] {}",
                i + 1,
                fail.tool_name.yellow(),
                fail.error_snippet.red()
            );
        }
        if report.tool_failures.len() > 5 {
            println!("    ... and {} more tool failure(s)", report.tool_failures.len() - 5);
        }
    }
    println!("{}", "═════════════════════════════════════════════════════".blue());

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_inspect_file() {
        let mut temp = NamedTempFile::new().unwrap();
        writeln!(temp, r#"{{"type":"session","id":"sess-inspect-1","cwd":"/path/to/demo","created":"2026-04-01T00:00:00Z"}}"#).unwrap();
        writeln!(temp, r#"{{"type":"message","id":"m1","message":{{"role":"user","content":[{{"type":"text","text":"hello"}}]}}}}"#).unwrap();
        writeln!(temp, r#"{{"type":"message","id":"m2","parentId":"m1","message":{{"role":"assistant","content":[{{"type":"toolCall","name":"bash","arguments":{{"cmd":"ls"}}}}]}}}}"#).unwrap();
        writeln!(temp, r#"{{"type":"message","id":"m3","parentId":"m2","message":{{"role":"toolResult","name":"bash","isError":true,"content":"No such file"}}}}"#).unwrap();

        let path = temp.path().to_str().unwrap();
        let report = inspect_session_file(path, "active").unwrap();
        assert_eq!(report.session_id, "sess-inspect-1");
        assert_eq!(report.cwd, Some("/path/to/demo".to_string()));
        assert_eq!(report.user_messages, 1);
        assert_eq!(report.tools_called.get("bash"), Some(&1));
        assert_eq!(report.tool_failures.len(), 1);
        assert_eq!(report.tool_failures[0].tool_name, "bash");
    }
}
