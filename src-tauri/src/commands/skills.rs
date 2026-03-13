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
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    Ok(home_dir.join(".pi/agent"))
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
            if !path.extension().is_some_and(|ext| ext == "md") {
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
