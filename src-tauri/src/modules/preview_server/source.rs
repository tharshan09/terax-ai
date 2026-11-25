//! Reading a requested file through the same chain for every file of a
//! grant, entry and neighbours alike, never `trusted`: scope by text, deny-list
//! on the text, resolve, then scope and deny-list on the resolved target,
//! regular file, 10 MiB, PDF magic. A local file is checked once more after it
//! is opened: on macOS and Linux by the path of the open handle, on Windows by
//! resolving the path again, which does not catch a swap. A file read over SSH
//! is checked on the target the host reports; this module does not see the
//! file the host opened.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::Instant;

use crate::modules::fs::file::{is_pdf_magic, FileStat, MAX_READ_BYTES};
use crate::modules::fs::guard;
use crate::modules::ssh::{self, RemoteFileBytes, RemoteReadError};

use super::grant::{Grant, Location};
use super::policy::{self, Art, Served};
use super::request::Target;
use super::Limits;

pub(crate) const GIT_REASON: &str = "path is inside a .git folder";
pub(crate) const FAKE_PDF_REASON: &str = "not a real PDF";
const OUTSIDE_REASON: &str = "path is outside the shared folder";
/// Longest text from a host that reaches a log line or a click reason.
const DETAIL_CHARS: usize = 160;

/// The bytes of a file and how to serve them.
#[derive(Debug)]
pub(crate) struct Loaded {
    pub bytes: Vec<u8>,
    pub served: Served,
}

/// Why the host could not be read, as the page names it. The host's own text
/// never reaches the page.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Gateway {
    /// `Unreachable` after the retry.
    Unreachable,
    /// `Failed` (also a killed helper).
    Failed,
}

/// Why a `504` happened; only the log tells them apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Timeout {
    /// The read used up `ssh_read_budget`.
    Budget,
    /// The file waited `host_wait` for a slot without progress.
    Wait,
}

/// Why a file is not served. `Refused` carries the reason for the log and the
/// click, `detail` the cleaned text of the host for the log; the browser only
/// sees the fixed text of `body`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Refusal {
    NotFound,
    Refused(String),
    TooLarge,
    /// `502`: the host could not be read.
    BadGateway {
        name: String,
        host: String,
        kind: Gateway,
        detail: String,
    },
    /// `504`: the read hit its budget or the wait for the host's slot ended.
    TimedOut {
        name: String,
        host: String,
        cause: Timeout,
    },
}

impl Refusal {
    pub(crate) fn status(&self) -> u16 {
        match self {
            Self::NotFound => 404,
            Self::Refused(_) | Self::TooLarge => 403,
            Self::BadGateway { .. } => 502,
            Self::TimedOut { .. } => 504,
        }
    }

    /// The text page the browser gets: a fixed sentence per kind, with only
    /// the file name and the host of the grant filled in.
    pub(crate) fn body(&self) -> String {
        match self {
            Self::NotFound => "Not found".to_string(),
            Self::Refused(_) => "Refused by Terax".to_string(),
            Self::TooLarge => "Larger than 10 MB".to_string(),
            Self::BadGateway { name, host, kind, .. } => {
                let why = match kind {
                    Gateway::Unreachable => "the host could not be reached",
                    Gateway::Failed => "the read failed",
                };
                format!("Terax could not read {name} from {host}: {why}")
            }
            Self::TimedOut { name, host, .. } => {
                format!("Terax could not read {name} from {host}: timed out")
            }
        }
    }
}

/// A text from a host (stderr, a helper's message) for a log line or a click
/// reason: control characters become spaces; a longer text is cut after
/// `DETAIL_CHARS` chars and ends with `…`.
pub(crate) fn clean_detail(text: &str) -> String {
    let cleaned: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let cleaned = cleaned.trim();
    match cleaned.char_indices().nth(DETAIL_CHARS) {
        Some((cut, _)) => format!("{}…", &cleaned[..cut]),
        None => cleaned.to_string(),
    }
}

/// VAL-7 on one path text: the read deny-list of `guard.rs` (its reason
/// without the leading "refused: ") plus any `.git` segment.
pub(crate) fn check_blocklist(path: &str) -> Result<(), String> {
    guard::check_read_str(path).map_err(|e| e.strip_prefix("refused: ").unwrap_or(&e).to_string())?;
    if has_git_segment(path) {
        return Err(GIT_REASON.to_string());
    }
    Ok(())
}

/// A `.git` segment in any spelling, normalized per segment like the
/// deny-list does (stream suffix and trailing dots and spaces dropped).
fn has_git_segment(path: &str) -> bool {
    path.split(['/', '\\']).any(|segment| {
        let segment = segment.split(':').next().unwrap_or(segment);
        segment.trim_end_matches(['.', ' ']).to_lowercase() == ".git"
    })
}

/// True when `path` is `root` or lies below it, compared per segment.
pub(crate) fn within(path: &str, root: &str) -> bool {
    if path == root {
        return true;
    }
    let root = root.trim_end_matches('/');
    path.strip_prefix(root).is_some_and(|rest| rest.starts_with('/'))
}

/// An absolute path (`/…` or `C:/…`) without empty, `.` or `..` segments, so
/// a comparison by text means what it says.
fn is_normalized(path: &str) -> bool {
    let rest = if let Some(rest) = path.strip_prefix('/') {
        rest
    } else {
        let b = path.as_bytes();
        if b.len() < 3 || !b[0].is_ascii_alphabetic() || b[1] != b':' || b[2] != b'/' {
            return false;
        }
        &path[3..]
    };
    !rest.is_empty() && rest.split('/').all(|s| !s.is_empty() && s != "." && s != "..")
}

/// Folder of a `/`-separated path; `/` for a file in the root.
pub(crate) fn parent(path: &str) -> Option<&str> {
    path.rsplit_once('/')
        .map(|(folder, _)| if folder.is_empty() { "/" } else { folder })
}

/// A local path as `/`-separated text; `None` if it is not valid UTF-8, so a
/// lossy conversion can never make two paths compare equal.
pub(crate) fn path_text(path: &Path) -> Option<String> {
    path.to_str()?;
    Some(crate::modules::fs::to_canon(path))
}

/// The path a request names and the file name it is served under.
fn requested(grant: &Grant, target: &Target) -> Result<(String, String), Refusal> {
    let Some(root) = &grant.root else {
        let only_entry = !target.folder
            && target.segments.len() == 1
            && target.segments[0] == grant.entry_name();
        return if only_entry {
            Ok((grant.entry.clone(), grant.entry_name().to_string()))
        } else {
            Err(Refusal::Refused(OUTSIDE_REASON.to_string()))
        };
    };
    let mut path = root.trim_end_matches('/').to_string();
    for segment in &target.segments {
        path.push('/');
        path.push_str(segment);
    }
    let name = if target.folder {
        path.push_str("/index.html");
        "index.html".to_string()
    } else {
        target.segments.last().cloned().unwrap_or_default()
    };
    Ok((path, name))
}

/// VAL-6 and VAL-7 on a resolved target: normalized, below the folder (the
/// folder itself is no file) or exactly the entry, and past the deny-list.
fn check_target(grant: &Grant, resolved: &str) -> Result<(), Refusal> {
    let in_scope = is_normalized(resolved)
        && match &grant.root {
            Some(root) => resolved != root && within(resolved, root),
            None => resolved == grant.entry,
        };
    if !in_scope {
        return Err(Refusal::Refused(OUTSIDE_REASON.to_string()));
    }
    check_blocklist(resolved).map_err(Refusal::Refused)
}

/// The type to serve, and VAL-9 for a PDF. The entry is served by the kind
/// of its grant.
fn finish(grant: &Grant, name: &str, resolved: &str, bytes: Vec<u8>) -> Result<Loaded, Refusal> {
    let entry = (resolved == grant.entry).then_some(grant.kind);
    let served = policy::served_type(name, entry);
    if served.art == Art::Pdf && !is_pdf_magic(&bytes) {
        return Err(Refusal::Refused(FAKE_PDF_REASON.to_string()));
    }
    Ok(Loaded { bytes, served })
}

/// Reads a file of a local grant. Blocking: callers run it on a blocking
/// thread.
pub(crate) fn read_local(grant: &Grant, target: &Target) -> Result<Loaded, Refusal> {
    let (path, name) = requested(grant, target)?;
    check_blocklist(&path).map_err(Refusal::Refused)?;
    let resolved = std::fs::canonicalize(&path).map_err(|e| {
        log::debug!("preview server: cannot resolve {name}: {e}");
        Refusal::NotFound
    })?;
    let resolved_text = path_text(&resolved)
        .ok_or_else(|| Refusal::Refused("path is not valid UTF-8".to_string()))?;
    check_target(grant, &resolved_text)?;
    let (file, len, opened_text) = open_checked(grant, &resolved, &name)?;
    if len > MAX_READ_BYTES {
        return Err(Refusal::TooLarge);
    }
    let mut bytes = Vec::new();
    file.take(MAX_READ_BYTES + 1).read_to_end(&mut bytes).map_err(|e| {
        log::debug!("preview server: cannot read {name}: {e}");
        Refusal::NotFound
    })?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(Refusal::TooLarge);
    }
    finish(grant, &name, &opened_text, bytes)
}

/// Opens a resolved target and checks the file that is actually open, so a
/// path swapped for a link after resolving is caught on macOS and Linux; on
/// Windows `opened_path` resolves the path again and does not catch it.
/// Returns the file, its length and the checked path.
fn open_checked(grant: &Grant, resolved: &Path, name: &str) -> Result<(std::fs::File, u64, String), Refusal> {
    let file = open_for_reading(resolved).map_err(|e| {
        log::debug!("preview server: cannot open {name}: {e}");
        Refusal::NotFound
    })?;
    let meta = file.metadata().map_err(|e| {
        log::debug!("preview server: cannot stat {name}: {e}");
        Refusal::NotFound
    })?;
    if !meta.is_file() {
        return Err(Refusal::NotFound);
    }
    let opened = opened_path(&file, resolved).map_err(|e| {
        log::debug!("preview server: cannot check the opened {name}: {e}");
        Refusal::Refused("the opened file could not be checked".to_string())
    })?;
    let opened_text =
        path_text(&opened).ok_or_else(|| Refusal::Refused("path is not valid UTF-8".to_string()))?;
    check_target(grant, &opened_text)?;
    Ok((file, meta.len(), opened_text))
}

/// Without `O_NONBLOCK` opening a FIFO named like an image would hang the
/// thread; a regular file reads the same either way.
#[cfg(unix)]
pub(crate) fn open_for_reading(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .open(path)
}

#[cfg(not(unix))]
pub(crate) fn open_for_reading(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::File::open(path)
}

/// The path of the open handle (`F_GETPATH`).
#[cfg(target_os = "macos")]
pub(crate) fn opened_path(file: &std::fs::File, _resolved: &Path) -> std::io::Result<PathBuf> {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::io::AsRawFd;
    let mut buf = vec![0u8; libc::PATH_MAX as usize];
    // SAFETY: F_GETPATH writes at most MAXPATHLEN (= PATH_MAX) bytes into buf.
    let rc = unsafe { libc::fcntl(file.as_raw_fd(), libc::F_GETPATH, buf.as_mut_ptr()) };
    if rc == -1 {
        return Err(std::io::Error::last_os_error());
    }
    let len = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    Ok(PathBuf::from(OsStr::from_bytes(&buf[..len])))
}

/// The path of the open handle (`/proc/self/fd`).
#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn opened_path(file: &std::fs::File, _resolved: &Path) -> std::io::Result<PathBuf> {
    use std::os::unix::io::AsRawFd;
    std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

/// Not the path of the open handle: the path is resolved a second time, so a
/// swap between opening and this check is not caught on Windows.
#[cfg(windows)]
pub(crate) fn opened_path(_file: &std::fs::File, resolved: &Path) -> std::io::Result<PathBuf> {
    std::fs::canonicalize(resolved)
}

pub(crate) type ReadFn =
    dyn Fn(&str, &str, u64, Duration) -> Result<RemoteFileBytes, RemoteReadError> + Send + Sync;
pub(crate) type RealpathFn = dyn Fn(&str, &str) -> Result<String, RemoteReadError> + Send + Sync;
pub(crate) type StatFn = dyn Fn(&str, &str) -> Result<FileStat, RemoteReadError> + Send + Sync;

/// The SSH calls of the server, handed in so tests use a stand-in host.
#[derive(Clone)]
pub(crate) struct Remote {
    pub read: Arc<ReadFn>,
    pub realpath: Arc<RealpathFn>,
    pub stat: Arc<StatFn>,
}

impl Remote {
    pub(crate) fn ssh() -> Self {
        Self {
            read: Arc::new(ssh::read_bytes_typed),
            realpath: Arc::new(ssh::realpath_typed),
            stat: Arc::new(ssh::stat_typed),
        }
    }
}

struct HostSlot {
    permits: Arc<Semaphore>,
    /// When the last read of this host ended; a waiting file waits at most
    /// `host_wait` after this (or after it started waiting).
    progress: Mutex<Instant>,
}

/// Why `ReadGate::read` gave no bytes.
enum ReadFailure {
    Host(RemoteReadError),
    Waited,
}

/// SEC-14 and OB-12: at most `reads_total` SSH reads at once, `reads_per_host`
/// of them per host; a file waits at most `host_wait` without progress and
/// keeps its place in the queue while it waits.
pub(crate) struct ReadGate {
    limits: Limits,
    total: Arc<Semaphore>,
    hosts: Mutex<HashMap<String, Arc<HostSlot>>>,
}

impl ReadGate {
    pub(crate) fn new(limits: Limits) -> Self {
        Self {
            limits,
            total: Arc::new(Semaphore::new(limits.reads_total)),
            hosts: Mutex::new(HashMap::new()),
        }
    }

    fn slot(&self, host: &str) -> Arc<HostSlot> {
        let mut hosts = self.hosts.lock().unwrap_or_else(PoisonError::into_inner);
        Arc::clone(hosts.entry(host.to_string()).or_insert_with(|| {
            Arc::new(HostSlot {
                permits: Arc::new(Semaphore::new(self.limits.reads_per_host)),
                progress: Mutex::new(Instant::now()),
            })
        }))
    }

    async fn wait_for_host(&self, slot: &HostSlot) -> Option<OwnedSemaphorePermit> {
        let start = Instant::now();
        let since = || (*slot.progress.lock().unwrap_or_else(PoisonError::into_inner)).max(start);
        // One acquire for the whole wait: dropping it would leave the queue.
        let mut acquire = Box::pin(Arc::clone(&slot.permits).acquire_owned());
        loop {
            let deadline = since() + self.limits.host_wait;
            match tokio::time::timeout_at(deadline, acquire.as_mut()).await {
                Ok(permit) => return permit.ok(),
                // Another read of this host ended meanwhile: the wait restarts.
                Err(_) if Instant::now() < since() + self.limits.host_wait => continue,
                Err(_) => return None,
            }
        }
    }

    /// One read of `path` on `host` through the slots, on a blocking thread,
    /// with one retry after `Unreachable`. The slot stays taken until the
    /// reader returns, even if the request is gone.
    async fn read(&self, host: &str, path: &str, read: Arc<ReadFn>) -> Result<RemoteFileBytes, ReadFailure> {
        let slot = self.slot(host);
        let host_permit = self.wait_for_host(&slot).await.ok_or(ReadFailure::Waited)?;
        let total_permit = tokio::time::timeout(self.limits.host_wait, Arc::clone(&self.total).acquire_owned())
            .await
            .ok()
            .and_then(Result::ok)
            .ok_or(ReadFailure::Waited)?;
        let (host, path) = (host.to_string(), path.to_string());
        let (budget, pause) = (self.limits.ssh_read_budget, self.limits.retry_pause);
        tokio::task::spawn_blocking(move || {
            let _held = (host_permit, total_permit);
            let mut result = read(&host, &path, MAX_READ_BYTES, budget);
            if matches!(result, Err(RemoteReadError::Unreachable(_))) {
                std::thread::sleep(pause);
                result = read(&host, &path, MAX_READ_BYTES, budget);
            }
            *slot.progress.lock().unwrap_or_else(PoisonError::into_inner) = Instant::now();
            result.map_err(ReadFailure::Host)
        })
        .await
        .unwrap_or_else(|e| Err(ReadFailure::Host(RemoteReadError::Failed(format!("the read task failed: {e}")))))
    }
}

/// What the browser gets for a failed SSH read; only the variant counts, the
/// host's text goes to the log only.
fn remote_refusal(failure: ReadFailure, name: &str, host: &str) -> Refusal {
    let (name, host) = (name.to_string(), host.to_string());
    let error = match failure {
        ReadFailure::Waited => {
            return Refusal::TimedOut {
                name,
                host,
                cause: Timeout::Wait,
            }
        }
        ReadFailure::Host(error) => error,
    };
    match error {
        RemoteReadError::Missing | RemoteReadError::NotRegularFile => Refusal::NotFound,
        RemoteReadError::TooLarge => Refusal::TooLarge,
        RemoteReadError::TimedOut(_) => Refusal::TimedOut {
            name,
            host,
            cause: Timeout::Budget,
        },
        RemoteReadError::Unreachable(detail) => Refusal::BadGateway {
            name,
            host,
            kind: Gateway::Unreachable,
            detail: clean_detail(&detail),
        },
        RemoteReadError::Failed(detail) => Refusal::BadGateway {
            name,
            host,
            kind: Gateway::Failed,
            detail: clean_detail(&detail),
        },
    }
}

/// Reads a file of an SSH grant on the grant's own host. The deny-list runs
/// on the text before anything is sent, scope and deny-list again on the
/// target the host reports.
pub(crate) async fn read_remote(grant: &Grant, target: &Target, gate: &ReadGate, read: Arc<ReadFn>) -> Result<Loaded, Refusal> {
    let Location::Ssh { host } = &grant.location else {
        return Err(Refusal::Refused("not an SSH link".to_string()));
    };
    let (path, name) = requested(grant, target)?;
    check_blocklist(&path).map_err(Refusal::Refused)?;
    let file = gate
        .read(host, &path, read)
        .await
        .map_err(|e| remote_refusal(e, &name, host))?;
    check_target(grant, &file.resolved_path)?;
    if file.bytes.len() as u64 > MAX_READ_BYTES {
        return Err(Refusal::TooLarge);
    }
    finish(grant, &name, &file.resolved_path, file.bytes)
}

#[cfg(test)]
mod tests {
    use super::super::grant::{GrantClass, Location};
    use super::super::policy::EntryKind;
    use super::super::testkit::{self, run, FakeHost, Latch, T};
    use super::*;

    fn target(rel: &str) -> Target {
        super::super::request::split_target(&format!("/{T}/{rel}"), T).expect("test target is valid")
    }

    fn canon(p: &Path) -> String {
        path_text(&std::fs::canonicalize(p).unwrap()).unwrap()
    }

    fn local_grant(entry: &Path, root: Option<&Path>, kind: EntryKind) -> Grant {
        testkit::grant(Location::Local, &canon(entry), root.map(canon).as_deref(), kind, GrantClass::Browser)
    }

    fn refused() -> Result<Vec<u8>, Refusal> {
        Err(Refusal::Refused(String::new()))
    }

    // Reasons differ per rule; the browser only sees status and text.
    fn outcome(result: Result<Loaded, Refusal>) -> Result<Vec<u8>, Refusal> {
        result.map(|l| l.bytes).map_err(|e| match e {
            Refusal::Refused(_) => Refusal::Refused(String::new()),
            other => other,
        })
    }

    fn write(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn ac12_check_blocklist_reasons() {
        assert_eq!(check_blocklist("/srv/p/a.html"), Ok(()));
        assert_eq!(check_blocklist("/srv/p/.git/config"), Err(GIT_REASON.to_string()));
        assert_eq!(
            check_blocklist("/home/u/.ssh/notiz.html"),
            Err("path is inside a protected directory (.ssh)".to_string())
        );
        for path in ["/p/.GIT/config", "/p/.Git/hooks/x", "/p/.git", "C:\\p\\.git\\x", "/p/.git./x", "/p/.git::$DATA/x"] {
            assert_eq!(check_blocklist(path), Err(GIT_REASON.to_string()), "{path}");
        }
        for path in ["/p/.gitignore", "/p/a.git", "/p/git/x", "/p/.github/x"] {
            assert_eq!(check_blocklist(path), Ok(()), "{path}");
        }
    }

    #[test]
    fn ac11_within_compares_whole_segments() {
        assert!(within("/srv/p", "/srv/p"));
        assert!(within("/srv/p/a", "/srv/p"));
        assert!(within("/srv/p/a", "/srv/p/"));
        assert!(within("/x", "/"));
        assert!(!within("/srv/pp/a", "/srv/p"));
        assert!(!within("/srv", "/srv/p"));
    }

    /// Sicherheitsmodell 7
    #[cfg(unix)]
    #[test]
    fn ac11_symlinks_are_checked_on_the_resolved_target() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let p = d.join("p");
        write(&p.join("sub/y.png"), b"Y-PNG");
        write(&p.join("a.html"), b"<html>");
        write(&d.join("x.png"), b"outside");
        write(&d.join(".ssh/id_rsa"), b"KEY");
        write(&d.join("outside/z.png"), b"Z");
        write(&p.join(".env"), b"SECRET=1");
        write(&p.join(".git/config"), b"[core]");
        write(&p.join(".ssh/id_ed25519"), b"KEY");
        symlink(p.join("sub/y.png"), p.join("in.png")).unwrap();
        symlink("../x.png", p.join("out.png")).unwrap();
        symlink("../.ssh/id_rsa", p.join("key.png")).unwrap();
        symlink(d.join("outside"), p.join("linkdir")).unwrap();
        symlink(p.join(".env"), p.join("ok.png")).unwrap();
        symlink(p.join(".git/config"), p.join("logo.png")).unwrap();
        symlink(p.join(".ssh/id_ed25519"), p.join("icon.png")).unwrap();
        let grant = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);

        assert_eq!(outcome(read_local(&grant, &target("sub/y.png"))), Ok(b"Y-PNG".to_vec()));
        assert_eq!(outcome(read_local(&grant, &target("in.png"))), Ok(b"Y-PNG".to_vec()));
        for name in ["out.png", "key.png", "linkdir/z.png", "ok.png", "logo.png", "icon.png"] {
            assert_eq!(outcome(read_local(&grant, &target(name))), refused(), "{name}");
        }
        for name in ["out.png", "linkdir/z.png", "ok.png", "logo.png", "icon.png"] {
            assert_eq!(read_local(&grant, &target(name)).unwrap_err().body(), "Refused by Terax");
            assert_eq!(read_local(&grant, &target(name)).unwrap_err().status(), 403);
        }

        let link = p.join("in.png");
        let file = open_for_reading(&std::fs::canonicalize(&link).unwrap()).unwrap();
        let opened = opened_path(&file, &link).unwrap();
        assert_eq!(path_text(&opened).unwrap(), canon(&p.join("sub/y.png")));
    }

    /// Sicherheitsmodell 9
    #[test]
    fn ac12_secrets_and_neighbours_of_a_file_grant_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>");
        for name in [".env", "id_ed25519", ".ssh/config", ".git/config", ".GIT/config", ".Git/hooks/x"] {
            write(&p.join(name), b"secret");
        }
        let html = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);
        for name in [".env", "id_ed25519", ".ssh/config", ".git/config", ".GIT/config", ".Git/hooks/x"] {
            let result = read_local(&html, &target(name));
            assert_eq!(outcome(result), refused(), "{name}");
        }

        write(&p.join("b.png"), b"B");
        write(&p.join("c.png"), b"C");
        let image = local_grant(&p.join("b.png"), None, EntryKind::Image);
        assert_eq!(outcome(read_local(&image, &target("b.png"))), Ok(b"B".to_vec()));
        let neighbour = read_local(&image, &target("c.png")).unwrap_err();
        assert_eq!((neighbour.status(), neighbour.body()), (403, "Refused by Terax".to_string()));
        assert_eq!(outcome(read_local(&image, &target(""))), refused());
    }

    /// Sicherheitsmodell 9
    #[cfg(unix)]
    #[test]
    fn ac12_a_secret_name_is_refused_even_when_it_links_to_a_harmless_file() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>");
        write(&p.join("sub/y.png"), b"Y");
        symlink(p.join("sub/y.png"), p.join(".env")).unwrap();
        symlink(p.join("sub"), p.join(".git")).unwrap();
        symlink(p.join("sub"), p.join(".AWS")).unwrap();
        let grant = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);
        for name in [".env", ".git/y.png", ".AWS/y.png"] {
            assert_eq!(outcome(read_local(&grant, &target(name))), refused(), "{name}");
        }
    }

    /// Sicherheitsmodell 16
    /// Sicherheitsmodell 18
    #[test]
    fn ac13_size_pdf_magic_and_folders() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>");
        let big = std::fs::File::create(p.join("big.png")).unwrap();
        big.set_len(MAX_READ_BYTES + 1).unwrap();
        let exact = std::fs::File::create(p.join("exact.png")).unwrap();
        exact.set_len(MAX_READ_BYTES).unwrap();
        write(&p.join("report.pdf"), b"<html><script>");
        write(&p.join("real.pdf"), b"%PDF-1.7\n1 0 obj");
        write(&p.join("sub/index.html"), b"SUB INDEX");
        std::fs::create_dir_all(p.join("leer")).unwrap();
        let grant = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);

        let too_large = read_local(&grant, &target("big.png")).unwrap_err();
        assert_eq!((too_large.status(), too_large.body()), (403, "Larger than 10 MB".to_string()));
        assert_eq!(read_local(&grant, &target("exact.png")).unwrap().bytes.len() as u64, MAX_READ_BYTES);
        let fake = read_local(&grant, &target("report.pdf")).unwrap_err();
        assert_eq!(fake, Refusal::Refused(FAKE_PDF_REASON.to_string()));
        assert_eq!(fake.body(), "Refused by Terax");
        let real = read_local(&grant, &target("real.pdf")).unwrap();
        assert_eq!(real.served.mime, "application/pdf");
        for rel in ["sub", "leer/", "fehlt.png"] {
            let missing = read_local(&grant, &target(rel)).unwrap_err();
            assert_eq!((missing.status(), missing.body()), (404, "Not found".to_string()), "{rel}");
        }
        assert_eq!(read_local(&grant, &target("sub/")).unwrap().bytes, b"SUB INDEX");
    }

    #[cfg(unix)]
    #[test]
    fn ac13_a_fifo_is_not_served_and_does_not_hang() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>");
        let fifo = std::ffi::CString::new(p.join("pipe.png").to_str().unwrap()).unwrap();
        // SAFETY: a valid NUL-terminated path.
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        let grant = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);
        assert_eq!(read_local(&grant, &target("pipe.png")).unwrap_err(), Refusal::NotFound);
    }

    fn remote_grant() -> Grant {
        testkit::grant(
            Location::Ssh { host: "devbox".into() },
            "/srv/p/a.html",
            Some("/srv/p"),
            EntryKind::Html,
            GrantClass::Browser,
        )
    }

    fn remote(fake: &Arc<FakeHost>, gate: &ReadGate, grant: &Grant, rel: &str) -> Result<Loaded, Refusal> {
        run(read_remote(grant, &target(rel), gate, fake.reader()))
    }

    /// Sicherheitsmodell 8
    /// Sicherheitsmodell 9
    /// Sicherheitsmodell 14
    #[test]
    fn ac15_remote_reads_check_the_text_before_and_the_target_after() {
        let fake = FakeHost::new();
        fake.file("/srv/p/sub/y.png", b"Y");
        fake.file("/srv/other/x.png", b"X");
        fake.file("/home/u/.ssh/id_rsa", b"KEY");
        fake.file("/srv/p/.env", b"S");
        fake.file("/srv/p/.git/config", b"S");
        fake.file("/srv/p/.GIT/config", b"S");
        fake.file("/srv/p/keys/id_ed25519", b"S");
        fake.link("/srv/p/link.png", "/srv/other/x.png");
        fake.link("/srv/p/pic.png", "/home/u/.ssh/id_rsa");
        fake.link("/srv/p/a.png", "/srv/p/.env");
        fake.link("/srv/p/b.png", "/srv/p/.git/config");
        fake.link("/srv/p/c.png", "/srv/p/keys/id_ed25519");
        fake.link("/srv/p/d.png", "/srv/p/.GIT/config");
        let gate = ReadGate::new(testkit::limits());
        let grant = remote_grant();

        assert_eq!(outcome(remote(&fake, &gate, &grant, "sub/y.png")), Ok(b"Y".to_vec()));
        for name in ["link.png", "pic.png"] {
            assert_eq!(outcome(remote(&fake, &gate, &grant, name)), refused(), "{name}");
        }
        let before = fake.calls().len();
        for name in [".env", "id_ed25519", ".ssh/config", ".git/config", ".GIT/config", ".Git/hooks/x"] {
            assert_eq!(outcome(remote(&fake, &gate, &grant, name)), refused(), "{name}");
        }
        assert_eq!(fake.calls().len(), before, "a refused name never reaches the host");
        for name in ["a.png", "b.png", "c.png", "d.png"] {
            let before = fake.calls().len();
            assert_eq!(outcome(remote(&fake, &gate, &grant, name)), refused(), "{name}");
            assert_eq!(fake.calls().len(), before + 1, "{name} was read, then refused");
        }
        for call in fake.calls() {
            assert_eq!((call.host.as_str(), call.limit), ("devbox", MAX_READ_BYTES), "{call:?}");
        }
        assert_eq!(fake.calls()[0].path, "/srv/p/sub/y.png");
    }

    /// Sicherheitsmodell 16
    /// Sicherheitsmodell 18
    #[test]
    fn ac16_failure_kinds_map_by_variant_only() {
        let cases: Vec<(Vec<RemoteReadError>, u16, &str, usize)> = vec![
            (vec![RemoteReadError::Missing], 404, "Not found", 1),
            (vec![RemoteReadError::NotRegularFile], 404, "Not found", 1),
            (vec![RemoteReadError::TooLarge], 403, "Larger than 10 MB", 1),
            (
                vec![RemoteReadError::TimedOut("budget".into())],
                504,
                "Terax could not read y.png from devbox: timed out",
                1,
            ),
            (
                vec![RemoteReadError::Failed("boom".into())],
                502,
                "Terax could not read y.png from devbox: the read failed",
                1,
            ),
            (
                vec![RemoteReadError::Unreachable("gone".into()), RemoteReadError::Unreachable("gone".into())],
                502,
                "Terax could not read y.png from devbox: the host could not be reached",
                2,
            ),
            // The text never decides: a timeout worded like a missing file.
            (
                vec![RemoteReadError::TimedOut("No such file".into())],
                504,
                "Terax could not read y.png from devbox: timed out",
                1,
            ),
        ];
        for (script, status, body, calls) in cases {
            let fake = FakeHost::new();
            fake.file("/srv/p/y.png", b"Y");
            for error in &script {
                fake.fail_next(error.clone());
            }
            let gate = ReadGate::new(testkit::limits());
            let refusal = remote(&fake, &gate, &remote_grant(), "y.png").unwrap_err();
            assert_eq!((refusal.status(), refusal.body().as_str()), (status, body), "{script:?}");
            assert_eq!(fake.calls().len(), calls, "{script:?}");
        }

        let fake = FakeHost::new();
        fake.file("/srv/p/y.png", b"Y");
        fake.fail_next(RemoteReadError::Unreachable("gone".into()));
        let gate = ReadGate::new(testkit::limits());
        assert_eq!(outcome(remote(&fake, &gate, &remote_grant(), "y.png")), Ok(b"Y".to_vec()));
        assert_eq!(fake.calls().len(), 2);

        let fake = FakeHost::new();
        fake.file("/srv/p/report.pdf", b"<html><script>");
        let refusal = remote(&fake, &gate, &remote_grant(), "report.pdf").unwrap_err();
        assert_eq!((refusal.status(), refusal.body().as_str()), (403, "Refused by Terax"));
    }

    #[test]
    fn ac16_the_retry_waits_the_pause() {
        let fake = FakeHost::new();
        fake.file("/srv/p/y.png", b"Y");
        fake.fail_next(RemoteReadError::Unreachable("gone".into()));
        let mut limits = testkit::limits();
        limits.retry_pause = Duration::from_millis(150);
        let gate = ReadGate::new(limits);
        let started = std::time::Instant::now();
        assert!(remote(&fake, &gate, &remote_grant(), "y.png").is_ok());
        assert!(started.elapsed() >= Duration::from_millis(150), "{:?}", started.elapsed());
    }

    fn grant_on(host: &str) -> Grant {
        testkit::grant(
            Location::Ssh { host: host.into() },
            "/srv/p/a.html",
            Some("/srv/p"),
            EntryKind::Html,
            GrantClass::Browser,
        )
    }

    /// Sicherheitsmodell 18
    #[test]
    fn ac17_one_read_per_host_at_a_time() {
        let fake = FakeHost::new();
        fake.file("/srv/p/y.png", b"Y");
        fake.set_delay(Duration::from_millis(3));
        let gate = Arc::new(ReadGate::new(testkit::limits()));
        let results = run(async {
            let mut jobs = Vec::new();
            for i in 0..60 {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                let host = if i % 2 == 0 { "devbox" } else { "box2" };
                jobs.push(tokio::spawn(async move {
                    let grant = grant_on(host);
                    read_remote(&grant, &target("y.png"), &gate, fake.reader()).await.map(|l| l.bytes)
                }));
            }
            let mut out = Vec::new();
            for job in jobs {
                out.push(job.await.unwrap());
            }
            out
        });
        assert_eq!(results.len(), 60);
        assert!(results.iter().all(|r| r.as_deref() == Ok(&b"Y"[..])), "{results:?}");
        assert_eq!(fake.peak_on("devbox"), 1);
        assert_eq!(fake.peak_on("box2"), 1);
        assert!(fake.peak_total() <= 8);
    }

    /// Sicherheitsmodell 18
    #[test]
    fn ac17_at_most_eight_reads_over_all_hosts() {
        let fake = FakeHost::new();
        fake.file("/srv/p/y.png", b"Y");
        fake.hold_until_peak(8);
        let gate = Arc::new(ReadGate::new(testkit::limits()));
        let results = run(async {
            let mut jobs = Vec::new();
            for i in 0..12 {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                jobs.push(tokio::spawn(async move {
                    let host = format!("box{i}");
                    let grant = grant_on(&host);
                    read_remote(&grant, &target("y.png"), &gate, fake.reader()).await.is_ok()
                }));
            }
            let mut out = Vec::new();
            for job in jobs {
                out.push(job.await.unwrap());
            }
            out
        });
        assert!(results.iter().all(|ok| *ok), "{results:?}");
        assert_eq!(fake.peak_total(), 8);
    }

    #[test]
    fn ac18_a_waiting_file_times_out_while_other_hosts_load() {
        let fake = FakeHost::new();
        fake.file("/srv/p/a.png", b"A");
        fake.file("/srv/p/b.png", b"B");
        fake.file("/srv/p/c.png", b"C");
        let latch = Latch::new();
        fake.hold("/srv/p/a.png", &latch);
        let mut limits = testkit::limits();
        limits.host_wait = Duration::from_millis(200);
        let gate = Arc::new(ReadGate::new(limits));
        run(async {
            let first = {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                tokio::spawn(async move {
                    read_remote(&grant_on("devbox"), &target("a.png"), &gate, fake.reader()).await.is_ok()
                })
            };
            latch.wait_until_entered().await;

            let started = Instant::now();
            let second = read_remote(&grant_on("devbox"), &target("b.png"), &gate, fake.reader()).await;
            let waited = started.elapsed();
            let refusal = second.unwrap_err();
            assert_eq!(
                (refusal.status(), refusal.body().as_str()),
                (504, "Terax could not read b.png from devbox: timed out")
            );
            assert!(waited >= Duration::from_millis(200), "{waited:?}");

            let started = Instant::now();
            let other = read_remote(&grant_on("box2"), &target("c.png"), &gate, fake.reader()).await;
            assert_eq!(other.map(|l| l.bytes).ok().as_deref(), Some(&b"C"[..]));
            assert!(started.elapsed() < Duration::from_millis(200), "{:?}", started.elapsed());

            latch.open();
            assert!(first.await.unwrap());
            let third = read_remote(&grant_on("devbox"), &target("c.png"), &gate, fake.reader()).await;
            assert!(third.is_ok());
        });
    }

    #[test]
    fn ac18_a_finished_read_restarts_the_wait() {
        let fake = FakeHost::new();
        for name in ["a", "b", "c"] {
            fake.file(&format!("/srv/p/{name}.png"), b"X");
        }
        fake.set_delay(Duration::from_millis(120));
        let mut limits = testkit::limits();
        limits.host_wait = Duration::from_millis(200);
        let gate = Arc::new(ReadGate::new(limits));
        // Three reads of 120 ms each in a row: the last waits about 240 ms in
        // total, but never 200 ms without a finished read.
        let results = run(async {
            let mut jobs = Vec::new();
            for name in ["a.png", "b.png", "c.png"] {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                jobs.push(tokio::spawn(async move {
                    read_remote(&grant_on("devbox"), &target(name), &gate, fake.reader()).await.is_ok()
                }));
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            let mut out = Vec::new();
            for job in jobs {
                out.push(job.await.unwrap());
            }
            out
        });
        assert_eq!(results, vec![true, true, true]);
    }

    #[test]
    fn ac34_the_read_budget_reaches_the_host_and_frees_the_slot() {
        let fake = FakeHost::new();
        fake.file("/srv/p/a.png", b"A");
        fake.file("/srv/p/b.png", b"B");
        fake.hang_for_budget("/srv/p/a.png");
        let mut limits = testkit::limits();
        limits.ssh_read_budget = Duration::from_millis(300);
        limits.host_wait = Duration::from_secs(5);
        let gate = Arc::new(ReadGate::new(limits));
        run(async {
            let started = Instant::now();
            let first = {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                tokio::spawn(async move {
                    let result = read_remote(&grant_on("devbox"), &target("a.png"), &gate, fake.reader()).await;
                    (result, started.elapsed())
                })
            };
            tokio::time::sleep(Duration::from_millis(20)).await;
            let second = read_remote(&grant_on("devbox"), &target("b.png"), &gate, fake.reader()).await;
            let second_done = started.elapsed();
            let (first, first_done) = first.await.unwrap();
            let refusal = first.unwrap_err();
            assert_eq!(
                (refusal.status(), refusal.body().as_str()),
                (504, "Terax could not read a.png from devbox: timed out")
            );
            assert!(first_done >= Duration::from_millis(300) && first_done < Duration::from_secs(1), "{first_done:?}");
            assert_eq!(second.map(|l| l.bytes).ok().as_deref(), Some(&b"B"[..]));
            assert!(second_done < Duration::from_secs(5), "{second_done:?}");
        });
        let budgets: Vec<Duration> = fake.calls().iter().map(|c| c.budget).collect();
        assert_eq!(budgets, vec![Duration::from_millis(300), Duration::from_millis(300)]);
    }

    #[test]
    fn ac34_production_limits() {
        let l = Limits::PRODUCTION;
        assert_eq!(l.ssh_read_budget, Duration::from_secs(60));
        assert_eq!(l.host_wait, Duration::from_secs(30));
        assert_eq!(l.head_budget, Duration::from_secs(10));
        assert_eq!(l.write_budget, Duration::from_secs(30));
        assert_eq!(l.retry_pause, Duration::from_millis(250));
        assert_eq!((l.connections_per_grant, l.connections_total), (16, 64));
        assert_eq!((l.reads_total, l.reads_per_host), (8, 1));
        assert_eq!((l.head_bytes, l.head_lines), (64 * 1024, 64));
        assert_eq!(l.grants, 256);
        // Tests shorten only the times.
        let t = testkit::limits();
        assert_eq!(
            (t.connections_per_grant, t.connections_total, t.reads_total, t.reads_per_host, t.head_bytes, t.head_lines, t.grants),
            (l.connections_per_grant, l.connections_total, l.reads_total, l.reads_per_host, l.head_bytes, l.head_lines, l.grants)
        );
    }

    #[test]
    fn ac12_reasons_keep_their_wording() {
        assert_eq!(check_blocklist("/p/.git/x"), Err("path is inside a .git folder".to_string()));
        assert_eq!(FAKE_PDF_REASON, "not a real PDF");
    }

    #[test]
    fn ac11_a_target_must_be_normalized_and_inside() {
        let fake = FakeHost::new();
        fake.file("/etc/secret.png", b"OUTSIDE");
        fake.file("/srv/p/", b"FOLDER");
        fake.file("/srv/p/./a.png", b"DOT");
        fake.link("/srv/p/dd.png", "/srv/p/../../etc/secret.png");
        fake.link("/srv/p/self.png", "/srv/p/");
        fake.link("/srv/p/root.png", "/srv/p");
        fake.link("/srv/p/dot.png", "/srv/p/./a.png");
        fake.link("/srv/p/rel.png", "srv/p/a.png");
        fake.file("srv/p/a.png", b"REL");
        fake.file("/srv/p", b"ROOT");
        fake.file("/srv/p/../../etc/secret.png", b"OUTSIDE");
        let gate = ReadGate::new(testkit::limits());
        for name in ["dd.png", "self.png", "root.png", "dot.png", "rel.png"] {
            let got = remote(&fake, &gate, &remote_grant(), name);
            assert_eq!(outcome(got), refused(), "{name}");
        }
        for path in ["/srv/p/a", "C:/p/a"] {
            assert!(is_normalized(path), "{path}");
        }
        for path in ["srv/p", "/", "/srv//a", "/srv/./a", "/srv/../a", "/srv/a/", "C:", "C:/"] {
            assert!(!is_normalized(path), "{path}");
        }
    }

    /// Sicherheitsmodell 7
    #[cfg(unix)]
    #[test]
    fn ac11_the_opened_file_is_checked_not_the_name() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let p = d.join("p");
        write(&p.join("a.html"), b"<html>");
        write(&p.join("sub/y.png"), b"Y");
        write(&d.join("outside.png"), b"OUTSIDE");
        let grant = local_grant(&p.join("a.html"), Some(&p), EntryKind::Html);

        // The handle, not the name: after a rename the open file reports
        // where it is now.
        let file = open_for_reading(&p.join("sub/y.png")).unwrap();
        std::fs::rename(p.join("sub/y.png"), d.join("moved.png")).unwrap();
        assert_eq!(path_text(&opened_path(&file, &p.join("sub/y.png")).unwrap()).unwrap(), canon(&d.join("moved.png")));

        // A checked path swapped for a link to the outside before opening.
        std::os::unix::fs::symlink(d.join("outside.png"), p.join("sub/y.png")).unwrap();
        let swapped = std::path::PathBuf::from(canon(&p.join("sub")) + "/y.png");
        let refusal = open_checked(&grant, &swapped, "y.png").unwrap_err();
        assert_eq!((refusal.status(), refusal.body()), (403, "Refused by Terax".to_string()));
    }

    #[test]
    fn ac13_the_server_checks_the_size_even_if_the_host_does_not() {
        let fake = FakeHost::new();
        fake.ignore_limit();
        fake.file("/srv/p/big.png", &vec![0u8; MAX_READ_BYTES as usize + 1]);
        fake.file("/srv/p/exact.png", &vec![0u8; MAX_READ_BYTES as usize]);
        let gate = ReadGate::new(testkit::limits());
        let refusal = remote(&fake, &gate, &remote_grant(), "big.png").unwrap_err();
        assert_eq!((refusal.status(), refusal.body().as_str()), (403, "Larger than 10 MB"));
        let exact = remote(&fake, &gate, &remote_grant(), "exact.png").unwrap();
        assert_eq!(exact.bytes.len() as u64, MAX_READ_BYTES);
    }

    #[test]
    fn ac16_the_page_never_shows_the_hosts_text() {
        let host_text = "[Errno 13] Permission denied: '/home/c/private/x.png'\r\nssh: connect to host 10.1.2.3";
        for error in [RemoteReadError::Failed(host_text.into()), RemoteReadError::Unreachable(host_text.into())] {
            let fake = FakeHost::new();
            fake.file("/srv/p/y.png", b"Y");
            fake.fail_next(error.clone());
            fake.fail_next(error.clone());
            let gate = ReadGate::new(testkit::limits());
            let refusal = remote(&fake, &gate, &remote_grant(), "y.png").unwrap_err();
            let body = refusal.body();
            assert!(!body.contains("Errno") && !body.contains("10.1.2.3") && !body.contains("/home/c"), "{body}");
            let Refusal::BadGateway { detail, .. } = refusal else {
                panic!("{refusal:?}")
            };
            assert!(!detail.contains('\r') && !detail.contains('\n'), "{detail:?}");
        }
        assert_eq!(clean_detail(&"x".repeat(500)).chars().count(), DETAIL_CHARS + 1);
        assert_eq!(clean_detail(" a\u{0}b\n"), "a b");
    }

    #[test]
    fn ac18_the_wait_and_the_budget_are_told_apart() {
        let fake = FakeHost::new();
        fake.file("/srv/p/y.png", b"Y");
        fake.fail_next(RemoteReadError::TimedOut("budget".into()));
        let gate = ReadGate::new(testkit::limits());
        let budget = remote(&fake, &gate, &remote_grant(), "y.png").unwrap_err();
        assert!(matches!(budget, Refusal::TimedOut { cause: Timeout::Budget, .. }), "{budget:?}");
        assert!(matches!(
            remote_refusal(ReadFailure::Waited, "y.png", "devbox"),
            Refusal::TimedOut { cause: Timeout::Wait, .. }
        ));
    }

    #[test]
    fn ac18_a_restarted_wait_keeps_its_place_in_the_queue() {
        let fake = FakeHost::new();
        for name in ["a", "b", "c", "d"] {
            fake.file(&format!("/srv/p/{name}.png"), b"X");
        }
        let (first, second) = (Latch::new(), Latch::new());
        fake.hold("/srv/p/a.png", &first);
        fake.hold("/srv/p/b.png", &second);
        let mut limits = testkit::limits();
        limits.host_wait = Duration::from_millis(200);
        let gate = Arc::new(ReadGate::new(limits));
        let spawn = |name: &'static str| {
            let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
            tokio::spawn(async move {
                read_remote(&grant_on("devbox"), &target(name), &gate, fake.reader()).await.is_ok()
            })
        };
        let order = run(async {
            let a = spawn("a.png");
            first.wait_until_entered().await;
            let b = spawn("b.png");
            tokio::time::sleep(Duration::from_millis(10)).await;
            // c waits from about 10 ms; its first deadline (about 210 ms)
            // falls after the progress at 100 ms, so it restarts there.
            let c = spawn("c.png");
            tokio::time::sleep(Duration::from_millis(90)).await;
            first.open();
            second.wait_until_entered().await;
            tokio::time::sleep(Duration::from_millis(50)).await;
            // d queues before c restarts; c must still come first.
            let d = spawn("d.png");
            tokio::time::sleep(Duration::from_millis(100)).await;
            second.open();
            for job in [a, b, c, d] {
                assert!(job.await.unwrap());
            }
            fake.calls().into_iter().map(|c| c.path).collect::<Vec<_>>()
        });
        assert_eq!(order, ["/srv/p/a.png", "/srv/p/b.png", "/srv/p/c.png", "/srv/p/d.png"]);
    }

    #[test]
    fn ac17_waiting_for_one_of_the_eight_slots_ends_with_504() {
        let fake = FakeHost::new();
        for i in 0..9 {
            fake.file(&format!("/srv/p/h{i}.png"), b"X");
        }
        let mut limits = testkit::limits();
        limits.host_wait = Duration::from_millis(200);
        let gate = Arc::new(ReadGate::new(limits));
        run(async {
            let mut held = Vec::new();
            for i in 0..8 {
                let path = format!("/srv/p/h{i}.png");
                let latch_i = Latch::new();
                fake.hold(&path, &latch_i);
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                let job = tokio::spawn(async move {
                    let host = format!("box{i}");
                    read_remote(&grant_on(&host), &target(&format!("h{i}.png")), &gate, fake.reader()).await.is_ok()
                });
                latch_i.wait_until_entered().await;
                held.push((job, latch_i));
            }
            let started = Instant::now();
            let ninth = read_remote(&grant_on("box8"), &target("h8.png"), &gate, fake.reader()).await;
            let refusal = ninth.unwrap_err();
            assert_eq!(refusal.status(), 504);
            assert!(started.elapsed() >= Duration::from_millis(200), "{:?}", started.elapsed());
            for (job, latch) in held {
                latch.open();
                assert!(job.await.unwrap());
            }
        });
    }

    #[test]
    fn ac16_the_retry_keeps_the_host_slot() {
        let fake = FakeHost::new();
        fake.file("/srv/p/a.png", b"A");
        fake.file("/srv/p/b.png", b"B");
        fake.fail_next(RemoteReadError::Unreachable("gone".into()));
        let mut limits = testkit::limits();
        limits.retry_pause = Duration::from_millis(150);
        let gate = Arc::new(ReadGate::new(limits));
        run(async {
            let first = {
                let (fake, gate) = (Arc::clone(&fake), Arc::clone(&gate));
                tokio::spawn(async move { read_remote(&grant_on("devbox"), &target("a.png"), &gate, fake.reader()).await.is_ok() })
            };
            tokio::time::sleep(Duration::from_millis(40)).await;
            // During the pause after the first attempt.
            assert!(read_remote(&grant_on("devbox"), &target("b.png"), &gate, fake.reader()).await.is_ok());
            assert!(first.await.unwrap());
        });
        let order: Vec<String> = fake.calls().into_iter().map(|c| c.path).collect();
        assert_eq!(order, ["/srv/p/a.png", "/srv/p/a.png", "/srv/p/b.png"]);
        assert_eq!(fake.peak_on("devbox"), 1);
    }
}
