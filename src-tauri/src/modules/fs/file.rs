use std::path::Path;
use std::time::UNIX_EPOCH;
use std::{fs, io::Write};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tempfile::NamedTempFile;

use crate::modules::fs::guard;
use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

const MAX_READ_BYTES: u64 = 10 * 1024 * 1024; // 10 MB
const BINARY_SNIFF_BYTES: usize = 8 * 1024;

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ReadResult {
    Text {
        content: String,
        size: u64,
    },
    Binary {
        size: u64,
    },
    /// File exceeds MAX_READ_BYTES. UI decides whether to offer "open anyway".
    TooLarge {
        size: u64,
        limit: u64,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StatKind {
    File,
    Dir,
    Symlink,
}

#[derive(Serialize, Deserialize)]
pub struct FileStat {
    pub size: u64,
    pub mtime: u64,
    pub kind: StatKind,
}

#[tauri::command]
pub fn fs_read_file(
    path: String,
    workspace: Option<WorkspaceEnv>,
    trusted: Option<bool>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<ReadResult, String> {
    fs_read_file_impl(path, workspace, trusted, &registry)
}

fn fs_read_file_impl(
    path: String,
    workspace: Option<WorkspaceEnv>,
    trusted: Option<bool>,
    registry: &WorkspaceRegistry,
) -> Result<ReadResult, String> {
    // Default = untrusted/guarded: an unmarked caller fails closed.
    let trusted = trusted.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        // Remote symlinks resolve host-side; the string-level deny-list is
        // what we can enforce before dispatch.
        if !trusted {
            guard::check_read_str(&path)?;
        }
        return crate::modules::ssh::read_file(host, &path);
    }
    let p = guard::enforce_read(registry, &resolve_path(&path, &workspace), &path, trusted)?;
    let meta = std::fs::metadata(&p).map_err(|e| {
        log::debug!("fs_read_file stat({}) failed: {e}", p.display());
        e.to_string()
    })?;

    let size = meta.len();
    if size > MAX_READ_BYTES {
        return Ok(ReadResult::TooLarge {
            size,
            limit: MAX_READ_BYTES,
        });
    }

    let bytes = std::fs::read(&p).map_err(|e| {
        log::debug!("fs_read_file read({}) failed: {e}", p.display());
        e.to_string()
    })?;

    // Null-byte sniff on the first chunk. Not perfect (misses UTF-16 BOM
    // cases) but catches the common "this is a PNG" mistake cheaply.
    let sniff_len = bytes.len().min(BINARY_SNIFF_BYTES);
    if bytes[..sniff_len].contains(&0) {
        return Ok(ReadResult::Binary { size });
    }

    match String::from_utf8(bytes) {
        Ok(content) => Ok(ReadResult::Text { content, size }),
        Err(_) => Ok(ReadResult::Binary { size }),
    }
}

#[derive(Serialize, Clone)]
struct FileWrittenEvent {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

/// Atomic write via O_EXCL tempfile in the target's parent, then rename.
/// The random suffix is what blocks pre-staged symlink attacks.
fn write_atomic(target: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = target.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no parent")
    })?;
    let mut tmp = NamedTempFile::new_in(parent)?;
    tmp.as_file_mut().write_all(content)?;
    tmp.as_file_mut().sync_all()?;
    tmp.persist(target).map_err(|e| e.error)?;
    Ok(())
}

#[tauri::command]
pub fn fs_write_file(
    path: String,
    content: String,
    workspace: Option<WorkspaceEnv>,
    source: Option<String>,
    trusted: Option<bool>,
    app: tauri::AppHandle,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_write_file_impl(&path, &content, workspace, trusted, &registry)?;
    let _ = app.emit("fs:file-written", FileWrittenEvent { path, source });
    Ok(())
}

fn fs_write_file_impl(
    path: &str,
    content: &str,
    workspace: Option<WorkspaceEnv>,
    trusted: Option<bool>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    // Default = untrusted/guarded: an unmarked caller fails closed.
    let trusted = trusted.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        if !trusted {
            guard::check_write_str(path)?;
        }
        return crate::modules::ssh::write_file(host, path, content);
    }
    let target = guard::enforce_write(registry, &resolve_path(path, &workspace), path, trusted)?;
    let original_permissions = fs::metadata(&target).ok().map(|m| m.permissions());
    write_atomic(&target, content.as_bytes()).map_err(|e| {
        log::warn!("fs_write_file({}) failed: {e}", target.display());
        e.to_string()
    })?;

    if let Some(perms) = original_permissions {
        let _ = fs::set_permissions(&target, perms);
    }
    Ok(())
}

/// Runs the UNTRUSTED read guard without reading the file. The terminal
/// Cmd+Click opener calls this before opening a tab, so a link to a secret is
/// refused there while the explicit editor/explorer path stays trusted.
#[tauri::command]
pub fn fs_check_readable(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_check_readable_impl(path, workspace, &registry)
}

fn fs_check_readable_impl(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if workspace.is_ssh() {
        // Remote symlinks resolve host-side; the string-level deny-list is all
        // we can enforce without touching the host.
        return guard::check_read_str(&path);
    }
    guard::enforce_read(registry, &resolve_path(&path, &workspace), &path, false).map(|_| ())
}

#[tauri::command]
pub fn fs_canonicalize(path: String, workspace: Option<WorkspaceEnv>) -> Result<String, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    // Remote paths can't be canonicalized locally; return verbatim (they're
    // already absolute POSIX paths from the remote shell / explorer).
    if workspace.is_ssh() {
        return Ok(path);
    }
    let p = resolve_path(&path, &workspace);
    let canon = std::fs::canonicalize(&p).map_err(|e| e.to_string())?;
    Ok(super::to_canon(&canon))
}

#[tauri::command]
pub fn fs_stat(path: String, workspace: Option<WorkspaceEnv>) -> Result<FileStat, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::stat(host, &path);
    }
    let p = resolve_path(&path, &workspace);
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let kind = if meta.is_dir() {
        StatKind::Dir
    } else if meta.file_type().is_symlink() {
        StatKind::Symlink
    } else {
        StatKind::File
    };
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileStat {
        size: meta.len(),
        mtime,
        kind,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reg_for(dir: &Path) -> WorkspaceRegistry {
        let reg = WorkspaceRegistry::default();
        reg.authorize(dir).expect("authorize tempdir root");
        reg
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn read_file_classifies_utf8_as_text() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("a.txt");
        std::fs::write(&f, b"hello world").unwrap();
        match fs_read_file_impl(s(&f), None, Some(false), &reg).unwrap() {
            ReadResult::Text { content, size } => {
                assert_eq!(content, "hello world");
                assert_eq!(size, 11);
            }
            _ => panic!("expected text"),
        }
    }

    #[test]
    fn read_file_detects_binary_via_null_byte() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("a.bin");
        std::fs::write(&f, b"PNG\0\x89image").unwrap();
        assert!(matches!(
            fs_read_file_impl(s(&f), None, Some(false), &reg).unwrap(),
            ReadResult::Binary { .. }
        ));
    }

    #[test]
    fn read_file_detects_binary_via_invalid_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("a.bin");
        // Invalid UTF-8 with no null byte: must still classify as binary.
        std::fs::write(&f, [0xff, 0xfe, 0xfd, 0xfc]).unwrap();
        assert!(matches!(
            fs_read_file_impl(s(&f), None, Some(false), &reg).unwrap(),
            ReadResult::Binary { .. }
        ));
    }

    // --- deny-list + jail on the normal file surface (FS-1, FS-2, FS-4) ---

    #[test]
    fn read_refuses_secret_file_in_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        std::fs::write(&f, b"KEY=1").unwrap();
        let err = fs_read_file_impl(s(&f), None, Some(false), &reg).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
    }

    #[test]
    fn read_refuses_ssh_secret_path_before_dispatch() {
        let reg = WorkspaceRegistry::default();
        let err = fs_read_file_impl(
            "~/.ssh/id_rsa".into(),
            Some(WorkspaceEnv::Ssh {
                host: "terax-test-never-connects".into(),
            }),
            Some(false),
            &reg,
        )
        .unwrap_err();
        // The refusal must come from the guard, not from a connection attempt.
        assert!(err.contains("sensitive-file"), "got: {err}");
    }

    #[test]
    fn read_refuses_ssh_protected_dir_before_dispatch() {
        let reg = WorkspaceRegistry::default();
        // Non-secret basename inside a protected dir: only the directory check
        // can catch it, and it must fire before any remote connection. Both the
        // bare relative form and the tilde form resolve against the remote
        // $HOME, so both must be refused here.
        for p in [".kube/config", "~/.kube/config"] {
            let err = fs_read_file_impl(
                p.into(),
                Some(WorkspaceEnv::Ssh {
                    host: "terax-test-never-connects".into(),
                }),
                Some(false),
                &reg,
            )
            .unwrap_err();
            assert!(err.contains("protected directory"), "got: {err}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn read_refuses_leaf_symlink_escaping_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let target = outside.path().join("plain.txt");
        std::fs::write(&target, b"data").unwrap();
        let link = jail.path().join("innocent.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let err = fs_read_file_impl(s(&link), None, Some(false), &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }

    #[test]
    fn read_allows_explicit_file_outside_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let f = outside.path().join("readme.md");
        std::fs::write(&f, b"hi").unwrap();
        assert!(matches!(
            fs_read_file_impl(s(&f), None, Some(false), &reg).unwrap(),
            ReadResult::Text { .. }
        ));
    }

    #[test]
    fn read_trusted_allows_secret_file() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        std::fs::write(&f, b"KEY=1").unwrap();
        // Explicit editor open of the user's own secret is allowed.
        assert!(matches!(
            fs_read_file_impl(s(&f), None, Some(true), &reg).unwrap(),
            ReadResult::Text { .. }
        ));
    }

    #[test]
    fn read_trusted_allows_direct_protected_dir_path() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let ssh = dir.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let f = ssh.join("config");
        std::fs::write(&f, b"Host x").unwrap();
        assert!(matches!(
            fs_read_file_impl(s(&f), None, Some(true), &reg).unwrap(),
            ReadResult::Text { .. }
        ));
    }

    // Deception: an innocent name whose leaf symlink target is a secret must be
    // refused even in trusted mode, because the user never named the secret.
    #[cfg(unix)]
    #[test]
    fn read_trusted_still_refuses_deceptive_leaf_symlink() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let ssh = outside.path().join(".ssh");
        std::fs::create_dir(&ssh).unwrap();
        let secret = ssh.join("id_rsa");
        std::fs::write(&secret, b"PRIVATE").unwrap();
        let link = jail.path().join("innocent.txt");
        std::os::unix::fs::symlink(&secret, &link).unwrap();
        let err = fs_read_file_impl(s(&link), None, Some(true), &reg).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
    }

    #[test]
    fn check_readable_refuses_secret_and_allows_normal() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let env = dir.path().join(".env");
        std::fs::write(&env, b"KEY=1").unwrap();
        let err = fs_check_readable_impl(s(&env), None, &reg).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
        let ok = dir.path().join("notes.txt");
        std::fs::write(&ok, b"hi").unwrap();
        assert!(fs_check_readable_impl(s(&ok), None, &reg).is_ok());
    }

    #[test]
    fn write_creates_inside_workspace_and_refuses_outside() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());

        let inside = jail.path().join("new.txt");
        fs_write_file_impl(&s(&inside), "ok", None, Some(false), &reg).expect("write inside");
        assert_eq!(std::fs::read(&inside).unwrap(), b"ok");

        let evil = outside.path().join("evil.txt");
        let err = fs_write_file_impl(&s(&evil), "x", None, Some(false), &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        assert!(!evil.exists());
    }

    #[test]
    fn write_saves_existing_file_outside_workspace() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let f = outside.path().join("opened.txt");
        std::fs::write(&f, b"old").unwrap();
        fs_write_file_impl(&s(&f), "new", None, Some(false), &reg).expect("editor save outside");
        assert_eq!(std::fs::read(&f).unwrap(), b"new");
    }

    #[test]
    fn write_refuses_secret_target() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        let err = fs_write_file_impl(&s(&f), "KEY=1", None, Some(false), &reg).unwrap_err();
        assert!(err.contains("sensitive-file"), "got: {err}");
        assert!(!f.exists());
    }

    #[test]
    fn write_trusted_saves_existing_secret() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join(".env");
        std::fs::write(&f, b"OLD=1").unwrap();
        // Explicit editor save of the user's own secret is allowed.
        fs_write_file_impl(&s(&f), "NEW=2", None, Some(true), &reg).expect("trusted save");
        assert_eq!(std::fs::read(&f).unwrap(), b"NEW=2");
    }

    // Writing through a leaf symlink must replace the link, never write
    // through to a target outside the workspace.
    #[cfg(unix)]
    #[test]
    fn write_replaces_leaf_symlink_instead_of_following() {
        let jail = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let reg = reg_for(jail.path());
        let target = outside.path().join("victim.txt");
        std::fs::write(&target, b"untouched").unwrap();
        let link = jail.path().join("link.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        fs_write_file_impl(&s(&link), "payload", None, Some(false), &reg).expect("write");

        assert_eq!(std::fs::read(&target).unwrap(), b"untouched");
        assert!(!std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read(&link).unwrap(), b"payload");
    }

    #[test]
    fn overwrites_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.txt");
        std::fs::write(&target, b"old").unwrap();
        write_atomic(&target, b"new").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_legacy_staging_symlink() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside.txt");
        std::fs::write(&outside, b"untouched").unwrap();

        let target = dir.path().join("note.txt");
        // Pre-stage a symlink at the legacy deterministic staging path.
        let legacy = dir.path().join(".note.txt.terax.tmp");
        symlink(&outside, &legacy).unwrap();

        write_atomic(&target, b"payload").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"payload");
        // The pre-staged symlink target must not have been written through.
        assert_eq!(std::fs::read(&outside).unwrap(), b"untouched");
    }
}
