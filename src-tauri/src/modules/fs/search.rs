use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use ignore::{WalkBuilder, WalkState};
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::{Deserialize, Serialize};

use super::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchHit {
    /// Absolute path of the matched file.
    pub path: String,
    /// Path relative to the search root, for display.
    pub rel: String,
    /// File name only.
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    /// True if the scan stopped early (entry budget or hit cap reached).
    pub truncated: bool,
}

/// Hard cap on entries the walker is allowed to visit before bailing. Protects
/// against pathological roots like $HOME. Sized well above a large real
/// workspace (170k+ files) so deep / late-visited files aren't cut off before
/// they're reached — the walk is parallel and only collects matches, so a high
/// ceiling is cheap.
const MAX_SCANNED: usize = 500_000;

/// Directory names pruned unconditionally — they're rarely useful in a
/// file-explorer search and they dominate scan time when present.
const PRUNE_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    ".venv",
    "__pycache__",
];

#[tauri::command]
pub fn fs_search(
    root: String,
    query: String,
    limit: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<SearchResult, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(SearchResult {
            hits: Vec::new(),
            truncated: false,
        });
    }
    let cap = limit.unwrap_or(200).min(1000);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    if let WorkspaceEnv::Ssh { host } = &workspace {
        return crate::modules::ssh::search(host, &root, q, cap, show_hidden);
    }
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let walker = WalkBuilder::new(&root_path)
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .filter_entry(|dent| {
            // Prune known-heavy dirs even when no .gitignore is present (e.g.
            // searching from $HOME).
            if dent.depth() == 0 {
                return true;
            }
            match dent.file_name().to_str() {
                Some(name) => !PRUNE_DIRS.contains(&name),
                None => true,
            }
        })
        .build_parallel();

    // Score each entry against the query *during* the parallel walk and keep
    // only matches. A serial walk that first buffered every candidate is what
    // let a large workspace (170k+ files) blow past the scan budget before deep
    // files were ever reached; matching inline means we only retain hits.
    let scored: Arc<Mutex<Vec<(u32, SearchHit)>>> = Arc::new(Mutex::new(Vec::new()));
    let scanned = Arc::new(AtomicUsize::new(0));
    let truncated = Arc::new(AtomicBool::new(false));

    walker.run(|| {
        let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
        let pattern = Pattern::parse(q, CaseMatching::Smart, Normalization::Smart);
        let mut buf: Vec<char> = Vec::new();
        let scored = scored.clone();
        let scanned = scanned.clone();
        let truncated = truncated.clone();
        let root_path = root_path.clone();
        let root = root.clone();
        let workspace = workspace.clone();

        Box::new(move |dent_res| {
            if truncated.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }
            let dent = match dent_res {
                Ok(d) => d,
                Err(_) => return WalkState::Continue,
            };
            let path = dent.path();
            if path == root_path {
                return WalkState::Continue;
            }
            if scanned.fetch_add(1, Ordering::Relaxed) >= MAX_SCANNED {
                truncated.store(true, Ordering::Relaxed);
                return WalkState::Quit;
            }
            let rel = match path.strip_prefix(&root_path) {
                Ok(r) => to_canon(r),
                Err(_) => return WalkState::Continue,
            };
            let Some(score) = score_rel(&pattern, &mut matcher, &mut buf, &rel) else {
                return WalkState::Continue;
            };
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let is_dir = dent.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let hit = SearchHit {
                path: display_path(path, &root_path, &root, &workspace),
                rel,
                name,
                is_dir,
            };
            if let Ok(mut guard) = scored.lock() {
                guard.push((score, hit));
            }
            WalkState::Continue
        })
    });

    let scored = Arc::try_unwrap(scored)
        .map(|m| m.into_inner().unwrap_or_default())
        .unwrap_or_default();
    let hits = sort_and_cap(scored, cap);
    Ok(SearchResult {
        hits,
        truncated: truncated.load(Ordering::Relaxed),
    })
}

/// Fuzzy-score `rel` against the parsed pattern (path-aware, smart-case).
/// `None` when it doesn't match. `buf` is a scratch buffer reused across calls.
fn score_rel(
    pattern: &Pattern,
    matcher: &mut Matcher,
    buf: &mut Vec<char>,
    rel: &str,
) -> Option<u32> {
    pattern.score(Utf32Str::new(rel, buf), matcher)
}

/// Sort scored hits (higher score first, ties toward shorter paths) and keep
/// the top `cap`.
fn sort_and_cap(mut scored: Vec<(u32, SearchHit)>, cap: usize) -> Vec<SearchHit> {
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.rel.len().cmp(&b.1.rel.len())));
    scored.into_iter().take(cap).map(|(_, h)| h).collect()
}

#[derive(Deserialize)]
struct RemoteSearch {
    hits: Vec<SearchHit>,
    truncated: bool,
}

/// Rank remote search candidates (already subsequence-prefiltered by the SSH
/// host helper) with the same fuzzy matcher as the local walk, so result
/// ordering is identical whether the workspace is local or remote.
pub(crate) fn rank_remote_hits(
    value: serde_json::Value,
    query: &str,
    cap: usize,
) -> Result<SearchResult, String> {
    let remote: RemoteSearch =
        serde_json::from_value(value).map_err(|e| format!("bad search response: {e}"))?;
    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut buf = Vec::new();
    let scored = remote
        .hits
        .into_iter()
        .filter_map(|h| score_rel(&pattern, &mut matcher, &mut buf, &h.rel).map(|s| (s, h)))
        .collect();
    Ok(SearchResult {
        hits: sort_and_cap(scored, cap),
        truncated: remote.truncated,
    })
}

/// Fuzzy-rank candidates against the query (path-aware, smart-case), keeping
/// the top `cap`. Ties break toward shorter relative paths. Test-only helper
/// that mirrors the inline scoring the parallel walk performs per entry.
#[cfg(test)]
fn rank_fuzzy(cands: Vec<SearchHit>, query: &str, cap: usize) -> Vec<SearchHit> {
    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut buf = Vec::new();
    let scored = cands
        .into_iter()
        .filter_map(|c| score_rel(&pattern, &mut matcher, &mut buf, &c.rel).map(|s| (s, c)))
        .collect();
    sort_and_cap(scored, cap)
}

#[derive(Serialize)]
pub struct ListFilesResult {
    pub files: Vec<String>,
    pub truncated: bool,
}

#[tauri::command]
pub fn fs_list_files(
    root: String,
    limit: Option<usize>,
    max_depth: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<ListFilesResult, String> {
    const DEFAULT_LIMIT: usize = 2_000;
    const HARD_LIMIT: usize = 10_000;
    const DEFAULT_DEPTH: usize = 8;
    const HARD_DEPTH: usize = 16;

    let cap = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, HARD_LIMIT);
    let depth = max_depth.unwrap_or(DEFAULT_DEPTH).clamp(1, HARD_DEPTH);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let walker = WalkBuilder::new(&root_path)
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .max_depth(Some(depth))
        .filter_entry(|dent| {
            if dent.depth() == 0 {
                return true;
            }
            match dent.file_name().to_str() {
                Some(name) => !PRUNE_DIRS.contains(&name),
                None => true,
            }
        })
        .build();

    let mut files: Vec<String> = Vec::with_capacity(cap.min(256));
    let mut scanned: usize = 0;
    let mut truncated = false;

    for dent in walker.flatten() {
        scanned += 1;
        if scanned > MAX_SCANNED {
            truncated = true;
            break;
        }
        let is_file = dent.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if rel.is_empty() {
            continue;
        }
        files.push(rel);
        if files.len() >= cap {
            truncated = true;
            break;
        }
    }

    files.sort_by_key(|a| a.to_lowercase());
    Ok(ListFilesResult { files, truncated })
}

fn display_path(
    path: &std::path::Path,
    root_path: &std::path::Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
) -> String {
    if workspace.is_wsl() {
        if let Ok(rel) = path.strip_prefix(root_path) {
            let rel = to_canon(rel);
            return if rel.is_empty() {
                root_display.to_string()
            } else if root_display.ends_with('/') {
                format!("{root_display}{rel}")
            } else {
                format!("{root_display}/{rel}")
            };
        }
    }
    to_canon(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(rel: &str) -> SearchHit {
        SearchHit {
            path: rel.to_string(),
            rel: rel.to_string(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            is_dir: false,
        }
    }

    #[test]
    fn rank_fuzzy_prefers_name_and_shorter_path() {
        let cands = vec![
            hit("src/deeply/nested/config.rs"),
            hit("config.rs"),
            hit("src/main.rs"),
        ];
        let out = rank_fuzzy(cands, "config", 10);
        assert_eq!(out[0].rel, "config.rs");
        assert!(!out.iter().any(|h| h.rel == "src/main.rs"));
    }

    #[test]
    fn rank_fuzzy_matches_subsequence() {
        let cands = vec![hit("CommandPalette.tsx"), hit("readme.md")];
        let out = rank_fuzzy(cands, "cmdp", 10);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].rel, "CommandPalette.tsx");
    }
}
