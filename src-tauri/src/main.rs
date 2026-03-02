#![cfg(feature = "gui")]

use tauri::{Listener, Manager};

fn main() {
    tracing_subscriber::fmt::init();

    let cli_mode = std::env::args().any(|a| a == "--cli" || a == "--headless");

    // Load server settings before builder (sync, no runtime needed)
    let server_cfg = pi_session_manager::load_server_settings_sync();

    tauri::Builder::default()
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
                        if cli_mode {
                            log::info!("Auth token: {token}");
                        }
                    }
                    Err(e) => eprintln!("Failed to init auth: {e}"),
                }
            }

            // Initialize AppState and manage it
            let app_state = pi_session_manager::app_state::create_app_state(app_handle);
            app.manage(app_state.clone());

            // Initialize WebSocket adapter
            if server_cfg.ws_enabled {
                let ws_state = app_state.clone();
                let ws_port = server_cfg.ws_port;
                let ws_bind = server_cfg.bind_addr.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) =
                        pi_session_manager::ws_adapter::init_ws_adapter(ws_state, &ws_bind, ws_port)
                            .await
                    {
                        eprintln!("Failed to init WebSocket adapter: {e}");
                    }
                });
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
                    if let Err(e) =
                        pi_session_manager::http_adapter::init_http_adapter_with_options(
                            http_state, &http_bind, http_port, is_cli,
                        )
                        .await
                    {
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
                    if let Some((sessions, details)) =
                        pi_session_manager::write_buffer::check_and_take_flush_data()
                    {
                        let sessions_count = sessions.len();
                        let details_count = details.len();

                        // Reuse connection or create new one
                        let conn = match last_conn.take() {
                            Some(c) => c,
                            None => match pi_session_manager::sqlite_cache::init_db() {
                                Ok(c) => c,
                                Err(e) => {
                                    log::error!("Failed to init DB for flush: {e}");
                                    continue;
                                }
                            }
                        };

                        let mut flush_error = false;
                        for entry in &sessions {
                            if let Err(e) = pi_session_manager::sqlite_cache::upsert_session(
                                &conn,
                                &entry.session,
                                entry.file_modified,
                                None,
                            ) {
                                log::error!("Failed to upsert session during flush: {e}");
                                flush_error = true;
                            }
                        }
                        for entry in &details {
                            if let Err(e) =
                                pi_session_manager::sqlite_cache::upsert_session_details_cache(
                                    &conn,
                                    &entry.path,
                                    entry.file_modified,
                                    &entry.details,
                                )
                            {
                                log::error!("Failed to upsert session details during flush: {e}");
                                flush_error = true;
                            }
                        }

                        if !flush_error {
                            log::trace!(
                                "Flushed {sessions_count} sessions and {details_count} details to database"
                            );
                        }

                        // Keep connection for next iteration
                        last_conn = Some(conn);
                    }
                }
            });

            // Flush write buffer on app exit
            app.handle().clone().listen("tauri://exit", |_| {
                if let Some((sessions, details)) =
                    pi_session_manager::write_buffer::force_flush_all()
                {
                    match pi_session_manager::sqlite_cache::init_db() {
                        Ok(conn) => {
                            let mut flush_error = false;
                            for entry in &sessions {
                                if let Err(e) = pi_session_manager::sqlite_cache::upsert_session(
                                    &conn,
                                    &entry.session,
                                    entry.file_modified,
                                    None,
                                ) {
                                    log::error!("Failed to upsert session on exit: {e}");
                                    flush_error = true;
                                }
                            }
                            for entry in &details {
                                if let Err(e) =
                                    pi_session_manager::sqlite_cache::upsert_session_details_cache(
                                        &conn,
                                        &entry.path,
                                        entry.file_modified,
                                        &entry.details,
                                    )
                                {
                                    log::error!("Failed to upsert session details on exit: {e}");
                                    flush_error = true;
                                }
                            }
                            if !flush_error {
                                log::info!(
                                    "Flushed {} sessions and {} details to database on exit",
                                    sessions.len(),
                                    details.len()
                                );
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
                if server_cfg.ws_enabled {
                    info.push_str(&format!(
                        " WS ws://{}:{}",
                        server_cfg.bind_addr, server_cfg.ws_port
                    ));
                }
                if server_cfg.http_enabled {
                    info.push_str(&format!(
                        " | HTTP http://{}:{}/api",
                        server_cfg.bind_addr, server_cfg.http_port
                    ));
                }
                log::info!("{info}");
            } else {
                let builder = tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title("Pi Session Manager")
                .inner_size(1400.0, 900.0)
                .min_inner_size(1000.0, 600.0)
                .resizable(true)
                .fullscreen(false);

                // Default to false to avoid accidental pinch zoom on macOS
                let builder = builder.zoom_hotkeys_enabled(false);

                #[cfg(target_os = "macos")]
                let builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);

                #[cfg(not(target_os = "macos"))]
                let builder = builder.decorations(true);

                builder.build()?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_session_manager::scan_sessions,
            pi_session_manager::scan_sessions_paginated,
            pi_session_manager::read_session_file,
            pi_session_manager::read_session_file_incremental,
            pi_session_manager::read_session_file_incremental_offset,
            pi_session_manager::get_file_stats,
            pi_session_manager::get_session_entries,
            pi_session_manager::get_session_by_path,
            pi_session_manager::search_sessions,
            pi_session_manager::search_sessions_fts,
            pi_session_manager::full_text_search,
            pi_session_manager::delete_session,
            pi_session_manager::export_session,
            pi_session_manager::rename_session,
            pi_session_manager::get_session_stats,
            pi_session_manager::get_session_stats_light,
            pi_session_manager::get_day_stats,
            pi_session_manager::open_session_in_browser,
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
            pi_session_manager::load_server_settings,
            pi_session_manager::save_server_settings,
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
            pi_session_manager::update_tag_auto_rules,
            pi_session_manager::evaluate_auto_rules,
            pi_session_manager::list_api_keys,
            pi_session_manager::create_api_key,
            pi_session_manager::revoke_api_key,
            pi_session_manager::scan_all_resources,
            pi_session_manager::load_pi_settings_full,
            pi_session_manager::save_pi_setting,
            pi_session_manager::toggle_resource,
            pi_session_manager::list_model_options_fast,
            pi_session_manager::list_model_options_full,
            pi_session_manager::read_resource_file,
            pi_session_manager::list_config_versions,
            pi_session_manager::get_config_version,
            pi_session_manager::restore_config_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
