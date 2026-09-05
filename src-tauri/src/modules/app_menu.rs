use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::sync::OnceLock;

use tauri::{
    menu::{Menu, MenuEvent, MenuId, MenuItem},
    AppHandle, Manager, Runtime,
};

const GUARDED_QUIT_MENU_ID: &str = "terax.quit";
const QUIT_ACCELERATOR: &str = "Command+Q";

fn invalid_default_menu(message: &'static str) -> tauri::Error {
    io::Error::new(io::ErrorKind::InvalidData, message).into()
}

fn is_guarded_quit(id: &MenuId) -> bool {
    id == GUARDED_QUIT_MENU_ID
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let app_menu = menu
        .items()?
        .into_iter()
        .next()
        .and_then(|item| item.as_submenu().cloned())
        .ok_or_else(|| invalid_default_menu("macOS default app menu is missing"))?;
    let items = app_menu.items()?;
    let quit_index = items
        .len()
        .checked_sub(1)
        .ok_or_else(|| invalid_default_menu("macOS default app menu is empty"))?;
    let native_quit = items[quit_index]
        .as_predefined_menuitem()
        .ok_or_else(|| invalid_default_menu("macOS default Quit item is not predefined"))?;
    let quit_text = native_quit.text()?;
    if quit_text != "Quit" && !quit_text.starts_with("Quit ") {
        return Err(invalid_default_menu(
            "macOS default app menu does not end with Quit",
        ));
    }

    let guarded_quit = MenuItem::with_id(
        app,
        GUARDED_QUIT_MENU_ID,
        quit_text,
        true,
        Some(QUIT_ACCELERATOR),
    )?;
    app_menu.remove_at(quit_index)?;
    app_menu.insert(&guarded_quit, quit_index)?;

    Ok(menu)
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if !is_guarded_quit(event.id()) {
        return;
    }
    if !request_guarded_quit(app) {
        app.exit(0);
    }
}

/// Route a quit through the frontend close guard: raise the main window and
/// ask it to close, which the guard can cancel to show its dialog. Returns
/// false when there is nothing to guard and the caller should just exit.
fn request_guarded_quit<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Some(main) = app.get_webview_window("main") else {
        return false;
    };

    // Settings is a child window ordered above main on macOS; hide it so the
    // in-webview close-guard dialog (busy terminal / unsaved editor) is not
    // covered by it. Remembered so cancelling the quit can bring it back.
    if let Some(settings) = app.get_webview_window("settings") {
        if settings.is_visible().unwrap_or(false) && settings.hide().is_ok() {
            SETTINGS_HIDDEN.store(true, Ordering::SeqCst);
        }
    }
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    if let Err(error) = main.close() {
        log::error!("could not request guarded app quit: {error}");
        restore_hidden_settings(app);
        return false;
    }
    true
}

/// Settings we hid to uncover the guard dialog; brought back if the user then
/// declines the quit, so a cancelled Dock quit does not eat their window.
static SETTINGS_HIDDEN: AtomicBool = AtomicBool::new(false);

fn restore_hidden_settings<R: Runtime>(app: &AppHandle<R>) {
    if !SETTINGS_HIDDEN.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Some(settings) = app.get_webview_window("settings") {
        let _ = settings.show();
    }
}

/// The frontend declined a close it had been asked for. Undoes what routing a
/// quit through the guard changed, and releases a native quit still waiting on
/// the answer. A no-op when the close came from the window's own button.
pub fn on_close_declined<R: Runtime>(app: &AppHandle<R>) {
    restore_hidden_settings(app);
    #[cfg(target_os = "macos")]
    reply_to_terminate(app, false);
}

/// The main window is gone, so a native quit waiting on the guard may proceed.
#[cfg(target_os = "macos")]
pub fn on_main_window_destroyed<R: Runtime>(app: &AppHandle<R>) {
    SETTINGS_HIDDEN.store(false, Ordering::SeqCst);
    reply_to_terminate(app, true);
}

/// Quits that do not come from our menu item: the Dock's Quit, `osascript -e
/// 'quit app "Terax"'`, and a logout or restart all reach AppKit as
/// `-terminate:`, which never raises a window close and so skipped the guard
/// entirely. The delegate tao installs does not implement
/// `applicationShouldTerminate:`, so we add it at runtime.
///
/// The answer is `NSTerminateLater`, not `NSTerminateCancel`: the guard runs in
/// the webview and cannot say synchronously whether anything needs saving, and
/// a plain cancel would abort a whole logout or restart even when the app had
/// nothing to hold on to. We defer instead, and reply once the guard resolves.
///
/// Deferring means a webview that never answers would leave the app unable to
/// quit, where before it died at once. Quitting a second time while an answer
/// is outstanding therefore goes through unguarded.
#[cfg(target_os = "macos")]
pub fn install_terminate_guard(app: &AppHandle) {
    use objc2::runtime::{AnyClass, AnyObject, Imp};
    use objc2::{msg_send, sel};

    if APP.set(app.clone()).is_err() {
        return;
    }

    // SAFETY: reading NSApp's delegate and its class on the main thread, where
    // tauri runs `setup`. Every pointer is checked before it is dereferenced.
    unsafe {
        let Some(ns_app_class) = AnyClass::get(c"NSApplication") else {
            log::warn!("guarded quit: NSApplication class missing");
            return;
        };
        let ns_app: *mut AnyObject = msg_send![ns_app_class, sharedApplication];
        if ns_app.is_null() {
            log::warn!("guarded quit: no shared NSApplication");
            return;
        }
        let delegate: *mut AnyObject = msg_send![ns_app, delegate];
        if delegate.is_null() {
            log::warn!("guarded quit: NSApplication has no delegate yet");
            return;
        }
        let class = (*delegate).class();
        let sel = sel!(applicationShouldTerminate:);
        if class.responds_to(sel) {
            // A future tao that answers this itself must keep owning it, or we
            // would replace its behaviour with ours.
            log::warn!("guarded quit: the app delegate already answers applicationShouldTerminate:");
            return;
        }
        let imp: Imp = std::mem::transmute::<
            extern "C" fn(*mut AnyObject, objc2::runtime::Sel, *mut AnyObject) -> usize,
            Imp,
        >(should_terminate);
        // "L@:@": NSUInteger return, self, _cmd, the sending NSApplication.
        let added = objc2::ffi::class_addMethod(
            class as *const AnyClass as *mut AnyClass,
            sel,
            imp,
            c"L@:@".as_ptr(),
        );
        if !added.as_bool() {
            log::warn!("guarded quit: could not install applicationShouldTerminate:");
        }
    }
}

#[cfg(target_os = "macos")]
static APP: OnceLock<AppHandle> = OnceLock::new();

/// `NSApplicationTerminateReply`. `Later` keeps AppKit waiting until we call
/// `replyToApplicationShouldTerminate:`.
#[cfg(target_os = "macos")]
const NS_TERMINATE_NOW: usize = 1;
#[cfg(target_os = "macos")]
const NS_TERMINATE_LATER: usize = 2;

/// Set while AppKit waits for the answer we deferred, so a close that came
/// from the window's own button does not reply to a quit nobody asked for.
#[cfg(target_os = "macos")]
static TERMINATE_DEFERRED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
extern "C" fn should_terminate(
    _this: *mut objc2::runtime::AnyObject,
    _cmd: objc2::runtime::Sel,
    _sender: *mut objc2::runtime::AnyObject,
) -> usize {
    // A panic here would cross an extern "C" boundary and abort the whole
    // process, which is exactly what this fork moved off `panic = "abort"` to
    // avoid. Quitting unguarded is the better failure.
    std::panic::catch_unwind(|| {
        let Some(app) = APP.get() else {
            return NS_TERMINATE_NOW;
        };
        // Asking twice means the first answer never came: the dialog is
        // covered, or the webview is wedged and will never draw it. Routing a
        // second quit through the same guard would wait forever, so this is
        // the way out short of Force Quit.
        if TERMINATE_DEFERRED.swap(false, Ordering::SeqCst) {
            log::warn!("second quit request while the close guard had not answered; quitting");
            return NS_TERMINATE_NOW;
        }
        if !request_guarded_quit(app) {
            return NS_TERMINATE_NOW;
        }
        TERMINATE_DEFERRED.store(true, Ordering::SeqCst);
        NS_TERMINATE_LATER
    })
    .unwrap_or(NS_TERMINATE_NOW)
}

/// Answer a deferred `applicationShouldTerminate:`; no-op when none is waiting.
/// AppKit requires this on the main thread.
#[cfg(target_os = "macos")]
fn reply_to_terminate<R: Runtime>(app: &AppHandle<R>, proceed: bool) {
    if !TERMINATE_DEFERRED.swap(false, Ordering::SeqCst) {
        return;
    }
    let _ = app.run_on_main_thread(move || {
        use objc2::runtime::{AnyClass, AnyObject, Bool};
        use objc2::msg_send;
        // SAFETY: main thread, and the pointer is checked before it is used.
        unsafe {
            let Some(class) = AnyClass::get(c"NSApplication") else {
                return;
            };
            let ns_app: *mut AnyObject = msg_send![class, sharedApplication];
            if ns_app.is_null() {
                return;
            }
            let _: () = msg_send![ns_app, replyToApplicationShouldTerminate: Bool::new(proceed)];
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{is_guarded_quit, GUARDED_QUIT_MENU_ID};
    use tauri::menu::MenuId;

    #[test]
    fn only_guarded_quit_id_requests_window_close() {
        assert!(is_guarded_quit(&MenuId::new(GUARDED_QUIT_MENU_ID)));
        assert!(!is_guarded_quit(&MenuId::new("unrelated")));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn terminate_replies_match_appkit() {
        // Guard against a typo silently letting every Dock quit through, or
        // leaving AppKit waiting for a reply we never promised.
        assert_eq!(super::NS_TERMINATE_NOW, 1);
        assert_eq!(super::NS_TERMINATE_LATER, 2);
    }
}
