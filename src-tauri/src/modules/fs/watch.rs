use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::modules::fs::copy::is_staging_name;
use crate::modules::fs::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv, WorkspaceRegistry};

// Quiet-gap before a batch flushes; MAX_WINDOW caps latency under a long stream.
const DEBOUNCE: Duration = Duration::from_millis(150);
const MAX_WINDOW: Duration = Duration::from_millis(1000);

// Matched on the final path component. Never watched even when expanded: large
// or generated trees where live updates cost more than they're worth.
const SKIP_DIRS: &[&str] = &[
    // VCS
    ".git",
    ".hg",
    ".svn",
    ".jj",
    // JS / web
    "node_modules",
    "bower_components",
    ".pnpm-store",
    ".yarn",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".astro",
    ".vite",
    ".turbo",
    ".parcel-cache",
    ".angular",
    ".vercel",
    ".netlify",
    ".output",
    ".cache",
    // Rust
    "target",
    // Python
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".nox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".ipynb_checkpoints",
    ".eggs",
    // JVM / Gradle
    ".gradle",
    // .NET
    "obj",
    // Go / PHP
    "vendor",
    // Elixir
    "_build",
    "deps",
    // Dart / Flutter
    ".dart_tool",
    // Haskell
    "dist-newstyle",
    ".stack-work",
    // Swift / Zig
    ".build",
    "zig-cache",
    "zig-out",
    // CMake (CLion)
    "cmake-build-debug",
    "cmake-build-release",
    // IDE / coverage / infra
    ".idea",
    "coverage",
    ".nyc_output",
    ".terraform",
];

fn is_skipped(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| SKIP_DIRS.contains(&n))
}

type Watched<'a> = dyn Fn(&Path) -> bool + 'a;

// A copy in progress is invisible; only its publish under the real name is news.
// Only names below the watched folder count: the folder may sit under such a name.
fn in_staging(path: &Path, watched: &Watched) -> bool {
    let below = path
        .ancestors()
        .find(|dir| watched(dir))
        .and_then(|dir| path.strip_prefix(dir).ok())
        .unwrap_or(path);
    below
        .components()
        .any(|c| c.as_os_str().to_str().is_some_and(is_staging_name))
}

#[derive(Default)]
pub struct FsWatchState {
    inner: Mutex<Option<WatchInner>>,
}

impl FsWatchState {
    fn watches(&self, dir: &Path) -> bool {
        let guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        guard
            .as_ref()
            .is_some_and(|inner| inner.refcounts.contains_key(dir))
    }
}

struct WatchInner {
    watcher: RecommendedWatcher,
    // Explorer (expanded dirs) and editor (dirs of open files) can request the
    // same dir; unwatch only when the last requester releases it.
    refcounts: HashMap<PathBuf, usize>,
}

#[derive(Clone, serde::Serialize)]
struct ChangedPayload {
    paths: Vec<String>,
}

fn ensure_started(state: &FsWatchState, app: &AppHandle) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_some() {
        return Ok(());
    }

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let watcher = RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let app = app.clone();
    std::thread::Builder::new()
        .name("terax-fs-watch".into())
        .spawn(move || drain_loop(rx, app))
        .map_err(|e| e.to_string())?;

    *guard = Some(WatchInner {
        watcher,
        refcounts: HashMap::new(),
    });
    Ok(())
}

fn drain_loop(rx: mpsc::Receiver<notify::Result<Event>>, app: AppHandle) {
    let state = app.state::<FsWatchState>();
    let watched = |dir: &Path| state.watches(dir);
    loop {
        let first = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => return,
        };

        let mut paths: HashSet<String> = HashSet::new();
        collect(&mut paths, first, &watched);

        let deadline = Instant::now() + MAX_WINDOW;
        loop {
            let timeout = DEBOUNCE.min(deadline.saturating_duration_since(Instant::now()));
            match rx.recv_timeout(timeout) {
                Ok(ev) => collect(&mut paths, ev, &watched),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
            if Instant::now() >= deadline {
                break;
            }
        }

        if paths.is_empty() {
            continue;
        }
        let _ = app.emit(
            "fs:changed",
            ChangedPayload {
                paths: paths.into_iter().collect(),
            },
        );
    }
}

fn collect(set: &mut HashSet<String>, ev: notify::Result<Event>, watched: &Watched) {
    let Ok(ev) = ev else { return };
    if matches!(ev.kind, EventKind::Access(_)) {
        return;
    }
    for p in ev.paths.iter().filter(|p| !in_staging(p, watched)) {
        set.insert(to_canon(p));
    }
}

/// Returns the requested spellings now watched whose events carry that same
/// path: events always name the canonical one.
fn add_paths(inner: &mut WatchInner, paths: Vec<(String, PathBuf)>) -> Vec<String> {
    let mut reported = Vec::new();
    for (raw, canonical) in paths {
        let current = inner.refcounts.get(&canonical).copied().unwrap_or(0);
        let watched = if current == 0 {
            match inner.watcher.watch(&canonical, RecursiveMode::NonRecursive) {
                Ok(()) => true,
                Err(e) => {
                    log::debug!("fs_watch add {} failed: {e}", canonical.display());
                    false
                }
            }
        } else {
            true
        };
        if !watched {
            continue;
        }
        if to_canon(&canonical) == raw {
            reported.push(raw);
        }
        inner.refcounts.insert(canonical, current + 1);
    }
    reported
}

fn remove_paths(inner: &mut WatchInner, paths: Vec<PathBuf>) {
    for key in paths {
        let current = inner.refcounts.get(&key).copied().unwrap_or(0);
        if current <= 1 {
            inner.refcounts.remove(&key);
            let _ = inner.watcher.unwatch(&key);
        } else {
            inner.refcounts.insert(key, current - 1);
        }
    }
}

// Canonical keys keep add/remove symmetric regardless of how the path was spelled.
fn prepare_add(
    registry: &WorkspaceRegistry,
    workspace: &WorkspaceEnv,
    paths: Vec<String>,
) -> Vec<(String, PathBuf)> {
    paths
        .into_iter()
        .filter_map(|raw| {
            let resolved = resolve_path(&raw, workspace);
            let canonical = std::fs::canonicalize(&resolved).ok()?;
            if !canonical.is_dir() || is_skipped(&canonical) || !registry.is_authorized(&canonical) {
                return None;
            }
            Some((raw, canonical))
        })
        .collect()
}

#[tauri::command]
pub fn fs_watch_add(
    paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
    state: State<'_, FsWatchState>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<Vec<String>, String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    // No live FS events over ssh — remote watching isn't wired up; the explorer
    // refreshes on navigation instead. (A local watcher can't observe a remote
    // path anyway.)
    if workspace.is_ssh() {
        return Ok(Vec::new());
    }
    let prepared = prepare_add(&registry, &workspace, paths);
    if prepared.is_empty() {
        return Ok(Vec::new());
    }
    ensure_started(&state, &app)?;
    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    Ok(guard
        .as_mut()
        .map(|inner| add_paths(inner, prepared))
        .unwrap_or_default())
}

#[tauri::command]
pub fn fs_watch_remove(
    paths: Vec<String>,
    workspace: Option<WorkspaceEnv>,
    state: State<'_, FsWatchState>,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    if workspace.is_ssh() {
        return Ok(());
    }
    // A removed/renamed dir no longer canonicalizes; fall back so the refcount
    // entry is still released.
    let prepared: Vec<PathBuf> = paths
        .into_iter()
        .map(|raw| {
            let resolved = resolve_path(&raw, &workspace);
            std::fs::canonicalize(&resolved).unwrap_or(resolved)
        })
        .collect();
    let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(inner) = guard.as_mut() {
        remove_paths(inner, prepared);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_filter_matches_basename() {
        assert!(is_skipped(Path::new("/a/b/node_modules")));
        assert!(is_skipped(Path::new("/x/target")));
        assert!(is_skipped(Path::new("/p/obj")));
        assert!(!is_skipped(Path::new("/a/src")));
        assert!(!is_skipped(Path::new("/a/node_modules/pkg")));
    }

    fn watching(dir: &'static str) -> impl Fn(&Path) -> bool {
        move |path| path == Path::new(dir)
    }

    #[test]
    fn collect_ignores_access_and_dedups() {
        let mut set = HashSet::new();
        let watched = watching("/a");
        collect(
            &mut set,
            Ok(Event {
                kind: EventKind::Access(notify::event::AccessKind::Read),
                paths: vec![PathBuf::from("/a/x")],
                attrs: Default::default(),
            }),
            &watched,
        );
        assert!(set.is_empty());

        let modify = || {
            Ok(Event {
                kind: EventKind::Modify(notify::event::ModifyKind::Any),
                paths: vec![PathBuf::from("/a/x")],
                attrs: Default::default(),
            })
        };
        collect(&mut set, modify(), &watched);
        collect(&mut set, modify(), &watched);
        assert_eq!(set.len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn only_a_folder_named_like_its_events_counts_as_reported() {
        let tmp = tempfile::tempdir().unwrap();
        let base = std::fs::canonicalize(tmp.path()).unwrap();
        for dir in ["src", "node_modules"] {
            std::fs::create_dir(base.join(dir)).unwrap();
        }
        std::os::unix::fs::symlink(base.join("src"), base.join("alias")).unwrap();
        let registry = WorkspaceRegistry::default();
        registry.authorize(&base).unwrap();
        let mut inner = WatchInner {
            watcher: RecommendedWatcher::new(|_: notify::Result<Event>| {}, Config::default())
                .unwrap(),
            refcounts: HashMap::new(),
        };
        let src = to_canon(base.join("src"));
        let requested = vec![
            src.clone(),
            to_canon(base.join("alias")),
            format!("{src}/"),
            to_canon(base.join("node_modules")),
            to_canon(base.join("gone")),
        ];
        let prepared = prepare_add(&registry, &WorkspaceEnv::Local, requested);
        assert_eq!(add_paths(&mut inner, prepared), [src]);
        assert_eq!(inner.refcounts.get(&base.join("src")), Some(&3));
        assert_eq!(inner.refcounts.len(), 1);
    }

    fn event(kind: EventKind, paths: &[&str]) -> notify::Result<Event> {
        Ok(Event {
            kind,
            paths: paths.iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        })
    }

    #[test]
    fn staging_comings_and_goings_raise_no_change_but_the_publish_does() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
        let watched = watching("/ws");
        let mut set = HashSet::new();
        let staging = "/ws/.terax-copy-ab12";
        collect(
            &mut set,
            event(EventKind::Create(CreateKind::Folder), &[staging]),
            &watched,
        );
        collect(
            &mut set,
            event(
                EventKind::Create(CreateKind::File),
                &["/ws/.terax-copy-ab12/item"],
            ),
            &watched,
        );
        collect(
            &mut set,
            event(EventKind::Remove(RemoveKind::Folder), &[staging]),
            &watched,
        );
        assert!(set.is_empty());

        collect(
            &mut set,
            event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["/ws/.terax-copy-ab12/item", "/ws/a copy.txt"],
            ),
            &watched,
        );
        assert_eq!(set, HashSet::from([to_canon("/ws/a copy.txt")]));
    }

    #[test]
    fn a_watched_folder_below_a_staging_name_still_reports_its_changes() {
        use notify::event::CreateKind;
        let root = "/x/.terax-copy-old/proj";
        let watched = watching(root);
        let mut set = HashSet::new();
        for path in [
            "/x/.terax-copy-old/proj/a.txt",
            "/x/.terax-copy-old/proj/.terax-copy-ab12",
            "/x/.terax-copy-old/proj/.terax-copy-ab12/item",
        ] {
            collect(
                &mut set,
                event(EventKind::Create(CreateKind::Any), &[path]),
                &watched,
            );
        }
        collect(
            &mut set,
            event(EventKind::Create(CreateKind::Folder), &[root]),
            &watched,
        );
        assert_eq!(
            set,
            HashSet::from([to_canon("/x/.terax-copy-old/proj/a.txt"), to_canon(root)])
        );
    }
}
