use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const TRAY_ID: &str = "main";
const MENU_SHOW: &str = "show";
const MENU_OPEN_WEB: &str = "open_web";
const MENU_QUIT: &str = "quit";

/// Create the system tray icon with context menu.
///
/// Menu items: Show Window / Open Web / Quit
/// Left-click toggles window visibility.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let show_item = MenuItemBuilder::with_id(MENU_SHOW, "Show Window").build(app).map_err(|e| format!("Failed to create show menu item: {e}"))?;
    let open_web_item = MenuItemBuilder::with_id(MENU_OPEN_WEB, "Open Web").build(app).map_err(|e| format!("Failed to create open_web menu item: {e}"))?;
    let quit_item = MenuItemBuilder::with_id(MENU_QUIT, "Quit").build(app).map_err(|e| format!("Failed to create quit menu item: {e}"))?;

    let menu = MenuBuilder::new(app).item(&show_item).item(&open_web_item).separator().item(&quit_item).build().map_err(|e| format!("Failed to build tray menu: {e}"))?;

    let icon = load_tray_icon()?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID).icon(icon);
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon_as_template(true);
    }

    let _tray = tray
        .tooltip("Pi Session Manager")
        .menu(&menu)
        .show_menu_on_left_click(false) // left-click toggles window, not menu
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref();
            match id {
                MENU_SHOW => {
                    show_or_create_window(app);
                }
                MENU_OPEN_WEB => {
                    open_web(app);
                }
                MENU_QUIT => {
                    quit_app(app);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                show_or_create_window(app);
            }
        })
        .build(app)
        .map_err(|e| format!("Failed to build tray icon: {e}"))?;

    Ok(())
}

fn load_tray_icon() -> Result<Image<'static>, String> {
    // Use dedicated tray icon (white Pi logo on transparent background)
    // macOS template mode: alpha channel drives color (white on dark, black on light)
    let icon_bytes = include_bytes!("../icons/tray-icon.png");
    Image::from_bytes(icon_bytes).map_err(|e| format!("Failed to load tray icon: {e}"))
}

/// Keep the app alive in the tray when lightweight mode closes a window.
///
/// This is shared by the initial main window and every recreated window so the
/// close behavior remains consistent after reopening from the Dock or tray.
pub fn install_lightweight_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let lightweight = crate::settings_store::get::<bool>("lightweight_mode").unwrap_or(None).unwrap_or(false);

            if lightweight {
                api.prevent_close();
                #[cfg(target_os = "linux")]
                {
                    let _ = window_handle.hide();
                    log::debug!("Lightweight mode: Linux window hidden, app stays recoverable");
                }
                #[cfg(not(target_os = "linux"))]
                {
                    let _ = window_handle.destroy();
                    log::debug!("Lightweight mode: window destroyed, app stays in tray");
                }
            }
        }
    });
}

/// Show existing window or create a new one.
///
/// When lightweight mode is enabled, closing the window destroys it (freeing memory).
/// This function recreates it from scratch.
pub fn show_or_create_window<R: Runtime>(app: &AppHandle<R>) {
    // If window already exists, just show and focus it
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // Window was destroyed (lightweight mode) — recreate it
    if let Err(e) = create_main_window(app) {
        log::error!("Failed to recreate main window: {e}");
    }
}

/// Create the main application window with proper sizing and platform styling.
fn create_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let monitor = app.primary_monitor().ok().flatten();
    let ((w, h), (min_w, min_h)) = crate::resolve_window_dimensions(monitor.as_ref());

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into())).title("Pi Session Manager").inner_size(w, h).min_inner_size(min_w, min_h).center().resizable(true).fullscreen(false).zoom_hotkeys_enabled(true);

    let builder = crate::configure_main_window_chrome(builder);

    let window = builder.visible(false).build().map_err(|e| format!("Build window: {e}"))?;
    install_lightweight_close_handler(&window);

    let window_clone = window.clone();
    let deep_link_state = app.state::<crate::deep_link::DeepLinkState>().inner().clone();
    let listener_handle: AppHandle<R> = app.clone();
    let callback_handle: AppHandle<R> = app.clone();
    listener_handle.once("frontend://ready", move |_event| {
        let _ = window_clone.show();
        #[cfg(not(target_os = "macos"))]
        let _ = window_clone.set_focus();
        crate::deep_link::handle_frontend_ready(&callback_handle, &deep_link_state);
    });

    // Restore saved zoom level
    tauri::async_runtime::spawn(async move {
        match crate::settings_store::get::<f64>("window_zoom_level") {
            Ok(Some(level)) => {
                let safe_level = if (0.75..=2.0).contains(&level) { level } else { 1.0 };
                if let Err(e) = window.set_zoom(safe_level) {
                    log::warn!("Failed to restore zoom level: {e}");
                }
            }
            Ok(None) => {}
            Err(e) => log::warn!("Failed to load zoom level from settings: {e}"),
        }
    });

    Ok(())
}

fn open_web<R: Runtime>(_app: &AppHandle<R>) {
    let port = crate::load_server_settings_sync().http_port;
    let url = format!("http://127.0.0.1:{port}");
    if let Err(error) = tauri_plugin_opener::open_url(&url, None::<&str>) {
        log::error!("Failed to open web UI in system browser: {error}");
    }
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// Emit a frontend event so the web UI can react to lightweight mode changes.
pub fn emit_lightweight_mode_changed<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    let _ = app.emit("lightweight-mode-changed", enabled);
}
