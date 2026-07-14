//! Shared CLI argument parsing and configuration logic.
//!
//! Used by both `main.rs` (GUI+CLI) and `main-cli.rs` (standalone CLI)
//! to avoid code duplication.

use serde::Deserialize;

/// Parsed CLI arguments common to both entry points.
#[derive(Debug, Default)]
pub struct CommonCliArgs {
    pub show_help: bool,
    pub http_port: Option<u16>,
    pub bind_addr: Option<String>,
    pub auth_enabled: Option<bool>,
    pub runtime_token: Option<String>,
}

/// Parse a port value from a CLI argument string.
pub fn parse_port_arg(value: &str, flag: &str) -> Result<u16, String> {
    value.parse::<u16>().map_err(|_| format!("Invalid value for {flag}: `{value}`"))
}

/// Parse common CLI arguments from raw args iterator.
///
/// This handles: `-h`, `--help`, `-p`, `--port`, `-b`, `--bind`,
/// `--auth`, `--no-auth`, `--token`.
///
/// Unknown flags starting with `-` return an error.
pub fn parse_common_args(raw_args: &[String]) -> Result<CommonCliArgs, String> {
    if raw_args.iter().any(|arg| arg == "-h" || arg == "--help") {
        return Ok(CommonCliArgs { show_help: true, ..CommonCliArgs::default() });
    }

    let mut parsed = CommonCliArgs::default();
    let mut iter = raw_args.iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-p" | "--port" => {
                let value = iter.next().ok_or_else(|| format!("Missing value for `{arg}`"))?;
                parsed.http_port = Some(parse_port_arg(value, arg)?);
            }
            "-b" | "--bind" => {
                let value = iter.next().ok_or_else(|| format!("Missing value for `{arg}`"))?;
                if value.trim().is_empty() {
                    return Err(format!("Invalid value for `{arg}`: empty address"));
                }
                parsed.bind_addr = Some(value.clone());
            }
            "--auth" => {
                if parsed.auth_enabled == Some(false) {
                    return Err("Cannot use `--auth` with `--no-auth`".to_string());
                }
                parsed.auth_enabled = Some(true);
            }
            "--no-auth" => {
                if parsed.auth_enabled == Some(true) {
                    return Err("Cannot use `--auth` with `--no-auth`".to_string());
                }
                parsed.auth_enabled = Some(false);
            }
            "--token" => {
                let value = iter.next().ok_or_else(|| "Missing value for `--token`".to_string())?;
                let token = value.trim();
                if token.is_empty() {
                    return Err("Invalid value for `--token`: empty token".to_string());
                }
                parsed.runtime_token = Some(token.to_string());
            }
            // Skip non-flag args (e.g. --cli, --headless handled by caller)
            _ if arg.starts_with('-') => {
                return Err(format!("Unknown argument: `{arg}`"));
            }
            _ => {}
        }
    }

    Ok(parsed)
}

/// Server configuration loaded from config file.
#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub ws_enabled: bool,
    pub http_enabled: bool,
    pub ws_port: u16,
    pub http_port: u16,
    pub bind_addr: String,
    pub auth_enabled: bool,
    #[serde(default)]
    pub embedding_enabled: bool,
    /// Whether to serve frontend assets via HTTP. None defaults to enabled.
    #[serde(default)]
    pub serve_frontend: Option<bool>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self { ws_enabled: true, http_enabled: true, ws_port: 52131, http_port: 52131, bind_addr: "127.0.0.1".to_string(), auth_enabled: true, embedding_enabled: false, serve_frontend: None }
    }
}

impl ServerConfig {
    /// Resolve whether the HTTP server should expose the embedded web UI.
    ///
    /// Both desktop and CLI builds embed the frontend. Keeping it enabled by
    /// default makes the advertised HTTP address usable in either mode, while
    /// an explicit `false` still supports API-only deployments.
    pub fn should_serve_frontend(&self) -> bool {
        self.serve_frontend.unwrap_or(true)
    }
}

/// Load server settings from the unified config file.
pub fn load_server_config() -> ServerConfig {
    let value = crate::unified_config::read_section("server").unwrap_or_else(|_| {
        serde_json::json!({
            "ws_enabled": true,
            "http_enabled": true,
            "ws_port": 52131,
            "http_port": 52131,
            "bind_addr": "127.0.0.1",
            "auth_enabled": true,
            "embedding_enabled": false
        })
    });

    ServerConfig {
        ws_enabled: value["ws_enabled"].as_bool().unwrap_or(true),
        http_enabled: value["http_enabled"].as_bool().unwrap_or(true),
        ws_port: value["ws_port"].as_u64().unwrap_or(52131) as u16,
        http_port: value["http_port"].as_u64().unwrap_or(52131) as u16,
        bind_addr: value["bind_addr"].as_str().unwrap_or("127.0.0.1").to_string(),
        auth_enabled: value["auth_enabled"].as_bool().unwrap_or(true),
        embedding_enabled: value["embedding_enabled"].as_bool().unwrap_or(false),
        serve_frontend: value["serve_frontend"].as_bool(),
    }
}

/// Apply CLI overrides to server configuration.
pub fn apply_server_overrides(server_cfg: &mut ServerConfig, cli_args: &CommonCliArgs) {
    if let Some(port) = cli_args.http_port {
        server_cfg.http_port = port;
    }
    if let Some(ref bind_addr) = cli_args.bind_addr {
        server_cfg.bind_addr = bind_addr.clone();
    }
    if let Some(auth_enabled) = cli_args.auth_enabled {
        server_cfg.auth_enabled = auth_enabled;
    }
}

/// Initialize auth and apply runtime token if provided.
///
/// Returns `true` if auth was successfully initialized.
pub fn init_auth(runtime_token: &Option<String>, cli_mode: bool) -> bool {
    match crate::auth::init() {
        Ok(token) => {
            if let Some(cli_token) = runtime_token.as_ref() {
                if let Err(e) = crate::auth::set_runtime_tokens(vec![cli_token.clone()]) {
                    eprintln!("Failed to set runtime token: {e}");
                    std::process::exit(2);
                }
                if cli_mode {
                    log::info!("Auth enabled (runtime token loaded from CLI)");
                }
            } else {
                let _ = crate::auth::set_runtime_tokens(Vec::new());
                if cli_mode {
                    log::info!("Auth token: {token}");
                }
            }
            true
        }
        Err(e) => {
            eprintln!("Failed to init auth: {e}");
            false
        }
    }
}

/// Get the default config file path.
pub fn default_config_path() -> std::path::PathBuf {
    crate::unified_config::config_file_path().unwrap_or_else(|_| std::env::temp_dir().join("config.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_port_arg_valid() {
        assert_eq!(parse_port_arg("8080", "--port").unwrap(), 8080);
    }

    #[test]
    fn test_parse_port_arg_invalid() {
        assert!(parse_port_arg("abc", "--port").is_err());
    }

    #[test]
    fn test_parse_common_args_help() {
        let args = vec!["--help".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert!(result.show_help);
    }

    #[test]
    fn test_parse_common_args_port() {
        let args = vec!["-p".to_string(), "9090".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert_eq!(result.http_port, Some(9090));
    }

    #[test]
    fn test_parse_common_args_bind() {
        let args = vec!["-b".to_string(), "0.0.0.0".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert_eq!(result.bind_addr.as_deref(), Some("0.0.0.0"));
    }

    #[test]
    fn test_parse_common_args_auth() {
        let args = vec!["--auth".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert_eq!(result.auth_enabled, Some(true));
    }

    #[test]
    fn test_parse_common_args_no_auth() {
        let args = vec!["--no-auth".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert_eq!(result.auth_enabled, Some(false));
    }

    #[test]
    fn test_parse_common_args_token() {
        let args = vec!["--token".to_string(), "my-secret".to_string()];
        let result = parse_common_args(&args).unwrap();
        assert_eq!(result.runtime_token.as_deref(), Some("my-secret"));
    }

    #[test]
    fn test_parse_common_args_auth_conflict() {
        let args = vec!["--auth".to_string(), "--no-auth".to_string()];
        assert!(parse_common_args(&args).is_err());
    }

    #[test]
    fn test_parse_common_args_empty_token() {
        let args = vec!["--token".to_string(), "".to_string()];
        assert!(parse_common_args(&args).is_err());
    }

    #[test]
    fn test_parse_common_args_unknown_flag() {
        let args = vec!["--unknown".to_string()];
        assert!(parse_common_args(&args).is_err());
    }

    #[test]
    fn test_server_config_default() {
        let cfg = ServerConfig::default();
        assert_eq!(cfg.http_port, 52131);
        assert_eq!(cfg.bind_addr, "127.0.0.1");
        assert!(cfg.auth_enabled);
        assert!(cfg.should_serve_frontend());
    }

    #[test]
    fn test_explicitly_disables_frontend_serving() {
        let cfg = ServerConfig { serve_frontend: Some(false), ..ServerConfig::default() };
        assert!(!cfg.should_serve_frontend());
    }

    #[test]
    fn test_apply_server_overrides() {
        let mut cfg = ServerConfig::default();
        let cli = CommonCliArgs { http_port: Some(9090), bind_addr: Some("0.0.0.0".to_string()), auth_enabled: Some(false), ..Default::default() };
        apply_server_overrides(&mut cfg, &cli);
        assert_eq!(cfg.http_port, 9090);
        assert_eq!(cfg.bind_addr, "0.0.0.0");
        assert!(!cfg.auth_enabled);
    }
}
