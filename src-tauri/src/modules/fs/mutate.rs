use std::path::{Component, Path};

use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

fn outside_workspace(p: &Path) -> String {
    format!("path is outside the authorized workspace: {}", p.display())
}

/// Root-jail for local filesystem mutations. `dir` is the directory the mutation
/// writes into (the parent of a created/renamed/deleted entry, or a copy
/// destination). We walk up to the nearest *existing* ancestor — intermediate
/// dirs of a `create_dir_all` chain and the entry itself need not exist yet —
/// and canonicalize it so a symlinked component or `..` traversal can't escape
/// the authorized roots. Authorizing the containing directory (never the final
/// component) means deleting or renaming a symlink is judged by where the link
/// lives, not where it points.
///
/// SSH mutations never reach here: the commands early-return to the remote
/// helper, whose reach is bounded by the host account, not this registry (an
/// accepted trust-the-host-account limit — see `workspace_authorize`).
fn authorize_mutation_dir(
    registry: &WorkspaceRegistry,
    dir: Option<&Path>,
    label: &Path,
) -> Result<(), String> {
    // A `..` component would let `create_dir_all` materialize a real directory
    // inside the jail and then traverse out through it (the nearest-existing
    // ancestor walk authorizes the syntactic root, but the OS resolves `..`
    // against the freshly created dirs). The file tree never emits `..`, so
    // reject traversal outright instead of trying to reason about it.
    if label.components().any(|c| c == Component::ParentDir) {
        return Err(outside_workspace(label));
    }
    let mut cur = dir;
    let canonical = loop {
        let Some(d) = cur.filter(|p| !p.as_os_str().is_empty()) else {
            return Err(outside_workspace(label));
        };
        if let Ok(c) = std::fs::canonicalize(d) {
            break c;
        }
        cur = d.parent();
    };
    if !registry.is_authorized(&canonical) {
        return Err(outside_workspace(label));
    }
    Ok(())
}

/// Creates a new empty file. Fails if the file already exists.
#[tauri::command]
pub fn fs_create_file(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_create_file_impl(path, workspace, &registry)
}

fn fs_create_file_impl(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::create_file(host, &path);
    }
    let p = resolve_path(&path, &workspace);
    authorize_mutation_dir(registry, p.parent(), &p)?;
    if p.exists() {
        return Err(format!("already exists: {}", p.display()));
    }
    std::fs::write(&p, "").map_err(|e| {
        log::debug!("fs_create_file({}) failed: {e}", p.display());
        e.to_string()
    })
}

/// Creates a new directory. Fails if the directory already exists.
/// Parents are created as needed — matches the common "new folder" UX
/// where typing "a/b/c" creates the full chain.
#[tauri::command]
pub fn fs_create_dir(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_create_dir_impl(path, workspace, &registry)
}

fn fs_create_dir_impl(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::create_dir(host, &path);
    }
    let p = resolve_path(&path, &workspace);
    authorize_mutation_dir(registry, p.parent(), &p)?;
    if p.exists() {
        return Err(format!("already exists: {}", p.display()));
    }
    std::fs::create_dir_all(&p).map_err(|e| {
        log::debug!("fs_create_dir({}) failed: {e}", p.display());
        e.to_string()
    })
}

/// Renames (or moves) a path. Refuses to overwrite an existing target.
#[tauri::command]
pub fn fs_rename(
    from: String,
    to: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_rename_impl(from, to, workspace, &registry)
}

fn fs_rename_impl(
    from: String,
    to: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::rename(host, &from, &to);
    }
    let from_p = resolve_path(&from, &workspace);
    let to_p = resolve_path(&to, &workspace);
    authorize_mutation_dir(registry, from_p.parent(), &from_p)?;
    authorize_mutation_dir(registry, to_p.parent(), &to_p)?;
    if !from_p.exists() {
        return Err(format!("not found: {}", from_p.display()));
    }
    if to_p.exists() {
        return Err(format!("already exists: {}", to_p.display()));
    }
    std::fs::rename(&from_p, &to_p).map_err(|e| {
        log::debug!(
            "fs_rename({} -> {}) failed: {e}",
            from_p.display(),
            to_p.display()
        );
        e.to_string()
    })
}

/// Deletes a file or directory (recursively for dirs). Callers are
/// responsible for confirming destructive operations with the user.
#[tauri::command]
pub fn fs_delete(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_delete_impl(path, workspace, &registry)
}

fn fs_delete_impl(
    path: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::delete(host, &path);
    }
    let p = resolve_path(&path, &workspace);
    authorize_mutation_dir(registry, p.parent(), &p)?;
    let meta = std::fs::symlink_metadata(&p).map_err(|e| {
        log::debug!("fs_delete stat({}) failed: {e}", p.display());
        e.to_string()
    })?;

    let result = if meta.is_dir() {
        std::fs::remove_dir_all(&p)
    } else {
        std::fs::remove_file(&p)
    };

    result.map_err(|e| {
        log::warn!("fs_delete({}) failed: {e}", p.display());
        e.to_string()
    })
}

fn copy_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(src, dst).map(|_| ())
    }
}

/// Copies external files/dirs into a destination directory, recursively for
/// dirs. Sources are absolute OS paths (from a drag-drop); only the destination
/// is workspace-resolved. Refuses to overwrite existing entries.
#[tauri::command]
pub fn fs_copy(
    sources: Vec<String>,
    dest_dir: String,
    workspace: Option<WorkspaceEnv>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<(), String> {
    fs_copy_impl(sources, dest_dir, workspace, &registry)
}

fn fs_copy_impl(
    sources: Vec<String>,
    dest_dir: String,
    workspace: Option<WorkspaceEnv>,
    registry: &WorkspaceRegistry,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::copy(host, &sources, &dest_dir);
    }
    let dest = resolve_path(&dest_dir, &workspace);
    // Only the destination is jailed; sources are arbitrary local paths the user
    // picked to bring INTO the workspace (drag-drop), so they stay unconstrained.
    authorize_mutation_dir(registry, Some(&dest), &dest)?;
    for source in &sources {
        let src = std::path::PathBuf::from(source);
        let name = src
            .file_name()
            .ok_or_else(|| format!("invalid source: {source}"))?;
        let target = dest.join(name);
        if target.exists() {
            return Err(format!("already exists: {}", target.display()));
        }
        copy_recursive(&src, &target).map_err(|e| {
            log::warn!(
                "fs_copy({} -> {}) failed: {e}",
                src.display(),
                target.display()
            );
            e.to_string()
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(p: std::path::PathBuf) -> String {
        p.to_string_lossy().into_owned()
    }

    // A registry that authorizes `dir` as a workspace root, mirroring how the
    // app bootstraps the home directory. The mutation commands are jailed to
    // authorized roots, so every test that drives a real mutation needs one.
    fn reg_for(dir: &Path) -> WorkspaceRegistry {
        let reg = WorkspaceRegistry::default();
        reg.authorize(dir).expect("authorize tempdir root");
        reg
    }

    #[test]
    fn create_file_makes_empty_and_refuses_to_clobber() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("new.txt");
        fs_create_file_impl(s(f.clone()), None, &reg).expect("create");
        assert!(f.exists());
        assert_eq!(std::fs::read(&f).unwrap(), b"");

        // A second create must error, not truncate existing content.
        std::fs::write(&f, b"data").unwrap();
        let err = fs_create_file_impl(s(f.clone()), None, &reg).unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");
        assert_eq!(std::fs::read(&f).unwrap(), b"data");
    }

    #[test]
    fn create_dir_builds_nested_chain_and_refuses_existing() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let nested = dir.path().join("a/b/c");
        fs_create_dir_impl(s(nested.clone()), None, &reg).expect("create dir");
        assert!(nested.is_dir());
        let err = fs_create_dir_impl(s(nested), None, &reg).unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");
    }

    #[test]
    fn rename_moves_and_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let from = dir.path().join("a.txt");
        let to = dir.path().join("b.txt");
        std::fs::write(&from, b"payload").unwrap();

        fs_rename_impl(s(from.clone()), s(to.clone()), None, &reg).expect("rename");
        assert!(!from.exists());
        assert_eq!(std::fs::read(&to).unwrap(), b"payload");

        // Missing source is reported, not silently ignored.
        let err =
            fs_rename_impl(s(from), s(dir.path().join("c.txt")), None, &reg).unwrap_err();
        assert!(err.contains("not found"), "got: {err}");

        // Refusing to overwrite an existing target is the data-loss guard.
        let occupied = dir.path().join("keep.txt");
        std::fs::write(&occupied, b"keep").unwrap();
        let err =
            fs_rename_impl(s(to.clone()), s(occupied.clone()), None, &reg).unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");
        assert_eq!(std::fs::read(&occupied).unwrap(), b"keep");
        assert!(to.exists());
    }

    #[test]
    fn copy_brings_file_and_dir_in_and_refuses_clobber() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let reg = reg_for(dest.path());
        std::fs::write(src.path().join("a.txt"), b"payload").unwrap();
        std::fs::create_dir_all(src.path().join("d/inner")).unwrap();
        std::fs::write(src.path().join("d/inner/y.txt"), b"y").unwrap();

        fs_copy_impl(
            vec![s(src.path().join("a.txt")), s(src.path().join("d"))],
            s(dest.path().to_path_buf()),
            None,
            &reg,
        )
        .expect("copy");

        assert_eq!(
            std::fs::read(dest.path().join("a.txt")).unwrap(),
            b"payload"
        );
        assert_eq!(
            std::fs::read(dest.path().join("d/inner/y.txt")).unwrap(),
            b"y"
        );
        // copy, not move: the source survives.
        assert!(src.path().join("a.txt").exists());

        let err = fs_copy_impl(
            vec![s(src.path().join("a.txt"))],
            s(dest.path().to_path_buf()),
            None,
            &reg,
        )
        .unwrap_err();
        assert!(err.contains("already exists"), "got: {err}");
    }

    #[test]
    fn delete_removes_file_then_dir_recursively() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let f = dir.path().join("x.txt");
        std::fs::write(&f, b"x").unwrap();
        fs_delete_impl(s(f.clone()), None, &reg).expect("delete file");
        assert!(!f.exists());

        let sub = dir.path().join("sub");
        std::fs::create_dir_all(sub.join("inner")).unwrap();
        std::fs::write(sub.join("inner/y.txt"), b"y").unwrap();
        fs_delete_impl(s(sub.clone()), None, &reg).expect("delete dir");
        assert!(!sub.exists());

        let err = fs_delete_impl(s(dir.path().join("missing")), None, &reg).unwrap_err();
        assert!(!err.is_empty());
    }

    // Deleting a symlink that points at a directory must remove only the link,
    // never recurse through it and wipe the target's contents.
    #[cfg(unix)]
    #[test]
    fn delete_does_not_follow_symlink_into_target() {
        let dir = tempfile::tempdir().unwrap();
        let reg = reg_for(dir.path());
        let real = dir.path().join("real");
        std::fs::create_dir(&real).unwrap();
        std::fs::write(real.join("keep.txt"), b"keep").unwrap();

        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        fs_delete_impl(s(link.clone()), None, &reg).expect("delete symlink");
        assert!(!link.exists(), "symlink itself should be gone");
        assert!(real.is_dir(), "target dir must survive");
        assert_eq!(std::fs::read(real.join("keep.txt")).unwrap(), b"keep");
    }

    // --- root-jail (F42) ---

    #[test]
    fn create_rejects_path_outside_authorized_root() {
        let allowed = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let target = foreign.path().join("evil.txt");
        let err = fs_create_file_impl(s(target.clone()), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        assert!(!target.exists(), "file must not have been created");
    }

    #[test]
    fn create_dir_rejects_path_outside_authorized_root() {
        let allowed = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let target = foreign.path().join("evil/sub");
        let err = fs_create_dir_impl(s(target.clone()), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        assert!(!target.exists());
    }

    #[test]
    fn rename_rejects_unauthorized_target() {
        let allowed = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let from = allowed.path().join("a.txt");
        std::fs::write(&from, b"payload").unwrap();
        let to = foreign.path().join("a.txt");
        let err = fs_rename_impl(s(from.clone()), s(to.clone()), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        // The source must be untouched — no half-move.
        assert!(from.exists());
        assert!(!to.exists());
    }

    #[test]
    fn delete_rejects_path_outside_authorized_root() {
        let allowed = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let victim = foreign.path().join("keep.txt");
        std::fs::write(&victim, b"keep").unwrap();
        let err = fs_delete_impl(s(victim.clone()), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        assert!(victim.exists(), "file outside the jail must survive");
    }

    #[test]
    fn copy_rejects_unauthorized_dest() {
        let src = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let allowed = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        std::fs::write(src.path().join("a.txt"), b"payload").unwrap();
        let err = fs_copy_impl(
            vec![s(src.path().join("a.txt"))],
            s(foreign.path().to_path_buf()),
            None,
            &reg,
        )
        .unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
        assert!(!foreign.path().join("a.txt").exists());
    }

    // `..` in the target must be rejected: otherwise create_dir_all would build
    // a real dir inside the root and then traverse out through it.
    #[test]
    fn rejects_dotdot_traversal_out_of_root() {
        let allowed = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let dir_escape = allowed
            .path()
            .join("sub")
            .join("..")
            .join("..")
            .join("etc")
            .join("evil");
        let err = fs_create_dir_impl(s(dir_escape.clone()), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");

        let file_escape = allowed.path().join("..").join("evil.txt");
        let err = fs_create_file_impl(s(file_escape), None, &reg).unwrap_err();
        assert!(err.contains("outside the authorized workspace"), "got: {err}");
    }

    // A symlink that lives inside the jail but points outside it can still be
    // deleted — we judge the link by where it lives, not where it points, and
    // never follow it (symlink_metadata), so the external target is untouched.
    #[cfg(unix)]
    #[test]
    fn delete_symlink_inside_jail_pointing_outside_is_allowed() {
        let allowed = tempfile::tempdir().unwrap();
        let foreign = tempfile::tempdir().unwrap();
        let reg = reg_for(allowed.path());
        let outside_target = foreign.path().join("secret.txt");
        std::fs::write(&outside_target, b"secret").unwrap();

        let link = allowed.path().join("link");
        std::os::unix::fs::symlink(&outside_target, &link).unwrap();

        fs_delete_impl(s(link.clone()), None, &reg).expect("delete in-jail symlink");
        assert!(!link.exists(), "the link must be gone");
        assert!(outside_target.exists(), "the external target must survive");
        assert_eq!(std::fs::read(&outside_target).unwrap(), b"secret");
    }
}
