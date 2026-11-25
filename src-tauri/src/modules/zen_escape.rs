/// Arms the macOS Esc monitor while zen mode shows a preview; armed, it emits
/// `terax:zen-escape` on Esc without modifiers in the main window.
#[tauri::command]
pub fn zen_escape_arm(armed: bool) {
    let _ = armed;
}

#[cfg(target_os = "macos")]
pub fn install_zen_escape_monitor(app: &tauri::AppHandle) {
    let _ = app;
}
