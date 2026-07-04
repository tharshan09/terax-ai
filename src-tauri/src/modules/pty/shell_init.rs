use std::path::PathBuf;

use portable_pty::CommandBuilder;

use crate::modules::workspace::{self, WorkspaceEnv};

#[cfg(windows)]
const BASHRC_SCRIPT: &str = include_str!("scripts/bashrc.bash");
#[cfg(windows)]
const ZSHENV_SCRIPT: &str = include_str!("scripts/zshenv.zsh");
#[cfg(windows)]
const ZPROFILE_SCRIPT: &str = include_str!("scripts/zprofile.zsh");
#[cfg(windows)]
const ZLOGIN_SCRIPT: &str = include_str!("scripts/zlogin.zsh");
#[cfg(windows)]
const ZSHRC_SCRIPT: &str = include_str!("scripts/zshrc.zsh");
#[cfg(windows)]
const FISH_INIT_SCRIPT: &str = include_str!("scripts/init.fish");
#[cfg(unix)]
const FISH_REINSTALL_PROMPT: &str =
    "functions -q __terax_install_prompt; and __terax_install_prompt";

#[cfg(windows)]
fn bashrc_script() -> &'static str {
    BASHRC_SCRIPT
}

#[cfg(windows)]
fn zshenv_script() -> &'static str {
    ZSHENV_SCRIPT
}

#[cfg(windows)]
fn zprofile_script() -> &'static str {
    ZPROFILE_SCRIPT
}

#[cfg(windows)]
fn zlogin_script() -> &'static str {
    ZLOGIN_SCRIPT
}

#[cfg(windows)]
fn zshrc_script() -> &'static str {
    ZSHRC_SCRIPT
}

#[cfg(windows)]
fn fish_init_script() -> &'static str {
    FISH_INIT_SCRIPT
}

pub fn build_command(
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    blocks: bool,
    shell: Option<String>,
    tmux_session: Option<String>,
) -> Result<CommandBuilder, String> {
    let tmux_session = validate_tmux_session(tmux_session)?;
    let shell = sanitize_shell_override(shell);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return build_ssh(host, cwd, tmux_session.as_deref());
    }
    #[cfg(unix)]
    {
        let _ = workspace;
        unix::build(cwd, blocks, shell, tmux_session.as_deref())
    }
    #[cfg(windows)]
    {
        windows::build(cwd, workspace, blocks, shell, tmux_session.as_deref())
    }
}

/// Validate a tmux session-name override from the frontend. `None` stays `None`;
/// a present but unsafe name is a hard error (never silently dropped, unlike a
/// shell override) since it dictates what the terminal launches. The allowlist
/// lives in [`crate::modules::tmux`] so the listing and the launch agree on what
/// is attachable.
fn validate_tmux_session(name: Option<String>) -> Result<Option<String>, String> {
    match name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(name) if crate::modules::tmux::is_valid_session_name(&name) => Ok(Some(name)),
        Some(name) => Err(format!("invalid tmux session name: {name:?}")),
    }
}

/// POSIX bootstrap run on the remote host (as the ssh remote command). It
/// sources the user's normal rc, then installs a prompt hook that emits
/// **OSC 7** (`file://<host><cwd>`) on every prompt, and re-execs the user's
/// interactive shell. This is what lets the explorer follow the remote cwd —
/// the remote shell emits the same OSC 7 the local shell-integration does, so
/// no Terax binary needs to be installed on the host. bash and zsh get the
/// hook; any other shell still opens, just without cwd tracking. The temp rc
/// lives under `mktemp -d` for the session's lifetime.
///
/// `TERAX_REMOTE=1` is exported first so a user's own `~/.bashrc` login hook
/// (e.g. an interactive tmux session picker) can skip itself under Terax, which
/// drives session selection through the in-app switcher instead. It is a
/// dedicated marker, kept distinct from `TERAX_TERMINAL` so it cannot trip the
/// Claude Code agent-notification hooks that gate on the latter.
const REMOTE_SHELL_INIT: &str = r#"export TERAX_REMOTE=1
__terax_dir="$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/.terax-$$")"
mkdir -p "$__terax_dir" 2>/dev/null
__terax_shell="${SHELL:-/bin/bash}"
case "$__terax_shell" in
  *zsh)
    cat > "$__terax_dir/.zshrc" <<'TZ'
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc"
__terax_osc7() { printf '\033]7;file://%s%s\007' "${HOST:-$(hostname)}" "$PWD"; }
autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook precmd __terax_osc7
__terax_osc7
TZ
    ZDOTDIR="$__terax_dir" exec "$__terax_shell" -i
    ;;
  *bash)
    cat > "$__terax_dir/rc" <<'TB'
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
__terax_osc7() { printf '\033]7;file://%s%s\007' "${HOSTNAME:-$(hostname)}" "$PWD"; }
case ":${PROMPT_COMMAND-}:" in *__terax_osc7*) : ;; *) PROMPT_COMMAND="__terax_osc7${PROMPT_COMMAND:+;${PROMPT_COMMAND}}" ;; esac
__terax_osc7
TB
    exec "$__terax_shell" --rcfile "$__terax_dir/rc" -i
    ;;
  *)
    exec "$__terax_shell" -i
    ;;
esac
"#;

/// Spawn the system `ssh` client inside the local PTY. The remote login shell
/// runs under a real TTY (`-tt`), OpenSSH multiplexing (see
/// [`crate::modules::ssh::control_args`]) lets later filesystem calls reuse
/// this connection, and [`REMOTE_SHELL_INIT`] installs OSC 7 cwd reporting on
/// the remote shell.
fn build_ssh(
    host: &str,
    _cwd: Option<String>,
    tmux_session: Option<&str>,
) -> Result<CommandBuilder, String> {
    crate::modules::ssh::validate_ssh_host(host)?;
    // The terminal establishes the shared ControlMaster; record it so the socket
    // is torn down on quit.
    crate::modules::ssh::note_connected_host(host);
    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg("-tt");
    for arg in crate::modules::ssh::control_args() {
        cmd.arg(arg);
    }
    cmd.arg(host);
    // Single arg → ssh forwards it verbatim as the remote command (run by the
    // remote login shell), so neither script needs extra quoting.
    match tmux_session {
        Some(session) => {
            cmd.arg(tmux_attach_command(session));
        }
        None => {
            cmd.arg(REMOTE_SHELL_INIT);
        }
    }
    cmd.env("TERM", "xterm-256color");
    Ok(cmd)
}

/// Login-shell command that attaches to, or creates, `session` in tmux. Used by
/// both the SSH path (over the remote login shell) and the local path (through
/// `$SHELL -l`), so `tmux` is resolved against the full interactive PATH: a
/// GUI-launched macOS app otherwise gets a minimal PATH that misses Homebrew and
/// a bare `tmux` fails to spawn. `session` is allowlist-validated upstream
/// (`[A-Za-z0-9_-]`), so single-quoting is injection-safe with no escaping. The
/// OSC 7 rc bootstrap is intentionally skipped: tmux runs its own shells and
/// does not reliably propagate it, so cwd tracking inside tmux is best-effort
/// and simply absent rather than wrong.
fn tmux_attach_command(session: &str) -> String {
    format!("exec tmux new-session -A -s '{session}'")
}

// Honor the override only if it matches an enumerated shell, so a tampered
// setting can't spawn an arbitrary binary across the IPC boundary.
fn sanitize_shell_override(shell: Option<String>) -> Option<String> {
    let candidate = shell.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())?;
    let target = std::fs::canonicalize(&candidate).ok();
    let allowed = list_shells().into_iter().any(|s| {
        s.path == candidate || (target.is_some() && std::fs::canonicalize(&s.path).ok() == target)
    });
    if allowed {
        Some(candidate)
    } else {
        log::warn!("ignoring non-enumerated shell override '{candidate}'");
        None
    }
}

pub fn detect_shell_name() -> String {
    #[cfg(unix)]
    {
        let (_, path) = unix::Shell::detect();
        path.rsplit('/').next().unwrap_or("").to_string()
    }
    #[cfg(windows)]
    {
        windows_shell_path()
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default()
    }
}

#[derive(serde::Serialize)]
pub struct ShellInfo {
    pub name: String,
    pub path: String,
    /// True when Terax injects OSC 7/133 integration for this shell (cwd
    /// tracking, command blocks, agent detection). Others spawn bare.
    pub integrated: bool,
}

pub fn list_shells() -> Vec<ShellInfo> {
    #[cfg(unix)]
    {
        unix::list_shells()
    }
    #[cfg(windows)]
    {
        windows::list_shells()
    }
}

fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let is_utf8 = |v: &str| {
        let up = v.to_ascii_uppercase();
        up.contains("UTF-8") || up.contains("UTF8")
    };
    let already_utf8 = ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .any(|k| std::env::var(k).ok().as_deref().is_some_and(is_utf8));
    if already_utf8 {
        return;
    }
    #[cfg(target_os = "macos")]
    let fallback = "en_US.UTF-8";
    #[cfg(all(unix, not(target_os = "macos")))]
    let fallback = "C.UTF-8";
    #[cfg(windows)]
    let fallback = "en_US.UTF-8";
    cmd.env("LANG", fallback);
}

fn apply_common(cmd: &mut CommandBuilder, cwd: Option<String>, blocks: bool) {
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERAX_TERMINAL", "1");
    if blocks {
        cmd.env("TERAX_BLOCKS", "1");
    }
    for (key, value) in workspace::appimage_env_overrides() {
        match value {
            Some(v) => {
                cmd.env(key, v);
            }
            None => {
                cmd.env_remove(key);
            }
        }
    }
    ensure_utf8_locale(cmd);

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| workspace::launch_cwd_snapshot().filter(|p| p.is_dir()))
        .or_else(|| dirs::home_dir().filter(|p| p.is_dir()));
    if let Some(cwd) = resolved_cwd {
        #[cfg(windows)]
        let cwd = PathBuf::from(cwd.to_string_lossy().replace('/', "\\"));
        log::info!("pty cwd: {}", cwd.display());
        cmd.cwd(cwd);
    } else {
        log::warn!("pty cwd: no usable directory, inheriting from process");
    }
}

#[cfg(unix)]
mod unix {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use portable_pty::CommandBuilder;

    const ZSHENV: &str = include_str!("scripts/zshenv.zsh");
    const ZPROFILE: &str = include_str!("scripts/zprofile.zsh");
    const ZLOGIN: &str = include_str!("scripts/zlogin.zsh");
    const ZSHRC: &str = include_str!("scripts/zshrc.zsh");
    const BASHRC: &str = include_str!("scripts/bashrc.bash");
    const FISH_INIT: &str = include_str!("scripts/init.fish");

    pub enum Shell {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl Shell {
        pub fn classify(path: &str) -> Shell {
            match path.rsplit('/').next().unwrap_or("") {
                "zsh" => Shell::Zsh,
                "bash" => Shell::Bash,
                "fish" => Shell::Fish,
                _ => Shell::Other,
            }
        }

        pub fn detect() -> (Shell, String) {
            let path = login_shell()
                .or_else(|| std::env::var("SHELL").ok())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "/bin/zsh".into());
            (Self::classify(&path), path)
        }

        // A configured override wins only when it points at a real file;
        // otherwise fall back to the user's login shell.
        pub fn resolve(shell_override: Option<String>) -> (Shell, String) {
            if let Some(path) = shell_override
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
            {
                if Path::new(&path).is_file() {
                    return (Self::classify(&path), path);
                }
                log::warn!("configured shell '{path}' not found, using auto-detect");
            }
            Self::detect()
        }
    }

    fn login_shell() -> Option<String> {
        use std::ffi::CStr;
        unsafe {
            let uid = libc::getuid();
            let pw = libc::getpwuid(uid);
            if pw.is_null() {
                return None;
            }
            let shell_ptr = (*pw).pw_shell;
            if shell_ptr.is_null() {
                return None;
            }
            CStr::from_ptr(shell_ptr).to_str().ok().map(String::from)
        }
    }

    pub fn list_shells() -> Vec<super::ShellInfo> {
        use std::collections::HashSet;
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        let (_, login) = Shell::detect();
        let mut candidates = vec![login];
        if let Ok(content) = fs::read_to_string("/etc/shells") {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                candidates.push(line.to_string());
            }
        }
        for path in candidates {
            if !seen.insert(path.clone()) || !Path::new(&path).is_file() {
                continue;
            }
            let integrated = !matches!(Shell::classify(&path), Shell::Other);
            let name = path.rsplit('/').next().unwrap_or(&path).to_string();
            out.push(super::ShellInfo {
                name,
                path,
                integrated,
            });
        }
        out
    }

    pub fn build(
        cwd: Option<String>,
        blocks: bool,
        shell_override: Option<String>,
        tmux_session: Option<&str>,
    ) -> Result<CommandBuilder, String> {
        if let Some(session) = tmux_session {
            // Attach-or-create the session THROUGH the user's login shell, so
            // `tmux` is resolved against the full interactive PATH. A GUI
            // (Finder/Dock) launch gives the app only a minimal PATH that misses
            // Homebrew, so `CommandBuilder::new("tmux")` fails to spawn. `exec`
            // replaces the shell with tmux (no lingering wrapper). tmux runs the
            // user's login shell inside, without our OSC 7/133 hooks, so cwd
            // tracking in a tmux tab is best-effort (absent) rather than wrong.
            let (_shell, shell_path) = Shell::resolve(shell_override);
            let mut cmd = CommandBuilder::new(&shell_path);
            cmd.arg("-l");
            cmd.arg("-c");
            cmd.arg(super::tmux_attach_command(session));
            super::apply_common(&mut cmd, cwd, blocks);
            return Ok(cmd);
        }
        let (shell, shell_path) = Shell::resolve(shell_override);
        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd, blocks);

        match shell {
            Shell::Zsh => {
                match prepare_zdotdir() {
                    Ok(zdotdir) => {
                        // Guard against Terax-in-Terax :)
                        if let Ok(user_zd) = std::env::var("ZDOTDIR") {
                            if Path::new(&user_zd) != zdotdir.as_path() {
                                cmd.env("TERAX_USER_ZDOTDIR", user_zd);
                            }
                        }
                        cmd.env("ZDOTDIR", &zdotdir);
                    }
                    Err(e) => {
                        log::warn!("zsh shell integration disabled: {e}");
                    }
                }
                // Login shell so /etc/zprofile runs path_helper on macOS — without
                // this, GUI-launched apps get a minimal PATH missing Homebrew.
                cmd.arg("-l");
            }
            Shell::Bash => {
                match prepare_bash_rcfile() {
                    Ok(rc) => {
                        cmd.arg("--rcfile");
                        cmd.arg(rc);
                    }
                    Err(e) => {
                        log::warn!("bash shell integration disabled: {e}");
                    }
                }
                // bash ignores --rcfile under -l, so we use -i and source
                // /etc/profile from inside our rcfile to emulate login init.
                cmd.arg("-i");
            }
            Shell::Fish => {
                if let Err(e) = prepare_fish_conf_d() {
                    log::warn!("fish shell integration disabled: {e}");
                }
                // fish 4.0+ writes its own OSC 133 A/B; ours would double it.
                cmd.env("fish_features", "no-mark-prompt");
                cmd.arg("-i");
                // Re-assert our prompt after config.fish (-C runs last), so a
                // framework prompt (starship etc.) loaded there can't override
                // the markers and break cwd tracking.
                cmd.arg("-C");
                cmd.arg(super::FISH_REINSTALL_PROMPT);
            }
            Shell::Other => {
                log::info!(
                    "unsupported shell '{}', spawning without integration",
                    shell_path
                );
            }
        }
        Ok(cmd)
    }

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("terax").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_zdotdir() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("zsh");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join(".zshenv"), ZSHENV)?;
        write_if_changed(&dir.join(".zprofile"), ZPROFILE)?;
        write_if_changed(&dir.join(".zshrc"), ZSHRC)?;
        write_if_changed(&dir.join(".zlogin"), ZLOGIN)?;
        Ok(dir)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, BASHRC)?;
        Ok(rc)
    }

    fn prepare_fish_conf_d() -> Result<(), String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let dir = home.join(".config").join("fish").join("conf.d");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        write_if_changed(&dir.join("terax.fish"), FISH_INIT)?;
        Ok(())
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        // Atomic replace: a parallel shell startup must never source a half-written file.
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__terax_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::Shell;

        #[test]
        fn classify_maps_known_shells() {
            assert!(matches!(Shell::classify("/bin/zsh"), Shell::Zsh));
            assert!(matches!(Shell::classify("/usr/bin/bash"), Shell::Bash));
            assert!(matches!(
                Shell::classify("/opt/homebrew/bin/fish"),
                Shell::Fish
            ));
            assert!(matches!(Shell::classify("/bin/sh"), Shell::Other));
            assert!(matches!(Shell::classify("/usr/bin/nu"), Shell::Other));
        }

        #[test]
        fn resolve_uses_an_existing_override() {
            let exe = std::env::current_exe().unwrap();
            let path = exe.to_string_lossy().into_owned();
            let (_, resolved) = Shell::resolve(Some(path.clone()));
            assert_eq!(resolved, path);
        }

        #[test]
        fn resolve_falls_back_when_override_missing() {
            let (_, path) = Shell::resolve(Some("/no/such/shell/xyz".into()));
            assert!(!path.is_empty());
            assert_ne!(path, "/no/such/shell/xyz");
        }

        #[test]
        fn resolve_falls_back_on_empty_override() {
            let (_, fallback) = Shell::resolve(Some("   ".into()));
            let (_, detected) = Shell::detect();
            assert_eq!(fallback, detected);
        }
    }
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::fs;
    use std::path::{Path, PathBuf};

    use crate::modules::workspace::WorkspaceEnv;
    use portable_pty::CommandBuilder;

    const PROFILE_PS1: &str = include_str!("scripts/profile.ps1");

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum ShellKind {
        Zsh,
        Bash,
        Fish,
        Other,
    }

    impl ShellKind {
        fn from_path(path: &str) -> Self {
            match path.rsplit('/').next().unwrap_or("") {
                "zsh" => Self::Zsh,
                "bash" => Self::Bash,
                "fish" => Self::Fish,
                _ => Self::Other,
            }
        }
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    enum WslShellIntegration {
        Zsh {
            zdotdir: String,
            user_zdotdir: Option<String>,
        },
        Bash { rcfile: String },
        Fish,
        None,
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct WslLaunchSpec {
        args: Vec<String>,
    }

    pub fn build(
        cwd: Option<String>,
        workspace: WorkspaceEnv,
        blocks: bool,
        shell: Option<String>,
        tmux_session: Option<&str>,
    ) -> Result<CommandBuilder, String> {
        if let WorkspaceEnv::Wsl { distro } = workspace {
            let _ = (blocks, shell);
            return build_wsl(cwd, distro, tmux_session);
        }
        // Native Windows has no tmux; the remote (SSH) tmux path is handled
        // before the platform split, so a Windows host still drives remote ones.
        let _ = tmux_session;
        let shell_path = shell
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .unwrap_or_else(super::windows_shell_path);
        let shell_name = shell_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        let is_powershell = shell_name == "pwsh.exe" || shell_name == "powershell.exe";
        let is_bash = shell_name == "bash.exe";

        let mut cmd = CommandBuilder::new(&shell_path);
        super::apply_common(&mut cmd, cwd, blocks);

        if is_powershell {
            match prepare_ps_profile() {
                Ok(profile) => {
                    cmd.arg("-NoLogo");
                    cmd.arg("-NoExit");
                    cmd.arg("-ExecutionPolicy");
                    cmd.arg("Bypass");
                    cmd.arg("-File");
                    cmd.arg(profile);
                }
                Err(e) => {
                    log::warn!("powershell shell integration disabled: {e}");
                }
            }
        } else if is_bash {
            // git-bash's /etc/profile cd's to $HOME unless CHERE_INVOKING is
            // set; keep the cwd we configured in apply_common.
            cmd.env("CHERE_INVOKING", "1");
            // Native git-bash: same OSC 7/133 rcfile as Unix bash, in the
            // forward-slash form MSYS bash accepts.
            match prepare_bash_rcfile() {
                Ok(rc) => {
                    cmd.arg("--rcfile");
                    cmd.arg(rc.to_string_lossy().replace('\\', "/"));
                    cmd.arg("-i");
                }
                Err(e) => {
                    log::warn!("bash shell integration disabled: {e}");
                }
            }
        } else {
            log::info!("spawning {} without shell integration", shell_name);
        }

        log::info!("spawning Windows shell: {}", shell_path.display());
        Ok(cmd)
    }

    fn build_wsl(
        cwd: Option<String>,
        distro: String,
        tmux_session: Option<&str>,
    ) -> Result<CommandBuilder, String> {
        crate::modules::workspace::validate_wsl_distro_name(&distro)?;
        if let Some(session) = tmux_session {
            // Attach-or-create the session inside the distro. `--exec` runs tmux
            // via execvp (no shell), and the name is allowlist-validated upstream
            // (validate_tmux_session), so no quoting is needed. tmux runs its own
            // shells, so the OSC 7/133 integration is intentionally skipped, like
            // the unix and SSH tmux paths.
            let mut cmd = CommandBuilder::new("wsl.exe");
            for arg in wsl_tmux_args(cwd.as_deref(), &distro, session) {
                cmd.arg(arg);
            }
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            cmd.env("TERAX_TERMINAL", "1");
            super::ensure_utf8_locale(&mut cmd);
            log::info!("spawning WSL tmux: {distro} -> {session}");
            return Ok(cmd);
        }
        let shell_path = crate::modules::workspace::wsl_login_shell(distro.clone())?;
        let shell_kind = ShellKind::from_path(&shell_path);
        let integration = match shell_kind {
            ShellKind::Zsh => match prepare_wsl_zdotdir(&distro) {
                Ok(zdotdir) => {
                    let user_zdotdir = match probe_wsl_zdotdir(&distro, &shell_path) {
                        Ok(path) if !path.is_empty() && path != zdotdir => Some(path),
                        Ok(_) => None,
                        Err(e) => {
                            log::warn!("WSL zsh ZDOTDIR probe failed for {distro}: {e}");
                            None
                        }
                    };
                    WslShellIntegration::Zsh {
                        zdotdir,
                        user_zdotdir,
                    }
                }
                Err(e) => {
                    log::warn!("WSL zsh shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Bash => match prepare_wsl_bash_rcfile(&distro) {
                Ok(rcfile) => WslShellIntegration::Bash { rcfile },
                Err(e) => {
                    log::warn!("WSL bash shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Fish => match prepare_wsl_fish_conf_d(&distro) {
                Ok(()) => WslShellIntegration::Fish,
                Err(e) => {
                    log::warn!("WSL fish shell integration disabled for {distro}: {e}");
                    WslShellIntegration::None
                }
            },
            ShellKind::Other => {
                log::info!(
                    "unsupported WSL shell '{}', spawning without integration",
                    shell_path
                );
                WslShellIntegration::None
            }
        };
        let spec = build_wsl_launch_spec(
            cwd.as_deref(),
            &distro,
            &shell_path,
            shell_kind,
            integration,
        );
        let mut cmd = CommandBuilder::new("wsl.exe");
        for arg in &spec.args {
            cmd.arg(arg);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERAX_TERMINAL", "1");
        super::ensure_utf8_locale(&mut cmd);
        log::info!("spawning WSL shell: {distro} ({shell_path})");
        Ok(cmd)
    }

    /// `wsl.exe` argv for attaching/creating a tmux session inside `distro`.
    /// Pure so the launch contract is unit-testable without a live WSL probe.
    /// `session` is allowlist-validated upstream; `--exec` bypasses the shell, so
    /// each arg is passed verbatim to execvp (no quoting/splice surface).
    fn wsl_tmux_args(cwd: Option<&str>, distro: &str, session: &str) -> Vec<String> {
        vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            cwd.filter(|s| !s.is_empty()).unwrap_or("~").to_string(),
            "--exec".to_string(),
            "tmux".to_string(),
            "new-session".to_string(),
            "-A".to_string(),
            "-s".to_string(),
            session.to_string(),
        ]
    }

    fn build_wsl_launch_spec(
        cwd: Option<&str>,
        distro: &str,
        shell_path: &str,
        shell_kind: ShellKind,
        integration: WslShellIntegration,
    ) -> WslLaunchSpec {
        let mut args = vec![
            "-d".to_string(),
            distro.to_string(),
            "--cd".to_string(),
            cwd.filter(|s| !s.is_empty()).unwrap_or("~").to_string(),
            "--exec".to_string(),
        ];
        match (shell_kind, integration) {
            (
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir,
                    user_zdotdir,
                },
            ) => {
                args.push("env".to_string());
                if let Some(user_zdotdir) = user_zdotdir {
                    args.push(format!("TERAX_USER_ZDOTDIR={user_zdotdir}"));
                }
                args.push(format!("ZDOTDIR={zdotdir}"));
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::Bash { rcfile }) => {
                args.push(shell_path.to_string());
                args.push("--rcfile".to_string());
                args.push(rcfile);
                args.push("-i".to_string());
            }
            (ShellKind::Fish, WslShellIntegration::Fish) => {
                args.push("env".to_string());
                args.push("fish_features=no-mark-prompt".to_string());
                args.push(shell_path.to_string());
                args.push("-i".to_string());
            }
            (ShellKind::Zsh, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-l".to_string());
            }
            (ShellKind::Bash, WslShellIntegration::None)
            | (ShellKind::Fish, WslShellIntegration::None) => {
                args.push(shell_path.to_string());
                args.push("-i".to_string());
            }
            (ShellKind::Other, _) => args.push(shell_path.to_string()),
            _ => {
                args.push(shell_path.to_string());
            }
        }
        WslLaunchSpec { args }
    }

    fn probe_wsl_zdotdir(distro: &str, shell_path: &str) -> Result<String, String> {
        let out = crate::modules::workspace::wsl_exec_capture(
            distro,
            shell_path,
            &["-c", r#"printf %s "${ZDOTDIR:-$HOME}""#],
        )?;
        Ok(crate::modules::workspace::normalize_wsl_value(out, ""))
    }

    fn prepare_wsl_integration_dir(distro: &str, shell: &str) -> Result<(String, PathBuf), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!(
            "{}/.cache/terax/shell-integration/{shell}",
            home.trim_end_matches('/')
        );
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        Ok((linux_dir, unc_dir))
    }

    fn normalize_script(content: &str) -> String {
        content.replace("\r\n", "\n")
    }

    fn prepare_wsl_zdotdir(distro: &str) -> Result<String, String> {
        let (linux_dir, unc_dir) = prepare_wsl_integration_dir(distro, "zsh")?;
        write_if_changed(
            &unc_dir.join(".zshenv"),
            &normalize_script(super::zshenv_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zprofile"),
            &normalize_script(super::zprofile_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zshrc"),
            &normalize_script(super::zshrc_script()),
        )?;
        write_if_changed(
            &unc_dir.join(".zlogin"),
            &normalize_script(super::zlogin_script()),
        )?;
        Ok(linux_dir)
    }

    fn prepare_wsl_bash_rcfile(distro: &str) -> Result<String, String> {
        let (linux_dir, _unc_dir) = prepare_wsl_integration_dir(distro, "bash")?;
        let linux_rc = format!("{linux_dir}/bashrc");
        let unc_file = crate::modules::workspace::wsl_path_to_unc(distro, &linux_rc);
        let content = normalize_script(super::bashrc_script());
        write_if_changed(&unc_file, &content)?;
        Ok(linux_rc)
    }

    fn prepare_wsl_fish_conf_d(distro: &str) -> Result<(), String> {
        let home = crate::modules::workspace::wsl_home(distro.to_string())?;
        let linux_dir = format!("{}/.config/fish/conf.d", home.trim_end_matches('/'));
        let unc_dir = crate::modules::workspace::wsl_path_to_unc(distro, &linux_dir);
        fs::create_dir_all(&unc_dir).map_err(|e| format!("create {}: {e}", unc_dir.display()))?;
        let unc_file = unc_dir.join("terax.fish");
        let content = normalize_script(super::fish_init_script());
        write_if_changed(&unc_file, &content)?;
        Ok(())
    }

    fn integration_root() -> Result<PathBuf, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home dir".to_string())?;
        let root = home.join(".cache").join("terax").join("shell-integration");
        fs::create_dir_all(&root).map_err(|e| format!("create {}: {e}", root.display()))?;
        Ok(root)
    }

    fn prepare_ps_profile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("powershell");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let file = dir.join("profile.ps1");
        write_if_changed(&file, PROFILE_PS1)?;
        Ok(file)
    }

    fn prepare_bash_rcfile() -> Result<PathBuf, String> {
        let dir = integration_root()?.join("bash");
        fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let rc = dir.join("bashrc");
        write_if_changed(&rc, &normalize_script(super::bashrc_script()))?;
        Ok(rc)
    }

    pub fn list_shells() -> Vec<super::ShellInfo> {
        fn add(out: &mut Vec<super::ShellInfo>, name: &str, path: PathBuf, integrated: bool) {
            if path.is_file() {
                out.push(super::ShellInfo {
                    name: name.to_string(),
                    path: path.to_string_lossy().into_owned(),
                    integrated,
                });
            }
        }

        let mut out = Vec::new();
        if let Some(p) = super::which_in_path("pwsh.exe") {
            add(&mut out, "PowerShell", p, true);
        } else if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
            add(
                &mut out,
                "PowerShell",
                pf.join("PowerShell").join("7").join("pwsh.exe"),
                true,
            );
        }
        let system32 = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
            .join("System32");
        add(
            &mut out,
            "Windows PowerShell",
            system32
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe"),
            true,
        );
        add(&mut out, "Command Prompt", system32.join("cmd.exe"), false);
        if let Some(p) = git_bash_path() {
            add(&mut out, "Git Bash", p, true);
        }
        out
    }

    fn git_bash_path() -> Option<PathBuf> {
        // Git for Windows install locations only. A bash.exe on PATH is usually
        // the WSL launcher in System32, which is the separate WSL switcher.
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
            if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
                for rel in [
                    r"Git\bin\bash.exe",
                    r"Git\usr\bin\bash.exe",
                    r"Programs\Git\bin\bash.exe",
                ] {
                    let candidate = base.join(rel);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }
        None
    }

    fn write_if_changed(path: &Path, content: &str) -> Result<(), String> {
        if let Ok(existing) = fs::read_to_string(path) {
            if existing == content {
                return Ok(());
            }
        }
        let mut tmp: OsString = path.as_os_str().to_owned();
        tmp.push(".__terax_tmp__");
        let tmp = PathBuf::from(tmp);
        fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("rename {} -> {}: {e}", tmp.display(), path.display())
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn wsl_tmux_args_attach_or_create_with_no_shell_splice() {
            assert_eq!(
                wsl_tmux_args(Some("/home/u/repo"), "Ubuntu", "main").join(" "),
                "-d Ubuntu --cd /home/u/repo --exec tmux new-session -A -s main"
            );
            // Empty/None cwd falls back to the home shorthand.
            assert_eq!(
                wsl_tmux_args(None, "Debian", "work_1").join(" "),
                "-d Debian --cd ~ --exec tmux new-session -A -s work_1"
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_env_and_login() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/terax/shell-integration/zsh".into(),
                    user_zdotdir: None,
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/terax/shell-integration/zsh".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_with_user_zdotdir_probe() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::Zsh {
                    zdotdir: "/home/vinicios/.cache/terax/shell-integration/zsh".into(),
                    user_zdotdir: Some("/home/vinicios/.config/zsh".into()),
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "TERAX_USER_ZDOTDIR=/home/vinicios/.config/zsh".to_string(),
                    "ZDOTDIR=/home/vinicios/.cache/terax/shell-integration/zsh".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_zsh_launch_spec_without_integration_still_uses_login_shell() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/zsh",
                ShellKind::Zsh,
                WslShellIntegration::None,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/zsh".to_string(),
                    "-l".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_bash_launch_spec_with_rcfile() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/bin/bash",
                ShellKind::Bash,
                WslShellIntegration::Bash {
                    rcfile: "/home/vinicios/.cache/terax/shell-integration/bash/bashrc".into(),
                },
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "/bin/bash".to_string(),
                    "--rcfile".to_string(),
                    "/home/vinicios/.cache/terax/shell-integration/bash/bashrc".to_string(),
                    "-i".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_fish_launch_spec_without_init_command() {
            let spec = build_wsl_launch_spec(
                Some("/home/vinicios/repo"),
                "Ubuntu",
                "/usr/bin/fish",
                ShellKind::Fish,
                WslShellIntegration::Fish,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "/home/vinicios/repo".to_string(),
                    "--exec".to_string(),
                    "env".to_string(),
                    "fish_features=no-mark-prompt".to_string(),
                    "/usr/bin/fish".to_string(),
                    "-i".to_string(),
                ]
            );
        }

        #[test]
        fn builds_wsl_other_shell_without_integration() {
            let spec = build_wsl_launch_spec(
                None,
                "Ubuntu",
                "/usr/bin/nu",
                ShellKind::Other,
                WslShellIntegration::None,
            );
            assert_eq!(
                spec.args,
                vec![
                    "-d".to_string(),
                    "Ubuntu".to_string(),
                    "--cd".to_string(),
                    "~".to_string(),
                    "--exec".to_string(),
                    "/usr/bin/nu".to_string(),
                ]
            );
        }
    }
}

#[cfg(windows)]
pub fn windows_shell_path() -> PathBuf {
    if let Some(p) = which_in_path("pwsh.exe") {
        return p;
    }

    if let Some(pf) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
        let candidate = pf.join("PowerShell").join("7").join("pwsh.exe");
        if candidate.is_file() {
            return candidate;
        }
    }

    let system32 = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join("System32");
    let ps5 = system32
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if ps5.is_file() {
        return ps5;
    }

    system32.join("cmd.exe")
}

#[cfg(windows)]
fn which_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{sanitize_shell_override, tmux_attach_command, validate_tmux_session};

    #[test]
    fn rejects_non_enumerated_override() {
        let exe = std::env::current_exe()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(sanitize_shell_override(Some(exe)), None);
    }

    #[test]
    fn empty_or_missing_override_is_none() {
        assert_eq!(sanitize_shell_override(Some("   ".into())), None);
        assert_eq!(sanitize_shell_override(None), None);
    }

    #[test]
    fn validate_tmux_session_accepts_safe_names() {
        assert_eq!(validate_tmux_session(None).unwrap(), None);
        assert_eq!(
            validate_tmux_session(Some("  main ".into())).unwrap(),
            Some("main".to_string())
        );
        assert_eq!(
            validate_tmux_session(Some("review-pr_2".into())).unwrap(),
            Some("review-pr_2".to_string())
        );
    }

    #[test]
    fn validate_tmux_session_rejects_injection() {
        for bad in [
            "a;rm -rf ~",
            "a b",
            "$(id)",
            "a'b",
            "a`id`",
            "a|b",
            "a.b",
            "-x",
            "a$(touch /tmp/x)",
        ] {
            assert!(
                validate_tmux_session(Some(bad.into())).is_err(),
                "must reject {bad:?}"
            );
        }
    }

    #[test]
    fn tmux_attach_command_single_quotes_the_name() {
        assert_eq!(
            tmux_attach_command("main"),
            "exec tmux new-session -A -s 'main'"
        );
        assert_eq!(
            tmux_attach_command("review-pr_2"),
            "exec tmux new-session -A -s 'review-pr_2'"
        );
    }

    #[cfg(unix)]
    #[test]
    fn local_tmux_tab_spawns_through_a_login_shell() {
        // Regression: a bare `tmux` binary is resolved against the process PATH,
        // which is the minimal launchd PATH for a Finder/Dock-launched app and
        // misses Homebrew. The tmux tab must go through `$SHELL -l -c` so tmux
        // is found (mirrors the picker + the SSH path).
        let cmd = super::unix::build(None, false, None, Some("main")).unwrap();
        let argv: Vec<String> = cmd
            .get_argv()
            .iter()
            .map(|s| s.to_string_lossy().into_owned())
            .collect();
        // shell -l -c "exec tmux new-session -A -s 'main'"
        assert!(argv.iter().any(|a| a == "-l"), "must be a login shell: {argv:?}");
        assert!(argv.iter().any(|a| a == "-c"));
        assert!(
            argv.iter().any(|a| a == "exec tmux new-session -A -s 'main'"),
            "must exec tmux through the shell: {argv:?}"
        );
        // The bare-binary form that caused the bug must be gone.
        assert_ne!(argv.first().map(String::as_str), Some("tmux"));
    }

    #[test]
    fn remote_shell_init_exports_terax_remote_first() {
        // The marker must be exported before the user's rc is sourced so a
        // ~/.bashrc login picker can self-skip under Terax.
        assert!(super::REMOTE_SHELL_INIT.starts_with("export TERAX_REMOTE=1\n"));
        // It must stay distinct from TERAX_TERMINAL (agent-hook gating).
        assert!(!super::REMOTE_SHELL_INIT.contains("TERAX_TERMINAL"));
    }
}
