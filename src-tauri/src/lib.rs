pub mod cli_common;
pub mod commands;
pub mod core;
pub mod data;
#[cfg(feature = "gui")]
pub mod deep_link;
pub mod domain;
pub mod paths;
pub mod server;
pub mod types;
pub mod utils;

// Infrastructure (stay at root)
pub mod api_readonly;
pub mod auth;
pub mod compression;
pub mod config;
pub mod dispatch;
pub mod export;
pub mod metrics;
pub mod settings_store;
pub mod stats;
pub mod subagent;
pub mod unified_config;

// GUI-only
#[cfg(feature = "gui")]
pub mod app_state;
#[cfg(feature = "gui")]
pub mod file_watcher;
#[cfg(feature = "gui")]
pub mod pi_agent_registry;
#[cfg(feature = "gui")]
pub mod terminal;
#[cfg(feature = "gui")]
pub mod tray;

// Window dimension constants and helpers (shared between main.rs and tray.rs)
pub const DEFAULT_WINDOW_WIDTH: f64 = 1400.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 900.0;
pub const DEFAULT_MIN_WINDOW_WIDTH: f64 = 1000.0;
pub const DEFAULT_MIN_WINDOW_HEIGHT: f64 = 600.0;

pub fn clamp_window_dimensions(available_width: f64, available_height: f64) -> ((f64, f64), (f64, f64)) {
    let initial_width = DEFAULT_WINDOW_WIDTH.min(available_width).max(1.0);
    let initial_height = DEFAULT_WINDOW_HEIGHT.min(available_height).max(1.0);
    let min_width = DEFAULT_MIN_WINDOW_WIDTH.min(initial_width);
    let min_height = DEFAULT_MIN_WINDOW_HEIGHT.min(initial_height);
    ((initial_width, initial_height), (min_width, min_height))
}

#[cfg(feature = "gui")]
pub fn resolve_window_dimensions(monitor: Option<&tauri::Monitor>) -> ((f64, f64), (f64, f64)) {
    monitor.map_or(((DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT), (DEFAULT_MIN_WINDOW_WIDTH, DEFAULT_MIN_WINDOW_HEIGHT)), |monitor| {
        let work_area = monitor.work_area();
        let scale_factor = monitor.scale_factor();
        clamp_window_dimensions(f64::from(work_area.size.width) / scale_factor, f64::from(work_area.size.height) / scale_factor)
    })
}

// Backward-compat re-exports
pub use commands::*;
pub use types::*;

// Module aliases for external consumers (main.rs, src-tauri-cli, etc.)
pub use core::delete as session_delete;
pub use core::intel as session_intel;
pub use core::parser as session_parser;
pub use core::scanner;
pub use core::write_buffer;
pub mod scanner_scheduler {
    pub use crate::core::scanner::ScannerScheduler;
}
pub use data::search::client as search;
pub use data::search::embedding as embedding_service;
pub use data::search::index as search_index;
pub use data::sqlite as sqlite_cache;
#[cfg(feature = "gui")]
pub use server::http as http_adapter;
#[cfg(feature = "gui")]
pub use server::ws as ws_adapter;

#[cfg(feature = "gui")]
use std::sync::Mutex;
#[cfg(feature = "gui")]
use tauri::{Listener, Manager};

#[cfg(feature = "gui")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            scan_sessions,
            scan_sessions_paginated,
            read_session_file,
            read_session_file_chunk,
            read_session_file_incremental,
            read_session_file_incremental_offset,
            get_file_stats,
            get_session_entries,
            get_session_preview_entries,
            get_session_labels,
            detect_session_format,
            list_supported_session_providers,
            convert_session_format,
            get_session_by_path,
            get_session_by_id,
            search_sessions,
            search_sessions_fts,
            get_plugin_record,
            list_plugin_records_for_scope,
            search_plugin_records,
            upsert_plugin_record,
            full_text_search,
            delete_session,
            delete_sessions,
            export_session,
            rename_session,
            fork_session,
            get_session_stats,
            get_session_stats_light,
            get_session_trace_analytics,
            get_day_stats,
            open_url_in_system,
            open_path_with_default_app,
            open_session_in_browser,
            open_path_in_system,
            restart_app,
            get_lightweight_mode,
            set_lightweight_mode,
            open_session_in_terminal,
            list_available_terminals,
            scan_skills,
            scan_prompts,
            get_skill_content,
            get_prompt_content,
            get_system_prompt,
            get_session_system_prompt,
            load_pi_settings,
            save_pi_settings,
            list_models,
            test_model,
            test_models_batch,
            load_app_settings,
            save_app_settings,
            reset_app_settings,
            list_datasets,
            start_dataset_import,
            get_dataset_import_status,
            save_session_source,
            save_session_scan_other_agents,
            save_external_session_providers,
            load_server_settings,
            save_server_settings,
            get_psm_config_dir,
            get_session_paths,
            save_session_paths,
            get_all_session_dirs,
            add_favorite,
            remove_favorite,
            get_all_favorites,
            is_favorite,
            toggle_favorite,
            clear_cache,
            toggle_devtools,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_close,
            get_default_shell,
            get_available_shells,
            get_all_tags,
            create_tag,
            update_tag,
            delete_tag,
            get_all_session_tags,
            assign_tag,
            remove_tag_from_session,
            move_session_tag,
            reorder_tags,
            list_api_keys,
            create_api_key,
            revoke_api_key,
            scan_all_resources,
            load_pi_settings_full,
            save_pi_setting,
            toggle_resource,
            list_model_options_fast,
            list_model_options_full,
            load_model_config,
            save_model_config,
            export_model_config_content,
            export_model_config_to_path,
            import_model_config_content,
            import_model_config_from_path,
            create_model_config_backup,
            list_model_config_backups,
            restore_model_config_backup,
            delete_model_config_backup,
            list_model_config_versions,
            test_model_http,
            read_resource_file,
            get_pi_live_sessions,
            get_pi_agent_entries,
            pi_agent_prompt,
            pi_agent_steer,
            pi_agent_follow_up,
            pi_agent_set_model,
            pi_agent_set_thinking_level,
            pi_agent_get_state,
            pi_agent_get_commands,
            pi_agent_get_available_models,
            pi_agent_abort,
            list_config_versions,
            get_config_version,
            restore_config_version,
            export_config_bundle,
            preview_config_bundle,
            import_config_bundle,
            restore_import_backup,
            set_window_zoom_level,
            get_workspaces,
            save_workspace,
            delete_workspace,
            check_version_downgrade,
            backup_database,
            reset_database,
            send_notification,
            set_window_zoom_level,
            get_pi_agent_entries
        ])
        .setup(|app| {
            let app_state = app_state::create_app_state(app.handle().clone());
            app.manage(app_state.clone());
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
                loop {
                    interval.tick().await;
                    if let Some((sessions, details)) = write_buffer::check_and_take_flush_data() {
                        let sessions_count = sessions.len();
                        let details_count = details.len();
                        if let Ok(mut conn) = sqlite_cache::init_db() {
                            for entry in sessions {
                                let _ = sqlite_cache::upsert_session(&mut conn, &entry.session, entry.file_modified, None);
                            }
                            for entry in details {
                                let _ = sqlite_cache::upsert_session_details_cache(&conn, &entry.path, entry.file_modified, &entry.details);
                            }
                            log::trace!("Flushed {sessions_count} sessions and {details_count} details to database");
                        }
                    }
                }
            });

            let app_handle_clone = app.handle().clone();
            app_handle_clone.listen("tauri://exit", |_| {
                if let Some((sessions, details)) = write_buffer::force_flush_all() {
                    if let Ok(mut conn) = sqlite_cache::init_db() {
                        for entry in sessions {
                            let _ = sqlite_cache::upsert_session(&mut conn, &entry.session, entry.file_modified, None);
                        }
                        for entry in details {
                            let _ = sqlite_cache::upsert_session_details_cache(&conn, &entry.path, entry.file_modified, &entry.details);
                        }
                    }
                }
            });

            let deep_link_state = crate::deep_link::DeepLinkState::new();

            // ── Deep link: show window, then forward pi-session:// URLs to frontend ──
            let app_handle_dl = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                crate::deep_link::handle_deep_link_payload(&app_handle_dl, &deep_link_state, event.payload());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
