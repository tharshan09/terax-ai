//! Claude Code statusLine integration. Terax can install a wrapper around the
//! user's Claude Code `statusLine` command. The wrapper forwards Claude's
//! pre-computed stats (model, context %, cost) to a per-tab file keyed by
//! `TERAX_PTY_ID` (injected per PTY in `pty::session::spawn`), then runs the
//! user's original statusLine command unchanged so their own status line still
//! renders. Opt-in: nothing here runs unless the user enables it.
//!
//! settings.json is edited with the same discipline as `agent.rs`: never
//! clobber invalid JSON, atomic temp+rename write, idempotent, reversible.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use super::agent::{claude_settings_path, existing_config};
use crate::modules::workspace::WorkspaceEnv;
use crate::modules::{ssh, tmux};

/// Distinctive substring of our wrapper command, separator-normalized, used to
/// detect (and avoid re-wrapping) a statusLine we already own.
const WRAPPER_MARKER: &str = "/.terax/statusline.sh";

/// The wrapper script. Robust by construction: always exits 0, writes the stats
/// file atomically, and falls back gracefully when jq is missing or no original
/// command exists, so it can never break Claude Code's status line.
const WRAPPER_SCRIPT: &str = r#"#!/usr/bin/env bash
# Managed by Terax. Forwards Claude Code statusLine stats to the owning terminal
# tab, then runs the user's original statusLine command unchanged. Safe to
# delete; Terax recreates it when re-enabled.
input="$(cat)"
dir="$HOME/.claude/.terax"

# Write the stats under every key the owning tab might read: the per-PTY id
# (local / non-tmux) and, inside tmux, the session name. Over SSH+tmux the
# local TERAX_PTY_ID never reaches the pane, so the session name is the only
# stable key the local reader and this wrapper both know.
keys=""
[ -n "$TERAX_PTY_ID" ] && keys="$keys $TERAX_PTY_ID"
if [ -n "$TMUX" ]; then
  sn="$(tmux display-message -p '#{session_name}' 2>/dev/null)"
  [ -n "$sn" ] && keys="$keys tmux-$sn"
fi

if [ -n "$keys" ]; then
  payload=""
  # python3 (present on the SSH hosts) additionally derives context TOKEN counts
  # from the transcript, which the statusLine input does not carry. jq is the
  # basic fallback (model / context% / cost, no token counts).
  if command -v python3 >/dev/null 2>&1; then
    payload="$(printf '%s' "$input" | python3 -c '
import sys, json, os, time
def used_tokens(p):
    if not p or not os.path.exists(p):
        return None
    try:
        sz = os.path.getsize(p)
        with open(p, "rb") as f:
            if sz > 524288:
                f.seek(sz - 524288)
                f.readline()
            data = f.read().decode("utf-8", "replace")
    except Exception:
        return None
    last = None
    for ln in data.splitlines():
        if "usage" not in ln:
            continue
        try:
            o = json.loads(ln)
        except Exception:
            continue
        if o.get("isSidechain"):
            continue
        m = o.get("message") or {}
        if m.get("role") != "assistant":
            continue
        u = m.get("usage")
        if isinstance(u, dict):
            last = u
    if not last:
        return None
    return (last.get("input_tokens", 0)
            + last.get("cache_creation_input_tokens", 0)
            + last.get("cache_read_input_tokens", 0))
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
md = d.get("model") or {}
co = d.get("cost") or {}
cw = d.get("context_window") or {}
mid = md.get("id") or ""
used = used_tokens(d.get("transcript_path"))
exceeds = bool(d.get("exceeds_200k_tokens"))
win = 1000000 if ("1m" in mid.lower() or exceeds or (used and used > 200000)) else 200000
pct = cw.get("used_percentage")
if pct is None and used is not None:
    pct = used * 100.0 / win
print(json.dumps({
    "model": md.get("display_name") or md.get("id"),
    "modelId": (mid or None),
    "contextPct": pct,
    "usedTokens": used,
    "maxTokens": (win if used is not None else None),
    "costUsd": co.get("total_cost_usd"),
    "linesAdded": co.get("total_lines_added"),
    "linesRemoved": co.get("total_lines_removed"),
    "ts": time.time(),
}, separators=(",", ":")))
' 2>/dev/null)"
  fi
  if [ -z "$payload" ] && command -v jq >/dev/null 2>&1; then
    payload="$(printf '%s' "$input" | jq -c '{
          model: (.model.display_name // .model.id // null),
          modelId: (.model.id // null),
          contextPct: (.context_window.used_percentage // null),
          usedTokens: null,
          maxTokens: null,
          costUsd: (.cost.total_cost_usd // null),
          linesAdded: (.cost.total_lines_added // null),
          linesRemoved: (.cost.total_lines_removed // null),
          ts: now
        }' 2>/dev/null)"
  fi
  if [ -n "$payload" ]; then
    mkdir -p "$dir" 2>/dev/null
    for k in $keys; do
      if printf '%s' "$payload" > "$dir/status-$k.json.tmp" 2>/dev/null; then
        mv -f "$dir/status-$k.json.tmp" "$dir/status-$k.json" 2>/dev/null \
          || rm -f "$dir/status-$k.json.tmp" 2>/dev/null
      fi
    done
  fi
fi

orig="$dir/statusline-original"
if [ -s "$orig" ]; then
  printf '%s' "$input" | bash -c "$(cat "$orig")"
elif command -v jq >/dev/null 2>&1; then
  printf '%s' "$input" | jq -r '
    [(.model.display_name // .model.id // "Claude"),
     (.workspace.current_dir // .cwd // "")]
    | map(select(. != "")) | join("  ")'
fi
exit 0
"#;

fn terax_subdir() -> Result<PathBuf, String> {
    let settings = claude_settings_path()?;
    let dir = settings
        .parent()
        .ok_or_else(|| "settings path has no parent".to_string())?;
    Ok(dir.join(".terax"))
}

fn wrapper_script_path() -> Result<PathBuf, String> {
    Ok(terax_subdir()?.join("statusline.sh"))
}

fn original_cmd_path() -> Result<PathBuf, String> {
    Ok(terax_subdir()?.join("statusline-original"))
}

fn wrapper_command(script: &Path) -> String {
    format!("bash \"{}\"", script.display())
}

fn normalize_sep(s: &str) -> String {
    s.replace('\\', "/")
}

fn is_our_command(command: &str) -> bool {
    normalize_sep(command).contains(WRAPPER_MARKER)
}

/// The existing statusLine command, unless it is already ours (so re-enabling
/// never captures our own wrapper as the "original" and loops).
fn original_command(root: &Value) -> Option<String> {
    let cmd = root
        .get("statusLine")?
        .get("command")?
        .as_str()
        .filter(|c| !c.trim().is_empty())?;
    if is_our_command(cmd) {
        None
    } else {
        Some(cmd.to_string())
    }
}

/// Point statusLine at `command`, preserving any sibling fields (e.g. padding).
fn set_statusline_command(mut root: Value, command: &str) -> Value {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let sl = obj.entry("statusLine").or_insert_with(|| json!({}));
    if !sl.is_object() {
        *sl = json!({});
    }
    let sl = sl.as_object_mut().unwrap();
    sl.insert("type".into(), json!("command"));
    sl.insert("command".into(), json!(command));
    root
}

/// Restore `command` as statusLine, or drop statusLine entirely when `None`
/// (the user had none before we wrapped it).
fn restore_statusline(mut root: Value, command: Option<&str>) -> Value {
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    match command {
        Some(cmd) => {
            let sl = obj.entry("statusLine").or_insert_with(|| json!({}));
            if !sl.is_object() {
                *sl = json!({});
            }
            let sl = sl.as_object_mut().unwrap();
            sl.insert("type".into(), json!("command"));
            sl.insert("command".into(), json!(cmd));
        }
        None => {
            obj.remove("statusLine");
        }
    }
    root
}

fn read_settings(path: &Path) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => existing_config(Some(&s), path),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("terax-tmp");
    std::fs::write(&tmp, contents).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("rename into {}: {e}", path.display())
    })
}

/// Install the statusLine wrapper so the model/context/cost widgets populate.
/// Local edits this machine's `~/.claude`; SSH installs on the remote host (the
/// machine Claude actually runs on), reversibly, preserving the user's own
/// statusLine command.
#[tauri::command]
pub fn claude_enable_statusline(workspace: Option<WorkspaceEnv>) -> Result<(), String> {
    match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => enable_ssh(&host),
        _ => enable_local(),
    }
}

fn enable_local() -> Result<(), String> {
    let settings = claude_settings_path()?;
    let dir = terax_subdir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;

    let script = wrapper_script_path()?;
    write_atomic(&script, WRAPPER_SCRIPT)?;

    let existing = read_settings(&settings)?;

    // Capture the user's original command exactly once. If we are already
    // installed, keep whatever original we stored before (idempotent).
    if let Some(original) = original_command(&existing) {
        write_atomic(&original_cmd_path()?, &original)?;
    }

    let merged = set_statusline_command(existing, &wrapper_command(&script));
    let out = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    write_atomic(&settings, &out)
}

#[tauri::command]
pub fn claude_disable_statusline(workspace: Option<WorkspaceEnv>) -> Result<(), String> {
    match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => disable_ssh(&host),
        _ => disable_local(),
    }
}

fn disable_local() -> Result<(), String> {
    let settings = claude_settings_path()?;
    let existing = read_settings(&settings)?;

    // Only act if the current statusLine is ours; otherwise leave it alone.
    let is_ours = existing
        .get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(Value::as_str)
        .is_some_and(is_our_command);
    if !is_ours {
        return Ok(());
    }

    let original = std::fs::read_to_string(original_cmd_path()?)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let restored = restore_statusline(existing, original.as_deref());
    let out = serde_json::to_string_pretty(&restored).map_err(|e| e.to_string())?;
    write_atomic(&settings, &out)?;

    let _ = std::fs::remove_file(original_cmd_path()?);
    let _ = std::fs::remove_file(wrapper_script_path()?);
    Ok(())
}

#[tauri::command]
pub fn claude_statusline_enabled(workspace: Option<WorkspaceEnv>) -> bool {
    match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => enabled_ssh(&host),
        _ => enabled_local(),
    }
}

fn enabled_local() -> bool {
    let Ok(settings) = claude_settings_path() else {
        return false;
    };
    let Ok(root) = read_settings(&settings) else {
        return false;
    };
    root.get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(Value::as_str)
        .is_some_and(is_our_command)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    pub model: Option<String>,
    /// Full model id (e.g. `claude-opus-4-8`), surfaced in the model tooltip.
    pub model_id: Option<String>,
    pub context_pct: Option<f64>,
    /// Context tokens used / the window size, derived from the transcript by the
    /// wrapper (the statusLine input carries no token counts). Drive the richer
    /// "535k / 1M tokens" context tooltip; absent on the jq-only fallback path.
    pub used_tokens: Option<u64>,
    pub max_tokens: Option<u64>,
    pub cost_usd: Option<f64>,
    /// Lines added/removed this session, when the cost object carries them.
    pub lines_added: Option<u64>,
    pub lines_removed: Option<u64>,
    /// Epoch seconds the wrapper last wrote. The frontend hides stale stats
    /// (e.g. after the Claude session exited) using this.
    pub ts: Option<f64>,
}

/// Read the stats the wrapper wrote for the given tab. Local reads the per-PTY
/// file; SSH+tmux reads the remote per-session file over the ControlMaster (the
/// PTY id can't reach the remote tmux pane, so the session name is the key).
/// Returns `None` when nothing has been written (no Claude session, stats not
/// enabled, or - over SSH - no tmux session bound / master down).
#[tauri::command]
pub fn claude_status(
    pty_id: u32,
    workspace: Option<WorkspaceEnv>,
    tmux_session: Option<String>,
) -> Option<ClaudeStatus> {
    match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => status_ssh(&host, tmux_session.as_deref()),
        _ => status_local(pty_id),
    }
}

fn status_local(pty_id: u32) -> Option<ClaudeStatus> {
    let path = terax_subdir().ok()?.join(format!("status-{pty_id}.json"));
    let content = std::fs::read_to_string(path).ok()?;
    let v: Value = serde_json::from_str(&content).ok()?;
    status_from_value(&v)
}

/// Build a [`ClaudeStatus`] from the wrapper's JSON, treating an all-empty
/// record as absent.
fn status_from_value(v: &Value) -> Option<ClaudeStatus> {
    let status = ClaudeStatus {
        model: v.get("model").and_then(Value::as_str).map(str::to_string),
        model_id: v.get("modelId").and_then(Value::as_str).map(str::to_string),
        context_pct: v.get("contextPct").and_then(Value::as_f64),
        used_tokens: v.get("usedTokens").and_then(Value::as_u64),
        max_tokens: v.get("maxTokens").and_then(Value::as_u64),
        cost_usd: v.get("costUsd").and_then(Value::as_f64),
        lines_added: v.get("linesAdded").and_then(Value::as_u64),
        lines_removed: v.get("linesRemoved").and_then(Value::as_u64),
        ts: v.get("ts").and_then(Value::as_f64),
    };
    if status.model.is_none() && status.context_pct.is_none() && status.cost_usd.is_none() {
        return None;
    }
    Some(status)
}

// --- SSH: install on / read from the host Claude actually runs on -----------

/// Read `~/.claude/<rel>` on the host over the ControlMaster. Empty/missing maps
/// to `None`; never opens a fresh prompt (BatchMode). Reading via `cat` keeps a
/// non-existent file from being treated as an error (so we never clobber).
fn ssh_read(host: &str, rel: &str) -> Result<Option<String>, String> {
    let cap = ssh::run_remote_capture(host, &format!("cat ~/.claude/{rel} 2>/dev/null"))?;
    Ok(if cap.stdout.is_empty() {
        None
    } else {
        Some(cap.stdout)
    })
}

fn enable_ssh(host: &str) -> Result<(), String> {
    ssh::validate_ssh_host(host)?;
    ssh::run_remote_capture(host, "mkdir -p ~/.claude/.terax")?;
    ssh::write_file(host, "~/.claude/.terax/statusline.sh", WRAPPER_SCRIPT)?;

    let raw = ssh_read(host, "settings.json")?;
    // Refuses to overwrite invalid JSON, same guard as the local path.
    let existing = existing_config(raw.as_deref(), Path::new("the remote ~/.claude/settings.json"))?;
    // Capture the user's original command exactly once (None when already ours).
    if let Some(original) = original_command(&existing) {
        ssh::write_file(host, "~/.claude/.terax/statusline-original", &original)?;
    }
    // Absolute remote path so the statusLine command does not depend on Claude's
    // exec shell expanding `$HOME`.
    let home = ssh::run_remote_capture(host, "printf %s \"$HOME\"")?.stdout;
    let cmd = wrapper_command(Path::new(&format!("{}/.claude/.terax/statusline.sh", home.trim())));
    let merged = set_statusline_command(existing, &cmd);
    let out = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;
    ssh::write_file(host, "~/.claude/settings.json", &out)
}

fn disable_ssh(host: &str) -> Result<(), String> {
    ssh::validate_ssh_host(host)?;
    let raw = ssh_read(host, "settings.json")?;
    let existing = existing_config(raw.as_deref(), Path::new("the remote ~/.claude/settings.json"))?;
    let is_ours = existing
        .get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(Value::as_str)
        .is_some_and(is_our_command);
    if !is_ours {
        return Ok(());
    }
    let original = ssh_read(host, ".terax/statusline-original")?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let restored = restore_statusline(existing, original.as_deref());
    let out = serde_json::to_string_pretty(&restored).map_err(|e| e.to_string())?;
    ssh::write_file(host, "~/.claude/settings.json", &out)?;
    let _ = ssh::run_remote_capture(
        host,
        "rm -f ~/.claude/.terax/statusline.sh ~/.claude/.terax/statusline-original",
    );
    Ok(())
}

fn enabled_ssh(host: &str) -> bool {
    let Ok(Some(raw)) = ssh_read(host, "settings.json") else {
        return false;
    };
    let Ok(root) = existing_config(Some(&raw), Path::new("settings.json")) else {
        return false;
    };
    root.get("statusLine")
        .and_then(|s| s.get("command"))
        .and_then(Value::as_str)
        .is_some_and(is_our_command)
}

fn status_ssh(host: &str, tmux_session: Option<&str>) -> Option<ClaudeStatus> {
    let session = tmux_session?;
    // Defense in depth: the session name is spliced into a remote path/command.
    if !tmux::is_valid_session_name(session) {
        return None;
    }
    // Avoid opening a fresh connection on every poll when disconnected.
    if !ssh::master_alive(host) {
        return None;
    }
    let raw = ssh_read(host, &format!(".terax/status-tmux-{session}.json")).ok()??;
    let v: Value = serde_json::from_str(&raw).ok()?;
    status_from_value(&v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_statusline_and_preserves_siblings() {
        let input = json!({
            "permissions": { "allow": ["Bash"] },
            "statusLine": { "type": "command", "command": "old", "padding": 0 }
        });
        let out = set_statusline_command(input, "bash \"/home/u/.claude/.terax/statusline.sh\"");
        assert_eq!(out["permissions"]["allow"][0], "Bash");
        assert!(is_our_command(out["statusLine"]["command"].as_str().unwrap()));
        // A sibling field on the statusLine object survives.
        assert_eq!(out["statusLine"]["padding"], 0);
    }

    #[test]
    fn captures_real_original_but_not_our_own_wrapper() {
        let user = json!({ "statusLine": { "type": "command", "command": "bash ~/my.sh" } });
        assert_eq!(original_command(&user).as_deref(), Some("bash ~/my.sh"));

        let ours = json!({
            "statusLine": { "command": "bash \"/home/u/.claude/.terax/statusline.sh\"" }
        });
        assert_eq!(original_command(&ours), None);

        assert_eq!(original_command(&json!({})), None);
    }

    #[test]
    fn enable_then_disable_round_trips_to_original() {
        let user_cmd = "bash ~/statusline-command.sh";
        let start = json!({ "statusLine": { "type": "command", "command": user_cmd } });

        let original = original_command(&start);
        assert_eq!(original.as_deref(), Some(user_cmd));
        let enabled = set_statusline_command(start, "bash \"/h/.terax/statusline.sh\"");
        assert!(is_our_command(enabled["statusLine"]["command"].as_str().unwrap()));

        let restored = restore_statusline(enabled, original.as_deref());
        assert_eq!(restored["statusLine"]["command"], user_cmd);
    }

    #[test]
    fn disable_drops_statusline_when_there_was_no_original() {
        let enabled = json!({
            "permissions": {},
            "statusLine": { "type": "command", "command": "bash \"/h/.terax/statusline.sh\"" }
        });
        let restored = restore_statusline(enabled, None);
        assert!(restored.get("statusLine").is_none());
        assert!(restored.get("permissions").is_some());
    }

    #[test]
    fn is_our_command_is_separator_agnostic() {
        assert!(is_our_command("bash \"C:\\Users\\me\\.claude\\.terax\\statusline.sh\""));
        assert!(is_our_command("bash /home/me/.claude/.terax/statusline.sh"));
        assert!(!is_our_command("bash /home/me/.claude/statusline-command.sh"));
    }

    #[test]
    fn set_statusline_replaces_non_object_root() {
        let out = set_statusline_command(json!("garbage"), "bash \"/h/.terax/statusline.sh\"");
        assert!(is_our_command(out["statusLine"]["command"].as_str().unwrap()));
    }

    #[test]
    fn status_from_value_parses_and_drops_empty() {
        let v = json!({
            "model": "Opus", "modelId": "claude-opus-4-8",
            "contextPct": 12.5, "usedTokens": 535623, "maxTokens": 1000000,
            "costUsd": 0.4, "linesAdded": 12, "linesRemoved": 3, "ts": 1.0,
        });
        let s = status_from_value(&v).expect("should parse");
        assert_eq!(s.model.as_deref(), Some("Opus"));
        assert_eq!(s.model_id.as_deref(), Some("claude-opus-4-8"));
        assert_eq!(s.context_pct, Some(12.5));
        assert_eq!(s.used_tokens, Some(535623));
        assert_eq!(s.max_tokens, Some(1000000));
        assert_eq!(s.cost_usd, Some(0.4));
        assert_eq!(s.lines_added, Some(12));
        // All-empty record reads as absent.
        assert!(status_from_value(&json!({ "ts": 5.0 })).is_none());
        assert!(status_from_value(&json!({})).is_none());
    }

    #[test]
    fn wrapper_keys_by_pty_id_and_tmux_session() {
        // Local / non-tmux still keys by the PTY id; under tmux it also writes a
        // per-session file (the only key that survives SSH+tmux).
        assert!(WRAPPER_SCRIPT.contains("status-$k.json"));
        assert!(WRAPPER_SCRIPT.contains("keys=\"$keys $TERAX_PTY_ID\""));
        assert!(WRAPPER_SCRIPT.contains("keys=\"$keys tmux-$sn\""));
        assert!(WRAPPER_SCRIPT.contains("display-message -p '#{session_name}'"));
        // Derives context token counts from the transcript (python path) with a
        // jq fallback, and never embeds a single quote that would break python -c.
        assert!(WRAPPER_SCRIPT.contains("transcript_path"));
        assert!(WRAPPER_SCRIPT.contains("cache_read_input_tokens"));
        assert!(WRAPPER_SCRIPT.contains("python3 -c"));
        let py_start = WRAPPER_SCRIPT.find("python3 -c '").unwrap() + "python3 -c '".len();
        let py = &WRAPPER_SCRIPT[py_start..];
        let py = &py[..py.find("' 2>/dev/null").unwrap()];
        assert!(!py.contains('\''), "python -c body must contain no single quotes");
        // Always forwards to the user's original statusLine and never fails.
        assert!(WRAPPER_SCRIPT.contains("statusline-original"));
        assert!(WRAPPER_SCRIPT.trim_end().ends_with("exit 0"));
    }
}
