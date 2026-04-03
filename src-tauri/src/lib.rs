pub mod api_readonly;
pub mod auth;
pub mod commands;
pub mod compression;
pub mod config;
pub mod dispatch;
pub mod embedding_service;
pub mod export;
pub mod metrics;
pub mod models;
#[cfg(feature = "gui")]
pub mod pi_agent_registry;
pub mod scanner;
pub mod scanner_scheduler;
pub mod search;
pub mod search_index;
pub mod session_delete;
pub mod session_intel;
pub mod session_parser;
pub mod settings_store;
pub mod sqlite_cache;
pub mod stats;
pub mod subagent;
pub mod tantivy_search;
pub mod write_buffer;

#[cfg(feature = "gui")]
pub mod app_state;
#[cfg(feature = "gui")]
pub mod file_watcher;
#[cfg(feature = "gui")]
pub mod http_adapter;
#[cfg(feature = "gui")]
pub mod terminal;
#[cfg(feature = "gui")]
pub mod ws_adapter;

pub use commands::*;
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
        .invoke_handler(tauri::generate_handler![
            scan_sessions,
            scan_sessions_paginated,
            read_session_file,
            read_session_file_chunk,
            read_session_file_incremental,
            read_session_file_incremental_offset,
            get_file_stats,
            get_session_entries,
            get_session_by_path,
            search_sessions,
            search_sessions_fts,
            full_text_search,
            delete_session,
            delete_sessions,
            export_session,
            rename_session,
            get_session_stats,
            get_day_stats,
            open_session_in_browser,
            open_session_in_terminal,
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
            load_server_settings,
            save_server_settings,
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
            update_tag_auto_rules,
            evaluate_auto_rules,
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
            pi_agent_steering,
            list_config_versions,
            get_config_version,
            restore_config_version,
            export_config_bundle,
            preview_config_bundle,
            import_config_bundle,
            restore_import_backup
        ])
        .setup(|app| {
            // Create and manage app state
            let app_state = app_state::create_app_state(app.handle().clone());
            app.manage(app_state.clone());
            // Start periodic buffer flush task
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
                loop {
                    interval.tick().await;
                    if let Some((sessions, details)) = write_buffer::check_and_take_flush_data() {
                        let sessions_count = sessions.len();
                        let details_count = details.len();
                        if let Ok(conn) = sqlite_cache::init_db() {
                            for entry in sessions {
                                let _ = sqlite_cache::upsert_session(
                                    &conn,
                                    &entry.session,
                                    entry.file_modified,
                                    None,
                                );
                            }
                            for entry in details {
                                let _ = sqlite_cache::upsert_session_details_cache(
                                    &conn,
                                    &entry.path,
                                    entry.file_modified,
                                    &entry.details,
                                );
                            }
                            log::trace!(
                                "Flushed {sessions_count} sessions and {details_count} details to database"
                            );
                        }
                    }
                }
            });

            // Force flush on application exit
            let app_handle_clone = app.handle().clone();
            app_handle_clone.listen("tauri://exit", |_| {
                if let Some((sessions, details)) = write_buffer::force_flush_all() {
                    if let Ok(conn) = sqlite_cache::init_db() {
                        for entry in sessions {
                            let _ = sqlite_cache::upsert_session(
                                &conn,
                                &entry.session,
                                entry.file_modified,
                                None,
                            );
                        }
                        for entry in details {
                            let _ = sqlite_cache::upsert_session_details_cache(
                                &conn,
                                &entry.path,
                                entry.file_modified,
                                &entry.details,
                            );
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
