mod favorites;
mod models;
mod rpc;
mod search;
mod session;
mod settings;
mod skills;

pub use favorites::*;
pub use models::*;
pub use rpc::*;
pub use search::*;
pub use session::*;
pub use settings::*;
pub use skills::*;

#[tauri::command]
pub async fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = window;
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        window.close_devtools();
        Ok(())
    }
}

/// 使用系统默认浏览器打开外部 URL
#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_shell::ShellExt;
        app.shell()
            .open(&url, None)
            .map_err(|e| format!("Failed to open URL: {}", e))
    }
    #[cfg(not(desktop))]
    {
        // Web 模式下不需要此命令，直接返回错误
        Err("open_external_url is desktop-only".to_string())
    }
}
