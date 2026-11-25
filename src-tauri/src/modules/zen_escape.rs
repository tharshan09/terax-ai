//! Esc ends zen mode over a preview even while focus sits inside its iframe,
//! where the app's own page gets no key event. The macOS monitor sees the key
//! before the webview, passes it on unchanged and emits an event to the page.
//! The switch and the decision are plain Rust on every platform; only the
//! macOS arm installs the monitor that reads them.

use std::sync::atomic::{AtomicBool, Ordering};

/// Event the macOS monitor emits, without a payload.
pub const ZEN_ESCAPE_EVENT: &str = "terax:zen-escape";

/// macOS virtual key code of Esc (`kVK_Escape`).
pub const ESCAPE_KEY_CODE: u16 = 53;

/// The only window whose key presses the monitor judges.
pub const MAIN_WINDOW_LABEL: &str = "main";

/// Set by [`zen_escape_arm`]; only the macOS monitor reads it.
static ARMED: AtomicBool = AtomicBool::new(false);

/// Modifier keys held with a key press.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub command: bool,
    pub shift: bool,
    pub control: bool,
    pub option: bool,
}

/// True only for Esc without a modifier in the main window while armed.
pub fn ends_zen(key_code: u16, modifiers: Modifiers, armed: bool, window: Option<&str>) -> bool {
    let Modifiers {
        command,
        shift,
        control,
        option,
    } = modifiers;
    armed
        && key_code == ESCAPE_KEY_CODE
        && !(command || shift || control || option)
        && window == Some(MAIN_WINDOW_LABEL)
}

/// Sets the switch the macOS Esc monitor reads; on other platforms nothing
/// reads it, so the command has no effect there.
#[tauri::command]
pub fn zen_escape_arm(armed: bool) {
    ARMED.store(armed, Ordering::SeqCst);
}

/// Local keyDown monitor, built like `install_tab_swipe_monitor` in `lib.rs`:
/// it sees key presses before the WKWebView, passes every event on unchanged
/// and emits [`ZEN_ESCAPE_EVENT`] when [`ends_zen`] says so.
#[cfg(target_os = "macos")]
pub fn install_zen_escape_monitor(app: &tauri::AppHandle) {
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};
    use std::ptr::NonNull;
    use tauri::Emitter;

    let handle = app.clone();

    let block = block2::RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let pass = event.as_ptr();
        // SAFETY: AppKit dispatches keyDown events to this monitor with a
        // valid NSEvent; we only read it for the duration of the call.
        let e = unsafe { event.as_ref() };

        // Disarmed, skip the window lookup; the decision checks the switch too.
        let armed = ARMED.load(Ordering::SeqCst);
        if !armed {
            return pass;
        }
        let flags = e.modifierFlags();
        let modifiers = Modifiers {
            command: flags.contains(NSEventModifierFlags::Command),
            shift: flags.contains(NSEventModifierFlags::Shift),
            control: flags.contains(NSEventModifierFlags::Control),
            option: flags.contains(NSEventModifierFlags::Option),
        };
        let window = window_label(&handle, e.windowNumber());
        if ends_zen(e.keyCode(), modifiers, armed, window.as_deref()) {
            let _ = handle.emit(ZEN_ESCAPE_EVENT, ());
        }
        pass
    });

    // The returned monitor lives for the whole app; we never remove it.
    unsafe {
        let monitor =
            NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block);
        std::mem::forget(monitor);
    }
}

/// Label of the Tauri window AppKit numbers `number` (the local monitor sees
/// the events of every window, Settings included).
#[cfg(target_os = "macos")]
fn window_label(app: &tauri::AppHandle, number: isize) -> Option<String> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use tauri::Manager;

    app.webview_windows()
        .into_iter()
        .find_map(|(label, window)| {
            let ns_window = window.ns_window().ok()? as *mut AnyObject;
            if ns_window.is_null() {
                return None;
            }
            // SAFETY: the monitor runs on the main thread, and the pointer is
            // tauri's live NSWindow, checked before it is used.
            let own: isize = unsafe { msg_send![ns_window, windowNumber] };
            (own == number).then_some(label)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: Modifiers = Modifiers {
        command: false,
        shift: false,
        control: false,
        option: false,
    };

    #[test]
    fn ac6_only_a_bare_esc_in_the_armed_main_window_ends_zen() {
        let held = |command, shift, control, option| Modifiers {
            command,
            shift,
            control,
            option,
        };
        // (case, key code, modifiers, armed, window, expected)
        let cases = [
            ("esc, armed, main", 53, NONE, true, Some("main"), true),
            ("esc, not armed", 53, NONE, false, Some("main"), false),
            ("cmd+esc", 53, held(true, false, false, false), true, Some("main"), false),
            ("shift+esc", 53, held(false, true, false, false), true, Some("main"), false),
            ("control+esc", 53, held(false, false, true, false), true, Some("main"), false),
            ("option+esc", 53, held(false, false, false, true), true, Some("main"), false),
            ("return", 36, NONE, true, Some("main"), false),
            ("esc in settings", 53, NONE, true, Some("settings"), false),
            ("esc without a tauri window", 53, NONE, true, None, false),
        ];
        let wrong: Vec<&str> = cases
            .into_iter()
            .filter(|&(_, key_code, modifiers, armed, window, expected)| {
                ends_zen(key_code, modifiers, armed, window) != expected
            })
            .map(|(case, ..)| case)
            .collect();
        assert_eq!(wrong, Vec::<&str>::new(), "decided wrongly");
    }

    #[test]
    fn ac6_the_event_name_and_key_code_are_the_agreed_ones() {
        assert_eq!(ZEN_ESCAPE_EVENT, "terax:zen-escape");
        assert_eq!(ESCAPE_KEY_CODE, 53);
        assert_eq!(MAIN_WINDOW_LABEL, "main");
    }

    #[test]
    fn ac7_arming_sets_the_switch_and_disarming_clears_it() {
        zen_escape_arm(true);
        assert!(ARMED.load(Ordering::SeqCst));
        zen_escape_arm(false);
        assert!(!ARMED.load(Ordering::SeqCst));
    }

    // Off macOS the monitor is not compiled; this pins that everything before
    // the first macOS item (switch, decision, command) neither installs a
    // monitor nor emits, and that the monitor exists only under that cfg.
    #[test]
    fn ac7_only_the_macos_arm_installs_a_monitor_or_emits() {
        // A checkout with CRLF line ends must not change what this test sees.
        let source = include_str!("zen_escape.rs").replace("\r\n", "\n");
        let gate = "#[cfg(target_os = \"macos\")]\n";
        let (shared, macos) = source.split_once(gate).expect("a macOS arm");
        for needle in [".emit(", "addLocalMonitor", "fn install_zen_escape_monitor"] {
            assert!(!shared.contains(needle), "{needle} outside the macOS arm");
        }
        assert!(
            macos.starts_with("pub fn install_zen_escape_monitor(app: &tauri::AppHandle) {"),
            "the monitor must sit right under its cfg"
        );
        let code = source.split("#[cfg(test)]").next().unwrap();
        assert_eq!(code.matches("fn install_zen_escape_monitor").count(), 1);
    }

    // OB-2: switch, decision and command carry no cfg, so this Linux build
    // compiles and lints them; the AppKit crates appear only in the macOS arm.
    #[test]
    fn ac8_switch_and_decision_build_on_every_platform() {
        // A checkout with CRLF line ends must not change what this test sees.
        let source = include_str!("zen_escape.rs").replace("\r\n", "\n");
        let code = source.split("#[cfg(test)]").next().unwrap();
        let (shared, macos) = code.split_once("#[cfg(target_os = \"macos\")]\n").unwrap();
        for needle in ["#[cfg", "objc2", "block2", "NSEvent"] {
            assert!(!shared.contains(needle), "{needle} in the shared part");
        }
        for item in ["static ARMED", "pub fn ends_zen(", "pub fn zen_escape_arm("] {
            assert!(shared.contains(item), "{item} must stay outside cfg");
        }
        assert!(macos.contains("NSEventMask::KeyDown"), "the monitor watches key presses");
        assert!(ends_zen(ESCAPE_KEY_CODE, NONE, true, Some(MAIN_WINDOW_LABEL)));
    }
}
