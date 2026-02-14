use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SkillInfo {
    pub name: String,
    pub path: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PromptInfo {
    pub name: String,
    pub path: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PiSettings {
    pub skills: Vec<String>,
    pub prompts: Vec<String>,
    pub extensions: Vec<String>,
}

// --- Pi Config TUI aligned types ---

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMetadata {
    pub source: String,
    pub scope: String,
    pub origin: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResourceInfo {
    pub name: String,
    pub path: String,
    pub description: String,
    pub enabled: bool,
    pub resource_type: String,
    pub metadata: ResourceMetadata,
}

pub async fn scan_skills_internal() -> Result<Vec<SkillInfo>, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let skills_dir = home_dir.join(".pi/agent/skills");

    let mut skills = Vec::new();

    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let skill_md = path.join("SKILL.md");
                let has_skill_md = skill_md.exists();

                let description = if has_skill_md {
                    fs::read_to_string(&skill_md)
                        .ok()
                        .and_then(|content| content.lines().next().map(|s| s.to_string()))
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                skills.push(SkillInfo {
                    name: name.clone(),
                    path: format!("skills/{name}/SKILL.md"),
                    description,
                    enabled: true,
                });
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_skills() -> Result<Vec<SkillInfo>, String> {
    scan_skills_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_skill_content(skill_name: String) -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let skill_md_path = home_dir
        .join(".pi/agent/skills")
        .join(&skill_name)
        .join("SKILL.md");

    fs::read_to_string(&skill_md_path).map_err(|e| format!("Failed to read skill content: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_prompt_content(prompt_name: String) -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let prompt_md_path = home_dir
        .join(".pi/agent/prompts")
        .join(format!("{prompt_name}.md"));

    fs::read_to_string(&prompt_md_path).map_err(|e| format!("Failed to read prompt content: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_system_prompt() -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let system_prompt_path = home_dir.join(".pi/agent/APPEND_SYSTEM.md");

    if !system_prompt_path.exists() {
        let default_prompt = home_dir.join(".pi/agent/prompts/default.md");
        if default_prompt.exists() {
            return fs::read_to_string(&default_prompt)
                .map_err(|e| format!("Failed to read default prompt: {e}"));
        }
        return Ok(String::new());
    }

    fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {e}"))
}

/// Extract system prompt from a specific session via pi --export.
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_system_prompt(path: String) -> Result<String, String> {
    crate::export::extract_system_prompt(&path)
}

pub async fn get_session_system_prompt_internal(path: String) -> Result<String, String> {
    crate::export::extract_system_prompt(&path)
}

pub async fn scan_prompts_internal() -> Result<Vec<PromptInfo>, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let prompts_dir = home_dir.join(".pi/agent/prompts");

    let mut prompts = Vec::new();

    if let Ok(entries) = fs::read_dir(&prompts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "md") {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let description = fs::read_to_string(&path)
                    .ok()
                    .and_then(|content| {
                        content
                            .lines()
                            .next()
                            .map(|s| s.trim_start_matches("# ").to_string())
                    })
                    .unwrap_or_default();

                prompts.push(PromptInfo {
                    name: name.trim_end_matches(".md").to_string(),
                    path: format!("prompts/{name}"),
                    description,
                    enabled: true,
                });
            }
        }
    }

    prompts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(prompts)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_prompts() -> Result<Vec<PromptInfo>, String> {
    scan_prompts_internal().await
}

pub async fn load_pi_settings_internal() -> Result<PiSettings, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    if !settings_path.exists() {
        return Ok(PiSettings {
            skills: Vec::new(),
            prompts: Vec::new(),
            extensions: Vec::new(),
        });
    }

    let content =
        fs::read_to_string(&settings_path).map_err(|e| format!("Failed to read settings: {e}"))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))?;

    let skills = json
        .get("skills")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let prompts = json
        .get("prompts")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let extensions = json
        .get("extensions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(PiSettings {
        skills,
        prompts,
        extensions,
    })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_pi_settings() -> Result<PiSettings, String> {
    load_pi_settings_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_pi_settings(settings: PiSettings) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    let mut json: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))?
    } else {
        serde_json::json!({})
    };

    json["skills"] = serde_json::json!(settings.skills);
    json["prompts"] = serde_json::json!(settings.prompts);
    json["extensions"] = serde_json::json!(settings.extensions);

    let content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;

    fs::write(&settings_path, content).map_err(|e| format!("Failed to write settings: {e}"))?;

    Ok(())
}

// --- scan_all_resources ---

/// Read settings.json from a given path and extract the string arrays for each resource type.
fn read_settings_arrays(settings_path: &Path) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    let empty = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let content = match fs::read_to_string(settings_path) {
        Ok(c) => c,
        Err(_) => return empty,
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return empty,
    };
    let extract = |key: &str| -> Vec<String> {
        json.get(key)
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default()
    };
    (extract("skills"), extract("extensions"), extract("prompts"), extract("themes"))
}

/// Check if a resource path is enabled based on settings.json +/- prefix convention.
/// - `-path` in the list → disabled
/// - `+path` or `path` in the list → enabled
/// - not in the list at all → enabled (default)
fn is_resource_enabled(settings_list: &[String], relative_path: &str) -> bool {
    for entry in settings_list {
        let (prefix, path) = if let Some(rest) = entry.strip_prefix('-') {
            ('-', rest)
        } else if let Some(rest) = entry.strip_prefix('+') {
            ('+', rest)
        } else {
            (' ', entry.as_str())
        };
        if path == relative_path {
            return prefix != '-';
        }
    }
    true // not in list = enabled
}

/// Scan a directory for skills (subdirectories with SKILL.md).
/// Extract a field value from YAML frontmatter (between `---` fences).
/// Handles both single-line (`description: "text"`) and multi-line (`description: >\n  text`) forms.
fn extract_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let mut lines = content.lines();
    // Must start with ---
    if lines.next().map(|l| l.trim()) != Some("---") {
        return None;
    }
    let mut in_target = false;
    let mut value_parts: Vec<String> = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if in_target {
            // Continuation line: must be indented
            if line.starts_with(' ') || line.starts_with('\t') {
                value_parts.push(trimmed.to_string());
            } else {
                break;
            }
        } else if let Some(rest) = trimmed.strip_prefix(&format!("{field}:")) {
            let rest = rest.trim();
            if rest == ">" || rest == "|" {
                // Multi-line block scalar
                in_target = true;
            } else if rest.is_empty() {
                in_target = true;
            } else {
                // Single-line value, strip surrounding quotes
                let val = rest.trim_matches('"').trim_matches('\'');
                return Some(val.to_string());
            }
        }
    }

    if value_parts.is_empty() {
        None
    } else {
        Some(value_parts.join(" "))
    }
}

fn scan_skills_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if name.starts_with('.') {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        let description = if skill_md.exists() {
            fs::read_to_string(&skill_md)
                .ok()
                .and_then(|c| extract_frontmatter_field(&c, "description"))
                .unwrap_or_default()
        } else {
            String::new()
        };
        let relative = format!("skills/{name}/SKILL.md");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo {
            name,
            path: relative,
            description,
            enabled,
            resource_type: "skills".to_string(),
            metadata: ResourceMetadata {
                source: "auto".to_string(),
                scope: scope.to_string(),
                origin: "top-level".to_string(),
            },
        });
    }
    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

/// Scan a directory for extensions (.ts/.js files and directories with index.ts/index.js).
fn scan_extensions_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if file_name.starts_with('.') || file_name == "README.md" || file_name == "CHANGELOG.md" {
            continue;
        }
        let is_ext_file = path.is_file()
            && (file_name.ends_with(".ts") || file_name.ends_with(".js"));
        let is_ext_dir = path.is_dir()
            && (path.join("index.ts").exists() || path.join("index.js").exists());
        if !is_ext_file && !is_ext_dir {
            continue;
        }
        let relative = format!("extensions/{file_name}");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo {
            name: file_name,
            path: relative,
            description: String::new(),
            enabled,
            resource_type: "extensions".to_string(),
            metadata: ResourceMetadata {
                source: "auto".to_string(),
                scope: scope.to_string(),
                origin: "top-level".to_string(),
            },
        });
    }
    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

/// Scan a directory for prompts (.md files).
fn scan_prompts_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if !file_name.ends_with(".md") || file_name.starts_with('.') {
            continue;
        }
        let name = file_name.trim_end_matches(".md").to_string();
        let description = fs::read_to_string(&path)
            .ok()
            .and_then(|c| c.lines().next().map(|s| s.trim().trim_start_matches("# ").to_string()))
            .unwrap_or_default();
        let relative = format!("prompts/{file_name}");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo {
            name,
            path: relative,
            description,
            enabled,
            resource_type: "prompts".to_string(),
            metadata: ResourceMetadata {
                source: "auto".to_string(),
                scope: scope.to_string(),
                origin: "top-level".to_string(),
            },
        });
    }
    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

/// Scan a directory for themes (.json or directories).
fn scan_themes_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if file_name.starts_with('.') {
            continue;
        }
        let is_theme = (path.is_file() && file_name.ends_with(".json")) || path.is_dir();
        if !is_theme {
            continue;
        }
        let relative = format!("themes/{file_name}");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo {
            name: file_name,
            path: relative,
            description: String::new(),
            enabled,
            resource_type: "themes".to_string(),
            metadata: ResourceMetadata {
                source: "auto".to_string(),
                scope: scope.to_string(),
                origin: "top-level".to_string(),
            },
        });
    }
    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

/// Unified resource scanner: scans user + project scopes for all 4 resource types.
pub async fn scan_all_resources_internal(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let user_base = home_dir.join(".pi/agent");
    let user_settings_path = user_base.join("settings.json");

    // Read user-scope settings
    let (user_skills_cfg, user_ext_cfg, user_prompts_cfg, user_themes_cfg) =
        read_settings_arrays(&user_settings_path);

    let mut all: Vec<ResourceInfo> = Vec::new();

    // User scope
    all.extend(scan_skills_dir(&user_base.join("skills"), "user", &user_skills_cfg));
    all.extend(scan_extensions_dir(&user_base.join("extensions"), "user", &user_ext_cfg));
    all.extend(scan_prompts_dir(&user_base.join("prompts"), "user", &user_prompts_cfg));
    all.extend(scan_themes_dir(&user_base.join("themes"), "user", &user_themes_cfg));

    // Project scope (if cwd provided)
    if let Some(cwd_str) = cwd {
        let project_base = PathBuf::from(&cwd_str).join(".pi");
        if project_base.exists() {
            let project_settings_path = project_base.join("settings.json");
            let (proj_skills_cfg, proj_ext_cfg, proj_prompts_cfg, proj_themes_cfg) =
                read_settings_arrays(&project_settings_path);

            all.extend(scan_skills_dir(&project_base.join("skills"), "project", &proj_skills_cfg));
            all.extend(scan_extensions_dir(&project_base.join("extensions"), "project", &proj_ext_cfg));
            all.extend(scan_prompts_dir(&project_base.join("prompts"), "project", &proj_prompts_cfg));
            all.extend(scan_themes_dir(&project_base.join("themes"), "project", &proj_themes_cfg));
        }
    }

    Ok(all)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_all_resources(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    scan_all_resources_internal(cwd).await
}

// --- Pi Settings Full (task-2) ---

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompactionSettings {
    pub enabled: Option<bool>,
    pub reserve_tokens: Option<u32>,
    pub keep_recent_tokens: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RetrySettings {
    pub enabled: Option<bool>,
    pub max_retries: Option<u32>,
    pub base_delay_ms: Option<u32>,
    pub max_delay_ms: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    pub show_images: Option<bool>,
    pub clear_on_shrink: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImagesSettings {
    pub auto_resize: Option<bool>,
    pub block_images: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSettings {
    pub code_block_indent: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummarySettings {
    pub reserve_tokens: Option<u32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PiSettingsFull {
    // Model
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
    pub default_thinking_level: Option<String>,
    pub enabled_models: Option<Vec<String>>,
    // Behavior
    pub steering_mode: Option<String>,
    pub follow_up_mode: Option<String>,
    pub hide_thinking_block: Option<bool>,
    pub quiet_startup: Option<bool>,
    pub collapse_changelog: Option<bool>,
    pub enable_skill_commands: Option<bool>,
    pub double_escape_action: Option<String>,
    pub shell_path: Option<String>,
    pub shell_command_prefix: Option<String>,
    // Nested objects
    #[serde(default)]
    pub compaction: Option<CompactionSettings>,
    #[serde(default)]
    pub retry: Option<RetrySettings>,
    #[serde(default)]
    pub terminal: Option<TerminalSettings>,
    #[serde(default)]
    pub images: Option<ImagesSettings>,
    #[serde(default)]
    pub markdown: Option<MarkdownSettings>,
    #[serde(default)]
    pub branch_summary: Option<BranchSummarySettings>,
    // Appearance
    pub theme: Option<String>,
    pub show_hardware_cursor: Option<bool>,
    pub editor_padding_x: Option<u8>,
    pub autocomplete_max_visible: Option<u8>,
    // Resources
    #[serde(default)]
    pub packages: Vec<serde_json::Value>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub prompts: Vec<String>,
    #[serde(default)]
    pub themes: Vec<String>,
}

fn settings_path_for_scope(scope: &str) -> Result<PathBuf, String> {
    match scope {
        "project" => {
            let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {e}"))?;
            Ok(cwd.join(".pi/settings.json"))
        }
        _ => {
            let home = dirs::home_dir().ok_or("Failed to get home directory")?;
            Ok(home.join(".pi/agent/settings.json"))
        }
    }
}

fn read_settings_json(path: &Path) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))
}

fn write_settings_json(path: &Path, json: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(json)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(path, &content).map_err(|e| format!("Failed to write settings: {e}"))?;

    // Auto-snapshot after every write
    let path_str = path.to_string_lossy().to_string();
    if let Err(e) = save_config_snapshot(&path_str, &content) {
        eprintln!("Warning: failed to save config snapshot: {e}");
    }
    Ok(())
}

pub async fn load_pi_settings_full_internal() -> Result<PiSettingsFull, String> {
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let path = home.join(".pi/agent/settings.json");
    if !path.exists() {
        return Ok(PiSettingsFull::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_pi_settings_full() -> Result<PiSettingsFull, String> {
    load_pi_settings_full_internal().await
}

/// Single-field safe write: read → merge one key → write back.
pub async fn save_pi_setting_internal(key: String, value: serde_json::Value) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Failed to get home directory")?;
    let path = home.join(".pi/agent/settings.json");
    let mut json = read_settings_json(&path)?;

    // Support dot-notation for nested keys (e.g. "compaction.enabled")
    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() == 1 {
        json[&key] = value;
    } else {
        let mut target = &mut json;
        for part in &parts[..parts.len() - 1] {
            if !target.get(*part).is_some_and(|v| v.is_object()) {
                target[*part] = serde_json::json!({});
            }
            target = target.get_mut(*part).unwrap();
        }
        target[*parts.last().unwrap()] = value;
    }

    write_settings_json(&path, &json)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn save_pi_setting(key: String, value: serde_json::Value) -> Result<(), String> {
    save_pi_setting_internal(key, value).await
}

/// Toggle a resource's enabled state via +/- prefix in settings.json.
pub async fn toggle_resource_internal(
    resource_type: String,
    path: String,
    enabled: bool,
    scope: String,
) -> Result<(), String> {
    let settings_path = settings_path_for_scope(&scope)?;
    let mut json = read_settings_json(&settings_path)?;

    let arr = json
        .get(&resource_type)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // Remove any existing entry for this path (with or without +/- prefix)
    let mut new_arr: Vec<String> = arr
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .filter(|entry| {
            let clean = entry.trim_start_matches('+').trim_start_matches('-');
            clean != path
        })
        .collect();

    // Add the new entry with appropriate prefix
    if enabled {
        new_arr.push(format!("+{path}"));
    } else {
        new_arr.push(format!("-{path}"));
    }

    json[&resource_type] = serde_json::json!(new_arr);
    write_settings_json(&settings_path, &json)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn toggle_resource(
    resource_type: String,
    path: String,
    enabled: bool,
    scope: String,
) -> Result<(), String> {
    toggle_resource_internal(resource_type, path, enabled, scope).await
}

// ─── Model Options ───────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub provider: String,
    pub model: String,
}

/// Quick read from ~/.pi/agent/models.json (instant, config-only models)
/// Read a resource file's content by its relative path and scope.
pub async fn read_resource_file_internal(path: String, scope: String) -> Result<String, String> {
    let base = match scope.as_str() {
        "project" => {
            let cwd = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
            cwd.join(".pi")
        }
        _ => {
            let home = dirs::home_dir().ok_or("No home dir")?;
            home.join(".pi/agent")
        }
    };
    let full = base.join(&path);
    // Security: ensure resolved path is under base
    let canonical = full.canonicalize().map_err(|e| format!("Resolve path: {e}"))?;
    let base_canonical = base.canonicalize().unwrap_or(base);
    if !canonical.starts_with(&base_canonical) {
        return Err("Path traversal denied".into());
    }
    fs::read_to_string(&canonical).map_err(|e| format!("Read {path}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_resource_file(path: String, scope: String) -> Result<String, String> {
    read_resource_file_internal(path, scope).await
}

pub async fn list_model_options_fast_internal() -> Result<Vec<ModelOption>, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    let path = home.join(".pi/agent/models.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("Read models.json: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Parse models.json: {e}"))?;

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
    options.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.model.cmp(&b.model)));
    Ok(options)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_fast() -> Result<Vec<ModelOption>, String> {
    list_model_options_fast_internal().await
}

/// Full model list via `pi --list-models` (slower, includes login-based models)
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
        // Format: "provider            model                                context  ..."
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            options.push(ModelOption {
                provider: parts[0].to_string(),
                model: parts[1].to_string(),
            });
        }
    }
    options.sort_by(|a, b| a.provider.cmp(&b.provider).then(a.model.cmp(&b.model)));
    Ok(options)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_model_options_full() -> Result<Vec<ModelOption>, String> {
    list_model_options_full_internal().await
}

// ─── Config Version History ──────────────────────────────────────────────────

const MAX_CONFIG_VERSIONS: usize = 50;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigVersion {
    pub id: i64,
    pub file_path: String,
    pub content: String,
    pub created_at: String,
    pub size_bytes: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConfigVersionMeta {
    pub id: i64,
    pub file_path: String,
    pub created_at: String,
    pub size_bytes: usize,
}

fn get_config_db() -> Result<rusqlite::Connection, String> {
    let db_path = crate::sqlite_cache::get_db_path()?;
    let conn =
        rusqlite::Connection::open(&db_path).map_err(|e| format!("Open config DB: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS config_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            size_bytes INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cv_file_path ON config_versions(file_path);
        CREATE INDEX IF NOT EXISTS idx_cv_created ON config_versions(created_at DESC);",
    )
    .map_err(|e| format!("Init config_versions table: {e}"))?;
    Ok(conn)
}

fn save_config_snapshot(file_path: &str, content: &str) -> Result<(), String> {
    let conn = get_config_db()?;
    let size = content.len();

    conn.execute(
        "INSERT INTO config_versions (file_path, content, size_bytes) VALUES (?1, ?2, ?3)",
        rusqlite::params![file_path, content, size],
    )
    .map_err(|e| format!("Insert snapshot: {e}"))?;

    // Prune: keep only the latest MAX_CONFIG_VERSIONS per file_path
    conn.execute(
        "DELETE FROM config_versions WHERE file_path = ?1 AND id NOT IN (
            SELECT id FROM config_versions WHERE file_path = ?1
            ORDER BY id DESC LIMIT ?2
        )",
        rusqlite::params![file_path, MAX_CONFIG_VERSIONS],
    )
    .map_err(|e| format!("Prune snapshots: {e}"))?;

    Ok(())
}

pub async fn list_config_versions_internal(
    file_path: Option<String>,
) -> Result<Vec<ConfigVersionMeta>, String> {
    let conn = get_config_db()?;
    let mut stmt = if let Some(ref fp) = file_path {
        let mut s = conn
            .prepare(
                "SELECT id, file_path, created_at, size_bytes FROM config_versions
                 WHERE file_path = ?1 ORDER BY id DESC LIMIT ?2",
            )
            .map_err(|e| format!("Prepare: {e}"))?;
        let rows = s
            .query_map(rusqlite::params![fp, MAX_CONFIG_VERSIONS], |row| {
                Ok(ConfigVersionMeta {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    created_at: row.get(2)?,
                    size_bytes: row.get(3)?,
                })
            })
            .map_err(|e| format!("Query: {e}"))?;
        return rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Collect: {e}"));
    } else {
        conn.prepare(
            "SELECT id, file_path, created_at, size_bytes FROM config_versions
             ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| format!("Prepare: {e}"))?
    };
    let rows = stmt
        .query_map(rusqlite::params![MAX_CONFIG_VERSIONS], |row| {
            Ok(ConfigVersionMeta {
                id: row.get(0)?,
                file_path: row.get(1)?,
                created_at: row.get(2)?,
                size_bytes: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Collect: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_config_versions(
    file_path: Option<String>,
) -> Result<Vec<ConfigVersionMeta>, String> {
    list_config_versions_internal(file_path).await
}

pub async fn get_config_version_internal(id: i64) -> Result<ConfigVersion, String> {
    let conn = get_config_db()?;
    conn.query_row(
        "SELECT id, file_path, content, created_at, size_bytes FROM config_versions WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(ConfigVersion {
                id: row.get(0)?,
                file_path: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                size_bytes: row.get(4)?,
            })
        },
    )
    .map_err(|e| format!("Get version {id}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_config_version(id: i64) -> Result<ConfigVersion, String> {
    get_config_version_internal(id).await
}

pub async fn restore_config_version_internal(id: i64) -> Result<(), String> {
    let version = get_config_version_internal(id).await?;
    let path = PathBuf::from(&version.file_path);

    // Save current state as a snapshot before restoring
    if path.exists() {
        let current = fs::read_to_string(&path).map_err(|e| format!("Read current: {e}"))?;
        save_config_snapshot(&version.file_path, &current)?;
    }

    // Write the restored content
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create dir: {e}"))?;
    }
    fs::write(&path, &version.content).map_err(|e| format!("Write restored: {e}"))?;
    Ok(())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn restore_config_version(id: i64) -> Result<(), String> {
    restore_config_version_internal(id).await
}
