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

#[cfg(all(feature = "gui", target_os = "linux"))]
use std::io::Read;
#[cfg(all(feature = "gui", target_os = "linux"))]
use std::process::Stdio;

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

/// True when the file carries the AppImage type-2 magic: an ELF header
/// followed by the "AI" bytes at offset 8.
#[cfg(feature = "gui")]
fn is_appimage_bytes(bytes: &[u8]) -> bool {
    bytes.len() > 9 && &bytes[..4] == b"\x7fELF" && &bytes[8..10] == b"AI"
}

/// Detects whether the running app is an AppImage install.
///
/// The AppImage runtime sets `APPIMAGE` to the AppImage file path. Portable
/// (linuxdeploy-extracted) installs run a plain ELF, which is only an AppImage
/// container when it carries the "AI" magic.
#[cfg(all(feature = "gui", target_os = "linux"))]
fn is_appimage_install() -> bool {
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        return !appimage.is_empty();
    }
    let Ok(mut exe) = std::fs::File::open(std::env::current_exe().unwrap_or_default()) else {
        return false;
    };
    let mut header = [0u8; 10];
    exe.read_exact(&mut header).is_ok() && is_appimage_bytes(&header)
}

/// Detects a linuxdeploy-extracted ("portable") install layout, where the
/// binary lives at `{root}/usr/bin/{name}` and bundled libraries live in
/// `{root}/usr/lib`. Returns the app root when the layout matches.
#[cfg(all(feature = "gui", target_os = "linux"))]
fn linux_install_root() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bin_dir = exe.parent()?;
    if bin_dir.file_name()?.to_str()? != "bin" {
        return None;
    }
    let usr_dir = bin_dir.parent()?;
    if usr_dir.file_name()?.to_str()? != "usr" {
        return None;
    }
    if !usr_dir.join("lib").is_dir() {
        return None;
    }
    Some(usr_dir.parent()?.to_path_buf())
}

/// Installs a downloaded AppImage over a portable (linuxdeploy-extracted)
/// install in place: extract the AppImage and copy the fresh tree over the
/// install root, preserving the extracted layout so launch scripts that prefer
/// system libraries (e.g. a wrapper that sets `LD_LIBRARY_PATH=/usr/lib` first)
/// keep working. Overwriting the binary with the AppImage file itself would
/// make every launch run with the AppImage's bundled WebKitGTK, which can fail
/// on systems with a newer system WebKit.
#[cfg(all(feature = "gui", target_os = "linux"))]
fn install_extracted_appimage(bytes: Vec<u8>, install_root: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command;

    let exe_name = std::env::current_exe().ok().and_then(|path| path.file_name().map(|name| name.to_string_lossy().into_owned())).unwrap_or_else(|| "pi-session-manager".to_string());
    let pid = std::process::id();
    let appimage_path = std::env::temp_dir().join(format!("psm-update-{pid}.AppImage"));
    let work_dir = std::env::temp_dir().join(format!("psm-update-extract-{pid}"));

    let finish = |result: Result<(), String>| {
        let _ = std::fs::remove_file(&appimage_path);
        let _ = std::fs::remove_dir_all(&work_dir);
        result
    };

    // Stage the downloaded AppImage and make it executable.
    std::fs::write(&appimage_path, &bytes).map_err(|error| format!("Failed to stage update bundle: {error}"))?;
    {
        let mut perms = std::fs::metadata(&appimage_path).map_err(|error| format!("Failed to stat staged update bundle: {error}"))?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&appimage_path, perms).map_err(|error| format!("Failed to make update bundle executable: {error}"))?;
    }
    std::fs::create_dir_all(&work_dir).map_err(|error| format!("Failed to create extraction directory: {error}"))?;

    // Extract the AppImage (its runtime honors --appimage-extract without FUSE).
    let status = Command::new(&appimage_path).arg("--appimage-extract").current_dir(&work_dir).stdout(Stdio::null()).stderr(Stdio::null()).status().map_err(|error| format!("Failed to run AppImage extractor: {error}"))?;
    if !status.success() {
        return finish(Err("Failed to extract update bundle".to_string()));
    }
    let extracted = work_dir.join("squashfs-root");
    if !extracted.is_dir() {
        return finish(Err("Update bundle did not contain a valid AppImage payload".to_string()));
    }

    // Copy the fresh tree over the install root (preserves permissions and symlinks).
    let status = Command::new("cp").arg("-a").arg(extracted.join(".")).arg(install_root).status().map_err(|error| format!("Failed to install update: {error}"))?;
    if !status.success() {
        return finish(Err("Failed to copy update into install directory".to_string()));
    }

    // Make sure the new binary is executable.
    let new_exe = install_root.join("usr").join("bin").join(&exe_name);
    {
        let mut perms = std::fs::metadata(&new_exe).map_err(|error| format!("Failed to stat installed binary: {error}"))?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&new_exe, perms).map_err(|error| format!("Failed to make installed binary executable: {error}"))?;
    }

    log::info!("Installed update over portable install at {}", install_root.display());
    finish(Ok(()))
}

#[cfg(feature = "gui")]
#[tauri::command]
pub async fn download_and_install_app_update(app: AppHandle, channel: Option<String>, request_id: String) -> Result<(), String> {
    let updater = build_channel_updater(&app, channel.as_deref().unwrap_or("stable"))?;
    let update = updater.check().await.map_err(|error| format!("Failed to check for updates before download: {error}"))?.ok_or_else(|| "No update available for current channel".to_string())?;

    let event_name = format!("app-updater-progress:{request_id}");
    let mut started = false;
    let progress = |chunk_length: usize, content_length: Option<u64>| {
        if !started {
            started = true;
            let _ = app.emit(&event_name, AppUpdateDownloadEvent::Started { content_length });
        }
        let _ = app.emit(&event_name, AppUpdateDownloadEvent::Progress { chunk_length });
    };
    let finished = || {
        let _ = app.emit(&event_name, AppUpdateDownloadEvent::Finished);
    };

    // Linux portable installs must not be overwritten with the AppImage file:
    // the AppImage bundles its own WebKitGTK, which can break the webview on
    // systems with a newer system WebKit (see install_extracted_appimage).
    // Keep the extracted layout instead. Other layouts (and all non-Linux
    // platforms) keep the plugin's default installer.
    #[cfg(target_os = "linux")]
    if !is_appimage_install() {
        if let Some(install_root) = linux_install_root() {
            let bytes = update.download(progress, finished).await.map_err(|error| format!("Failed to download update: {error}"))?;
            return install_extracted_appimage(bytes, &install_root);
        }
        log::info!("Skipping portable-install updater path: no linuxdeploy layout detected");
    }

    update.download_and_install(progress, finished).await.map_err(|error| format!("Failed to download and install update: {error}"))
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

    #[test]
    fn detects_appimage_type2_magic() {
        let mut appimage = [0u8; 10];
        appimage[..4].copy_from_slice(b"\x7fELF");
        appimage[8..10].copy_from_slice(b"AI");
        assert!(is_appimage_bytes(&appimage));

        // A plain ELF binary has no "AI" magic.
        let mut plain_elf = [0u8; 10];
        plain_elf[..4].copy_from_slice(b"\x7fELF");
        assert!(!is_appimage_bytes(&plain_elf));

        // Short inputs and non-ELF magic are rejected.
        assert!(!is_appimage_bytes(&[]));
        assert!(!is_appimage_bytes(&appimage[..9]));
        let mut not_elf = [0u8; 10];
        not_elf[8..10].copy_from_slice(b"AI");
        assert!(!is_appimage_bytes(&not_elf));
    }
}
