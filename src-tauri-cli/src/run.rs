use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
#[command(about = "Pi Session Manager CLI")]
#[command(long_about = "A CLI tool to manage Pi sessions, models, tags, and more.\n\nExample: pi-session-cli status")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Server port (default: reads from config, fallback 52131)
    #[arg(short, long)]
    port: Option<u16>,
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
    /// Search sessions
    Search {
        query: String,
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

fn load_port_from_config() -> u16 {
    let value = pi_session_manager::unified_config::read_section("server")
        .unwrap_or_else(|_| serde_json::json!({}));
    value["http_port"].as_u64().unwrap_or(52131) as u16
}

fn format_reqwest_error(e: &reqwest::Error, url: &str) -> String {
    if e.is_connect() {
        format!(
            "无法连接到 {} — 服务端是否已启动？\n  提示: 先运行 `pi-session-cli` 启动服务端，或用 `-p <port>` 指定端口",
            url
        )
    } else if e.is_timeout() {
        format!("请求超时: {}", url)
    } else if e.is_decode() {
        format!("服务端返回了非 JSON 响应 ({}) — 可能服务端版本不匹配", url)
    } else {
        format!("请求失败 ({}): {}", url, e)
    }
}

async fn request_status(client: &Client, base_url: &str) -> Result<Value> {
    let url = format!("{}/health", base_url);
    let resp = client.get(&url).send().await.map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;
    if !resp.status().is_success() {
        return Err(anyhow!("服务端返回 HTTP {}", resp.status()));
    }
    let body: Value = resp.json().await.map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;
    Ok(body)
}

async fn request_command(client: &Client, base_url: &str, command: &str, payload: Value) -> Result<Value> {
    let url = format!("{}/api", base_url);

    let resp = client.post(&url)
        .json(&json!({ "command": command, "payload": payload }))
        .send()
        .await
        .map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("服务端返回 HTTP {}{}", status,
            if text.is_empty() { String::new() } else { format!("\n  {}", text.chars().take(200).collect::<String>()) }));
    }

    let body: Value = resp.json().await.map_err(|e| anyhow!(format_reqwest_error(&e, &url)))?;

    if body["success"].as_bool() == Some(true) {
        Ok(body["data"].clone())
    } else {
        let error = body["error"].as_str().unwrap_or("Unknown error");
        Err(anyhow!("命令 '{}' 失败: {}", command, error))
    }
}

pub async fn run() -> Result<()> {
    let cli = Cli::parse();
    let port = cli.port.unwrap_or_else(load_port_from_config);
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| anyhow!("创建 HTTP 客户端失败: {}", e))?;
    let base_url = format!("http://localhost:{}", port);

    match cli.command {
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
        Some(Commands::Search { query }) => {
            let data = request_command(&client, &base_url, "search_sessions_fts", json!({ "query": query })).await?;
            println!("{}", serde_json::to_string_pretty(&data)?.green());
        },
        None => {
            clap::Command::new("pi-session-cli")
                .print_help()?;
        }
    }

    Ok(())
}
