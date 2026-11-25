//! Contracts between the preview server, the typed SSH reads, the zen Esc
//! monitor and the webview. Expected values are written out here, never read
//! from the code under test.

use std::collections::BTreeSet;
use std::future::Future;
use std::time::Duration;

use serde::Serialize;
use serde_json::json;
use terax_lib::modules::fs::file::FileStat;
use terax_lib::modules::preview_server::policy::ENTRY_EXTENSIONS;
use terax_lib::modules::preview_server::{
    preview_frame_source, preview_open_in_browser, BrowserOpen, BrowserOpenStatus, FrameSource,
    FrameStatus, PreviewServer,
};
use terax_lib::modules::ssh::{
    read_bytes_typed, realpath_typed, stat_typed, RemoteFileBytes, RemoteReadError,
};
use terax_lib::modules::workspace::WorkspaceEnv;
use terax_lib::modules::zen_escape::zen_escape_arm;

fn wire<T: Serialize>(value: &T) -> serde_json::Value {
    serde_json::to_value(value).expect("contract types always serialize")
}

fn boundary_dto<T: std::fmt::Debug + Clone + PartialEq + Eq + Serialize>() {}
fn boundary_status<T: std::fmt::Debug + Clone + Copy + PartialEq + Eq + Serialize>() {}
fn plain_value<T: std::fmt::Debug + Clone + PartialEq + Eq>() {}

#[test]
fn ac1_browser_open_serializes_status_snake_case_and_null_reason() {
    let too_large = BrowserOpen {
        status: BrowserOpenStatus::TooLarge,
        reason: None,
    };
    assert_eq!(
        wire(&too_large),
        json!({ "status": "too_large", "reason": null })
    );

    let open_failed = BrowserOpen {
        status: BrowserOpenStatus::OpenFailed,
        reason: Some("no handler".to_string()),
    };
    assert_eq!(
        wire(&open_failed),
        json!({ "status": "open_failed", "reason": "no handler" })
    );
}

#[test]
fn ac1_frame_source_serializes_url_and_null_reason() {
    let ready = FrameSource {
        status: FrameStatus::Ready,
        url: Some("http://127.0.0.1:4711/t/a.html".to_string()),
        reason: None,
    };
    assert_eq!(
        wire(&ready),
        json!({ "status": "ready", "url": "http://127.0.0.1:4711/t/a.html", "reason": null })
    );
}

// Every variant must name its wire value here or this does not compile; the
// tests check that value against serde for each variant listed in `ALL_*`.
fn browser_open_status_wire(status: BrowserOpenStatus) -> &'static str {
    match status {
        BrowserOpenStatus::Opened => "opened",
        BrowserOpenStatus::Unsupported => "unsupported",
        BrowserOpenStatus::Refused => "refused",
        BrowserOpenStatus::TooLarge => "too_large",
        BrowserOpenStatus::Unreachable => "unreachable",
        BrowserOpenStatus::LimitReached => "limit_reached",
        BrowserOpenStatus::OpenFailed => "open_failed",
    }
}

const ALL_BROWSER_OPEN_STATUSES: [BrowserOpenStatus; 7] = [
    BrowserOpenStatus::Opened,
    BrowserOpenStatus::Unsupported,
    BrowserOpenStatus::Refused,
    BrowserOpenStatus::TooLarge,
    BrowserOpenStatus::Unreachable,
    BrowserOpenStatus::LimitReached,
    BrowserOpenStatus::OpenFailed,
];

fn frame_status_wire(status: FrameStatus) -> &'static str {
    match status {
        FrameStatus::Ready => "ready",
        FrameStatus::Unsupported => "unsupported",
        FrameStatus::Refused => "refused",
        FrameStatus::TooLarge => "too_large",
        FrameStatus::Unreachable => "unreachable",
        FrameStatus::LimitReached => "limit_reached",
    }
}

const ALL_FRAME_STATUSES: [FrameStatus; 6] = [
    FrameStatus::Ready,
    FrameStatus::Unsupported,
    FrameStatus::Refused,
    FrameStatus::TooLarge,
    FrameStatus::Unreachable,
    FrameStatus::LimitReached,
];

#[test]
fn ac1_browser_open_status_values_on_the_wire() {
    for status in ALL_BROWSER_OPEN_STATUSES {
        assert_eq!(wire(&status), json!(browser_open_status_wire(status)), "{status:?}");
    }
    let values: BTreeSet<&str> = ALL_BROWSER_OPEN_STATUSES
        .into_iter()
        .map(browser_open_status_wire)
        .collect();
    let expected: BTreeSet<&str> = [
        "opened",
        "unsupported",
        "refused",
        "too_large",
        "unreachable",
        "limit_reached",
        "open_failed",
    ]
    .into_iter()
    .collect();
    assert_eq!(values, expected);
}

#[test]
fn ac1_frame_status_values_on_the_wire() {
    for status in ALL_FRAME_STATUSES {
        assert_eq!(wire(&status), json!(frame_status_wire(status)), "{status:?}");
    }
    let values: BTreeSet<&str> = ALL_FRAME_STATUSES.into_iter().map(frame_status_wire).collect();
    let expected: BTreeSet<&str> = [
        "ready",
        "unsupported",
        "refused",
        "too_large",
        "unreachable",
        "limit_reached",
    ]
    .into_iter()
    .collect();
    assert_eq!(values, expected);
}

#[test]
fn ac1_boundary_types_keep_their_derives() {
    boundary_dto::<BrowserOpen>();
    boundary_dto::<FrameSource>();
    boundary_status::<BrowserOpenStatus>();
    boundary_status::<FrameStatus>();
    let _ = PreviewServer::default();
}

#[test]
fn ac2_entry_extensions_are_exactly_wave_one() {
    let expected: BTreeSet<&str> = [
        "html", "htm", "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf",
    ]
    .into_iter()
    .collect();
    let actual: BTreeSet<&str> = ENTRY_EXTENSIONS.iter().copied().collect();
    assert_eq!(actual, expected);
    assert_eq!(ENTRY_EXTENSIONS.len(), expected.len(), "no duplicates");
}

fn remote_read_error_kind(error: &RemoteReadError) -> &'static str {
    match error {
        RemoteReadError::Unreachable(_) => "unreachable",
        RemoteReadError::TimedOut(_) => "timed_out",
        RemoteReadError::Failed(_) => "failed",
        RemoteReadError::Missing => "missing",
        RemoteReadError::NotRegularFile => "not_regular_file",
        RemoteReadError::TooLarge => "too_large",
    }
}

#[test]
fn ac2_remote_read_error_has_exactly_six_variants() {
    plain_value::<RemoteReadError>();
    let all = [
        RemoteReadError::Unreachable("devbox".to_string()),
        RemoteReadError::TimedOut("devbox".to_string()),
        RemoteReadError::Failed("devbox".to_string()),
        RemoteReadError::Missing,
        RemoteReadError::NotRegularFile,
        RemoteReadError::TooLarge,
    ];
    let kinds: BTreeSet<&str> = all.iter().map(remote_read_error_kind).collect();
    assert_eq!(kinds.len(), 6);
    for error in &all {
        // Typed, so a missing `Clone` derive cannot fall back to cloning the reference.
        let copy: RemoteReadError = error.clone();
        assert_eq!(copy, *error, "{error:?}");
    }
}

#[test]
fn ac2_typed_ssh_reads_keep_their_signatures() {
    let read: fn(&str, &str, u64, Duration) -> Result<RemoteFileBytes, RemoteReadError> =
        read_bytes_typed;
    let realpath: fn(&str, &str) -> Result<String, RemoteReadError> = realpath_typed;
    let stat: fn(&str, &str) -> Result<FileStat, RemoteReadError> = stat_typed;
    let _ = (read, realpath, stat);
}

fn command_shape<F, Fut, T>(_command: F)
where
    F: Fn(tauri::AppHandle, String, Option<WorkspaceEnv>) -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
}

#[test]
fn ac2_commands_keep_their_rust_signatures() {
    command_shape::<_, _, BrowserOpen>(preview_open_in_browser);
    command_shape::<_, _, FrameSource>(preview_frame_source);
    let arm: fn(bool) = zen_escape_arm;
    let _ = arm;
}

// Source text without comments and whitespace, so commented-out code never
// counts. Knows line comments, nested block comments, string and char literals
// (no raw strings: the scanned files have none).
fn code_only(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '/' && next == Some('/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '/' && next == Some('*') {
            let mut depth = 0;
            while i < chars.len() {
                if chars[i] == '/' && chars.get(i + 1) == Some(&'*') {
                    depth += 1;
                    i += 2;
                } else if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    depth -= 1;
                    i += 2;
                    if depth == 0 {
                        break;
                    }
                } else {
                    i += 1;
                }
            }
        } else if c == '"'
            || (c == '\'' && (next == Some('\\') || chars.get(i + 2) == Some(&'\'')))
        {
            out.push(c);
            i += 1;
            while i < chars.len() && chars[i] != c {
                if chars[i] == '\\' {
                    out.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    out.push(chars[i]);
                    i += 1;
                }
            }
            if i < chars.len() {
                out.push(c);
                i += 1;
            }
        } else {
            if !c.is_whitespace() {
                out.push(c);
            }
            i += 1;
        }
    }
    out.replace(",)", ")")
}

// The balanced block that `start` opens (its last char is the opening one).
fn block_after<'a>(code: &'a str, start: &str) -> &'a str {
    let open = start.chars().last().expect("start ends with a delimiter");
    let close = match open {
        '[' => ']',
        '{' => '}',
        '(' => ')',
        other => panic!("not an opening delimiter: {other}"),
    };
    let from = code.find(start).unwrap_or_else(|| panic!("missing {start}")) + start.len();
    let mut depth = 1;
    for (offset, c) in code[from..].char_indices() {
        if c == open {
            depth += 1;
        } else if c == close {
            depth -= 1;
            if depth == 0 {
                return &code[from..from + offset];
            }
        }
    }
    panic!("unbalanced block after {start}");
}

// The parameter names are the IPC keys the webview sends, so a rename breaks
// the frontend without a compile error.
#[test]
fn ac2_command_parameters_keep_their_ipc_keys() {
    let preview = code_only(include_str!("../src/modules/preview_server/mod.rs"));
    for expected in [
        "#[tauri::command]pubasyncfnpreview_open_in_browser(app:tauri::AppHandle,path:String,workspace:Option<WorkspaceEnv>)->Result<BrowserOpen,String>{",
        "#[tauri::command]pubasyncfnpreview_frame_source(app:tauri::AppHandle,path:String,workspace:Option<WorkspaceEnv>)->Result<FrameSource,String>{",
    ] {
        assert!(preview.contains(expected), "missing {expected}");
    }
    let zen = code_only(include_str!("../src/modules/zen_escape.rs"));
    assert!(zen.contains("#[tauri::command]pubfnzen_escape_arm(armed:bool){"));
}

// The macOS monitor call is not compiled on Linux, so its presence is checked
// in the source, where it takes effect: the builder chain, the handler list and
// `setup` right after the swipe monitor.
#[test]
fn ac2_lib_wires_the_state_commands_and_esc_monitor() {
    let lib = code_only(include_str!("../src/lib.rs"));
    let run = block_after(&lib, "pubfnrun(){");
    assert!(
        run.contains(".manage(preview_server::PreviewServer::default())"),
        "PreviewServer is not managed"
    );
    let handlers: Vec<&str> = block_after(run, "tauri::generate_handler![")
        .split(',')
        .filter(|entry| !entry.is_empty())
        .collect();
    for command in [
        "preview_server::preview_open_in_browser",
        "preview_server::preview_frame_source",
        "zen_escape::zen_escape_arm",
    ] {
        assert!(handlers.contains(&command), "{command} is not registered");
    }
    let setup = block_after(run, ".setup(|_app|{");
    assert!(
        setup.contains(concat!(
            "#[cfg(target_os=\"macos\")]install_tab_swipe_monitor(_app.handle());",
            "#[cfg(target_os=\"macos\")]zen_escape::install_zen_escape_monitor(_app.handle());",
        )),
        "Esc monitor is not installed right after the swipe monitor, macOS only"
    );
}
