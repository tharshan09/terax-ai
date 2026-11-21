//! A remote Chrome behind a forward. Only the Mac port of an existing active
//! forward is ever asked, always as `localhost`, through the guarded client
//! without redirects; no caller can hand in a URL. The live view is opened
//! from here too, so the webview never names an app or a URL for it.

use super::{blocking, registry, validate_request};
use crate::modules::net::{guarded_client, Profile};
use serde_json::Value;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

/// The frontend names the Mac side the same way; Chrome compares the origin
/// letter by letter, so `127.0.0.1` would be refused where `localhost` passes.
pub const MAC_HOST: &str = "localhost";
const QUERY_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_BODY: usize = 1 << 20;
const MAX_PAGE_ID: usize = 128;
// The key only has to be well formed; the socket is dropped after the status.
const WEBSOCKET_KEY: &str = "dGhlIHNhbXBsZSBub25jZQ==";
const CHROME_BUNDLE: &str = "Applications/Google Chrome.app";
const CHROME_APP: &str = "Google Chrome";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewStatus {
    Opened,
    ChromeMissing,
    OriginRefused,
    NoPage,
    Unreachable,
    ForwardGone,
    OpenFailed,
}

/// The ports the check ran on, so a guide names the origin that was asked;
/// `reason` is set only for `open_failed`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserView {
    pub status: ViewStatus,
    pub remote_port: u16,
    pub local_port: u16,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn ssh_port_chrome(host: String, remote_port: u32) -> Result<bool, String> {
    chrome_behind(host, remote_port, |host, remote| {
        registry().active_local_port(host, remote)
    })
    .await
}

#[tauri::command]
pub async fn ssh_port_view_browser(host: String, remote_port: u32) -> Result<BrowserView, String> {
    view_browser(
        host,
        remote_port,
        |host: &str, remote| registry().active_local_port(host, remote),
        chrome_installed,
        open_in_chrome,
    )
    .await
}

/// Called from Rust, so the webview's opener scope does not apply and the
/// capability needs no entry that names an app.
fn open_in_chrome(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, Some(CHROME_APP)).map_err(|e| e.to_string())
}

fn chrome_installed() -> bool {
    cfg!(target_os = "macos")
        && dirs::home_dir().is_some_and(|home| chrome_installed_under(Path::new("/"), &home))
}

async fn chrome_behind(
    host: String,
    remote_port: u32,
    lookup: impl FnOnce(&str, u16) -> Result<u16, String> + Send + 'static,
) -> Result<bool, String> {
    let port = active_mac_port(host, remote_port, lookup).await?;
    Ok(is_chrome(port).await)
}

/// The forward is looked up again right before the open, so one stopped or
/// moved to another Mac port during the check opens nothing.
async fn view_browser<L>(
    host: String,
    remote_port: u32,
    lookup: L,
    installed: impl FnOnce() -> bool,
    open: impl FnOnce(&str) -> Result<(), String> + Send + 'static,
) -> Result<BrowserView, String>
where
    L: Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static,
{
    let remote = validate_request(&host, remote_port)?;
    let lookup = Arc::new(lookup);
    let local = active_mac_port(host.clone(), remote_port, shared(&lookup)).await?;
    let view = |status, reason| BrowserView {
        status,
        remote_port: remote,
        local_port: local,
        reason,
    };
    if !installed() {
        return Ok(view(ViewStatus::ChromeMissing, None));
    }
    let page = match browser_target(local).await {
        Ok(page) => page,
        Err(status) => return Ok(view(status, None)),
    };
    if active_mac_port(host, remote_port, shared(&lookup)).await != Ok(local) {
        return Ok(view(ViewStatus::ForwardGone, None));
    }
    let Some(url) = viewer_url(local, &page) else {
        return Ok(view(ViewStatus::NoPage, None));
    };
    Ok(match blocking("open_chrome", move || open(&url)).await {
        Ok(()) => view(ViewStatus::Opened, None),
        Err(reason) => view(ViewStatus::OpenFailed, Some(reason)),
    })
}

fn shared<L>(lookup: &Arc<L>) -> impl FnOnce(&str, u16) -> Result<u16, String> + Send + 'static
where
    L: Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static,
{
    let lookup = Arc::clone(lookup);
    move |host, remote| lookup(host, remote)
}

async fn active_mac_port(
    host: String,
    remote_port: u32,
    lookup: impl FnOnce(&str, u16) -> Result<u16, String> + Send + 'static,
) -> Result<u16, String> {
    let remote = validate_request(&host, remote_port)?;
    blocking("ssh_port_lookup", move || lookup(&host, remote)).await
}

pub fn mac_origin(port: u16) -> String {
    format!("http://{MAC_HOST}:{port}")
}

/// The only place the view address is built: the fixed host, the Mac port
/// from the registry and a checked id, so the server cannot point it elsewhere.
fn viewer_url(port: u16, page_id: &str) -> Option<String> {
    if !valid_page_id(page_id) {
        return None;
    }
    let host = format!("{MAC_HOST}:{port}");
    Some(format!(
        "http://{host}/devtools/inspector.html?ws={host}/devtools/page/{page_id}"
    ))
}

/// Chrome target ids are hex; anything else would leave the path it is put in.
pub fn valid_page_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_PAGE_ID && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Node and Electron answer `/json/version` too; only Chrome serves the viewer.
fn browser_is_chrome(version: &Value) -> bool {
    version
        .get("Browser")
        .and_then(Value::as_str)
        .is_some_and(|b| b.starts_with("Chrome/") || b.starts_with("HeadlessChrome/"))
}

/// The first real page. Its `webSocketDebuggerUrl` is never used: the address
/// is rebuilt from the Mac port and the id.
fn pick_page(targets: &[Value]) -> Option<String> {
    targets.iter().find_map(|target| {
        let field = |name: &str| target.get(name).and_then(Value::as_str);
        let id = field("id")?;
        let page = field("type") == Some("page")
            && !field("url").is_some_and(|url| url.starts_with("devtools://"));
        (page && valid_page_id(id)).then(|| id.to_string())
    })
}

fn status_of_handshake(status: Option<u16>) -> Result<(), ViewStatus> {
    match status {
        Some(101) => Ok(()),
        Some(403) => Err(ViewStatus::OriginRefused),
        _ => Err(ViewStatus::Unreachable),
    }
}

async fn within<T>(work: impl Future<Output = Option<T>>) -> Option<T> {
    tokio::time::timeout(QUERY_TIMEOUT, work).await.ok().flatten()
}

async fn send(port: u16, path: &str, headers: &[(&str, &str)]) -> Option<reqwest::Response> {
    let address = format!("{}{path}", mac_origin(port));
    let (url, client) = guarded_client(&address, Profile::Ping, true).await.ok()?;
    let mut request = client.get(url).timeout(QUERY_TIMEOUT);
    for &(name, value) in headers {
        request = request.header(name, value);
    }
    request.send().await.ok()
}

async fn read_capped(mut response: reqwest::Response) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len() + chunk.len() > MAX_BODY {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    Some(body)
}

async fn fetch_json(port: u16, path: &str) -> Option<Value> {
    within(async {
        let response = send(port, path, &[]).await?;
        if response.status() != reqwest::StatusCode::OK {
            return None;
        }
        serde_json::from_slice(&read_capped(response).await?).ok()
    })
    .await
}

async fn is_chrome(port: u16) -> bool {
    fetch_json(port, "/json/version")
        .await
        .is_some_and(|version| browser_is_chrome(&version))
}

/// The page whose view would load, else why it would not.
async fn browser_target(port: u16) -> Result<String, ViewStatus> {
    let Some(Value::Array(targets)) = fetch_json(port, "/json/list").await else {
        return Err(ViewStatus::Unreachable);
    };
    let id = pick_page(&targets).ok_or(ViewStatus::NoPage)?;
    handshake(port, &id, &mac_origin(port)).await?;
    Ok(id)
}

/// Chrome answers the viewer's WebSocket with 101 for an allowed origin and
/// 403 otherwise, so the status alone tells whether the view would load.
async fn handshake(port: u16, id: &str, origin: &str) -> Result<(), ViewStatus> {
    let path = format!("/devtools/page/{id}");
    let headers = [
        ("Connection", "Upgrade"),
        ("Upgrade", "websocket"),
        ("Sec-WebSocket-Version", "13"),
        ("Sec-WebSocket-Key", WEBSOCKET_KEY),
        ("Origin", origin),
    ];
    let status = within(async {
        send(port, &path, &headers)
            .await
            .map(|response| response.status().as_u16())
    })
    .await;
    status_of_handshake(status)
}

fn chrome_candidates(home: &Path) -> [PathBuf; 2] {
    [Path::new("/").join(CHROME_BUNDLE), home.join(CHROME_BUNDLE)]
}

fn chrome_installed_under(root: &Path, home: &Path) -> bool {
    chrome_candidates(home).iter().any(|candidate| {
        let relative = candidate.strip_prefix("/").unwrap_or(candidate);
        root.join(relative).is_dir()
    })
}

#[cfg(test)]
mod tests {
    use super::super::Registry;
    use super::*;
    use serde_json::json;
    use std::io::{ErrorKind, Read, Write};
    use std::net::{Ipv4Addr, Ipv6Addr, TcpListener, TcpStream};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    const OWNER: u32 = 7;

    type Lookup = Box<dyn Fn(&str, u16) -> Result<u16, String> + Send + Sync>;

    #[derive(Debug, Clone)]
    struct Seen {
        method: String,
        path: String,
        headers: Vec<(String, String)>,
    }

    impl Seen {
        fn header(&self, name: &str) -> Vec<&str> {
            self.headers
                .iter()
                .filter(|(k, _)| k.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.as_str())
                .collect()
        }
    }

    #[derive(Clone)]
    enum Reply {
        Http(u16, Vec<(&'static str, String)>, String),
        Silent,
        Close,
        Raw(&'static str),
    }

    fn ok(body: &str) -> Reply {
        Reply::Http(200, Vec::new(), body.to_string())
    }

    fn status(code: u16) -> Reply {
        Reply::Http(code, Vec::new(), String::new())
    }

    fn switching() -> Reply {
        Reply::Http(
            101,
            vec![
                ("Upgrade", "websocket".to_string()),
                ("Connection", "Upgrade".to_string()),
                ("Sec-WebSocket-Accept", "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=".to_string()),
            ],
            String::new(),
        )
    }

    type Handler = Arc<dyn Fn(&Seen) -> Reply + Send + Sync>;

    /// A stand-in for the Chrome behind a forward, listening on both loopbacks
    /// where it can, as a real forward does, so it is found however
    /// `localhost` resolves here.
    struct FakeChrome {
        port: u16,
        connections: Arc<AtomicUsize>,
        seen: Arc<Mutex<Vec<Seen>>>,
    }

    fn bind_loopbacks() -> (TcpListener, Option<TcpListener>) {
        for _ in 0..32 {
            let v4 = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
            let port = v4.local_addr().unwrap().port();
            match TcpListener::bind((Ipv6Addr::LOCALHOST, port)) {
                Ok(v6) => return (v4, Some(v6)),
                Err(e) if e.kind() == ErrorKind::AddrInUse => continue,
                Err(_) => return (v4, None),
            }
        }
        panic!("no port free on both loopbacks");
    }

    fn read_request(stream: &mut TcpStream) -> Option<Seen> {
        stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
        let mut raw = Vec::new();
        let mut buf = [0u8; 1024];
        while !raw.windows(4).any(|w| w == b"\r\n\r\n") {
            let n = stream.read(&mut buf).ok()?;
            if n == 0 || raw.len() > 16 * 1024 {
                return None;
            }
            raw.extend_from_slice(&buf[..n]);
        }
        let text = String::from_utf8_lossy(&raw);
        let mut lines = text.split("\r\n");
        let mut start = lines.next()?.split(' ');
        let method = start.next()?.to_string();
        let path = start.next()?.to_string();
        let headers = lines
            .take_while(|l| !l.is_empty())
            .filter_map(|l| l.split_once(':'))
            .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            .collect();
        Some(Seen {
            method,
            path,
            headers,
        })
    }

    fn answer(mut stream: TcpStream, handler: Handler, seen: Arc<Mutex<Vec<Seen>>>) {
        let Some(request) = read_request(&mut stream) else {
            return;
        };
        seen.lock().unwrap().push(request.clone());
        match handler(&request) {
            Reply::Http(code, headers, body) => {
                let mut head = format!("HTTP/1.1 {code} Fake\r\n");
                for (k, v) in headers {
                    head.push_str(&format!("{k}: {v}\r\n"));
                }
                if code != 101 {
                    head.push_str(&format!(
                        "Content-Length: {}\r\nConnection: close\r\n",
                        body.len()
                    ));
                }
                head.push_str("\r\n");
                head.push_str(&body);
                let _ = stream.write_all(head.as_bytes());
                if code == 101 {
                    std::thread::sleep(Duration::from_millis(300));
                }
            }
            Reply::Silent => std::thread::sleep(Duration::from_secs(4)),
            Reply::Close => {}
            Reply::Raw(text) => {
                let _ = stream.write_all(text.as_bytes());
            }
        }
    }

    impl FakeChrome {
        fn start(handler: impl Fn(&Seen) -> Reply + Send + Sync + 'static) -> Self {
            let handler: Handler = Arc::new(handler);
            let connections = Arc::new(AtomicUsize::new(0));
            let seen = Arc::new(Mutex::new(Vec::new()));
            let (v4, v6) = bind_loopbacks();
            let port = v4.local_addr().unwrap().port();
            for listener in std::iter::once(v4).chain(v6) {
                let (handler, connections, seen) =
                    (Arc::clone(&handler), Arc::clone(&connections), Arc::clone(&seen));
                std::thread::spawn(move || {
                    for stream in listener.incoming().flatten() {
                        connections.fetch_add(1, Ordering::SeqCst);
                        let (handler, seen) = (Arc::clone(&handler), Arc::clone(&seen));
                        std::thread::spawn(move || answer(stream, handler, seen));
                    }
                });
            }
            Self {
                port,
                connections,
                seen,
            }
        }

        fn seen(&self) -> Vec<Seen> {
            self.seen.lock().unwrap().clone()
        }

        fn connections(&self) -> usize {
            self.connections.load(Ordering::SeqCst)
        }

        fn host_header(&self) -> String {
            format!("localhost:{}", self.port)
        }
    }

    fn run<F: Future>(work: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(work)
    }

    fn registry_with(port: u16) -> Arc<Registry> {
        let registry = Registry::new(vec!["-o".into(), "ControlPath=/nonexistent/%C".into()]);
        registry.insert_for_test("devbox", 9222, port, OWNER);
        Arc::new(registry)
    }

    /// Reads `registry` with a master check that reports `live`.
    fn reading(
        registry: &Arc<Registry>,
        live: Option<u32>,
    ) -> impl Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static {
        let registry = Arc::clone(registry);
        move |host, remote| registry.active_local_port_with(host, remote, |_, _| live)
    }

    /// The registry with `devbox 9222 -> {port}` on master `OWNER`.
    fn lookup(
        port: u16,
        live: Option<u32>,
    ) -> impl Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static {
        reading(&registry_with(port), live)
    }

    fn chrome(fake: &FakeChrome) -> bool {
        run(chrome_behind("devbox".into(), 9222, lookup(fake.port, Some(OWNER)))).unwrap()
    }

    /// Stands in for Google Chrome on the Mac: records each URL it is handed.
    #[derive(Clone, Default)]
    struct Opener {
        urls: Arc<Mutex<Vec<String>>>,
    }

    impl Opener {
        fn answering(&self, answer: Result<(), String>) -> impl FnOnce(&str) -> Result<(), String> + Send + 'static {
            let urls = Arc::clone(&self.urls);
            move |url| {
                urls.lock().unwrap().push(url.to_string());
                answer
            }
        }

        fn opener(&self) -> impl FnOnce(&str) -> Result<(), String> + Send + 'static {
            self.answering(Ok(()))
        }

        fn urls(&self) -> Vec<String> {
            self.urls.lock().unwrap().clone()
        }
    }

    fn view_with(
        lookup: impl Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static,
        installed: bool,
        open: impl FnOnce(&str) -> Result<(), String> + Send + 'static,
    ) -> Result<BrowserView, String> {
        run(view_browser("devbox".into(), 9222, lookup, || installed, open))
    }

    fn view(fake: &FakeChrome, opener: &Opener) -> BrowserView {
        view_with(lookup(fake.port, Some(OWNER)), true, opener.opener()).unwrap()
    }

    fn viewer(port: u16, id: &str) -> String {
        format!("http://localhost:{port}/devtools/inspector.html?ws=localhost:{port}/devtools/page/{id}")
    }

    fn timed<T>(work: impl FnOnce() -> T) -> (T, Duration) {
        let start = Instant::now();
        let out = work();
        (out, start.elapsed())
    }

    fn version(browser: &str) -> Reply {
        ok(&json!({"Browser": browser, "Protocol-Version": "1.3"}).to_string())
    }

    #[test]
    fn only_chrome_and_headless_chrome_count_as_chrome() {
        for (reply, expected) in [
            (version("Chrome/156.0.7000.0"), true),
            (version("HeadlessChrome/151.0.1.0"), true),
            (version("node.js/v22.11.0"), false),
            (status(404), false),
            (ok("not json"), false),
        ] {
            let fake = FakeChrome::start(move |_| reply.clone());
            assert_eq!(chrome(&fake), expected);
            let seen = fake.seen();
            assert_eq!(seen.len(), 1, "{seen:?}");
            assert_eq!(seen[0].method, "GET");
            assert_eq!(seen[0].path, "/json/version");
            assert_eq!(seen[0].header("host"), [fake.host_header()]);
        }
    }

    #[test]
    fn a_silent_closing_garbled_or_redirecting_service_is_not_chrome() {
        let silent = FakeChrome::start(|_| Reply::Silent);
        let (found, took) = timed(|| chrome(&silent));
        assert!(!found);
        assert!(took <= Duration::from_millis(2500), "{took:?}");

        let closing = FakeChrome::start(|_| Reply::Close);
        assert!(!chrome(&closing));
        let garbled = FakeChrome::start(|_| Reply::Raw("SSH-2.0-OpenSSH_9.6\r\n"));
        assert!(!chrome(&garbled));

        let elsewhere = FakeChrome::start(|_| version("Chrome/156.0.7000.0"));
        let to = format!("http://127.0.0.1:{}/json/version", elsewhere.port);
        let redirecting =
            FakeChrome::start(move |_| Reply::Http(302, vec![("Location", to.clone())], String::new()));
        assert!(!chrome(&redirecting));
        assert_eq!(elsewhere.connections(), 0);
    }

    #[test]
    fn without_an_active_forward_nothing_is_asked() {
        let fake = FakeChrome::start(|_| version("Chrome/156.0.7000.0"));
        let empty = || {
            let registry = Registry::new(vec!["-o".into(), "ControlPath=/nonexistent/%C".into()]);
            move |host: &str, remote| registry.active_local_port_with(host, remote, |_, _| Some(OWNER))
        };
        let opener = Opener::default();
        let both = |host: &str, remote_port: u32, make: &dyn Fn() -> Lookup| {
            (
                run(chrome_behind(host.into(), remote_port, make())).unwrap_err(),
                run(view_browser(host.into(), remote_port, make(), || true, opener.opener()))
                    .unwrap_err(),
            )
        };
        let missing = "no active forward of port 9222 on devbox".to_string();
        let twice = |text: &str| (text.to_string(), text.to_string());
        assert_eq!(both("devbox", 9222, &|| Box::new(empty())), twice(&missing));
        assert_eq!(
            both("devbox", 9222, &|| Box::new(lookup(fake.port, Some(OWNER + 1)))),
            twice(&missing)
        );
        assert_eq!(
            both("devbox", 9222, &|| Box::new(lookup(fake.port, None))),
            twice(&missing)
        );
        assert_eq!(
            both("devbox", 0, &|| Box::new(lookup(fake.port, Some(OWNER)))),
            twice("invalid port: 0")
        );
        let (bad_host, _) = both("-oProxyCommand=x", 9222, &|| Box::new(lookup(fake.port, Some(OWNER))));
        assert!(!bad_host.is_empty());
        assert_eq!(fake.connections(), 0);
        assert!(opener.urls().is_empty());
    }

    fn page_list() -> String {
        json!([
            {"type": "service_worker", "id": "W1"},
            {"type": "page", "id": "D1", "url": "devtools://devtools/x"},
            {"type": "page", "id": "a/b"},
            {"type": "page", "id": "A1B2", "webSocketDebuggerUrl": "ws://evil.example:1/devtools/page/A1B2"},
            {"type": "page", "id": "C3"},
        ])
        .to_string()
    }

    fn browser(list: Reply, handshake: Reply) -> FakeChrome {
        FakeChrome::start(move |seen| {
            if seen.path == "/json/list" {
                list.clone()
            } else {
                handshake.clone()
            }
        })
    }

    #[test]
    fn the_first_real_page_opens_and_its_own_address_is_ignored() {
        let fake = browser(ok(&page_list()), switching());
        let opener = Opener::default();
        assert_eq!(
            view(&fake, &opener),
            BrowserView {
                status: ViewStatus::Opened,
                remote_port: 9222,
                local_port: fake.port,
                reason: None,
            }
        );
        assert_eq!(opener.urls(), [viewer(fake.port, "A1B2")]);
        let seen = fake.seen();
        let paths: Vec<&str> = seen.iter().map(|s| s.path.as_str()).collect();
        assert_eq!(paths, ["/json/list", "/devtools/page/A1B2"]);
        for request in &seen {
            assert_eq!(request.header("host"), [fake.host_header()]);
        }

        let no_page = json!([
            {"type": "service_worker", "id": "W1"},
            {"type": "page", "id": "D1", "url": "devtools://devtools/x"},
            {"type": "page", "id": "a/b"},
        ]);
        let fake = browser(ok(&no_page.to_string()), switching());
        let opener = Opener::default();
        assert_eq!(view(&fake, &opener).status, ViewStatus::NoPage);
        assert!(opener.urls().is_empty());
        assert_eq!(
            fake.seen().iter().map(|s| s.path.clone()).collect::<Vec<_>>(),
            ["/json/list"]
        );
    }

    #[test]
    fn the_handshake_tells_an_allowed_origin_from_a_refused_one() {
        for (handshake, expected) in [
            (switching(), ViewStatus::Opened),
            (status(403), ViewStatus::OriginRefused),
            (status(404), ViewStatus::Unreachable),
            (Reply::Silent, ViewStatus::Unreachable),
        ] {
            let fake = browser(ok(&page_list()), handshake);
            let opener = Opener::default();
            let (found, took) = timed(|| view(&fake, &opener));
            assert_eq!(found.status, expected);
            assert_eq!(found.local_port, fake.port);
            assert!(took <= Duration::from_millis(2500), "{expected:?} took {took:?}");
            let opened = usize::from(expected == ViewStatus::Opened);
            assert_eq!(opener.urls().len(), opened, "{expected:?}");
            let seen = fake.seen();
            let shake = seen
                .iter()
                .find(|s| s.path == "/devtools/page/A1B2")
                .expect("a handshake");
            assert_eq!(shake.method, "GET");
            assert_eq!(shake.header("origin"), [format!("http://localhost:{}", fake.port)]);
            assert_eq!(shake.header("upgrade"), ["websocket"]);
            assert_eq!(shake.header("sec-websocket-version"), ["13"]);
        }
    }

    #[test]
    fn a_list_that_fails_is_unreachable_without_a_handshake() {
        for list in [Reply::Silent, status(500), ok("not json"), ok("{}")] {
            let fake = browser(list, switching());
            let opener = Opener::default();
            let (found, took) = timed(|| view(&fake, &opener));
            assert_eq!(found.status, ViewStatus::Unreachable);
            assert!(took <= Duration::from_millis(2500), "{took:?}");
            assert!(fake.seen().iter().all(|s| s.path == "/json/list"));
            assert!(opener.urls().is_empty());
        }
    }

    #[test]
    fn without_chrome_on_this_mac_the_server_is_not_asked() {
        let fake = browser(ok(&page_list()), switching());
        let opener = Opener::default();
        let found = view_with(lookup(fake.port, Some(OWNER)), false, opener.opener()).unwrap();
        assert_eq!(found.status, ViewStatus::ChromeMissing);
        assert_eq!((found.remote_port, found.local_port), (9222, fake.port));
        assert_eq!(fake.connections(), 0);
        assert!(opener.urls().is_empty());
    }

    #[test]
    fn a_failed_open_keeps_its_reason() {
        let fake = browser(ok(&page_list()), switching());
        let opener = Opener::default();
        let open = opener.answering(Err("Unable to find application named 'Google Chrome'".into()));
        let found = view_with(lookup(fake.port, Some(OWNER)), true, open).unwrap();
        assert_eq!(
            found,
            BrowserView {
                status: ViewStatus::OpenFailed,
                remote_port: 9222,
                local_port: fake.port,
                reason: Some("Unable to find application named 'Google Chrome'".into()),
            }
        );
        assert_eq!(opener.urls(), [viewer(fake.port, "A1B2")]);
    }

    /// The handshake stands for the moment the user stops the forward or it
    /// comes back on another Mac port, while the check runs.
    fn changed_during_check(change: impl Fn(&Registry, u16) + Send + Sync + 'static) -> (BrowserView, Opener, FakeChrome) {
        let registry: Arc<Mutex<Option<Arc<Registry>>>> = Arc::default();
        let during = Arc::clone(&registry);
        let fake = FakeChrome::start(move |seen| {
            if seen.path == "/json/list" {
                return ok(&page_list());
            }
            if let Some(registry) = during.lock().unwrap().as_ref() {
                let port = seen.header("host")[0].rsplit(':').next().unwrap().parse().unwrap();
                change(registry, port);
            }
            switching()
        });
        let shared = registry_with(fake.port);
        *registry.lock().unwrap() = Some(Arc::clone(&shared));
        let opener = Opener::default();
        let found = view_with(reading(&shared, Some(OWNER)), true, opener.opener()).unwrap();
        (found, opener, fake)
    }

    #[test]
    fn a_forward_that_ends_or_moves_during_the_check_opens_nothing() {
        type Change = fn(&Registry, u16);
        let cases: [(&str, Change); 3] = [
            ("stopped", |registry, port| registry.insert_for_test("devbox", 9222, port, OWNER + 1)),
            ("moved", |registry, port| registry.insert_for_test("devbox", 9222, port + 1, OWNER)),
            ("other server port", |registry, port| {
                registry.insert_for_test("devbox", 9222, port, OWNER + 1);
                registry.insert_for_test("devbox", 9223, port, OWNER);
            }),
        ];
        for (name, change) in cases {
            let (found, opener, fake) = changed_during_check(change);
            assert_eq!(found.status, ViewStatus::ForwardGone, "{name}");
            assert_eq!((found.remote_port, found.local_port), (9222, fake.port), "{name}");
            assert!(opener.urls().is_empty(), "{name}");
            assert!(fake.seen().iter().any(|s| s.path == "/devtools/page/A1B2"), "{name}");
        }
        let (found, opener, fake) = changed_during_check(|registry, port| {
            registry.insert_for_test("devbox", 9222, port, OWNER);
        });
        assert_eq!(found.status, ViewStatus::Opened, "the same forward again");
        assert_eq!(opener.urls(), [viewer(fake.port, "A1B2")]);
    }

    #[test]
    fn a_page_id_from_the_server_never_leaves_the_view_path() {
        let hostile = json!([
            {"type": "page", "id": "1@evil.example"},
            {"type": "page", "id": "A1B2#@evil.example"},
            {"type": "page", "id": "..%2F..%2Fx"},
            {"type": "page", "id": "A1B2?ws=evil.example"},
            {"type": "page", "id": "A1B2/../../evil"},
            {"type": "page", "id": "C3"},
        ]);
        let fake = browser(ok(&hostile.to_string()), switching());
        let opener = Opener::default();
        assert_eq!(view(&fake, &opener).status, ViewStatus::Opened);
        assert_eq!(opener.urls(), [viewer(fake.port, "C3")]);
        let paths: Vec<String> = fake.seen().iter().map(|s| s.path.clone()).collect();
        assert_eq!(paths, ["/json/list", "/devtools/page/C3"]);

        let only_hostile = json!([{"type": "page", "id": "1@evil.example"}]);
        let fake = browser(ok(&only_hostile.to_string()), switching());
        let opener = Opener::default();
        assert_eq!(view(&fake, &opener).status, ViewStatus::NoPage);
        assert!(opener.urls().is_empty());
    }

    #[test]
    fn the_view_address_is_built_only_from_checked_parts() {
        assert_eq!(viewer_url(9223, "A1B2").as_deref(), Some(viewer(9223, "A1B2").as_str()));
        for id in [
            "",
            "a/b",
            "../x",
            "1@evil.example",
            "A1B2#@evil.example",
            "A1B2?x=1",
            "A1 B2",
            "A1B2\r\nHost: evil",
            &"F".repeat(MAX_PAGE_ID + 1),
        ] {
            assert_eq!(viewer_url(9223, id), None, "{id:?}");
        }
        let url = viewer_url(9223, &"F".repeat(MAX_PAGE_ID)).unwrap();
        let parsed = url::Url::parse(&url).unwrap();
        assert_eq!(parsed.host_str(), Some(MAC_HOST));
        assert_eq!(parsed.port(), Some(9223));
        assert_eq!((parsed.username(), parsed.password()), ("", None));
        assert_eq!(parsed.path(), "/devtools/inspector.html");
        let ws: Vec<_> = parsed.query_pairs().collect();
        assert_eq!(ws.len(), 1);
        assert_eq!(ws[0].0, "ws");
        assert_eq!(ws[0].1, format!("localhost:9223/devtools/page/{}", "F".repeat(MAX_PAGE_ID)));
    }

    #[test]
    fn page_ids_are_alphanumeric_and_bounded() {
        assert!(valid_page_id("A1B2"));
        assert!(valid_page_id(&"F".repeat(MAX_PAGE_ID)));
        for id in ["", "a/b", "../x", "A1 B2", "A1?x", "A1#", &"F".repeat(MAX_PAGE_ID + 1)] {
            assert!(!valid_page_id(id), "{id:?}");
        }
        assert_eq!(pick_page(&[json!({"type": "page", "id": 5})]), None);
    }

    #[test]
    fn the_view_serializes_for_the_frontend() {
        let failed = BrowserView {
            status: ViewStatus::OpenFailed,
            remote_port: 9222,
            local_port: 9223,
            reason: Some("no app".into()),
        };
        assert_eq!(
            serde_json::to_value(failed).unwrap(),
            json!({"status": "open_failed", "remotePort": 9222, "localPort": 9223, "reason": "no app"})
        );
        for (status, text) in [
            (ViewStatus::Opened, "opened"),
            (ViewStatus::ChromeMissing, "chrome_missing"),
            (ViewStatus::OriginRefused, "origin_refused"),
            (ViewStatus::NoPage, "no_page"),
            (ViewStatus::Unreachable, "unreachable"),
            (ViewStatus::ForwardGone, "forward_gone"),
        ] {
            assert_eq!(serde_json::to_value(status).unwrap(), json!(text));
        }
        assert_eq!(status_of_handshake(Some(101)), Ok(()));
        assert_eq!(status_of_handshake(Some(404)), Err(ViewStatus::Unreachable));
        assert_eq!(status_of_handshake(None), Err(ViewStatus::Unreachable));
    }

    #[test]
    fn chrome_is_looked_for_in_both_application_folders() {
        assert_eq!(
            chrome_candidates(Path::new("/Users/u")),
            [
                PathBuf::from("/Applications/Google Chrome.app"),
                PathBuf::from("/Users/u/Applications/Google Chrome.app"),
            ]
        );
        let root = tempfile::tempdir().unwrap();
        let home = Path::new("/Users/u");
        assert!(!chrome_installed_under(root.path(), home));
        std::fs::create_dir_all(root.path().join("Users/u/Applications/Google Chrome.app")).unwrap();
        assert!(chrome_installed_under(root.path(), home));
        let system = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(system.path().join("Applications/Google Chrome.app")).unwrap();
        assert!(chrome_installed_under(system.path(), home));
        let file = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(file.path().join("Applications")).unwrap();
        std::fs::write(file.path().join("Applications/Google Chrome.app"), "").unwrap();
        assert!(!chrome_installed_under(file.path(), home));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn chrome_counts_as_missing_outside_macos() {
        assert!(!chrome_installed());
    }

    #[test]
    fn the_webview_cannot_pick_the_app_an_address_opens_in() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json");
        let capability: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();
        let opener: Vec<&Value> = permissions
            .iter()
            .filter(|p| {
                p.as_str()
                    .or_else(|| p["identifier"].as_str())
                    .is_some_and(|id| id.starts_with("opener:"))
            })
            .collect();
        assert!(opener.contains(&&json!("opener:default")));
        assert!(
            opener.iter().all(|p| p["identifier"] != "opener:allow-open-url"),
            "{opener:?}"
        );
        let with_app: Vec<&&Value> = opener
            .iter()
            .filter(|p| {
                ["allow", "deny"].iter().any(|side| {
                    p[*side]
                        .as_array()
                        .is_some_and(|entries| entries.iter().any(|e| e.get("app").is_some()))
                })
            })
            .collect();
        assert!(with_app.is_empty(), "{with_app:?}");
        assert_eq!(CHROME_APP, "Google Chrome");
    }

    #[test]
    fn the_mac_host_is_localhost() {
        assert_eq!(MAC_HOST, "localhost");
        assert_eq!(mac_origin(9223), "http://localhost:9223");
    }
}

/// A real Chrome, ignored in the normal suite. Start it headless with
/// `chrome --headless --no-sandbox --remote-debugging-port=<port> --remote-allow-origins=http://localhost:<port> --user-data-dir=<empty dir> about:blank`
/// on this machine's loopback (in a container: `--network host`), then run
/// `TERAX_E2E_CHROME_PORT=<port> cargo test --lib ports::chrome::e2e -- --ignored --nocapture`.
/// The debugging port stands in for the Mac port of a forward, and the open
/// only records the address, which is then fetched from that Chrome. Without
/// `--remote-allow-origins` set `TERAX_E2E_CHROME_EXPECT=origin_refused`.
#[cfg(test)]
mod e2e {
    use super::super::Registry;
    use super::*;
    use std::sync::Mutex;

    fn port() -> u16 {
        std::env::var("TERAX_E2E_CHROME_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .expect("TERAX_E2E_CHROME_PORT names the debugging port, see the module comment")
    }

    fn lookup(port: u16) -> impl Fn(&str, u16) -> Result<u16, String> + Send + Sync + 'static {
        let registry = Registry::new(vec!["-o".into(), "ControlPath=/nonexistent/%C".into()]);
        registry.insert_for_test("devbox", 9222, port, 1);
        move |host, remote| registry.active_local_port_with(host, remote, |_, _| Some(1))
    }

    fn run<F: Future>(work: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(work)
    }

    #[test]
    #[ignore = "needs a running Chrome, see the module comment"]
    fn e2e_a_real_chrome_is_found_and_its_view_opens() {
        let port = port();
        let found = run(chrome_behind("devbox".into(), 9222, lookup(port)));
        let urls = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&urls);
        let open = move |url: &str| {
            sink.lock().unwrap().push(url.to_string());
            Ok(())
        };
        let view = run(view_browser("devbox".into(), 9222, lookup(port), || true, open));
        let urls = urls.lock().unwrap().clone();
        println!("E2E chrome on {port} -> {found:?}; view -> {view:?}; opened {urls:?}");
        assert_eq!(found, Ok(true));
        let view = view.unwrap();
        assert_eq!((view.remote_port, view.local_port), (9222, port));
        let expected = std::env::var("TERAX_E2E_CHROME_EXPECT").unwrap_or_else(|_| "opened".into());
        assert_eq!(serde_json::to_value(view.status).unwrap(), Value::String(expected));
        if view.status != ViewStatus::Opened {
            assert!(urls.is_empty());
            return;
        }
        let [url] = urls.as_slice() else {
            panic!("one address opened, got {urls:?}");
        };
        let prefix = format!("http://localhost:{port}/devtools/inspector.html?ws=localhost:{port}/devtools/page/");
        assert!(url.strip_prefix(&prefix).is_some_and(valid_page_id), "{url}");
        let path = url.strip_prefix(&mac_origin(port)).unwrap();
        let served = run(send(port, path, &[])).map(|r| r.status().as_u16());
        println!("E2E viewer {url} -> {served:?}");
        assert_eq!(served, Some(200));
    }
}
