use std::ffi::{OsStr, OsString};
use std::fmt::Display;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

use super::guard;
use super::mutate::authorize_mutation_dir;
use super::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

pub(crate) const STAGING_PREFIX: &str = ".terax-copy-";
const MAX_COPY_SOURCES: usize = 1024;
const MAX_COPY_SUFFIX: usize = 10_000;
const MAX_COPY_DEPTH: usize = 128;
pub(crate) const STAGED_ITEM: &str = "item";

/// Half-finished copies live under this prefix; every listing primitive of the
/// app hides such names, whatever `show_hidden` or ignore rules say.
pub(crate) fn is_staging_name(name: &str) -> bool {
    name.starts_with(STAGING_PREFIX)
}

/// Walker `filter_entry`: `.hidden(true)` yields to whitelist rules in
/// .gitignore, so staging dirs need this filter to stay unentered.
pub(crate) fn not_staging(dent: &ignore::DirEntry) -> bool {
    !dent.file_name().to_str().is_some_and(is_staging_name)
}

#[derive(Debug, Default, Serialize)]
pub struct CopyResult {
    pub created: Vec<String>,
    pub failed: Vec<CopyFailure>,
}

#[derive(Debug, Serialize)]
pub struct CopyFailure {
    pub source: String,
    pub message: String,
}

/// Failures stay per item so one bad source never sinks the batch. Sources skip
/// the workspace jail (the user picked them in the OS) but not the deny-list.
#[tauri::command]
pub async fn fs_copy(
    app: tauri::AppHandle,
    sources: Vec<String>,
    dest_dir: String,
    workspace: Option<WorkspaceEnv>,
    rename_on_conflict: Option<bool>,
) -> Result<CopyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        copy_batch(
            sources,
            &dest_dir,
            &WorkspaceEnv::from_option(workspace),
            &app.state::<WorkspaceRegistry>(),
            rename_on_conflict.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| format!("fs_copy task failed: {e}"))?
}

fn copy_batch(
    sources: Vec<String>,
    dest_dir: &str,
    workspace: &WorkspaceEnv,
    registry: &WorkspaceRegistry,
    rename_on_conflict: bool,
) -> Result<CopyResult, String> {
    if sources.len() > MAX_COPY_SOURCES {
        return Err(format!("copy at most {MAX_COPY_SOURCES} items at a time"));
    }
    if let WorkspaceEnv::Ssh { host } = workspace {
        return crate::modules::ssh::copy(host, &sources, dest_dir, rename_on_conflict);
    }
    let dest = copy_destination(dest_dir, workspace, registry)?;
    let mut result = CopyResult::default();
    for source in sources {
        match copy_item(Path::new(&source), &dest, rename_on_conflict) {
            Ok(name) => result
                .created
                .push(to_canon(Path::new(dest_dir).join(name))),
            Err(error) => {
                log::warn!("fs_copy({source} -> {}) failed: {error}", dest.display());
                result.failed.push(CopyFailure {
                    source,
                    message: error.to_string(),
                });
            }
        }
    }
    Ok(result)
}

fn copy_destination(
    dest_dir: &str,
    workspace: &WorkspaceEnv,
    registry: &WorkspaceRegistry,
) -> Result<PathBuf, String> {
    let dest = resolve_path(dest_dir, workspace);
    authorize_mutation_dir(registry, Some(&dest), &dest)?;
    if !dest.is_dir() {
        return Err("copy destination is not a directory".into());
    }
    std::fs::canonicalize(&dest).map_err(|e| e.to_string())
}

/// The metadata is unfollowed, so each branch decides what a symlink source means.
pub(crate) fn check_source(src: &Path) -> io::Result<(&OsStr, std::fs::Metadata)> {
    if !src.is_absolute() {
        return Err(invalid("copy source must be absolute"));
    }
    let name = src
        .file_name()
        .ok_or_else(|| invalid("copy source has no filename"))?;
    guard_read(src)?;
    // A symlinked parent folder must not smuggle a protected location past the check.
    if let Some(real_parent) = src.parent().and_then(|p| std::fs::canonicalize(p).ok()) {
        guard_read(&real_parent.join(name))?;
    }
    let metadata = std::fs::symlink_metadata(src)?;
    let kind = metadata.file_type();
    if !(kind.is_file() || kind.is_dir() || kind.is_symlink()) {
        return Err(unsupported_kind());
    }
    Ok((name, metadata))
}

// SECURITY: copies read and write through the same secret-path deny-list as
// fs_read_file and fs_write_file; a refusal fails only that item.
pub(crate) fn guard_read(path: &Path) -> io::Result<()> {
    guard::check_read_str(&path.to_string_lossy()).map_err(refused)
}

pub(crate) fn guard_write(path: &str) -> io::Result<()> {
    guard::check_write_str(path).map_err(refused)
}

fn refused(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, message)
}

pub(crate) fn check_depth(depth: usize) -> io::Result<()> {
    if depth > MAX_COPY_DEPTH {
        return Err(invalid("folder nesting exceeds the copy limit"));
    }
    Ok(())
}

pub(crate) fn unsupported_kind() -> io::Error {
    invalid("only files, folders and symbolic links can be copied")
}

pub(crate) fn already_exists(target: impl Display) -> io::Error {
    io::Error::new(
        io::ErrorKind::AlreadyExists,
        format!("already exists: {target}"),
    )
}

pub(crate) fn no_free_copy_name() -> io::Error {
    io::Error::new(io::ErrorKind::AlreadyExists, "no free copy name")
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

/// The name itself, then the Finder-style alternatives in order.
pub(crate) fn copy_candidates(name: &OsStr, is_dir: bool) -> impl Iterator<Item = OsString> + '_ {
    std::iter::once(name.to_os_string())
        .chain((1..=MAX_COPY_SUFFIX).map(move |n| copy_name(name, n, is_dir)))
}

fn copy_item(src: &Path, dest: &Path, rename_on_conflict: bool) -> io::Result<OsString> {
    let (name, metadata) = check_source(src)?;
    let is_dir = metadata.is_dir();
    let target = dest.join(name);
    guard_write(&target.to_string_lossy())?;
    if !rename_on_conflict && std::fs::symlink_metadata(&target).is_ok() {
        return Err(already_exists(target.display()));
    }
    if is_dir && dest.starts_with(std::fs::canonicalize(src)?) {
        return Err(invalid("cannot copy a folder into itself"));
    }

    // Same-directory staging keeps the publish a single rename on one volume.
    let staging = tempfile::Builder::new()
        .prefix(STAGING_PREFIX)
        .tempdir_in(dest)?;
    let staged = staging.path().join(STAGED_ITEM);
    let result = copy_recursive(src, &staged, 0).and_then(|()| {
        publish(
            &staged,
            dest,
            name,
            is_dir,
            rename_on_conflict,
            rename_no_replace,
        )
    });
    if let Err(error) = staging.close() {
        log::warn!(
            "fs_copy: could not remove staging {}: {error}",
            staged.parent().unwrap_or(dest).display()
        );
    }
    result
}

fn publish(
    staged: &Path,
    dest: &Path,
    name: &OsStr,
    is_dir: bool,
    rename_on_conflict: bool,
    rename: impl Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<OsString> {
    for candidate in copy_candidates(name, is_dir) {
        let target = dest.join(&candidate);
        guard_write(&target.to_string_lossy())?;
        match place(staged, &target, is_dir, &rename) {
            Ok(()) => return Ok(candidate),
            Err(error) if is_taken(&error, &target) => {
                if !rename_on_conflict {
                    return Err(already_exists(target.display()));
                }
            }
            Err(error) => return Err(error),
        }
    }
    Err(no_free_copy_name())
}

fn place(
    staged: &Path,
    target: &Path,
    is_dir: bool,
    rename: &impl Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    match rename(staged, target) {
        Err(error) if is_unsupported(&error) => place_reserved(staged, target, is_dir),
        other => other,
    }
}

// Filesystems without a no-replace rename (exFAT, SMB): claim the name
// exclusively first, then rename over our own empty placeholder.
fn place_reserved(staged: &Path, target: &Path, is_dir: bool) -> io::Result<()> {
    if is_dir {
        std::fs::create_dir(target)?;
    } else {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)?;
    }
    std::fs::rename(staged, target).inspect_err(|_| {
        let _ = if is_dir {
            std::fs::remove_dir(target)
        } else {
            std::fs::remove_file(target)
        };
    })
}

fn is_taken(error: &io::Error, target: &Path) -> bool {
    // Windows reports an existing directory target as AccessDenied.
    error.kind() == io::ErrorKind::AlreadyExists
        || (cfg!(windows) && std::fs::symlink_metadata(target).is_ok())
}

#[cfg(target_os = "macos")]
const NO_REPLACE_UNSUPPORTED: Option<i32> = Some(libc::ENOTSUP);
#[cfg(target_os = "linux")]
const NO_REPLACE_UNSUPPORTED: Option<i32> = Some(libc::EINVAL);
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
const NO_REPLACE_UNSUPPORTED: Option<i32> = None;

fn is_unsupported(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::Unsupported
        || (NO_REPLACE_UNSUPPORTED.is_some() && error.raw_os_error() == NO_REPLACE_UNSUPPORTED)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn c_path(path: &Path) -> io::Result<std::ffi::CString> {
    use std::os::unix::ffi::OsStrExt;
    std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|_| invalid("path contains a NUL byte"))
}

#[cfg(target_os = "macos")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    let from = c_path(from)?;
    let to = c_path(to)?;
    let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "linux")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    let from = c_path(from)?;
    let to = c_path(to)?;
    let result = unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            from.as_ptr(),
            libc::AT_FDCWD,
            to.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(target_os = "windows")]
fn rename_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};

    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) };
    if result != 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn rename_no_replace(_from: &Path, _to: &Path) -> io::Result<()> {
    Err(io::ErrorKind::Unsupported.into())
}

fn copy_recursive(src: &Path, dst: &Path, depth: usize) -> io::Result<()> {
    check_depth(depth)?;
    let metadata = std::fs::symlink_metadata(src)?;
    let kind = metadata.file_type();
    if kind.is_symlink() {
        copy_symlink(src, dst)
    } else if kind.is_dir() {
        std::fs::create_dir(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            guard_read(&entry.path())?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()), depth + 1)?;
        }
        Ok(())
    } else if kind.is_file() {
        // `dst` sits in our fresh staging dir, so this cannot follow a planted
        // link; std::fs::copy clones on APFS instead of streaming bytes.
        std::fs::copy(src, dst).map(|_| ())
    } else {
        Err(unsupported_kind())
    }
}

#[cfg(unix)]
fn copy_symlink(src: &Path, dst: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(std::fs::read_link(src)?, dst)
}

#[cfg(windows)]
fn copy_symlink(src: &Path, dst: &Path) -> io::Result<()> {
    use std::os::windows::fs::{symlink_dir, symlink_file, FileTypeExt};
    let target = std::fs::read_link(src)?;
    if std::fs::symlink_metadata(src)?.file_type().is_symlink_dir() {
        symlink_dir(target, dst)
    } else {
        symlink_file(target, dst)
    }
}

#[cfg(not(any(unix, windows)))]
fn copy_symlink(_src: &Path, _dst: &Path) -> io::Result<()> {
    Err(io::ErrorKind::Unsupported.into())
}

/// Finder naming: ` copy`, then ` copy n`; only the last extension is kept
/// apart, folders and extensionless names (dotfiles too) get a plain suffix.
fn copy_name(name: &OsStr, n: usize, is_dir: bool) -> OsString {
    let path = Path::new(name);
    let (stem, ext) = match (is_dir, path.file_stem(), path.extension()) {
        (false, Some(stem), Some(ext)) => (stem, Some(ext)),
        _ => (name, None),
    };
    let mut out = stem.to_os_string();
    if n == 1 {
        out.push(" copy");
    } else {
        out.push(format!(" copy {n}"));
    }
    if let Some(ext) = ext {
        out.push(".");
        out.push(ext);
    }
    out
}

/// A `git init` repo whose `.gitignore` whitelists every folder and `.txt`
/// file, with a staging rest and a control file, both matching `needle`.
#[cfg(test)]
pub(crate) fn whitelist_repo_with_staging_rest() -> tempfile::TempDir {
    let repo = tempfile::tempdir().unwrap();
    let status = std::process::Command::new("git")
        .args(["init", "-q"])
        .current_dir(repo.path())
        .status()
        .expect("git is required for the whitelist fixture");
    assert!(status.success(), "git init failed");
    std::fs::write(repo.path().join(".gitignore"), "*\n!*/\n!*.txt\n").unwrap();
    for rel in [".terax-copy-x/src/report.txt", "src/other.txt"] {
        let path = repo.path().join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "needle\n").unwrap();
    }
    std::fs::create_dir(repo.path().join(".hidden")).unwrap();
    repo
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(path: impl AsRef<Path>) -> String {
        to_canon(path)
    }

    fn reg_for(dir: &Path) -> WorkspaceRegistry {
        let reg = WorkspaceRegistry::default();
        reg.authorize(dir).expect("authorize tempdir root");
        reg
    }

    fn copy(sources: &[PathBuf], dest: &Path, rename: bool) -> CopyResult {
        copy_batch(
            sources.iter().map(s).collect(),
            &s(dest),
            &WorkspaceEnv::Local,
            &reg_for(dest),
            rename,
        )
        .unwrap()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }

    fn no_staging_left(dir: &Path) -> bool {
        !names(dir).iter().any(|n| is_staging_name(n))
    }

    #[test]
    fn names_follow_the_finder() {
        let name = |n: &str, i, dir| copy_name(OsStr::new(n), i, dir);
        assert_eq!(name("a.txt", 1, false), "a copy.txt");
        assert_eq!(name("a.txt", 2, false), "a copy 2.txt");
        assert_eq!(name("archive.tar.gz", 1, false), "archive.tar copy.gz");
        assert_eq!(name("Makefile", 3, false), "Makefile copy 3");
        assert_eq!(name(".env", 1, false), ".env copy");
        assert_eq!(name("report", 1, false), "report copy");
        assert_eq!(name("v1.2", 1, true), "v1.2 copy");
        assert_eq!(name("a.txt", 10_000, false), "a copy 10000.txt");
    }

    #[test]
    fn staging_predicate_matches_only_the_prefix() {
        assert!(is_staging_name(".terax-copy-abc"));
        assert!(is_staging_name(STAGING_PREFIX));
        assert!(!is_staging_name(".terax-copyright.md"));
        assert!(!is_staging_name("x.terax-copy-abc"));
    }

    #[test]
    fn copy_brings_file_and_dir_in_and_creates_a_copy_instead_of_clobbering() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("a.txt"), b"payload").unwrap();
        std::fs::create_dir_all(src.path().join("d/inner")).unwrap();
        std::fs::write(src.path().join("d/inner/y.txt"), b"y").unwrap();

        let result = copy(
            &[src.path().join("a.txt"), src.path().join("d")],
            dest.path(),
            false,
        );
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        assert_eq!(
            result.created,
            [s(dest.path().join("a.txt")), s(dest.path().join("d"))]
        );
        assert_eq!(
            std::fs::read(dest.path().join("a.txt")).unwrap(),
            b"payload"
        );
        assert_eq!(
            std::fs::read(dest.path().join("d/inner/y.txt")).unwrap(),
            b"y"
        );
        assert!(src.path().join("a.txt").exists());

        std::fs::write(dest.path().join("a.txt"), b"old").unwrap();
        let refused = copy(&[src.path().join("a.txt")], dest.path(), false);
        assert!(refused.created.is_empty());
        assert!(refused.failed[0].message.contains("already exists"));

        let renamed = copy(&[src.path().join("a.txt")], dest.path(), true);
        assert_eq!(renamed.created, [s(dest.path().join("a copy.txt"))]);
        assert_eq!(std::fs::read(dest.path().join("a.txt")).unwrap(), b"old");
        assert_eq!(
            std::fs::read(dest.path().join("a copy.txt")).unwrap(),
            b"payload"
        );
        assert!(no_staging_left(dest.path()));
    }

    #[test]
    fn conflicts_get_finder_names_and_never_touch_existing_items() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        for file in [
            "a.txt",
            "archive.tar.gz",
            "Makefile",
            ".gitignore",
            "report",
        ] {
            std::fs::write(src.path().join(file), b"new").unwrap();
        }
        std::fs::create_dir(src.path().join("v1.2")).unwrap();
        for file in ["a.txt", "archive.tar.gz", "Makefile", ".gitignore"] {
            std::fs::write(dest.path().join(file), b"old").unwrap();
        }
        std::fs::create_dir(dest.path().join("v1.2")).unwrap();
        std::fs::create_dir(dest.path().join("report")).unwrap();

        let sources: Vec<PathBuf> = [
            "a.txt",
            "archive.tar.gz",
            "Makefile",
            ".gitignore",
            "v1.2",
            "report",
        ]
        .iter()
        .map(|n| src.path().join(n))
        .collect();
        let result = copy(&sources, dest.path(), true);
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        let expected: Vec<String> = [
            "a copy.txt",
            "archive.tar copy.gz",
            "Makefile copy",
            ".gitignore copy",
            "v1.2 copy",
            "report copy",
        ]
        .iter()
        .map(|n| s(dest.path().join(n)))
        .collect();
        assert_eq!(result.created, expected);

        let again = copy(&[src.path().join("a.txt")], dest.path(), true);
        assert_eq!(again.created, [s(dest.path().join("a copy 2.txt"))]);
        for file in ["a.txt", "archive.tar.gz", "Makefile", ".gitignore"] {
            assert_eq!(std::fs::read(dest.path().join(file)).unwrap(), b"old");
        }
        assert!(dest.path().join("report").is_dir());
        assert!(dest.path().join("v1.2").is_dir());
        assert!(no_staging_left(dest.path()));
    }

    #[test]
    fn exhausted_copy_names_fail_the_item_without_creating_anything() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("a.txt"), b"new").unwrap();
        for candidate in copy_candidates(OsStr::new("a.txt"), false) {
            std::fs::write(dest.path().join(candidate), b"").unwrap();
        }
        let before = names(dest.path()).len();
        let result = copy(&[src.path().join("a.txt")], dest.path(), true);
        assert!(result.created.is_empty());
        assert_eq!(result.failed[0].message, "no free copy name");
        assert_eq!(names(dest.path()).len(), before);
    }

    #[test]
    fn reports_partial_batch_success_and_continues_after_missing_sources() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("ok1.txt"), b"a").unwrap();
        std::fs::write(src.path().join("ok2.txt"), b"b").unwrap();
        let sources = [
            src.path().join("ok1.txt"),
            src.path().join("gone.txt"),
            src.path().join("ok2.txt"),
        ];
        let result = copy(&sources, dest.path(), true);
        assert_eq!(
            result.created,
            [
                s(dest.path().join("ok1.txt")),
                s(dest.path().join("ok2.txt"))
            ]
        );
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].source, s(src.path().join("gone.txt")));
        assert_eq!(result.created.len() + result.failed.len(), sources.len());
        assert_eq!(names(dest.path()), ["ok1.txt", "ok2.txt"]);
    }

    #[test]
    fn refuses_a_folder_into_itself_but_copies_the_rest() {
        let ws = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let folder = ws.path().join("src");
        std::fs::create_dir_all(folder.join("sub")).unwrap();
        std::fs::write(other.path().join("x.txt"), b"x").unwrap();
        for dest in [folder.clone(), folder.join("sub")] {
            let before = names(&dest);
            let result = copy(&[folder.clone(), other.path().join("x.txt")], &dest, true);
            assert_eq!(result.failed.len(), 1);
            assert_eq!(result.failed[0].message, "cannot copy a folder into itself");
            assert_eq!(result.created, [s(dest.join("x.txt"))]);
            let mut expected = before;
            expected.push("x.txt".into());
            expected.sort();
            assert_eq!(names(&dest), expected);
        }
        let result = copy(&[folder], ws.path(), true);
        assert!(result.failed.is_empty());
        assert!(ws.path().join("src copy/sub").is_dir());
    }

    #[test]
    fn rejects_relative_and_nameless_sources_per_item() {
        let dest = tempfile::tempdir().unwrap();
        let result = copy_batch(
            vec!["rel.txt".into(), "/".into()],
            &s(dest.path()),
            &WorkspaceEnv::Local,
            &reg_for(dest.path()),
            true,
        )
        .unwrap();
        let messages: Vec<&str> = result.failed.iter().map(|f| f.message.as_str()).collect();
        assert_eq!(
            messages,
            [
                "copy source must be absolute",
                "copy source has no filename"
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_fifo_source() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let fifo = src.path().join("pipe");
        let c = std::ffi::CString::new(fifo.to_string_lossy().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        let result = copy(&[fifo], dest.path(), true);
        assert_eq!(
            result.failed[0].message,
            "only files, folders and symbolic links can be copied"
        );
        assert!(names(dest.path()).is_empty());
    }

    #[test]
    fn batch_and_depth_limits_hold_at_both_edges() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let reg = reg_for(dest.path());
        let too_many = vec![s(src.path().join("x")); MAX_COPY_SOURCES + 1];
        for workspace in [
            WorkspaceEnv::Local,
            WorkspaceEnv::Ssh {
                host: "terax-no-such-host".into(),
            },
        ] {
            let err =
                copy_batch(too_many.clone(), &s(dest.path()), &workspace, &reg, true).unwrap_err();
            assert_eq!(err, "copy at most 1024 items at a time");
        }
        assert!(names(dest.path()).is_empty());

        let many: Vec<PathBuf> = (0..MAX_COPY_SOURCES)
            .map(|i| {
                let p = src.path().join(format!("f{i}"));
                std::fs::write(&p, b"").unwrap();
                p
            })
            .collect();
        let result = copy(&many, dest.path(), true);
        assert!(result.failed.is_empty());
        assert_eq!(result.created.len(), MAX_COPY_SOURCES);

        let nested = |root: &Path, levels: usize| {
            let mut p = root.to_path_buf();
            for _ in 0..levels {
                p.push("d");
            }
            std::fs::create_dir_all(&p).unwrap();
        };
        let ok = src.path().join("ok");
        let deep = src.path().join("deep");
        nested(&ok, MAX_COPY_DEPTH);
        nested(&deep, MAX_COPY_DEPTH + 1);
        let result = copy(&[ok, deep], dest.path(), true);
        assert_eq!(result.created, [s(dest.path().join("ok"))]);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(
            result.failed[0].message,
            "folder nesting exceeds the copy limit"
        );
        assert!(!dest.path().join("deep").exists());
        assert!(no_staging_left(dest.path()));
    }

    #[cfg(unix)]
    #[test]
    fn a_failure_inside_a_folder_leaves_neither_the_folder_nor_staging() {
        use std::os::unix::fs::PermissionsExt;
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let big = src.path().join("big");
        std::fs::create_dir(&big).unwrap();
        for i in 0..5 {
            std::fs::write(big.join(format!("{i}.txt")), b"x").unwrap();
        }
        let locked = big.join("2.txt");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        let readable = std::fs::File::open(&locked).is_ok();
        let result = copy(std::slice::from_ref(&big), dest.path(), true);
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o644)).unwrap();
        if readable {
            return;
        }
        assert!(result.created.is_empty());
        assert_eq!(result.failed[0].source, s(&big));
        assert!(names(dest.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn unsupported_nested_entries_leave_no_partial_directory() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::create_dir(src.path().join("d")).unwrap();
        std::fs::write(src.path().join("d/a"), b"a").unwrap();
        let _socket = std::os::unix::net::UnixListener::bind(src.path().join("d/socket")).unwrap();
        let result = copy(&[src.path().join("d")], dest.path(), true);
        assert!(result.created.is_empty());
        assert_eq!(result.failed.len(), 1);
        assert!(names(dest.path()).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_copied_as_links_and_never_followed() {
        use std::os::unix::fs::symlink;
        let base = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let pkg = base.path().join("pkg");
        std::fs::create_dir(&pkg).unwrap();
        std::fs::create_dir(base.path().join("outside")).unwrap();
        std::fs::write(base.path().join("outside/secret"), b"s").unwrap();
        symlink("../outside", pkg.join("link")).unwrap();
        symlink(".", pkg.join("cycle")).unwrap();
        let result = copy(&[pkg], dest.path(), true);
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        let link = dest.path().join("pkg/link");
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read_link(&link).unwrap(), Path::new("../outside"));
        assert_eq!(
            std::fs::read_link(dest.path().join("pkg/cycle")).unwrap(),
            Path::new(".")
        );
        assert!(!dest.path().join("outside").exists());
    }

    // FS-5 under CopyResult: a dangling symlink at the destination is never
    // written through, with or without conflict renaming.
    #[cfg(unix)]
    #[test]
    fn copy_refuses_prestaged_dangling_symlink_at_dest() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("a.txt"), b"payload").unwrap();
        let victim = outside.path().join("victim");
        std::os::unix::fs::symlink(&victim, dest.path().join("a.txt")).unwrap();

        let renamed = copy(&[src.path().join("a.txt")], dest.path(), true);
        assert_eq!(renamed.created, [s(dest.path().join("a copy.txt"))]);
        let refused = copy(&[src.path().join("a.txt")], dest.path(), false);
        assert!(refused.created.is_empty());
        assert!(refused.failed[0].message.contains("already exists"));
        assert!(!victim.exists(), "must not write through the symlink");
    }

    #[test]
    fn the_deny_list_fails_secret_sources_and_destinations_per_item() {
        let src = tempfile::tempdir().unwrap();
        let ws = tempfile::tempdir().unwrap();
        let write = |rel: &str| {
            let path = src.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, b"PRIVATE").unwrap();
            path
        };
        let key = write("id_ed25519");
        let ssh_config = write(".ssh/config");
        write("pkg/readme.md");
        write("pkg/deploy/id_ed25519");
        let ok = write("ok.txt");

        let result = copy(
            &[key, ssh_config, src.path().join("pkg"), ok.clone()],
            ws.path(),
            true,
        );
        assert_eq!(result.created, [s(ws.path().join("ok.txt"))]);
        let messages: Vec<&str> = result.failed.iter().map(|f| f.message.as_str()).collect();
        assert_eq!(
            messages,
            [
                "refused: \"id_ed25519\" matches a sensitive-file pattern",
                "refused: path is inside a protected directory (.ssh)",
                "refused: \"id_ed25519\" matches a sensitive-file pattern",
            ]
        );
        assert_eq!(names(ws.path()), ["ok.txt"]);

        let protected = ws.path().join(".ssh");
        std::fs::create_dir(&protected).unwrap();
        let result = copy(&[ok], &protected, true);
        assert!(result.created.is_empty());
        assert_eq!(
            result.failed[0].message,
            "refused: path is inside a protected directory (.ssh)"
        );
        assert!(names(&protected).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_parent_cannot_hide_a_protected_source() {
        let outside = tempfile::tempdir().unwrap();
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::create_dir(outside.path().join(".ssh")).unwrap();
        std::fs::write(outside.path().join(".ssh/config"), b"Host real").unwrap();
        std::os::unix::fs::symlink(outside.path().join(".ssh"), src.path().join("assets")).unwrap();
        let result = copy(&[src.path().join("assets/config")], dest.path(), true);
        assert!(result.created.is_empty());
        assert!(
            result.failed[0].message.contains("protected directory"),
            "{:?}",
            result.failed
        );
        assert!(names(dest.path()).is_empty());
    }

    #[test]
    fn copy_rejects_unauthorized_or_non_directory_dest() {
        let src = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let allowed = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        std::fs::write(src.path().join("a.txt"), b"payload").unwrap();
        std::fs::write(allowed.path().join("readme.md"), b"r").unwrap();
        let sources = vec![s(src.path().join("a.txt"))];

        let err = copy_batch(
            sources.clone(),
            &s(foreign.path()),
            &WorkspaceEnv::Local,
            &reg,
            true,
        )
        .unwrap_err();
        assert!(
            err.contains("outside the authorized workspace"),
            "got: {err}"
        );
        assert!(names(foreign.path()).is_empty());

        let err = copy_batch(
            sources,
            &s(allowed.path().join("readme.md")),
            &WorkspaceEnv::Local,
            &reg,
            true,
        )
        .unwrap_err();
        assert_eq!(err, "copy destination is not a directory");
        assert_eq!(names(allowed.path()), ["readme.md"]);
    }

    #[test]
    fn long_names_and_deep_trees_fail_alone_with_the_os_reason() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let fits = format!("{}.txt", "a".repeat(246));
        let overflows = format!("{}.txt", "b".repeat(247));
        for name in [&fits, &overflows] {
            std::fs::write(src.path().join(name), b"new").unwrap();
            std::fs::write(dest.path().join(name), b"old").unwrap();
        }
        std::fs::write(src.path().join("x.txt"), b"x").unwrap();
        // Fits macOS PATH_MAX (1024) at the source, overflows it once staged.
        let tree = src.path().join("tree");
        let mut deep = tree.clone();
        while s(&deep).len() < 1010 {
            let room = 1009 - s(&deep).len();
            deep.push("s".repeat(room.clamp(1, 100)));
        }
        std::fs::create_dir_all(&deep).unwrap();

        let result = copy(
            &[
                src.path().join(&fits),
                src.path().join(&overflows),
                tree.clone(),
                src.path().join("x.txt"),
            ],
            dest.path(),
            true,
        );
        let copied = format!("{} copy.txt", "a".repeat(246));
        assert_eq!(copied.len(), 255);
        assert!(result.created.contains(&s(dest.path().join(&copied))));
        assert!(result.created.contains(&s(dest.path().join("x.txt"))));
        let failed: Vec<&str> = result.failed.iter().map(|f| f.source.as_str()).collect();
        assert!(failed.contains(&s(src.path().join(&overflows)).as_str()));
        if cfg!(target_os = "macos") {
            assert!(failed.contains(&s(&tree).as_str()), "{:?}", result.failed);
            assert!(!dest.path().join("tree").exists());
        }
        for name in [&fits, &overflows] {
            assert_eq!(std::fs::read(dest.path().join(name)).unwrap(), b"old");
        }
        assert!(no_staging_left(dest.path()));
    }

    #[test]
    fn case_insensitive_targets_count_as_taken() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("a.txt"), b"new").unwrap();
        std::fs::write(dest.path().join("A.txt"), b"old").unwrap();
        let insensitive = dest.path().join("a.txt").exists();
        let result = copy(&[src.path().join("a.txt")], dest.path(), true);
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        let expected = if insensitive { "a copy.txt" } else { "a.txt" };
        assert_eq!(result.created, [s(dest.path().join(expected))]);
        assert_eq!(std::fs::read(dest.path().join("A.txt")).unwrap(), b"old");
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn unsupported_rename_falls_back_to_reservation_and_eexist_moves_on() {
        let unsupported = NO_REPLACE_UNSUPPORTED.unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(dest.path().join("a.txt"), b"old").unwrap();
        let stage = |body: &[u8]| {
            let staged = dest.path().join(format!("{STAGING_PREFIX}t"));
            std::fs::write(&staged, body).unwrap();
            staged
        };

        let staged = stage(b"one");
        let name = publish(
            &staged,
            dest.path(),
            OsStr::new("a.txt"),
            false,
            true,
            |_, _| Err(io::Error::from_raw_os_error(unsupported)),
        )
        .unwrap();
        assert_eq!(name, "a copy.txt");
        assert_eq!(
            std::fs::read(dest.path().join("a copy.txt")).unwrap(),
            b"one"
        );

        let staged = stage(b"two");
        let calls = std::cell::Cell::new(0);
        let name = publish(
            &staged,
            dest.path(),
            OsStr::new("b.txt"),
            false,
            true,
            |from, to| {
                calls.set(calls.get() + 1);
                if calls.get() == 1 {
                    Err(io::Error::from_raw_os_error(libc::EEXIST))
                } else {
                    rename_no_replace(from, to)
                }
            },
        )
        .unwrap();
        assert_eq!(name, "b copy.txt");
        assert!(!dest.path().join("b.txt").exists());

        let staged_dir = dest.path().join(format!("{STAGING_PREFIX}d"));
        std::fs::create_dir(&staged_dir).unwrap();
        std::fs::create_dir(dest.path().join("v")).unwrap();
        std::fs::write(dest.path().join("v/keep"), b"k").unwrap();
        let name = publish(
            &staged_dir,
            dest.path(),
            OsStr::new("v"),
            true,
            true,
            |_, _| Err(io::Error::from_raw_os_error(unsupported)),
        )
        .unwrap();
        assert_eq!(name, "v copy");
        assert_eq!(std::fs::read(dest.path().join("v/keep")).unwrap(), b"k");
        assert_eq!(std::fs::read(dest.path().join("a.txt")).unwrap(), b"old");
        assert!(no_staging_left(dest.path()));
    }

    #[test]
    fn concurrent_publishes_choose_distinct_names_without_clobbering() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(src.path().join("a.txt"), b"source").unwrap();
        let barrier = std::sync::Barrier::new(4);
        let results = std::thread::scope(|scope| {
            let threads: Vec<_> = (0..4)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        copy(&[src.path().join("a.txt")], dest.path(), true)
                    })
                })
                .collect();
            threads
                .into_iter()
                .map(|thread| thread.join().unwrap())
                .collect::<Vec<_>>()
        });
        let mut paths = std::collections::HashSet::new();
        for result in results {
            assert!(result.failed.is_empty());
            assert!(paths.insert(result.created[0].clone()));
        }
        assert_eq!(names(dest.path()).len(), 4);
    }
}
