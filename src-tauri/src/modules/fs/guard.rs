//! Secret-path deny-list + workspace-escape checks for the normal file
//! surface (editor, Cmd+Click opener, previews, raw IPC commands).
//!
//! Rust port of the AI-tool guard in `src/modules/ai/lib/security.ts` so every
//! IPC consumer inherits it, not just the AI tools. The JS guard stays in
//! place on top for the AI surface.
//!
//! Deliberate divergences from the JS guard, because this layer serves a
//! human, not an autonomous agent:
//!  - System config dirs (`/etc`, `/var/db`) stay readable: a person opening
//!    `/etc/hosts` in the editor is legitimate. They remain write-denied.
//!  - `.git` is not blocked: people open `.git/config` or edit hooks, and the
//!    explorer's mutation surface already operates inside `.git` today.
//!  - Reads outside the authorized workspace roots are allowed for explicit
//!    paths (the editor legitimately opens files anywhere the user points
//!    it), but a *leaf symlink* that silently redirects from inside the
//!    workspace to outside it is refused. Directory symlinks are followed:
//!    build systems (bazel, pnpm) routinely link whole trees into caches, and
//!    the deny-list still applies to the resolved target.

use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;

use crate::modules::workspace::WorkspaceRegistry;

const SECRET_BASENAME_PATTERNS: &[&str] = &[
    // `.env` and `.env.<suffix>`. The `[.\s:]|$` tail (here and below) keeps
    // Windows trailing-dot/space stripping and NTFS alternate data streams
    // (`.env::$DATA`) from slipping past an end-anchored pattern.
    r"(?i)^\.env(\..+)?([.\s:]|$)",
    r"(?i)^.*\.pem([.\s:]|$)",
    r"(?i)^.*\.key([.\s:]|$)",
    r"(?i)^.*\.p12([.\s:]|$)",
    r"(?i)^.*\.pfx([.\s:]|$)",
    r"(?i)^.*\.asc([.\s:]|$)",
    r"(?i)^.*\.gpg([.\s:]|$)",
    r"(?i)^.*\.keystore([.\s:]|$)",
    r"(?i)^.*\.jks([.\s:]|$)",
    // `id_rsa`, `id_rsa.pub`, and backup/copy variants (`id_rsa.bak`,
    // `id_rsa_old`, `id_rsa-backup`).
    r"(?i)^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?([.\s:]|$)",
    r"(?i)^known_hosts([.\s:]|$)",
    r"(?i)^authorized_keys([.\s:]|$)",
    r"(?i)^htpasswd([.\s:]|$)",
    r"(?i)^\.netrc([.\s:]|$)",
    r"(?i)^_netrc([.\s:]|$)",
    r"(?i)^credentials([.\s:]|$)",
    // Not in the JS list (which relies on the `/.git` dir block it doesn't
    // have for `~/.git-credentials`): the classic plaintext git token store.
    r"(?i)^\.git-credentials([.\s:]|$)",
    r"(?i)^\.pgpass([.\s:]|$)",
    r"(?i)^\.npmrc([.\s:]|$)",
    r"(?i)^\.pypirc([.\s:]|$)",
    r"(?i)^secrets?\.(json|ya?ml|toml|env)([.\s:]|$)",
    r"(?i)^service[-_]?account.*\.json([.\s:]|$)",
];

/// Credential-material directories: denied for read and write. Matched as a
/// path segment on the comparison form (`/.ssh` matches `/home/u/.ssh/x` but
/// not `/home/u/.sshx`).
const PROTECTED_DIRS: &[&str] = &[
    "/.ssh",
    "/.gnupg",
    "/.aws",
    "/.azure",
    "/.kube",
    "/.docker",
    "/.config/gh",
    "/.config/git",
    "/.config/gcloud",
    "/.config/op",
    "/.terraform.d",
    "/library/keychains",
    "/library/cookies",
    // Other-process env/cmdline leaks (Linux) and root's home.
    "/proc",
    "/sys",
    "/var/root",
    "/private/var/root",
    // Windows equivalents (post drive-strip + lowercase).
    "/appdata/roaming/microsoft/credentials",
    "/appdata/local/microsoft/credentials",
    "/appdata/roaming/gcloud",
];

/// Write-only deny prefixes (system locations), root-anchored on the
/// comparison form. Reading `/etc/hosts` is fine; writing it is not.
const WRITE_DENY_PREFIXES: &[&str] = &[
    "/etc/",
    "/var/db/",
    "/var/root/",
    "/system/",
    "/library/keychains/",
    "/library/launchagents/",
    "/library/launchdaemons/",
    "/private/etc/",
    "/private/var/db/",
    "/private/var/root/",
    "/usr/bin/",
    "/usr/sbin/",
    "/usr/local/bin/",
    "/bin/",
    "/sbin/",
    "/boot/",
    "/windows/",
    "/program files/",
    "/program files (x86)/",
    "/programdata/",
];

fn secret_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        SECRET_BASENAME_PATTERNS
            .iter()
            .map(|p| Regex::new(p).expect("static secret pattern compiles"))
            .collect()
    })
}

fn basename(p: &str) -> &str {
    p.rsplit(['/', '\\']).next().unwrap_or(p)
}

/// Normalized comparison surface, never used as a real path: backslashes to
/// slashes, Windows drive/UNC prefixes stripped, NTFS alternate-data-stream
/// suffixes and trailing dots/spaces stripped per segment, duplicate slashes
/// collapsed, lowercased, trailing slash dropped.
fn comparison_form(p: &str) -> String {
    let mut s = p.replace('\\', "/");
    if let Some(rest) = s.strip_prefix("//?/") {
        s = format!("/{rest}");
    }
    let bytes = s.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        s = s[2..].to_string();
    }
    let s = s
        .split('/')
        .map(|seg| {
            let seg = seg.split(':').next().unwrap_or(seg);
            seg.trim_end_matches(['.', ' '])
        })
        .collect::<Vec<_>>()
        .join("/");
    let mut out = String::with_capacity(s.len());
    let mut prev_slash = false;
    for c in s.chars() {
        if c == '/' {
            if prev_slash {
                continue;
            }
            prev_slash = true;
        } else {
            prev_slash = false;
        }
        out.extend(c.to_lowercase());
    }
    if out.len() > 1 && out.ends_with('/') {
        out.pop();
    }
    out
}

fn is_under_protected(cmp: &str, dir: &str) -> bool {
    format!("{cmp}/").contains(&format!("{dir}/"))
}

/// Deny-list check for reads: secret basenames + credential directories.
pub fn check_read_str(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("refused: empty path".into());
    }
    if path.bytes().any(|b| b < 0x20) {
        return Err("refused: path contains control bytes".into());
    }
    let base = basename(path);
    for re in secret_patterns() {
        if re.is_match(base) {
            return Err(format!(
                "refused: \"{base}\" matches a sensitive-file pattern"
            ));
        }
    }
    let cmp = comparison_form(path);
    // Anchor with a leading slash so a relative path whose first segment is a
    // protected dir (e.g. `.kube/config`) matches the `/`-prefixed entries.
    // On the SSH surface this string check is the only gate before the remote
    // helper resolves the path against $HOME, so a bare relative path must be
    // caught here. Absolute paths already start with `/`, so this is a no-op.
    let anchored = if cmp.starts_with('/') {
        cmp
    } else {
        format!("/{cmp}")
    };
    for dir in PROTECTED_DIRS {
        if is_under_protected(&anchored, dir) {
            return Err(format!(
                "refused: path is inside a protected directory ({})",
                dir.trim_start_matches('/')
            ));
        }
    }
    Ok(())
}

/// Deny-list check for writes: everything reads refuse, plus system dirs.
pub fn check_write_str(path: &str) -> Result<(), String> {
    check_read_str(path)?;
    let cmp = comparison_form(path);
    let cmp = if cmp.starts_with('/') {
        cmp
    } else {
        format!("/{cmp}")
    };
    for prefix in WRITE_DENY_PREFIXES {
        if cmp.starts_with(prefix) || format!("{cmp}/").starts_with(prefix) {
            return Err(format!(
                "refused: writes under \"{}\" are not allowed",
                prefix.trim_end_matches('/')
            ));
        }
    }
    Ok(())
}

fn outside_workspace(p: &Path) -> String {
    format!("path is outside the authorized workspace: {}", p.display())
}

/// Read guard for local files. Checks the literal path and its canonical
/// form against the deny-list, and refuses a leaf symlink that silently
/// redirects from inside the authorized workspace roots to outside them.
/// Returns the canonical path so the caller reads exactly what was checked.
///
/// `trusted` distinguishes an explicit user open (editor / preview) from an
/// untrusted vector (terminal Cmd+Click link, AI tool). Trusted opens skip the
/// secret deny-list so a person can open their own `.env` / `~/.ssh/config` by
/// name, but a leaf symlink whose innocent name hides a secret target is still
/// refused in both modes: the user did not knowingly name the secret.
pub fn enforce_read(
    registry: &WorkspaceRegistry,
    resolved: &Path,
    raw: &str,
    trusted: bool,
) -> Result<PathBuf, String> {
    if !trusted {
        check_read_str(raw)?;
    }
    let canonical = match std::fs::canonicalize(resolved) {
        Ok(c) => c,
        // Missing file: let the read surface the real io error.
        Err(_) => return Ok(resolved.to_path_buf()),
    };
    if !trusted {
        check_read_str(&canonical.to_string_lossy())?;
    } else if check_read_str(raw).is_ok() {
        // Trusted open: the user may name a secret directly (raw is a secret,
        // so this branch is skipped and the open is allowed). But if the raw
        // path looks innocent yet resolves via a leaf OR parent symlink to a
        // secret, that is deception, so apply the deny-list to the resolved
        // target. Mere normalization (e.g. /var -> /private/var) never flips
        // the verdict, so honest opens are unaffected.
        check_read_str(&canonical.to_string_lossy())?;
    }
    // Workspace-escape via a leaf symlink (both modes): a symlink that lives
    // inside the authorized roots but resolves outside them.
    if let (Some(parent), Some(name)) = (resolved.parent(), resolved.file_name()) {
        if let Ok(canon_parent) = std::fs::canonicalize(parent) {
            let literal = canon_parent.join(name);
            if literal != canonical
                && registry.is_authorized(&literal)
                && !registry.is_authorized(&canonical)
            {
                return Err(format!(
                    "refused: symlink resolves outside the authorized workspace: {}",
                    canonical.display()
                ));
            }
        }
    }
    Ok(canonical)
}

/// Write guard for local files. Checks the deny-list on the literal path and
/// on the landing point, and jails *new* files to the authorized workspace
/// roots. Overwriting an existing entry outside the roots stays allowed: the
/// editor legitimately saves files it opened outside the workspace. The
/// landing point is canonical(parent) + leaf, because `write_atomic` persists
/// via rename, which replaces a leaf symlink instead of following it.
///
/// `trusted` (an explicit editor save) skips the secret deny-list so a person
/// can save their own `.env`, but the new-file jail below still applies in both
/// modes.
pub fn enforce_write(
    registry: &WorkspaceRegistry,
    resolved: &Path,
    raw: &str,
    trusted: bool,
) -> Result<PathBuf, String> {
    if !trusted {
        check_write_str(raw)?;
    }
    // No `..`: the editor and explorer never emit it, and rejecting outright
    // beats reasoning about traversal through not-yet-existing components.
    if resolved.components().any(|c| c == Component::ParentDir) {
        return Err(outside_workspace(resolved));
    }
    let (Some(parent), Some(name)) = (resolved.parent(), resolved.file_name()) else {
        return Err(format!("invalid path: {}", resolved.display()));
    };
    let landing = match std::fs::canonicalize(parent) {
        Ok(p) => p.join(name),
        // Missing parent: the write itself fails with the real io error.
        Err(_) => return Ok(resolved.to_path_buf()),
    };
    if !trusted {
        check_write_str(&landing.to_string_lossy())?;
    } else if check_write_str(raw).is_ok() {
        // Trusted save: a secret the user named directly is allowed (branch
        // skipped), but an innocent-looking path that lands via a symlinked
        // parent or leaf on a secret is deception -> refuse before write_atomic
        // could overwrite it.
        check_write_str(&landing.to_string_lossy())?;
    }
    let exists = std::fs::symlink_metadata(&landing).is_ok();
    if !exists && !registry.is_authorized(&landing) {
        return Err(outside_workspace(&landing));
    }
    Ok(landing)
}

/// Root jail for the search-family commands (`fs_search`, `fs_grep`,
/// `fs_glob`, `fs_list_files`): the walk root must sit under an authorized
/// workspace root.
pub fn authorize_search_root(
    registry: &WorkspaceRegistry,
    resolved_root: &Path,
) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(resolved_root)
        .map_err(|e| format!("root not accessible: {e}"))?;
    if !registry.is_authorized(&canonical) {
        return Err(outside_workspace(&canonical));
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reg_for(dir: &Path) -> WorkspaceRegistry {
        let reg = WorkspaceRegistry::default();
        reg.authorize(dir).expect("authorize tempdir root");
        reg
    }

    #[test]
    fn read_blocks_secret_basenames() {
        for p in [
            "/home/u/project/.env",
            "/home/u/project/.env.local",
            "/home/u/server.pem",
            "/home/u/server.pem.bak",
            "/home/u/cert.key",
            "/home/u/id_rsa",
            "/home/u/id_ed25519",
            "/home/u/id_rsa.bak",
            "/home/u/backup/id_rsa_old",
            "/home/u/known_hosts",
            "/home/u/authorized_keys",
            "/home/u/.netrc",
            "/home/u/credentials",
            "/home/u/.git-credentials",
            "/home/u/.npmrc",
            "/home/u/secrets.yaml",
            "/home/u/secret.json",
            "/home/u/service-account-prod.json",
        ] {
            assert!(check_read_str(p).is_err(), "should refuse: {p}");
        }
    }

    #[test]
    fn read_allows_ordinary_files() {
        for p in [
            "/home/u/project/notes.txt",
            "/home/u/project/main.rs",
            "/home/u/.envrc",
            "/home/u/id_rsa2.txt",
            "/home/u/keyboard.rs",
            "/home/u/monkey.md",
            "/etc/hosts",
            "/home/u/repo/.git/config",
            "/home/u/repo/.git/hooks/pre-commit",
        ] {
            assert!(check_read_str(p).is_ok(), "should allow: {p}");
        }
    }

    #[test]
    fn read_blocks_protected_dirs_incl_case_and_ads() {
        for p in [
            "/Users/u/.ssh/config",
            "/Users/u/.SSH/config",
            "/Users/u/.aws/config",
            "/Users/u/.config/gh/hosts.yml",
            "/Users/u/Library/Keychains/login.keychain-db",
            "C:\\Users\\u\\.ssh\\config",
            "/home/u/project/.env.",
            "/home/u/project/.env::$DATA",
            "/home/u/.ssh./config",
        ] {
            assert!(check_read_str(p).is_err(), "should refuse: {p}");
        }
        assert!(check_read_str("/Users/u/.sshx/file").is_ok());
    }

    #[test]
    fn read_blocks_relative_protected_dirs() {
        // A relative path whose first segment is a protected dir has no leading
        // slash to match the `/`-prefixed entries; on the SSH surface this is
        // the only gate, so it must still be refused.
        for p in [
            ".kube/config",
            ".ssh/config",
            ".config/gh/hosts.yml",
            ".aws/credentials",
        ] {
            assert!(check_read_str(p).is_err(), "should refuse relative: {p}");
        }
        // Non-secret basenames refuse on the directory, not the pattern.
        for p in [".kube/config", ".config/gh/hosts.yml"] {
            let err = check_read_str(p).unwrap_err();
            assert!(err.contains("protected directory"), "got: {err}");
        }
        for p in ["project/src/main.rs", "notes/todo.txt"] {
            assert!(check_read_str(p).is_ok(), "should allow relative: {p}");
        }
    }

    #[test]
    fn read_blocks_control_bytes_and_empty() {
        assert!(check_read_str("").is_err());
        assert!(check_read_str("/home/u/a\x00b").is_err());
        assert!(check_read_str("/home/u/a\nb").is_err());
    }

    #[test]
    fn write_blocks_system_prefixes_reads_do_not() {
        for p in [
            "/etc/hosts",
            "/private/etc/hosts",
            "/usr/local/bin/tool",
            "/Library/LaunchAgents/evil.plist",
            "C:\\Windows\\system32\\drivers\\etc\\hosts",
            "C:\\Program Files\\app\\config.ini",
        ] {
            assert!(check_write_str(p).is_err(), "should refuse write: {p}");
        }
        assert!(check_read_str("/etc/hosts").is_ok());
        assert!(check_read_str("/usr/local/bin/tool").is_ok());
    }

    #[test]
    fn write_allows_ordinary_workspace_files() {
        assert!(check_write_str("/home/u/project/notes.txt").is_ok());
        assert!(check_write_str("/home/u/project/src/main.rs").is_ok());
    }

    #[test]
    fn comparison_form_normalizes() {
        assert_eq!(comparison_form("C:\\Users\\U\\.SSH\\x"), "/users/u/.ssh/x");
        assert_eq!(comparison_form("/a//b/"), "/a/b");
        assert_eq!(comparison_form("/a/.env::$DATA"), "/a/.env");
        assert_eq!(comparison_form("/a/.env. "), "/a/.env");
    }

    #[test]
    fn enforce_read_allows_normal_file_and_returns_canonical() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("a.txt");
        std::fs::write(&f, b"x").unwrap();
        let got = enforce_read(&reg, &f, &f.to_string_lossy(), false).expect("allowed");
        assert_eq!(got, std::fs::canonicalize(&f).unwrap());
    }

    #[test]
    fn enforce_read_blocks_secret_inside_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        std::fs::write(&f, b"KEY=1").unwrap();
        let err = enforce_read(&reg, &f, &f.to_string_lossy(), false).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
    }

    #[test]
    fn enforce_read_trusted_allows_secret_by_name() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        std::fs::write(&f, b"KEY=1").unwrap();
        // Explicit editor open: the user may open their own secret by name.
        let got = enforce_read(&reg, &f, &f.to_string_lossy(), true).expect("allowed");
        assert_eq!(got, std::fs::canonicalize(&f).unwrap());
    }

    #[test]
    fn enforce_read_trusted_allows_direct_protected_dir_path() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let ssh = dir.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let f = ssh.join("config");
        std::fs::write(&f, b"Host x").unwrap();
        let got = enforce_read(&reg, &f, &f.to_string_lossy(), true).expect("allowed");
        assert_eq!(got, std::fs::canonicalize(&f).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn enforce_read_trusted_refuses_deceptive_leaf_symlink_to_secret() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let ssh = outside.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let secret = ssh.join("id_rsa");
        std::fs::write(&secret, b"PRIVATE").unwrap();
        let link = jail.path().join("innocent.txt");
        std::os::unix::fs::symlink(&secret, &link).unwrap();
        // Innocent name, secret target: refused even in trusted mode.
        let err = enforce_read(&reg, &link, &link.to_string_lossy(), true).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
    }

    // Deception via a symlinked PARENT dir (not the leaf): `assets -> outside/.ssh`,
    // then opening `assets/config`. The leaf name is innocent; secrecy comes only
    // from the resolved parent, so this is caught by the raw-innocent-but-resolved-
    // secret rule, not the leaf-symlink branch. (A leaf literally named `id_rsa`
    // would be a user-named secret and is intentionally allowed in trusted mode.)
    #[cfg(unix)]
    #[test]
    fn enforce_read_trusted_refuses_deceptive_parent_symlink_to_secret() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let ssh = outside.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        std::fs::write(ssh.join("config"), b"Host real").unwrap();
        let link_dir = jail.path().join("assets");
        std::os::unix::fs::symlink(&ssh, &link_dir).unwrap();
        let target = link_dir.join("config");
        let err = enforce_read(&reg, &target, &target.to_string_lossy(), true).unwrap_err();
        assert!(err.contains("protected"), "got: {err}");
    }

    // A trusted SAVE through a symlinked parent must not overwrite the secret.
    #[cfg(unix)]
    #[test]
    fn enforce_write_trusted_refuses_deceptive_parent_symlink() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let ssh = outside.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        std::fs::write(ssh.join("config"), b"Host real").unwrap();
        let link_dir = jail.path().join("assets");
        std::os::unix::fs::symlink(&ssh, &link_dir).unwrap();
        let target = link_dir.join("config");
        let err = enforce_write(&reg, &target, &target.to_string_lossy(), true).unwrap_err();
        assert!(err.contains("protected") || err.contains("sensitive"), "got: {err}");
        assert_eq!(std::fs::read(ssh.join("config")).unwrap(), b"Host real");
    }

    #[cfg(unix)]
    #[test]
    fn enforce_read_blocks_symlink_to_protected_dir() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let ssh = dir.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let secret = ssh.join("conf");
        std::fs::write(&secret, b"Host x").unwrap();
        let link = dir.path().join("innocent.txt");
        std::os::unix::fs::symlink(&secret, &link).unwrap();
        let err = enforce_read(&reg, &link, &link.to_string_lossy(), false).unwrap_err();
        assert!(err.contains("protected directory"), "got: {err}");
    }

    #[cfg(unix)]
    #[test]
    fn enforce_read_blocks_leaf_symlink_escaping_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let target = outside.path().join("plain.txt");
        std::fs::write(&target, b"data").unwrap();
        let link = jail.path().join("innocent.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let err = enforce_read(&reg, &link, &link.to_string_lossy(), false).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }

    #[cfg(unix)]
    #[test]
    fn enforce_read_allows_leaf_symlink_inside_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let target = dir.path().join("real.txt");
        std::fs::write(&target, b"data").unwrap();
        let link = dir.path().join("alias.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let got = enforce_read(&reg, &link, &link.to_string_lossy(), false).expect("allowed");
        assert_eq!(got, std::fs::canonicalize(&target).unwrap());
    }

    #[test]
    fn enforce_read_allows_explicit_path_outside_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let f = outside.path().join("readme.md");
        std::fs::write(&f, b"hi").unwrap();
        assert!(enforce_read(&reg, &f, &f.to_string_lossy(), false).is_ok());
    }

    #[test]
    fn enforce_read_missing_file_passes_through() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("missing.txt");
        let got = enforce_read(&reg, &f, &f.to_string_lossy(), false).expect("pass through");
        assert_eq!(got, f);
    }

    #[test]
    fn enforce_write_allows_new_file_inside_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("new.txt");
        assert!(enforce_write(&reg, &f, &f.to_string_lossy(), false).is_ok());
    }

    #[test]
    fn enforce_write_blocks_new_file_outside_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let f = outside.path().join("evil.txt");
        let err = enforce_write(&reg, &f, &f.to_string_lossy(), false).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }

    #[test]
    fn enforce_write_allows_existing_file_outside_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let f = outside.path().join("opened.txt");
        std::fs::write(&f, b"old").unwrap();
        assert!(enforce_write(&reg, &f, &f.to_string_lossy(), false).is_ok());
    }

    #[test]
    fn enforce_write_blocks_secret_and_dotdot() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let env = dir.path().join(".env");
        assert!(enforce_write(&reg, &env, &env.to_string_lossy(), false).is_err());
        let escape = dir.path().join("sub").join("..").join("x.txt");
        let err = enforce_write(&reg, &escape, &escape.to_string_lossy(), false).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }

    #[test]
    fn enforce_write_trusted_allows_existing_secret() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let env = dir.path().join(".env");
        std::fs::write(&env, b"OLD=1").unwrap();
        // Explicit editor save of a file the user opened: allowed though secret.
        assert!(enforce_write(&reg, &env, &env.to_string_lossy(), true).is_ok());
    }

    #[test]
    fn authorize_search_root_accepts_inside_rejects_outside() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        assert!(authorize_search_root(&reg, jail.path()).is_ok());
        let sub = jail.path().join("sub");
        std::fs::create_dir(&sub).unwrap();
        assert!(authorize_search_root(&reg, &sub).is_ok());
        let err = authorize_search_root(&reg, outside.path()).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }
}
