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

/// Subtle native feedback for a user-initiated timeline dot hover.
#[tauri::command]
pub async fn trigger_timeline_haptic(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = sender.send(macos::perform_timeline_haptic());
        })
        .map_err(|error| error.to_string())?;
        receiver.await.map_err(|_| "macOS haptic dispatch was cancelled".to_string())?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(())
    }
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
    use std::ffi::CStr;
    use std::mem;
    use std::ptr;

    thread_local! {
        static DOCK_MENU: RefCell<Option<Submenu>> = const { RefCell::new(None) };
        static HAPTIC_ENGINE: RefCell<*mut AnyObject> = const { RefCell::new(std::ptr::null_mut()) };
    }

    pub fn perform_timeline_haptic() -> Result<(), String> {
        // Core Haptics gives us a real, tunable Taptic Engine hit (unlike the
        // AppKit feedback manager, which is capped at a subtle level and only
        // works on a Force Touch trackpad). Falls back to AppKit when Core
        // Haptics is unavailable (older hardware, no Taptic Engine).
        match perform_core_haptic() {
            Ok(()) => Ok(()),
            Err(core_error) => {
                log::debug!("Core Haptics unavailable ({core_error}); falling back to AppKit feedback");
                perform_appkit_haptic()
            }
        }
    }

    /// Strong, deliberate timeline hover hit via Core Haptics.
    fn perform_core_haptic() -> Result<(), String> {
        let engine = acquire_haptic_engine()?;
        if engine.is_null() {
            return Err("No haptic engine".to_string());
        }

        // One transient tap: intensity ~0.9 (strong), sharpness ~0.7 (crisp).
        let pattern = build_haptic_pattern()?;

        unsafe {
            let pattern_cls: &AnyClass = AnyClass::get(c"CHHapticPattern").ok_or("CHHapticPattern class unavailable")?;
            let mut pattern_err: *mut AnyObject = std::ptr::null_mut();
            let alloced: *mut AnyObject = msg_send![pattern_cls, alloc];
            let pattern_obj: *mut AnyObject = msg_send![alloced, initWithDictionary: pattern, error: &mut pattern_err];
            if pattern_obj.is_null() {
                return Err("Failed to build CHHapticPattern".to_string());
            }

            let mut player: *mut AnyObject = std::ptr::null_mut();
            let _: () = msg_send![engine, makePlayerWithPattern: pattern_obj, error: &mut player];
            if player.is_null() {
                return Err("Failed to create CHHapticPatternPlayer".to_string());
            }

            let mut start_err: *mut AnyObject = std::ptr::null_mut();
            let _: () = msg_send![player, startAtTime: 0.0f64, error: &mut start_err];
        }
        Ok(())
    }

    /// Build a Core Haptics pattern dictionary holding one transient event.
    fn build_haptic_pattern() -> Result<*mut AnyObject, String> {
        let intensity = event_parameter(c"HapticIntensity", 0.9);
        let sharpness = event_parameter(c"HapticSharpness", 0.7);
        let event = ns_dict(&[c"Event type", c"Time", c"Event parameters"], &[ns_string(c"HapticTransient"), ns_number(0.0), ns_array(&[intensity, sharpness])])?;
        ns_dict(&[c"Pattern"], &[ns_array(&[event])])
    }

    fn event_parameter(key: &CStr, value: f64) -> *mut AnyObject {
        ns_dict(&[c"ParameterID", c"ParameterValue"], &[ns_string(key), ns_number(value)]).unwrap_or(std::ptr::null_mut())
    }

    /// Persistent Core Haptics engine, created once on the main thread and
    /// reused across hovers (the haptic command always runs on the main thread).
    fn acquire_haptic_engine() -> Result<*mut AnyObject, String> {
        let cached = HAPTIC_ENGINE.with(|slot| *slot.borrow());
        if !cached.is_null() {
            return Ok(cached);
        }

        unsafe {
            let cls: &AnyClass = AnyClass::get(c"CHHapticEngine").ok_or("CHHapticEngine class unavailable")?;
            let alloced: *mut AnyObject = msg_send![cls, alloc];
            let engine: *mut AnyObject = msg_send![alloced, init];
            if engine.is_null() {
                return Err("CHHapticEngine init returned null".to_string());
            }
            let _: () = msg_send![engine, startWithCompletionHandler: std::ptr::null_mut::<AnyObject>()];
            HAPTIC_ENGINE.with(|slot| *slot.borrow_mut() = engine);
            Ok(engine)
        }
    }

    fn perform_appkit_haptic() -> Result<(), String> {
        let manager = AnyClass::get(c"NSHapticFeedbackManager").ok_or("NSHapticFeedbackManager is unavailable")?;
        let performer: *mut AnyObject = unsafe { msg_send![manager, defaultPerformer] };
        if performer.is_null() {
            return Err("No haptic performer for the current input device".to_string());
        }
        // Alignment pattern (1) is a crisper click than Generic (0); perform now (1).
        let _: () = unsafe { msg_send![performer, performFeedbackPattern: 1isize, performanceTime: 1usize] };
        Ok(())
    }

    // --- Small Objective-C object helpers (objc2 runtime, no extra deps) ---

    fn ns_string(s: &CStr) -> *mut AnyObject {
        unsafe {
            let cls: *mut AnyObject = msg_send![AnyClass::get(c"NSString").unwrap(), alloc];
            msg_send![cls, initWithUTF8String: s.as_ptr()]
        }
    }

    fn ns_number(value: f64) -> *mut AnyObject {
        unsafe {
            let cls: *mut AnyObject = msg_send![AnyClass::get(c"NSNumber").unwrap(), alloc];
            msg_send![cls, initWithDouble: value]
        }
    }

    fn ns_array(items: &[*mut AnyObject]) -> *mut AnyObject {
        unsafe {
            let cls: *mut AnyObject = msg_send![AnyClass::get(c"NSArray").unwrap(), alloc];
            msg_send![cls, initWithObjects: items.as_ptr(), count: items.len()]
        }
    }

    fn ns_dict(keys: &[&CStr], values: &[*mut AnyObject]) -> Result<*mut AnyObject, String> {
        if keys.len() != values.len() {
            return Err("ns_dict key/value length mismatch".to_string());
        }
        let key_objs: Vec<*mut AnyObject> = keys.iter().map(|k| ns_string(k)).collect();
        unsafe {
            let cls: *mut AnyObject = msg_send![AnyClass::get(c"NSDictionary").unwrap(), alloc];
            Ok(msg_send![
                cls,
                initWithObjects: values.as_ptr(),
                forKeys: key_objs.as_ptr(),
                count: values.len()
            ])
        }
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
