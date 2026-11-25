pub mod policy;

use crate::modules::workspace::WorkspaceEnv;
use serde::Serialize;

/// Grants of the preview server, kept in memory until the process ends.
// Braced, not a unit struct, so `PreviewServer::default()` in `lib.rs` keeps
// its form once the grant fields arrive.
#[derive(Default)]
pub struct PreviewServer {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserOpenStatus {
    Opened,
    Unsupported,
    Refused,
    TooLarge,
    Unreachable,
    LimitReached,
    OpenFailed,
}

/// `reason` is set only for `refused`, `unreachable` and `open_failed`; never
/// an address, a port or a token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpen {
    pub status: BrowserOpenStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FrameStatus {
    Ready,
    Unsupported,
    Refused,
    TooLarge,
    Unreachable,
    LimitReached,
}

/// `url` is set only for `ready` and goes to the in-app iframe only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSource {
    pub status: FrameStatus,
    pub url: Option<String>,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn preview_open_in_browser(
    app: tauri::AppHandle,
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<BrowserOpen, String> {
    let _ = (app, path, workspace);
    Ok(BrowserOpen {
        status: BrowserOpenStatus::Unsupported,
        reason: None,
    })
}

#[tauri::command]
pub async fn preview_frame_source(
    app: tauri::AppHandle,
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<FrameSource, String> {
    let _ = (app, path, workspace);
    Ok(FrameSource {
        status: FrameStatus::Unsupported,
        url: None,
        reason: None,
    })
}
