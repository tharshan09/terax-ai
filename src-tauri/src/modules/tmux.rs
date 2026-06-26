//! tmux session enumeration for the session switcher.
//!
//! Lists the tmux sessions on the active terminal's host so the UI can offer
//! attach / switch / open-in-new-tab without the user typing tmux commands.
//! Local and WSL hosts run `tmux list-sessions` through the one-shot shell
//! exec; SSH hosts ride the terminal's existing ControlMaster socket (no fresh
//! auth) via [`crate::modules::ssh`]. The launch path that actually attaches a
//! session lives in the PTY layer; this module is read-only.

use crate::modules::workspace::WorkspaceEnv;

/// Field separator in the `tmux -F` output. It MUST be printable: tmux escapes
/// non-printable bytes in `-F` output (a US 0x1f comes back as the literal text
/// "\037"), which would defeat the parser. The session name is emitted LAST and
/// parsed via `splitn`, so a name that itself contains '|' is still captured
/// whole; the leading fields are numeric and never contain '|'.
const SEP: char = '|';

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TmuxSession {
    pub name: String,
    pub windows: usize,
    /// True when at least one client is attached to the session.
    pub attached: bool,
    /// Unix seconds of the last attach, or `None` if never attached.
    pub last_attached: Option<i64>,
    /// True when the name is safe to splice into a tmux `-s` / `-t` argument.
    /// The UI greys out non-attachable sessions instead of risking injection.
    pub attachable: bool,
}

/// True if `name` is safe to splice into a `tmux ... -s <name>` / `-t <name>`
/// argument, both locally and inside the single-quoted remote ssh command.
/// Strict allowlist: non-empty, no leading `-` (flag confusion), only
/// `[A-Za-z0-9_-]`. Everything else (quotes, whitespace, shell metacharacters,
/// `:`, `.`, control bytes) is rejected. Simplicity over expressiveness keeps
/// the injection surface at zero.
pub fn is_valid_session_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// The `tmux list-sessions` invocation. Built once so the parser and the
/// command stay in lockstep on the separator.
fn list_command() -> String {
    format!(
        "tmux list-sessions -F '#{{session_windows}}{s}#{{session_attached}}{s}#{{session_last_attached}}{s}#{{session_name}}'",
        s = SEP
    )
}

/// The `tmux kill-session` invocation for an allowlist-validated `name`. The
/// allowlist makes the single-quote splice injection-safe with no escaping.
fn kill_command(name: &str) -> String {
    format!("tmux kill-session -t '{name}'")
}

/// The `tmux rename-session` invocation for allowlist-validated names.
fn rename_command(from: &str, to: &str) -> String {
    format!("tmux rename-session -t '{from}' '{to}'")
}

/// Parse one `tmux -F` line. Returns `None` (skip) for any line that doesn't
/// have exactly the four expected fields with a numeric window/attached count,
/// so banners and malformed rows are dropped rather than panicking.
fn parse_session_line(line: &str) -> Option<TmuxSession> {
    // Numeric fields first, name LAST. `splitn(4, ..)` keeps the whole remainder
    // as the name, so a name that contains the separator still parses; the three
    // leading fields are numeric and never contain it. A banner line has no
    // separators (or a non-numeric first field) and is dropped.
    let mut fields = line.splitn(4, SEP);
    let windows = fields.next()?.trim().parse::<usize>().ok()?;
    let attached = fields.next()?.trim().parse::<u32>().ok()? > 0;
    let last = fields.next()?.trim();
    let name = fields.next()?.trim();
    if name.is_empty() {
        return None;
    }
    let last_attached = if last.is_empty() {
        None
    } else {
        // A non-numeric timestamp degrades to "unknown" rather than dropping
        // an otherwise valid session.
        last.parse::<i64>().ok()
    };
    Some(TmuxSession {
        attachable: is_valid_session_name(name),
        name: name.to_string(),
        windows,
        attached,
        last_attached,
    })
}

fn parse_sessions(raw: &str) -> Vec<TmuxSession> {
    raw.lines().filter_map(parse_session_line).collect()
}

/// Truncate `s` to at most `max` bytes without splitting a UTF-8 codepoint.
/// Remote stderr is decoded via `from_utf8_lossy` and can carry multibyte
/// characters (localized errors, MOTD banners); a naive `&s[..max]` byte-slice
/// panics when `max` lands inside a codepoint.
fn truncate_on_char_boundary(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Turn a raw `tmux list-sessions` result into the session list. tmux exits
/// non-zero with a "no server" message when there are zero sessions, which is
/// not an error; a missing binary is. `label` names the host for messages.
fn interpret(
    code: Option<i32>,
    stdout: &str,
    stderr: &str,
    label: &str,
) -> Result<Vec<TmuxSession>, String> {
    if code == Some(0) {
        return Ok(parse_sessions(stdout));
    }
    let err = stderr.to_ascii_lowercase();
    // Zero sessions / no running server: a normal empty state, not a failure.
    if err.contains("no server running")
        || err.contains("no sessions")
        || err.contains("failed to connect to server")
        || err.contains("error connecting to")
    {
        return Ok(Vec::new());
    }
    // Anchor the absent-tmux signal to tmux itself: a bare `not found` substring
    // also matches unrelated rc noise (the SSH path merges login-shell stderr).
    // Exit 127 stays the primary POSIX signal for command-not-found.
    if code == Some(127)
        || err.contains("tmux: command not found")
        || err.contains("command not found: tmux")
        || err.contains("tmux: not found")
    {
        return Err(format!("tmux is not installed on {label}."));
    }
    // Unknown failure: surface a short, length-capped hint without dumping
    // unbounded (possibly hostile) remote stderr into the UI.
    let snippet = truncate_on_char_boundary(stderr.trim(), 160);
    if snippet.is_empty() {
        Err(format!("could not list tmux sessions on {label}"))
    } else {
        Err(format!("could not list tmux sessions on {label}: {snippet}"))
    }
}

/// List the tmux sessions on the workspace's host. Local/WSL run the one-shot
/// shell exec; SSH reuses the live ControlMaster (returns an empty list, never
/// an error, when no terminal to the host is open yet so nothing surprises the
/// user with a fresh auth prompt).
#[tauri::command]
pub fn tmux_list_sessions(workspace: Option<WorkspaceEnv>) -> Result<Vec<TmuxSession>, String> {
    match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => {
            crate::modules::ssh::validate_ssh_host(&host)?;
            if !crate::modules::ssh::master_alive(&host) {
                // No multiplexed connection yet: the terminal establishes it on
                // first connect, and the listing then rides it. Empty until then.
                return Ok(Vec::new());
            }
            let cap = crate::modules::ssh::run_remote_capture(&host, &list_command())?;
            interpret(cap.code, &cap.stdout, &cap.stderr, &host)
        }
        // Local or WSL: SSH is handled above, never here.
        other => {
            #[cfg(unix)]
            if matches!(other, WorkspaceEnv::Local) {
                // Login shell so a GUI-launched macOS app inherits the full
                // PATH (Homebrew/MacPorts tmux); a plain `/bin/sh -c` misses it.
                let out = run_local_login(&list_command())?;
                return interpret(out.code, &out.stdout, &out.stderr, "this machine");
            }
            let out = crate::modules::shell::run_blocking_inner(
                list_command(),
                None,
                other,
                std::time::Duration::from_secs(10),
            )?;
            interpret(out.exit_code, &out.stdout, &out.stderr, "this machine")
        }
    }
}

/// Kill a tmux session on the workspace's host. Idempotent: a session that is
/// already gone counts as success. The name is allowlist-validated, so the
/// single-quote splice in [`kill_command`] is injection-safe.
#[tauri::command]
pub fn tmux_kill_session(workspace: Option<WorkspaceEnv>, name: String) -> Result<(), String> {
    if !is_valid_session_name(&name) {
        return Err(format!("invalid tmux session name: {name:?}"));
    }
    let cmd = kill_command(&name);
    let (code, stderr) = match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => {
            crate::modules::ssh::validate_ssh_host(&host)?;
            if !crate::modules::ssh::master_alive(&host) {
                return Err("not connected to the host; open a terminal first".to_string());
            }
            let cap = crate::modules::ssh::run_remote_capture(&host, &cmd)?;
            (cap.code, cap.stderr)
        }
        other => {
            #[cfg(unix)]
            if matches!(other, WorkspaceEnv::Local) {
                let out = run_local_login(&cmd)?;
                return interpret_kill(out.code, &out.stderr);
            }
            let out = crate::modules::shell::run_blocking_inner(
                cmd,
                None,
                other,
                std::time::Duration::from_secs(10),
            )?;
            (out.exit_code, out.stderr)
        }
    };
    interpret_kill(code, &stderr)
}

/// Map a `tmux kill-session` result to Ok/Err. Exit 0, or a "session already
/// gone" stderr, is success; anything else becomes a short, length-capped error.
fn interpret_kill(code: Option<i32>, stderr: &str) -> Result<(), String> {
    if code == Some(0) {
        return Ok(());
    }
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("can't find session")
        || lower.contains("session not found")
        || lower.contains("no server running")
    {
        return Ok(());
    }
    let snippet = stderr.trim();
    if snippet.is_empty() {
        Err("could not kill the session".to_string())
    } else {
        Err(format!(
            "could not kill the session: {}",
            truncate_on_char_boundary(snippet, 160)
        ))
    }
}

/// Rename a tmux session on the workspace's host. Both names are
/// allowlist-validated, so the single-quote splices are injection-safe.
#[tauri::command]
pub fn tmux_rename_session(
    workspace: Option<WorkspaceEnv>,
    from: String,
    to: String,
) -> Result<(), String> {
    if !is_valid_session_name(&from) || !is_valid_session_name(&to) {
        return Err("invalid tmux session name".to_string());
    }
    let cmd = rename_command(&from, &to);
    let (code, stderr) = match WorkspaceEnv::from_option(workspace) {
        WorkspaceEnv::Ssh { host } => {
            crate::modules::ssh::validate_ssh_host(&host)?;
            if !crate::modules::ssh::master_alive(&host) {
                return Err("not connected to the host; open a terminal first".to_string());
            }
            let cap = crate::modules::ssh::run_remote_capture(&host, &cmd)?;
            (cap.code, cap.stderr)
        }
        other => {
            #[cfg(unix)]
            if matches!(other, WorkspaceEnv::Local) {
                let out = run_local_login(&cmd)?;
                return interpret_rename(out.code, &out.stderr, &to);
            }
            let out = crate::modules::shell::run_blocking_inner(
                cmd,
                None,
                other,
                std::time::Duration::from_secs(10),
            )?;
            (out.exit_code, out.stderr)
        }
    };
    interpret_rename(code, &stderr, &to)
}

/// Map a `tmux rename-session` result to Ok/Err, naming the clash when the
/// target already exists.
fn interpret_rename(code: Option<i32>, stderr: &str, to: &str) -> Result<(), String> {
    if code == Some(0) {
        return Ok(());
    }
    if stderr.to_ascii_lowercase().contains("duplicate session") {
        return Err(format!("a session named '{to}' already exists"));
    }
    let snippet = stderr.trim();
    if snippet.is_empty() {
        Err("could not rename the session".to_string())
    } else {
        Err(format!(
            "could not rename the session: {}",
            truncate_on_char_boundary(snippet, 160)
        ))
    }
}

#[cfg(unix)]
struct LocalOutput {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

/// Run `command` through the user's LOGIN shell so it inherits the full
/// interactive PATH. A GUI-launched macOS app otherwise gets a minimal PATH
/// that misses Homebrew/MacPorts, making `tmux` look absent.
#[cfg(unix)]
fn run_local_login(command: &str) -> Result<LocalOutput, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = std::process::Command::new(shell)
        .arg("-lc")
        .arg(command)
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;
    Ok(LocalOutput {
        code: out.status.code(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_session_names() {
        for ok in ["main", "ti", "my-session", "work_1", "ABC123", "a"] {
            assert!(is_valid_session_name(ok), "should accept {ok:?}");
        }
    }

    #[test]
    fn kill_command_single_quotes_the_name() {
        assert_eq!(kill_command("main"), "tmux kill-session -t 'main'");
        assert_eq!(kill_command("review-pr_2"), "tmux kill-session -t 'review-pr_2'");
    }

    #[test]
    fn interpret_kill_treats_missing_session_as_success() {
        assert!(interpret_kill(Some(0), "").is_ok());
        assert!(interpret_kill(Some(1), "can't find session: main").is_ok());
        assert!(interpret_kill(Some(1), "no server running on /tmp/tmux-1000/default").is_ok());
        assert!(interpret_kill(Some(1), "some other failure").is_err());
    }

    #[test]
    fn rename_command_single_quotes_both_names() {
        assert_eq!(
            rename_command("old", "new-name"),
            "tmux rename-session -t 'old' 'new-name'"
        );
    }

    #[test]
    fn interpret_rename_flags_duplicate() {
        assert!(interpret_rename(Some(0), "", "x").is_ok());
        let err = interpret_rename(Some(1), "duplicate session: taken", "taken").unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");
        assert!(interpret_rename(Some(1), "weird failure", "x").is_err());
    }

    #[test]
    fn rejects_injection_and_exotic_names() {
        for bad in [
            "",
            "-x",
            "--",
            "a b",
            "a\tb",
            "a;b",
            "a|b",
            "a&b",
            "a$b",
            "a$(id)",
            "a`id`",
            "a'b",
            "a\"b",
            "a\\b",
            "a:b",
            "a.b",
            "a/b",
            "a\nb",
            "a(b)",
            "a*b",
            "a>b",
        ] {
            assert!(!is_valid_session_name(bad), "should reject {bad:?}");
        }
    }

    fn line(name: &str, windows: &str, attached: &str, last: &str) -> String {
        // Mirrors the real format: numeric fields first, name last.
        format!("{windows}{SEP}{attached}{SEP}{last}{SEP}{name}")
    }

    #[test]
    fn parses_well_formed_rows() {
        let raw = format!(
            "{}\n{}\n",
            line("main", "2", "1", "1718900000"),
            line("scratch", "1", "0", "")
        );
        let sessions = parse_sessions(&raw);
        assert_eq!(
            sessions,
            vec![
                TmuxSession {
                    name: "main".into(),
                    windows: 2,
                    attached: true,
                    last_attached: Some(1718900000),
                    attachable: true,
                },
                TmuxSession {
                    name: "scratch".into(),
                    windows: 1,
                    attached: false,
                    last_attached: None,
                    attachable: true,
                },
            ]
        );
    }

    #[test]
    fn lists_exotic_name_but_marks_it_unattachable() {
        let raw = line("my.session", "1", "0", "");
        let s = parse_sessions(&raw);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].name, "my.session");
        assert!(!s[0].attachable, "dotted name must not be attachable");
    }

    #[test]
    fn skips_malformed_and_banner_lines() {
        let raw = format!(
            "Welcome to the host\n{}\nbroken{SEP}notanumber{SEP}1{SEP}name\n",
            line("ok", "3", "2", "1718900000"),
        );
        let s = parse_sessions(&raw);
        assert_eq!(s.len(), 1, "only the one well-formed row survives: {s:?}");
        assert_eq!(s[0].name, "ok");
        assert_eq!(s[0].windows, 3);
        assert!(s[0].attached);
    }

    #[test]
    fn parses_name_containing_the_separator() {
        // The name is the final field, so an embedded separator stays part of it.
        let raw = format!("2{SEP}1{SEP}1718900000{SEP}weird{SEP}name");
        let s = parse_sessions(&raw);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].name, "weird|name");
        assert_eq!(s[0].windows, 2);
        assert!(s[0].attached);
        assert!(!s[0].attachable, "a name with '|' is not attachable");
    }

    #[test]
    fn empty_output_is_empty_list() {
        assert!(parse_sessions("").is_empty());
        assert!(parse_sessions("\n\n").is_empty());
    }

    #[test]
    fn interpret_parses_on_success() {
        let raw = line("main", "1", "0", "");
        let out = interpret(Some(0), &raw, "", "host").unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "main");
    }

    #[test]
    fn interpret_treats_no_server_as_empty() {
        let out = interpret(Some(1), "", "no server running on /tmp/tmux-1000/default", "host")
            .unwrap();
        assert!(out.is_empty());
    }

    #[test]
    fn interpret_flags_missing_tmux() {
        let err = interpret(Some(127), "", "bash: tmux: command not found", "myhost").unwrap_err();
        assert!(err.contains("not installed"), "got: {err}");
        assert!(err.contains("myhost"));
    }

    #[test]
    fn interpret_caps_unknown_error() {
        let long = "x".repeat(1000);
        let err = interpret(Some(2), "", &long, "host").unwrap_err();
        assert!(err.len() < 220, "error must be length-capped: {}", err.len());
    }

    #[test]
    fn truncate_never_splits_a_codepoint() {
        // "€" is 3 bytes; byte 160 lands mid-codepoint. A naive byte-slice panics.
        let multibyte = "€".repeat(100);
        let cut = truncate_on_char_boundary(&multibyte, 160);
        assert!(cut.len() <= 160);
        assert!(multibyte.starts_with(cut), "must be a clean prefix");
        // Shorter-than-cap input is returned whole.
        assert_eq!(truncate_on_char_boundary("abc", 160), "abc");
    }

    #[test]
    fn interpret_does_not_panic_on_multibyte_stderr() {
        // Regression: remote stderr (from_utf8_lossy) can be multibyte UTF-8.
        let multibyte = "ä".repeat(200);
        for f in [
            interpret(Some(2), "", &multibyte, "host").is_err(),
            interpret_kill(Some(1), &multibyte).is_err(),
            interpret_rename(Some(1), &multibyte, "x").is_err(),
        ] {
            assert!(f);
        }
    }

    #[test]
    fn interpret_does_not_mislabel_unrelated_not_found_as_missing_tmux() {
        // rc noise like "somefunc: command not found" must NOT read as absent tmux.
        let err = interpret(Some(1), "", "myfunc: command not found", "host").unwrap_err();
        assert!(!err.contains("not installed"), "got: {err}");
        // But the real signals still classify correctly.
        assert!(interpret(Some(127), "", "anything", "host")
            .unwrap_err()
            .contains("not installed"));
        assert!(interpret(Some(1), "", "bash: tmux: command not found", "host")
            .unwrap_err()
            .contains("not installed"));
    }

    // End-to-end check against a real host. No-op unless TERAX_SSH_TEST_HOST is
    // set (safe in CI). Run with e.g.
    // `TERAX_SSH_TEST_HOST=litha-claude cargo test --lib tmux_list_smoke -- --nocapture`.
    // Requires a terminal/ControlMaster to the host to already be open.
    #[test]
    fn tmux_list_smoke() {
        let Ok(host) = std::env::var("TERAX_SSH_TEST_HOST") else {
            return;
        };
        let sessions = tmux_list_sessions(Some(WorkspaceEnv::Ssh { host })).expect("list failed");
        // Can't assert specific names (host state varies); just prove the path
        // returns a well-formed list without erroring.
        for s in &sessions {
            assert!(!s.name.is_empty());
        }
    }
}
