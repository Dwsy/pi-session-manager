use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const TRAY_ID: &str = "main";
const MENU_SHOW: &str = "show";
const MENU_OPEN_WEB: &str = "open_web";
const MENU_TOGGLE_LIGHTWEIGHT: &str = "toggle_lightweight";
const MENU_QUIT: &str = "quit";

/// Tray menu labels for each supported UI language, mirroring src/i18n/locales.
/// Unknown locales fall back to English.
struct TrayLabels {
    show: &'static str,
    open_web: &'static str,
    lightweight: &'static str,
    quit: &'static str,
}

const LABELS_EN: TrayLabels = TrayLabels { show: "Show Window", open_web: "Open Web", lightweight: "Minimize to Tray on Close", quit: "Quit" };
const LABELS_ZH: TrayLabels = TrayLabels { show: "显示窗口", open_web: "打开网页版", lightweight: "关闭时最小化到托盘", quit: "退出" };
const LABELS_JA: TrayLabels = TrayLabels { show: "ウィンドウを表示", open_web: "ウェブ版を開く", lightweight: "閉じたらシステムトレイに最小化", quit: "終了" };
const LABELS_DE: TrayLabels = TrayLabels { show: "Fenster anzeigen", open_web: "Web öffnen", lightweight: "Beim Schließen in den Systemabschnitt minimieren", quit: "Beenden" };
const LABELS_ES: TrayLabels = TrayLabels { show: "Mostrar ventana", open_web: "Abrir web", lightweight: "Minimizar a la bandeja al cerrar", quit: "Salir" };
const LABELS_FR: TrayLabels = TrayLabels { show: "Afficher la fenêtre", open_web: "Ouvrir le web", lightweight: "Minimiser dans la barre des tâches à la fermeture", quit: "Quitter" };

fn tray_labels(lang: &str) -> &'static TrayLabels {
    if lang.starts_with("zh") {
        &LABELS_ZH
    } else if lang.starts_with("ja") {
        &LABELS_JA
    } else if lang.starts_with("de") {
        &LABELS_DE
    } else if lang.starts_with("es") {
        &LABELS_ES
    } else if lang.starts_with("fr") {
        &LABELS_FR
    } else {
        &LABELS_EN
    }
}

/// UI language persisted by the frontend settings (unified config "app"
/// section, written by save_app_settings).
fn stored_language() -> String {
    crate::unified_config::read_section("app").ok().and_then(|v| v.get("language")?.get("locale")?.as_str().map(str::to_string)).unwrap_or_else(|| "en-US".to_string())
}

/// Holds the tray's check item so the settings UI can keep the checkmark in
/// sync when the same setting changes from the web UI. The item is replaced
/// whenever the tray menu is rebuilt for a new language.
pub struct TrayMenuState<R: Runtime = tauri::Wry> {
    lightweight_item: Mutex<Option<CheckMenuItem<R>>>,
}

/// Create the system tray icon with context menu.
///
/// Menu items: Show Window / Open Web / Minimize to Tray on Close (check) / Quit,
/// localized with the language saved in the app settings.
/// Left-click toggles window visibility.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let (menu, lightweight_item) = build_tray_menu(app, &stored_language())?;

    if !app.manage(TrayMenuState { lightweight_item: Mutex::new(Some(lightweight_item)) }) {
        log::warn!("Tray menu state already managed");
    }

    let icon = load_tray_icon()?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true) // macOS: adapt to dark/light menu bar
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
                MENU_TOGGLE_LIGHTWEIGHT => {
                    toggle_lightweight(app);
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
                let _ = window_handle.destroy();
                log::debug!("Lightweight mode: window destroyed, app stays in tray");
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

    #[cfg(target_os = "macos")]
    {
        builder = builder.decorations(true).title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(16.0, 22.0)));
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    let window = builder.visible(false).build().map_err(|e| format!("Build window: {e}"))?;
    install_lightweight_close_handler(&window);

    let window_clone = window.clone();
    app.listen("frontend://ready", move |_event| {
        let _ = window_clone.show();
        #[cfg(not(target_os = "macos"))]
        let _ = window_clone.set_focus();
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
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        // Pass an empty title as the first arg: `cmd /C start "" <url>`. Without
        // it, `start` treats the first quoted token of the URL as the window
        // title and any `&` in the URL is parsed as a command separator.
        let _ = std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    }
}

fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// Build the localized tray menu; returns the menu plus the lightweight check
/// item so callers can update its checkmark later.
fn build_tray_menu<R: Runtime>(app: &AppHandle<R>, lang: &str) -> Result<(Menu<R>, CheckMenuItem<R>), String> {
    let labels = tray_labels(lang);
    let show_item = MenuItemBuilder::with_id(MENU_SHOW, labels.show).build(app).map_err(|e| format!("Failed to create show menu item: {e}"))?;
    let open_web_item = MenuItemBuilder::with_id(MENU_OPEN_WEB, labels.open_web).build(app).map_err(|e| format!("Failed to create open_web menu item: {e}"))?;
    let lightweight = crate::settings_store::get::<bool>("lightweight_mode").unwrap_or(None).unwrap_or(false);
    let lightweight_item = CheckMenuItem::with_id(app, MENU_TOGGLE_LIGHTWEIGHT, labels.lightweight, true, lightweight, None::<&str>).map_err(|e| format!("Failed to create lightweight menu item: {e}"))?;
    let quit_item = MenuItemBuilder::with_id(MENU_QUIT, labels.quit).build(app).map_err(|e| format!("Failed to create quit menu item: {e}"))?;

    let menu = MenuBuilder::new(app).item(&show_item).item(&open_web_item).separator().item(&lightweight_item).separator().item(&quit_item).build().map_err(|e| format!("Failed to build tray menu: {e}"))?;

    Ok((menu, lightweight_item))
}

/// Rebuild the tray menu for `lang` after the user changes the UI language.
pub fn set_tray_language<R: Runtime>(app: &AppHandle<R>, lang: &str) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return; // No tray (CLI mode or not yet created).
    };

    let (menu, lightweight_item) = match build_tray_menu(app, lang) {
        Ok(pair) => pair,
        Err(e) => {
            log::error!("Failed to rebuild tray menu for {lang}: {e}");
            return;
        }
    };

    if let Err(e) = tray.set_menu(Some(menu)) {
        log::error!("Failed to apply tray menu for {lang}: {e}");
        return;
    }

    if let Some(state) = app.try_state::<TrayMenuState<R>>() {
        *state.lightweight_item.lock().unwrap() = Some(lightweight_item);
    }
}

/// Flip the minimize-to-tray setting from the tray check item.
///
/// muda already toggled the item's internal check state before dispatching the
/// event, so persist first and only rewrite the checkmark to roll back a failed
/// save.
fn toggle_lightweight<R: Runtime>(app: &AppHandle<R>) {
    let current = crate::settings_store::get::<bool>("lightweight_mode").unwrap_or(None).unwrap_or(false);
    let next = !current;

    let item = current_check_item(app);
    if let Err(e) = crate::settings_store::set("lightweight_mode", &next) {
        log::error!("Failed to save lightweight mode from tray: {e}");
        if let Some(item) = item {
            let _ = item.set_checked(current);
        }
        return;
    }

    if let Some(item) = item {
        let _ = item.set_checked(next);
    }
    emit_lightweight_mode_changed(app, next);
}

/// Clone the current lightweight check item out of the tray state.
fn current_check_item<R: Runtime>(app: &AppHandle<R>) -> Option<CheckMenuItem<R>> {
    app.try_state::<TrayMenuState<R>>().and_then(|state| state.lightweight_item.lock().unwrap().clone())
}

/// Sync the tray check item when the setting changes from the web UI.
pub fn sync_lightweight_item<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    if let Some(item) = current_check_item(app) {
        let _ = item.set_checked(enabled);
    }
}

/// Emit a frontend event so the web UI can react to lightweight mode changes.
pub fn emit_lightweight_mode_changed<R: Runtime>(app: &AppHandle<R>, enabled: bool) {
    let _ = app.emit("lightweight-mode-changed", enabled);
}
