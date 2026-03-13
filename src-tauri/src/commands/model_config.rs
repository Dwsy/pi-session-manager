use std::fs;
use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::{Map, Value};

use super::config_versions::{
    list_config_versions_internal, save_config_snapshot, ConfigVersionMeta,
};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub provider: String,
    pub model: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfigBackupMeta {
    pub id: String,
    pub file_path: String,
    pub created_at: String,
    pub size_bytes: u64,
    pub note: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelHttpTestResult {
    pub provider: String,
    pub model: String,
    pub api: String,
    pub method: String,
    pub url: String,
    pub status_code: Option<u16>,
    pub ok: bool,
    pub latency_ms: u64,
    pub curl_command: String,
    pub request_body: String,
    pub request_style: String,
    pub response_preview: Option<String>,
    pub attempt_count: u8,
    pub used_fallback: bool,
    pub response_body: String,
    pub error: Option<String>,
}

fn sort_model_options(options: &mut [ModelOption]) {
    options.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.model.cmp(&b.model)));
}

fn models_json_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    Ok(home.join(".pi/agent/models.json"))
}

fn models_backup_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    Ok(home.join(".pi/agent/backups/models"))
}

fn ensure_model_config_shape(mut json: Value) -> Value {
    if !json.is_object() {
        json = Value::Object(Map::new());
    }
    if !json
        .get("providers")
        .is_some_and(|providers| providers.is_object())
    {
        json["providers"] = Value::Object(Map::new());
    }
    json
}

fn validate_model_config_shape(json: &Value) -> Result<(), String> {
    if !json.is_object() {
        return Err("models.json root must be an object".to_string());
    }
    if !json
        .get("providers")
        .is_some_and(|providers| providers.is_object())
    {
        return Err("models.json.providers must be an object".to_string());
    }
    Ok(())
}

fn read_models_config_internal() -> Result<Value, String> {
    let path = models_json_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({ "providers": {} }));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Read models.json: {e}"))?;
    let json: Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse models.json: {e}"))?;
    Ok(ensure_model_config_shape(json))
}

fn create_model_config_backup_internal(
    note: Option<String>,
) -> Result<ModelConfigBackupMeta, String> {
    let models_path = models_json_path()?;
    if !models_path.exists() {
        return Err("models.json not found".to_string());
    }

    let content = fs::read_to_string(&models_path).map_err(|e| format!("Read models.json: {e}"))?;

    let backup_dir = models_backup_dir()?;
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Create backup dir: {e}"))?;

    let now = chrono::Utc::now();
    let id = format!("models-{}", now.format("%Y%m%d-%H%M%S-%3f"));
    let backup_path = backup_dir.join(format!("{id}.json"));
    fs::write(&backup_path, &content).map_err(|e| format!("Write backup: {e}"))?;

    if let Some(ref note_text) = note {
        let note_path = backup_dir.join(format!("{id}.meta.json"));
        let note_json = serde_json::json!({
            "note": note_text,
            "createdAt": now.to_rfc3339(),
        });
        let note_content = serde_json::to_string_pretty(&note_json)
            .map_err(|e| format!("Serialize backup note: {e}"))?;
        fs::write(note_path, note_content).map_err(|e| format!("Write backup note: {e}"))?;
    }

    Ok(ModelConfigBackupMeta {
        id,
        file_path: backup_path.to_string_lossy().to_string(),
        created_at: now.to_rfc3339(),
        size_bytes: content.len() as u64,
        note,
    })
}

fn write_models_config_internal(json: Value, create_backup: bool) -> Result<(), String> {
    let json = ensure_model_config_shape(json);
    validate_model_config_shape(&json)?;

    let path = models_json_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create models parent dir: {e}"))?;
    }

    if create_backup && path.exists() {
        let _ = create_model_config_backup_internal(None);
    }

    let content =
        serde_json::to_string_pretty(&json).map_err(|e| format!("Serialize models.json: {e}"))?;
    fs::write(&path, &content).map_err(|e| format!("Write models.json: {e}"))?;

    let path_str = path.to_string_lossy().to_string();
    if let Err(e) = save_config_snapshot(&path_str, &content) {
        eprintln!("Warning: failed to save model config snapshot: {e}");
    }

    Ok(())
}

fn merge_model_config(existing: Value, imported: Value) -> Value {
    let mut target = ensure_model_config_shape(existing);
    let source = ensure_model_config_shape(imported);

    let Some(target_providers) = target.get_mut("providers").and_then(|v| v.as_object_mut()) else {
        return target;
    };
    let Some(source_providers) = source.get("providers").and_then(|v| v.as_object()) else {
        return target;
    };

    for (provider_name, provider_value) in source_providers {
        target_providers.insert(provider_name.clone(), provider_value.clone());
    }

    target
}

fn resolve_dynamic_value(raw: &str) -> Result<String, String> {
    if let Some(command) = raw.strip_prefix('!') {
        let output = StdCommand::new("sh")
            .arg("-lc")
            .arg(command)
            .output()
            .map_err(|e| format!("Run command for dynamic value failed: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Command for dynamic value failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    if let Ok(value) = std::env::var(raw) {
        return Ok(value);
    }

    Ok(raw.to_string())
}

fn parse_headers_json(
    provider_headers: Option<&Map<String, Value>>,
    model_headers: Option<&Map<String, Value>>,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();

    for raw_map in [provider_headers, model_headers].into_iter().flatten() {
        for (k, v) in raw_map {
            let Some(raw_value) = v.as_str() else {
                continue;
            };
            let resolved_value = resolve_dynamic_value(raw_value)?;
            let header_name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("Invalid header name `{k}`: {e}"))?;
            let header_value = HeaderValue::from_str(&resolved_value)
                .map_err(|e| format!("Invalid header value for `{k}`: {e}"))?;
            headers.insert(header_name, header_value);
        }
    }

    Ok(headers)
}

fn join_url(base: &str, suffix: &str) -> String {
    let trimmed_base = base.trim_end_matches('/');
    let trimmed_suffix = suffix.trim_start_matches('/');
    format!("{trimmed_base}/{trimmed_suffix}")
}

fn shell_escape_single_quotes(input: &str) -> String {
    input.replace('\'', "'\''")
}

fn build_masked_curl_command(url: &str, headers: &HeaderMap, body: &str) -> String {
    let mut parts = vec![
        "curl -sS -X POST".to_string(),
        format!("'{}'", shell_escape_single_quotes(url)),
    ];

    for (name, value) in headers {
        let key = name.as_str().to_ascii_lowercase();
        let value_text = value.to_str().unwrap_or("");
        let display_value = if key == "authorization" || key == "x-api-key" {
            "***"
        } else {
            value_text
        };
        parts.push(format!(
            "-H '{}: {}'",
            shell_escape_single_quotes(name.as_str()),
            shell_escape_single_quotes(display_value)
        ));
    }

    parts.push(format!("--data '{}'", shell_escape_single_quotes(body)));
    parts.join(" ")
}

#[derive(Clone, Debug)]
struct HttpTestAttempt {
    request_style: &'static str,
    url: String,
    body_value: Value,
    extra_headers: Vec<(HeaderName, HeaderValue)>,
}

fn is_openai_reasoning_model(model: &str) -> bool {
    let normalized = model.trim().to_ascii_lowercase();
    normalized.starts_with("o1")
        || normalized.starts_with("o3")
        || normalized.starts_with("o4")
        || normalized.starts_with("gpt-5")
}

fn build_openai_chat_attempts(
    base_url: &str,
    model: &str,
    prompt_text: &str,
) -> Vec<HttpTestAttempt> {
    let mut attempts = Vec::with_capacity(2);
    let max_completion_tokens = if is_openai_reasoning_model(model) {
        256
    } else {
        128
    };

    attempts.push(HttpTestAttempt {
        request_style: "chat-completions:max_completion_tokens",
        url: join_url(base_url, "chat/completions"),
        body_value: serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": false,
            "max_completion_tokens": max_completion_tokens,
        }),
        extra_headers: Vec::new(),
    });

    attempts.push(HttpTestAttempt {
        request_style: "chat-completions:max_tokens",
        url: join_url(base_url, "chat/completions"),
        body_value: serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": false,
            "max_tokens": 128,
        }),
        extra_headers: Vec::new(),
    });

    attempts
}

fn build_openai_responses_attempts(
    base_url: &str,
    model: &str,
    prompt_text: &str,
) -> Vec<HttpTestAttempt> {
    vec![
        HttpTestAttempt {
            request_style: "responses:input_string",
            url: join_url(base_url, "responses"),
            body_value: serde_json::json!({
                "model": model,
                "input": prompt_text,
                "max_output_tokens": 256,
            }),
            extra_headers: Vec::new(),
        },
        HttpTestAttempt {
            request_style: "responses:input_message_items",
            url: join_url(base_url, "responses"),
            body_value: serde_json::json!({
                "model": model,
                "input": [{
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": prompt_text,
                    }],
                }],
                "max_output_tokens": 256,
            }),
            extra_headers: Vec::new(),
        },
    ]
}

fn build_anthropic_messages_attempts(
    base_url: &str,
    model: &str,
    prompt_text: &str,
) -> Vec<HttpTestAttempt> {
    let version_header = (
        HeaderName::from_static("anthropic-version"),
        HeaderValue::from_static("2023-06-01"),
    );

    vec![
        HttpTestAttempt {
            request_style: "anthropic-messages:string_content",
            url: join_url(base_url, "messages"),
            body_value: serde_json::json!({
                "model": model,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": prompt_text}],
            }),
            extra_headers: vec![version_header.clone()],
        },
        HttpTestAttempt {
            request_style: "anthropic-messages:content_blocks",
            url: join_url(base_url, "messages"),
            body_value: serde_json::json!({
                "model": model,
                "max_tokens": 256,
                "messages": [{
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": prompt_text,
                    }],
                }],
            }),
            extra_headers: vec![version_header],
        },
    ]
}

fn extract_response_preview(api: &str, response_text: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(response_text).ok()?;
    match api {
        "openai-completions" => parsed
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(|content| content.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        "openai-responses" => parsed
            .get("output_text")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| {
                parsed
                    .get("output")
                    .and_then(|v| v.as_array())
                    .and_then(|items| {
                        items.iter().find_map(|item| {
                            item.get("content")
                                .and_then(|v| v.as_array())
                                .and_then(|content| {
                                    content.iter().find_map(|part| {
                                        part.get("text")
                                            .and_then(|v| v.as_str())
                                            .map(str::trim)
                                            .filter(|value| !value.is_empty())
                                            .map(str::to_string)
                                    })
                                })
                        })
                    })
            }),
        "anthropic-messages" => {
            parsed
                .get("content")
                .and_then(|v| v.as_array())
                .and_then(|items| {
                    items.iter().find_map(|item| {
                        item.get("text")
                            .and_then(|v| v.as_str())
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                    })
                })
        }
        _ => None,
    }
}

fn extract_error_message(response_text: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(response_text).ok()?;
    parsed
        .get("error")
        .and_then(|value| {
            if let Some(message) = value.get("message").and_then(|message| message.as_str()) {
                Some(message)
            } else {
                value.as_str()
            }
        })
        .or_else(|| parsed.get("message").and_then(|value| value.as_str()))
        .or_else(|| parsed.get("detail").and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn truncate_response_body(response_text: &str) -> String {
    if response_text.len() > 10_000 {
        format!(
            "{}
...[truncated]",
            &response_text[..10_000]
        )
    } else {
        response_text.to_string()
    }
}

fn sanitize_backup_id(id: &str) -> Result<String, String> {
    if id.is_empty() {
        return Err("Backup id is empty".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Backup id contains invalid characters".to_string());
    }
    Ok(id.to_string())
}

fn list_model_config_backups_internal() -> Result<Vec<ModelConfigBackupMeta>, String> {
    let backup_dir = models_backup_dir()?;
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();

    for entry in fs::read_dir(&backup_dir).map_err(|e| format!("Read backup dir: {e}"))? {
        let entry = entry.map_err(|e| format!("Read backup entry: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".meta.json"))
        {
            continue;
        }

        let Some(id) = path.file_stem().and_then(|v| v.to_str()) else {
            continue;
        };

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Read backup metadata: {e}"))?;
        let modified = metadata.modified().ok();
        let created_at = modified
            .map(chrono::DateTime::<chrono::Utc>::from)
            .map(|t| t.to_rfc3339())
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        let note_path = backup_dir.join(format!("{id}.meta.json"));
        let note = if note_path.exists() {
            fs::read_to_string(&note_path)
                .ok()
                .and_then(|content| serde_json::from_str::<Value>(&content).ok())
                .and_then(|v| v.get("note").and_then(|n| n.as_str()).map(str::to_string))
        } else {
            None
        };

        backups.push(ModelConfigBackupMeta {
            id: id.to_string(),
            file_path: path.to_string_lossy().to_string(),
            created_at,
            size_bytes: metadata.len(),
            note,
        });
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

fn restore_model_config_backup_internal(id: String) -> Result<(), String> {
    let id = sanitize_backup_id(&id)?;
    let backup_path = models_backup_dir()?.join(format!("{id}.json"));
    if !backup_path.exists() {
        return Err(format!("Backup not found: {id}"));
    }

    let content = fs::read_to_string(&backup_path).map_err(|e| format!("Read backup file: {e}"))?;
    let imported: Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse backup JSON: {e}"))?;
    write_models_config_internal(imported, true)
}

fn delete_model_config_backup_internal(id: String) -> Result<(), String> {
    let id = sanitize_backup_id(&id)?;
    let backup_dir = models_backup_dir()?;
    let backup_path = backup_dir.join(format!("{id}.json"));
    let note_path = backup_dir.join(format!("{id}.meta.json"));

    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|e| format!("Delete backup file: {e}"))?;
    }
    if note_path.exists() {
        fs::remove_file(&note_path).map_err(|e| format!("Delete backup note: {e}"))?;
    }

    Ok(())
}

pub async fn list_model_options_fast_internal() -> Result<Vec<ModelOption>, String> {
    let json = read_models_config_internal()?;
    let mut options = Vec::new();

    if let Some(providers) = json.get("providers").and_then(|v| v.as_object()) {
        for (prov_name, prov_val) in providers {
            if let Some(models) = prov_val.get("models").and_then(|v| v.as_array()) {
                for m in models {
                    if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                        options.push(ModelOption {
                            provider: prov_name.clone(),
                            model: id.to_string(),
                        });
                    }
                }
            }
        }
    }

    sort_model_options(&mut options);
    Ok(options)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_fast() -> Result<Vec<ModelOption>, String> {
    list_model_options_fast_internal().await
}

pub async fn list_model_options_full_internal() -> Result<Vec<ModelOption>, String> {
    let output = tokio::process::Command::new("pi")
        .arg("--list-models")
        .output()
        .await
        .map_err(|e| format!("Failed to run pi --list-models: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "pi --list-models failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut options = Vec::new();
    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            options.push(ModelOption {
                provider: parts[0].to_string(),
                model: parts[1].to_string(),
            });
        }
    }
    sort_model_options(&mut options);
    Ok(options)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_full() -> Result<Vec<ModelOption>, String> {
    list_model_options_full_internal().await
}

pub async fn list_model_config_versions_internal() -> Result<Vec<ConfigVersionMeta>, String> {
    let file_path = models_json_path()?.to_string_lossy().to_string();
    list_config_versions_internal(Some(file_path)).await
}

pub async fn load_model_config_internal() -> Result<Value, String> {
    read_models_config_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_model_config() -> Result<Value, String> {
    load_model_config_internal().await
}

pub async fn save_model_config_internal(
    content: Value,
    create_backup: Option<bool>,
) -> Result<(), String> {
    write_models_config_internal(content, create_backup.unwrap_or(true))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_model_config(content: Value, create_backup: Option<bool>) -> Result<(), String> {
    save_model_config_internal(content, create_backup).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn create_model_config_backup(
    note: Option<String>,
) -> Result<ModelConfigBackupMeta, String> {
    create_model_config_backup_internal(note)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_config_backups() -> Result<Vec<ModelConfigBackupMeta>, String> {
    list_model_config_backups_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn restore_model_config_backup(id: String) -> Result<(), String> {
    restore_model_config_backup_internal(id)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_model_config_backup(id: String) -> Result<(), String> {
    delete_model_config_backup_internal(id)
}

pub async fn export_model_config_content_internal() -> Result<String, String> {
    let json = read_models_config_internal()?;
    serde_json::to_string_pretty(&json).map_err(|e| format!("Serialize model config: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_model_config_content() -> Result<String, String> {
    export_model_config_content_internal().await
}

pub async fn export_model_config_to_path_internal(path: String) -> Result<String, String> {
    let content = export_model_config_content_internal().await?;
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create export dir: {e}"))?;
    }
    fs::write(&target, &content).map_err(|e| format!("Write export file: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn export_model_config_to_path(path: String) -> Result<String, String> {
    export_model_config_to_path_internal(path).await
}

pub async fn import_model_config_content_internal(
    content: String,
    mode: Option<String>,
) -> Result<Value, String> {
    let imported: Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse imported model config: {e}"))?;
    validate_model_config_shape(&ensure_model_config_shape(imported.clone()))?;

    let final_json = if mode.as_deref() == Some("merge") {
        let existing = read_models_config_internal()?;
        merge_model_config(existing, imported)
    } else {
        ensure_model_config_shape(imported)
    };

    write_models_config_internal(final_json.clone(), true)?;
    Ok(final_json)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn import_model_config_content(
    content: String,
    mode: Option<String>,
) -> Result<Value, String> {
    import_model_config_content_internal(content, mode).await
}

pub async fn import_model_config_from_path_internal(
    path: String,
    mode: Option<String>,
) -> Result<Value, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Read import file: {e}"))?;
    import_model_config_content_internal(content, mode).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn import_model_config_from_path(
    path: String,
    mode: Option<String>,
) -> Result<Value, String> {
    import_model_config_from_path_internal(path, mode).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_config_versions() -> Result<Vec<ConfigVersionMeta>, String> {
    list_model_config_versions_internal().await
}

fn extract_provider_and_model<'a>(
    config: &'a Value,
    provider: &str,
    model: &str,
) -> Result<(&'a Map<String, Value>, Option<&'a Map<String, Value>>), String> {
    let providers = config
        .get("providers")
        .and_then(|v| v.as_object())
        .ok_or("Invalid models.json: missing providers object")?;

    let provider_obj = providers
        .get(provider)
        .and_then(|v| v.as_object())
        .ok_or_else(|| format!("Provider not found in models.json: {provider}"))?;

    let model_obj = provider_obj
        .get("models")
        .and_then(|v| v.as_array())
        .and_then(|models| {
            models.iter().find_map(|entry| {
                let obj = entry.as_object()?;
                let id = obj.get("id")?.as_str()?;
                if id == model {
                    Some(obj)
                } else {
                    None
                }
            })
        });

    Ok((provider_obj, model_obj))
}

pub async fn test_model_http_internal(
    provider: String,
    model: String,
    prompt: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ModelHttpTestResult, String> {
    let config = read_models_config_internal()?;
    let (provider_obj, model_obj) = extract_provider_and_model(&config, &provider, &model)?;

    let base_url = provider_obj
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Provider `{provider}` is missing baseUrl"))?
        .to_string();

    let api = model_obj
        .and_then(|obj| obj.get("api").and_then(|v| v.as_str()))
        .or_else(|| provider_obj.get("api").and_then(|v| v.as_str()))
        .unwrap_or("openai-completions")
        .to_string();

    let api_key_raw = provider_obj
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let resolved_api_key = if api_key_raw.is_empty() {
        String::new()
    } else {
        resolve_dynamic_value(api_key_raw)?
    };

    let auth_header = provider_obj
        .get("authHeader")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let provider_headers = provider_obj.get("headers").and_then(|v| v.as_object());
    let model_headers = model_obj.and_then(|obj| obj.get("headers").and_then(|v| v.as_object()));
    let mut base_headers = parse_headers_json(provider_headers, model_headers)?;
    base_headers
        .entry(CONTENT_TYPE)
        .or_insert_with(|| HeaderValue::from_static("application/json"));

    if auth_header && !resolved_api_key.is_empty() {
        let bearer = format!("Bearer {resolved_api_key}");
        let value = HeaderValue::from_str(&bearer)
            .map_err(|e| format!("Invalid authorization header value: {e}"))?;
        base_headers.insert(HeaderName::from_static("authorization"), value);
    }

    if api == "anthropic-messages" && !resolved_api_key.is_empty() {
        let key_value = HeaderValue::from_str(&resolved_api_key)
            .map_err(|e| format!("Invalid x-api-key header value: {e}"))?;
        base_headers
            .entry(HeaderName::from_static("x-api-key"))
            .or_insert(key_value);
    }

    let prompt_text = prompt.unwrap_or_else(|| {
        "Reply with a concise health-check response that includes the word ok.".to_string()
    });

    let attempts = match api.as_str() {
        "openai-completions" => build_openai_chat_attempts(&base_url, &model, &prompt_text),
        "openai-responses" => build_openai_responses_attempts(&base_url, &model, &prompt_text),
        "anthropic-messages" => build_anthropic_messages_attempts(&base_url, &model, &prompt_text),
        "google-generative-ai" => {
            return Err(
                "google-generative-ai testing is not supported yet in model HTTP tester"
                    .to_string(),
            )
        }
        other => return Err(format!("Unsupported api type for HTTP test: {other}")),
    };

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(20_000).clamp(1_000, 120_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Create HTTP client failed: {e}"))?;

    let mut last_result: Option<ModelHttpTestResult> = None;

    for (index, attempt) in attempts.iter().enumerate() {
        let mut headers = base_headers.clone();
        for (name, value) in &attempt.extra_headers {
            headers.entry(name.clone()).or_insert(value.clone());
        }

        let request_body = serde_json::to_string_pretty(&attempt.body_value)
            .map_err(|e| format!("Serialize HTTP test request body: {e}"))?;
        let curl_command = build_masked_curl_command(&attempt.url, &headers, &request_body);

        let start = Instant::now();
        let response_result = client
            .post(&attempt.url)
            .headers(headers)
            .json(&attempt.body_value)
            .send()
            .await;
        let latency_ms = start.elapsed().as_millis() as u64;

        let result = match response_result {
            Ok(response) => {
                let status = response.status();
                let response_text = response.text().await.unwrap_or_default();
                let response_preview = extract_response_preview(&api, &response_text);
                let response_body = truncate_response_body(&response_text);
                let error = if status.is_success() {
                    None
                } else {
                    let detail = extract_error_message(&response_text)
                        .unwrap_or_else(|| format!("HTTP status {}", status.as_u16()));
                    Some(format!("{}: {}", attempt.request_style, detail))
                };

                ModelHttpTestResult {
                    provider: provider.clone(),
                    model: model.clone(),
                    api: api.clone(),
                    method: "POST".to_string(),
                    url: attempt.url.clone(),
                    status_code: Some(status.as_u16()),
                    ok: status.is_success(),
                    latency_ms,
                    curl_command,
                    request_body,
                    request_style: attempt.request_style.to_string(),
                    response_preview,
                    attempt_count: (index + 1) as u8,
                    used_fallback: index > 0,
                    response_body,
                    error,
                }
            }
            Err(err) => ModelHttpTestResult {
                provider: provider.clone(),
                model: model.clone(),
                api: api.clone(),
                method: "POST".to_string(),
                url: attempt.url.clone(),
                status_code: None,
                ok: false,
                latency_ms,
                curl_command,
                request_body,
                request_style: attempt.request_style.to_string(),
                response_preview: None,
                attempt_count: (index + 1) as u8,
                used_fallback: index > 0,
                response_body: String::new(),
                error: Some(err.to_string()),
            },
        };

        let should_retry = api == "openai-completions"
            && !result.ok
            && index + 1 < attempts.len()
            && matches!(result.status_code, Some(400) | Some(404) | Some(422) | None);

        if result.ok || !should_retry {
            return Ok(result);
        }

        last_result = Some(result);
    }

    last_result.ok_or_else(|| "No HTTP test attempt was generated".to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_model_http(
    provider: String,
    model: String,
    prompt: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<ModelHttpTestResult, String> {
    test_model_http_internal(provider, model, prompt, timeout_ms).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openai_reasoning_models_prefer_max_completion_tokens() {
        let attempts = build_openai_chat_attempts("https://api.openai.com/v1", "gpt-5", "hello");
        assert_eq!(attempts.len(), 2);
        assert_eq!(
            attempts[0].request_style,
            "chat-completions:max_completion_tokens"
        );
        assert_eq!(
            attempts[0].body_value["max_completion_tokens"],
            Value::from(256)
        );
        assert!(attempts[0].body_value.get("max_tokens").is_none());
        assert_eq!(attempts[1].request_style, "chat-completions:max_tokens");
        assert_eq!(attempts[1].body_value["max_tokens"], Value::from(128));
    }

    #[test]
    fn openai_responses_uses_input_text_payload() {
        let attempts =
            build_openai_responses_attempts("https://api.openai.com/v1", "gpt-5", "ping");
        assert_eq!(attempts.len(), 2);
        assert_eq!(attempts[0].request_style, "responses:input_string");
        assert_eq!(attempts[0].url, "https://api.openai.com/v1/responses");
        assert_eq!(attempts[0].body_value["input"], Value::from("ping"));
        assert_eq!(attempts[1].request_style, "responses:input_message_items");
        assert_eq!(
            attempts[1].body_value["input"][0]["role"],
            Value::from("user")
        );
        assert_eq!(
            attempts[1].body_value["input"][0]["content"][0]["type"],
            Value::from("input_text")
        );
        assert_eq!(
            attempts[1].body_value["input"][0]["content"][0]["text"],
            Value::from("ping")
        );
    }

    #[test]
    fn anthropic_attempt_sets_messages_shape_and_header() {
        let attempts = build_anthropic_messages_attempts(
            "https://api.anthropic.com/v1",
            "claude-sonnet-4",
            "ping",
        );
        assert_eq!(attempts.len(), 2);
        assert_eq!(
            attempts[0].request_style,
            "anthropic-messages:string_content"
        );
        assert_eq!(attempts[0].url, "https://api.anthropic.com/v1/messages");
        assert_eq!(
            attempts[0].body_value["messages"][0]["role"],
            Value::from("user")
        );
        assert_eq!(
            attempts[0].body_value["messages"][0]["content"],
            Value::from("ping")
        );
        assert_eq!(
            attempts[1].request_style,
            "anthropic-messages:content_blocks"
        );
        assert_eq!(
            attempts[1].body_value["messages"][0]["content"][0]["type"],
            Value::from("text")
        );
        assert_eq!(
            attempts[1].body_value["messages"][0]["content"][0]["text"],
            Value::from("ping")
        );
        assert_eq!(attempts[0].extra_headers.len(), 1);
        assert_eq!(
            attempts[0].extra_headers[0].0,
            HeaderName::from_static("anthropic-version")
        );
        assert_eq!(
            attempts[0].extra_headers[0].1,
            HeaderValue::from_static("2023-06-01")
        );
    }

    #[test]
    fn response_preview_extracts_known_shapes() {
        let openai_chat = r#"{"choices":[{"message":{"content":"ok from chat"}}]}"#;
        let openai_responses = r#"{"output_text":"ok from responses"}"#;
        let anthropic = r#"{"content":[{"type":"text","text":"ok from anthropic"}]}"#;

        assert_eq!(
            extract_response_preview("openai-completions", openai_chat),
            Some("ok from chat".to_string())
        );
        assert_eq!(
            extract_response_preview("openai-responses", openai_responses),
            Some("ok from responses".to_string())
        );
        assert_eq!(
            extract_response_preview("anthropic-messages", anthropic),
            Some("ok from anthropic".to_string())
        );
    }
}
