use std::fs;

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
                    path: format!("skills/{}/SKILL.md", name),
                    description,
                    enabled: true,
                });
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

#[tauri::command]
pub async fn scan_skills() -> Result<Vec<SkillInfo>, String> {
    scan_skills_internal().await
}

#[tauri::command]
pub async fn get_skill_content(skill_name: String) -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let skill_md_path = home_dir
        .join(".pi/agent/skills")
        .join(&skill_name)
        .join("SKILL.md");

    fs::read_to_string(&skill_md_path).map_err(|e| format!("Failed to read skill content: {}", e))
}

#[tauri::command]
pub async fn get_prompt_content(prompt_name: String) -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let prompt_md_path = home_dir
        .join(".pi/agent/prompts")
        .join(format!("{}.md", prompt_name));

    fs::read_to_string(&prompt_md_path).map_err(|e| format!("Failed to read prompt content: {}", e))
}

#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let system_prompt_path = home_dir.join(".pi/agent/APPEND_SYSTEM.md");

    if !system_prompt_path.exists() {
        let default_prompt = home_dir.join(".pi/agent/prompts/default.md");
        if default_prompt.exists() {
            return fs::read_to_string(&default_prompt)
                .map_err(|e| format!("Failed to read default prompt: {}", e));
        }
        return Ok(String::new());
    }

    fs::read_to_string(&system_prompt_path)
        .map_err(|e| format!("Failed to read system prompt: {}", e))
}

pub async fn scan_prompts_internal() -> Result<Vec<PromptInfo>, String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let prompts_dir = home_dir.join(".pi/agent/prompts");

    let mut prompts = Vec::new();

    if let Ok(entries) = fs::read_dir(&prompts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
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
                    path: format!("prompts/{}", name),
                    description,
                    enabled: true,
                });
            }
        }
    }

    prompts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(prompts)
}

#[tauri::command]
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
        fs::read_to_string(&settings_path).map_err(|e| format!("Failed to read settings: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?;

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

#[tauri::command]
pub async fn load_pi_settings() -> Result<PiSettings, String> {
    load_pi_settings_internal().await
}

#[tauri::command]
pub async fn save_pi_settings(settings: PiSettings) -> Result<(), String> {
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let settings_path = home_dir.join(".pi/agent/settings.json");

    let mut json: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    json["skills"] = serde_json::json!(settings.skills);
    json["prompts"] = serde_json::json!(settings.prompts);
    json["extensions"] = serde_json::json!(settings.extensions);

    let content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content).map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}
