use tauri::Manager;

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 启动文件监听器
            if let Ok(sessions_dir) = pi_session_manager::scanner::get_sessions_dir() {
                let app_handle = app.handle().clone();
                if let Err(e) =
                    pi_session_manager::file_watcher::start_file_watcher(sessions_dir, app_handle)
                {
                    eprintln!("Failed to start file watcher: {}", e);
                }
            }

            // Initialize RPC client state
            let rpc_client = pi_session_manager::pi_rpc::create_shared_client();
            app.manage(rpc_client.clone());

            // Create shared app state for WebSocket adapter
            let app_handle = app.handle().clone();
            let app_state =
                pi_session_manager::app_state::create_app_state(rpc_client, app_handle.clone());

            // Initialize WebSocket adapter for dual-channel support
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    pi_session_manager::ws_adapter::init_ws_adapter(app_state, 52130).await
                {
                    eprintln!("Failed to init WebSocket adapter: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_session_manager::scan_sessions,
            pi_session_manager::read_session_file,
            pi_session_manager::read_session_file_incremental,
            pi_session_manager::get_file_completions,
            pi_session_manager::get_file_stats,
            pi_session_manager::get_session_entries,
            pi_session_manager::search_sessions,
            pi_session_manager::search_sessions_fts,
            pi_session_manager::delete_session,
            pi_session_manager::export_session,
            pi_session_manager::rename_session,
            pi_session_manager::get_session_stats,
            pi_session_manager::open_session_in_browser,
            pi_session_manager::open_session_in_terminal,
            pi_session_manager::scan_skills,
            pi_session_manager::scan_prompts,
            pi_session_manager::get_skill_content,
            pi_session_manager::get_prompt_content,
            pi_session_manager::get_system_prompt,
            pi_session_manager::load_pi_settings,
            pi_session_manager::save_pi_settings,
            pi_session_manager::list_models,
            pi_session_manager::test_model,
            pi_session_manager::test_models_batch,
            pi_session_manager::load_app_settings,
            pi_session_manager::save_app_settings,
            pi_session_manager::add_favorite,
            pi_session_manager::remove_favorite,
            pi_session_manager::get_all_favorites,
            pi_session_manager::is_favorite,
            pi_session_manager::toggle_favorite,
            pi_session_manager::toggle_devtools,
            pi_session_manager::open_external_url,
            // RPC commands
            pi_session_manager::detect_pi_rpc_support,
            pi_session_manager::start_pi_rpc,
            pi_session_manager::stop_pi_rpc,
            pi_session_manager::restart_pi_rpc,
            pi_session_manager::get_rpc_status,
            pi_session_manager::send_prompt,
            pi_session_manager::send_follow_up,
            pi_session_manager::send_steer,
            pi_session_manager::send_abort,
            pi_session_manager::cycle_rpc_model,
            pi_session_manager::set_rpc_thinking_level,
            pi_session_manager::cycle_rpc_thinking_level,
            pi_session_manager::compact_rpc_session,
            pi_session_manager::set_rpc_auto_compaction,
            pi_session_manager::send_rpc_bash,
            pi_session_manager::abort_rpc_bash,
            pi_session_manager::switch_session_rpc,
            pi_session_manager::get_rpc_messages,
            pi_session_manager::get_rpc_cached_messages,
            pi_session_manager::sync_rpc_session_cache,
            pi_session_manager::get_rpc_state,
            pi_session_manager::get_rpc_available_models,
            pi_session_manager::get_rpc_session_stats,
            pi_session_manager::get_rpc_commands,
            pi_session_manager::set_rpc_model,
            pi_session_manager::new_rpc_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
