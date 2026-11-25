//! The preview server: a link per location, entry file and class (browser or
//! in-app frame), each with its own listener on `127.0.0.1:0` (the M-C
//! fallback for the frame adds `[::1]` on the same port) and a 256-bit
//! secret as the first path segment. Every file of a link passes the same
//! checks in `source.rs`, never as `trusted`; SSH files are read through
//! `ssh::read_bytes_typed`, one read per host at a time and at most 60 s
//! each. The address is built and opened here and never reaches the webview,
//! except as the frame address of `preview_frame_source`. Links live in
//! memory until the process ends; nothing is stored.

mod grant;
mod listener;
pub mod policy;
mod request;
mod source;

use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener as StdListener};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde::Serialize;
use tauri::Manager;
use tokio::sync::Semaphore;

use crate::modules::fs::file::{is_pdf_magic, StatKind, MAX_READ_BYTES};
use crate::modules::ssh::RemoteReadError;
use crate::modules::workspace::WorkspaceEnv;

use grant::{basename, grant_scope, new_token, Grant, GrantClass, HostName, Location};
use listener::{serve_listener, Shared};
use policy::EntryKind;
use source::{check_blocklist, clean_detail, open_for_reading, path_text, Remote, FAKE_PDF_REASON};

/// Fallback address `localhost` (with `[::1]` on the same port) for the
/// `frame` class, should WebKit refuse `127.0.0.1` in the app frame.
/// UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
pub(crate) const FRAME_LOCALHOST_FALLBACK: bool = false;

/// Tries to find a port that is free on both loopbacks.
/// UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
const BIND_ATTEMPTS: usize = 16;

/// RFC 3986 "unreserved" stays, every other byte of the UTF-8 name is
/// percent-encoded (OB-9).
const NAME_SET: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'.').remove(b'_').remove(b'~');

/// Every limit of the server. Tests shorten only the times.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Limits {
    pub connections_per_grant: usize,
    pub connections_total: usize,
    pub head_bytes: usize,
    pub head_lines: usize,
    pub head_budget: Duration,
    pub reads_total: usize,
    pub reads_per_host: usize,
    pub retry_pause: Duration,
    /// Longest wait for a host's read slot without a finished read (OB-12).
    pub host_wait: Duration,
    pub write_budget: Duration,
    pub grants: usize,
    /// Whole budget of one SSH read, handed to `read_bytes_typed`.
    pub ssh_read_budget: Duration,
}

impl Limits {
    pub(crate) const PRODUCTION: Self = Self {
        connections_per_grant: 16,
        connections_total: 64,
        head_bytes: 64 * 1024,
        head_lines: 64,
        head_budget: Duration::from_secs(10),
        reads_total: 8,
        reads_per_host: 1,
        retry_pause: Duration::from_millis(250),
        host_wait: Duration::from_secs(30),
        write_budget: Duration::from_secs(30),
        grants: 256,
        ssh_read_budget: Duration::from_secs(60),
    };
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Config {
    pub limits: Limits,
    pub frame_localhost: bool,
    pub frame_ancestors: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            limits: Limits::PRODUCTION,
            frame_localhost: FRAME_LOCALHOST_FALLBACK,
            frame_ancestors: policy::FRAME_ANCESTORS,
        }
    }
}

type HomeFn = dyn Fn() -> Option<PathBuf> + Send + Sync;

/// The links of one Terax run and what they share.
pub(crate) struct Core {
    frame_localhost: bool,
    local_home: Arc<HomeFn>,
    shared: Arc<Shared>,
    grants: Mutex<Vec<Arc<Grant>>>,
    /// Home of each SSH host, asked once (SVC-2).
    remote_homes: Mutex<HashMap<String, String>>,
}

impl Default for Core {
    fn default() -> Self {
        Self::new(Config::default(), Remote::ssh(), Arc::new(dirs::home_dir))
    }
}

/// Grants of the preview server, kept in memory until the process ends. No
/// socket exists before the first link.
#[derive(Default)]
pub struct PreviewServer {
    core: Arc<Core>,
}

impl PreviewServer {
    fn core(&self) -> Arc<Core> {
        Arc::clone(&self.core)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserOpenStatus {
    Opened,
    Unsupported,
    Refused,
    TooLarge,
    Unreachable,
    LimitReached,
    OpenFailed,
}

/// `reason` is set only for `refused`, `unreachable` and `open_failed`; never
/// an address, a port or a token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserOpen {
    pub status: BrowserOpenStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FrameStatus {
    Ready,
    Unsupported,
    Refused,
    TooLarge,
    Unreachable,
    LimitReached,
}

/// `url` is set only for `ready` and goes to the in-app iframe only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSource {
    pub status: FrameStatus,
    pub url: Option<String>,
    pub reason: Option<String>,
}

/// Opens the entry address in the default browser from the Rust side, so the
/// webview's opener scope needs no entry.
fn open_in_default_browser(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Shares the file in the default browser (API-1); the answer never names
/// the address.
#[tauri::command]
pub async fn preview_open_in_browser(
    app: tauri::AppHandle,
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<BrowserOpen, String> {
    let core = app.state::<PreviewServer>().core();
    core.open_in_browser(path, workspace, open_in_default_browser).await
}

/// The address of an HTML file for the in-app preview frame (API-8).
#[tauri::command]
pub async fn preview_frame_source(
    app: tauri::AppHandle,
    path: String,
    workspace: Option<WorkspaceEnv>,
) -> Result<FrameSource, String> {
    let core = app.state::<PreviewServer>().core();
    core.frame_source(path, workspace).await
}

/// Why no link is handed out.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Denial {
    Unsupported,
    Refused(String),
    TooLarge,
    Unreachable(String),
    LimitReached,
}

impl Denial {
    fn browser_open(self) -> BrowserOpen {
        let (status, reason) = match self {
            Self::Unsupported => (BrowserOpenStatus::Unsupported, None),
            Self::Refused(reason) => (BrowserOpenStatus::Refused, Some(reason)),
            Self::TooLarge => (BrowserOpenStatus::TooLarge, None),
            Self::Unreachable(reason) => (BrowserOpenStatus::Unreachable, Some(reason)),
            Self::LimitReached => (BrowserOpenStatus::LimitReached, None),
        };
        BrowserOpen { status, reason }
    }

    fn frame_source(self) -> FrameSource {
        let (status, reason) = match self {
            Self::Unsupported => (FrameStatus::Unsupported, None),
            Self::Refused(reason) => (FrameStatus::Refused, Some(reason)),
            Self::TooLarge => (FrameStatus::TooLarge, None),
            Self::Unreachable(reason) => (FrameStatus::Unreachable, Some(reason)),
            Self::LimitReached => (FrameStatus::LimitReached, None),
        };
        FrameSource {
            status,
            url: None,
            reason,
        }
    }
}

/// A checked entry file, ready for a grant.
struct Entry {
    location: Location,
    path: String,
    kind: EntryKind,
    root: Option<String>,
}

const OTHER_KIND_REASON: &str = "the link points to a different kind of file";
const BAD_NAME_REASON: &str = "the file name cannot be served";
const NOT_REGULAR_REASON: &str = "not a regular file";
/// An opener error that still names a part of the link after scrubbing.
const OPEN_FAILED_REASON: &str = "the default browser could not be started";

/// Why a typed SSH call failed, as the click shows it: the host's text
/// cleaned and shortened (it carries the MaxSessions reason of OB-14).
fn remote_reason(error: RemoteReadError) -> String {
    match error {
        RemoteReadError::Unreachable(reason)
        | RemoteReadError::TimedOut(reason)
        | RemoteReadError::Failed(reason) => clean_detail(&reason),
        RemoteReadError::Missing => "no such file".to_string(),
        RemoteReadError::NotRegularFile => "not a regular file".to_string(),
        RemoteReadError::TooLarge => "larger than 10 MB".to_string(),
    }
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|e| format!("preview server task failed: {e}"))
}

/// The kind of a resolved entry, held against the kind of the clicked name
/// (E1): the resolved name decides; another kind than the clicked one is
/// refused, a name the server could never serve too.
fn resolved_kind(clicked: EntryKind, resolved: &str) -> Result<EntryKind, Denial> {
    let name = basename(resolved);
    let kind = policy::entry_kind(name, policy::WAVE).ok_or(Denial::Unsupported)?;
    if kind != clicked {
        return Err(Denial::Refused(OTHER_KIND_REASON.to_string()));
    }
    if !request::acceptable_segment(name) {
        return Err(Denial::Refused(BAD_NAME_REASON.to_string()));
    }
    Ok(kind)
}

/// The local home resolved like the entry (OB-3); `None` with a warning when
/// it is unknown, not resolvable or not UTF-8, so the grant gets only the file.
fn local_home(home: Option<PathBuf>) -> Option<String> {
    let Some(home) = home else {
        log::warn!("preview server: the home folder is unknown, sharing only the file");
        return None;
    };
    let resolved = match std::fs::canonicalize(&home) {
        Ok(resolved) => resolved,
        Err(e) => {
            log::warn!("preview server: cannot resolve the home folder ({e}), sharing only the file");
            return None;
        }
    };
    let text = path_text(&resolved);
    if text.is_none() {
        log::warn!("preview server: the home folder is not valid UTF-8, sharing only the file");
    }
    text
}

/// VAL-7 to VAL-10 and the scope for a local entry. Blocking.
fn local_entry(path: &str, clicked: EntryKind, home: Option<PathBuf>) -> Result<Entry, Denial> {
    check_blocklist(path).map_err(Denial::Refused)?;
    let resolved = std::fs::canonicalize(path).map_err(|e| {
        log::info!("preview server: cannot resolve the file to share: {e}");
        Denial::Refused("the file cannot be found".to_string())
    })?;
    let text = path_text(&resolved).ok_or_else(|| Denial::Refused("path is not valid UTF-8".to_string()))?;
    check_blocklist(&text).map_err(Denial::Refused)?;
    let kind = resolved_kind(clicked, &text)?;
    let meta = std::fs::metadata(&resolved).map_err(|e| Denial::Refused(e.to_string()))?;
    if !meta.is_file() {
        return Err(Denial::Refused(NOT_REGULAR_REASON.to_string()));
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(Denial::TooLarge);
    }
    if kind == EntryKind::Pdf && !starts_as_pdf(&resolved).map_err(|e| Denial::Refused(e.to_string()))? {
        return Err(Denial::Refused(FAKE_PDF_REASON.to_string()));
    }
    let root = grant_scope(&text, local_home(home).as_deref(), kind);
    Ok(Entry {
        location: Location::Local,
        path: text,
        kind,
        root,
    })
}

fn starts_as_pdf(path: &std::path::Path) -> std::io::Result<bool> {
    use std::io::Read;
    let mut head = Vec::new();
    open_for_reading(path)?.take(8).read_to_end(&mut head)?;
    Ok(is_pdf_magic(&head))
}

/// The address the link opens: always with the IP for the browser (a
/// `[::1]` listener cannot take `localhost` over), the file name encoded.
fn entry_url(grant: &Grant) -> String {
    format!(
        "http://{}/{}/{}",
        grant.host_name.authority(grant.port),
        grant.token,
        utf8_percent_encode(grant.entry_name(), NAME_SET)
    )
}

/// The opener's error without the link: the address (encoded and decoded),
/// the secret and the authority become `<link>`; if any piece of the secret
/// or the port is still there, a fixed reason replaces the whole text.
fn scrub_link(error: &str, grant: &Grant, url: &str) -> String {
    let decoded = percent_encoding::percent_decode_str(url).decode_utf8_lossy().into_owned();
    let scrubbed = clean_detail(&error.replace(url, "<link>").replace(&decoded, "<link>"))
        .replace(&grant.token, "<link>")
        .replace(&grant.host_name.authority(grant.port), "<link>");
    let leaks = grant.token.as_bytes().windows(8).any(|piece| scrubbed.as_bytes().windows(8).any(|w| w == piece))
        || scrubbed.contains(&grant.port.to_string());
    if leaks {
        OPEN_FAILED_REASON.to_string()
    } else {
        scrubbed
    }
}

/// Builds the entry address and opens it (SVC-11). An opener error never
/// carries the address back (`scrub_link`).
async fn open_entry(grant: &Grant, open: impl FnOnce(&str) -> Result<(), String> + Send + 'static) -> Result<BrowserOpen, String> {
    let url = entry_url(grant);
    let opened = {
        let url = url.clone();
        blocking(move || open(&url)).await?
    };
    Ok(match opened {
        Ok(()) => BrowserOpen {
            status: BrowserOpenStatus::Opened,
            reason: None,
        },
        Err(error) => {
            let reason = scrub_link(&error, grant, &url);
            log::info!("preview server: the browser did not open: {reason}");
            BrowserOpen {
                status: BrowserOpenStatus::OpenFailed,
                reason: Some(reason),
            }
        }
    })
}

/// Binds the listeners of a new grant: `127.0.0.1:0`, and for `localhost`
/// also `[::1]` on the same port.
fn bind_listeners(host_name: HostName) -> std::io::Result<(u16, Vec<StdListener>)> {
    match host_name {
        HostName::Ip => {
            let v4 = StdListener::bind((Ipv4Addr::LOCALHOST, 0))?;
            Ok((v4.local_addr()?.port(), vec![v4]))
        }
        HostName::Localhost => bind_both_loopbacks(),
    }
}

/// One port on both loopbacks, so a process that binds `[::1]` later cannot
/// take `localhost` over; if `[::1]` is taken on the port the OS picked, the
/// first socket is given back and another port is tried. Modelled on
/// `bind_all` in `ports.rs`, whose helpers are private there. Without an IPv6
/// loopback only `127.0.0.1` is bound.
/// UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
fn bind_both_loopbacks() -> std::io::Result<(u16, Vec<StdListener>)> {
    if StdListener::bind((Ipv6Addr::LOCALHOST, 0)).is_err() {
        let v4 = StdListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        return Ok((v4.local_addr()?.port(), vec![v4]));
    }
    for _ in 0..BIND_ATTEMPTS {
        let v4 = StdListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let port = v4.local_addr()?.port();
        match StdListener::bind((Ipv6Addr::LOCALHOST, port)) {
            Ok(v6) => return Ok((port, vec![v4, v6])),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        "no port free on both loopbacks",
    ))
}

impl Core {
    pub(crate) fn new(config: Config, remote: Remote, local_home: Arc<HomeFn>) -> Self {
        Self {
            frame_localhost: config.frame_localhost,
            local_home,
            shared: Arc::new(Shared::new(config.limits, config.frame_ancestors, remote)),
            grants: Mutex::new(Vec::new()),
            remote_homes: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn open_in_browser(
        &self,
        path: String,
        workspace: Option<WorkspaceEnv>,
        open: impl FnOnce(&str) -> Result<(), String> + Send + 'static,
    ) -> Result<BrowserOpen, String> {
        match self.grant_for(path, workspace, GrantClass::Browser).await? {
            Ok(grant) => open_entry(&grant, open).await,
            Err(denial) => Ok(denial.browser_open()),
        }
    }

    pub(crate) async fn frame_source(&self, path: String, workspace: Option<WorkspaceEnv>) -> Result<FrameSource, String> {
        Ok(match self.grant_for(path, workspace, GrantClass::Frame).await? {
            Ok(grant) => FrameSource {
                status: FrameStatus::Ready,
                url: Some(entry_url(&grant)),
                reason: None,
            },
            Err(denial) => denial.frame_source(),
        })
    }

    /// VAL-10, the entry checks of its location, then the grant (SVC-1).
    async fn grant_for(
        &self,
        path: String,
        workspace: Option<WorkspaceEnv>,
        class: GrantClass,
    ) -> Result<Result<Arc<Grant>, Denial>, String> {
        let name = grant::basename(&path).to_string();
        let Some(kind) = policy::entry_kind(&name, policy::WAVE) else {
            return Ok(Err(Denial::Unsupported));
        };
        let entry = match WorkspaceEnv::from_option(workspace) {
            WorkspaceEnv::Wsl { .. } => Err(Denial::Unsupported),
            WorkspaceEnv::Local => {
                let home = Arc::clone(&self.local_home);
                blocking(move || local_entry(&path, kind, home())).await?
            }
            WorkspaceEnv::Ssh { host } => self.remote_entry(host, path, kind).await?,
        };
        let granted = match entry {
            // The in-app frame is the HTML preview only, by the resolved kind.
            Ok(entry) if class == GrantClass::Frame && entry.kind != EntryKind::Html => Err(Denial::Unsupported),
            Ok(entry) => self.grant(entry, class)?,
            Err(denial) => Err(denial),
        };
        if let Err(denial) = &granted {
            log::info!("preview server: {name} not shared ({class:?}): {denial:?}");
        }
        Ok(granted)
    }

    /// The same checks over SSH: the text first, then `realpath_typed`, the
    /// deny-list on the resolved path, the size by `stat_typed`. Every failed
    /// call is `unreachable` with the text of its variant.
    async fn remote_entry(&self, host: String, path: String, kind: EntryKind) -> Result<Result<Entry, Denial>, String> {
        if let Err(reason) = check_blocklist(&path) {
            return Ok(Err(Denial::Refused(reason)));
        }
        let remote = self.shared.remote.clone();
        let resolved = {
            let (realpath, host, path) = (Arc::clone(&remote.realpath), host.clone(), path.clone());
            match blocking(move || realpath(&host, &path)).await? {
                Ok(resolved) => resolved,
                Err(e) => return Ok(Err(Denial::Unreachable(remote_reason(e)))),
            }
        };
        if let Err(reason) = check_blocklist(&resolved) {
            return Ok(Err(Denial::Refused(reason)));
        }
        let kind = match resolved_kind(kind, &resolved) {
            Ok(kind) => kind,
            Err(denial) => return Ok(Err(denial)),
        };
        let stat = {
            let (stat, host, resolved) = (Arc::clone(&remote.stat), host.clone(), resolved.clone());
            match blocking(move || stat(&host, &resolved)).await? {
                Ok(stat) => stat,
                Err(e) => return Ok(Err(Denial::Unreachable(remote_reason(e)))),
            }
        };
        if !matches!(stat.kind, StatKind::File) {
            return Ok(Err(Denial::Refused(NOT_REGULAR_REASON.to_string())));
        }
        if stat.size > MAX_READ_BYTES {
            return Ok(Err(Denial::TooLarge));
        }
        let home = match kind {
            EntryKind::Html | EntryKind::Markdown => match self.remote_home(&host).await? {
                Ok(home) => Some(home),
                Err(e) => return Ok(Err(Denial::Unreachable(remote_reason(e)))),
            },
            EntryKind::Image | EntryKind::Pdf => None,
        };
        let root = grant_scope(&resolved, home.as_deref(), kind);
        Ok(Ok(Entry {
            location: Location::Ssh { host },
            path: resolved,
            kind,
            root,
        }))
    }

    async fn remote_home(&self, host: &str) -> Result<Result<String, RemoteReadError>, String> {
        if let Some(home) = self.remote_homes.lock().unwrap_or_else(PoisonError::into_inner).get(host) {
            return Ok(Ok(home.clone()));
        }
        let (realpath, owned) = (Arc::clone(&self.shared.remote.realpath), host.to_string());
        let home = blocking(move || realpath(&owned, "~")).await?;
        if let Ok(home) = &home {
            self.remote_homes
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .insert(host.to_string(), home.clone());
        }
        Ok(home)
    }

    /// The grant of this location, entry and class, made on first use with its
    /// own secret and listener (VAL-11: at most `grants`, reuse not counted).
    fn grant(&self, entry: Entry, class: GrantClass) -> Result<Result<Arc<Grant>, Denial>, String> {
        let mut grants = self.grants.lock().unwrap_or_else(PoisonError::into_inner);
        let known = grants
            .iter()
            .find(|g| g.location == entry.location && g.entry == entry.path && g.class == class);
        if let Some(grant) = known {
            return Ok(Ok(Arc::clone(grant)));
        }
        if grants.len() >= self.shared.limits.grants {
            return Ok(Err(Denial::LimitReached));
        }
        let host_name = if class == GrantClass::Frame && self.frame_localhost {
            HostName::Localhost
        } else {
            HostName::Ip
        };
        let failed = |e: std::io::Error| format!("could not start the preview server: {e}");
        let (port, sockets) = bind_listeners(host_name).map_err(failed)?;
        #[cfg(test)]
        let addrs = sockets.iter().filter_map(|s| s.local_addr().ok()).collect();
        // Every socket is converted before any listener starts, so a failure
        // leaves no listener without a grant.
        let sockets = sockets
            .into_iter()
            .map(|socket| {
                socket.set_nonblocking(true)?;
                tokio::net::TcpListener::from_std(socket)
            })
            .collect::<std::io::Result<Vec<_>>>()
            .map_err(failed)?;
        let grant = Arc::new(Grant {
            token: new_token()?,
            class,
            location: entry.location,
            entry: entry.path,
            root: entry.root,
            kind: entry.kind,
            host_name,
            port,
            connections: Arc::new(Semaphore::new(self.shared.limits.connections_per_grant)),
            #[cfg(test)]
            addrs,
        });
        for socket in sockets {
            tokio::spawn(serve_listener(socket, Arc::clone(&grant), Arc::clone(&self.shared)));
        }
        grants.push(Arc::clone(&grant));
        log::info!("preview server: shared {} ({class:?})", grant.entry_name());
        Ok(Ok(grant))
    }
}

#[cfg(test)]
impl Core {
    fn grants(&self) -> Vec<Arc<Grant>> {
        self.grants.lock().unwrap().clone()
    }

    fn grant_at(&self, port: u16) -> Arc<Grant> {
        self.grants().into_iter().find(|g| g.port == port).expect("a grant on this port")
    }

    fn shared(&self) -> &Arc<Shared> {
        &self.shared
    }
}

/// Stand-ins and helpers shared by the tests of this module.
#[cfg(test)]
pub(crate) mod testkit {
    use std::collections::{HashMap, HashSet, VecDeque};
    use std::future::Future;
    use std::io::{Read, Write};
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use tokio::sync::Semaphore;

    use super::grant::{Grant, GrantClass, HostName, Location};
    use super::policy::EntryKind;
    use super::source::{ReadFn, Remote};
    use super::{Config, Core, Limits};
    use crate::modules::fs::file::{FileStat, StatKind};
    use crate::modules::ssh::{RemoteFileBytes, RemoteReadError};
    use crate::modules::workspace::WorkspaceEnv;

    pub(crate) const T: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    pub(crate) fn run<F: Future>(work: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(work)
    }

    /// Production limits with short times.
    pub(crate) fn limits() -> Limits {
        Limits {
            head_budget: Duration::from_secs(2),
            retry_pause: Duration::from_millis(10),
            host_wait: Duration::from_secs(2),
            write_budget: Duration::from_secs(2),
            ssh_read_budget: Duration::from_secs(2),
            ..Limits::PRODUCTION
        }
    }

    pub(crate) fn config() -> Config {
        Config {
            limits: limits(),
            frame_localhost: false,
            frame_ancestors: true,
        }
    }

    pub(crate) fn ssh(host: &str) -> Option<WorkspaceEnv> {
        Some(WorkspaceEnv::Ssh { host: host.into() })
    }

    pub(crate) fn grant(location: Location, entry: &str, root: Option<&str>, kind: EntryKind, class: GrantClass) -> Grant {
        Grant {
            token: T.to_string(),
            class,
            location,
            entry: entry.to_string(),
            root: root.map(str::to_string),
            kind,
            host_name: HostName::Ip,
            port: 0,
            connections: Arc::new(Semaphore::new(16)),
            addrs: Vec::new(),
        }
    }

    /// A real, empty home folder shared by the tests that name none.
    fn test_home() -> PathBuf {
        static HOME: std::sync::OnceLock<tempfile::TempDir> = std::sync::OnceLock::new();
        HOME.get_or_init(|| tempfile::tempdir().unwrap()).path().to_path_buf()
    }

    pub(crate) fn core(fake: &Arc<FakeHost>, home: Option<PathBuf>, config: Config) -> Arc<Core> {
        let home = home.unwrap_or_else(test_home);
        Arc::new(Core::new(config, fake.remote(), Arc::new(move || Some(home.clone()))))
    }

    /// A server whose local home cannot be found.
    pub(crate) fn core_without_home(config: Config) -> Arc<Core> {
        Arc::new(Core::new(config, FakeHost::new().remote(), Arc::new(|| None)))
    }

    /// One `current_thread` runtime driven by its own thread for the server's
    /// tasks; tests call into it from their own thread.
    pub(crate) struct Driver {
        handle: tokio::runtime::Handle,
        stop: Option<tokio::sync::oneshot::Sender<()>>,
        thread: Option<std::thread::JoinHandle<()>>,
    }

    impl Driver {
        pub(crate) fn new() -> Self {
            let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
            let (handle_tx, handle_rx) = std::sync::mpsc::channel();
            let thread = std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
                handle_tx.send(rt.handle().clone()).unwrap();
                rt.block_on(async {
                    let _ = stopped.await;
                });
                rt.shutdown_timeout(Duration::from_secs(1));
            });
            Self {
                handle: handle_rx.recv().unwrap(),
                stop: Some(stop),
                thread: Some(thread),
            }
        }

        pub(crate) fn block_on<F: Future>(&self, work: F) -> F::Output {
            self.handle.block_on(work)
        }

        /// Runs `work` on the server's own thread.
        pub(crate) fn spawn<F>(&self, work: F) -> tokio::task::JoinHandle<F::Output>
        where
            F: Future + Send + 'static,
            F::Output: Send + 'static,
        {
            self.handle.spawn(work)
        }
    }

    impl Drop for Driver {
        fn drop(&mut self) {
            if let Some(stop) = self.stop.take() {
                let _ = stop.send(());
            }
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }

    /// Opens once; readers wait until then.
    pub(crate) struct Latch {
        open: Mutex<bool>,
        entered: Mutex<bool>,
        cv: std::sync::Condvar,
    }

    impl Latch {
        pub(crate) fn new() -> Arc<Self> {
            Arc::new(Self {
                open: Mutex::new(false),
                entered: Mutex::new(false),
                cv: std::sync::Condvar::new(),
            })
        }

        pub(crate) fn open(&self) {
            *self.open.lock().unwrap() = true;
            self.cv.notify_all();
        }

        pub(crate) fn entered(&self) -> bool {
            *self.entered.lock().unwrap()
        }

        pub(crate) async fn wait_until_entered(&self) {
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            while !self.entered() {
                assert!(tokio::time::Instant::now() < deadline, "the held read never started");
                tokio::time::sleep(Duration::from_millis(2)).await;
            }
        }

        fn pass(&self) {
            *self.entered.lock().unwrap() = true;
            let open = self.open.lock().unwrap();
            let (_open, timeout) = self.cv.wait_timeout_while(open, Duration::from_secs(10), |open| !*open).unwrap();
            assert!(!timeout.timed_out(), "a held read was never released");
        }
    }

    #[derive(Debug, Clone)]
    pub(crate) struct Call {
        pub host: String,
        pub path: String,
        pub limit: u64,
        pub budget: Duration,
    }

    /// Stands in for an SSH host like the helper does: it follows links,
    /// reports the resolved target, refuses a file above `limit`, and says
    /// `Missing` or `NotRegularFile` by kind. Each read is noted.
    #[derive(Default)]
    pub(crate) struct FakeHost {
        files: Mutex<HashMap<String, Vec<u8>>>,
        links: Mutex<HashMap<String, String>>,
        dirs: Mutex<HashSet<String>>,
        script: Mutex<VecDeque<RemoteReadError>>,
        realpath_errors: Mutex<HashMap<String, RemoteReadError>>,
        stat_errors: Mutex<HashMap<String, RemoteReadError>>,
        sizes: Mutex<HashMap<String, u64>>,
        calls: Mutex<Vec<Call>>,
        realpath_calls: Mutex<Vec<(String, String)>>,
        realpath_holds: Mutex<HashMap<String, Arc<Latch>>>,
        ignore_limit: Mutex<bool>,
        delay: Mutex<Duration>,
        holds: Mutex<HashMap<String, Arc<Latch>>>,
        hang: Mutex<HashSet<String>>,
        peak_wait: Mutex<Option<usize>>,
        live: Mutex<HashMap<String, usize>>,
        peaks: Mutex<HashMap<String, usize>>,
        live_total: Mutex<(usize, usize)>,
    }

    impl FakeHost {
        pub(crate) fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        pub(crate) fn file(&self, path: &str, bytes: &[u8]) {
            self.files.lock().unwrap().insert(path.to_string(), bytes.to_vec());
        }

        pub(crate) fn link(&self, from: &str, to: &str) {
            self.links.lock().unwrap().insert(from.to_string(), to.to_string());
        }

        pub(crate) fn dir(&self, path: &str) {
            self.dirs.lock().unwrap().insert(path.to_string());
        }

        pub(crate) fn fail_next(&self, error: RemoteReadError) {
            self.script.lock().unwrap().push_back(error);
        }

        pub(crate) fn fail_realpath(&self, path: &str, error: RemoteReadError) {
            self.realpath_errors.lock().unwrap().insert(path.to_string(), error);
        }

        pub(crate) fn fail_stat(&self, path: &str, error: RemoteReadError) {
            self.stat_errors.lock().unwrap().insert(path.to_string(), error);
        }

        /// The size `stat` reports, instead of the length of the bytes.
        pub(crate) fn size(&self, path: &str, size: u64) {
            self.sizes.lock().unwrap().insert(path.to_string(), size);
        }

        /// Breaks the helper's promise: bytes above `limit` are sent anyway.
        pub(crate) fn ignore_limit(&self) {
            *self.ignore_limit.lock().unwrap() = true;
        }

        /// The first `realpath` of `path` waits until `latch` opens.
        pub(crate) fn hold_realpath(&self, path: &str, latch: &Arc<Latch>) {
            self.realpath_holds.lock().unwrap().insert(path.to_string(), Arc::clone(latch));
        }

        pub(crate) fn set_delay(&self, delay: Duration) {
            *self.delay.lock().unwrap() = delay;
        }

        /// The first read of `path` waits until `latch` opens.
        pub(crate) fn hold(&self, path: &str, latch: &Arc<Latch>) {
            self.holds.lock().unwrap().insert(path.to_string(), Arc::clone(latch));
        }

        /// Reads of `path` hang for the whole budget, then time out.
        pub(crate) fn hang_for_budget(&self, path: &str) {
            self.hang.lock().unwrap().insert(path.to_string());
        }

        /// Each read waits until `peak` reads have run at once.
        pub(crate) fn hold_until_peak(&self, peak: usize) {
            *self.peak_wait.lock().unwrap() = Some(peak);
        }

        pub(crate) fn calls(&self) -> Vec<Call> {
            self.calls.lock().unwrap().clone()
        }

        pub(crate) fn realpath_calls(&self) -> Vec<(String, String)> {
            self.realpath_calls.lock().unwrap().clone()
        }

        pub(crate) fn peak_on(&self, host: &str) -> usize {
            self.peaks.lock().unwrap().get(host).copied().unwrap_or(0)
        }

        pub(crate) fn peak_total(&self) -> usize {
            self.live_total.lock().unwrap().1
        }

        fn resolve(&self, path: &str) -> String {
            self.links.lock().unwrap().get(path).cloned().unwrap_or_else(|| path.to_string())
        }

        fn enter(&self, host: &str) {
            let mut live = self.live.lock().unwrap();
            let now = live.entry(host.to_string()).or_default();
            *now += 1;
            let mut peaks = self.peaks.lock().unwrap();
            let peak = peaks.entry(host.to_string()).or_default();
            *peak = (*peak).max(*now);
            let mut total = self.live_total.lock().unwrap();
            total.0 += 1;
            total.1 = total.1.max(total.0);
        }

        fn leave(&self, host: &str) {
            *self.live.lock().unwrap().get_mut(host).unwrap() -= 1;
            self.live_total.lock().unwrap().0 -= 1;
        }

        fn read(&self, host: &str, path: &str, limit: u64, budget: Duration) -> Result<RemoteFileBytes, RemoteReadError> {
            self.calls.lock().unwrap().push(Call {
                host: host.to_string(),
                path: path.to_string(),
                limit,
                budget,
            });
            self.enter(host);
            let result = self.answer(path, limit, budget);
            self.leave(host);
            result
        }

        fn answer(&self, path: &str, limit: u64, budget: Duration) -> Result<RemoteFileBytes, RemoteReadError> {
            if let Some(peak) = *self.peak_wait.lock().unwrap() {
                let deadline = std::time::Instant::now() + Duration::from_secs(2);
                while self.peak_total() < peak && std::time::Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(1));
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            let held = self.holds.lock().unwrap().remove(path);
            if let Some(latch) = held {
                latch.pass();
            }
            if self.hang.lock().unwrap().contains(path) {
                std::thread::sleep(budget);
                return Err(RemoteReadError::TimedOut("budget".into()));
            }
            let delay = *self.delay.lock().unwrap();
            std::thread::sleep(delay);
            if let Some(error) = self.script.lock().unwrap().pop_front() {
                return Err(error);
            }
            let real = self.resolve(path);
            if self.dirs.lock().unwrap().contains(&real) {
                return Err(RemoteReadError::NotRegularFile);
            }
            let bytes = self.files.lock().unwrap().get(&real).cloned().ok_or(RemoteReadError::Missing)?;
            if bytes.len() as u64 > limit && !*self.ignore_limit.lock().unwrap() {
                return Err(RemoteReadError::TooLarge);
            }
            Ok(RemoteFileBytes {
                resolved_path: real,
                bytes,
            })
        }

        fn realpath(&self, host: &str, path: &str) -> Result<String, RemoteReadError> {
            self.realpath_calls.lock().unwrap().push((host.to_string(), path.to_string()));
            let held = self.realpath_holds.lock().unwrap().remove(path);
            if let Some(latch) = held {
                latch.pass();
            }
            if let Some(error) = self.realpath_errors.lock().unwrap().get(path) {
                return Err(error.clone());
            }
            if path == "~" {
                return Ok("/home/u".to_string());
            }
            let real = self.resolve(path);
            let known = self.files.lock().unwrap().contains_key(&real) || self.dirs.lock().unwrap().contains(&real);
            known.then_some(real).ok_or(RemoteReadError::Missing)
        }

        fn stat(&self, _host: &str, path: &str) -> Result<FileStat, RemoteReadError> {
            if let Some(error) = self.stat_errors.lock().unwrap().get(path) {
                return Err(error.clone());
            }
            if self.dirs.lock().unwrap().contains(path) {
                return Ok(FileStat { size: 0, mtime: 0, kind: StatKind::Dir });
            }
            let size = match self.sizes.lock().unwrap().get(path) {
                Some(size) => *size,
                None => self.files.lock().unwrap().get(path).map(|b| b.len() as u64).ok_or(RemoteReadError::Missing)?,
            };
            Ok(FileStat { size, mtime: 0, kind: StatKind::File })
        }

        pub(crate) fn reader(self: &Arc<Self>) -> Arc<ReadFn> {
            let host = Arc::clone(self);
            Arc::new(move |h: &str, p: &str, l: u64, b: Duration| host.read(h, p, l, b))
        }

        pub(crate) fn remote(self: &Arc<Self>) -> Remote {
            let (realpath_host, stat_host) = (Arc::clone(self), Arc::clone(self));
            Remote {
                read: self.reader(),
                realpath: Arc::new(move |h: &str, p: &str| realpath_host.realpath(h, p)),
                stat: Arc::new(move |h: &str, p: &str| stat_host.stat(h, p)),
            }
        }
    }

    /// Stands in for the opener: notes each URL and gives the set answer.
    #[derive(Clone, Default)]
    pub(crate) struct Opener {
        urls: Arc<Mutex<Vec<String>>>,
    }

    impl Opener {
        pub(crate) fn answering(&self, answer: Result<(), String>) -> impl FnOnce(&str) -> Result<(), String> + Send + 'static {
            let urls = Arc::clone(&self.urls);
            move |url| {
                urls.lock().unwrap().push(url.to_string());
                answer
            }
        }

        pub(crate) fn urls(&self) -> Vec<String> {
            self.urls.lock().unwrap().clone()
        }
    }

    /// The parts of an entry address.
    #[derive(Debug, Clone)]
    pub(crate) struct Link {
        pub host: String,
        pub port: u16,
        pub token: String,
        pub name: String,
    }

    impl Link {
        pub(crate) fn parse(url: &str) -> Self {
            let rest = url.strip_prefix("http://").expect("an http address");
            let (authority, path) = rest.split_once('/').unwrap();
            let (host, port) = authority.rsplit_once(':').unwrap();
            let (token, name) = path.split_once('/').unwrap();
            Self {
                host: host.to_string(),
                port: port.parse().unwrap(),
                token: token.to_string(),
                name: name.to_string(),
            }
        }

        /// `/{token}/{rel}` on this link.
        pub(crate) fn path(&self, rel: &str) -> String {
            format!("/{}/{rel}", self.token)
        }
    }

    #[derive(Debug)]
    pub(crate) struct HttpReply {
        pub status: u16,
        pub headers: Vec<(String, String)>,
        pub body: Vec<u8>,
    }

    impl HttpReply {
        pub(crate) fn header(&self, name: &str) -> Option<&str> {
            self.headers.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
        }
    }

    pub(crate) fn parse_reply(raw: &[u8]) -> HttpReply {
        let end = raw.windows(4).position(|w| w == b"\r\n\r\n").expect("a complete head");
        let head = String::from_utf8_lossy(&raw[..end]).to_string();
        let mut lines = head.split("\r\n");
        let status = lines.next().unwrap().split(' ').nth(1).unwrap().parse().unwrap();
        let headers = lines
            .map(|line| {
                let (name, value) = line.split_once(':').unwrap();
                (name.trim().to_string(), value.trim().to_string())
            })
            .collect();
        HttpReply {
            status,
            headers,
            body: raw[end + 4..].to_vec(),
        }
    }

    /// Sends raw bytes to `127.0.0.1:{port}` and reads the answer to the end.
    pub(crate) fn send(port: u16, raw: &[u8]) -> HttpReply {
        send_to(std::net::SocketAddr::from(([127, 0, 0, 1], port)), raw)
    }

    pub(crate) fn send_to(addr: std::net::SocketAddr, raw: &[u8]) -> HttpReply {
        let mut stream = std::net::TcpStream::connect(addr).unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        stream.write_all(raw).unwrap();
        let mut out = Vec::new();
        stream.read_to_end(&mut out).unwrap();
        parse_reply(&out)
    }

    pub(crate) fn get(port: u16, path: &str, host: &str) -> HttpReply {
        send(port, format!("GET {path} HTTP/1.1\r\nHost: {host}\r\n\r\n").as_bytes())
    }

    struct Collect;

    static LINES: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static COLLECT: Collect = Collect;

    impl log::Log for Collect {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }

        fn log(&self, record: &log::Record) {
            LINES.lock().unwrap().push(format!("{} {}", record.target(), record.args()));
        }

        fn flush(&self) {}
    }

    /// Collects every log record of the test binary from now on.
    pub(crate) fn capture_logs() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            log::set_logger(&COLLECT).expect("no other logger in the test binary");
            log::set_max_level(log::LevelFilter::Trace);
        });
    }

    pub(crate) fn logs() -> Vec<String> {
        LINES.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::testkit::{self, get, send, send_to, Driver, FakeHost, Link, Opener};
    use super::*;

    const MAX_SESSIONS: &str = "the SSH server refused another session (MaxSessions limit)";

    fn write(path: &Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn text(path: &Path) -> String {
        path.to_str().unwrap().to_string()
    }

    fn canon(path: &Path) -> String {
        path_text(&std::fs::canonicalize(path).unwrap()).unwrap()
    }

    fn open(driver: &Driver, core: &Core, path: &Path) -> (BrowserOpen, Opener) {
        let opener = Opener::default();
        let answer = driver.block_on(core.open_in_browser(text(path), None, opener.answering(Ok(())))).unwrap();
        (answer, opener)
    }

    fn opened() -> BrowserOpen {
        BrowserOpen {
            status: BrowserOpenStatus::Opened,
            reason: None,
        }
    }

    fn status_only(status: BrowserOpenStatus) -> BrowserOpen {
        BrowserOpen { status, reason: None }
    }

    #[cfg(unix)]
    #[test]
    fn ac3_home_and_entry_resolve_the_same_way() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("home-real");
        write(&real.join("a.html"), b"<html>");
        write(&real.join("p/b.html"), b"<html>");
        let link = dir.path().join("home-link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), Some(link.clone()), testkit::config());
        assert_eq!(open(&driver, &core, &link.join("a.html")).0, opened());
        assert_eq!(open(&driver, &core, &real.join("p/b.html")).0, opened());
        let scopes: Vec<Option<String>> = core.grants().iter().map(|g| g.root.clone()).collect();
        assert_eq!(scopes, vec![None, Some(canon(&real.join("p")))]);
    }

    /// Sicherheitsmodell 19
    #[test]
    fn ac24_the_entry_address_names_the_ip_and_the_encoded_file() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/Bericht März 2026.html");
        write(&page, b"<html>Maerz</html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let (answer, opener) = open(&driver, &core, &page);
        assert_eq!(answer, opened());
        let grant = core.grants()[0].clone();
        let expected = format!("http://127.0.0.1:{}/{}/Bericht%20M%C3%A4rz%202026.html", grant.port, grant.token);
        assert_eq!(opener.urls(), vec![expected]);
        let link = Link::parse(&opener.urls()[0]);
        let page = get(link.port, &link.path(&link.name), &format!("127.0.0.1:{}", link.port));
        assert_eq!((page.status, page.body.as_slice()), (200, &b"<html>Maerz</html>"[..]));

        let failing = Opener::default();
        let answer = driver
            .block_on(core.open_in_browser(text(&dir.path().join("p/Bericht März 2026.html")), None, failing.answering(Err("no handler".into()))))
            .unwrap();
        assert_eq!(
            answer,
            BrowserOpen {
                status: BrowserOpenStatus::OpenFailed,
                reason: Some("no handler".into())
            }
        );
    }

    #[test]
    fn ac24_names_keep_only_unreserved_characters() {
        let grant = testkit::grant(Location::Local, "/p/a b?#%&+ä~_-.html", None, EntryKind::Html, GrantClass::Browser);
        assert!(entry_url(&grant).ends_with("/a%20b%3F%23%25%26%2B%C3%A4~_-.html"), "{}", entry_url(&grant));
    }

    #[test]
    fn ac25_no_grant_and_no_bound_listener_before_the_first_click() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let bound = |core: &Core| core.grants().iter().map(|g| g.addrs.len()).sum::<usize>();
        assert!(core.grants().is_empty());
        assert_eq!(bound(&core), 0);
        let (first, one) = open(&driver, &core, &page);
        let (second, two) = open(&driver, &core, &page);
        assert_eq!((first, second), (opened(), opened()));
        assert_eq!(core.grants().len(), 1);
        assert_eq!(bound(&core), 1);
        assert_eq!(one.urls(), two.urls());
        let link = Link::parse(&two.urls()[0]);
        assert_eq!(get(link.port, &link.path("a.html"), &format!("127.0.0.1:{}", link.port)).status, 200);
    }

    #[test]
    fn ac25_a_fresh_server_has_no_grant() {
        let server = PreviewServer::default();
        assert!(server.core().grants().is_empty());
    }

    /// Sicherheitsmodell 9
    #[test]
    fn ac26_unsupported_refused_and_too_large_make_no_grant() {
        let dir = tempfile::tempdir().unwrap();
        let h = dir.path().join("h");
        write(&h.join("notes.txt"), b"text");
        write(&h.join("a.html"), b"<html>");
        write(&h.join(".ssh/notiz.html"), b"<html>");
        let big = h.join("big.png");
        std::fs::File::create(&big).unwrap().set_len(MAX_READ_BYTES + 1).unwrap();
        write(&h.join("fake.pdf"), b"<html><script>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());

        assert_eq!(open(&driver, &core, &h.join("notes.txt")).0, status_only(BrowserOpenStatus::Unsupported));
        let wsl = Some(WorkspaceEnv::Wsl { distro: "Ubuntu".into() });
        let in_wsl = driver.block_on(core.open_in_browser(text(&h.join("a.html")), wsl, Opener::default().answering(Ok(())))).unwrap();
        assert_eq!(in_wsl, status_only(BrowserOpenStatus::Unsupported));
        let secret = open(&driver, &core, &h.join(".ssh/notiz.html")).0;
        assert_eq!(
            secret,
            BrowserOpen {
                status: BrowserOpenStatus::Refused,
                reason: Some("path is inside a protected directory (.ssh)".into())
            }
        );
        assert_eq!(open(&driver, &core, &big).0, status_only(BrowserOpenStatus::TooLarge));
        assert_eq!(
            open(&driver, &core, &h.join("fake.pdf")).0,
            BrowserOpen {
                status: BrowserOpenStatus::Refused,
                reason: Some(FAKE_PDF_REASON.into())
            }
        );
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac26_the_click_checks_the_resolved_entry_and_git() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join(".Git/page.html"), b"<html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let answer = open(&driver, &core, &p.join(".Git/page.html")).0;
        assert_eq!(answer.reason.as_deref(), Some(source::GIT_REASON));
        #[cfg(unix)]
        {
            write(&p.join(".aws/creds.html"), b"<html>");
            std::os::unix::fs::symlink(p.join(".aws/creds.html"), p.join("innocent.html")).unwrap();
            let answer = open(&driver, &core, &p.join("innocent.html")).0;
            assert_eq!(answer.status, BrowserOpenStatus::Refused);
            // The name alone decides too: a protected folder name that links
            // to a harmless folder.
            write(&p.join("plain/page.html"), b"<html>");
            std::os::unix::fs::symlink(p.join("plain"), p.join(".kube")).unwrap();
            let answer = open(&driver, &core, &p.join(".kube/page.html")).0;
            assert_eq!(answer.reason.as_deref(), Some("path is inside a protected directory (.kube)"));
        }
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac27_at_most_256_grants_over_both_classes() {
        let dir = tempfile::tempdir().unwrap();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let mut links = Vec::new();
        for i in 0..256 {
            let page = dir.path().join(format!("p{i}/a.html"));
            write(&page, b"<html>");
            if i % 2 == 0 {
                let (answer, opener) = open(&driver, &core, &page);
                assert_eq!(answer, opened(), "{i}");
                links.push(opener.urls()[0].clone());
            } else {
                let frame = driver.block_on(core.frame_source(text(&page), None)).unwrap();
                links.push(frame.url.expect("ready"));
            }
        }
        let fresh = dir.path().join("new/a.html");
        write(&fresh, b"<html>");
        assert_eq!(open(&driver, &core, &fresh).0, status_only(BrowserOpenStatus::LimitReached));
        let frame = driver.block_on(core.frame_source(text(&fresh), None)).unwrap();
        assert_eq!(
            frame,
            FrameSource {
                status: FrameStatus::LimitReached,
                url: None,
                reason: None
            }
        );
        let (again, opener) = open(&driver, &core, &dir.path().join("p0/a.html"));
        assert_eq!(again, opened());
        assert_eq!(opener.urls(), vec![links[0].clone()]);
        assert_eq!(core.grants().len(), 256);
        for url in &links {
            let link = Link::parse(url);
            assert_eq!(get(link.port, &link.path("a.html"), &format!("127.0.0.1:{}", link.port)).status, 200, "{url}");
        }
    }

    fn ssh_open(driver: &Driver, core: &Core, path: &str) -> (BrowserOpen, Opener) {
        let opener = Opener::default();
        let answer = driver
            .block_on(core.open_in_browser(path.into(), testkit::ssh("devbox"), opener.answering(Ok(()))))
            .unwrap();
        (answer, opener)
    }

    /// Sicherheitsmodell 14
    #[test]
    fn ac28_ssh_click_resolves_sizes_and_asks_the_home_once() {
        let fake = FakeHost::new();
        fake.file("/srv/p/report.html", b"<html>R</html>");
        fake.file("/srv/p/zwei.html", b"<html>Z</html>");
        fake.file("/srv/p/gone.html", b"<html>");
        fake.fail_realpath("/srv/p/gone.html", RemoteReadError::Unreachable("gone".into()));
        fake.file("/srv/p/big.html", b"<html>");
        fake.size("/srv/p/big.html", MAX_READ_BYTES + 1);
        fake.dir("/srv/p/folder.html");
        fake.file("/srv/p/.git/x.html", b"<html>");
        fake.link("/srv/p/alias.html", "/srv/p/.git/x.html");
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());

        let (first, opener) = ssh_open(&driver, &core, "/srv/p/report.html");
        assert_eq!(first, opened());
        assert_eq!(ssh_open(&driver, &core, "/srv/p/zwei.html").0, opened());
        for grant in core.grants() {
            assert_eq!(grant.root.as_deref(), Some("/srv/p"));
            assert_eq!(grant.location, Location::Ssh { host: "devbox".into() });
        }
        let homes = fake.realpath_calls().iter().filter(|(host, path)| host == "devbox" && path == "~").count();
        assert_eq!(homes, 1);
        assert_eq!(
            ssh_open(&driver, &core, "/srv/p/gone.html").0,
            BrowserOpen {
                status: BrowserOpenStatus::Unreachable,
                reason: Some("gone".into())
            }
        );
        assert_eq!(ssh_open(&driver, &core, "/srv/p/big.html").0, status_only(BrowserOpenStatus::TooLarge));
        assert_eq!(ssh_open(&driver, &core, "/srv/p/folder.html").0.status, BrowserOpenStatus::Refused);
        assert_eq!(ssh_open(&driver, &core, "/home/u/.ssh/x.html").0.status, BrowserOpenStatus::Refused);
        assert_eq!(ssh_open(&driver, &core, "/srv/p/alias.html").0.reason.as_deref(), Some(source::GIT_REASON));
        assert_eq!(core.grants().len(), 2);

        let link = Link::parse(&opener.urls()[0]);
        let page = get(link.port, &link.path("report.html"), &format!("127.0.0.1:{}", link.port));
        assert_eq!((page.status, page.body.as_slice()), (200, &b"<html>R</html>"[..]));
        assert!(fake.calls().iter().all(|c| c.host == "devbox"));
    }

    #[test]
    fn ac29_frame_source_has_its_own_link() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>F</html>");
        write(&dir.path().join("p/notes.txt"), b"text");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let (_, browser) = open(&driver, &core, &page);
        let browser = Link::parse(&browser.urls()[0]);

        let first = driver.block_on(core.frame_source(text(&page), None)).unwrap();
        let second = driver.block_on(core.frame_source(text(&page), None)).unwrap();
        assert_eq!((first.status, first.reason.clone()), (FrameStatus::Ready, None));
        assert_eq!(first.url, second.url);
        let url = first.url.unwrap();
        let frame = Link::parse(&url);
        assert_eq!(url, format!("http://127.0.0.1:{}/{}/a.html", frame.port, frame.token));
        assert_ne!(frame.port, browser.port);
        assert_ne!(frame.token, browser.token);

        let reply = get(frame.port, &frame.path("a.html"), &format!("127.0.0.1:{}", frame.port));
        assert_eq!(reply.status, 200);
        let mut csp = "frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost".to_string();
        if cfg!(debug_assertions) {
            csp.push_str(" http://localhost:1420");
        }
        assert_eq!(reply.header("Content-Security-Policy"), Some(csp.as_str()));
        assert_eq!(reply.header("Referrer-Policy"), Some("no-referrer"));

        let notes = driver.block_on(core.frame_source(text(&dir.path().join("p/notes.txt")), None)).unwrap();
        assert_eq!(
            notes,
            FrameSource {
                status: FrameStatus::Unsupported,
                url: None,
                reason: None
            }
        );
    }

    /// Sicherheitsmodell 5
    #[test]
    fn ac30_the_localhost_fallback_answers_only_localhost() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>L</html>");
        let driver = Driver::new();
        let mut config = testkit::config();
        config.frame_localhost = true;
        let core = testkit::core(&FakeHost::new(), None, config);
        let url = driver.block_on(core.frame_source(text(&page), None)).unwrap().url.unwrap();
        let link = Link::parse(&url);
        assert!(url.starts_with(&format!("http://localhost:{}/", link.port)), "{url}");
        assert_eq!(link.host, "localhost");
        let path = link.path("a.html");
        assert_eq!(get(link.port, &path, &format!("localhost:{}", link.port)).status, 200);
        let ip = get(link.port, &path, &format!("127.0.0.1:{}", link.port));
        assert_eq!((ip.status, ip.body.len()), (421, 0));

        let has_v6 = std::net::TcpListener::bind((Ipv6Addr::LOCALHOST, 0)).is_ok();
        eprintln!("ac30: [::1] available in this environment: {has_v6}");
        if has_v6 {
            let v6 = std::net::SocketAddr::from((Ipv6Addr::LOCALHOST, link.port));
            let raw = format!("GET {path} HTTP/1.1\r\nHost: localhost:{}\r\n\r\n", link.port);
            assert_eq!(send_to(v6, raw.as_bytes()).status, 200);
        }
    }

    #[test]
    fn ac30_without_the_fallback_the_frame_uses_the_ip() {
        let (port, sockets) = bind_listeners(HostName::Ip).unwrap();
        assert_eq!(sockets.len(), 1);
        assert_eq!(sockets[0].local_addr().unwrap(), std::net::SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
        let (port, sockets) = bind_listeners(HostName::Localhost).unwrap();
        for socket in &sockets {
            let addr = socket.local_addr().unwrap();
            assert!(addr.ip().is_loopback() && addr.port() == port, "{addr}");
        }
        assert!(!Config::default().frame_localhost);
        assert!(Config::default().frame_ancestors);
    }

    #[test]
    fn ac31_a_new_run_does_not_know_old_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>");
        let driver = Driver::new();
        let first = testkit::core(&FakeHost::new(), None, testkit::config());
        let second = testkit::core(&FakeHost::new(), None, testkit::config());
        let old = Link::parse(&open(&driver, &first, &page).1.urls()[0]);
        let new = Link::parse(&open(&driver, &second, &page).1.urls()[0]);
        assert_ne!(old.token, new.token);
        let reply = get(new.port, &old.path("a.html"), &format!("127.0.0.1:{}", new.port));
        assert_eq!((reply.status, reply.body.len()), (404, 0));
    }

    #[test]
    fn ac35_a_refused_session_reaches_the_click_as_its_reason() {
        let unreachable = BrowserOpen {
            status: BrowserOpenStatus::Unreachable,
            reason: Some(MAX_SESSIONS.into()),
        };
        let driver = Driver::new();

        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        fake.fail_realpath("/srv/p/a.html", RemoteReadError::Unreachable(MAX_SESSIONS.into()));
        let core = testkit::core(&fake, None, testkit::config());
        assert_eq!(ssh_open(&driver, &core, "/srv/p/a.html").0, unreachable);
        assert!(core.grants().is_empty());

        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        fake.fail_stat("/srv/p/a.html", RemoteReadError::Unreachable(MAX_SESSIONS.into()));
        let core = testkit::core(&fake, None, testkit::config());
        assert_eq!(ssh_open(&driver, &core, "/srv/p/a.html").0, unreachable);
        assert!(core.grants().is_empty());

        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        fake.fail_realpath("~", RemoteReadError::Unreachable(MAX_SESSIONS.into()));
        let core = testkit::core(&fake, None, testkit::config());
        assert_eq!(ssh_open(&driver, &core, "/srv/p/a.html").0, unreachable);
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac36_no_token_or_address_in_logs_or_reasons() {
        testkit::capture_logs();
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>");
        write(&p.join("b.png"), b"B");
        write(&p.join("c.png"), b"C");
        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        fake.file("/srv/p/y.png", b"Y");
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());

        let opener = Opener::default();
        let failing = {
            let opener = opener.clone();
            move |url: &str| {
                let _ = opener.answering(Ok(()))(url);
                Err(format!("Launcher \"open\" \"{url}\" failed"))
            }
        };
        let answer = driver.block_on(core.open_in_browser(text(&p.join("a.html")), None, failing)).unwrap();
        let entry = opener.urls()[0].clone();
        let browser = Link::parse(&entry);
        assert_eq!(answer.status, BrowserOpenStatus::OpenFailed);
        let reason = answer.reason.unwrap();
        assert_eq!(reason, "Launcher \"open\" \"<link>\" failed");
        assert!(!reason.contains(&browser.token) && !reason.contains(&browser.port.to_string()));

        let frame_url = driver.block_on(core.frame_source(text(&p.join("a.html")), None)).unwrap().url.unwrap();
        let frame = Link::parse(&frame_url);
        let host = format!("127.0.0.1:{}", browser.port);
        assert_eq!(get(browser.port, "/0000/a.html", &host).status, 404);

        let (_, image) = open(&driver, &core, &p.join("b.png"));
        let image = Link::parse(&image.urls()[0]);
        let outside = get(image.port, &image.path("c.png"), &format!("127.0.0.1:{}", image.port));
        assert_eq!(outside.status, 403);

        let (_, remote) = ssh_open(&driver, &core, "/srv/p/a.html");
        let remote = Link::parse(&remote.urls()[0]);
        fake.fail_next(RemoteReadError::Failed("boom".into()));
        let failed = get(remote.port, &remote.path("y.png"), &format!("127.0.0.1:{}", remote.port));
        assert_eq!(failed.status, 502);

        let logs = testkit::logs();
        let ours: Vec<&String> = logs.iter().filter(|l| l.contains("preview")).collect();
        assert!(ours.iter().any(|l| l.contains("did not open")), "{ours:?}");
        assert!(ours.iter().any(|l| l.contains("boom")), "{ours:?}");
        let secrets = [&browser.token, &frame.token, &image.token, &remote.token, &entry, &frame_url];
        for line in &logs {
            for secret in secrets {
                assert!(!line.contains(secret.as_str()), "{line}");
            }
        }
    }

    #[test]
    fn ac36_remote_reasons_name_every_variant() {
        assert_eq!(remote_reason(RemoteReadError::Unreachable("u".into())), "u");
        assert_eq!(remote_reason(RemoteReadError::TimedOut("t".into())), "t");
        assert_eq!(remote_reason(RemoteReadError::Failed("f".into())), "f");
        assert_eq!(remote_reason(RemoteReadError::Missing), "no such file");
        assert_eq!(remote_reason(RemoteReadError::NotRegularFile), "not a regular file");
        assert_eq!(remote_reason(RemoteReadError::TooLarge), "larger than 10 MB");
    }

    #[test]
    fn ac29_a_frame_link_refuses_other_methods_without_a_body() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let link = Link::parse(&driver.block_on(core.frame_source(text(&page), None)).unwrap().url.unwrap());
        let reply = send(link.port, format!("DELETE {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n", link.path("a.html"), link.port).as_bytes());
        assert_eq!((reply.status, reply.body.len()), (405, 0));
    }

    fn refused_with(reason: &str) -> BrowserOpen {
        BrowserOpen {
            status: BrowserOpenStatus::Refused,
            reason: Some(reason.into()),
        }
    }

    /// Sicherheitsmodell 15
    /// Sicherheitsmodell 16
    #[cfg(unix)]
    #[test]
    fn ac26_the_kind_follows_the_resolved_entry() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("seite.html"), b"<html><script></script>");
        write(&p.join("x.html"), b"%PDF-1.7\n<script></script>");
        write(&p.join("daten.txt"), b"text");
        write(&p.join("bild.png"), b"PNG");
        write(&p.join("page.html"), b"<html>P</html>");
        symlink(p.join("seite.html"), p.join("harmlos.png")).unwrap();
        symlink(p.join("x.html"), p.join("bericht.pdf")).unwrap();
        symlink(p.join("daten.txt"), p.join("liste.html")).unwrap();
        symlink(p.join("bild.png"), p.join("link.html")).unwrap();
        symlink(p.join("page.html"), p.join("index.htm")).unwrap();
        symlink(p.join("bild.png"), p.join("a.jpg")).unwrap();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());

        for name in ["harmlos.png", "bericht.pdf", "link.html"] {
            assert_eq!(open(&driver, &core, &p.join(name)).0, refused_with(OTHER_KIND_REASON), "{name}");
        }
        assert_eq!(open(&driver, &core, &p.join("liste.html")).0, status_only(BrowserOpenStatus::Unsupported));
        assert!(core.grants().is_empty());

        // The same kind under another extension is fine, and the link and its
        // target share one grant in both orders: kind and scope follow from
        // the resolved path, the key of the grant.
        let (link_first, by_link) = open(&driver, &core, &p.join("index.htm"));
        let (target_next, by_target) = open(&driver, &core, &p.join("page.html"));
        assert_eq!((link_first, target_next), (opened(), opened()));
        assert_eq!(by_link.urls(), by_target.urls());
        let (target_first, by_target) = open(&driver, &core, &p.join("bild.png"));
        let (link_next, by_link) = open(&driver, &core, &p.join("a.jpg"));
        assert_eq!((target_first, link_next), (opened(), opened()));
        assert_eq!(by_link.urls(), by_target.urls());
        let kinds: Vec<(EntryKind, bool)> = core.grants().iter().map(|g| (g.kind, g.root.is_some())).collect();
        assert_eq!(kinds, [(EntryKind::Html, true), (EntryKind::Image, false)]);

        // The image entry is served inert, whatever it holds.
        let image = Link::parse(&by_link.urls()[0]);
        let reply = get(image.port, &image.path("bild.png"), &format!("127.0.0.1:{}", image.port));
        assert_eq!(reply.header("Content-Security-Policy"), Some(policy::INERT_CSP));
    }

    #[test]
    fn ac28_over_ssh_the_kind_follows_the_resolved_entry() {
        let fake = FakeHost::new();
        fake.file("/srv/p/seite.html", b"<html><script></script>");
        fake.file("/srv/p/x.html", b"%PDF-1.7\n<script></script>");
        fake.file("/srv/p/daten.txt", b"text");
        fake.file("/srv/p/page.html", b"<html>P</html>");
        fake.link("/srv/p/harmlos.png", "/srv/p/seite.html");
        fake.link("/srv/p/bericht.pdf", "/srv/p/x.html");
        fake.link("/srv/p/liste.html", "/srv/p/daten.txt");
        fake.link("/srv/p/index.htm", "/srv/p/page.html");
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());
        for name in ["harmlos.png", "bericht.pdf"] {
            assert_eq!(ssh_open(&driver, &core, &format!("/srv/p/{name}")).0, refused_with(OTHER_KIND_REASON), "{name}");
        }
        assert_eq!(ssh_open(&driver, &core, "/srv/p/liste.html").0, status_only(BrowserOpenStatus::Unsupported));
        assert!(core.grants().is_empty());
        let (link_first, by_link) = ssh_open(&driver, &core, "/srv/p/index.htm");
        let (target_next, by_target) = ssh_open(&driver, &core, "/srv/p/page.html");
        assert_eq!((link_first, target_next), (opened(), opened()));
        assert_eq!(by_link.urls(), by_target.urls());
        assert_eq!(core.grants().len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn ac26_entry_names_the_server_cannot_serve_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a\\b.html");
        write(&page, b"<html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        assert_eq!(open(&driver, &core, &page).0, refused_with(BAD_NAME_REASON));
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac26_folders_fifos_and_missing_files_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        std::fs::create_dir_all(p.join("x.html")).unwrap();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        assert_eq!(open(&driver, &core, &p.join("x.html")).0, refused_with("not a regular file"));
        assert_eq!(open(&driver, &core, &p.join("fehlt.html")).0, refused_with("the file cannot be found"));
        #[cfg(unix)]
        {
            let fifo = std::ffi::CString::new(p.join("y.html").to_str().unwrap()).unwrap();
            // SAFETY: a valid NUL-terminated path.
            assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
            assert_eq!(open(&driver, &core, &p.join("y.html")).0, refused_with("not a regular file"));
        }
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac29_the_frame_is_for_html_only() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.png"), b"PNG");
        write(&p.join("a.pdf"), b"%PDF-1.7");
        write(&p.join("a.svg"), b"<svg/>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        for name in ["a.png", "a.pdf", "a.svg"] {
            let frame = driver.block_on(core.frame_source(text(&p.join(name)), None)).unwrap();
            assert_eq!((frame.status, frame.url), (FrameStatus::Unsupported, None), "{name}");
        }
        assert!(core.grants().is_empty());
    }

    #[test]
    fn ac3_without_a_home_the_link_gives_only_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>");
        write(&dir.path().join("p/b.png"), b"B");
        let driver = Driver::new();
        let core = testkit::core_without_home(testkit::config());
        let (answer, opener) = open(&driver, &core, &page);
        assert_eq!(answer, opened());
        assert_eq!(core.grants()[0].root, None);
        let link = Link::parse(&opener.urls()[0]);
        let host = format!("127.0.0.1:{}", link.port);
        assert_eq!(get(link.port, &link.path("a.html"), &host).status, 200);
        assert_eq!(get(link.port, &link.path("b.png"), &host).status, 403);
        assert_eq!(local_home(Some(dir.path().join("missing"))), None);
        assert_eq!(local_home(Some(dir.path().to_path_buf())), Some(canon(dir.path())));
    }

    #[test]
    fn ac36_the_opener_reason_never_keeps_a_piece_of_the_link() {
        let grant = testkit::grant(Location::Local, "/p/Bericht März.html", None, EntryKind::Html, GrantClass::Browser);
        let grant = Grant { port: 32891, ..grant };
        let url = entry_url(&grant);
        let decoded = format!("http://127.0.0.1:32891/{}/Bericht März.html", grant.token);
        assert_eq!(scrub_link(&format!("cannot open {decoded}"), &grant, &url), "cannot open <link>");
        assert_eq!(scrub_link(&format!("token {} rejected", grant.token), &grant, &url), "token <link> rejected");
        assert_eq!(scrub_link(&format!("cut {}", &url[..60]), &grant, &url), OPEN_FAILED_REASON);
        assert_eq!(scrub_link("listener on port 32891", &grant, &url), OPEN_FAILED_REASON);
        assert_eq!(scrub_link("no handler\r\nfor http", &grant, &url), "no handler  for http");
    }

    #[test]
    fn ac35_the_click_reason_is_cleaned_and_short() {
        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        let noisy = format!("ssh: connect failed\r\n{}", "x".repeat(400));
        fake.fail_realpath("/srv/p/a.html", RemoteReadError::Unreachable(noisy));
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());
        let reason = ssh_open(&driver, &core, "/srv/p/a.html").0.reason.unwrap();
        assert!(!reason.contains('\r') && !reason.contains('\n'), "{reason:?}");
        assert!(reason.chars().count() <= 161, "{}", reason.chars().count());
    }

    #[test]
    fn ac19_a_blocked_ssh_call_of_a_click_does_not_stop_local_files() {
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("p/a.html");
        write(&page, b"<html>L</html>");
        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        let latch = testkit::Latch::new();
        fake.hold_realpath("/srv/p/a.html", &latch);
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());
        let local = Link::parse(&open(&driver, &core, &page).1.urls()[0]);
        let click = {
            let core = Arc::clone(&core);
            driver.spawn(async move {
                core.open_in_browser("/srv/p/a.html".into(), testkit::ssh("devbox"), Opener::default().answering(Ok(()))).await
            })
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !latch.entered() {
            assert!(std::time::Instant::now() < deadline, "the click never reached realpath");
            std::thread::sleep(Duration::from_millis(5));
        }
        let reply = get(local.port, &local.path("a.html"), &format!("127.0.0.1:{}", local.port));
        assert_eq!(reply.status, 200);
        latch.open();
        assert_eq!(driver.block_on(click).unwrap().unwrap(), opened());
    }
}
