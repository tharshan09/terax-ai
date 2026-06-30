use std::process::Command;

fn main() {
    set_build_env();
    tauri_build::build()
}

/// Run a git command, returning trimmed stdout (or None on failure / empty).
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Embed the build's git commit + date so the running app can prove exactly
/// which fork commit it was built from (surfaced in Settings → About). The
/// shipped SemVer ("0.8.2") is static across commits, so it can't do this.
fn set_build_env() {
    let hash = git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "unknown".into());
    // A non-empty `status --porcelain` means uncommitted changes were compiled in.
    let dirty = git(&["status", "--porcelain"]).is_some_and(|s| !s.is_empty());
    let hash = if dirty { format!("{hash}-dirty") } else { hash };
    let date = git(&["log", "-1", "--format=%cd", "--date=format:%Y-%m-%d"])
        .unwrap_or_else(|| "unknown".into());

    println!("cargo:rustc-env=TERAX_GIT_HASH={hash}");
    println!("cargo:rustc-env=TERAX_GIT_DATE={date}");

    // Re-run this script when the checked-out commit changes, so the embedded
    // hash stays fresh on incremental builds (not just full rebuilds).
    if let Some(git_dir) = git(&["rev-parse", "--absolute-git-dir"]) {
        println!("cargo:rerun-if-changed={git_dir}/HEAD");
        if let Ok(head) = std::fs::read_to_string(format!("{git_dir}/HEAD")) {
            if let Some(r) = head.strip_prefix("ref: ") {
                println!("cargo:rerun-if-changed={git_dir}/{}", r.trim());
            }
        }
    }
}
