//! Tauri GUI composition root.

use crate::*;
use std::sync::Mutex;
use tauri::{Listener, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            plugin_dispatch_command,
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
            refresh_session_intelligence_record,
            upsert_plugin_record,
            plugin_fs_roots,
            plugin_fs_list,
            plugin_fs_read,
            plugin_fs_stat,
            get_agent_usage_status_command,
            plugin_window_open,
            plugin_window_close,
            load_psm_plugin_config,
            set_psm_plugin_enabled,
            set_psm_plugin_settings,
            set_psm_plugin_permissions,
            list_npm_psm_plugin_entries,
            list_path_psm_plugin_entries,
            list_dev_psm_plugin_entries,
            search_psm_plugin_market,
            add_path_psm_plugin,
            remove_path_psm_plugin,
            add_dev_psm_plugin,
            remove_dev_psm_plugin,
            install_psm_plugin,
            uninstall_psm_plugin,
            update_psm_plugins,
            build_dev_psm_plugin,
            reload_psm_plugins,
            read_npm_psm_plugin_module_source,
            read_path_psm_plugin_module_source,
            read_dev_psm_plugin_module_source,
            get_psm_plugin_paths,
            read_psm_plugin_json_config,
            write_psm_plugin_json_config,
            full_text_search,
            delete_session,
            delete_sessions,
            export_session,
            rename_session,
            fork_session,
            get_session_stats,
            get_session_stats_light,
            get_day_stats,
            open_url_in_system,
            open_path_with_default_app,
            open_session_in_browser,
            open_path_in_system,
            restart_app,
            check_app_update,
            download_and_install_app_update,
            get_lightweight_mode,
            set_lightweight_mode,
            open_session_in_terminal,
            update_macos_dock_recent_sessions,
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
            save_default_pi_session_dir_enabled,
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
            get_project_resource_trust,
            set_project_resource_trust,
            load_pi_settings_full,
            save_pi_setting,
            set_resource_state,
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
            write_resource_file,
            delete_resource_file,
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
            check_version_downgrade,
            allow_version_downgrade,
            backup_database,
            reset_database,
            send_notification,
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

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    fn tauri_handler_catalog() -> Vec<&'static str> {
        let source = include_str!("mod.rs");
        let handlers = source.split("generate_handler![").nth(1).expect("generate_handler catalog").split("])").next().expect("generate_handler closing delimiter");

        handlers.lines().map(str::trim).map(|line| line.trim_end_matches(',')).filter(|line| !line.is_empty()).collect()
    }

    #[test]
    fn tauri_and_dispatch_command_catalogs_are_characterized() {
        let handlers = tauri_handler_catalog();
        let handler_set = handlers.iter().copied().collect::<BTreeSet<_>>();
        let dispatch_set = crate::dispatch::capability_command_catalog().collect::<BTreeSet<_>>();

        assert_eq!(handlers.len(), 174);
        assert_eq!(handler_set.len(), handlers.len());

        let dispatch_only = dispatch_set.difference(&handler_set).copied().collect::<Vec<_>>();
        assert_eq!(dispatch_only, vec!["get_agent_usage_status", "invoke_model_text", "invoke_model_text_stream", "plugin_terminal_history_list", "plugin_terminal_history_read", "session_digest"]);

        let tauri_only = handler_set.difference(&dispatch_set).copied().collect::<Vec<_>>();
        assert_eq!(
            tauri_only,
            vec![
                "check_app_update",
                "clear_cache",
                "download_and_install_app_update",
                "export_config_bundle",
                "get_agent_usage_status_command",
                "get_day_stats",
                "get_lightweight_mode",
                "get_session_preview_entries",
                "import_config_bundle",
                "plugin_dispatch_command",
                "preview_config_bundle",
                "reset_app_settings",
                "restart_app",
                "restore_import_backup",
                "send_notification",
                "set_lightweight_mode",
                "set_window_zoom_level",
                "update_macos_dock_recent_sessions",
            ]
        );
    }
}
