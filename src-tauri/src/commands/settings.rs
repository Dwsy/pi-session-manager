use std::fs;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub terminal: TerminalSettings,
    pub appearance: AppearanceSettings,
    pub language: LanguageSettings,
    pub session: SessionSettings,
    pub search: SearchSettings,
    pub export: ExportSettings,
    pub advanced: AdvancedSettings,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct TerminalSettings {
    pub default_terminal: String,
    pub custom_terminal_command: Option<String>,
    pub pi_command_path: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppearanceSettings {
    pub theme: String,
    pub sidebar_width: u32,
    pub font_size: String,
    pub code_block_theme: String,
    pub message_spacing: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LanguageSettings {
    pub locale: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SessionSettings {
    pub auto_refresh: bool,
    pub refresh_interval: u32,
    pub default_view_mode: String,
    pub show_message_preview: bool,
    pub preview_lines: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearchSettings {
    pub default_search_mode: String,
    pub case_sensitive: bool,
    pub include_tool_calls: bool,
    pub highlight_matches: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExportSettings {
    pub default_format: String,
    pub include_metadata: bool,
    pub include_timestamps: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AdvancedSettings {
    pub session_dir: String,
    pub cache_enabled: bool,
    pub debug_mode: bool,
    pub max_cache_size: u32,
}

fn get_app_settings_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Failed to get config directory")?;
    Ok(config_dir
        .join("pi-session-manager")
        .join("settings.json"))
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            terminal: TerminalSettings {
                default_terminal: "iterm2".to_string(),
                custom_terminal_command: None,
                pi_command_path: "pi".to_string(),
            },
            appearance: AppearanceSettings {
                theme: "dark".to_string(),
                sidebar_width: 320,
                font_size: "medium".to_string(),
                code_block_theme: "github".to_string(),
                message_spacing: "comfortable".to_string(),
            },
            language: LanguageSettings {
                locale: "en-US".to_string(),
            },
            session: SessionSettings {
                auto_refresh: true,
                refresh_interval: 30,
                default_view_mode: "project".to_string(),
                show_message_preview: true,
                preview_lines: 2,
            },
            search: SearchSettings {
                default_search_mode: "content".to_string(),
                case_sensitive: false,
                include_tool_calls: false,
                highlight_matches: true,
            },
            export: ExportSettings {
                default_format: "html".to_string(),
                include_metadata: true,
                include_timestamps: true,
            },
            advanced: AdvancedSettings {
                session_dir: "~/.pi/agent/sessions".to_string(),
                cache_enabled: true,
                debug_mode: false,
                max_cache_size: 100,
            },
        }
    }
}

#[tauri::command]
pub async fn load_app_settings() -> Result<AppSettings, String> {
    let settings_path = get_app_settings_path()?;

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let content =
        fs::read_to_string(&settings_path).map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

#[tauri::command]
pub async fn save_app_settings(settings: AppSettings) -> Result<(), String> {
    let settings_path = get_app_settings_path()?;

    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, content).map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}
