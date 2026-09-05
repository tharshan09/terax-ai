use crate::modules::ssh;
use crate::modules::workspace::WorkspaceEnv;
use serde_json::{json, Value};
use std::path::Path;

// How a given agent's hook delivers our OSC 777 marker into the terminal.
#[derive(Clone, Copy)]
enum Delivery {
    // Claude returns the sequence via a `terminalSequence` JSON field (it lost
    // /dev/tty access in v2.1.139) and emits it in-band. Cross-platform.
    TerminalSequence,
    // Codex/Gemini hooks can't write to the terminal, so the hook command emits
    // the marker itself: to /dev/tty on Unix, via a CONOUT$ helper on Windows.
    Osc,
}

// Each event is (hook name, our marker, needs_matcher). `needs_matcher` is
// per-event because Claude's tool hooks require a `"matcher"` while its
// prompt/lifecycle hooks reject one; the others are uniform per agent.
struct AgentSpec {
    agent: &'static str,
    dir: &'static str,
    file: &'static str,
    events: &'static [(&'static str, &'static str, bool)],
    delivery: Delivery,
}

const AGENTS: &[AgentSpec] = &[
    AgentSpec {
        agent: "claude",
        dir: ".claude",
        file: "settings.json",
        // PreToolUse/PostToolUse re-mark "working" on any tool activity so an
        // autonomous run (no UserPromptSubmit between turns) is not left stuck
        // on the Stop->finished marker. They need `matcher:"*"`; the others
        // must stay matcher-free.
        events: &[
            ("UserPromptSubmit", "working", false),
            ("Notification", "attention", false),
            ("Stop", "finished", false),
            ("PreToolUse", "working", true),
            ("PostToolUse", "working", true),
        ],
        delivery: Delivery::TerminalSequence,
    },
    AgentSpec {
        agent: "codex",
        dir: ".codex",
        file: "hooks.json",
        events: &[
            ("UserPromptSubmit", "working", false),
            ("PermissionRequest", "attention", false),
            ("Stop", "finished", false),
        ],
        delivery: Delivery::Osc,
    },
    AgentSpec {
        agent: "gemini",
        dir: ".gemini",
        file: "settings.json",
        events: &[
            ("BeforeAgent", "working", true),
            ("Notification", "attention", true),
            ("AfterAgent", "finished", true),
        ],
        delivery: Delivery::Osc,
    },
];

// Substrings identifying a hook command as ours, across every form we've ever
// emitted (legacy /dev/tty Claude, current TerminalSequence, Osc, Windows
// helper). Used to prune our own groups before reinserting so installs are
// idempotent and migrate older markers.
const OWNED_MARKERS: [&str; 3] = ["notify;Terax;", "terax;notify", "__terax_notify"];

fn find(agent: &str) -> Result<&'static AgentSpec, String> {
    AGENTS
        .iter()
        .find(|s| s.agent == agent)
        .ok_or_else(|| format!("unknown agent {agent}"))
}

// tmux swallows any OSC it does not understand, so a marker printed inside a
// tmux pane never reaches Terax's PTY parser, and every restart-safe tab and
// every SSH session runs under tmux. Inside tmux (`$TMUX` set) the hook wraps
// the marker in a DCS passthrough, `ESC P tmux; <payload, ESCs doubled> ESC \`,
// which tmux unwraps and forwards to the outer terminal when the pane's
// `allow-passthrough` option permits. Terax turns that option on for every tmux
// session it attaches (`shell_init::tmux_attach_command`); any other terminal
// keeps tmux's default (off), so the tmux branch needs no TERAX_TERMINAL gate:
// the option is the gate. Outside tmux the plain marker stays gated as before.
// The substring proves an install already carries the tmux-aware form.
const TMUX_NEEDLE: &str = "Ptmux;";

fn hook_command(spec: &AgentSpec, event: &str) -> String {
    match spec.delivery {
        Delivery::TerminalSequence => format!(
            r#"if [ -n "$TMUX" ]; then printf '{{"terminalSequence":"\\u001bPtmux;\\u001b\\u001b]777;notify;Terax;{event}\\u0007\\u001b\\\\"}}'; elif [ -n "$TERAX_TERMINAL" ]; then printf '{{"terminalSequence":"\\u001b]777;notify;Terax;{event}\\u0007"}}'; fi"#
        ),
        Delivery::Osc => osc_command(spec.agent, event),
    }
}

// Marker to the tty, then `{}` on stdout: Codex/Gemini require a JSON no-op.
#[cfg(unix)]
fn osc_command(agent: &str, event: &str) -> String {
    format!(
        r#"if [ -n "$TMUX" ]; then printf '\033Ptmux;\033\033]777;notify;Terax;{agent};{event}\007\033\\' > /dev/tty; elif [ -n "$TERAX_TERMINAL" ]; then printf '\033]777;notify;Terax;{agent};{event}\007' > /dev/tty; fi; printf '{{}}'"#
    )
}

#[cfg(windows)]
fn osc_command(agent: &str, event: &str) -> String {
    let exe = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "terax.exe".to_string());
    format!(r#""{exe}" __terax_notify {agent} {event}"#)
}

// The stable substring that proves a given (agent, event) hook is installed.
// Kept in sync with hook_command so status reflects what enable writes.
fn status_needle(spec: &AgentSpec, event: &str) -> String {
    match spec.delivery {
        Delivery::TerminalSequence => format!("notify;Terax;{event}"),
        Delivery::Osc => {
            #[cfg(unix)]
            {
                format!("notify;Terax;{};{event}", spec.agent)
            }
            #[cfg(windows)]
            {
                format!("__terax_notify {} {event}", spec.agent)
            }
        }
    }
}

fn is_ours(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|c| OWNED_MARKERS.iter().any(|m| c.contains(m)))
            })
        })
}

// A group with no hooks is inert cruft (e.g. left behind when someone deletes
// our command but not its wrapper). Drop it so the file stays clean.
fn is_empty_group(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_none_or(|hs| hs.is_empty())
}

fn merge_hooks(mut root: Value, spec: &AgentSpec) -> Value {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().unwrap();

    for (event, marker, needs_matcher) in spec.events {
        let arr = hooks.entry(*event).or_insert_with(|| json!([]));
        if !arr.is_array() {
            *arr = json!([]);
        }
        let arr = arr.as_array_mut().unwrap();
        arr.retain(|group| !is_ours(group) && !is_empty_group(group));
        let mut group = json!({
            "hooks": [ { "type": "command", "command": hook_command(spec, marker) } ]
        });
        if *needs_matcher {
            group["matcher"] = json!("*");
        }
        arr.push(group);
    }
    root
}

pub(crate) fn existing_config(contents: Option<&str>, path: &std::path::Path) -> Result<Value, String> {
    match contents {
        Some(s) if !s.trim().is_empty() => serde_json::from_str::<Value>(s).map_err(|e| {
            format!("{} is not valid JSON ({e}); refusing to overwrite", path.display())
        }),
        _ => Ok(json!({})),
    }
}

fn settings_path(spec: &AgentSpec) -> Result<std::path::PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or_else(|| "could not resolve home dir".to_string())?
        .join(spec.dir)
        .join(spec.file))
}

/// Claude-specific convenience wrapper. The SSH Claude-stats module
/// (`claude.rs`) is inherently Claude-only, so it resolves its settings
/// path through this shim instead of threading an `AgentSpec` around.
pub(crate) fn claude_settings_path() -> Result<std::path::PathBuf, String> {
    settings_path(find("claude")?)
}

/// Whether `content` (an agent's settings file) carries every hook we install,
/// in the current tmux-aware form. An install from an older Terax that still
/// writes the bare marker reports false so the UI offers a re-enable (and
/// `agent_migrate_hooks` upgrades it silently at startup).
fn hooks_installed(spec: &AgentSpec, content: &str) -> bool {
    // Keyed on the marker: PreToolUse/PostToolUse reuse "working", so an install
    // predating them still reports enabled (its UserPromptSubmit already carries
    // that needle) and is not force-nagged to re-enable.
    let all = spec
        .events
        .iter()
        .all(|(_, m, _)| content.contains(&status_needle(spec, m)));
    #[cfg(unix)]
    {
        all && content.contains(TMUX_NEEDLE)
    }
    #[cfg(windows)]
    {
        all
    }
}

fn is_legacy_install(content: &str) -> bool {
    OWNED_MARKERS.iter().any(|m| content.contains(m)) && !content.contains(TMUX_NEEDLE)
}

/// Install (or refresh) the agent's hooks. No `workspace` (or a local one)
/// edits this machine's config; an SSH env edits the file on that host, where
/// the user's remote agent actually runs, the same split as the Claude
/// statusLine wrapper. Async + spawn_blocking so the remote round-trip never
/// runs on the main thread.
#[tauri::command]
pub async fn agent_enable_hooks(
    agent: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<(), String> {
    let spec = find(&agent)?;
    tauri::async_runtime::spawn_blocking(move || match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => enable_ssh(spec, &host),
        _ => enable_local(spec),
    })
    .await
    .map_err(|e| format!("hook install task failed: {e}"))?
}

fn enable_local(spec: &AgentSpec) -> Result<(), String> {
    let path = settings_path(spec)?;
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;

    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => existing_config(Some(&s), &path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };

    let merged = merge_hooks(existing, spec);
    let out = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;

    // Write to a sibling temp file then rename so a crash mid-write can't leave
    // a truncated config.
    let tmp = path.with_extension("terax-tmp");
    std::fs::write(&tmp, out).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })?;
    Ok(())
}

fn remote_rel(spec: &AgentSpec) -> String {
    format!("{}/{}", spec.dir, spec.file)
}

/// `cat` (not a stat+read) so a missing remote file reads as empty and starts a
/// fresh config instead of erroring; invalid JSON still refuses to clobber.
fn read_ssh(
    spec: &AgentSpec,
    host: &str,
    timeout: Option<std::time::Duration>,
) -> Result<Option<String>, String> {
    let cmd = format!(
        "cat ~/{} 2>/dev/null",
        crate::modules::git::quote_remote_arg(&remote_rel(spec))
    );
    let cap = ssh::run_remote_capture(host, &cmd, timeout)?;
    Ok(if cap.stdout.is_empty() {
        None
    } else {
        Some(cap.stdout)
    })
}

fn enable_ssh(spec: &AgentSpec, host: &str) -> Result<(), String> {
    ssh::validate_ssh_host(host)?;
    let rel = remote_rel(spec);
    // Setup path (not a poll): wait indefinitely, like the statusLine install.
    ssh::run_remote_capture(
        host,
        &format!("mkdir -p ~/{}", crate::modules::git::quote_remote_arg(spec.dir)),
        None,
    )?;
    let raw = read_ssh(spec, host, None)?;
    let existing = existing_config(raw.as_deref(), Path::new(&format!("the remote ~/{rel}")))?;
    let merged = merge_hooks(existing, spec);
    let out = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    ssh::write_file(host, &format!("~/{rel}"), &out)
}

fn status_ssh(spec: &AgentSpec, host: &str) -> bool {
    if ssh::validate_ssh_host(host).is_err() {
        return false;
    }
    // A status probe is a poll: a wedged host must not hang the popover.
    read_ssh(spec, host, Some(std::time::Duration::from_secs(8)))
        .ok()
        .flatten()
        .is_some_and(|content| hooks_installed(spec, &content))
}

/// Upgrade hooks an older Terax installed without the tmux passthrough form.
/// Only touches configs that already carry our markers: the user opted into
/// hooks once, this just keeps them working under tmux. Returns the agents
/// that were rewritten. Windows keeps the ConPTY helper and has nothing to do.
#[tauri::command]
pub fn agent_migrate_hooks() -> Vec<String> {
    let mut migrated = Vec::new();
    if cfg!(windows) {
        return migrated;
    }
    for spec in AGENTS {
        let Ok(path) = settings_path(spec) else {
            continue;
        };
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        if is_legacy_install(&content) && enable_local(spec).is_ok() {
            migrated.push(spec.agent.to_string());
        }
    }
    migrated
}

// The raw OSC 777 bytes the detector parses. Kept in one place so the Windows
// CONOUT$ path can't drift from what the Unix /dev/tty hook emits.
#[cfg(any(windows, test))]
fn conout_marker(agent: &str, event: &str) -> String {
    format!("\x1b]777;notify;Terax;{agent};{event}\x07")
}

// Windows has no /dev/tty: the hook calls `terax.exe __terax_notify ...` and we
// write the marker into the ConPTY console. GUI-subsystem release inherits no
// console, so attach to the hook runner's first.
#[cfg(windows)]
pub fn emit_conout_marker(agent: &str, event: &str) {
    use std::io::Write;
    use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};

    if std::env::var_os("TERAX_TERMINAL").is_none() {
        return;
    }
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open("CONOUT$")
    {
        let _ = f.write_all(conout_marker(agent, event).as_bytes());
    }
}

#[tauri::command]
pub async fn agent_hooks_status(agent: String, workspace: Option<WorkspaceEnv>) -> bool {
    let Ok(spec) = find(&agent) else {
        return false;
    };
    tauri::async_runtime::spawn_blocking(move || match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => status_ssh(spec, &host),
        _ => status_local(spec),
    })
    .await
    .unwrap_or(false)
}

fn status_local(spec: &AgentSpec) -> bool {
    settings_path(spec)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .is_some_and(|content| hooks_installed(spec, &content))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(agent: &str) -> &'static AgentSpec {
        find(agent).unwrap()
    }

    fn hook_count(root: &Value, event: &str) -> usize {
        root["hooks"][event].as_array().map_or(0, Vec::len)
    }

    fn command(root: &Value, event: &str, idx: usize) -> String {
        root["hooks"][event][idx]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[test]
    fn claude_adds_all_event_hooks_to_empty_config() {
        let out = merge_hooks(json!({}), spec("claude"));
        assert_eq!(hook_count(&out, "UserPromptSubmit"), 1);
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert_eq!(hook_count(&out, "Stop"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Terax;attention"));
        assert!(command(&out, "Stop", 0).contains("notify;Terax;finished"));
        assert!(command(&out, "UserPromptSubmit", 0).contains("notify;Terax;working"));
        assert!(command(&out, "Stop", 0).contains("terminalSequence"));
        assert!(!command(&out, "Stop", 0).contains("/dev/tty"));
    }

    #[test]
    fn is_idempotent_per_agent() {
        for agent in ["claude", "codex", "gemini"] {
            let s = spec(agent);
            let once = merge_hooks(json!({}), s);
            let twice = merge_hooks(once.clone(), s);
            assert_eq!(once, twice, "{agent} not idempotent");
        }
    }

    #[test]
    fn conout_marker_matches_detector_format() {
        // Exactly the bytes pty/agent_detect parses (ESC ] 777 ; ... BEL).
        assert_eq!(
            conout_marker("gemini", "attention"),
            "\u{1b}]777;notify;Terax;gemini;attention\u{7}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn codex_emits_four_field_dev_tty_marker() {
        let out = merge_hooks(json!({}), spec("codex"));
        assert_eq!(hook_count(&out, "UserPromptSubmit"), 1);
        assert_eq!(hook_count(&out, "PermissionRequest"), 1);
        assert_eq!(hook_count(&out, "Stop"), 1);
        let stop = command(&out, "Stop", 0);
        assert!(stop.contains("notify;Terax;codex;finished"));
        assert!(stop.contains("> /dev/tty"));
        // Codex Stop rejects empty/non-JSON stdout; the hook must emit a no-op.
        assert!(stop.contains("printf '{}'"));
        assert!(!stop.contains("terminalSequence"));
    }

    #[cfg(unix)]
    #[test]
    fn gemini_uses_matcher_and_named_marker() {
        let out = merge_hooks(json!({}), spec("gemini"));
        assert_eq!(out["hooks"]["BeforeAgent"][0]["matcher"], "*");
        assert!(command(&out, "AfterAgent", 0).contains("notify;Terax;gemini;finished"));
        assert!(command(&out, "Notification", 0).contains("notify;Terax;gemini;attention"));
    }

    #[test]
    fn claude_tool_events_carry_matcher_prompt_events_do_not() {
        let out = merge_hooks(json!({}), spec("claude"));
        // Tool hooks re-mark "working" during autonomous runs and require a matcher.
        assert_eq!(hook_count(&out, "PreToolUse"), 1);
        assert_eq!(hook_count(&out, "PostToolUse"), 1);
        assert_eq!(out["hooks"]["PreToolUse"][0]["matcher"], "*");
        assert_eq!(out["hooks"]["PostToolUse"][0]["matcher"], "*");
        assert!(command(&out, "PreToolUse", 0).contains("notify;Terax;working"));
        assert!(command(&out, "PostToolUse", 0).contains("notify;Terax;working"));
        // Claude rejects a matcher on prompt/lifecycle hooks.
        assert!(out["hooks"]["UserPromptSubmit"][0].get("matcher").is_none());
        assert!(out["hooks"]["Notification"][0].get("matcher").is_none());
        assert!(out["hooks"]["Stop"][0].get("matcher").is_none());
    }

    #[test]
    fn claude_status_stays_enabled_without_tool_events() {
        // A settings.json written before PreToolUse/PostToolUse existed must
        // still report enabled: status keys on markers, and "working" is already
        // present via UserPromptSubmit.
        let legacy = json!({
            "hooks": {
                "UserPromptSubmit": [ { "hooks": [ { "type": "command",
                    "command": hook_command(spec("claude"), "working") } ] } ],
                "Notification": [ { "hooks": [ { "type": "command",
                    "command": hook_command(spec("claude"), "attention") } ] } ],
                "Stop": [ { "hooks": [ { "type": "command",
                    "command": hook_command(spec("claude"), "finished") } ] } ],
            }
        });
        let content = serde_json::to_string(&legacy).unwrap();
        let s = spec("claude");
        assert!(s
            .events
            .iter()
            .all(|(_, m, _)| content.contains(&status_needle(s, m))));
    }

    #[test]
    fn migrates_legacy_dev_tty_hook() {
        let legacy = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [ {
                        "type": "command",
                        "command": "[ -n \"$TERAX_TERMINAL\" ] && printf '\\033]777;terax;notify\\033\\\\' > /dev/tty || true"
                    } ] }
                ]
            }
        });
        let out = merge_hooks(legacy, spec("claude"));
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("terminalSequence"));
        assert!(!command(&out, "Notification", 0).contains("/dev/tty"));
    }

    #[test]
    fn preserves_unrelated_settings_and_foreign_hooks() {
        let input = json!({
            "permissions": { "allow": ["Bash"] },
            "hooks": {
                "Notification": [
                    { "hooks": [ { "type": "command", "command": "say hi" } ] }
                ]
            }
        });
        let out = merge_hooks(input, spec("claude"));
        assert_eq!(out["permissions"]["allow"][0], "Bash");
        assert_eq!(hook_count(&out, "Notification"), 2);
        assert_eq!(command(&out, "Notification", 0), "say hi");
    }

    #[test]
    fn replaces_non_object_root() {
        let out = merge_hooks(json!("garbage"), spec("codex"));
        assert_eq!(hook_count(&out, "Stop"), 1);
    }

    #[test]
    fn prunes_empty_groups_and_collapses_duplicates() {
        let input = json!({
            "hooks": {
                "Notification": [
                    { "hooks": [] },
                    { "hooks": [ { "type": "command", "command": hook_command(spec("claude"), "attention") } ] }
                ]
            }
        });
        let out = merge_hooks(input, spec("claude"));
        assert_eq!(hook_count(&out, "Notification"), 1);
        assert!(command(&out, "Notification", 0).contains("notify;Terax;attention"));
    }

    #[test]
    fn existing_config_absent_or_empty_starts_fresh() {
        let p = std::path::Path::new("/x/settings.json");
        assert_eq!(existing_config(None, p).unwrap(), json!({}));
        assert_eq!(existing_config(Some("   \n"), p).unwrap(), json!({}));
    }

    #[test]
    fn existing_config_refuses_to_clobber_invalid_json() {
        let p = std::path::Path::new("/x/settings.json");
        assert!(existing_config(Some("{ not json,"), p).is_err());
        assert_eq!(
            existing_config(Some(r#"{"permissions":{}}"#), p).unwrap(),
            json!({ "permissions": {} })
        );
    }

    #[test]
    fn claude_hook_wraps_marker_in_tmux_passthrough() {
        let cmd = hook_command(spec("claude"), "attention");
        // Both branches: DCS-wrapped inside tmux, bare (gated) outside.
        assert!(cmd.starts_with(r#"if [ -n "$TMUX" ]; then"#), "{cmd}");
        assert!(cmd.contains(r#"\\u001bPtmux;\\u001b\\u001b]777;notify;Terax;attention\\u0007\\u001b\\\\"#), "{cmd}");
        assert!(cmd.contains(r#"elif [ -n "$TERAX_TERMINAL" ]; then printf '{"terminalSequence":"\\u001b]777;notify;Terax;attention\\u0007"}'"#), "{cmd}");
        assert!(cmd.contains(TMUX_NEEDLE));
    }

    #[cfg(unix)]
    #[test]
    fn codex_hook_wraps_marker_in_tmux_passthrough() {
        let cmd = hook_command(spec("codex"), "finished");
        assert!(cmd.contains(r#"printf '\033Ptmux;\033\033]777;notify;Terax;codex;finished\007\033\\' > /dev/tty"#), "{cmd}");
        assert!(cmd.contains(r#"elif [ -n "$TERAX_TERMINAL" ]; then printf '\033]777;notify;Terax;codex;finished\007' > /dev/tty"#), "{cmd}");
        assert!(cmd.ends_with("printf '{}'"), "{cmd}");
    }

    #[cfg(unix)]
    #[test]
    fn status_requires_tmux_aware_form() {
        let fresh = serde_json::to_string(&merge_hooks(json!({}), spec("claude"))).unwrap();
        assert!(hooks_installed(spec("claude"), &fresh));
        assert!(!is_legacy_install(&fresh));

        // An install from before the passthrough form: every needle present, no
        // DCS wrapper → reports not installed and eligible for migration.
        let legacy = fresh.replace("Ptmux;", "");
        assert!(!hooks_installed(spec("claude"), &legacy));
        assert!(is_legacy_install(&legacy));

        // A foreign config without our markers is neither.
        assert!(!hooks_installed(spec("claude"), "{}"));
        assert!(!is_legacy_install("{}"));
    }

    #[test]
    fn migration_rewrite_is_idempotent() {
        let once = merge_hooks(json!({}), spec("claude"));
        let twice = merge_hooks(once.clone(), spec("claude"));
        assert_eq!(once, twice);
    }
}
