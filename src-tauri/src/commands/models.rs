use std::process::{Command, Stdio};
use std::time::Instant;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModelInfo {
    pub provider: String,
    pub model: String,
    pub available: bool,
    pub tested: bool,
    pub last_test_time: Option<String>,
    pub response_time: Option<f64>,
    pub status: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ModelTestResult {
    pub provider: String,
    pub model: String,
    pub time: f64,
    pub output: String,
    pub status: String,
    pub error_msg: Option<String>,
}

#[tauri::command]
pub async fn list_models(search: Option<String>) -> Result<Vec<ModelInfo>, String> {
    let mut args = vec!["--list-models".to_string()];
    if let Some(query) = search {
        args.push(query);
    }

    let output = Command::new("pi")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute pi --list-models: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.contains("provider") && line.contains("model") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let provider = parts[0].to_string();
            let model = parts[1].to_string();

            models.push(ModelInfo {
                provider,
                model,
                available: true,
                tested: false,
                last_test_time: None,
                response_time: None,
                status: "ready".to_string(),
            });
        }
    }

    Ok(models)
}

#[tauri::command]
pub async fn test_model(
    provider: String,
    model: String,
    _prompt: Option<String>,
) -> Result<ModelTestResult, String> {
    let args = vec![
        "--provider",
        &provider,
        "--model",
        &model,
        "--no-tools",
        "--no-skills",
        "--no-extensions",
        "--no-session",
        "--print",
    ];

    let start_time = Instant::now();

    let output = Command::new("pi")
        .args(&args)
        .stdin(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to execute pi: {}", e))?;

    let duration = start_time.elapsed().as_secs_f64();

    if output.status.success() {
        Ok(ModelTestResult {
            provider,
            model,
            time: duration,
            output: "OK".to_string(),
            status: "success".to_string(),
            error_msg: None,
        })
    } else {
        Ok(ModelTestResult {
            provider,
            model,
            time: duration,
            output: "Failed".to_string(),
            status: "error".to_string(),
            error_msg: Some(String::from_utf8_lossy(&output.stderr).to_string()),
        })
    }
}

#[tauri::command]
pub async fn test_models_batch(
    models: Vec<(String, String)>,
    prompt: Option<String>,
) -> Result<Vec<ModelTestResult>, String> {
    let mut results = Vec::new();

    for (provider, model) in models {
        match test_model(provider.clone(), model.clone(), prompt.clone()).await {
            Ok(result) => results.push(result),
            Err(e) => {
                results.push(ModelTestResult {
                    provider,
                    model,
                    time: 0.0,
                    output: String::new(),
                    status: "error".to_string(),
                    error_msg: Some(e),
                });
            }
        }
    }

    Ok(results)
}
