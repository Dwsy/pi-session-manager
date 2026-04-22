#![cfg(feature = "gui")]

use tauri::{Listener, Manager};

const DEFAULT_WINDOW_WIDTH: f64 = 1400.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 900.0;
const DEFAULT_MIN_WINDOW_WIDTH: f64 = 1000.0;
const DEFAULT_MIN_WINDOW_HEIGHT: f64 = 600.0;

fn clamp_window_dimensions(available_width: f64, available_height: f64) -> ((f64, f64), (f64, f64)) {
    let initial_width = DEFAULT_WINDOW_WIDTH.min(available_width).max(1.0);
    let initial_height = DEFAULT_WINDOW_HEIGHT.min(available_height).max(1.0);
    let min_width = DEFAULT_MIN_WINDOW_WIDTH.min(initial_width);
    let min_height = DEFAULT_MIN_WINDOW_HEIGHT.min(initial_height);

    ((initial_width, initial_height), (min_width, min_height))
}

fn resolve_window_dimensions(monitor: Option<&tauri::Monitor>) -> ((f64, f64), (f64, f64)) {
    monitor.map_or(((DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT), (DEFAULT_MIN_WINDOW_WIDTH, DEFAULT_MIN_WINDOW_HEIGHT)), |monitor| {
        let work_area = monitor.work_area();
        let scale_factor = monitor.scale_factor();

        clamp_window_dimensions(f64::from(work_area.size.width) / scale_factor, f64::from(work_area.size.height) / scale_factor)
    })
}

#[cfg(test)]
mod tests {
    use super::{clamp_window_dimensions, DEFAULT_MIN_WINDOW_HEIGHT, DEFAULT_MIN_WINDOW_WIDTH};

    #[test]
    fn test_clamp_window_dimensions_preserves_default_size_on_large_screens() {
        let ((initial_width, initial_height), (min_width, min_height)) = clamp_window_dimensions(1728.0, 1117.0);

        assert_eq!(initial_width, 1400.0);
        assert_eq!(initial_height, 900.0);
        assert_eq!(min_width, DEFAULT_MIN_WINDOW_WIDTH);
        assert_eq!(min_height, DEFAULT_MIN_WINDOW_HEIGHT);
    }

    #[test]
    fn test_clamp_window_dimensions_shrinks_to_fit_smaller_work_areas() {
        let ((initial_width, initial_height), (min_width, min_height)) = clamp_window_dimensions(1352.0, 820.0);

        assert_eq!(initial_width, 1352.0);
        assert_eq!(initial_height, 820.0);
        assert_eq!(min_width, DEFAULT_MIN_WINDOW_WIDTH);
        assert_eq!(min_height, 600.0);
    }

    #[test]
    fn test_clamp_window_dimensions_caps_minimum_size_to_available_space() {
        let ((initial_width, initial_height), (min_width, min_height)) = clamp_window_dimensions(920.0, 560.0);

        assert_eq!(initial_width, 920.0);
        assert_eq!(initial_height, 560.0);
        assert_eq!(min_width, 920.0);
        assert_eq!(min_height, 560.0);
    }
}

#[derive(Debug, Default)]
struct MainCliArgs {
    show_help: bool,
    cli_mode: bool,
    http_port: Option<u16>,
    bind_addr: Option<String>,
    auth_enabled: Option<bool>,
    runtime_token: Option<String>,
}

fn parse_port_arg(value: &str, flag: &str) -> Result<u16, String> {
    value.parse::<u16>().map_err(|_| format!("Invalid value for {flag}: `{value}`"))
}

fn parse_main_cli_args() -> Result<MainCliArgs, String> {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();
    if raw_args.iter().any(|arg| arg == "-h" || arg == "--help") {
        return Ok(MainCliArgs { show_help: true, ..MainCliArgs::default() });
    }

    let cli_mode = raw_args.iter().any(|arg| arg == "--cli" || arg == "--headless");
    if !cli_mode {
        return Ok(MainCliArgs { cli_mode: false, ..MainCliArgs::default() });
    }

    let mut parsed = MainCliArgs { cli_mode: true, ..MainCliArgs::default() };

    let mut iter = raw_args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--cli" | "--headless" => {}
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
            _ if arg.starts_with('-') => {
                return Err(format!("Unknown argument in CLI mode: `{arg}`"));
            }
            _ => {}
        }
    }

    Ok(parsed)
}

fn print_help() {
    println!(
        "Pi Session Manager\n\
         \n\
         USAGE:\n\
           pi-session-manager [OPTIONS]\n\
         \n\
         OPTIONS:\n\
           -h, --help           Show this help message\n\
               --cli            Run in headless CLI mode\n\
               --headless       Alias of --cli\n\
           -p, --port <PORT>    Shared HTTP/WS port in CLI mode\n\
           -b, --bind <ADDR>    Bind address in CLI mode\n\
               --auth           Enable auth (requires token for non-local requests)\n\
               --no-auth        Disable auth\n\
               --token <TOKEN>  Runtime-only token, overrides DB tokens for this process\n\
         \n\
         NOTES:\n\
           - Without --cli/--headless, app starts in GUI mode\n\
           - -p/-b/--auth/--no-auth/--token are effective only in CLI mode"
    );
}

fn apply_cli_overrides(server_cfg: &mut pi_session_manager::ServerSettings, cli_args: &MainCliArgs) {
    if let Some(port) = cli_args.http_port {
        server_cfg.http_port = port;
    }
    if let Some(bind_addr) = &cli_args.bind_addr {
        server_cfg.bind_addr = bind_addr.clone();
    }
    if let Some(auth_enabled) = cli_args.auth_enabled {
        server_cfg.auth_enabled = auth_enabled;
    }
}

fn main() {
    tracing_subscriber::fmt::init();

    let cli_args = match parse_main_cli_args() {
        Ok(args) => args,
        Err(err) => {
            eprintln!("Error: {err}");
            eprintln!();
            print_help();
            std::process::exit(2);
        }
    };
    if cli_args.show_help {
        print_help();
        return;
    }
    let cli_mode = cli_args.cli_mode;

    // Load server settings before builder (sync, no runtime needed)
    let mut server_cfg = pi_session_manager::load_server_settings_sync();
    apply_cli_overrides(&mut server_cfg, &cli_args);
    let runtime_token = cli_args.runtime_token.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Start file watcher for all session directories
            match pi_session_manager::file_watcher::start_watcher_for_all_dirs(app_handle.clone()) {
                Ok(watcher_state) => {
                    app_handle.manage(watcher_state);
                }
                Err(e) => {
                    eprintln!("Failed to start file watcher: {e}");
                }
            }

            // Initialize auth (only if enabled)
            if server_cfg.auth_enabled {
                match pi_session_manager::auth::init() {
                    Ok(token) => {
                        if let Some(cli_token) = runtime_token.as_ref() {
                            if let Err(e) = pi_session_manager::auth::set_runtime_tokens(vec![cli_token.clone()]) {
                                eprintln!("Failed to set runtime token: {e}");
                                std::process::exit(2);
                            }
                            if cli_mode {
                                log::info!("Auth enabled (runtime token loaded from CLI)");
                            }
                        } else {
                            let _ = pi_session_manager::auth::set_runtime_tokens(Vec::new());
                            if cli_mode {
                                log::info!("Auth token: {token}");
                            }
                        }
                    }
                    Err(e) => eprintln!("Failed to init auth: {e}"),
                }
            } else if runtime_token.is_some() && cli_mode {
                log::warn!("`--token` is ignored because auth is disabled");
            }

            // Initialize AppState and manage it
            let app_state = pi_session_manager::app_state::create_app_state(app_handle);
            app.manage(app_state.clone());

            // Initialize WebSocket adapter
            // Single-port architecture: both GUI and CLI modes use HTTP /ws path
            if server_cfg.ws_enabled {
                if cli_mode {
                    log::info!("CLI mode uses HTTP /ws on {}:{} (unified single-port)", server_cfg.bind_addr, server_cfg.http_port);
                } else {
                    log::info!("GUI mode uses HTTP /ws on {}:{} (unified single-port)", server_cfg.bind_addr, server_cfg.http_port);
                }
            }

            // Initialize HTTP adapter
            if server_cfg.http_enabled {
                let http_state = app_state.clone();
                let http_port = server_cfg.http_port;
                let http_bind = server_cfg.bind_addr.clone();
                let is_cli = cli_mode;
                tauri::async_runtime::spawn(async move {
                    // In GUI mode, don't serve static files (use Vite dev server)
                    // In CLI mode, serve embedded static files
                    if let Err(e) = pi_session_manager::server::http::init_http_adapter_with_options(http_state, &http_bind, http_port, is_cli).await {
                        eprintln!("Failed to init HTTP adapter: {e}");
                    }
                });
            }

            // Start periodic write buffer flush (buffers session writes to reduce DB I/O)
            // 5 second interval balances data safety with I/O efficiency
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
                let mut last_conn: Option<rusqlite::Connection> = None;

                loop {
                    interval.tick().await;
                    if let Some((sessions, details)) = pi_session_manager::core::write_buffer::check_and_take_flush_data() {
                        let sessions_count = sessions.len();
                        let details_count = details.len();

                        // Reuse connection or create new one
                        let conn = match last_conn.take() {
                            Some(c) => c,
                            None => match pi_session_manager::data::sqlite::init_db() {
                                Ok(c) => c,
                                Err(e) => {
                                    log::error!("Failed to init DB for flush: {e}");
                                    continue;
                                }
                            },
                        };

                        let mut flush_error = false;
                        let mut conn = conn; // make mutable
                        for entry in &sessions {
                            if let Err(e) = pi_session_manager::data::sqlite::upsert_session(&mut conn, &entry.session, entry.file_modified, None) {
                                log::error!("Failed to upsert session during flush: {e}");
                                flush_error = true;
                            }
                        }
                        for entry in &details {
                            if let Err(e) = pi_session_manager::data::sqlite::upsert_session_details_cache(&conn, &entry.path, entry.file_modified, &entry.details) {
                                log::error!("Failed to upsert session details during flush: {e}");
                                flush_error = true;
                            }
                        }

                        if !flush_error {
                            log::trace!("Flushed {sessions_count} sessions and {details_count} details to database");
                        }

                        // Keep connection for next iteration
                        last_conn = Some(conn);
                    }
                }
            });

            // Flush write buffer on app exit
            app.handle().clone().listen("tauri://exit", |_| {
                if let Some((sessions, details)) = pi_session_manager::core::write_buffer::force_flush_all() {
                    match pi_session_manager::data::sqlite::init_db() {
                        Ok(mut conn) => {
                            let mut flush_error = false;
                            for entry in &sessions {
                                if let Err(e) = pi_session_manager::data::sqlite::upsert_session(&mut conn, &entry.session, entry.file_modified, None) {
                                    log::error!("Failed to upsert session on exit: {e}");
                                    flush_error = true;
                                }
                            }
                            for entry in &details {
                                if let Err(e) = pi_session_manager::data::sqlite::upsert_session_details_cache(&conn, &entry.path, entry.file_modified, &entry.details) {
                                    log::error!("Failed to upsert session details on exit: {e}");
                                    flush_error = true;
                                }
                            }
                            if !flush_error {
                                log::info!("Flushed {} sessions and {} details to database on exit", sessions.len(), details.len());
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to init DB on exit: {e}");
                        }
                    }
                }
            });

            if cli_mode {
                let mut info = String::from("CLI mode:");
                if server_cfg.http_enabled {
                    info.push_str(&format!(" HTTP+WS http://{}:{}/api | ws://{}:{}/ws", server_cfg.bind_addr, server_cfg.http_port, server_cfg.bind_addr, server_cfg.http_port));
                } else {
                    info.push_str(" HTTP disabled");
                }
                log::info!("{info}");
            } else {
                let monitor = match app.primary_monitor() {
                    Ok(monitor) => monitor,
                    Err(error) => {
                        log::warn!("Failed to read primary monitor for initial window sizing: {error}");
                        None
                    }
                };
                let ((initial_width, initial_height), (min_width, min_height)) = resolve_window_dimensions(monitor.as_ref());

                let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into())).title("Pi Session Manager").inner_size(initial_width, initial_height).min_inner_size(min_width, min_height).center().resizable(true).fullscreen(false);

                // Default to false to avoid accidental pinch zoom on macOS
                // Enable zoom hotkeys for Cmd+/- support
                let builder = builder.zoom_hotkeys_enabled(true);

                #[cfg(target_os = "macos")]
                let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);

                #[cfg(not(target_os = "macos"))]
                let builder = builder.decorations(true);

                // Build the window
                let window = builder.build()?;

                // Restore saved zoom level
                tauri::async_runtime::spawn(async move {
                    match pi_session_manager::settings_store::get::<f64>("window_zoom_level") {
                        Ok(Some(level)) => {
                            // Ensure zoom level is within valid range (0.75 - 2.0), default to 1.0
                            let safe_level = if (0.75..=2.0).contains(&level) { level } else { 1.0 };
                            if let Err(e) = window.set_zoom(safe_level).map_err(|e| e.to_string()) {
                                log::warn!("Failed to restore zoom level: {e}");
                            } else {
                                log::debug!("Restored zoom level to {safe_level}");
                            }
                        }
                        Ok(None) => {}
                        Err(e) => log::warn!("Failed to load zoom level from settings: {e}"),
                    }
                });

                // Note: Tauri 2 doesn't provide get_zoom API, so we can't save zoom level on exit
                // Zoom level is now managed in frontend via localStorage
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_session_manager::scan_sessions,
            pi_session_manager::scan_sessions_paginated,
            pi_session_manager::read_session_file,
            pi_session_manager::read_session_file_chunk,
            pi_session_manager::read_session_file_incremental,
            pi_session_manager::read_session_file_incremental_offset,
            pi_session_manager::get_file_stats,
            pi_session_manager::get_session_entries,
            pi_session_manager::get_session_labels,
            pi_session_manager::detect_session_format,
            pi_session_manager::list_supported_session_providers,
            pi_session_manager::convert_session_format,
            pi_session_manager::get_session_by_path,
            pi_session_manager::search_sessions,
            pi_session_manager::search_sessions_fts,
            pi_session_manager::full_text_search,
            pi_session_manager::delete_session,
            pi_session_manager::delete_sessions,
            pi_session_manager::export_session,
            pi_session_manager::rename_session,
            pi_session_manager::get_session_stats,
            pi_session_manager::get_session_stats_light,
            pi_session_manager::get_session_trace_analytics,
            pi_session_manager::get_day_stats,
            pi_session_manager::open_session_in_browser,
            pi_session_manager::open_path_in_system,
            pi_session_manager::restart_app,
            pi_session_manager::open_session_in_terminal,
            pi_session_manager::scan_skills,
            pi_session_manager::scan_prompts,
            pi_session_manager::get_skill_content,
            pi_session_manager::get_prompt_content,
            pi_session_manager::get_system_prompt,
            pi_session_manager::get_session_system_prompt,
            pi_session_manager::load_pi_settings,
            pi_session_manager::save_pi_settings,
            pi_session_manager::list_models,
            pi_session_manager::test_model,
            pi_session_manager::test_models_batch,
            pi_session_manager::add_favorite,
            pi_session_manager::remove_favorite,
            pi_session_manager::get_all_favorites,
            pi_session_manager::is_favorite,
            pi_session_manager::toggle_favorite,
            pi_session_manager::toggle_devtools,
            pi_session_manager::load_app_settings,
            pi_session_manager::save_app_settings,
            pi_session_manager::reset_app_settings,
            pi_session_manager::list_datasets,
            pi_session_manager::start_dataset_import,
            pi_session_manager::get_dataset_import_status,
            pi_session_manager::save_session_source,
            pi_session_manager::save_session_scan_other_agents,
            pi_session_manager::save_external_session_providers,
            pi_session_manager::load_server_settings,
            pi_session_manager::save_server_settings,
            pi_session_manager::get_psm_config_dir,
            pi_session_manager::get_session_paths,
            pi_session_manager::save_session_paths,
            pi_session_manager::get_all_session_dirs,
            pi_session_manager::terminal_create,
            pi_session_manager::terminal_write,
            pi_session_manager::terminal_resize,
            pi_session_manager::terminal_close,
            pi_session_manager::get_default_shell,
            pi_session_manager::get_available_shells,
            pi_session_manager::get_all_tags,
            pi_session_manager::create_tag,
            pi_session_manager::update_tag,
            pi_session_manager::delete_tag,
            pi_session_manager::get_all_session_tags,
            pi_session_manager::assign_tag,
            pi_session_manager::remove_tag_from_session,
            pi_session_manager::move_session_tag,
            pi_session_manager::reorder_tags,
            pi_session_manager::list_api_keys,
            pi_session_manager::create_api_key,
            pi_session_manager::revoke_api_key,
            pi_session_manager::scan_all_resources,
            pi_session_manager::load_pi_settings_full,
            pi_session_manager::save_pi_setting,
            pi_session_manager::toggle_resource,
            pi_session_manager::list_model_options_fast,
            pi_session_manager::list_model_options_full,
            pi_session_manager::load_model_config,
            pi_session_manager::save_model_config,
            pi_session_manager::export_model_config_content,
            pi_session_manager::export_model_config_to_path,
            pi_session_manager::import_model_config_content,
            pi_session_manager::import_model_config_from_path,
            pi_session_manager::create_model_config_backup,
            pi_session_manager::list_model_config_backups,
            pi_session_manager::restore_model_config_backup,
            pi_session_manager::delete_model_config_backup,
            pi_session_manager::list_model_config_versions,
            pi_session_manager::test_model_http,
            pi_session_manager::read_resource_file,
            pi_session_manager::get_pi_live_sessions,
            pi_session_manager::pi_agent_prompt,
            pi_session_manager::pi_agent_steer,
            pi_session_manager::pi_agent_follow_up,
            pi_session_manager::pi_agent_set_model,
            pi_session_manager::pi_agent_set_thinking_level,
            pi_session_manager::pi_agent_get_state,
            pi_session_manager::pi_agent_get_commands,
            pi_session_manager::pi_agent_get_available_models,
            pi_session_manager::pi_agent_abort,
            pi_session_manager::list_config_versions,
            pi_session_manager::get_config_version,
            pi_session_manager::restore_config_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
