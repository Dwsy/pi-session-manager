fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Start file watcher
            if let Ok(sessions_dir) = pi_session_manager::scanner::get_sessions_dir() {
                if let Err(e) =
                    pi_session_manager::file_watcher::start_file_watcher(sessions_dir, app_handle.clone())
                {
                    eprintln!("Failed to start file watcher: {}", e);
                }
            }

            // Initialize WebSocket adapter
            let app_state = pi_session_manager::app_state::create_app_state(app_handle);
            tauri::async_runtime::spawn(async move {
                if let Err(e) = pi_session_manager::ws_adapter::init_ws_adapter(app_state, 52130).await {
                    eprintln!("Failed to init WebSocket adapter: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_session_manager::scan_sessions,
            pi_session_manager::read_session_file,
            pi_session_manager::read_session_file_incremental,
            pi_session_manager::get_file_stats,
            pi_session_manager::get_session_entries,
            pi_session_manager::search_sessions,
            pi_session_manager::search_sessions_fts,
            pi_session_manager::delete_session,
            pi_session_manager::export_session,
            pi_session_manager::rename_session,
            pi_session_manager::get_session_stats,
            pi_session_manager::get_session_stats_light,
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
            pi_session_manager::add_favorite,
            pi_session_manager::remove_favorite,
            pi_session_manager::get_all_favorites,
            pi_session_manager::is_favorite,
            pi_session_manager::toggle_favorite
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
