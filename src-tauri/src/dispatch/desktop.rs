//! Desktop command adapter routes.

use super::*;

pub(super) const COMMANDS: &[&str] = &[
    "open_url_in_system",
    "open_path_with_default_app",
    "open_path_in_system",
    "get_default_shell",
    "get_available_shells",
    "terminal_create",
    "terminal_write",
    "terminal_resize",
    "terminal_close",
    "open_session_in_browser",
    "open_session_in_terminal",
    "list_available_terminals",
    "toggle_devtools",
];

pub(super) async fn dispatch(app_state: &Option<DispatchAppState>, command: &str, payload: &Value) -> DispatchResult {
    if !COMMANDS.contains(&command) {
        return None;
    }

    Some(
        async {
            match command {
                "open_url_in_system" => {
                    let url = extract(payload, "url")?;
                    crate::open_url_in_system(url).await?;
                    Ok(Value::Null)
                }
                "open_path_with_default_app" => {
                    let path = extract(payload, "path")?;
                    crate::open_path_with_default_app(path).await?;
                    Ok(Value::Null)
                }
                "open_path_in_system" => {
                    let path = extract(payload, "path")?;
                    crate::open_path_in_system(path).await?;
                    Ok(Value::Null)
                }

                // ═══════════════════════════════════════════════════════════════
                // Session management
                // ═══════════════════════════════════════════════════════════════,
                "get_default_shell" => {
                    let shells = crate::utils::scan_shells();
                    let fallback = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
                    let default_shell = shells.first().map(|(_, p)| p.clone()).unwrap_or_else(|| fallback.to_string());
                    Ok(serde_json::json!(default_shell))
                }
                "get_available_shells" => {
                    let shells = crate::utils::scan_shells();
                    Ok(serde_json::json!(shells))
                }
                "terminal_create" | "terminal_write" | "terminal_resize" | "terminal_close" => {
                    #[cfg(feature = "gui")]
                    {
                        let state = app_state.as_ref().ok_or("Terminal commands require GUI mode")?;
                        match command {
                            "terminal_create" => {
                                let id = extract(payload, "id")?;
                                let cwd = extract(payload, "cwd")?;
                                let shell = extract(payload, "shell")?;
                                let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                                let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                                let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                                manager.create_session(id, state.app_handle.clone(), state.event_tx.clone(), cwd, shell, rows, cols)?;
                                Ok(serde_json::json!("Terminal created"))
                            }
                            "terminal_write" => {
                                let id = extract(payload, "id")?;
                                let data = extract(payload, "data")?;
                                let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                                manager.write_to_session(&id, data)?;
                                Ok(Value::Null)
                            }
                            "terminal_resize" => {
                                let id = extract(payload, "id")?;
                                let rows = payload.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
                                let cols = payload.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
                                let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                                manager.resize_session(&id, rows, cols)?;
                                Ok(Value::Null)
                            }
                            "terminal_close" => {
                                let id = extract(payload, "id")?;
                                let manager = state.terminal_manager.lock().map_err(|e| format!("Failed to lock terminal manager: {e}"))?;
                                manager.close_session(&id)?;
                                Ok(Value::Null)
                            }
                            _ => unreachable!(),
                        }
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err(format!("Command '{command}' requires GUI mode (terminal not available in CLI)"))
                    }
                }
                "open_session_in_browser" => {
                    #[cfg(feature = "gui")]
                    {
                        let path = extract(payload, "path")?;
                        crate::open_session_in_browser(path).await?;
                        Ok(Value::Null)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("open_session_in_browser is desktop-only".to_string())
                    }
                }
                "open_session_in_terminal" => {
                    #[cfg(feature = "gui")]
                    {
                        let path = extract(payload, "path")?;
                        let cwd = extract_optional_string(payload, "cwd").unwrap_or_default();
                        let terminal = extract_optional_string(payload, "terminal");
                        let pi_path = extract_optional_string(payload, "piPath").or_else(|| extract_optional_string(payload, "pi_path"));
                        let resume_command = extract_optional_string(payload, "resumeCommand").or_else(|| extract_optional_string(payload, "resume_command"));
                        crate::open_session_in_terminal(path, cwd, terminal, pi_path, resume_command).await?;
                        Ok(Value::Null)
                    }
                    #[cfg(not(feature = "gui"))]
                    {
                        Err("open_session_in_terminal is desktop-only".to_string())
                    }
                }
                "list_available_terminals" => {
                    let terminals = tokio::task::spawn_blocking(crate::domain::terminal::utils::scan_available_terminals).await.map_err(|error| format!("Terminal scan task failed: {error}"))?;
                    Ok(serde_json::json!(terminals))
                }
                "toggle_devtools" => Err("toggle_devtools is not supported via WebSocket".to_string()),
                _ => unreachable!("capability command catalog and match arms diverged"),
            }
        }
        .await,
    )
}
