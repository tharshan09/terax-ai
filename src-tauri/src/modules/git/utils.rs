use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::modules::git::errors::{GitError, Result};
use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

#[derive(Clone, Debug)]
pub struct ResolvedGitDirectory {
    pub workspace: WorkspaceEnv,
    pub git_path: String,
    pub local_path: PathBuf,
}

pub fn split_upstream(upstream: &str) -> (Option<String>, Option<String>) {
    match upstream.split_once('/') {
        Some((remote, branch)) => (Some(remote.to_string()), Some(branch.to_string())),
        None => (None, Some(upstream.to_string())),
    }
}

pub fn display_path(path: &Path) -> String {
    crate::modules::fs::to_canon(path)
}

fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub fn canonical_dir(
    registry: &WorkspaceRegistry,
    path: &str,
    workspace: &WorkspaceEnv,
) -> Result<ResolvedGitDirectory> {
    // Remote workspace: never touch the local filesystem. `is_dir`/canonicalize
    // would resolve the remote path against the local machine (a meaningless or,
    // worse, same-named local directory); the remote `git rev-parse` is the real
    // existence check. `local_path` is synthetic and never used for FS on the ssh
    // branch — authorization and pathspec resolution both branch on `is_ssh`.
    if workspace.is_ssh() {
        let git_path = normalize_git_path(path);
        return Ok(ResolvedGitDirectory {
            workspace: workspace.clone(),
            local_path: PathBuf::from(&git_path),
            git_path,
        });
    }

    let candidate = resolve_path(path, workspace);
    if !candidate.is_dir() {
        return Err(GitError::NotADirectory(path.to_string()));
    }
    let local_path = registry
        .canonicalize_cached(&candidate)
        .map_err(GitError::Io)?;
    let git_path = if workspace.is_wsl() {
        normalize_git_path(path)
    } else {
        display_path(&local_path)
    };
    Ok(ResolvedGitDirectory {
        workspace: workspace.clone(),
        git_path,
        local_path,
    })
}

pub fn authorized_repo_root(
    registry: &WorkspaceRegistry,
    path: &str,
    workspace: &WorkspaceEnv,
) -> Result<ResolvedGitDirectory> {
    let canonical = canonical_dir(registry, path, workspace)?;
    // The SSH workspace has no local authorization root to check against — git
    // runs entirely on the host and the connection itself is the capability
    // (the documented trust-the-host-account model). Skip the local registry.
    if canonical.workspace.is_ssh() {
        return Ok(canonical);
    }
    if !registry.is_authorized(&canonical.local_path) {
        return Err(GitError::PathOutsideWorkspace(canonical.local_path.clone()));
    }
    Ok(canonical)
}

/// Repo-relative, forward-slash pathspec for a frontend-supplied path. Local and
/// WSL canonicalize within the repo so a symlink/`..` can't escape (filesystem
/// check). SSH validates the string only — git runs on the remote, the path is
/// already repo-relative, and [`is_safe_pathspec`] rejects `..`/`.`/`:`/NUL and
/// control chars, so there is no local FS to consult.
pub fn repo_relative_pathspec(repo_root: &ResolvedGitDirectory, input: &str) -> Result<String> {
    if repo_root.workspace.is_ssh() {
        if !is_safe_pathspec(input) {
            return Err(GitError::InvalidPath(input.to_string()));
        }
        return Ok(input.replace('\\', "/"));
    }
    let resolved = resolve_within_repo(&repo_root.local_path, input)?;
    Ok(resolved
        .strip_prefix(&repo_root.local_path)
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| resolved.to_string_lossy().replace('\\', "/")))
}

pub fn resolve_within_repo(repo_root: &Path, rel: &str) -> Result<PathBuf> {
    if !is_safe_pathspec(rel) {
        return Err(GitError::InvalidPath(rel.into()));
    }
    let joined = repo_root.join(rel);
    match std::fs::canonicalize(&joined) {
        Ok(canonical) => {
            if !canonical.starts_with(repo_root) {
                return Err(GitError::PathOutsideWorkspace(canonical));
            }
            Ok(canonical)
        }
        // Deleted path (staging a removal): validate via nearest existing ancestor.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            resolve_deleted_within_repo(repo_root, &joined, rel)
        }
        Err(e) => Err(GitError::Io(e)),
    }
}

pub fn is_safe_pathspec(rel: &str) -> bool {
    if rel.is_empty() || rel.contains(':') || rel.contains('\0') {
        return false;
    }
    if rel.chars().any(|c| (c as u32) < 0x20) {
        return false;
    }
    // Reject `.`/`..` so the deleted-path branch can't be used to escape the repo.
    !rel.split(['/', '\\']).any(|c| c == "." || c == "..")
}

fn resolve_deleted_within_repo(repo_root: &Path, joined: &Path, rel: &str) -> Result<PathBuf> {
    let mut tail: Vec<&OsStr> = Vec::new();
    let mut cursor = joined;
    loop {
        let name = cursor
            .file_name()
            .ok_or_else(|| GitError::InvalidPath(rel.into()))?;
        let parent = cursor
            .parent()
            .ok_or_else(|| GitError::InvalidPath(rel.into()))?;
        tail.push(name);
        match std::fs::canonicalize(parent) {
            Ok(canonical_parent) => {
                if !canonical_parent.starts_with(repo_root) {
                    return Err(GitError::PathOutsideWorkspace(canonical_parent));
                }
                let mut resolved = canonical_parent;
                for component in tail.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                cursor = parent;
            }
            Err(e) => return Err(GitError::Io(e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_pathspec_accepts_normal_paths() {
        assert!(is_safe_pathspec("src/main.rs"));
        assert!(is_safe_pathspec("a/b/c-d_e.txt"));
        assert!(is_safe_pathspec("folder with spaces/file.md"));
        assert!(is_safe_pathspec("file.with.dots"));
    }

    #[test]
    fn safe_pathspec_rejects_colon() {
        assert!(!is_safe_pathspec("evil:path"));
        assert!(!is_safe_pathspec(":head"));
        assert!(!is_safe_pathspec("a/b:c"));
    }

    #[test]
    fn safe_pathspec_rejects_nul_and_control() {
        assert!(!is_safe_pathspec("foo\0bar"));
        assert!(!is_safe_pathspec("foo\nbar"));
        assert!(!is_safe_pathspec("foo\rbar"));
        assert!(!is_safe_pathspec("foo\tbar"));
    }

    #[test]
    fn safe_pathspec_rejects_empty() {
        assert!(!is_safe_pathspec(""));
    }

    #[test]
    fn resolve_within_repo_rejects_colon_path() {
        let tmp = std::env::temp_dir();
        let err = resolve_within_repo(&tmp, "evil:path");
        assert!(matches!(err, Err(GitError::InvalidPath(_))));
    }

    #[test]
    fn resolve_within_repo_rejects_nul_path() {
        let tmp = std::env::temp_dir();
        let err = resolve_within_repo(&tmp, "evil\0path");
        assert!(matches!(err, Err(GitError::InvalidPath(_))));
    }

    #[test]
    fn safe_pathspec_rejects_dot_components() {
        assert!(!is_safe_pathspec("../escape"));
        assert!(!is_safe_pathspec("a/../b"));
        assert!(!is_safe_pathspec("./a"));
        assert!(!is_safe_pathspec("a/."));
        assert!(!is_safe_pathspec(".."));
    }

    #[test]
    fn resolve_within_repo_handles_deleted_directory() {
        let base = std::env::temp_dir().join("terax_git_deleted_dir_test");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("envs/__pycache__")).unwrap();
        let repo_root = std::fs::canonicalize(&base).unwrap();
        std::fs::remove_dir_all(repo_root.join("envs")).unwrap();
        let resolved =
            resolve_within_repo(&repo_root, "envs/__pycache__/g1.pyc").expect("deleted path");
        assert_eq!(resolved, repo_root.join("envs/__pycache__/g1.pyc"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn resolve_within_repo_rejects_deleted_escape() {
        let tmp = std::env::temp_dir();
        let err = resolve_within_repo(&tmp, "../outside.txt");
        assert!(matches!(err, Err(GitError::InvalidPath(_))));
    }

    #[test]
    fn canonical_dir_ssh_skips_local_fs() {
        let registry = WorkspaceRegistry::default();
        let ws = WorkspaceEnv::Ssh {
            host: "litha-claude".into(),
        };
        // A remote path that does not exist locally must still resolve — no
        // is_dir()/canonicalize against the local machine.
        let resolved =
            canonical_dir(&registry, "/home/claude/repo", &ws).expect("ssh canonical_dir");
        assert_eq!(resolved.git_path, "/home/claude/repo");
        assert!(resolved.workspace.is_ssh());
        // Tilde is preserved verbatim (the remote shell expands it later).
        assert_eq!(canonical_dir(&registry, "~", &ws).unwrap().git_path, "~");
    }

    #[test]
    fn authorized_repo_root_ssh_skips_authorization() {
        let registry = WorkspaceRegistry::default(); // empty: nothing authorized
        let ws = WorkspaceEnv::Ssh {
            host: "litha-claude".into(),
        };
        // A local path here would be rejected (PathOutsideWorkspace); ssh trusts
        // the host account.
        let resolved =
            authorized_repo_root(&registry, "/srv/app", &ws).expect("ssh authorized_repo_root");
        assert_eq!(resolved.git_path, "/srv/app");
    }

    #[test]
    fn repo_relative_pathspec_ssh_validates_string_only() {
        let repo = ResolvedGitDirectory {
            workspace: WorkspaceEnv::Ssh { host: "h".into() },
            git_path: "/repo".into(),
            local_path: PathBuf::from("/repo"),
        };
        assert_eq!(
            repo_relative_pathspec(&repo, "src/main.rs").unwrap(),
            "src/main.rs"
        );
        assert_eq!(repo_relative_pathspec(&repo, "a\\b.txt").unwrap(), "a/b.txt");
        assert!(matches!(
            repo_relative_pathspec(&repo, "../escape"),
            Err(GitError::InvalidPath(_))
        ));
        assert!(matches!(
            repo_relative_pathspec(&repo, "a:b"),
            Err(GitError::InvalidPath(_))
        ));
    }
}
