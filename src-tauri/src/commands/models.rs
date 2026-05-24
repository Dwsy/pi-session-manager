use std::process::{Command, Stdio};
use std::time::Instant;
#[cfg(feature = "gui")]
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;

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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelTextResponse {
    pub text: String,
    pub provider: String,
    pub model: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelTextStreamEvent {
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<ModelTextResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn invoke_model_text(system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>) -> Result<ModelTextResponse, String> {
    let mut response = run_pi_model_text(system_prompt, prompt, provider, model, reasoning, false, |_| {}).await?;
    response.text = response.text.trim().to_string();
    Ok(response)
}

#[cfg(feature = "gui")]
pub async fn invoke_model_text_stream(app_state: crate::app_state::SharedAppState, request_id: String, system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>) -> Result<ModelTextResponse, String> {
    let event_name = format!("psm-ai-stream:{request_id}");
    let delta_app = app_state.app_handle.clone();
    let delta_event_name = event_name.clone();
    let result = run_pi_model_text(system_prompt, prompt, provider, model, reasoning, true, move |delta| {
        let _ = delta_app.emit(&delta_event_name, ModelTextStreamEvent { r#type: "delta".to_string(), delta: Some(delta.to_string()), response: None, error: None });
    })
    .await;

    match result {
        Ok(mut response) => {
            response.text = response.text.trim().to_string();
            app_state
                .app_handle
                .emit(&event_name, ModelTextStreamEvent { r#type: "done".to_string(), delta: None, response: Some(response.clone()), error: None })
                .map_err(|error| format!("Failed to emit model stream completion: {error}"))?;
            Ok(response)
        }
        Err(error) => {
            let _ = app_state.app_handle.emit(&event_name, ModelTextStreamEvent { r#type: "error".to_string(), delta: None, response: None, error: Some(error.clone()) });
            Err(error)
        }
    }
}

async fn run_pi_model_text<F>(system_prompt: String, prompt: String, provider: Option<String>, model: Option<String>, reasoning: Option<String>, stream: bool, mut on_delta: F) -> Result<ModelTextResponse, String>
where
    F: FnMut(&str) + Send,
{
    let script = pi_model_text_script_path()?;
    let mut child = TokioCommand::new("node")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start Pi AI SDK helper: {error}"))?;

    let request = serde_json::json!({
        "systemPrompt": system_prompt,
        "prompt": prompt,
        "provider": provider,
        "model": model,
        "reasoning": reasoning,
        "stream": stream,
    });

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(request.to_string().as_bytes()).await.map_err(|error| format!("Failed to write Pi AI request: {error}"))?;
    }

    let stdout = child.stdout.take().ok_or_else(|| "Pi AI helper did not expose stdout".to_string())?;
    let mut lines = BufReader::new(stdout).lines();
    let mut final_response: Option<ModelTextResponse> = None;
    let mut helper_error: Option<String> = None;

    while let Some(line) = lines.next_line().await.map_err(|error| format!("Failed to read Pi AI helper output: {error}"))? {
        if line.trim().is_empty() {
            continue;
        }
        let event: ModelTextStreamEvent = serde_json::from_str(&line).map_err(|error| format!("Invalid Pi AI helper event: {error}. Raw: {line}"))?;
        match event.r#type.as_str() {
            "delta" => {
                if let Some(delta) = event.delta.as_deref() {
                    on_delta(delta);
                }
            }
            "done" => {
                final_response = event.response;
            }
            "error" => {
                helper_error = event.error;
            }
            _ => {}
        }
    }

    let output = child.wait_with_output().await.map_err(|error| format!("Failed to wait for Pi AI helper: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(helper_error.or_else(|| if stderr.is_empty() { None } else { Some(stderr) }).unwrap_or_else(|| format!("Pi AI helper exited with {}", output.status)));
    }

    final_response.ok_or_else(|| helper_error.unwrap_or_else(|| "Pi AI helper did not return a final response".to_string()))
}

fn pi_model_text_script_path() -> Result<std::path::PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|error| format!("Failed to resolve current directory: {error}"))?;
    let direct = cwd.join("scripts/pi-model-text.mjs");
    if direct.exists() {
        return Ok(direct);
    }

    let parent = cwd.parent().map(|path| path.join("scripts/pi-model-text.mjs"));
    if let Some(path) = parent {
        if path.exists() {
            return Ok(path);
        }
    }

    Err("Pi AI SDK helper not found at scripts/pi-model-text.mjs".to_string())
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_models(search: Option<String>) -> Result<Vec<ModelInfo>, String> {
    let mut args = vec!["--list-models".to_string()];
    if let Some(query) = search {
        args.push(query);
    }

    let output = Command::new("pi").args(&args).output().map_err(|e| format!("Failed to execute pi --list-models: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pi --list-models failed: {stderr}"));
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

            models.push(ModelInfo { provider, model, available: true, tested: false, last_test_time: None, response_time: None, status: "ready".to_string() });
        }
    }

    Ok(models)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_model(provider: String, model: String, _prompt: Option<String>) -> Result<ModelTestResult, String> {
    let args = vec!["--provider", &provider, "--model", &model, "--no-tools", "--no-skills", "--no-extensions", "--no-session", "--print"];

    let start_time = Instant::now();

    let output = Command::new("pi").args(&args).stdin(Stdio::piped()).output().map_err(|e| format!("Failed to execute pi: {e}"))?;

    let duration = start_time.elapsed().as_secs_f64();

    if output.status.success() {
        Ok(ModelTestResult { provider, model, time: duration, output: "OK".to_string(), status: "success".to_string(), error_msg: None })
    } else {
        Ok(ModelTestResult { provider, model, time: duration, output: "Failed".to_string(), status: "error".to_string(), error_msg: Some(String::from_utf8_lossy(&output.stderr).to_string()) })
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn test_models_batch(models: Vec<(String, String)>, prompt: Option<String>) -> Result<Vec<ModelTestResult>, String> {
    let mut results = Vec::new();

    for (provider, model) in models {
        match test_model(provider.clone(), model.clone(), prompt.clone()).await {
            Ok(result) => results.push(result),
            Err(e) => {
                results.push(ModelTestResult { provider, model, time: 0.0, output: String::new(), status: "error".to_string(), error_msg: Some(e) });
            }
        }
    }

    Ok(results)
}
