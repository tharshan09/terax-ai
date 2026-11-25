//! Reading a requested file through the same chain for every file of a
//! grant, entry and neighbours alike, never `trusted`: scope by text, deny-list
//! on the text, resolve, scope and deny-list on the resolved target (locally
//! again on the opened file), regular file, 10 MiB, PDF magic.

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

use super::grant::Grant;
use super::policy::{self, Art, Served};
use super::request::Target;
use super::Limits;

pub(crate) const GIT_REASON: &str = "path is inside a .git folder";
pub(crate) const FAKE_PDF_REASON: &str = "not a real PDF";
const OUTSIDE_REASON: &str = "path is outside the shared folder";

/// The bytes of a file and how to serve them.
#[derive(Debug)]
pub(crate) struct Loaded {
    pub bytes: Vec<u8>,
    pub served: Served,
}

/// Why a file is not served. `Refused` carries the reason for the log and the
/// click; the browser only sees the fixed text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Refusal {
    NotFound,
    Refused(String),
    TooLarge,
    /// `502`: the host could not be read (`Unreachable` after the retry, or
    /// `Failed`).
    BadGateway {
        name: String,
        host: String,
        reason: String,
    },
    /// `504`: the read hit its budget or the wait for the host's slot ended.
    TimedOut {
        name: String,
        host: String,
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

    /// The text page the browser gets.
    pub(crate) fn body(&self) -> String {
        match self {
            Self::NotFound => "Not found".to_string(),
            Self::Refused(_) => "Refused by Terax".to_string(),
            Self::TooLarge => "Larger than 10 MB".to_string(),
            Self::BadGateway { name, host, reason } => {
                format!("Terax could not read {name} from {host}: {reason}")
            }
            Self::TimedOut { name, host } => {
                format!("Terax could not read {name} from {host}: timed out")
            }
        }
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

/// VAL-6 and VAL-7 on a resolved target.
fn check_target(grant: &Grant, resolved: &str) -> Result<(), Refusal> {
    let in_scope = match &grant.root {
        Some(root) => within(resolved, root),
        None => resolved == grant.entry,
    };
    if !in_scope {
        return Err(Refusal::Refused(OUTSIDE_REASON.to_string()));
    }
    check_blocklist(resolved).map_err(Refusal::Refused)
}

/// The type to serve, and VAL-9 for a PDF.
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
    let file = open_for_reading(&resolved).map_err(|e| {
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
    let opened = opened_path(&file, &resolved).map_err(|e| {
        log::debug!("preview server: cannot check the opened {name}: {e}");
        Refusal::Refused("the opened file could not be checked".to_string())
    })?;
    let opened_text =
        path_text(&opened).ok_or_else(|| Refusal::Refused("path is not valid UTF-8".to_string()))?;
    check_target(grant, &opened_text)?;
    if meta.len() > MAX_READ_BYTES {
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

/// Without `O_NONBLOCK` opening a FIFO named like an image would hang the
/// thread; a regular file reads the same either way.
#[cfg(unix)]
fn open_for_reading(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .open(path)
}

#[cfg(not(unix))]
fn open_for_reading(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::File::open(path)
}

/// The path of the file that is actually open, so a link swapped between
/// resolving and opening is caught.
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

#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn opened_path(file: &std::fs::File, _resolved: &Path) -> std::io::Result<PathBuf> {
    use std::os::unix::io::AsRawFd;
    std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

/// Windows has no cheap path of a handle here; the path is resolved again.
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

/// SEC-14 and OB-12: at most `reads_total` SSH reads at once, `reads_per_host`
/// of them per host; a file waits at most `host_wait` without progress.
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
        loop {
            let deadline = since() + self.limits.host_wait;
            match tokio::time::timeout_at(deadline, Arc::clone(&slot.permits).acquire_owned()).await {
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
    async fn read(&self, host: &str, path: &str, read: Arc<ReadFn>) -> Result<RemoteFileBytes, RemoteReadError> {
        let waited = || RemoteReadError::TimedOut("waited too long for the host".to_string());
        let slot = self.slot(host);
        let host_permit = self.wait_for_host(&slot).await.ok_or_else(waited)?;
        let total_permit = tokio::time::timeout(self.limits.host_wait, Arc::clone(&self.total).acquire_owned())
            .await
            .ok()
            .and_then(Result::ok)
            .ok_or_else(waited)?;
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
            result
        })
        .await
        .unwrap_or_else(|e| Err(RemoteReadError::Failed(format!("the read task failed: {e}"))))
    }
}

/// What the browser gets for a failed SSH read; only the variant counts.
fn remote_refusal(error: RemoteReadError, name: &str, host: &str) -> Refusal {
    let (name, host) = (name.to_string(), host.to_string());
    match error {
        RemoteReadError::Missing | RemoteReadError::NotRegularFile => Refusal::NotFound,
        RemoteReadError::TooLarge => Refusal::TooLarge,
        RemoteReadError::TimedOut(_) => Refusal::TimedOut { name, host },
        RemoteReadError::Unreachable(reason) | RemoteReadError::Failed(reason) => {
            Refusal::BadGateway { name, host, reason }
        }
    }
}

/// Reads a file of an SSH grant on `host`, the host of that grant. The
/// deny-list runs on the text before anything is sent, scope and deny-list
/// again on the target the host reports.
pub(crate) async fn read_remote(
    grant: &Grant,
    host: &str,
    target: &Target,
    gate: &ReadGate,
    read: Arc<ReadFn>,
) -> Result<Loaded, Refusal> {
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
        let Location::Ssh { host } = &grant.location else {
            panic!("an SSH grant")
        };
        run(read_remote(grant, host, &target(rel), gate, fake.reader()))
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
                "Terax could not read y.png from devbox: boom",
                1,
            ),
            (
                vec![RemoteReadError::Unreachable("gone".into()), RemoteReadError::Unreachable("gone".into())],
                502,
                "Terax could not read y.png from devbox: gone",
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
                    read_remote(&grant, host, &target("y.png"), &gate, fake.reader()).await.map(|l| l.bytes)
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
                    read_remote(&grant, &host, &target("y.png"), &gate, fake.reader()).await.is_ok()
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
                    read_remote(&grant_on("devbox"), "devbox", &target("a.png"), &gate, fake.reader()).await.is_ok()
                })
            };
            latch.wait_until_entered().await;

            let started = Instant::now();
            let second = read_remote(&grant_on("devbox"), "devbox", &target("b.png"), &gate, fake.reader()).await;
            let waited = started.elapsed();
            let refusal = second.unwrap_err();
            assert_eq!(
                (refusal.status(), refusal.body().as_str()),
                (504, "Terax could not read b.png from devbox: timed out")
            );
            assert!(waited >= Duration::from_millis(200), "{waited:?}");

            let started = Instant::now();
            let other = read_remote(&grant_on("box2"), "box2", &target("c.png"), &gate, fake.reader()).await;
            assert_eq!(other.map(|l| l.bytes).ok().as_deref(), Some(&b"C"[..]));
            assert!(started.elapsed() < Duration::from_millis(200), "{:?}", started.elapsed());

            latch.open();
            assert!(first.await.unwrap());
            let third = read_remote(&grant_on("devbox"), "devbox", &target("c.png"), &gate, fake.reader()).await;
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
                    read_remote(&grant_on("devbox"), "devbox", &target(name), &gate, fake.reader()).await.is_ok()
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
                    let result = read_remote(&grant_on("devbox"), "devbox", &target("a.png"), &gate, fake.reader()).await;
                    (result, started.elapsed())
                })
            };
            tokio::time::sleep(Duration::from_millis(20)).await;
            let second = read_remote(&grant_on("devbox"), "devbox", &target("b.png"), &gate, fake.reader()).await;
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
}
