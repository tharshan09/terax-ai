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

use super::agent::{existing_config, settings_path};

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

if [ -n "$TERAX_PTY_ID" ] && command -v jq >/dev/null 2>&1; then
  mkdir -p "$dir" 2>/dev/null
  out="$dir/status-$TERAX_PTY_ID.json"
  if printf '%s' "$input" | jq -c '{
        model: (.model.display_name // .model.id // null),
        contextPct: (.context_window.used_percentage // null),
        costUsd: (.cost.total_cost_usd // null),
        ts: now
      }' > "$out.tmp" 2>/dev/null; then
    mv -f "$out.tmp" "$out" 2>/dev/null || rm -f "$out.tmp" 2>/dev/null
  else
    rm -f "$out.tmp" 2>/dev/null
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
    let settings = settings_path()?;
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

#[tauri::command]
pub fn claude_enable_statusline() -> Result<(), String> {
    let settings = settings_path()?;
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
pub fn claude_disable_statusline() -> Result<(), String> {
    let settings = settings_path()?;
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
pub fn claude_statusline_enabled() -> bool {
    let Ok(settings) = settings_path() else {
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
    pub context_pct: Option<f64>,
    pub cost_usd: Option<f64>,
    /// Epoch seconds the wrapper last wrote. The frontend hides stale stats
    /// (e.g. after the Claude session exited) using this.
    pub ts: Option<f64>,
}

/// Read the stats the wrapper wrote for the given PTY/tab. Returns `None` when
/// nothing has been written (no Claude session, or stats not enabled).
#[tauri::command]
pub fn claude_status(pty_id: u32) -> Option<ClaudeStatus> {
    let path = terax_subdir().ok()?.join(format!("status-{pty_id}.json"));
    let content = std::fs::read_to_string(path).ok()?;
    let v: Value = serde_json::from_str(&content).ok()?;
    let status = ClaudeStatus {
        model: v.get("model").and_then(Value::as_str).map(str::to_string),
        context_pct: v.get("contextPct").and_then(Value::as_f64),
        cost_usd: v.get("costUsd").and_then(Value::as_f64),
        ts: v.get("ts").and_then(Value::as_f64),
    };
    if status.model.is_none() && status.context_pct.is_none() && status.cost_usd.is_none() {
        return None;
    }
    Some(status)
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
}
