use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Directory to open on the asset-protocol scope when previewing an HTML
/// document, so its relative CSS / JS / images resolve. We allow the file's own
/// parent directory, but never the filesystem root or the whole home directory:
/// otherwise a previewed page could read `~/.ssh` and friends back through the
/// asset origin (the exact hole the unrestricted `**` scope left open).
pub fn asset_dir_target(path: &Path, home: Option<&Path>) -> Option<PathBuf> {
    let parent = path.parent()?;
    // `parent.parent()` is `None` only for the filesystem root.
    if parent.parent().is_none() {
        return None;
    }
    if home.is_some_and(|h| parent == h) {
        return None;
    }
    Some(parent.to_path_buf())
}

/// Grant the asset protocol read access to a single previewed file and, for an
/// HTML document (`directory == true`), its containing directory so relative
/// resources load. The configured scope is empty, so a page reached via
/// `convertFileSrc` can only ever touch files explicitly opened for preview,
/// never an arbitrary absolute path such as `~/.ssh/id_rsa`.
#[tauri::command]
pub async fn asset_allow(app: AppHandle, path: String, directory: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let scope = app.asset_protocol_scope();
    scope.allow_file(&p).map_err(|e| e.to_string())?;
    if directory {
        if let Some(dir) = asset_dir_target(&p, dirs::home_dir().as_deref()) {
            scope
                .allow_directory(&dir, true)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_a_project_files_parent_directory() {
        let home = PathBuf::from("/home/u");
        let dir = asset_dir_target(Path::new("/home/u/proj/index.html"), Some(&home));
        assert_eq!(dir, Some(PathBuf::from("/home/u/proj")));
    }

    #[test]
    fn allows_a_nested_subdir_of_home() {
        let home = PathBuf::from("/home/u");
        let dir = asset_dir_target(Path::new("/home/u/sites/blog/a.html"), Some(&home));
        assert_eq!(dir, Some(PathBuf::from("/home/u/sites/blog")));
    }

    #[test]
    fn refuses_the_filesystem_root() {
        assert_eq!(asset_dir_target(Path::new("/index.html"), None), None);
    }

    #[test]
    fn refuses_the_home_directory_itself() {
        let home = PathBuf::from("/home/u");
        assert_eq!(
            asset_dir_target(Path::new("/home/u/page.html"), Some(&home)),
            None
        );
    }
}
