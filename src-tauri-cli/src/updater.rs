//! Standalone CLI self-update module.
//!
//! Fetches the latest version from the update-manifests branch (same source as
//! the GUI updater), compares with the current binary version, and can download
//! + replace the running binary on macOS/Linux.
//!
//! Windows is NOT supported for self-install (the running exe is locked by the
//! OS). On Windows the user is told to stop and use the install script instead.

use anyhow::{anyhow, Result};
use colored::*;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

/// Shared update-channel config (same file the GUI embeds).
const UPDATE_CHANNELS_JSON: &str = include_str!("../../src/runtime-data/update-channels.json");

/// GitHub proxy used to work around network restrictions (mirrors the GUI).
const JSP_PROXY_ORIGIN: &str = "https://jsp.dwsy.link";
const JSP_PROXY_VERSION: &str = "110";

// ─── Config types ───────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChannelsConfig {
    owner: String,
    repo: String,
    manifest_branch: String,
    channels: std::collections::BTreeMap<String, UpdateChannelEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChannelEntry {
    manifest_path: String,
}

/// Tauri-updater style manifest (we only need version + notes).
#[derive(Debug, Clone, Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    body: Option<String>,
}

// ─── Public API ─────────────────────────────────────────────

/// Result of an update check.
#[derive(Debug, Clone)]
pub struct UpdateInfo {
    pub update_available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub body: Option<String>,
}

/// Check whether a newer version is available on the given channel.
pub async fn check_update(channel: &str) -> Result<UpdateInfo> {
    let client = build_client()?;
    let manifest_body = fetch_manifest_body(&client, channel).await?;
    let manifest: Manifest = serde_json::from_str(&manifest_body).map_err(|e| anyhow!("Failed to parse update manifest: {e}"))?;

    let current = current_version();
    let latest = manifest.version.trim().trim_start_matches('v');

    let update_available = match (parse_version(current), parse_version(latest)) {
        (Ok(cur), Ok(lat)) => lat > cur,
        // If parsing fails, fall back to string comparison
        _ => latest != current,
    };

    let body = manifest.notes.or(manifest.body);

    Ok(UpdateInfo { update_available, current_version: current.to_string(), latest_version: latest.to_string(), body })
}

/// Download the latest binary and replace the current executable.
/// Panics-free: returns Err on any failure.
pub async fn download_and_install(info: &UpdateInfo, _channel: &str) -> Result<()> {
    if is_windows() {
        return Err(anyhow!("Windows 不支持 CLI 自更新"));
    }

    let client = build_client()?;
    let config = channels_config()?;
    let tag = format!("v{}", info.latest_version);
    let asset = platform_asset()?;

    let download_url = format!("https://github.com/{}/{}/releases/download/{}/{}", config.owner, config.repo, tag, asset);
    let sha_url = format!("{download_url}.sha256");

    // Download binary
    println!("{} Downloading {} ...", "→".cyan(), asset.yellow());
    let binary_data = download_bytes(&client, &download_url, asset).await?;

    // Download and verify checksum
    println!("{} Verifying SHA256...", "→".cyan());
    match download_text(&client, &sha_url).await {
        Ok(sha_content) => {
            if let Some(expected) = parse_sha256_file(&sha_content) {
                let actual = sha256_hex(&binary_data);
                if !expected.eq_ignore_ascii_case(&actual) {
                    return Err(anyhow!("SHA256 校验失败!\n  期望: {expected}\n  实际: {actual}"));
                }
                println!("  {}", "✓ Checksum verified".green());
            } else {
                println!("  {}", "⚠ Could not parse checksum file, skipping verification".yellow());
            }
        }
        Err(_) => {
            println!("  {}", "⚠ Checksum file not available, skipping verification".yellow());
        }
    }

    // Replace binary
    println!("{} Installing...", "→".cyan());
    replace_current_binary(&binary_data)?;

    Ok(())
}

// ─── Internal helpers ───────────────────────────────────────

fn build_client() -> Result<Client> {
    Client::builder().timeout(Duration::from_secs(120)).connect_timeout(Duration::from_secs(15)).build().map_err(|e| anyhow!("Failed to create HTTP client: {e}"))
}

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn normalize_channel(value: &str) -> &str {
    if value == "beta" {
        "beta"
    } else {
        "stable"
    }
}

fn channels_config() -> Result<UpdateChannelsConfig> {
    serde_json::from_str(UPDATE_CHANNELS_JSON).map_err(|e| anyhow!("Failed to parse update channel config: {e}"))
}

/// Build the ordered list of manifest URLs for a channel (direct + proxied).
fn manifest_urls(channel: &str) -> Result<Vec<String>> {
    let normalized = normalize_channel(channel);
    let config = channels_config()?;
    let entry = config.channels.get(normalized).ok_or_else(|| anyhow!("Unknown update channel: {normalized}"))?;

    let direct = [format!("https://raw.githubusercontent.com/{}/{}/{}/{}", config.owner, config.repo, config.manifest_branch, entry.manifest_path), format!("https://cdn.jsdelivr.net/gh/{}/{}@{}/{}", config.owner, config.repo, config.manifest_branch, entry.manifest_path)];

    let mut urls: Vec<String> = direct.to_vec();
    for u in &direct {
        urls.push(format!("{JSP_PROXY_ORIGIN}/http/{u}"));
    }
    Ok(urls)
}

/// Referer header required by the jsp proxy (mirrors the GUI implementation).
fn github_proxy_referer() -> String {
    let params = [("--ver", JSP_PROXY_VERSION), ("--mode", "cors"), ("--type", ""), ("--aceh", "1"), ("--level", "1")];
    let query = params.iter().map(|(k, v)| format!("{}={}", k, urlencoding::encode(v))).collect::<Vec<_>>().join("&");
    format!("{JSP_PROXY_ORIGIN}/?{query}")
}

/// Fetch the first reachable manifest body across all sources.
async fn fetch_manifest_body(client: &Client, channel: &str) -> Result<String> {
    let urls = manifest_urls(channel)?;
    let referer = github_proxy_referer();
    let mut last_err: Option<String> = None;

    for url in &urls {
        let mut req = client.get(url);
        if url.starts_with(JSP_PROXY_ORIGIN) {
            req = req.header(reqwest::header::REFERER, referer.clone());
        }
        match req.send().await {
            Ok(resp) if resp.status().is_success() => match resp.text().await {
                Ok(text) => return Ok(text),
                Err(e) => last_err = Some(format!("{url}: {e}")),
            },
            Ok(resp) => last_err = Some(format!("{url}: HTTP {}", resp.status())),
            Err(e) => last_err = Some(format!("{url}: {e}")),
        }
    }

    Err(anyhow!("Failed to fetch update manifest from all sources.\n  Last error: {}", last_err.unwrap_or_else(|| "unknown".into())))
}

/// Map the current platform to the release asset name.
fn platform_asset() -> Result<&'static str> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        Ok("pi-session-cli-macos-arm64")
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        Ok("pi-session-cli-macos-x64")
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        Ok("pi-session-cli-linux-x64")
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        Ok("pi-session-cli-linux-arm64")
    }
    #[cfg(target_os = "windows")]
    {
        Ok("pi-session-cli-windows-x64.exe")
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err(anyhow!("Unsupported platform for CLI self-update"))
    }
}

fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

fn parse_version(raw: &str) -> Result<semver::Version> {
    let cleaned = raw.trim().trim_start_matches('v');
    semver::Version::parse(cleaned).map_err(|e| anyhow!("Invalid version '{raw}': {e}"))
}

/// Download bytes with progress display.
async fn download_bytes(client: &Client, url: &str, label: &str) -> Result<Vec<u8>> {
    use futures_util::StreamExt;

    let resp = client.get(url).send().await.map_err(|e| anyhow!("Download failed ({url}): {e}"))?;

    if !resp.status().is_success() {
        return Err(anyhow!("Download failed: HTTP {} ({url})", resp.status()));
    }

    let total = resp.content_length();
    let mut stream = resp.bytes_stream();
    let mut data: Vec<u8> = Vec::with_capacity(total.unwrap_or(8 * 1024 * 1024) as usize);
    let mut downloaded: u64 = 0;
    let mut last_print = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow!("Download stream error: {e}"))?;
        downloaded += chunk.len() as u64;
        data.extend_from_slice(&chunk);

        // Throttle progress output to ~4x/sec
        if last_print.elapsed().as_millis() > 250 {
            print_progress(label, downloaded, total);
            last_print = std::time::Instant::now();
        }
    }

    // Final progress line
    print_progress(label, downloaded, total);
    println!();

    Ok(data)
}

/// Download text content (for checksum files).
async fn download_text(client: &Client, url: &str) -> Result<String> {
    let resp = client.get(url).send().await.map_err(|e| anyhow!("{e}"))?;
    if !resp.status().is_success() {
        return Err(anyhow!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| anyhow!("{e}"))
}

fn print_progress(label: &str, downloaded: u64, total: Option<u64>) {
    let mb = downloaded as f64 / 1024.0 / 1024.0;
    match total {
        Some(t) if t > 0 => {
            let total_mb = t as f64 / 1024.0 / 1024.0;
            let pct = (downloaded as f64 / t as f64 * 100.0) as u32;
            print!("\r  {} {:.1} / {:.1} MB ({pct}%)   ", label.dimmed(), mb, total_mb);
        }
        _ => {
            print!("\r  {} {:.1} MB   ", label.dimmed(), mb);
        }
    }
    let _ = std::io::stdout().flush();
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Parse a `.sha256` file (format: `<hash>  <filename>`).
fn parse_sha256_file(content: &str) -> Option<String> {
    content.lines().next().and_then(|line| line.split_whitespace().next()).map(|s| s.to_lowercase()).filter(|s| s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Atomically replace the current executable with new contents.
fn replace_current_binary(new_contents: &[u8]) -> Result<()> {
    let exe = std::env::current_exe().map_err(|e| anyhow!("Cannot determine current executable path: {e}"))?;
    let dir = exe.parent().ok_or_else(|| anyhow!("Cannot determine executable directory"))?;

    // Write to a temp file in the same directory (same filesystem → atomic rename)
    let tmp = temp_path_in(dir, &exe);
    std::fs::write(&tmp, new_contents).map_err(|e| anyhow!("Failed to write temp file: {e}"))?;

    // Set executable permission (Unix)
    set_executable(&tmp);

    // Atomic rename
    std::fs::rename(&tmp, &exe).map_err(|e| {
        // Cleanup temp on failure
        let _ = std::fs::remove_file(&tmp);
        anyhow!("Failed to replace binary (permission denied?): {e}")
    })?;

    Ok(())
}

fn temp_path_in(dir: &std::path::Path, exe: &std::path::Path) -> PathBuf {
    let name = exe.file_name().unwrap_or_default().to_string_lossy();
    dir.join(format!(".{name}.update.tmp"))
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn set_executable(_path: &std::path::Path) {}

// ─── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_channel() {
        assert_eq!(normalize_channel("stable"), "stable");
        assert_eq!(normalize_channel("beta"), "beta");
        assert_eq!(normalize_channel("nightly"), "stable");
        assert_eq!(normalize_channel(""), "stable");
    }

    #[test]
    fn parses_version_with_prefix() {
        assert_eq!(parse_version("v0.7.0").unwrap(), semver::Version::new(0, 7, 0));
        assert_eq!(parse_version("0.7.0").unwrap(), semver::Version::new(0, 7, 0));
        assert!(parse_version("not-a-version").is_err());
    }

    #[test]
    fn maps_known_platforms() {
        // This test only passes on known platforms
        #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
        {
            assert!(platform_asset().is_ok());
        }
    }

    #[test]
    fn parses_sha256_file() {
        let content = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd  pi-session-cli-macos-arm64\n";
        assert_eq!(parse_sha256_file(content), Some("abc123def456abc123def456abc123def456abc123def456abc123def456abcd".to_string()));

        // Invalid: too short
        assert_eq!(parse_sha256_file("abc123  file"), None);
        // Empty
        assert_eq!(parse_sha256_file(""), None);
    }

    #[test]
    fn manifest_urls_include_fallbacks() {
        let urls = manifest_urls("stable").unwrap();
        assert!(urls.len() >= 4); // 2 direct + 2 proxied
        assert!(urls[0].contains("raw.githubusercontent.com"));
        assert!(urls[1].contains("cdn.jsdelivr.net"));
        assert!(urls[2].contains(JSP_PROXY_ORIGIN));
        assert!(urls[3].contains(JSP_PROXY_ORIGIN));
    }

    #[test]
    fn channels_config_parses() {
        let config = channels_config().unwrap();
        assert_eq!(config.owner, "Dwsy");
        assert_eq!(config.repo, "pi-session-manager");
        assert!(config.channels.contains_key("stable"));
        assert!(config.channels.contains_key("beta"));
    }
}
