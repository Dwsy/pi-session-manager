use serde::Serialize;

#[cfg(feature = "gui")]
use reqwest::Url;
#[cfg(feature = "gui")]
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(feature = "gui")]
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(feature = "gui")]
static NEXT_PLUGIN_WINDOW_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PsmWindowHandle {
    pub id: String,
}

#[cfg(feature = "gui")]
fn clamp_dimension(value: Option<f64>, fallback: f64, min: f64, max: f64) -> f64 {
    value.filter(|v| v.is_finite()).unwrap_or(fallback).clamp(min, max)
}

#[cfg(feature = "gui")]
fn url_for_window(html: Option<String>, url: Option<String>) -> Result<WebviewUrl, String> {
    if let Some(html) = html.filter(|value| !value.trim().is_empty()) {
        let encoded = urlencoding::encode(&html);
        let url = Url::parse(&format!("data:text/html;charset=utf-8,{encoded}")).map_err(|error| format!("Invalid plugin window HTML document: {error}"))?;
        return Ok(WebviewUrl::External(url));
    }

    let url = url.ok_or_else(|| "Plugin window requires html or url".to_string())?;
    let parsed = Url::parse(&url).map_err(|error| format!("Invalid plugin window URL: {error}"))?;
    match parsed.scheme() {
        "http" | "https" | "data" => Ok(WebviewUrl::External(parsed)),
        scheme => Err(format!("Unsupported plugin window URL scheme: {scheme}")),
    }
}

#[cfg(feature = "gui")]
pub async fn open_plugin_window(app: AppHandle, title: String, html: Option<String>, url: Option<String>, width: Option<f64>, height: Option<f64>, _floating: Option<bool>) -> Result<PsmWindowHandle, String> {
    let id = format!("plugin-window-{}", NEXT_PLUGIN_WINDOW_ID.fetch_add(1, Ordering::Relaxed));
    let webview_url = url_for_window(html, url)?;
    let width = clamp_dimension(width, 1024.0, 320.0, 4096.0);
    let height = clamp_dimension(height, 720.0, 240.0, 3072.0);
    let title = if title.trim().is_empty() { "Plugin Window".to_string() } else { title };

    WebviewWindowBuilder::new(&app, &id, webview_url).title(title).inner_size(width, height).min_inner_size(320.0, 240.0).resizable(true).center().zoom_hotkeys_enabled(true).build().map_err(|error| format!("Failed to open plugin window: {error}"))?;

    Ok(PsmWindowHandle { id })
}

#[cfg(feature = "gui")]
pub async fn close_plugin_window(app: AppHandle, id: String) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&id) else {
        return Ok(());
    };
    window.close().map_err(|error| format!("Failed to close plugin window: {error}"))
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn plugin_window_open(app: AppHandle, title: String, html: Option<String>, url: Option<String>, width: Option<f64>, height: Option<f64>, floating: Option<bool>) -> Result<PsmWindowHandle, String> {
    open_plugin_window(app, title, html, url, width, height, floating).await
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn plugin_window_close(app: AppHandle, id: String) -> Result<(), String> {
    close_plugin_window(app, id).await
}

#[cfg(all(test, feature = "gui"))]
mod tests {
    use super::url_for_window;
    use tauri::WebviewUrl;

    #[test]
    fn accepts_inline_html_as_data_url() {
        let url = url_for_window(Some("<div>Hello Widget</div>".to_string()), None).expect("inline html should produce a valid webview url");

        match url {
            WebviewUrl::External(parsed) => {
                assert_eq!(parsed.scheme(), "data");
                let text = parsed.as_str();
                assert!(text.starts_with("data:text/html;charset=utf-8,"));
                assert!(text.contains("Hello%20Widget"));
            }
            other => panic!("expected external data url, got {other:?}"),
        }
    }
}
