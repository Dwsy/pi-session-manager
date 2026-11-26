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

/// Native trackpad feedback for a user-initiated timeline dot hover.
///
/// On macOS this drives the private MultitouchSupport actuator through the
/// standalone engine in `macos::haptics`, with AppKit as a fallback. The
/// delayed pulses are scheduled on a dedicated serial thread so they are not
/// swallowed when the Tauri main thread's run loop is busy.
#[tauri::command]
pub fn trigger_timeline_haptic(app: AppHandle, options: Option<TimelineHapticOptions>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let _ = app;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, options);

    #[cfg(target_os = "macos")]
    if let Some(options) = options {
        macos::haptics::tick(options.style, options.strength);
    }

    Ok(())
}

/// Haptic style and strength for one timeline tick. Keep the wire names in
/// sync with `src/utils/timelineHaptics.ts`.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineHapticOptions {
    #[serde(default)]
    pub style: HapticStyle,
    #[serde(default)]
    pub strength: HapticStrength,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HapticStyle {
    /// Double tooth: strong -> 45ms -> medium. Matches Alma's EDC feel.
    #[default]
    Edc,
    Single,
    Double,
    Engage,
    Triple,
    /// AppKit alignment pulse.
    Soft,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HapticStrength {
    Weak,
    Medium,
    #[default]
    Strong,
}

impl HapticStrength {
    /// MTActuatorActuate type IDs, reverse engineered from Alma's HapticTool.
    const fn actuation_type(self) -> i32 {
        match self {
            Self::Weak => 3,
            Self::Medium => 4,
            Self::Strong => 6,
        }
    }

    /// Alma's `ZL` helper: drop one strength level, clamped at weak.
    const fn lower(self) -> Self {
        match self {
            Self::Weak => Self::Weak,
            Self::Medium => Self::Weak,
            Self::Strong => Self::Medium,
        }
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
    use super::{DockRecentSession, HapticStrength, HapticStyle, DOCK_RECENT_SESSION_PREFIX};
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

    /// Standalone macOS trackpad haptic engine.
    ///
    /// Directly opens the private MultitouchSupport framework instead of
    /// relying on Alma's HapticTool.app, then drives the first Force Touch
    /// actuator advertised by IOKit. Delayed pulses run on a dedicated serial
    /// thread: a main-thread runloop can be busy and swallow them.
    pub mod haptics {
        use crate::macos_dock::{HapticStrength, HapticStyle};
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};
        use objc2_core_foundation::{CFBoolean, CFNumber, CFNumberType, CFRetained, CFString, CFType};
        use std::ffi::{c_char, c_int, c_void};
        use std::ptr::{self, NonNull};
        use std::sync::{mpsc, Mutex, MutexGuard, OnceLock};
        use std::thread;
        use std::time::Duration;

        // MultitouchSupport is private; these signatures are reconstructed
        // from Alma's HapticTool debug output and StandaloneHaptics.swift.
        type CreateActuator = unsafe extern "C-unwind" fn(u64) -> *mut c_void;
        type ChangeState = unsafe extern "C-unwind" fn(*mut c_void) -> i32;
        type Actuate = unsafe extern "C-unwind" fn(*mut c_void, i32, u32, f32, f32) -> i32;

        const FRAMEWORK_PATH: &[u8] = b"/System/Library/PrivateFrameworks/MultitouchSupport.framework/MultitouchSupport\0";
        const KERN_SUCCESS: i32 = 0;
        const APPKIT_ALIGNMENT: isize = 1; // NSHapticFeedbackPatternAlignment
        const APPKIT_LEVEL_CHANGE: isize = 2; // NSHapticFeedbackPatternLevelChange
        const APPKIT_NOW: usize = 1; // NSHapticFeedbackPerformanceTimeNow

        // IOKit symbols below are declared directly rather than through a
        // crate, so the framework has to be named here — without it the
        // linker resolves nothing and the whole binary fails to link.
        #[link(name = "IOKit", kind = "framework")]
        extern "C-unwind" {
            fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
            fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
            fn dlclose(handle: *mut c_void) -> c_int;

            fn IOServiceMatching(name: *const c_char) -> *mut c_void;
            fn IOServiceGetMatchingServices(main_port: u32, matching: *mut c_void, existing: *mut u32) -> i32;
            fn IOIteratorNext(iterator: u32) -> u32;
            fn IOObjectRelease(object: u32) -> i32;
            fn IORegistryEntryCreateCFProperty(entry: u32, key: *mut c_void, allocator: *mut c_void, options: u32) -> *mut c_void;
            static kIOMainPortDefault: u32;
        }
        const RTLD_NOW: c_int = 0x2;
        const RTLD_LOCAL: c_int = 0x4;

        struct Actuator {
            library: *mut c_void,
            device: *mut c_void,
            close_fn: ChangeState,
            actuate_fn: Actuate,
        }

        // SAFETY: the library handle and actuator are owned by the dedicated
        // haptic thread and never shared with other threads.
        unsafe impl Send for Actuator {}

        impl Drop for Actuator {
            fn drop(&mut self) {
                unsafe {
                    if (self.close_fn)(self.device) != KERN_SUCCESS {
                        log::debug!("MultitouchSupport actuator close failed");
                    }
                    dlclose(self.library);
                }
            }
        }

        impl Actuator {
            /// Open the first IOKit device with `ActuationSupported` and a
            /// valid `Multitouch ID`. Returns None when MultitouchSupport or a
            /// supported Force Touch trackpad is unavailable.
            fn open() -> Option<Self> {
                let library = unsafe { dlopen(FRAMEWORK_PATH.as_ptr().cast(), RTLD_NOW | RTLD_LOCAL) };
                if library.is_null() {
                    log::debug!("MultitouchSupport framework is unavailable");
                    return None;
                }

                let create = match symbol(library, b"MTActuatorCreateFromDeviceID\0") {
                    Some(value) => value,
                    None => return close_library(library),
                };
                let open = match symbol(library, b"MTActuatorOpen\0") {
                    Some(value) => value,
                    None => return close_library(library),
                };
                let close = match symbol(library, b"MTActuatorClose\0") {
                    Some(value) => value,
                    None => return close_library(library),
                };
                let actuate = match symbol(library, b"MTActuatorActuate\0") {
                    Some(value) => value,
                    None => return close_library(library),
                };
                let create: CreateActuator = unsafe { std::mem::transmute(create) };
                let open: ChangeState = unsafe { std::mem::transmute(open) };
                let close: ChangeState = unsafe { std::mem::transmute(close) };
                let actuate: Actuate = unsafe { std::mem::transmute(actuate) };

                // IOServiceGetMatchingServices consumes the matching dictionary.
                let matching = unsafe { IOServiceMatching(c"AppleMultitouchDevice".as_ptr()) };
                if matching.is_null() {
                    unsafe { dlclose(library) };
                    return None;
                }
                let mut iterator = 0u32;
                let status = unsafe { IOServiceGetMatchingServices(kIOMainPortDefault, matching, &mut iterator) };
                if status != KERN_SUCCESS {
                    unsafe { dlclose(library) };
                    return None;
                }

                let mut opened = None;
                loop {
                    let service = unsafe { IOIteratorNext(iterator) };
                    if service == 0 {
                        break;
                    }
                    let supports = property(service, "ActuationSupported").and_then(|value| value.downcast::<CFBoolean>().ok()).is_some_and(|value| value.value());
                    let device_id = property(service, "Multitouch ID").and_then(|value| value.downcast::<CFNumber>().ok()).and_then(|value| {
                        let mut id = 0u64;
                        let ok = unsafe { value.value(CFNumberType::SInt64Type, (&mut id as *mut u64).cast()) };
                        ok.then_some(id)
                    });
                    unsafe { IOObjectRelease(service) };

                    if !supports || device_id.is_none() {
                        continue;
                    }
                    let device = unsafe { create(device_id.unwrap()) };
                    if device.is_null() {
                        continue;
                    }
                    if unsafe { open(device) } != KERN_SUCCESS {
                        // The actuator object is created +1; no close is needed
                        // when MTActuatorOpen itself failed, but release it.
                        unsafe { release_cf_type(device) };
                        continue;
                    }
                    opened = Some(Self { library, device, close_fn: close, actuate_fn: actuate });
                    break;
                }
                unsafe { IOObjectRelease(iterator) };
                opened
            }

            fn actuate(&self, strength: HapticStrength) -> bool {
                // `(actuator, type, 0, 0, 1)` is the exact invocation used by
                // Alma's HapticTool for weak/medium/strong.
                unsafe { (self.actuate_fn)(self.device, strength.actuation_type(), 0, 0.0, 1.0) == KERN_SUCCESS }
            }
        }

        fn symbol(library: *mut c_void, name: &[u8]) -> Option<*mut c_void> {
            let name = std::ffi::CStr::from_bytes_with_nul(name).ok()?;
            let address = unsafe { dlsym(library, name.as_ptr()) };
            (!address.is_null()).then_some(address)
        }

        fn close_library<T>(library: *mut c_void) -> Option<T> {
            unsafe { dlclose(library) };
            None
        }

        fn property(entry: u32, key: &str) -> Option<CFRetained<CFType>> {
            let key = CFString::from_str(key);
            let value = unsafe { IORegistryEntryCreateCFProperty(entry, CFRetained::as_ptr(&key).as_ptr().cast(), ptr::null_mut(), 0) };
            let value = NonNull::new(value.cast::<CFType>())?;
            // IORegistryEntryCreateCFProperty follows the Create rule (+1).
            Some(unsafe { CFRetained::from_raw(value) })
        }

        unsafe fn release_cf_type(value: *mut c_void) {
            extern "C-unwind" {
                fn CFRelease(value: *mut c_void);
            }
            unsafe { CFRelease(value) };
        }

        /// One absolute actuation type at an offset (ms) from the sequence
        /// start. Mirrors Alma's comma pattern `strength,delayMs,strength`.
        #[derive(Clone, Copy)]
        struct Pulse {
            strength: HapticStrength,
            delay_ms: u32,
        }

        impl Pulse {
            const fn new(strength: HapticStrength, delay_ms: u32) -> Self {
                Self { strength, delay_ms }
            }
        }

        // Static waveform table: (style, strength) -> pulses. The final
        // user-tested EDC waveform is strong -> 45ms -> medium (double tooth).
        static SINGLE_W: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0)];
        static SINGLE_M: &[Pulse] = &[Pulse::new(HapticStrength::Medium, 0)];
        static SINGLE_S: &[Pulse] = &[Pulse::new(HapticStrength::Strong, 0)];
        static DOUBLE_W: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0), Pulse::new(HapticStrength::Weak, 45)];
        static DOUBLE_M: &[Pulse] = &[Pulse::new(HapticStrength::Medium, 0), Pulse::new(HapticStrength::Weak, 45)];
        static DOUBLE_S: &[Pulse] = &[Pulse::new(HapticStrength::Strong, 0), Pulse::new(HapticStrength::Medium, 45)];
        static ENGAGE_W: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0), Pulse::new(HapticStrength::Weak, 30)];
        static ENGAGE_M: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0), Pulse::new(HapticStrength::Medium, 30)];
        static ENGAGE_S: &[Pulse] = &[Pulse::new(HapticStrength::Medium, 0), Pulse::new(HapticStrength::Strong, 30)];
        static TRIPLE_W: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0), Pulse::new(HapticStrength::Weak, 35), Pulse::new(HapticStrength::Weak, 70)];
        static TRIPLE_M: &[Pulse] = &[Pulse::new(HapticStrength::Weak, 0), Pulse::new(HapticStrength::Weak, 35), Pulse::new(HapticStrength::Medium, 70)];
        static TRIPLE_S: &[Pulse] = &[Pulse::new(HapticStrength::Medium, 0), Pulse::new(HapticStrength::Medium, 35), Pulse::new(HapticStrength::Strong, 70)];

        fn pulses(style: HapticStyle, strength: HapticStrength) -> Option<&'static [Pulse]> {
            use HapticStrength::{Medium, Strong, Weak};
            use HapticStyle::{Double, Edc, Engage, Single, Soft, Triple};
            match (style, strength) {
                (Soft, _) => None,
                (Single, Weak) => Some(SINGLE_W),
                (Single, Medium) => Some(SINGLE_M),
                (Single, Strong) => Some(SINGLE_S),
                (Edc, Weak) | (Double, Weak) => Some(DOUBLE_W),
                (Edc, Medium) | (Double, Medium) => Some(DOUBLE_M),
                (Edc, Strong) | (Double, Strong) => Some(DOUBLE_S),
                (Engage, Weak) => Some(ENGAGE_W),
                (Engage, Medium) => Some(ENGAGE_M),
                (Engage, Strong) => Some(ENGAGE_S),
                (Triple, Weak) => Some(TRIPLE_W),
                (Triple, Medium) => Some(TRIPLE_M),
                (Triple, Strong) => Some(TRIPLE_S),
            }
        }

        enum Message {
            Tick(&'static [Pulse]),
            Stop,
        }

        struct HapticWorker {
            sender: mpsc::Sender<Message>,
        }

        impl HapticWorker {
            fn spawn() -> Self {
                let (sender, receiver) = mpsc::channel::<Message>();
                thread::Builder::new()
                    .name("timeline-haptics".to_string())
                    .spawn(move || {
                        let actuator = Actuator::open();
                        if actuator.is_none() {
                            log::debug!("Private trackpad actuator unavailable; using AppKit haptics fallback");
                        }
                        let mut start;
                        for message in receiver {
                            match message {
                                Message::Tick(sequence) => {
                                    start = std::time::Instant::now();
                                    for pulse in sequence {
                                        if pulse.delay_ms > 0 {
                                            let target = start + Duration::from_millis(pulse.delay_ms as u64);
                                            thread::sleep(target.saturating_duration_since(std::time::Instant::now()));
                                        }
                                        let delivered = actuator.as_ref().is_some_and(|actuator| actuator.actuate(pulse.strength));
                                        if !delivered {
                                            appkit_feedback(APPKIT_LEVEL_CHANGE);
                                        }
                                    }
                                }
                                Message::Stop => break,
                            }
                        }
                    })
                    .expect("failed to start the timeline haptic worker");
                Self { sender }
            }

            fn send(&self, sequence: &'static [Pulse]) {
                let _ = self.sender.send(Message::Tick(sequence));
            }
        }

        impl Drop for HapticWorker {
            fn drop(&mut self) {
                let _ = self.sender.send(Message::Stop);
            }
        }

        fn worker() -> MutexGuard<'static, HapticWorker> {
            static WORKER: OnceLock<Mutex<HapticWorker>> = OnceLock::new();
            WORKER.get_or_init(|| Mutex::new(HapticWorker::spawn())).lock().expect("haptic worker mutex poisoned")
        }

        /// Fallback for non-Force-Touch devices and actuation failures.
        fn appkit_feedback(pattern: isize) {
            let Some(manager) = AnyClass::get(c"NSHapticFeedbackManager") else { return };
            let performer: *mut AnyObject = unsafe { msg_send![manager, defaultPerformer] };
            if performer.is_null() {
                return;
            }
            let _: () = unsafe { msg_send![performer, performFeedbackPattern: pattern, performanceTime: APPKIT_NOW] };
        }

        /// Queue a haptic style for the next tick. Never blocks the caller:
        /// delayed pulses are serialised on the worker thread.
        pub fn tick(style: HapticStyle, strength: HapticStrength) {
            if style == HapticStyle::Soft {
                appkit_feedback(APPKIT_ALIGNMENT);
                return;
            }
            if let Some(sequence) = pulses(style, strength) {
                worker().send(sequence);
            }
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
