use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Send a system notification
#[cfg(feature = "gui")]
#[tauri::command]
pub async fn send_notification(app: AppHandle, title: String, body: String, session_path: Option<String>) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title).body(body);

    // Store session path in notification extras for click handling
    if let Some(path) = session_path {
        builder = builder.extra("session_path", path);
    }

    builder.show().map_err(|e| format!("Failed to show notification: {e}"))?;
    Ok(())
}
