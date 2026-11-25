//! Model configuration domain module
//!
//! Organized as:
//! - types.rs: Shared types (ModelOption, ModelHttpTestResult, etc.)
//! - reader.rs: Configuration file reading
//! - writer.rs: Configuration file writing
//! - backup.rs: Backup management
//! - http_tester.rs: HTTP model testing logic

pub mod backup;
pub mod http_tester;
pub mod reader;
pub mod types;
pub mod writer;

pub use backup::*;
pub use http_tester::*;
pub use reader::*;
pub use types::*;
pub use writer::*;

/// List model options from config (fast path)
pub async fn list_model_options_fast_internal() -> Result<Vec<types::ModelOption>, String> {
    use types::sort_model_options;

    let json = read_models_config_internal()?;
    let mut options = Vec::new();

    if let Some(providers) = json.get("providers").and_then(|v| v.as_object()) {
        for (prov_name, prov_val) in providers {
            if let Some(models) = prov_val.get("models").and_then(|v| v.as_array()) {
                for m in models {
                    if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                        options.push(ModelOption { provider: prov_name.clone(), model: id.to_string() });
                    }
                }
            }
        }
    }

    sort_model_options(&mut options);
    Ok(options)
}

/// List model options through Pi, optionally against the profile edited by PSM.
pub async fn list_model_options_full_internal(use_config_profile: bool) -> Result<Vec<types::ModelOption>, String> {
    use types::sort_model_options;

    let mut command = tokio::process::Command::new("pi");
    command.arg("--list-models");
    // The config editor must compare against the same profile it saves.
    if use_config_profile {
        command.env("PI_CODING_AGENT_DIR", crate::paths::pi_agent_root_dir()?);
    }
    let output = command.output().await.map_err(|e| format!("Failed to run pi --list-models: {e}"))?;

    if !output.status.success() {
        return Err(format!("pi --list-models failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut options = Vec::new();
    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            options.push(ModelOption { provider: parts[0].to_string(), model: parts[1].to_string() });
        }
    }
    sort_model_options(&mut options);
    Ok(options)
}

/// Load model config as JSON value
pub async fn load_model_config_internal() -> Result<serde_json::Value, String> {
    read_models_config_internal()
}

/// Save model config from JSON value
pub async fn save_model_config_internal(mut content: serde_json::Value, create_backup: Option<bool>) -> Result<(), String> {
    // Apply Go's inheritance rules to the edited draft before writing it to Pi.
    super::opencode_go::prepare_config_for_save(&mut content);
    write_models_config_internal(content, create_backup.unwrap_or(true))
}

/// Export model config as pretty JSON string
pub async fn export_model_config_content_internal() -> Result<String, String> {
    let json = read_models_config_internal()?;
    serde_json::to_string_pretty(&json).map_err(|e| format!("Serialize model config: {e}"))
}

/// Export model config to a specific path
pub async fn export_model_config_to_path_internal(path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let content = export_model_config_content_internal().await?;
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Create export dir: {e}"))?;
    }
    fs::write(&target, &content).map_err(|e| format!("Write export file: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

/// Import model config from JSON string
pub async fn import_model_config_content_internal(content: String, mode: Option<String>) -> Result<serde_json::Value, String> {
    let imported: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Parse imported model config: {e}"))?;
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

/// Import model config from a file path
pub async fn import_model_config_from_path_internal(path: String, mode: Option<String>) -> Result<serde_json::Value, String> {
    use std::fs;

    let content = fs::read_to_string(&path).map_err(|e| format!("Read import file: {e}"))?;
    import_model_config_content_internal(content, mode).await
}

/// List model config versions
pub async fn list_model_config_versions_internal() -> Result<Vec<crate::commands::config_versions::ConfigVersionMeta>, String> {
    let file_path = get_models_json_path()?.to_string_lossy().to_string();
    crate::commands::config_versions::list_config_versions_internal(Some(file_path)).await
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    #[tokio::test]
    async fn save_opencode_go_routes_and_inherit_blank_values_in_pi_models_json() {
        let _lock = crate::paths::acquire_test_env_lock();
        let home = tempfile::tempdir().unwrap();
        let _home = crate::paths::TestHomeGuard::set(home.path());
        let draft = json!({
            "providers": {"opencode-go": {
                "baseUrl": "https://opencode.ai/zen/go/v1",
                "apiKey": " ",
                "api": "",
                "modelOverrides": {"qwen4-max": {"name": "Qwen"}},
                "models": [
                    {"id": "new-claude", "api": "anthropic-messages", "baseUrl": ""},
                    {"id": "new-gemini", "api": "google-generative-ai", "baseUrl": "https://opencode.ai/zen/go"},
                    {"id": "new-chat", "api": "openai-completions", "compat": {"maxTokensField": "max_tokens"}},
                    {"id": "custom-proxy", "api": "openai-completions", "baseUrl": "https://proxy.example/v1"}
                ]
            }}
        });
        super::save_model_config_internal(draft, Some(false)).await.unwrap();
        let saved = super::read_models_config_internal().unwrap();
        let go = &saved["providers"]["opencode-go"];
        for key in ["baseUrl", "apiKey", "api"] {
            assert!(go.get(key).is_none(), "still saved {key}");
        }
        assert_eq!(go["modelOverrides"]["qwen4-max"]["name"], "Qwen");
        let bases = go["models"].as_array().unwrap().iter().map(|model| model["baseUrl"].as_str().unwrap()).collect::<Vec<_>>();
        assert_eq!(bases, ["https://opencode.ai/inference/go/anthropic", "https://opencode.ai/inference/go/google/v1beta", "https://opencode.ai/inference/go/openai/v1", "https://proxy.example/v1"]);
        assert_eq!(go.pointer("/models/2/compat/maxTokensField").and_then(Value::as_str), Some("max_tokens"));
    }
}
