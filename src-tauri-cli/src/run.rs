use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;
use reqwest::Client;
use serde_json::{json, Value};
use std::io::Write;
use std::time::Duration;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
#[command(about = "Pi Session Manager CLI")]
#[command(long_about = "A high-performance CLI tool to manage, search, recall, and analyze Pi sessions.\n\nExample: pi-session-cli recall 'bug fix' --max 3")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Server port (default: reads from config, fallback 52131)
    #[arg(short, long, global = true)]
    port: Option<u16>,

    /// Language code: zh-CN, en-US, ja-JP, de-DE, fr-FR, es-ES (or auto)
    #[arg(short = 'l', long, global = true)]
    lang: Option<String>,

    /// Output Agent Skill definition Markdown to stdout
    #[arg(long, global = true)]
    skill: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Show server status
    Status,
    /// Session related commands
    Session {
        #[command(subcommand)]
        command: SessionCommands,
    },
    /// Model related commands
    Model {
        #[command(subcommand)]
        command: ModelCommands,
    },
    /// Tag related commands
    Tag {
        #[command(subcommand)]
        command: TagCommands,
    },
    /// Favorite related commands
    Favorite {
        #[command(subcommand)]
        command: FavoriteCommands,
    },
    /// API key related commands
    ApiKey {
        #[command(subcommand)]
        command: ApiKeyCommands,
    },
    /// Skill related commands
    Skill {
        #[command(subcommand)]
        command: SkillCommands,
    },
    /// Prompt related commands
    Prompt {
        #[command(subcommand)]
        command: PromptCommands,
    },
    /// Settings related commands
    Settings {
        #[command(subcommand)]
        command: SettingsCommands,
    },
    /// Dataset related commands
    Dataset {
        #[command(subcommand)]
        command: DatasetCommands,
    },
    /// Config related commands
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },
    /// Update related commands
    Update {
        #[command(subcommand)]
        command: UpdateCommands,
    },
    /// Search sessions
    Search { query: String },
    /// High-performance session dialogue recall
    Recall {
        /// Search query string
        query: String,
        /// Optional target .jsonl file path
        #[arg(short, long)]
        target: Option<String>,
        /// Entries before matching message (default: 2)
        #[arg(short, long, default_value_t = 2)]
        before: usize,
        /// Entries after matching message (default: 2)
        #[arg(short, long, default_value_t = 2)]
        after: usize,
        /// Maximum recall windows (default: 3)
        #[arg(short, long, default_value_t = 3)]
        max: usize,
        /// Output machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// Fast session and token statistics (supports .jsonl file or directory)
    Stats {
        /// Target .jsonl file or directory path
        target: Option<String>,
        /// Filter sessions by project directory
        #[arg(long)]
        cwd: Option<String>,
        /// From date (RFC3339 or YYYY-MM-DD)
        #[arg(long)]
        from: Option<String>,
        /// To date (RFC3339 or YYYY-MM-DD)
        #[arg(long)]
        to: Option<String>,
        /// Output machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// Deep session forensics, tool errors, and branch inspection
    Inspect {
        /// Path to .jsonl session file
        path: String,
        /// Inspection scope (active or all, default: active)
        #[arg(short, long, default_value = "active")]
        scope: String,
        /// Output machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// Export PSM Agent Skill bundle
    ExportSkill {
        /// Target directory (default: .pi/skills/psm-session-tools)
        output_dir: Option<String>,
        /// Overwrite if directory exists
        #[arg(short, long)]
        force: bool,
    },
    /// Install PSM Agent Skill to ~/.agents/skills
    InstallSkill {
        /// Custom destination directory (default: ~/.agents/skills/psm-session-tools)
        #[arg(short, long)]
        dest: Option<String>,
        /// Overwrite if directory exists
        #[arg(short, long)]
        force: bool,
    },
    /// Kanban workflow and board management
    Kanban {
        #[command(subcommand)]
        command: Option<KanbanCommands>,
    },
}

#[derive(Subcommand)]
enum KanbanCommands {
    /// View the Kanban board
    Board {
        /// Filter by project / working directory substring
        #[arg(long)]
        project: Option<String>,
        /// Max cards per column (default: 10, 0 = unlimited)
        #[arg(long, default_value_t = 10)]
        limit: usize,
        /// Output machine-readable JSON
        #[arg(long)]
        json: bool,
    },
    /// List all Kanban status columns
    Columns,
    /// Add a new Kanban status column
    AddColumn {
        /// Name of the new column
        name: String,
        /// Optional hex color (e.g. #0969da)
        #[arg(short, long)]
        color: Option<String>,
    },
    /// Remove a Kanban status column
    RmColumn {
        /// Column ID to remove
        id: String,
    },
    /// Move a session to a status column (by name or ID)
    Move {
        /// Session ID
        session_id: String,
        /// Target column name or ID
        column: String,
        /// Optional position within column
        #[arg(long)]
        pos: Option<i64>,
    },
    /// Clear Kanban status for a session
    Clear {
        /// Session ID
        session_id: String,
    },
    /// Inspect a session's current Kanban status
    Status {
        /// Session ID
        session_id: String,
    },
    /// List all GitHub-style Labels
    Labels,
    /// Assign a GitHub-style label to a session
    Label {
        /// Session ID
        session_id: String,
        /// Label name
        label: String,
        /// Optional hex color (e.g. #0969da)
        #[arg(short, long)]
        color: Option<String>,
    },
    /// Remove a GitHub-style label from a session
    Unlabel {
        /// Session ID
        session_id: String,
        /// Label name
        label: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli session list\n  pi-session-cli session get -p /path/to/session\n  pi-session-cli session delete -p /path/to/session")]
enum SessionCommands {
    /// List sessions
    List,
    /// Get session by path
    Get {
        #[arg(short, long)]
        path: String,
    },
    /// Delete session
    Delete {
        #[arg(short, long)]
        path: String,
    },
    /// Fork session
    Fork {
        #[arg(short, long)]
        path: String,
    },
    /// Rename session
    Rename {
        #[arg(short, long)]
        path: String,
        #[arg(short, long)]
        new_name: String,
    },
    /// Export session
    Export {
        #[arg(short, long)]
        path: String,
        #[arg(short, long)]
        format: String,
        #[arg(short, long)]
        output_path: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli model list\n  pi-session-cli model test -p openai -m gpt-4")]
enum ModelCommands {
    /// List models
    List,
    /// Test model
    Test {
        #[arg(short, long)]
        provider: String,
        #[arg(short, long)]
        model: String,
    },
    /// Test models batch
    TestBatch {
        #[arg(short, long)]
        models: Vec<String>,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli tag list\n  pi-session-cli tag create -n my-tag -c blue\n  pi-session-cli tag delete -i 123")]
enum TagCommands {
    /// List tags
    List,
    /// Create tag
    Create {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        color: String,
    },
    /// Delete tag
    Delete {
        #[arg(short, long)]
        id: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli favorite list\n  pi-session-cli favorite add -i 123 -t session -n my-fav -p /path/to/session")]
enum FavoriteCommands {
    /// List favorites
    List,
    /// Add favorite
    Add {
        #[arg(short, long)]
        id: String,
        #[arg(short, long)]
        favorite_type: String,
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        path: String,
    },
    /// Remove favorite
    Remove {
        #[arg(short, long)]
        id: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli api-key list\n  pi-session-cli api-key create -n my-key -k sk-123\n  pi-session-cli api-key revoke -k sk-123")]
enum ApiKeyCommands {
    /// List API keys
    List,
    /// Create API key
    Create {
        #[arg(short, long)]
        name: Option<String>,
        #[arg(short, long)]
        key: Option<String>,
        #[arg(short, long)]
        value: Option<String>,
    },
    /// Revoke API key
    Revoke {
        #[arg(short, long)]
        key_preview: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli skill scan\n  pi-session-cli skill get -p /path/to/skill")]
enum SkillCommands {
    /// Scan skills
    Scan,
    /// Get skill content
    Get {
        #[arg(short, long)]
        path: String,
    },
    /// Install PSM Agent Skill to ~/.agents/skills
    Install {
        /// Custom destination directory (default: ~/.agents/skills/psm-session-tools)
        #[arg(short, long)]
        dest: Option<String>,
        /// Overwrite if directory exists
        #[arg(short, long)]
        force: bool,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli prompt scan\n  pi-session-cli prompt get -p /path/to/prompt")]
enum PromptCommands {
    /// Scan prompts
    Scan,
    /// Get prompt content
    Get {
        #[arg(short, long)]
        path: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli settings load\n  pi-session-cli settings save -s '{\"key\":\"value\"}'")]
enum SettingsCommands {
    /// Load settings
    Load,
    /// Save settings
    Save {
        #[arg(short, long)]
        settings: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli dataset list\n  pi-session-cli dataset import -s /path/to/dataset")]
enum DatasetCommands {
    /// List datasets
    List,
    /// Start import
    Import {
        #[arg(short, long)]
        source: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli config load\n  pi-session-cli config save -c '{\"key\":\"value\"}'")]
enum ConfigCommands {
    /// Load config
    Load,
    /// Save config
    Save {
        #[arg(short, long)]
        content: String,
    },
}

#[derive(Subcommand)]
#[command(after_help = "EXAMPLES:\n  pi-session-cli update check\n  pi-session-cli update check --channel beta\n  pi-session-cli update install\n  pi-session-cli update install --channel beta --yes")]
enum UpdateCommands {
    /// Check for updates (standalone, no server required)
    Check {
        /// Update channel (stable or beta)
        #[arg(short, long, default_value = "stable")]
        channel: String,
        /// Also try the third-party update proxy (jsp.dwsy.link); off by default
        #[arg(long)]
        use_proxy: bool,
    },
    /// Download and install the latest CLI binary (self-update)
    Install {
        /// Update channel (stable or beta)
        #[arg(short, long, default_value = "stable")]
        channel: String,
        /// Skip confirmation prompt
        #[arg(long)]
        yes: bool,
        /// Force reinstall even if already up to date
        #[arg(long)]
        force: bool,
        /// Also try the third-party update proxy (jsp.dwsy.link); off by default
        #[arg(long)]
        use_proxy: bool,
    },
}

fn load_port_from_config() -> u16 {
    let value = pi_session_manager::unified_config::read_section("server").unwrap_or_else(|_| serde_json::json!({}));
    value["http_port"].as_u64().unwrap_or(52131) as u16
}

fn format_reqwest_error(e: &reqwest::Error, url: &str) -> String {
    let lang = crate::i18n::current_language();
    crate::i18n::format_reqwest_error(e, url, lang)
}

async fn request_status(client: &Client, base_url: &str) -> Result<Value> {
    // The HTTP server does not expose a JSON /health route (it serves the SPA there), so probe the
    // first endpoint that answers with JSON.
    let mut last_error: Option<String> = None;
    for path in ["/health", "/v1/observability/summary"] {
        let url = format!("{base_url}{path}");
        let resp = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                last_error = Some(format_reqwest_error(&e, &url));
                continue;
            }
        };
        if !resp.status().is_success() {
            last_error = Some(format!("服务端返回 HTTP {}", resp.status()));
            continue;
        }
        match resp.json::<Value>().await {
            Ok(body) => return Ok(body),
            Err(e) => last_error = Some(format_reqwest_error(&e, &url)),
        }
    }
    Err(anyhow!(last_error.unwrap_or_else(|| format!("无法获取服务端状态: {base_url}"))))
}

async fn request_command(client: &Client, base_url: &str, command: &str, payload: Value) -> Result<Value> {
    let url = format!("{base_url}/api");

    let resp = client.post(&url).json(&json!({ "command": command, "payload": payload })).send().await.map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("服务端返回 HTTP {}{}", status, if text.is_empty() { String::new() } else { format!("\n  {}", text.chars().take(200).collect::<String>()) }));
    }

    let body: Value = resp.json().await.map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;

    if body["success"].as_bool() == Some(true) {
        Ok(body["data"].clone())
    } else {
        let error = body["error"].as_str().unwrap_or("Unknown error");
        Err(anyhow!("命令 '{command}' 失败: {error}"))
    }
}

pub async fn run() -> Result<()> {
    let cli = Cli::parse();

    // 1. Language configuration
    if let Some(l) = &cli.lang {
        crate::i18n::set_current_language(crate::i18n::Language::parse_or_default(l));
    }

    // 2. Direct --skill flag: print skill Markdown to stdout and exit
    if cli.skill {
        crate::ops::export_skill::print_skill_markdown();
        return Ok(());
    }

    let port = cli.port.unwrap_or_else(load_port_from_config);
    let client = Client::builder().timeout(Duration::from_secs(30)).no_proxy().build().map_err(|e| anyhow!("创建 HTTP 客户端失败: {e}"))?;
    let base_url = format!("http://localhost:{port}");

    match cli.command {
        Some(Commands::Recall { query, target, before, after, max, json }) => {
            crate::ops::recall::execute_recall(crate::ops::recall::RecallOptions { query, target, before, after, max_results: max, max_chars_per_entry: 1200, json }).await?;
        }
        Some(Commands::Stats { target, cwd, from, to, json }) => {
            crate::ops::stats::execute_stats(crate::ops::stats::StatsOptions { target, cwd, from, to, json }).await?;
        }
        Some(Commands::Inspect { path, scope, json }) => {
            crate::ops::inspect::execute_inspect(crate::ops::inspect::InspectOptions { file_path: path, scope, json }).await?;
        }
        Some(Commands::ExportSkill { output_dir, force }) => {
            crate::ops::export_skill::execute_export_skill(crate::ops::export_skill::ExportSkillOptions { output_dir, force }).await?;
        }
        Some(Commands::InstallSkill { dest, force }) => {
            crate::ops::export_skill::execute_install_skill(dest, force).await?;
        }
        Some(Commands::Kanban { command }) => match command {
            Some(KanbanCommands::Board { project, limit, json }) => {
                crate::ops::kanban::execute_show_board(project, limit, json).await?;
            }
            Some(KanbanCommands::Columns) => {
                crate::ops::kanban::execute_list_columns().await?;
            }
            Some(KanbanCommands::AddColumn { name, color }) => {
                crate::ops::kanban::execute_add_column(name, color).await?;
            }
            Some(KanbanCommands::RmColumn { id }) => {
                crate::ops::kanban::execute_remove_column(id).await?;
            }
            Some(KanbanCommands::Move { session_id, column, pos }) => {
                crate::ops::kanban::execute_move_session(session_id, column, pos).await?;
            }
            Some(KanbanCommands::Clear { session_id }) => {
                crate::ops::kanban::execute_clear_session(session_id).await?;
            }
            Some(KanbanCommands::Status { session_id }) => {
                crate::ops::kanban::execute_inspect_session_status(session_id).await?;
            }
            Some(KanbanCommands::Labels) => {
                crate::ops::kanban::execute_list_labels().await?;
            }
            Some(KanbanCommands::Label { session_id, label, color }) => {
                crate::ops::kanban::execute_assign_label(session_id, label, color).await?;
            }
            Some(KanbanCommands::Unlabel { session_id, label }) => {
                crate::ops::kanban::execute_remove_label(session_id, label).await?;
            }
            None => {
                // Default: show Kanban board
                crate::ops::kanban::execute_show_board(None, 10, false).await?;
            }
        },
        Some(Commands::Status) => {
            let data = request_status(&client, &base_url).await?;
            println!("{}", serde_json::to_string_pretty(&data)?.green());
        }
        Some(Commands::Session { command }) => match command {
            SessionCommands::List => {
                let data = request_command(&client, &base_url, "scan_sessions", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SessionCommands::Get { path } => {
                let data = request_command(&client, &base_url, "get_session_by_path", json!({ "path": path })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SessionCommands::Delete { path } => {
                request_command(&client, &base_url, "delete_session", json!({ "path": path })).await?;
                println!("{}", format!("Session deleted: {path}").green());
            }
            SessionCommands::Fork { path } => {
                let data = request_command(&client, &base_url, "fork_session", json!({ "sourcePath": path })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SessionCommands::Rename { path, new_name } => {
                request_command(&client, &base_url, "rename_session", json!({ "path": path, "newName": new_name })).await?;
                println!("{}", format!("Session renamed: {path}").green());
            }
            SessionCommands::Export { path, format, output_path } => {
                request_command(&client, &base_url, "export_session", json!({ "path": path, "format": format, "outputPath": output_path })).await?;
                println!("{}", format!("Session exported: {path}").green());
            }
        },
        Some(Commands::Model { command }) => match command {
            ModelCommands::List => {
                let data = request_command(&client, &base_url, "list_models", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            ModelCommands::Test { provider, model } => {
                let data = request_command(&client, &base_url, "test_model", json!({ "provider": provider, "model": model })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            ModelCommands::TestBatch { models } => {
                let data = request_command(&client, &base_url, "test_models_batch", json!({ "models": models })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
        },
        Some(Commands::Tag { command }) => match command {
            TagCommands::List => {
                let data = request_command(&client, &base_url, "get_all_tags", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            TagCommands::Create { name, color } => {
                let data = request_command(&client, &base_url, "create_tag", json!({ "name": name, "color": color })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            TagCommands::Delete { id } => {
                request_command(&client, &base_url, "delete_tag", json!({ "id": id })).await?;
                println!("{}", format!("Tag deleted: {id}").green());
            }
        },
        Some(Commands::Favorite { command }) => match command {
            FavoriteCommands::List => {
                let data = request_command(&client, &base_url, "get_all_favorites", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            FavoriteCommands::Add { id, favorite_type, name, path } => {
                request_command(&client, &base_url, "add_favorite", json!({ "id": id, "favoriteType": favorite_type, "name": name, "path": path })).await?;
                println!("{}", format!("Favorite added: {id}").green());
            }
            FavoriteCommands::Remove { id } => {
                request_command(&client, &base_url, "remove_favorite", json!({ "id": id })).await?;
                println!("{}", format!("Favorite removed: {id}").green());
            }
        },
        Some(Commands::ApiKey { command }) => match command {
            ApiKeyCommands::List => {
                let data = request_command(&client, &base_url, "list_api_keys", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            ApiKeyCommands::Create { name, key, value } => {
                let data = request_command(&client, &base_url, "create_api_key", json!({ "name": name, "key": key, "value": value })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            ApiKeyCommands::Revoke { key_preview } => {
                request_command(&client, &base_url, "revoke_api_key", json!({ "keyPreview": key_preview })).await?;
                println!("{}", format!("API key revoked: {key_preview}").green());
            }
        },
        Some(Commands::Skill { command }) => match command {
            SkillCommands::Scan => {
                let data = request_command(&client, &base_url, "scan_skills", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SkillCommands::Get { path } => {
                let data = request_command(&client, &base_url, "get_skill_content", json!({ "path": path })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SkillCommands::Install { dest, force } => {
                crate::ops::export_skill::execute_install_skill(dest, force).await?;
            }
        },
        Some(Commands::Prompt { command }) => match command {
            PromptCommands::Scan => {
                let data = request_command(&client, &base_url, "scan_prompts", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            PromptCommands::Get { path } => {
                let data = request_command(&client, &base_url, "get_prompt_content", json!({ "path": path })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
        },
        Some(Commands::Settings { command }) => match command {
            SettingsCommands::Load => {
                let data = request_command(&client, &base_url, "load_pi_settings", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            SettingsCommands::Save { settings } => {
                let settings: Value = serde_json::from_str(&settings)?;
                request_command(&client, &base_url, "save_pi_settings", json!({ "settings": settings })).await?;
                println!("{}", "Settings saved".green());
            }
        },
        Some(Commands::Dataset { command }) => match command {
            DatasetCommands::List => {
                let data = request_command(&client, &base_url, "list_datasets", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            DatasetCommands::Import { source } => {
                let data = request_command(&client, &base_url, "start_dataset_import", json!({ "source": source })).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
        },
        Some(Commands::Config { command }) => match command {
            ConfigCommands::Load => {
                let data = request_command(&client, &base_url, "load_model_config", json!({})).await?;
                println!("{}", serde_json::to_string_pretty(&data)?.green());
            }
            ConfigCommands::Save { content } => {
                let content: Value = serde_json::from_str(&content)?;
                request_command(&client, &base_url, "save_model_config", json!({ "content": content })).await?;
                println!("{}", "Config saved".green());
            }
        },
        Some(Commands::Update { command }) => match command {
            UpdateCommands::Check { channel, use_proxy } => {
                handle_update_check(&channel, use_proxy).await?;
            }
            UpdateCommands::Install { channel, yes, force, use_proxy } => {
                handle_update_install(&channel, yes, force, use_proxy).await?;
            }
        },
        Some(Commands::Search { query }) => {
            // First try online server, fallback to standalone local search
            match request_command(&client, &base_url, "full_text_search", json!({ "query": query, "role_filter": "all", "page": 0, "page_size": 20 })).await {
                Ok(data) => {
                    println!("{}", serde_json::to_string_pretty(&data)?.green());
                }
                Err(_) => {
                    let data = pi_session_manager::domain::session_search::full_text_search(query, "all".to_string(), None, None, 0, 20, None, None, None, None, None).await.map_err(|e| anyhow!("Search failed: {e}"))?;
                    println!("{}", serde_json::to_string_pretty(&data)?.green());
                }
            }
        }
        None => {
            clap::Command::new("pi-session-cli").print_help()?;
        }
    }

    Ok(())
}

/// Handle update check command (standalone — no running server required)
async fn handle_update_check(channel: &str, use_proxy: bool) -> Result<()> {
    println!("{} Checking for updates (channel: {})...", "→".cyan(), channel.yellow());

    let info = match crate::updater::check_update(channel, use_proxy).await {
        Ok(info) => info,
        Err(e) => {
            println!("{} {}", "✗".red(), format!("Failed to check for updates: {e}").red());
            return Ok(());
        }
    };

    if !info.update_available {
        println!("{}", "✓ Already up to date.".green());
        println!("  Version: {} (channel: {})", info.current_version.cyan(), channel.yellow());
        return Ok(());
    }

    println!("{}", "⚠ Update available!".yellow().bold());
    println!("  Current version: {}", info.current_version.cyan());
    println!("  Latest version:  {}", info.latest_version.green().bold());

    if let Some(body) = &info.body {
        if !body.is_empty() {
            println!("\n{}", "Release notes:".dimmed());
            for line in body.lines().take(10) {
                println!("  {}", line.dimmed());
            }
            if body.lines().count() > 10 {
                println!("  {}", "...".dimmed());
            }
        }
    }

    println!("\nTo install, run: {}", format!("pi-session-cli update install --channel {}", channel).cyan());

    Ok(())
}

/// Handle update install command (self-update — downloads and replaces binary)
async fn handle_update_install(channel: &str, skip_confirm: bool, force: bool, use_proxy: bool) -> Result<()> {
    // Windows: self-update not supported (running exe is locked)
    #[cfg(target_os = "windows")]
    {
        let _ = (channel, skip_confirm, force, use_proxy);
        let lang = crate::i18n::current_language();
        println!("{}", crate::i18n::msg_windows_update_not_supported(lang).red().bold());
        println!();
        println!("{}", crate::i18n::msg_windows_update_hint(lang).yellow());
        println!("  {}", "irm https://raw.githubusercontent.com/Dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex".cyan());
        println!();
        println!("{}", crate::i18n::msg_releases_download_hint(lang).dimmed());
        println!("  {}", "https://github.com/Dwsy/pi-session-manager/releases/latest".cyan().underline());
        std::process::exit(1);
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("{} Checking for updates (channel: {})...", "→".cyan(), channel.yellow());

        let info = crate::updater::check_update(channel, use_proxy).await?;

        if !info.update_available && !force {
            println!("{}", "✓ Already up to date.".green());
            println!("  Version: {}", info.current_version.cyan());
            return Ok(());
        }

        if info.update_available {
            println!("{}", "⚠ Update found:".yellow().bold());
            println!("  {} → {}", info.current_version.cyan(), info.latest_version.green().bold());
        } else {
            println!("{} (force reinstall {})", "→ Reinstalling current version".cyan(), info.current_version.yellow());
        }

        // Confirmation prompt
        if !skip_confirm {
            print!("\n{} Download and install? [Y/n] ", "?".yellow());
            std::io::stdout().flush()?;

            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;

            let answer = input.trim().to_lowercase();
            if answer == "n" || answer == "no" {
                println!("{}", "Cancelled.".dimmed());
                return Ok(());
            }
        }

        // Download and install
        println!();
        crate::updater::download_and_install(&info, channel).await?;

        println!();
        println!("{}", "✓ Update complete!".green().bold());
        println!("  Version: {}", info.latest_version.green());
        println!("  Run {} to verify.", "pi-session-cli --version".cyan());

        Ok(())
    }
}
