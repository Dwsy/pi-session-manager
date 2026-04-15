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

fn pi_agent_dir() -> Result<PathBuf, String> {
    crate::paths::pi_agent_root_dir().map_err(|e| format!("Failed to get home directory: {e}"))
}

fn skill_markdown_path(skill_name: &str) -> Result<PathBuf, String> {
    Ok(pi_agent_dir()?
        .join("skills")
        .join(skill_name)
        .join("SKILL.md"))
}

fn prompt_markdown_path(prompt_name: &str) -> Result<PathBuf, String> {
    Ok(pi_agent_dir()?
        .join("prompts")
        .join(format!("{prompt_name}.md")))
}

fn read_first_line(path: &Path, trim_prefix: Option<&str>) -> String {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| content.lines().next().map(str::to_string))
        .map(|line| match trim_prefix {
            Some(prefix) => line.trim_start_matches(prefix).to_string(),
            None => line,
        })
        .unwrap_or_default()
}

pub async fn scan_skills_internal() -> Result<Vec<SkillInfo>, String> {
    let skills_dir = pi_agent_dir()?.join("skills");
    let mut skills = Vec::new();

    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let skill_md = path.join("SKILL.md");
            let description = if skill_md.exists() {
                read_first_line(&skill_md, None)
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

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_skills() -> Result<Vec<SkillInfo>, String> {
    scan_skills_internal().await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_skill_content(skill_name: String) -> Result<String, String> {
    let skill_md_path = skill_markdown_path(&skill_name)?;
    fs::read_to_string(&skill_md_path).map_err(|e| format!("Failed to read skill content: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_prompt_content(prompt_name: String) -> Result<String, String> {
    let prompt_md_path = prompt_markdown_path(&prompt_name)?;
    fs::read_to_string(&prompt_md_path).map_err(|e| format!("Failed to read prompt content: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_system_prompt() -> Result<String, String> {
    let system_prompt_path = pi_agent_dir()?.join("APPEND_SYSTEM.md");

    if !system_prompt_path.exists() {
        let default_prompt = prompt_markdown_path("default")?;
        if default_prompt.exists() {
            return fs::read_to_string(&default_prompt)
                .map_err(|e| format!("Failed to read default prompt: {e}"));
        }
        return Ok(String::new());
    }

    fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_system_prompt(path: String) -> Result<String, String> {
    crate::export::extract_system_prompt(&path)
}

pub async fn get_session_system_prompt_internal(path: String) -> Result<String, String> {
    crate::export::extract_system_prompt(&path)
}

pub async fn scan_prompts_internal() -> Result<Vec<PromptInfo>, String> {
    let prompts_dir = pi_agent_dir()?.join("prompts");
    let mut prompts = Vec::new();

    if let Ok(entries) = fs::read_dir(&prompts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            prompts.push(PromptInfo {
                name: name.trim_end_matches(".md").to_string(),
                path: format!("prompts/{name}"),
                description: read_first_line(&path, Some("# ")),
                enabled: true,
            });
        }
    }

    prompts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(prompts)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_prompts() -> Result<Vec<PromptInfo>, String> {
    scan_prompts_internal().await
}

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

fn read_settings_arrays(
    settings_path: &Path,
) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    let empty = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let content = match fs::read_to_string(settings_path) {
        Ok(c) => c,
        Err(_) => return empty,
    };
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return empty,
    };
    (
        extract_settings_array(&json, "skills"),
        extract_settings_array(&json, "extensions"),
        extract_settings_array(&json, "prompts"),
        extract_settings_array(&json, "themes"),
    )
}

fn extract_settings_array(json: &serde_json::Value, key: &str) -> Vec<String> {
    json.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

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
    true
}

fn extract_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let mut lines = content.lines();
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
            if line.starts_with(' ') || line.starts_with('\t') {
                value_parts.push(trimmed.to_string());
            } else {
                break;
            }
        } else if let Some(rest) = trimmed.strip_prefix(&format!("{field}:")) {
            let rest = rest.trim();
            if rest == ">" || rest == "|" || rest.is_empty() {
                in_target = true;
            } else {
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
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
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

fn scan_extensions_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if file_name.starts_with('.') || file_name == "README.md" || file_name == "CHANGELOG.md" {
            continue;
        }
        let is_ext_file =
            path.is_file() && (file_name.ends_with(".ts") || file_name.ends_with(".js"));
        let is_ext_dir =
            path.is_dir() && (path.join("index.ts").exists() || path.join("index.js").exists());
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
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if !file_name.ends_with(".md") || file_name.starts_with('.') {
            continue;
        }
        let name = file_name.trim_end_matches(".md").to_string();
        let description = fs::read_to_string(&path)
            .ok()
            .and_then(|c| {
                c.lines()
                    .next()
                    .map(|s| s.trim().trim_start_matches("# ").to_string())
            })
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

fn scan_themes_dir(dir: &Path, scope: &str, settings_list: &[String]) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
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

pub async fn scan_all_resources_internal(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let user_base = crate::paths::pi_agent_root_dir()
        .map_err(|e| format!("Failed to get home directory: {e}"))?;
    let user_settings_path = user_base.join("settings.json");

    let (user_skills_cfg, user_ext_cfg, user_prompts_cfg, user_themes_cfg) =
        read_settings_arrays(&user_settings_path);

    let mut all: Vec<ResourceInfo> = Vec::new();

    all.extend(scan_skills_dir(
        &user_base.join("skills"),
        "user",
        &user_skills_cfg,
    ));
    all.extend(scan_extensions_dir(
        &user_base.join("extensions"),
        "user",
        &user_ext_cfg,
    ));
    all.extend(scan_prompts_dir(
        &user_base.join("prompts"),
        "user",
        &user_prompts_cfg,
    ));
    all.extend(scan_themes_dir(
        &user_base.join("themes"),
        "user",
        &user_themes_cfg,
    ));

    if let Some(cwd_str) = cwd {
        let project_base = crate::paths::project_pi_dir(&PathBuf::from(&cwd_str));
        if project_base.exists() {
            let project_settings_path = project_base.join("settings.json");
            let (proj_skills_cfg, proj_ext_cfg, proj_prompts_cfg, proj_themes_cfg) =
                read_settings_arrays(&project_settings_path);

            all.extend(scan_skills_dir(
                &project_base.join("skills"),
                "project",
                &proj_skills_cfg,
            ));
            all.extend(scan_extensions_dir(
                &project_base.join("extensions"),
                "project",
                &proj_ext_cfg,
            ));
            all.extend(scan_prompts_dir(
                &project_base.join("prompts"),
                "project",
                &proj_prompts_cfg,
            ));
            all.extend(scan_themes_dir(
                &project_base.join("themes"),
                "project",
                &proj_themes_cfg,
            ));
        }
    }

    Ok(all)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_all_resources(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    scan_all_resources_internal(cwd).await
}

fn resource_base_dir(scope: &str) -> Result<PathBuf, String> {
    match scope {
        "project" => {
            let cwd = std::env::current_dir().map_err(|e| format!("cwd: {e}"))?;
            Ok(crate::paths::project_pi_dir(&cwd))
        }
        _ => crate::paths::pi_agent_root_dir().map_err(|e| format!("No home dir: {e}")),
    }
}

pub async fn read_resource_file_internal(path: String, scope: String) -> Result<String, String> {
    let base = resource_base_dir(&scope)?;
    let full = base.join(&path);
    let canonical = full
        .canonicalize()
        .map_err(|e| format!("Resolve path: {e}"))?;
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
