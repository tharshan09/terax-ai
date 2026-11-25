//! The accept loop of one grant and one connection after another: limits on
//! connections, the head and the write, one answer, `Connection: close`.

use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Semaphore;
use tokio::time::Instant;

use super::grant::{Grant, GrantClass, Location};
use super::policy;
use super::request::{parse_request, split_target, Method, Reject, TargetError};
use super::source::{read_local, read_remote, Loaded, ReadGate, Refusal, Remote};
use super::Limits;

/// After a failed accept (for example out of file descriptors), so the loop
/// does not spin.
const ACCEPT_BACKOFF: Duration = Duration::from_millis(50);
/// What a client may still send after its answer before the server stops
/// waiting for it to close.
const DRAIN_LIMIT: usize = 1 << 20;

/// What all grants of one server share.
pub(crate) struct Shared {
    pub limits: Limits,
    pub frame_ancestors: bool,
    /// Open connections over all grants (SEC-12).
    pub connections: Arc<Semaphore>,
    pub reads: ReadGate,
    pub remote: Remote,
}

impl Shared {
    pub(crate) fn new(limits: Limits, frame_ancestors: bool, remote: Remote) -> Self {
        Self {
            limits,
            frame_ancestors,
            connections: Arc::new(Semaphore::new(limits.connections_total)),
            reads: ReadGate::new(limits),
            remote,
        }
    }
}

/// One answer, written as a whole and followed by closing the connection.
#[derive(Debug)]
pub(crate) struct Reply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
    /// `false` for `HEAD`: the headers name the length, the body stays home.
    pub send_body: bool,
}

impl Reply {
    /// An empty answer that says nothing about any file.
    fn empty(status: u16) -> Self {
        Self {
            status,
            headers: vec![("Connection", "close".to_string())],
            body: Vec::new(),
            send_body: true,
        }
    }

    fn rejected(reject: Reject) -> Self {
        let mut reply = Self::empty(reject.status());
        if reject == Reject::MethodNotAllowed {
            reply.headers.push(("Allow", "GET, HEAD".to_string()));
        }
        reply
    }

    fn refused(refusal: &Refusal, class: GrantClass, frame_ancestors: bool) -> Self {
        Self {
            status: refusal.status(),
            headers: policy::response_headers(policy::TEXT_PAGE, class, frame_ancestors),
            body: refusal.body().into_bytes(),
            send_body: true,
        }
    }

    fn file(loaded: Loaded, class: GrantClass, frame_ancestors: bool) -> Self {
        let Loaded { bytes, served } = loaded;
        Self {
            status: 200,
            headers: policy::response_headers(served, class, frame_ancestors),
            body: bytes,
            send_body: true,
        }
    }

    fn head_bytes(&self) -> Vec<u8> {
        let mut head = format!("HTTP/1.1 {} {}\r\n", self.status, reason_phrase(self.status));
        for (name, value) in &self.headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        head.push_str(&format!("Content-Length: {}\r\n\r\n", self.body.len()));
        head.into_bytes()
    }
}

fn reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        421 => "Misdirected Request",
        431 => "Request Header Fields Too Large",
        502 => "Bad Gateway",
        504 => "Gateway Timeout",
        _ => "",
    }
}

/// Accepts connections for `grant` until the process ends. A connection over
/// the limit of this grant or of all grants is closed at once.
pub(crate) async fn serve_listener(listener: TcpListener, grant: Arc<Grant>, shared: Arc<Shared>) {
    loop {
        let stream = match listener.accept().await {
            Ok((stream, _)) => stream,
            Err(e) => {
                log::debug!("preview server: accept failed: {e}");
                tokio::time::sleep(ACCEPT_BACKOFF).await;
                continue;
            }
        };
        // Over a limit the connection is dropped, which closes it.
        let Ok(own) = Arc::clone(&grant.connections).try_acquire_owned() else {
            log::debug!("preview server: too many connections to one link, closing one");
            continue;
        };
        let Ok(all) = Arc::clone(&shared.connections).try_acquire_owned() else {
            log::debug!("preview server: too many connections, closing one");
            continue;
        };
        let (grant, shared) = (Arc::clone(&grant), Arc::clone(&shared));
        tokio::spawn(async move {
            let _held = (own, all);
            serve_connection(stream, grant, &shared).await;
        });
    }
}

enum Head {
    Complete(Vec<u8>),
    TooLarge,
    Closed,
}

/// Reads up to the blank line that ends the head; nothing of a body.
async fn read_head(stream: &mut TcpStream, max: usize) -> std::io::Result<Head> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    loop {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            return Ok(Head::Closed);
        }
        let from = buf.len().saturating_sub(3);
        buf.extend_from_slice(&chunk[..n]);
        if let Some(at) = buf[from..].windows(4).position(|w| w == b"\r\n\r\n") {
            let end = from + at + 4;
            if end > max {
                return Ok(Head::TooLarge);
            }
            buf.truncate(end);
            return Ok(Head::Complete(buf));
        }
        if buf.len() > max {
            return Ok(Head::TooLarge);
        }
    }
}

async fn serve_connection(mut stream: TcpStream, grant: Arc<Grant>, shared: &Shared) {
    let limits = shared.limits;
    let head = match tokio::time::timeout(limits.head_budget, read_head(&mut stream, limits.head_bytes)).await {
        Ok(Ok(Head::Complete(head))) => head,
        Ok(Ok(Head::TooLarge)) => {
            finish(stream, Reply::rejected(Reject::HeadersTooLarge), limits).await;
            return;
        }
        Ok(Ok(Head::Closed)) => return,
        Ok(Err(e)) => {
            log::debug!("preview server: reading a request failed: {e}");
            return;
        }
        Err(_) => {
            log::debug!("preview server: a request head did not arrive within the budget");
            return;
        }
    };
    let reply = respond(&head, grant, shared).await;
    finish(stream, reply, limits).await;
}

/// The answer to one complete head: VAL-1 to VAL-5, then the read chain of
/// the grant's location.
async fn respond(head: &[u8], grant: Arc<Grant>, shared: &Shared) -> Reply {
    let authority = grant.host_name.authority(grant.port);
    let request = match parse_request(head, &authority, shared.limits.head_lines) {
        Ok(request) => request,
        Err(reject) => return Reply::rejected(reject),
    };
    let (class, frame_ancestors) = (grant.class, shared.frame_ancestors);
    let target = match split_target(&request.target, &grant.token) {
        Ok(target) => target,
        Err(TargetError::NoGrant) => return Reply::empty(404),
        Err(TargetError::BadPath) => return Reply::refused(&Refusal::NotFound, class, frame_ancestors),
    };
    let loaded = match &grant.location {
        Location::Local => {
            let grant = Arc::clone(&grant);
            tokio::task::spawn_blocking(move || read_local(&grant, &target))
                .await
                .unwrap_or_else(|e| Err(Refusal::Refused(format!("the read task failed: {e}"))))
        }
        Location::Ssh { host } => {
            let read = Arc::clone(&shared.remote.read);
            read_remote(&grant, host, &target, &shared.reads, read).await
        }
    };
    let mut reply = match loaded {
        Ok(loaded) => Reply::file(loaded, class, frame_ancestors),
        Err(refusal) => {
            log_refusal(&refusal);
            Reply::refused(&refusal, class, frame_ancestors)
        }
    };
    reply.send_body = request.method == Method::Get;
    reply
}

/// Log levels after "Error Handling Strategy"; never the request target.
fn log_refusal(refusal: &Refusal) {
    match refusal {
        Refusal::NotFound => log::debug!("preview server: not found"),
        Refusal::Refused(reason) => log::debug!("preview server: refused: {reason}"),
        Refusal::TooLarge => log::debug!("preview server: larger than 10 MB"),
        Refusal::BadGateway { name, host, reason } => {
            log::info!("preview server: could not read {name} from {host}: {reason}")
        }
        Refusal::TimedOut { name, host } => {
            log::warn!("preview server: reading {name} from {host} timed out")
        }
    }
}

/// Writes the answer within the write budget, then closes only the sending
/// half and reads what the client still sends until it closes, so the answer
/// is not lost to a reset (OB-11).
async fn finish(mut stream: TcpStream, reply: Reply, limits: Limits) {
    let deadline = Instant::now() + limits.write_budget;
    let written = tokio::time::timeout_at(deadline, async {
        stream.write_all(&reply.head_bytes()).await?;
        if reply.send_body {
            stream.write_all(&reply.body).await?;
        }
        stream.shutdown().await
    })
    .await;
    match written {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            log::debug!("preview server: writing an answer failed: {e}");
            return;
        }
        Err(_) => {
            log::debug!("preview server: an answer was not taken within the write budget");
            return;
        }
    }
    match tokio::time::timeout_at(deadline, drain(&mut stream)).await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => log::debug!("preview server: closing a connection failed: {e}"),
        Err(_) => log::debug!("preview server: a client kept its connection open after the answer"),
    }
}

async fn drain(stream: &mut TcpStream) -> std::io::Result<()> {
    let mut chunk = [0u8; 8192];
    let mut total = 0;
    while total < DRAIN_LIMIT {
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        total += n;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpStream as StdStream;

    use super::super::testkit::{self, get, send, Driver, FakeHost, Latch, Link, Opener};
    use super::*;

    fn write(path: &std::path::Path, bytes: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    struct Site {
        _dir: tempfile::TempDir,
        p: std::path::PathBuf,
    }

    fn site() -> Site {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("p");
        write(&p.join("a.html"), b"<html>A</html>");
        write(&p.join("index.html"), b"<html>INDEX</html>");
        write(&p.join("sub/y.png"), b"Y-PNG");
        Site { _dir: dir, p }
    }

    fn open_local(driver: &Driver, core: &super::super::Core, path: &std::path::Path) -> Link {
        let opener = Opener::default();
        let opened = driver.block_on(core.open_in_browser(path.to_str().unwrap().to_string(), None, opener.answering(Ok(()))));
        assert_eq!(opened.unwrap().status, super::super::BrowserOpenStatus::Opened);
        Link::parse(&opener.urls()[0])
    }

    /// Sicherheitsmodell 3
    #[test]
    fn ac20_serves_files_index_and_fresh_content_on_loopback() {
        let site = site();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let link = open_local(&driver, &core, &site.p.join("a.html"));
        // The browser class binds exactly this way (SEC-4).
        let (port, sockets) = super::super::bind_listeners(super::super::grant::HostName::Ip).unwrap();
        let addr = sockets[0].local_addr().unwrap();
        assert_eq!((sockets.len(), addr.ip()), (1, std::net::IpAddr::from([127, 0, 0, 1])));
        assert_ne!(port, 0);
        assert_eq!(core.grant_at(link.port).host_name, super::super::grant::HostName::Ip);

        let host = format!("127.0.0.1:{}", link.port);
        let page = get(link.port, &link.path("a.html"), &host);
        assert_eq!(page.status, 200);
        assert_eq!(page.header("Content-Type"), Some("text/html"));
        assert_eq!(page.header("Content-Security-Policy"), Some("frame-ancestors 'self'"));
        for (name, value) in [
            ("X-Content-Type-Options", "nosniff"),
            ("Cache-Control", "no-store"),
            ("Referrer-Policy", "no-referrer"),
            ("Connection", "close"),
        ] {
            assert_eq!(page.header(name), Some(value), "{name}");
        }
        assert_eq!(page.body, b"<html>A</html>");

        let head = send(link.port, format!("HEAD {} HTTP/1.1\r\nHost: {host}\r\n\r\n", link.path("a.html")).as_bytes());
        assert_eq!(head.status, 200);
        assert_eq!(head.header("Content-Length"), Some("14"));
        assert_eq!(head.header("Content-Security-Policy"), Some("frame-ancestors 'self'"));
        assert!(head.body.is_empty());

        let missing_head = send(link.port, format!("HEAD {} HTTP/1.1\r\nHost: {host}\r\n\r\n", link.path("fehlt.png")).as_bytes());
        assert_eq!((missing_head.status, missing_head.header("Content-Length")), (404, Some("9")));
        assert!(missing_head.body.is_empty());
        assert_eq!(get(link.port, &link.path(""), &host).body, b"<html>INDEX</html>");
        let missing = get(link.port, &link.path("fehlt.png"), &host);
        assert_eq!((missing.status, missing.body.as_slice()), (404, &b"Not found"[..]));
        let image = get(link.port, &link.path("sub/y.png"), &host);
        assert_eq!((image.status, image.body.as_slice()), (200, &b"Y-PNG"[..]));

        write(&site.p.join("a.html"), b"<html>NEW</html>");
        assert_eq!(get(link.port, &link.path("a.html"), &host).body, b"<html>NEW</html>");
    }

    /// Sicherheitsmodell 1
    /// Sicherheitsmodell 13
    #[test]
    fn ac21_a_listener_takes_only_its_own_token() {
        let site = site();
        write(&site.p.join("b.html"), b"<html>B</html>");
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let a = open_local(&driver, &core, &site.p.join("a.html"));
        let b = open_local(&driver, &core, &site.p.join("b.html"));
        assert_ne!(a.port, b.port);
        assert_ne!(a.token, b.token);
        let host = format!("127.0.0.1:{}", a.port);
        for path in [
            "/a.html".to_string(),
            "/falsch/a.html".to_string(),
            format!("/{}/a.html", b.token),
            format!("/{}/fehlt.html", b.token),
            format!("/{}", a.token),
        ] {
            let reply = get(a.port, &path, &host);
            assert_eq!(reply.status, 404, "{path}");
            assert!(reply.body.is_empty(), "{path}");
            assert_eq!(reply.header("Content-Type"), None, "{path}");
        }
    }

    fn connect(port: u16) -> StdStream {
        let stream = StdStream::connect(("127.0.0.1", port)).unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        stream
    }

    /// Waits until `ready` holds, at most `limit`.
    fn eventually(limit: Duration, mut ready: impl FnMut() -> bool) -> bool {
        let deadline = std::time::Instant::now() + limit;
        while std::time::Instant::now() < deadline {
            if ready() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        ready()
    }

    /// The connection was closed by the server: EOF or a reset, no answer.
    fn closed_without_answer(stream: &mut StdStream) -> bool {
        let mut buf = [0u8; 64];
        match stream.read(&mut buf) {
            Ok(0) => true,
            Ok(_) => false,
            Err(e) => e.kind() == std::io::ErrorKind::ConnectionReset,
        }
    }

    /// Sicherheitsmodell 18
    #[test]
    fn ac22_head_limits() {
        let site = site();
        let driver = Driver::new();
        let mut config = testkit::config();
        config.limits.head_budget = Duration::from_millis(400);
        let core = testkit::core(&FakeHost::new(), None, config);
        let link = open_local(&driver, &core, &site.p.join("a.html"));
        let host = format!("127.0.0.1:{}", link.port);

        let huge = format!("GET {} HTTP/1.1\r\nHost: {host}\r\nX-Fill: {}\r\n\r\n", link.path("a.html"), "x".repeat(65 * 1024));
        assert_eq!(send(link.port, huge.as_bytes()).status, 431);
        let cookie = format!("GET {} HTTP/1.1\r\nHost: {host}\r\nCookie: {}\r\n\r\n", link.path("a.html"), "c".repeat(20 * 1024));
        assert_eq!(send(link.port, cookie.as_bytes()).status, 200);

        let mut stalled = connect(link.port);
        stalled.write_all(b"GET / HTTP/1.1\r\nHost: ").unwrap();
        let started = std::time::Instant::now();
        assert!(closed_without_answer(&mut stalled));
        let waited = started.elapsed();
        assert!(waited >= Duration::from_millis(350) && waited < Duration::from_secs(5), "{waited:?}");
    }

    /// Sicherheitsmodell 18
    #[test]
    fn ac22_connection_limits_per_grant_and_overall() {
        let dir = tempfile::tempdir().unwrap();
        let driver = Driver::new();
        let mut config = testkit::config();
        config.limits.head_budget = Duration::from_secs(5);
        let core = testkit::core(&FakeHost::new(), None, config);
        let links: Vec<Link> = (0..5)
            .map(|i| {
                let page = dir.path().join(format!("p{i}/a.html"));
                write(&page, b"<html>");
                open_local(&driver, &core, &page)
            })
            .collect();
        let grant = core.grant_at(links[0].port);

        let mut held: Vec<StdStream> = (0..16).map(|_| connect(links[0].port)).collect();
        assert!(eventually(Duration::from_secs(5), || grant.connections.available_permits() == 0));
        let mut seventeenth = connect(links[0].port);
        let started = std::time::Instant::now();
        assert!(closed_without_answer(&mut seventeenth));
        assert!(started.elapsed() < Duration::from_secs(2), "{:?}", started.elapsed());

        // 16 + 4 * 12 = 64 open connections over five grants; the 65th, on a
        // grant with room left, is closed at once.
        for link in &links[1..] {
            held.extend((0..12).map(|_| connect(link.port)));
        }
        let all = Arc::clone(&core.shared().connections);
        assert!(eventually(Duration::from_secs(5), || all.available_permits() == 0));
        let mut sixty_fifth = connect(links[4].port);
        let started = std::time::Instant::now();
        assert!(closed_without_answer(&mut sixty_fifth));
        assert!(started.elapsed() < Duration::from_secs(2), "{:?}", started.elapsed());
        assert!(core.grant_at(links[4].port).connections.available_permits() > 0);
        drop(held);
    }

    #[test]
    fn ac23_write_budget_and_half_close() {
        let site = site();
        let big = std::fs::File::create(site.p.join("big.png")).unwrap();
        big.set_len(10 * 1024 * 1024).unwrap();
        write(&site.p.join("small.png"), &vec![7u8; 64 * 1024]);
        let driver = Driver::new();
        let mut config = testkit::config();
        config.limits.write_budget = Duration::from_millis(300);
        let core = testkit::core(&FakeHost::new(), None, config);
        let link = open_local(&driver, &core, &site.p.join("a.html"));
        let host = format!("127.0.0.1:{}", link.port);

        // A client that does not read is dropped after the write budget.
        let mut lazy = connect(link.port);
        lazy.write_all(format!("GET {} HTTP/1.1\r\nHost: {host}\r\n\r\n", link.path("big.png")).as_bytes()).unwrap();
        std::thread::sleep(Duration::from_millis(900));
        let mut got = Vec::new();
        let _ = lazy.read_to_end(&mut got);
        assert!(got.len() < 10 * 1024 * 1024, "the whole answer arrived: {}", got.len());

        // A client that keeps sending after its head still gets every byte.
        let mut chatty = connect(link.port);
        let mut request = format!("GET {} HTTP/1.1\r\nHost: {host}\r\n\r\n", link.path("small.png")).into_bytes();
        request.extend(vec![b'z'; 16 * 1024]);
        chatty.write_all(&request).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        let mut got = Vec::new();
        chatty.read_to_end(&mut got).expect("no reset");
        let reply = testkit::parse_reply(&got);
        assert_eq!(reply.status, 200);
        assert_eq!(reply.header("Content-Length"), Some("65536"));
        assert_eq!(reply.body.len(), 64 * 1024);
    }

    /// Sicherheitsmodell 4
    /// Sicherheitsmodell 23
    #[test]
    fn ac33_protocol_errors_on_the_wire() {
        let site = site();
        let driver = Driver::new();
        let core = testkit::core(&FakeHost::new(), None, testkit::config());
        let link = open_local(&driver, &core, &site.p.join("a.html"));
        let host = format!("127.0.0.1:{}", link.port);
        let path = link.path("a.html");
        let many: String = (0..64).map(|i| format!("X-Fill-{i}: v\r\n")).collect();
        let cases = [
            (format!("POST {path} HTTP/1.1\r\nHost: {host}\r\n\r\n"), 405),
            (format!("GET {path} HTTP/1.1\r\n\r\n"), 400),
            (format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nHost: {host}\r\n\r\n"), 400),
            (format!("GET {path} HTTP/1.1\r\nHost: {host}\r\n{many}\r\n"), 431),
            (format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nContent-Length: 5\r\n\r\nhello"), 400),
            (format!("GET {path} HTTP/1.1\r\nHost: localhost:{}\r\n\r\n", link.port), 421),
        ];
        for (raw, status) in cases {
            let reply = send(link.port, raw.as_bytes());
            assert_eq!(reply.status, status, "{raw}");
            assert!(reply.body.is_empty(), "{raw}");
            assert_eq!(reply.header("Connection"), Some("close"), "{raw}");
            assert_eq!(reply.header("Allow"), (status == 405).then_some("GET, HEAD"), "{raw}");
        }
    }

    #[test]
    fn ac19_a_blocked_ssh_read_does_not_stop_local_files() {
        let site = site();
        let fake = FakeHost::new();
        fake.file("/srv/p/a.html", b"<html>");
        fake.file("/srv/p/y.png", b"Y");
        let latch = Latch::new();
        fake.hold("/srv/p/y.png", &latch);
        let driver = Driver::new();
        let core = testkit::core(&fake, None, testkit::config());
        let local = open_local(&driver, &core, &site.p.join("a.html"));
        let opener = Opener::default();
        let opened = driver.block_on(core.open_in_browser("/srv/p/a.html".into(), testkit::ssh("devbox"), opener.answering(Ok(()))));
        assert_eq!(opened.unwrap().status, super::super::BrowserOpenStatus::Opened);
        let remote = Link::parse(&opener.urls()[0]);

        let blocked = std::thread::spawn(move || {
            get(remote.port, &remote.path("y.png"), &format!("127.0.0.1:{}", remote.port))
        });
        assert!(eventually(Duration::from_secs(5), || latch.entered()));
        let page = get(local.port, &local.path("a.html"), &format!("127.0.0.1:{}", local.port));
        assert_eq!(page.status, 200);
        assert!(!blocked.is_finished());
        latch.open();
        assert_eq!(blocked.join().unwrap().status, 200);
    }
}
