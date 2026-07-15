use serde::Deserialize;
use tauri::AppHandle;

pub const DOCK_RECENT_SESSION_PREFIX: &str = "dock_recent_session:";
const MAX_DOCK_RECENT_SESSIONS: usize = 15;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockRecentSession {
    id: String,
    title: String,
}

#[tauri::command]
pub fn update_macos_dock_recent_sessions(app: AppHandle, sessions: Vec<DockRecentSession>) -> Result<(), String> {
    let sessions = sessions
        .into_iter()
        .filter_map(|session| {
            let id = session.id.trim().to_string();
            if id.is_empty() {
                return None;
            }

            let title = session.title.trim().to_string();
            Some(DockRecentSession { id, title: if title.is_empty() { "Untitled Session".to_string() } else { title } })
        })
        .take(MAX_DOCK_RECENT_SESSIONS)
        .collect::<Vec<_>>();

    #[cfg(target_os = "macos")]
    {
        app.run_on_main_thread(move || {
            if let Err(error) = macos::replace_dock_menu(sessions) {
                log::warn!("Failed to update macOS Dock menu: {error}");
            }
        })
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (app, sessions);

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn install() -> Result<(), String> {
    macos::install()
}

#[cfg(not(target_os = "macos"))]
pub fn install() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{DockRecentSession, DOCK_RECENT_SESSION_PREFIX};
    use muda::{ContextMenu, IsMenuItem, MenuItem, Submenu};
    use objc2::ffi::{class_addMethod, object_getClass};
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{msg_send, sel};
    use std::cell::RefCell;
    use std::mem;
    use std::ptr;

    thread_local! {
        static DOCK_MENU: RefCell<Option<Submenu>> = const { RefCell::new(None) };
    }

    pub fn install() -> Result<(), String> {
        let application_class = AnyClass::get(c"NSApplication").ok_or("NSApplication class is unavailable")?;
        let application: *mut AnyObject = unsafe { msg_send![application_class, sharedApplication] };
        if application.is_null() {
            return Err("NSApplication.sharedApplication returned null".to_string());
        }

        let delegate: *mut AnyObject = unsafe { msg_send![application, delegate] };
        if delegate.is_null() {
            return Err("NSApplication delegate is unavailable".to_string());
        }

        let delegate_class = unsafe { object_getClass(delegate) } as *mut AnyClass;
        if delegate_class.is_null() {
            return Err("NSApplication delegate class is unavailable".to_string());
        }

        let implementation: Imp = unsafe { mem::transmute::<unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> *mut AnyObject, Imp>(application_dock_menu) };
        let added = unsafe { class_addMethod(delegate_class, sel!(applicationDockMenu:), implementation, c"@@:@".as_ptr()) };
        if !added.as_bool() {
            return Err("NSApplication delegate already defines applicationDockMenu:".to_string());
        }

        Ok(())
    }

    pub fn replace_dock_menu(sessions: Vec<DockRecentSession>) -> Result<(), String> {
        let dock_menu = Submenu::new("Recent Sessions", true);

        for session in sessions.iter().take(5) {
            let item = session_menu_item(session);
            dock_menu.append(&item).map_err(|error| error.to_string())?;
        }

        if sessions.len() > 5 {
            let more_menu = Submenu::new("More", true);
            for session in sessions.iter().skip(5).take(10) {
                let item = session_menu_item(session);
                more_menu.append(&item).map_err(|error| error.to_string())?;
            }
            dock_menu.append(&more_menu).map_err(|error| error.to_string())?;
        }

        DOCK_MENU.with(|slot| {
            slot.replace(if sessions.is_empty() { None } else { Some(dock_menu) });
        });
        Ok(())
    }

    fn session_menu_item(session: &DockRecentSession) -> MenuItem {
        MenuItem::with_id(format!("{DOCK_RECENT_SESSION_PREFIX}{}", session.id), &session.title, true, None)
    }

    unsafe extern "C-unwind" fn application_dock_menu(_delegate: *mut AnyObject, _selector: Sel, _application: *mut AnyObject) -> *mut AnyObject {
        DOCK_MENU.with(|slot| slot.borrow().as_ref().map(|menu| menu.ns_menu().cast::<AnyObject>()).unwrap_or_else(ptr::null_mut))
    }
}
