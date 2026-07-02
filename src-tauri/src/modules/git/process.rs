use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use shared_child::SharedChild;

use crate::modules::git::errors::{GitError, Result};
use crate::modules::git::types::{
    GitOutput, TextSource, DEFAULT_TIMEOUT_SECS, MAX_FILE_BYTES, MAX_OUTPUT_BYTES,
    MAX_TIMEOUT_SECS, MIN_GIT_VERSION,
};
use crate::modules::ssh::{control_args, note_connected_host, validate_ssh_host};
use crate::modules::workspace::WorkspaceEnv;
#[cfg(windows)]
use crate::modules::workspace::validate_wsl_distro_name;

#[derive(Clone)]
enum Availability {
    Ok,
    NotInstalled,
    TooOld(String),
}

const AVAILABILITY_TTL: Duration = Duration::from_secs(60);

struct AvailabilityCache {
    value: Availability,
    checked_at: Instant,
}

static GIT_AVAILABILITY: OnceLock<Mutex<HashMap<String, AvailabilityCache>>> = OnceLock::new();

fn availability_cell() -> &'static Mutex<HashMap<String, AvailabilityCache>> {
    GIT_AVAILABILITY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_expired_availability_entries(cache: &mut HashMap<String, AvailabilityCache>) {
    cache.retain(|_, entry| entry.checked_at.elapsed() < AVAILABILITY_TTL);
}

fn workspace_cache_key(workspace: &WorkspaceEnv) -> String {
    match workspace {
        WorkspaceEnv::Local => "local".into(),
        WorkspaceEnv::Wsl { distro } => format!("wsl:{distro}"),
        WorkspaceEnv::Ssh { host } => format!("ssh:{host}"),
    }
}

pub fn ensure_git_available(workspace: &WorkspaceEnv) -> Result<()> {
    let cache_key = workspace_cache_key(workspace);
    let cached = {
        let mut guard = availability_cell()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        prune_expired_availability_entries(&mut guard);
        guard
            .get(&cache_key)
            .filter(|entry| entry.checked_at.elapsed() < AVAILABILITY_TTL)
            .map(|entry| entry.value.clone())
    };
    let value = match cached {
        Some(v) => v,
        None => {
            let fresh = check_git_availability(workspace);
            let mut guard = availability_cell()
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            prune_expired_availability_entries(&mut guard);
            guard.insert(
                cache_key,
                AvailabilityCache {
                    value: fresh.clone(),
                    checked_at: Instant::now(),
                },
            );
            fresh
        }
    };
    match value {
        Availability::Ok => Ok(()),
        Availability::NotInstalled => Err(GitError::NotInstalled),
        Availability::TooOld(v) => Err(GitError::TooOld {
            found: v,
            required: MIN_GIT_VERSION,
        }),
    }
}

fn check_git_availability(workspace: &WorkspaceEnv) -> Availability {
    let output = match run_git_uncached(workspace, None, ["--version"], 10) {
        Ok(o) => o,
        Err(_) => return Availability::NotInstalled,
    };
    if output.timed_out || output.exit_code != Some(0) {
        return Availability::NotInstalled;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_git_version(stdout.trim()).unwrap_or_else(|| "unknown".into());
    if !version_meets_minimum(&version, MIN_GIT_VERSION) {
        return Availability::TooOld(version);
    }
    Availability::Ok
}

fn parse_git_version(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|tok| tok.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(|s| s.split('.').take(3).collect::<Vec<_>>().join("."))
}

fn version_meets_minimum(found: &str, required: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let f = parse(found);
    let r = parse(required);
    for (i, &b) in r.iter().enumerate() {
        let a = f.get(i).copied().unwrap_or(0);
        if a > b {
            return true;
        }
        if a < b {
            return false;
        }
    }
    true
}

pub fn git_show_text(workspace: &WorkspaceEnv, repo_root: &str, spec: &str) -> Result<TextSource> {
    let output = run_git(
        workspace,
        Some(repo_root),
        [
            OsStr::new("show"),
            OsStr::new("--no-textconv"),
            OsStr::new(spec),
        ],
        DEFAULT_TIMEOUT_SECS,
    )?;
    if output.timed_out {
        return Err(GitError::TimedOut("git show"));
    }
    if output.exit_code != Some(0) {
        return Ok(TextSource::Missing);
    }
    Ok(decode_text(output.stdout))
}

pub fn git_stdout_line_opt<I, S>(
    workspace: &WorkspaceEnv,
    cwd: &str,
    args: I,
) -> Result<Option<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(workspace, Some(cwd), args, DEFAULT_TIMEOUT_SECS)?;
    if output.timed_out {
        return Err(GitError::TimedOut("git command"));
    }
    if output.exit_code != Some(0) {
        return Ok(None);
    }
    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    let line = stdout.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        Ok(None)
    } else {
        Ok(Some(line.to_string()))
    }
}

/// Run git, returning multiple stdout lines (UTF-8). Empty trailing lines stripped.
pub fn git_stdout_lines<I, S>(workspace: &WorkspaceEnv, cwd: &str, args: I) -> Result<Vec<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(workspace, Some(cwd), args, DEFAULT_TIMEOUT_SECS)?;
    if output.timed_out {
        return Err(GitError::TimedOut("git command"));
    }
    if output.exit_code != Some(0) {
        return Ok(Vec::new());
    }
    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
    Ok(stdout
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect())
}

pub fn read_text_file(path: &Path) -> Result<TextSource> {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(TextSource::Missing),
        Err(e) => return Err(GitError::Io(e)),
    };
    if meta.file_type().is_symlink() {
        return Err(GitError::SymlinkRejected(path.to_path_buf()));
    }
    if !meta.is_file() {
        return Ok(TextSource::Missing);
    }
    let size = meta.len();
    if size > MAX_FILE_BYTES {
        return Err(GitError::FileTooLarge {
            path: path.to_path_buf(),
            size,
            max: MAX_FILE_BYTES,
        });
    }
    let bytes = std::fs::read(path)?;
    Ok(decode_text(bytes))
}

pub fn run_git<I, S>(
    workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: I,
    timeout_secs: u64,
) -> Result<GitOutput>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_git_uncached(workspace, cwd, args, timeout_secs)
}

fn run_git_uncached<I, S>(
    workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: I,
    timeout_secs: u64,
) -> Result<GitOutput>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let dur = Duration::from_secs(timeout_secs.clamp(1, MAX_TIMEOUT_SECS));
    let args: Vec<OsString> = args
        .into_iter()
        .map(|arg| arg.as_ref().to_os_string())
        .collect();
    let mut cmd = build_git_command(workspace, cwd, &args)?;
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GCM_PROVIDER", "")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);

    let child = Arc::new(SharedChild::spawn(&mut cmd).map_err(|e| GitError::Spawn(e.to_string()))?);
    let mut stdout_pipe = child
        .take_stdout()
        .ok_or_else(|| GitError::Spawn("no stdout pipe".into()))?;
    let mut stderr_pipe = child
        .take_stderr()
        .ok_or_else(|| GitError::Spawn("no stderr pipe".into()))?;

    let stdout_handle = thread::spawn(move || drain(&mut stdout_pipe, 64 * 1024));
    let stderr_handle = thread::spawn(move || drain(&mut stderr_pipe, 4 * 1024));

    let (tx, rx) = mpsc::channel();
    let waiter = Arc::clone(&child);
    thread::spawn(move || {
        let _ = tx.send(waiter.wait());
    });

    let (exit_code, timed_out) = match rx.recv_timeout(dur) {
        Ok(Ok(status)) => (status.code(), false),
        Ok(Err(e)) => return Err(GitError::Io(e)),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = child.kill();
            let _ = child.wait();
            (None, true)
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            return Err(GitError::Spawn("git wait thread disconnected".into()));
        }
    };

    let (stdout, stdout_truncated) = stdout_handle.join().unwrap_or((Vec::new(), false));
    let (stderr, _stderr_truncated) = stderr_handle.join().unwrap_or((Vec::new(), false));

    Ok(GitOutput {
        stdout,
        stderr,
        exit_code,
        timed_out,
        truncated: stdout_truncated,
    })
}

fn build_git_command(
    workspace: &WorkspaceEnv,
    cwd: Option<&str>,
    args: &[OsString],
) -> Result<Command> {
    #[cfg(windows)]
    if let WorkspaceEnv::Wsl { distro } = workspace {
        validate_wsl_distro_name(distro)
            .map_err(|_| GitError::command("unsafe WSL distro name", distro.clone()))?;
        let mut cmd = Command::new("wsl.exe");
        cmd.arg("-d").arg(distro);
        if let Some(cwd) = cwd.filter(|s| !s.is_empty()) {
            cmd.arg("--cd").arg(cwd);
        }
        cmd.arg("--exec").arg("git");
        cmd.args(args);
        return Ok(cmd);
    }

    // Remote workspace: run git on the host over the shared ControlMaster, the
    // same multiplexed connection the terminal/FS already use. The whole git
    // invocation is one shell-quoted string so no arg can break argument
    // parsing or inject into the remote shell. BatchMode means a host with no
    // open master fails fast (auth error) rather than hanging on a prompt; the
    // fix is to open the terminal first, which classify_auth_error surfaces.
    if let WorkspaceEnv::Ssh { host } = workspace {
        validate_ssh_host(host)
            .map_err(|_| GitError::command("unsafe ssh host", host.clone()))?;
        note_connected_host(host);
        let remote = remote_git_command(cwd, args);
        let mut cmd = Command::new("ssh");
        cmd.arg("-T")
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg("ConnectTimeout=10");
        for opt in control_args() {
            cmd.arg(opt);
        }
        cmd.arg(host).arg(remote);
        return Ok(cmd);
    }

    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(dir) = cwd.filter(|s| !s.is_empty()) {
        cmd.current_dir(Path::new(dir));
    }
    Ok(cmd)
}

/// Build the single remote shell command for `ssh <host> <cmd>`. Every arg is
/// POSIX single-quoted so paths, refs, pathspecs and format strings reach the
/// remote git verbatim with zero shell-injection surface. The env prefix
/// reaches the *remote* git (ssh does not forward our local env), pinning
/// non-interactive, lock-free, locale-stable behaviour.
fn remote_git_command(cwd: Option<&str>, args: &[OsString]) -> String {
    let mut cmd = String::from("GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 LC_ALL=C git");
    if let Some(dir) = cwd.filter(|s| !s.is_empty()) {
        cmd.push_str(" -C ");
        cmd.push_str(&quote_remote_path(dir));
    }
    for arg in args {
        cmd.push(' ');
        cmd.push_str(&quote_remote_arg(&arg.to_string_lossy()));
    }
    cmd
}

/// POSIX single-quote: wrap in `'…'`, rewriting any embedded `'` as `'\''`.
/// The result expands to the literal input in any POSIX shell.
pub(crate) fn quote_remote_arg(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

/// Quote a remote path for `git -C`. A leading `~` / `~user` segment is emitted
/// unquoted so the remote shell expands it to the home directory (the ssh tab
/// seeds its cwd to `~`, and the first `git -C ~ rev-parse` must resolve it);
/// the remainder is single-quoted. A non-word tilde segment (e.g. `~$(x)`) is
/// quoted whole so it can never expand.
fn quote_remote_path(path: &str) -> String {
    if path == "~" {
        return "~".to_string();
    }
    if let Some(rest) = path.strip_prefix('~') {
        let (user, tail) = match rest.find('/') {
            Some(i) => (&rest[..i], &rest[i..]),
            None => (rest, ""),
        };
        let user_ok = user
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if user_ok {
            let mut out = String::from("~");
            out.push_str(user);
            if let Some(after) = tail.strip_prefix('/') {
                out.push('/');
                if !after.is_empty() {
                    out.push_str(&quote_remote_arg(after));
                }
            }
            return out;
        }
    }
    quote_remote_arg(path)
}

pub fn ensure_success(output: &GitOutput, context: &'static str) -> Result<()> {
    if output.timed_out {
        return Err(GitError::TimedOut(context));
    }
    if output.exit_code == Some(0) {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if let Some(err) = classify_auth_error(&stderr) {
        return Err(err);
    }
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "unknown git error".into()
    };
    Err(GitError::CommandFailed { context, detail })
}

fn classify_auth_error(stderr: &str) -> Option<GitError> {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("authentication failed")
        || lower.contains("permission denied (publickey)")
        || lower.contains("invalid credentials")
    {
        return Some(GitError::AuthRequired(
            stderr.lines().next().unwrap_or(stderr).to_string(),
        ));
    }
    if lower.contains("host key verification failed") {
        return Some(GitError::HostKeyUnverified);
    }
    None
}

fn decode_text(bytes: Vec<u8>) -> TextSource {
    let sniff_len = bytes.len().min(8192);
    if bytes[..sniff_len].contains(&0) {
        return TextSource::Binary;
    }
    match String::from_utf8(bytes) {
        Ok(text) => TextSource::Text(text),
        Err(e) => TextSource::Text(String::from_utf8_lossy(&e.into_bytes()).into_owned()),
    }
}

fn drain<R: Read>(reader: &mut R, prealloc: usize) -> (Vec<u8>, bool) {
    let mut out: Vec<u8> = Vec::with_capacity(prealloc.min(MAX_OUTPUT_BYTES));
    let mut buf = [0u8; 16 * 1024];
    let mut truncated = false;
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() >= MAX_OUTPUT_BYTES {
                    truncated = true;
                    continue;
                }
                let take = (MAX_OUTPUT_BYTES - out.len()).min(n);
                out.extend_from_slice(&buf[..take]);
                if take < n {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}

#[cfg(test)]
mod tests {
    use super::{
        build_git_command, parse_git_version, prune_expired_availability_entries,
        quote_remote_arg, quote_remote_path, remote_git_command, version_meets_minimum,
        Availability, AvailabilityCache, AVAILABILITY_TTL,
    };
    use crate::modules::workspace::WorkspaceEnv;
    use std::collections::HashMap;
    use std::ffi::OsString;
    use std::time::{Duration, Instant};

    fn osargs(parts: &[&str]) -> Vec<OsString> {
        parts.iter().map(OsString::from).collect()
    }

    #[test]
    fn extracts_simple_version() {
        assert_eq!(
            parse_git_version("git version 2.42.0"),
            Some("2.42.0".into())
        );
    }

    #[test]
    fn extracts_apple_version() {
        assert_eq!(
            parse_git_version("git version 2.39.3 (Apple Git-145)"),
            Some("2.39.3".into())
        );
    }

    #[test]
    fn version_compare() {
        assert!(version_meets_minimum("2.23.0", "2.23"));
        assert!(version_meets_minimum("2.40.1", "2.23"));
        assert!(version_meets_minimum("3.0.0", "2.23"));
        assert!(!version_meets_minimum("2.22.0", "2.23"));
        assert!(!version_meets_minimum("1.9.5", "2.23"));
        // patch component must not regress the comparison
        assert!(version_meets_minimum("2.23.5", "2.23.4"));
        assert!(!version_meets_minimum("2.23.3", "2.23.4"));
    }

    #[test]
    fn prunes_expired_workspace_availability_entries() {
        let mut cache = HashMap::from([
            (
                "local".to_string(),
                AvailabilityCache {
                    value: Availability::Ok,
                    checked_at: Instant::now(),
                },
            ),
            (
                "wsl:Ubuntu".to_string(),
                AvailabilityCache {
                    value: Availability::NotInstalled,
                    checked_at: Instant::now() - AVAILABILITY_TTL - Duration::from_secs(1),
                },
            ),
        ]);

        prune_expired_availability_entries(&mut cache);

        assert!(cache.contains_key("local"));
        assert!(!cache.contains_key("wsl:Ubuntu"));
    }

    #[cfg(windows)]
    #[test]
    fn builds_wsl_git_command_with_cd_and_exec() {
        let cmd = build_git_command(
            &WorkspaceEnv::Wsl {
                distro: "Ubuntu".into(),
            },
            Some("/home/vinicios/Nova pasta/repo"),
            &[OsString::from("status"), OsString::from("--short")],
        )
        .expect("valid WSL distro");
        let program = cmd.get_program().to_string_lossy().into_owned();
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(program, "wsl.exe");
        assert_eq!(
            args,
            vec![
                "-d",
                "Ubuntu",
                "--cd",
                "/home/vinicios/Nova pasta/repo",
                "--exec",
                "git",
                "status",
                "--short",
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn rejects_unsafe_wsl_distro_name_for_git_command() {
        let err = build_git_command(
            &WorkspaceEnv::Wsl {
                distro: "../Ubuntu".into(),
            },
            None,
            &[],
        )
        .unwrap_err();
        assert!(err.to_string().contains("unsafe WSL distro name"));
    }

    #[test]
    fn quote_remote_arg_wraps_and_escapes() {
        assert_eq!(quote_remote_arg("status"), "'status'");
        assert_eq!(quote_remote_arg("a b"), "'a b'");
        // A literal single quote becomes the classic '\'' close-escape-reopen.
        assert_eq!(quote_remote_arg("it's"), "'it'\\''s'");
        // Shell metacharacters survive verbatim inside the quotes — no expansion.
        assert_eq!(quote_remote_arg("$(id)"), "'$(id)'");
        assert_eq!(quote_remote_arg("a;rm -rf /"), "'a;rm -rf /'");
        assert_eq!(quote_remote_arg("%H%x1f%s"), "'%H%x1f%s'");
    }

    #[test]
    fn quote_remote_path_handles_absolute_and_tilde() {
        assert_eq!(quote_remote_path("/home/u/repo"), "'/home/u/repo'");
        assert_eq!(quote_remote_path("~"), "~");
        assert_eq!(quote_remote_path("~/repo"), "~/'repo'");
        assert_eq!(quote_remote_path("~/sub dir/x"), "~/'sub dir/x'");
        assert_eq!(quote_remote_path("~deploy/repo"), "~deploy/'repo'");
        assert_eq!(quote_remote_path("~deploy"), "~deploy");
    }

    #[test]
    fn quote_remote_path_quotes_crafted_tilde_segment_whole() {
        // A non-word char in the tilde segment must NOT be left unquoted, or it
        // could expand on the remote shell. Fall back to quoting the whole path.
        assert_eq!(quote_remote_path("~$(evil)/x"), "'~$(evil)/x'");
        assert_eq!(quote_remote_path("~a b/x"), "'~a b/x'");
    }

    #[test]
    fn remote_git_command_builds_quoted_invocation() {
        let cmd = remote_git_command(
            Some("/home/u/repo"),
            &osargs(&["status", "--porcelain=v2", "-z"]),
        );
        assert_eq!(
            cmd,
            "GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 LC_ALL=C git -C '/home/u/repo' \
             'status' '--porcelain=v2' '-z'"
        );
    }

    #[test]
    fn remote_git_command_omits_dash_c_without_cwd() {
        let cmd = remote_git_command(None, &osargs(&["--version"]));
        assert_eq!(
            cmd,
            "GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 LC_ALL=C git '--version'"
        );
        // Empty cwd is treated as no cwd (no `-C ''`).
        let cmd = remote_git_command(Some(""), &osargs(&["--version"]));
        assert!(!cmd.contains(" -C "));
    }

    #[test]
    fn remote_git_command_neutralizes_injection_in_path_and_args() {
        let cmd = remote_git_command(
            Some("/repo; rm -rf /"),
            &osargs(&["log", "$(touch pwned)"]),
        );
        // The dangerous fragments are inside single quotes — the remote shell
        // sees them as literal git arguments, never as commands.
        assert!(cmd.contains("'/repo; rm -rf /'"));
        assert!(cmd.contains("'$(touch pwned)'"));
        assert!(!cmd.contains("; rm -rf / "));
    }

    #[test]
    fn build_git_command_ssh_wraps_remote_invocation() {
        let cmd = build_git_command(
            &WorkspaceEnv::Ssh {
                host: "litha-claude".into(),
            },
            Some("/home/claude/repo"),
            &osargs(&["status", "--porcelain=v2"]),
        )
        .expect("valid ssh host");
        assert_eq!(cmd.get_program().to_string_lossy(), "ssh");
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.iter().any(|a| a == "-T"));
        assert!(args.iter().any(|a| a == "BatchMode=yes"));
        assert!(args.iter().any(|a| a == "litha-claude"));
        // The final arg is the single shell-quoted remote command string.
        let remote = args.last().expect("remote command arg");
        assert!(remote.starts_with("GIT_TERMINAL_PROMPT=0"));
        assert!(remote.contains("git -C '/home/claude/repo' 'status' '--porcelain=v2'"));
    }

    #[test]
    fn build_git_command_ssh_rejects_unsafe_host() {
        let err = build_git_command(
            &WorkspaceEnv::Ssh {
                host: "-oProxyCommand=evil".into(),
            },
            None,
            &[],
        )
        .unwrap_err();
        assert!(err.to_string().contains("unsafe ssh host"));
    }
}
