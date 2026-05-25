#![cfg(feature = "gui")]

use pi_session_manager::cli_common::{self, CommonCliArgs};
use pi_session_manager::resolve_window_dimensions;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Listener, Manager};

// Window dimension helpers are in lib.rs — used by both main and tray

#[cfg(test)]
mod tests {
    use pi_session_manager::{clamp_window_dimensions, DEFAULT_MIN_WINDOW_HEIGHT, DEFAULT_MIN_WINDOW_WIDTH};

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

/// Extended CLI args for main.rs (adds --cli/--headless on top of common args).
#[derive(Debug, Default)]
struct MainCliArgs {
    common: CommonCliArgs,
    cli_mode: bool,
}

fn parse_main_cli_args() -> Result<MainCliArgs, String> {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();

    // Check for --cli/--headless first
    let cli_mode = raw_args.iter().any(|arg| arg == "--cli" || arg == "--headless");

    // Filter out --cli/--headless for common parsing
    let filtered: Vec<String> = raw_args.iter().filter(|arg| arg.as_str() != "--cli" && arg.as_str() != "--headless").cloned().collect();

    let common = cli_common::parse_common_args(&filtered)?;

    // If --cli/--headless is present, reject unknown args (already handled by parse_common_args)
    // If not in CLI mode, skip validation of port/bind/auth args
    if !cli_mode && !common.show_help {
        // In GUI mode, these args are ignored
        return Ok(MainCliArgs { common, cli_mode: false });
    }

    Ok(MainCliArgs { common, cli_mode })
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

const MENU_VIEW_RELOAD: &str = "view_reload";
const MENU_VIEW_TOGGLE_DEVTOOLS: &str = "view_toggle_devtools";

fn install_native_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let reload_item = MenuItemBuilder::with_id(MENU_VIEW_RELOAD, "Reload").accelerator("CmdOrCtrl+R").build(handle)?;
    let devtools_item = MenuItemBuilder::with_id(MENU_VIEW_TOGGLE_DEVTOOLS, "Developer Tools").accelerator("CmdOrCtrl+Shift+I").build(handle)?;
    let view_menu = SubmenuBuilder::new(handle, "View").item(&reload_item).separator().item(&devtools_item).build()?;

    let menu = MenuBuilder::new(handle);

    #[cfg(target_os = "macos")]
    let menu = {
        let app_menu = SubmenuBuilder::new(handle, "Pi Session Manager").about(None).separator().services().separator().hide().hide_others().show_all().separator().quit().build()?;
        let edit_menu = SubmenuBuilder::new(handle, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
        let window_menu = SubmenuBuilder::new(handle, "Window").minimize().fullscreen().separator().close_window().build()?;
        menu.item(&app_menu).item(&edit_menu).item(&view_menu).item(&window_menu)
    };

    #[cfg(not(target_os = "macos"))]
    let menu = menu.item(&view_menu);

    app.set_menu(menu.build()?)?;
    Ok(())
}

fn handle_native_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    let Some(window) = app.get_webview_window("main") else {
        log::debug!("Ignoring menu event before main window exists: {:?}", event.id());
        return;
    };

    if event.id() == MENU_VIEW_RELOAD {
        if let Err(error) = window.reload() {
            log::warn!("Failed to reload main window from native menu: {error}");
        }
    } else if event.id() == MENU_VIEW_TOGGLE_DEVTOOLS {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
}

fn main() {
    tracing_subscriber::fmt::init();

    let main_args = match parse_main_cli_args() {
        Ok(args) => args,
        Err(err) => {
            eprintln!("Error: {err}");
            eprintln!();
            print_help();
            std::process::exit(2);
        }
    };
    if main_args.common.show_help {
        print_help();
        return;
    }
    let cli_mode = main_args.cli_mode;

    // Load server settings and apply CLI overrides
    let mut server_cfg = cli_common::load_server_config();
    cli_common::apply_server_overrides(&mut server_cfg, &main_args.common);
    let runtime_token = main_args.common.runtime_token.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .on_menu_event(handle_native_menu_event)
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

            // Initialize auth
            if server_cfg.auth_enabled {
                cli_common::init_auth(&runtime_token, cli_mode);
            } else if runtime_token.is_some() && cli_mode {
                log::warn!("`--token` is ignored because auth is disabled");
            }

            // Initialize AppState and manage it
            let app_state = pi_session_manager::app_state::create_app_state(app_handle);
            app.manage(app_state.clone());
            let deep_link_state = pi_session_manager::deep_link::DeepLinkState::new();

            if !cli_mode {
                if let Err(error) = install_native_menu(app) {
                    log::warn!("Failed to install native menu: {error}");
                }
            }

            if !cli_mode {
                let app_handle_dl = app.handle().clone();
                let deep_link_listener_state = deep_link_state.clone();
                app.listen("deep-link://new-url", move |event| {
                    pi_session_manager::deep_link::handle_deep_link_payload(&app_handle_dl, &deep_link_listener_state, event.payload());
                });
            }

            // Initialize WebSocket adapter (single-port: HTTP /ws path)
            if server_cfg.ws_enabled {
                let mode_label = if cli_mode { "CLI" } else { "GUI" };
                log::info!("{mode_label} mode uses HTTP /ws on {}:{}", server_cfg.bind_addr, server_cfg.http_port);
            }

            // Initialize HTTP adapter
            if server_cfg.http_enabled {
                let http_state = app_state.clone();
                let http_port = server_cfg.http_port;
                let http_bind = server_cfg.bind_addr.clone();
                // serve_frontend: explicit config > auto (CLI: true, GUI: false)
                let serve_frontend = server_cfg.serve_frontend.unwrap_or(cli_mode);
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = pi_session_manager::server::http::init_http_adapter_with_options(http_state, &http_bind, http_port, serve_frontend).await {
                        eprintln!("Failed to init HTTP adapter: {e}");
                    }
                });
            }

            // Start periodic write buffer flush (5s interval)
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
                let mut last_conn: Option<rusqlite::Connection> = None;
                let mut ticks_since_checkpoint: u64 = 0;
                const CHECKPOINT_INTERVAL_TICKS: u64 = 60; // checkpoint every 300s

                loop {
                    interval.tick().await;
                    ticks_since_checkpoint += 1;

                    if let Some((sessions, details)) = pi_session_manager::core::write_buffer::check_and_take_flush_data() {
                        let sessions_count = sessions.len();
                        let details_count = details.len();

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

                        let mut conn = conn;
                        let flush_result = (|| -> Result<usize, String> {
                            let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e| format!("Failed to begin batch transaction: {e}"))?;

                            let mut ok_count = 0;
                            for entry in &sessions {
                                if let Err(e) = pi_session_manager::data::sqlite::upsert_session_in_tx(&tx, &entry.session, entry.file_modified, None) {
                                    log::error!("Skipping session {}: {e}", entry.session.path);
                                } else {
                                    ok_count += 1;
                                }
                            }
                            for entry in &details {
                                if let Err(e) = pi_session_manager::data::sqlite::upsert_session_details_cache_in_tx(&tx, &entry.path, entry.file_modified, &entry.details) {
                                    log::error!("Skipping details {}: {e}", entry.path);
                                }
                            }

                            tx.commit().map_err(|e| format!("Failed to commit batch transaction: {e}"))?;
                            Ok(ok_count)
                        })();

                        match flush_result {
                            Ok(count) => log::trace!("Flushed {count}/{sessions_count} sessions and {details_count} details to database"),
                            Err(e) => log::error!("Failed to batch flush: {e}"),
                        }

                        last_conn = Some(conn);
                    }

                    // Periodic WAL checkpoint
                    if ticks_since_checkpoint >= CHECKPOINT_INTERVAL_TICKS {
                        ticks_since_checkpoint = 0;
                        if let Some(conn) = &last_conn {
                            match conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []) {
                                Ok(_) => log::trace!("WAL checkpoint completed"),
                                Err(e) => log::warn!("WAL checkpoint failed: {e}"),
                            }
                        }
                    }
                }
            });

            // Flush write buffer on app exit
            app.handle().clone().listen("tauri://exit", |_| {
                if let Some((sessions, details)) = pi_session_manager::core::write_buffer::force_flush_all() {
                    match pi_session_manager::data::sqlite::init_db() {
                        Ok(mut conn) => {
                            let flush_result = (|| -> Result<usize, String> {
                                let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(|e| format!("Failed to begin exit transaction: {e}"))?;

                                let mut ok_count = 0;
                                for entry in &sessions {
                                    if let Err(e) = pi_session_manager::data::sqlite::upsert_session_in_tx(&tx, &entry.session, entry.file_modified, None) {
                                        log::error!("Skipping session on exit {}: {e}", entry.session.path);
                                    } else {
                                        ok_count += 1;
                                    }
                                }
                                for entry in &details {
                                    if let Err(e) = pi_session_manager::data::sqlite::upsert_session_details_cache_in_tx(&tx, &entry.path, entry.file_modified, &entry.details) {
                                        log::error!("Skipping details on exit {}: {e}", entry.path);
                                    }
                                }

                                tx.commit().map_err(|e| format!("Failed to commit exit transaction: {e}"))?;
                                Ok(ok_count)
                            })();

                            match flush_result {
                                Ok(count) => log::info!("Flushed {count}/{} sessions to database on exit", sessions.len()),
                                Err(e) => log::error!("Failed to flush on exit: {e}"),
                            }

                            match conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []) {
                                Ok(_) => log::info!("WAL checkpoint completed on exit"),
                                Err(e) => log::warn!("WAL checkpoint failed on exit: {e}"),
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
                // Create system tray
                if let Err(e) = pi_session_manager::tray::create_tray(app.handle()) {
                    log::warn!("Failed to create system tray: {e}");
                }

                let monitor = match app.primary_monitor() {
                    Ok(monitor) => monitor,
                    Err(error) => {
                        log::warn!("Failed to read primary monitor for initial window sizing: {error}");
                        None
                    }
                };
                let ((initial_width, initial_height), (min_width, min_height)) = resolve_window_dimensions(monitor.as_ref());

                let builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into())).title("Pi Session Manager").inner_size(initial_width, initial_height).min_inner_size(min_width, min_height).center().resizable(true).fullscreen(false).zoom_hotkeys_enabled(true);

                #[cfg(target_os = "macos")]
                let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);

                #[cfg(not(target_os = "macos"))]
                let builder = builder.decorations(true);

                let window = builder.visible(false).build()?;

                // Show window when frontend signals ready
                let window_clone = window.clone();
                let app_handle_ready = app.handle().clone();
                let deep_link_ready_state = deep_link_state.clone();
                app.listen("frontend://ready", move |_event| {
                    let _ = window_clone.show();
                    #[cfg(not(target_os = "macos"))]
                    let _ = window_clone.set_focus();
                    pi_session_manager::deep_link::mark_frontend_ready(&app_handle_ready, &deep_link_ready_state);
                });

                // ── Lightweight mode: intercept window close → destroy to free memory ──
                let window_handle = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Check lightweight mode setting
                        let lightweight = pi_session_manager::settings_store::get::<bool>("lightweight_mode").unwrap_or(None).unwrap_or(false);

                        if lightweight {
                            // Prevent default close (which would exit the app)
                            api.prevent_close();
                            // Destroy window to free memory; tray will recreate on next show
                            let _ = window_handle.destroy();
                            log::debug!("Lightweight mode: window destroyed, app stays in tray");
                        }
                        // If not lightweight, allow default close (app exits)
                    }
                });

                // Restore saved zoom level
                tauri::async_runtime::spawn(async move {
                    match pi_session_manager::settings_store::get::<f64>("window_zoom_level") {
                        Ok(Some(level)) => {
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
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_session_manager::plugin_dispatch_command,
            pi_session_manager::scan_sessions,
            pi_session_manager::scan_sessions_paginated,
            pi_session_manager::read_session_file,
            pi_session_manager::read_session_file_chunk,
            pi_session_manager::read_session_file_incremental,
            pi_session_manager::read_session_file_incremental_offset,
            pi_session_manager::get_file_stats,
            pi_session_manager::get_session_entries,
            pi_session_manager::get_session_preview_entries,
            pi_session_manager::get_session_labels,
            pi_session_manager::detect_session_format,
            pi_session_manager::list_supported_session_providers,
            pi_session_manager::convert_session_format,
            pi_session_manager::get_session_by_path,
            pi_session_manager::get_session_by_id,
            pi_session_manager::search_sessions,
            pi_session_manager::search_sessions_fts,
            pi_session_manager::get_plugin_record,
            pi_session_manager::list_plugin_records_for_scope,
            pi_session_manager::search_plugin_records,
            pi_session_manager::refresh_session_intelligence_record,
            pi_session_manager::upsert_plugin_record,
            pi_session_manager::load_psm_plugin_config,
            pi_session_manager::set_psm_plugin_enabled,
            pi_session_manager::set_psm_plugin_settings,
            pi_session_manager::list_npm_psm_plugin_entries,
            pi_session_manager::list_path_psm_plugin_entries,
            pi_session_manager::list_dev_psm_plugin_entries,
            pi_session_manager::search_psm_plugin_market,
            pi_session_manager::add_path_psm_plugin,
            pi_session_manager::remove_path_psm_plugin,
            pi_session_manager::add_dev_psm_plugin,
            pi_session_manager::remove_dev_psm_plugin,
            pi_session_manager::install_psm_plugin,
            pi_session_manager::uninstall_psm_plugin,
            pi_session_manager::update_psm_plugins,
            pi_session_manager::build_dev_psm_plugin,
            pi_session_manager::reload_psm_plugins,
            pi_session_manager::read_npm_psm_plugin_module_source,
            pi_session_manager::read_path_psm_plugin_module_source,
            pi_session_manager::read_dev_psm_plugin_module_source,
            pi_session_manager::get_psm_plugin_paths,
            pi_session_manager::read_psm_plugin_json_config,
            pi_session_manager::write_psm_plugin_json_config,
            pi_session_manager::full_text_search,
            pi_session_manager::delete_session,
            pi_session_manager::delete_sessions,
            pi_session_manager::export_session,
            pi_session_manager::rename_session,
            pi_session_manager::get_session_stats,
            pi_session_manager::get_session_stats_light,
            pi_session_manager::get_day_stats,
            pi_session_manager::open_url_in_system,
            pi_session_manager::open_path_with_default_app,
            pi_session_manager::open_session_in_browser,
            pi_session_manager::open_path_in_system,
            pi_session_manager::restart_app,
            pi_session_manager::get_lightweight_mode,
            pi_session_manager::set_lightweight_mode,
            pi_session_manager::open_session_in_terminal,
            pi_session_manager::list_available_terminals,
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
            pi_session_manager::check_version_downgrade,
            pi_session_manager::allow_version_downgrade,
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
            pi_session_manager::restore_config_version,
            pi_session_manager::send_notification,
            pi_session_manager::backup_database,
            pi_session_manager::reset_database,
            pi_session_manager::check_version_downgrade,
            pi_session_manager::allow_version_downgrade,
            pi_session_manager::clear_cache,
            pi_session_manager::export_config_bundle,
            pi_session_manager::import_config_bundle,
            pi_session_manager::preview_config_bundle,
            pi_session_manager::restore_import_backup,
            pi_session_manager::fork_session,
            pi_session_manager::get_pi_agent_entries
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // ── Prevent app exit when lightweight mode is active ──
            // When all windows are destroyed (lightweight mode), Tauri tries to exit.
            // We intercept ExitRequested and keep the app running in tray.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let lightweight = pi_session_manager::settings_store::get::<bool>("lightweight_mode").unwrap_or(None).unwrap_or(false);

                if lightweight {
                    api.prevent_exit();
                    log::debug!("Lightweight mode: prevented app exit, staying in tray");
                }
                // If not lightweight, allow default exit
            }
        });
}
