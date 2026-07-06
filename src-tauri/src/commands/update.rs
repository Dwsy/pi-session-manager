#[cfg(feature = "gui")]
use reqwest::{
    header::{HeaderMap, HeaderValue, REFERER},
    Url,
};
#[cfg(feature = "gui")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "gui")]
use tauri::{AppHandle, Emitter, Runtime};
#[cfg(feature = "gui")]
use tauri_plugin_updater::UpdaterExt;

#[cfg(feature = "gui")]
const UPDATE_CHANNELS_JSON: &str = include_str!("../../../src/runtime-data/update-channels.json");
#[cfg(feature = "gui")]
const JSP_PROXY_ORIGIN: &str = "https://jsp.dwsy.link";
#[cfg(feature = "gui")]
const JSP_PROXY_VERSION: &str = "110";

#[cfg(feature = "gui")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChannelsConfig {
    owner: String,
    repo: String,
    manifest_branch: String,
    channels: std::collections::BTreeMap<String, UpdateChannelEntry>,
}

#[cfg(feature = "gui")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChannelEntry {
    manifest_path: String,
}

#[cfg(feature = "gui")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateMetadata {
    pub current_version: String,
    pub version: String,
    pub date: Option<String>,
    pub body: Option<String>,
    pub raw_json: serde_json::Value,
}

#[cfg(feature = "gui")]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum AppUpdateDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

#[cfg(feature = "gui")]
fn normalize_update_channel(value: &str) -> &str {
    if value == "beta" {
        "beta"
    } else {
        "stable"
    }
}

#[cfg(feature = "gui")]
fn update_channels_config() -> Result<UpdateChannelsConfig, String> {
    serde_json::from_str(UPDATE_CHANNELS_JSON).map_err(|error| format!("Failed to parse shared update channel config: {error}"))
}

#[cfg(feature = "gui")]
fn update_manifest_urls(channel: &str) -> Result<Vec<Url>, String> {
    let normalized = normalize_update_channel(channel);
    let config = update_channels_config()?;
    let entry = config.channels.get(normalized).ok_or_else(|| format!("Unknown update channel: {normalized}"))?;

    let direct_urls = [format!("https://raw.githubusercontent.com/{}/{}/{}/{}", config.owner, config.repo, config.manifest_branch, entry.manifest_path), format!("https://cdn.jsdelivr.net/gh/{}/{}@{}/{}", config.owner, config.repo, config.manifest_branch, entry.manifest_path)];

    direct_urls.iter().cloned().chain(direct_urls.iter().map(|value| format!("{JSP_PROXY_ORIGIN}/http/{value}"))).map(|value| Url::parse(&value).map_err(|error| format!("Invalid update endpoint {value}: {error}"))).collect()
}

#[cfg(feature = "gui")]
fn github_proxy_referer() -> String {
    let mut params = std::collections::BTreeMap::new();
    params.insert("--ver", JSP_PROXY_VERSION);
    params.insert("--mode", "cors");
    params.insert("--type", "");
    params.insert("--aceh", "1");
    params.insert("--level", "1");
    let query = params.into_iter().map(|(key, value)| format!("{}={}", key, urlencoding::encode(value))).collect::<Vec<_>>().join("&");
    format!("{JSP_PROXY_ORIGIN}/?{query}")
}

#[cfg(feature = "gui")]
fn build_channel_updater<R: Runtime>(app: &AppHandle<R>, channel: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoints = update_manifest_urls(channel)?;
    let mut headers = HeaderMap::new();
    headers.insert(REFERER, HeaderValue::from_str(&github_proxy_referer()).map_err(|error| format!("Invalid updater Referer header: {error}"))?);

    app.updater_builder().endpoints(endpoints).map_err(|error| format!("Failed to configure updater endpoints: {error}"))?.headers(headers).build().map_err(|error| format!("Failed to build updater: {error}"))
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn check_app_update(app: AppHandle, channel: Option<String>) -> Result<Option<AppUpdateMetadata>, String> {
    let updater = build_channel_updater(&app, channel.as_deref().unwrap_or("stable"))?;
    let update = updater.check().await.map_err(|error| format!("Failed to check for updates: {error}"))?;
    Ok(update.map(|item| AppUpdateMetadata { current_version: item.current_version.clone(), version: item.version.clone(), date: item.date.map(|value| value.to_string()), body: item.body.clone(), raw_json: item.raw_json.clone() }))
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn download_and_install_app_update(app: AppHandle, channel: Option<String>, request_id: String) -> Result<(), String> {
    let updater = build_channel_updater(&app, channel.as_deref().unwrap_or("stable"))?;
    let update = updater.check().await.map_err(|error| format!("Failed to check for updates before download: {error}"))?.ok_or_else(|| "No update available for current channel".to_string())?;

    let event_name = format!("app-updater-progress:{request_id}");
    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = app.emit(&event_name, AppUpdateDownloadEvent::Started { content_length });
                }
                let _ = app.emit(&event_name, AppUpdateDownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = app.emit(&event_name, AppUpdateDownloadEvent::Finished);
            },
        )
        .await
        .map_err(|error| format!("Failed to download and install update: {error}"))
}

#[cfg(feature = "gui")]
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_update_channel() {
        assert_eq!(normalize_update_channel("stable"), "stable");
        assert_eq!(normalize_update_channel("beta"), "beta");
        assert_eq!(normalize_update_channel("nightly"), "stable");
    }

    #[test]
    fn shared_channel_config_defines_manifest_paths() {
        let config = update_channels_config().expect("shared config");
        assert_eq!(config.channels.get("stable").map(|entry| entry.manifest_path.as_str()), Some("stable/latest.json"));
        assert_eq!(config.channels.get("beta").map(|entry| entry.manifest_path.as_str()), Some("beta/latest.json"));
    }

    #[test]
    fn builds_channel_specific_manifest_urls() {
        let stable = update_manifest_urls("stable").expect("stable urls");
        let beta = update_manifest_urls("beta").expect("beta urls");
        assert!(stable[0].as_str().contains("/stable/latest.json"));
        assert!(beta[0].as_str().contains("/beta/latest.json"));
        assert!(stable[1].as_str().contains("@update-manifests/stable/latest.json"));
        assert!(beta[1].as_str().contains("@update-manifests/beta/latest.json"));
    }
}
