use std::collections::HashSet;
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
            let description = if skill_md.exists() { read_first_line(&skill_md, None) } else { String::new() };

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
    /// Discovery channel: `pi`, `agents`, or `package`.
    pub discovery: String,
    /// Absolute root used to resolve the relative resource path.
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
    /// Exact setting override: `inherit`, `enabled`, or `disabled`.
    pub state: String,
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

fn resource_override_state(settings_list: &[String], relative_path: &str) -> String {
    let rel = to_posix_rel(relative_path);
    if settings_list.iter().filter_map(|entry| entry.strip_prefix('-')).any(|pattern| exact_pattern_matches(pattern, &rel)) {
        return "disabled".to_string();
    }
    if settings_list.iter().filter_map(|entry| entry.strip_prefix('+')).any(|pattern| exact_pattern_matches(pattern, &rel)) {
        return "enabled".to_string();
    }
    "inherit".to_string()
}

fn is_resource_enabled(settings_list: &[String], relative_path: &str) -> bool {
    let overrides: Vec<String> = settings_list.iter().filter(|entry| entry.starts_with('+') || entry.starts_with('-') || entry.starts_with('!')).cloned().collect();
    overrides.is_empty() || package_resource_enabled(Some(&overrides), relative_path)
}

fn resource_metadata(scope: &str, discovery: &str, base_dir: &Path) -> ResourceMetadata {
    ResourceMetadata { source: "auto".to_string(), scope: scope.to_string(), origin: "top-level".to_string(), discovery: discovery.to_string(), base_dir: Some(base_dir.to_string_lossy().to_string()) }
}

fn relative_resource_path(path: &Path, base_dir: &Path) -> Option<String> {
    path.strip_prefix(base_dir).ok().map(|relative| to_posix_rel(&relative.to_string_lossy()))
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

fn scan_skills_dir(dir: &Path, base_dir: &Path, scope: &str, settings_list: &[String], discovery: &str, allow_root_markdown: bool) -> Vec<ResourceInfo> {
    #[allow(clippy::too_many_arguments)]
    fn visit(current: &Path, root: &Path, base_dir: &Path, scope: &str, settings_list: &[String], discovery: &str, allow_root_markdown: bool, results: &mut Vec<ResourceInfo>) {
        let skill_file = current.join("SKILL.md");
        if skill_file.is_file() {
            if let Some(relative) = relative_resource_path(&skill_file, base_dir) {
                let name = current.file_name().and_then(|value| value.to_str()).unwrap_or("SKILL").to_string();
                let description = fs::read_to_string(&skill_file).ok().and_then(|content| extract_frontmatter_field(&content, "description")).unwrap_or_default();
                results.push(ResourceInfo { name, path: relative.clone(), description, enabled: is_resource_enabled(settings_list, &relative), state: resource_override_state(settings_list, &relative), resource_type: "skills".to_string(), metadata: resource_metadata(scope, discovery, base_dir) });
            }
            return;
        }

        let entries = match fs::read_dir(current) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if path.is_dir() {
                visit(&path, root, base_dir, scope, settings_list, discovery, allow_root_markdown, results);
            } else if allow_root_markdown && current == root && path.extension().is_some_and(|extension| extension == "md") {
                if let Some(relative) = relative_resource_path(&path, base_dir) {
                    let description = fs::read_to_string(&path).ok().and_then(|content| extract_frontmatter_field(&content, "description")).unwrap_or_default();
                    results.push(ResourceInfo {
                        name: path.file_stem().and_then(|value| value.to_str()).unwrap_or(&name).to_string(),
                        path: relative.clone(),
                        description,
                        enabled: is_resource_enabled(settings_list, &relative),
                        state: resource_override_state(settings_list, &relative),
                        resource_type: "skills".to_string(),
                        metadata: resource_metadata(scope, discovery, base_dir),
                    });
                }
            }
        }
    }

    let mut results = Vec::new();
    visit(dir, dir, base_dir, scope, settings_list, discovery, allow_root_markdown, &mut results);
    results.sort_by(|left, right| left.name.cmp(&right.name));
    results
}

fn resolve_extension_entries(dir: &Path) -> Vec<PathBuf> {
    let package_json = dir.join("package.json");
    if let Ok(content) = fs::read_to_string(package_json) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let entries: Vec<PathBuf> = json.get("pi").and_then(|value| value.get("extensions")).and_then(serde_json::Value::as_array).into_iter().flatten().filter_map(serde_json::Value::as_str).map(|relative| dir.join(relative)).filter(|path| path.exists()).collect();
            if !entries.is_empty() {
                return entries;
            }
        }
    }
    for entry in ["index.ts", "index.js"] {
        let path = dir.join(entry);
        if path.is_file() {
            return vec![path];
        }
    }
    Vec::new()
}

fn scan_extensions_dir(dir: &Path, base_dir: &Path, scope: &str, settings_list: &[String], discovery: &str) -> Vec<ResourceInfo> {
    let mut files = resolve_extension_entries(dir);
    if files.is_empty() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with('.') || file_name == "README.md" || file_name == "CHANGELOG.md" {
                    continue;
                }
                if path.is_file() && (file_name.ends_with(".ts") || file_name.ends_with(".js")) {
                    files.push(path);
                } else if path.is_dir() {
                    files.extend(resolve_extension_entries(&path));
                }
            }
        }
    }

    let mut results = Vec::new();
    for path in files {
        let Some(relative) = relative_resource_path(&path, base_dir) else {
            continue;
        };
        results.push(ResourceInfo {
            name: display_name_for_resource("extensions", &relative),
            path: relative.clone(),
            description: String::new(),
            enabled: is_resource_enabled(settings_list, &relative),
            state: resource_override_state(settings_list, &relative),
            resource_type: "extensions".to_string(),
            metadata: resource_metadata(scope, discovery, base_dir),
        });
    }
    results.sort_by(|left, right| left.name.cmp(&right.name));
    results
}

fn scan_prompts_dir(dir: &Path, base_dir: &Path, scope: &str, settings_list: &[String], discovery: &str) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !path.is_file() || file_name.starts_with('.') || !file_name.ends_with(".md") {
                continue;
            }
            let Some(relative) = relative_resource_path(&path, base_dir) else {
                continue;
            };
            let description = fs::read_to_string(&path).ok().and_then(|content| content.lines().next().map(|line| line.trim().trim_start_matches("# ").to_string())).unwrap_or_default();
            results.push(ResourceInfo {
                name: file_name.trim_end_matches(".md").to_string(),
                path: relative.clone(),
                description,
                enabled: is_resource_enabled(settings_list, &relative),
                state: resource_override_state(settings_list, &relative),
                resource_type: "prompts".to_string(),
                metadata: resource_metadata(scope, discovery, base_dir),
            });
        }
    }
    results.sort_by(|left, right| left.name.cmp(&right.name));
    results
}

fn scan_themes_dir(dir: &Path, base_dir: &Path, scope: &str, settings_list: &[String], discovery: &str) -> Vec<ResourceInfo> {
    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !path.is_file() || file_name.starts_with('.') || !file_name.ends_with(".json") {
                continue;
            }
            let Some(relative) = relative_resource_path(&path, base_dir) else {
                continue;
            };
            results.push(ResourceInfo {
                name: file_name,
                path: relative.clone(),
                description: String::new(),
                enabled: is_resource_enabled(settings_list, &relative),
                state: resource_override_state(settings_list, &relative),
                resource_type: "themes".to_string(),
                metadata: resource_metadata(scope, discovery, base_dir),
            });
        }
    }
    results.sort_by(|left, right| left.name.cmp(&right.name));
    results
}

fn resource_identity(item: &ResourceInfo) -> String {
    let base = item.metadata.base_dir.as_deref().unwrap_or("");
    let full = PathBuf::from(base).join(&item.path);
    full.canonicalize().unwrap_or(full).to_string_lossy().to_string()
}

fn resource_precedence(item: &ResourceInfo) -> u8 {
    match (item.metadata.origin.as_str(), item.metadata.scope.as_str(), item.metadata.discovery.as_str()) {
        ("top-level", "project", "pi") => 0,
        ("top-level", "project", "agents") => 1,
        ("top-level", "user", "pi") => 2,
        ("top-level", "user", "agents") => 3,
        _ => 4,
    }
}

fn dedupe_and_sort_resources(resources: Vec<ResourceInfo>) -> Vec<ResourceInfo> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for resource in resources {
        if seen.insert(resource_identity(&resource)) {
            deduped.push(resource);
        }
    }
    deduped.sort_by(|left, right| resource_precedence(left).cmp(&resource_precedence(right)).then_with(|| left.resource_type.cmp(&right.resource_type)).then_with(|| left.name.cmp(&right.name)));
    deduped
}

pub async fn scan_all_resources_internal(cwd: Option<String>) -> Result<Vec<ResourceInfo>, String> {
    let user_base = crate::paths::pi_agent_root_dir().map_err(|error| format!("Failed to get Pi agent directory: {error}"))?;
    let user_settings = read_settings_value(&user_base.join("settings.json"));
    let (user_skills_cfg, user_ext_cfg, user_prompts_cfg, user_themes_cfg) = settings_arrays_from_value(&user_settings);
    let user_agents_base = crate::paths::home_dir().map_err(|error| format!("Failed to get home directory: {error}"))?.join(".agents");
    let user_agents_skills = user_agents_base.join("skills");
    let user_agents_canonical = user_agents_skills.canonicalize().unwrap_or_else(|_| user_agents_skills.clone());

    let mut all = Vec::new();

    if let Some(cwd_str) = cwd.as_deref().filter(|value| !value.trim().is_empty()) {
        let cwd_path = PathBuf::from(cwd_str);
        let trust = super::resource_trust::get_project_resource_trust_internal(cwd_str.to_string()).await?;
        if trust.trusted {
            let project_base = crate::paths::project_pi_dir(&cwd_path);
            let project_settings = read_settings_value(&project_base.join("settings.json"));
            let (project_skills_cfg, project_ext_cfg, project_prompts_cfg, project_themes_cfg) = settings_arrays_from_value(&project_settings);

            all.extend(scan_skills_dir(&project_base.join("skills"), &project_base, "project", &project_skills_cfg, "pi", true));
            all.extend(scan_extensions_dir(&project_base.join("extensions"), &project_base, "project", &project_ext_cfg, "pi"));
            all.extend(scan_prompts_dir(&project_base.join("prompts"), &project_base, "project", &project_prompts_cfg, "pi"));
            all.extend(scan_themes_dir(&project_base.join("themes"), &project_base, "project", &project_themes_cfg, "pi"));

            for skills_dir in super::resource_trust::ancestor_agents_skill_dirs(&cwd_path)? {
                let canonical = skills_dir.canonicalize().unwrap_or_else(|_| skills_dir.clone());
                if canonical == user_agents_canonical {
                    continue;
                }
                let Some(agents_base) = skills_dir.parent() else {
                    continue;
                };
                all.extend(scan_skills_dir(&skills_dir, agents_base, "project", &project_skills_cfg, "agents", false));
            }

            all.extend(scan_packages_from_settings(&project_settings, "project", &user_base, Some(&project_base)));
        }
    }

    all.extend(scan_skills_dir(&user_base.join("skills"), &user_base, "user", &user_skills_cfg, "pi", true));
    all.extend(scan_extensions_dir(&user_base.join("extensions"), &user_base, "user", &user_ext_cfg, "pi"));
    all.extend(scan_prompts_dir(&user_base.join("prompts"), &user_base, "user", &user_prompts_cfg, "pi"));
    all.extend(scan_themes_dir(&user_base.join("themes"), &user_base, "user", &user_themes_cfg, "pi"));
    all.extend(scan_skills_dir(&user_agents_skills, &user_agents_base, "user", &user_skills_cfg, "agents", false));
    all.extend(scan_packages_from_settings(&user_settings, "user", &user_base, None));

    Ok(dedupe_and_sort_resources(all))
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

fn package_resource_override_state(patterns: Option<&[String]>, relative_path: &str) -> String {
    let Some(patterns) = patterns else {
        return "inherit".to_string();
    };
    if patterns.iter().filter_map(|pattern| pattern.strip_prefix('-')).any(|pattern| exact_pattern_matches(pattern, relative_path)) {
        return "disabled".to_string();
    }
    if patterns.iter().filter_map(|pattern| pattern.strip_prefix('+')).any(|pattern| exact_pattern_matches(pattern, relative_path)) {
        return "enabled".to_string();
    }
    "inherit".to_string()
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
                    if is_ext_file {
                        let rel = format!("extensions/{file_name}");
                        files.push((rel, path));
                    } else if path.is_dir() {
                        for resolved in resolve_extension_entries(&path) {
                            if let Some(relative) = relative_resource_path(&resolved, package_root) {
                                files.push((relative, resolved));
                            }
                        }
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
                    if path.is_file() && file_name.ends_with(".json") {
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

            results.push(ResourceInfo {
                name,
                path: rel.clone(),
                description,
                enabled,
                state: package_resource_override_state(patterns_ref, &rel),
                resource_type: resource_type.to_string(),
                metadata: ResourceMetadata { source: source.to_string(), scope: scope.to_string(), origin: "package".to_string(), discovery: "package".to_string(), base_dir: Some(base_dir.clone()) },
            });
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
    if resource_type == "extensions" && (rel.ends_with("/index.ts") || rel.ends_with("/index.js")) {
        let parent = Path::new(&rel).parent().unwrap_or_else(|| Path::new(&rel));
        return parent.file_name().and_then(|name| name.to_str()).unwrap_or(&rel).to_string();
    }
    Path::new(&rel).file_name().and_then(|name| name.to_str()).unwrap_or(&rel).to_string()
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
    fn recursive_skill_discovery_tracks_inherited_effectiveness() {
        let root = tempdir().unwrap();
        let base = root.path().join(".agents");
        let skills = base.join("skills").join("nested").join("demo");
        fs::create_dir_all(&skills).unwrap();
        fs::write(skills.join("SKILL.md"), "---\ndescription: Nested skill\n---\n").unwrap();
        let settings = vec!["!skills/**".to_string()];

        let items = scan_skills_dir(&base.join("skills"), &base, "user", &settings, "agents", false);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "skills/nested/demo/SKILL.md");
        assert_eq!(items[0].description, "Nested skill");
        assert!(!items[0].enabled);
        assert_eq!(items[0].state, "inherit");
        assert_eq!(items[0].metadata.discovery, "agents");
    }

    #[test]
    fn top_level_themes_ignore_directories() {
        let root = tempdir().unwrap();
        let base = root.path().join("agent");
        let themes = base.join("themes");
        fs::create_dir_all(themes.join("not-a-theme")).unwrap();
        fs::write(themes.join("valid.json"), "{}").unwrap();

        let items = scan_themes_dir(&themes, &base, "user", &[], "pi");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "themes/valid.json");
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
