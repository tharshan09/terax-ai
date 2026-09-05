use std::io;
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
    // covered by it.
    if let Some(settings) = app.get_webview_window("settings") {
        let _ = settings.hide();
    }
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    if let Err(error) = main.close() {
        log::error!("could not request guarded app quit: {error}");
        return false;
    }
    true
}

/// Quits that do not come from our menu item: the Dock's Quit, `osascript -e
/// 'quit app "Terax"'`, and a logout or restart all reach AppKit as
/// `-terminate:`, which never raises a window close and so skipped the guard
/// entirely. The delegate tao installs does not implement
/// `applicationShouldTerminate:`, so we add it at runtime and answer
/// `NSTerminateCancel` after routing the quit through the same guarded close
/// the menu item uses. Confirming in the dialog closes the window, which ends
/// the event loop on its own; no reply to AppKit is needed.
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

/// `NSApplicationTerminateReply`: cancel this termination, or go ahead with it.
#[cfg(target_os = "macos")]
const NS_TERMINATE_CANCEL: usize = 0;
#[cfg(target_os = "macos")]
const NS_TERMINATE_NOW: usize = 1;

#[cfg(target_os = "macos")]
extern "C" fn should_terminate(
    _this: *mut objc2::runtime::AnyObject,
    _cmd: objc2::runtime::Sel,
    _sender: *mut objc2::runtime::AnyObject,
) -> usize {
    let Some(app) = APP.get() else {
        return NS_TERMINATE_NOW;
    };
    if request_guarded_quit(app) {
        NS_TERMINATE_CANCEL
    } else {
        NS_TERMINATE_NOW
    }
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
        // Guard against a typo silently letting every Dock quit through.
        assert_eq!(super::NS_TERMINATE_CANCEL, 0);
        assert_eq!(super::NS_TERMINATE_NOW, 1);
    }
}
