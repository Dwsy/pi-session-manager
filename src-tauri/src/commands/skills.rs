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
    Ok(pi_agent_dir()?.join("skills").join(skill_name).join("SKILL.md"))
}

fn prompt_markdown_path(prompt_name: &str) -> Result<PathBuf, String> {
    Ok(pi_agent_dir()?.join("prompts").join(format!("{prompt_name}.md")))
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

            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown").to_string();
            let skill_md = path.join("SKILL.md");
            let description = if skill_md.exists() { fs::read_to_string(&skill_md).ok().and_then(|content| extract_frontmatter_field(&content, "description")).or_else(|| Some(read_first_line(&skill_md, None))).unwrap_or_default() } else { String::new() };

            skills.push(SkillInfo { name: name.clone(), path: format!("skills/{name}/SKILL.md"), description, enabled: true });
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
            return fs::read_to_string(&default_prompt).map_err(|e| format!("Failed to read default prompt: {e}"));
        }
        return Ok(String::new());
    }

    fs::read_to_string(&system_prompt_path).map_err(|e| format!("Failed to read system prompt: {e}"))
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

            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown").to_string();

            prompts.push(PromptInfo { name: name.trim_end_matches(".md").to_string(), path: format!("prompts/{name}"), description: read_first_line(&path, Some("# ")), enabled: true });
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
    /// Absolute package root for package resources; None for top-level.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_dir: Option<String>,
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
    (extract_settings_array(&json, "skills"), extract_settings_array(&json, "extensions"), extract_settings_array(&json, "prompts"), extract_settings_array(&json, "themes"))
}

fn extract_settings_array(json: &serde_json::Value, key: &str) -> Vec<String> {
    json.get(key).and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default()
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
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if name.starts_with('.') {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        let description = if skill_md.exists() { fs::read_to_string(&skill_md).ok().and_then(|c| extract_frontmatter_field(&c, "description")).unwrap_or_default() } else { String::new() };
        let relative = format!("skills/{name}/SKILL.md");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo { name, path: relative, description, enabled, resource_type: "skills".to_string(), metadata: ResourceMetadata { source: "auto".to_string(), scope: scope.to_string(), origin: "top-level".to_string(), base_dir: None } });
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
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if file_name.starts_with('.') || file_name == "README.md" || file_name == "CHANGELOG.md" {
            continue;
        }
        let is_ext_file = path.is_file() && (file_name.ends_with(".ts") || file_name.ends_with(".js"));
        let is_ext_dir = path.is_dir() && (path.join("index.ts").exists() || path.join("index.js").exists());
        if !is_ext_file && !is_ext_dir {
            continue;
        }
        let relative = format!("extensions/{file_name}");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo { name: file_name, path: relative, description: String::new(), enabled, resource_type: "extensions".to_string(), metadata: ResourceMetadata { source: "auto".to_string(), scope: scope.to_string(), origin: "top-level".to_string(), base_dir: None } });
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
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if !file_name.ends_with(".md") || file_name.starts_with('.') {
            continue;
        }
        let name = file_name.trim_end_matches(".md").to_string();
        let description = fs::read_to_string(&path).ok().and_then(|c| c.lines().next().map(|s| s.trim().trim_start_matches("# ").to_string())).unwrap_or_default();
        let relative = format!("prompts/{file_name}");
        let enabled = is_resource_enabled(settings_list, &relative);
        results.push(ResourceInfo { name, path: relative, description, enabled, resource_type: "prompts".to_string(), metadata: ResourceMetadata { source: "auto".to_string(), scope: scope.to_string(), origin: "top-level".to_string(), base_dir: None } });
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
        results.push(ResourceInfo { name: file_name, path: relative, description: String::new(), enabled, resource_type: "themes".to_string(), metadata: ResourceMetadata { source: "auto".to_string(), scope: scope.to_string(), origin: "top-level".to_string(), base_dir: None } });
    }
    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

pub async fn scan_all_resources_internal(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let user_base = crate::paths::pi_agent_root_dir().map_err(|e| format!("Failed to get home directory: {e}"))?;
    let user_settings_path = user_base.join("settings.json");
    let user_settings = read_settings_value(&user_settings_path);

    let (user_skills_cfg, user_ext_cfg, user_prompts_cfg, user_themes_cfg) = settings_arrays_from_value(&user_settings);

    let mut all: Vec<ResourceInfo> = Vec::new();

    all.extend(scan_skills_dir(&user_base.join("skills"), "user", &user_skills_cfg));
    all.extend(scan_extensions_dir(&user_base.join("extensions"), "user", &user_ext_cfg));
    all.extend(scan_prompts_dir(&user_base.join("prompts"), "user", &user_prompts_cfg));
    all.extend(scan_themes_dir(&user_base.join("themes"), "user", &user_themes_cfg));
    all.extend(scan_packages_from_settings(&user_settings, "user", &user_base, None));

    if let Some(cwd_str) = cwd {
        let project_base = crate::paths::project_pi_dir(&PathBuf::from(&cwd_str));
        if project_base.exists() {
            let project_settings_path = project_base.join("settings.json");
            let project_settings = read_settings_value(&project_settings_path);
            let (proj_skills_cfg, proj_ext_cfg, proj_prompts_cfg, proj_themes_cfg) = settings_arrays_from_value(&project_settings);

            all.extend(scan_skills_dir(&project_base.join("skills"), "project", &proj_skills_cfg));
            all.extend(scan_extensions_dir(&project_base.join("extensions"), "project", &proj_ext_cfg));
            all.extend(scan_prompts_dir(&project_base.join("prompts"), "project", &proj_prompts_cfg));
            all.extend(scan_themes_dir(&project_base.join("themes"), "project", &proj_themes_cfg));
            all.extend(scan_packages_from_settings(&project_settings, "project", &user_base, Some(&project_base)));
        }
    }

    Ok(all)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn scan_all_resources(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    scan_all_resources_internal(cwd).await
}

fn read_settings_value(path: &Path) -> serde_json::Value {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    }
}

fn settings_arrays_from_value(json: &serde_json::Value) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    (extract_settings_array(json, "skills"), extract_settings_array(json, "extensions"), extract_settings_array(json, "prompts"), extract_settings_array(json, "themes"))
}

fn package_source_is_disabled(source: &str) -> bool {
    source.trim_start().starts_with('-')
}

fn normalize_package_source(source: &str) -> String {
    source.trim().trim_start_matches(['+', '-']).to_string()
}

fn resolve_package_install_path(source: &str, agent_dir: &Path, project_base: Option<&Path>, scope: &str) -> Option<PathBuf> {
    let source = normalize_package_source(source);
    if source.is_empty() {
        return None;
    }

    let install_root = if scope == "project" { project_base? } else { agent_dir };

    if let Some(name) = source.strip_prefix("npm:") {
        let path = install_root.join("npm").join("node_modules").join(name);
        return path.exists().then_some(path);
    }

    if let Some(rest) = source.strip_prefix("git:") {
        let path = install_root.join("git").join(rest);
        return path.exists().then_some(path);
    }

    // https://github.com/user/repo(.git)? or git@github.com:user/repo
    if let Some((host, owner, repo)) = parse_git_host_path(&source) {
        let path = install_root.join("git").join(host).join(owner).join(repo);
        if path.exists() {
            return Some(path);
        }
    }

    // local path relative to agent/project root, or absolute
    let local = if source.starts_with('/') || (source.len() > 2 && source.as_bytes()[1] == b':') { PathBuf::from(&source) } else { install_root.join(&source) };
    local.exists().then_some(local)
}

fn parse_git_host_path(source: &str) -> Option<(String, String, String)> {
    let s = source.trim().trim_end_matches('/');
    let s = s.strip_suffix(".git").unwrap_or(s);

    if let Some(rest) = s.strip_prefix("https://") {
        let mut parts = rest.split('/');
        let host = parts.next()?.to_string();
        let owner = parts.next()?.to_string();
        let repo = parts.next()?.to_string();
        if !host.is_empty() && !owner.is_empty() && !repo.is_empty() {
            return Some((host, owner, repo));
        }
    }

    if let Some(rest) = s.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        let mut parts = path.split('/');
        let owner = parts.next()?.to_string();
        let repo = parts.next()?.to_string();
        if !host.is_empty() && !owner.is_empty() && !repo.is_empty() {
            return Some((host.to_string(), owner, repo));
        }
    }

    None
}

fn to_posix_rel(path: &str) -> String {
    path.replace('\\', "/")
}

fn package_resource_enabled(patterns: Option<&[String]>, relative_path: &str) -> bool {
    let Some(patterns) = patterns else {
        return true;
    };
    if patterns.is_empty() {
        return false;
    }

    let rel = to_posix_rel(relative_path);
    let mut enabled = true;
    // If any plain include patterns exist, default to false until matched.
    let has_plain = patterns.iter().any(|p| !p.starts_with('+') && !p.starts_with('-') && !p.starts_with('!'));
    if has_plain {
        enabled = false;
        for p in patterns {
            if p.starts_with('+') || p.starts_with('-') || p.starts_with('!') {
                continue;
            }
            if pattern_matches(p, &rel) {
                enabled = true;
                break;
            }
        }
    }

    for p in patterns {
        if let Some(rest) = p.strip_prefix('!') {
            if pattern_matches(rest, &rel) {
                enabled = false;
            }
        }
    }
    for p in patterns {
        if let Some(rest) = p.strip_prefix('+') {
            if exact_pattern_matches(rest, &rel) {
                enabled = true;
            }
        }
    }
    for p in patterns {
        if let Some(rest) = p.strip_prefix('-') {
            if exact_pattern_matches(rest, &rel) {
                enabled = false;
            }
        }
    }
    enabled
}

fn pattern_matches(pattern: &str, relative_path: &str) -> bool {
    let pattern = to_posix_rel(pattern.trim_start_matches("./"));
    let rel = to_posix_rel(relative_path.trim_start_matches("./"));
    if pattern == rel {
        return true;
    }
    // basename match
    if Path::new(&rel).file_name().and_then(|n| n.to_str()).is_some_and(|name| name == pattern) {
        return true;
    }
    // simple suffix / prefix globs
    if let Some(suffix) = pattern.strip_prefix("**/") {
        return rel.ends_with(suffix) || rel.contains(&format!("/{suffix}"));
    }
    if let Some(prefix) = pattern.strip_suffix("/**") {
        return rel == prefix || rel.starts_with(&format!("{prefix}/"));
    }
    if let Some(prefix) = pattern.strip_suffix("/*") {
        if let Some(parent) = Path::new(&rel).parent().and_then(|p| p.to_str()) {
            return to_posix_rel(parent) == prefix;
        }
    }
    false
}

fn exact_pattern_matches(pattern: &str, relative_path: &str) -> bool {
    let pattern = to_posix_rel(pattern.trim_start_matches("./"));
    let rel = to_posix_rel(relative_path.trim_start_matches("./"));
    if pattern == rel {
        return true;
    }
    // skill directory form: skills/foo vs skills/foo/SKILL.md
    if rel.ends_with("/SKILL.md") {
        let parent = rel.trim_end_matches("/SKILL.md");
        if pattern == parent {
            return true;
        }
    }
    false
}

fn read_pi_manifest(package_root: &Path) -> Option<serde_json::Value> {
    let package_json = package_root.join("package.json");
    let content = fs::read_to_string(package_json).ok()?;
    let pkg: serde_json::Value = serde_json::from_str(&content).ok()?;
    pkg.get("pi").cloned()
}

fn collect_package_files(package_root: &Path, resource_type: &str, manifest: Option<&serde_json::Value>) -> Vec<(String, PathBuf)> {
    let mut files: Vec<(String, PathBuf)> = Vec::new();

    if let Some(entries) = manifest.and_then(|m| m.get(resource_type)).and_then(|v| v.as_array()) {
        for entry in entries {
            let Some(raw) = entry.as_str() else { continue };
            if raw.starts_with('+') || raw.starts_with('-') || raw.starts_with('!') {
                continue;
            }
            let rel = to_posix_rel(raw.trim_start_matches("./"));
            let full = package_root.join(&rel);
            if full.exists() {
                files.push((rel, full));
            }
        }
        if !files.is_empty() {
            return files;
        }
    }

    let dir = package_root.join(resource_type);
    if !dir.exists() {
        return files;
    }

    match resource_type {
        "skills" => {
            if let Ok(entries) = fs::read_dir(&dir) {
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
                    if skill_md.exists() {
                        let rel = format!("skills/{name}/SKILL.md");
                        files.push((rel, skill_md));
                    }
                }
            }
        }
        "extensions" => {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    if file_name.starts_with('.') || file_name == "README.md" || file_name == "CHANGELOG.md" {
                        continue;
                    }
                    let is_ext_file = path.is_file() && (file_name.ends_with(".ts") || file_name.ends_with(".js"));
                    let is_ext_dir = path.is_dir() && (path.join("index.ts").exists() || path.join("index.js").exists());
                    if is_ext_file || is_ext_dir {
                        let rel = format!("extensions/{file_name}");
                        files.push((rel, path));
                    }
                }
            }
        }
        "prompts" => {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() {
                        continue;
                    }
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    if !file_name.ends_with(".md") || file_name.starts_with('.') {
                        continue;
                    }
                    let rel = format!("prompts/{file_name}");
                    files.push((rel, path));
                }
            }
        }
        "themes" => {
            if let Ok(entries) = fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    if file_name.starts_with('.') {
                        continue;
                    }
                    let is_theme = (path.is_file() && file_name.ends_with(".json")) || path.is_dir();
                    if is_theme {
                        let rel = format!("themes/{file_name}");
                        files.push((rel, path));
                    }
                }
            }
        }
        _ => {}
    }

    files
}

fn scan_package_resources(package_root: &Path, source: &str, scope: &str, filter: Option<&serde_json::Value>) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let manifest = read_pi_manifest(package_root);
    let base_dir = package_root.to_string_lossy().to_string();

    for resource_type in ["extensions", "skills", "prompts", "themes"] {
        let patterns: Option<Vec<String>> = filter.and_then(|f| f.get(resource_type).and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()));
        // When filter object exists but this type key is missing, collect defaults (all enabled).
        // When filter object exists and key is empty array, all disabled.
        let type_filter = if filter.is_some() { Some(patterns.unwrap_or_default()) } else { None };
        // Special case: filter object present but key absent => None means default collect enabled
        let patterns_ref: Option<&[String]> = match (filter, type_filter.as_ref()) {
            (None, _) => None,
            (Some(f), _) if f.get(resource_type).is_none() => None,
            (_, Some(p)) => Some(p.as_slice()),
            _ => None,
        };

        let files = collect_package_files(package_root, resource_type, manifest.as_ref());
        // If filter specifies explicit +/- paths that weren't discovered via convention/manifest,
        // still include those exact files when they exist under package root.
        let mut files = files;
        if let Some(patterns) = patterns_ref {
            for p in patterns {
                let raw = p.trim_start_matches(['+', '-', '!']);
                let rel = to_posix_rel(raw.trim_start_matches("./"));
                if files.iter().any(|(existing, _)| existing == &rel) {
                    continue;
                }
                let full = package_root.join(&rel);
                if full.exists() {
                    files.push((rel, full));
                }
            }
        }

        for (rel, full) in files {
            let enabled = package_resource_enabled(patterns_ref, &rel);
            let name = display_name_for_resource(resource_type, &rel);
            let description = if resource_type == "skills" && full.extension().is_some_and(|e| e == "md") {
                fs::read_to_string(&full).ok().and_then(|c| extract_frontmatter_field(&c, "description")).unwrap_or_default()
            } else if resource_type == "prompts" && full.is_file() {
                fs::read_to_string(&full).ok().and_then(|c| c.lines().next().map(|s| s.trim().trim_start_matches("# ").to_string())).unwrap_or_default()
            } else {
                String::new()
            };

            results.push(ResourceInfo { name, path: rel, description, enabled, resource_type: resource_type.to_string(), metadata: ResourceMetadata { source: source.to_string(), scope: scope.to_string(), origin: "package".to_string(), base_dir: Some(base_dir.clone()) } });
        }
    }

    results
}

fn display_name_for_resource(resource_type: &str, relative_path: &str) -> String {
    let rel = to_posix_rel(relative_path);
    if resource_type == "skills" && rel.ends_with("/SKILL.md") {
        let parent = rel.trim_end_matches("/SKILL.md");
        return parent.rsplit('/').next().unwrap_or(parent).to_string();
    }
    Path::new(&rel).file_name().and_then(|n| n.to_str()).unwrap_or(&rel).to_string()
}

fn scan_packages_from_settings(settings: &serde_json::Value, scope: &str, agent_dir: &Path, project_base: Option<&Path>) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    let Some(packages) = settings.get("packages").and_then(|v| v.as_array()) else {
        return results;
    };

    for pkg in packages {
        let (source_raw, filter) = if let Some(s) = pkg.as_str() {
            (s.to_string(), None)
        } else if pkg.is_object() {
            let source = pkg.get("source").and_then(|v| v.as_str()).unwrap_or("").to_string();
            (source, Some(pkg))
        } else {
            continue;
        };

        if source_raw.is_empty() || package_source_is_disabled(&source_raw) {
            continue;
        }
        let source = normalize_package_source(&source_raw);
        let Some(install_path) = resolve_package_install_path(&source, agent_dir, project_base, scope) else {
            continue;
        };
        results.extend(scan_package_resources(&install_path, &source, scope, filter));
    }

    results
}

fn resource_base_dir(scope: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "project" => {
            let cwd_path = match cwd {
                Some(value) if !value.trim().is_empty() => PathBuf::from(value),
                _ => std::env::current_dir().map_err(|e| format!("cwd: {e}"))?,
            };
            Ok(crate::paths::project_pi_dir(&cwd_path))
        }
        _ => crate::paths::pi_agent_root_dir().map_err(|e| format!("No home dir: {e}")),
    }
}

fn resolve_resource_full_path(path: &str, scope: &str, cwd: Option<&str>, base_dir: Option<&str>) -> Result<PathBuf, String> {
    if let Some(base) = base_dir {
        if !base.trim().is_empty() {
            return Ok(PathBuf::from(base).join(path));
        }
    }
    Ok(resource_base_dir(scope, cwd)?.join(path))
}

pub async fn read_resource_file_internal(path: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<String, String> {
    let full = resolve_resource_full_path(&path, &scope, cwd.as_deref(), base_dir.as_deref())?;
    let base = if let Some(base) = base_dir.as_deref().filter(|v| !v.trim().is_empty()) { PathBuf::from(base) } else { resource_base_dir(&scope, cwd.as_deref())? };
    let canonical = full.canonicalize().map_err(|e| format!("Resolve path: {e}"))?;
    let base_canonical = base.canonicalize().unwrap_or(base);
    if !canonical.starts_with(&base_canonical) {
        return Err("Path traversal denied".into());
    }
    fs::read_to_string(&canonical).map_err(|e| format!("Read {path}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_resource_file(path: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<String, String> {
    read_resource_file_internal(path, scope, cwd, base_dir).await
}

pub async fn write_resource_file_internal(path: String, content: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<(), String> {
    let full = resolve_resource_full_path(&path, &scope, cwd.as_deref(), base_dir.as_deref())?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create dir: {e}"))?;
    }
    let base = if let Some(base) = base_dir.as_deref().filter(|v| !v.trim().is_empty()) { PathBuf::from(base) } else { resource_base_dir(&scope, cwd.as_deref())? };
    let base_canonical = base.canonicalize().map_err(|e| format!("Resolve base dir: {e}"))?;
    let parent_canonical = full.parent().and_then(|p| p.canonicalize().ok()).ok_or_else(|| "Failed to resolve target parent directory".to_string())?;
    if !parent_canonical.starts_with(&base_canonical) {
        return Err("Path traversal denied".into());
    }
    fs::write(&full, content).map_err(|e| format!("Write {path}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn write_resource_file(path: String, content: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<(), String> {
    write_resource_file_internal(path, content, scope, cwd, base_dir).await
}

pub async fn delete_resource_file_internal(path: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<(), String> {
    let full = resolve_resource_full_path(&path, &scope, cwd.as_deref(), base_dir.as_deref())?;
    if !full.exists() {
        return Ok(());
    }
    let base = if let Some(base) = base_dir.as_deref().filter(|v| !v.trim().is_empty()) { PathBuf::from(base) } else { resource_base_dir(&scope, cwd.as_deref())? };
    let canonical = full.canonicalize().map_err(|e| format!("Resolve path: {e}"))?;
    let base_canonical = base.canonicalize().unwrap_or(base);
    if !canonical.starts_with(&base_canonical) {
        return Err("Path traversal denied".into());
    }
    fs::remove_file(&canonical).map_err(|e| format!("Delete {path}: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn delete_resource_file(path: String, scope: String, cwd: Option<String>, base_dir: Option<String>) -> Result<(), String> {
    delete_resource_file_internal(path, scope, cwd, base_dir).await
}

#[cfg(test)]
mod package_resource_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_npm_and_git_install_paths() {
        let root = tempdir().unwrap();
        let agent = root.path().join("agent");
        let npm_pkg = agent.join("npm/node_modules/demo-pkg");
        let git_pkg = agent.join("git/github.com/acme/demo");
        fs::create_dir_all(&npm_pkg).unwrap();
        fs::create_dir_all(&git_pkg).unwrap();

        assert_eq!(resolve_package_install_path("npm:demo-pkg", &agent, None, "user").as_deref(), Some(npm_pkg.as_path()));
        assert_eq!(resolve_package_install_path("git:github.com/acme/demo", &agent, None, "user").as_deref(), Some(git_pkg.as_path()));
        assert_eq!(resolve_package_install_path("https://github.com/acme/demo", &agent, None, "user").as_deref(), Some(git_pkg.as_path()));
    }

    #[test]
    fn package_filter_plus_minus_exact_paths() {
        let patterns = vec!["+extensions/a.ts".to_string(), "-extensions/b.ts".to_string()];
        assert!(package_resource_enabled(Some(&patterns), "extensions/a.ts"));
        assert!(!package_resource_enabled(Some(&patterns), "extensions/b.ts"));
        // without plain includes, unrelated defaults enabled then only force excludes apply
        assert!(package_resource_enabled(Some(&patterns), "extensions/c.ts"));
        assert!(!package_resource_enabled(Some(&[]), "extensions/a.ts"));
        assert!(package_resource_enabled(None, "extensions/a.ts"));
    }

    #[test]
    fn scans_package_skills_and_extensions() {
        let root = tempdir().unwrap();
        let pkg = root.path().join("pkg");
        fs::create_dir_all(pkg.join("extensions")).unwrap();
        fs::create_dir_all(pkg.join("skills/demo")).unwrap();
        fs::write(pkg.join("extensions/index.ts"), "export {}").unwrap();
        fs::write(pkg.join("skills/demo/SKILL.md"), "---\ndescription: hello\n---\n# Demo\n").unwrap();

        let filter = serde_json::json!({
            "source": "npm:demo",
            "extensions": ["+extensions/index.ts"],
            "skills": ["-skills/demo/SKILL.md"]
        });
        let items = scan_package_resources(&pkg, "npm:demo", "user", Some(&filter));
        let ext = items.iter().find(|i| i.resource_type == "extensions").unwrap();
        let skill = items.iter().find(|i| i.resource_type == "skills").unwrap();
        assert!(ext.enabled);
        assert!(!skill.enabled);
        assert_eq!(skill.metadata.origin, "package");
        assert!(skill.metadata.base_dir.as_ref().unwrap().contains("pkg"));
    }
}
