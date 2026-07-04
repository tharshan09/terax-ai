//! Dev-only e2e test bridge. Armed ONLY when both hold: a debug build AND the
//! `TERAX_TEST_BRIDGE` env var names a directory. A background thread polls
//! that directory for `cmd-<id>.js` files, forwards each snippet to the main
//! webview via the `terax-test:eval` event (executed by the dev-only frontend
//! listener), and the frontend posts the JSON outcome back through
//! `test_bridge_result`, which lands as `res-<id>.json` next to the command.
//!
//! This exists because WKWebView on macOS has no WebDriver endpoint
//! (tauri-driver does not support macOS), so driving the real app in an e2e
//! session needs an in-process hatch. Release builds refuse both ends at
//! runtime, and nothing here listens on the network.

use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

fn bridge_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var_os("TERAX_TEST_BRIDGE").map(PathBuf::from)
}

/// Ids come from filenames we later splice into the result filename; keep them
/// too boring to traverse anywhere.
fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Start the command-file poller. No-op unless the bridge is armed.
pub fn spawn(app: &AppHandle) {
    let Some(dir) = bridge_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    log::info!("test bridge armed at {}", dir.display());
    let handle = app.clone();
    std::thread::spawn(move || loop {
        let mut cmds: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n.starts_with("cmd-") && n.ends_with(".js"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        cmds.sort();
        for path in cmds {
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .and_then(|s| s.strip_prefix("cmd-"))
                .unwrap_or_default()
                .to_string();
            let Ok(js) = std::fs::read_to_string(&path) else {
                continue;
            };
            // Remove BEFORE emitting so a snippet that hangs the frontend is
            // never re-delivered on the next poll round.
            let _ = std::fs::remove_file(&path);
            if !is_valid_id(&id) {
                continue;
            }
            let _ = handle.emit("terax-test:eval", serde_json::json!({ "id": id, "js": js }));
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    });
}

/// Frontend's return channel: writes `res-<id>.json` atomically into the
/// bridge directory. Rejects everything when the bridge is not armed.
#[tauri::command]
pub fn test_bridge_result(id: String, payload: String) -> Result<(), String> {
    let dir = bridge_dir().ok_or("test bridge is not armed")?;
    if !is_valid_id(&id) {
        return Err("invalid bridge id".into());
    }
    let tmp = dir.join(format!("res-{id}.json.tmp"));
    let out = dir.join(format!("res-{id}.json"));
    std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &out).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_stay_filename_safe() {
        assert!(is_valid_id("1"));
        assert!(is_valid_id("step_2-a"));
        assert!(!is_valid_id(""));
        assert!(!is_valid_id("../evil"));
        assert!(!is_valid_id("a/b"));
        assert!(!is_valid_id(&"x".repeat(65)));
    }
}
