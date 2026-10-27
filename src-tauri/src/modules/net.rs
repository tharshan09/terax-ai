use std::collections::HashMap;
use std::future::Future;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Mutex;
use std::time::Duration;

use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, LOCATION};
use reqwest::{ClientBuilder, Method, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use url::{Host, Url};

mod ip;
use ip::{ip_kind, IpKind};

const HEADER_BLOCKLIST: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "transfer-encoding",
    "upgrade",
    "trailer",
    "expect",
];

const MAX_REDIRECTS: usize = 10;
const CLIENT_CACHE_SIZE: usize = 8;

const PAYLOAD_HEADERS: [&str; 4] = [
    "content-type",
    "content-length",
    "content-encoding",
    "transfer-encoding",
];

const CREDENTIAL_HEADERS: [&str; 5] = [
    "authorization",
    "cookie",
    "cookie2",
    "proxy-authorization",
    "www-authenticate",
];

fn is_blocked_host_name(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        host.as_str(),
        "metadata.google.internal" | "metadata" | "metadata.azure.com"
    )
}

fn host_ip<S>(host: &Host<S>) -> Option<IpAddr> {
    match *host {
        Host::Ipv4(ip) => Some(ip.into()),
        Host::Ipv6(ip) => Some(ip.into()),
        Host::Domain(_) => None,
    }
}

fn worst_kind(ips: &[IpAddr]) -> Option<IpKind> {
    ips.iter().map(|ip| ip_kind(*ip)).reduce(IpKind::worse)
}

trait Dns {
    fn lookup(&self, name: String) -> impl Future<Output = Result<Vec<IpAddr>, String>> + Send;
}

struct SystemDns;

impl Dns for SystemDns {
    async fn lookup(&self, name: String) -> Result<Vec<IpAddr>, String> {
        tokio::task::spawn_blocking(move || {
            (name.as_str(), 0u16)
                .to_socket_addrs()
                .map(|it| it.map(|a| a.ip()).collect())
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("dns: {e}"))
    }
}

/// Resolve `host` once and return both its safety classification and the
/// concrete IPs we resolved. Callers can pin reqwest to these IPs to defeat
/// DNS rebinding (where a second lookup returns a different address).
async fn resolve_and_classify(
    host: &Host<String>,
    dns: &impl Dns,
) -> Result<(IpKind, Vec<IpAddr>), String> {
    let ips = match host_ip(host) {
        Some(ip) => vec![ip],
        None => dns.lookup(host.to_string()).await?,
    };
    let worst = worst_kind(&ips).ok_or("dns: no addresses")?;
    Ok((worst, ips))
}

fn parse_url(url: &str) -> Result<Url, String> {
    Url::parse(url).map_err(|e| format!("invalid url: {e}"))
}

fn check_url_shape(url: &Url) -> Result<Host<&str>, String> {
    match url.scheme() {
        "http" | "https" => {}
        s => return Err(format!("scheme not allowed: {s}")),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("userinfo in url is not allowed".into());
    }
    let host = url.host().ok_or_else(|| "missing host".to_string())?;
    if matches!(host, Host::Domain(name) if is_blocked_host_name(name)) {
        return Err(format!("host not allowed: {host}"));
    }
    Ok(host)
}

fn admit(host: &Host<String>, kind: IpKind, allow_private: bool) -> Result<(), String> {
    match kind {
        IpKind::Public => Ok(()),
        IpKind::Private | IpKind::Loopback if allow_private => Ok(()),
        IpKind::BlockedMetadata => Err(format!("host not allowed: {host}")),
        IpKind::Private | IpKind::Loopback => Err(format!(
            "host {host} resolves to a private/loopback address; this endpoint requires explicit opt-in",
        )),
    }
}

/// The returned IPs pin reqwest to exactly the addresses `admit` judged, so a
/// second lookup cannot rebind the host.
async fn resolve_and_admit(
    host: &Host<String>,
    allow_private: bool,
    dns: &impl Dns,
) -> Result<(IpKind, Vec<IpAddr>), String> {
    let (worst, ips) = resolve_and_classify(host, dns).await?;
    admit(host, worst, allow_private)?;
    Ok((worst, ips))
}

// Local models never go through an env proxy. Residual risk only for public
// targets: behind an env proxy the proxy resolves them again.
fn uses_env_proxy(kind: IpKind) -> bool {
    kind == IpKind::Public
}

// Reuse the classified addresses, not a second lookup; reqwest fills in port 0.
fn pin_to(builder: ClientBuilder, host: &Host<String>, ips: &[IpAddr]) -> ClientBuilder {
    let Host::Domain(name) = host else {
        return builder;
    };
    let addrs: Vec<SocketAddr> = ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
    builder.resolve_to_addrs(name, &addrs)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Timeouts {
    Ai,
    Ping,
}

#[derive(Debug, PartialEq, Eq)]
struct ClientKey {
    host: Host<String>,
    ips: Vec<IpAddr>,
    kind: IpKind,
    timeouts: Timeouts,
}

async fn admit_url(
    url: &Url,
    allow_private: bool,
    timeouts: Timeouts,
    dns: &impl Dns,
) -> Result<ClientKey, String> {
    let host = check_url_shape(url)?.to_owned();
    let (kind, ips) = resolve_and_admit(&host, allow_private, dns).await?;
    Ok(ClientKey {
        host,
        ips,
        kind,
        timeouts,
    })
}

fn build_client(key: &ClientKey) -> Result<reqwest::Client, String> {
    let builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    let mut builder = match key.timeouts {
        Timeouts::Ai => builder.connect_timeout(Duration::from_secs(10)),
        Timeouts::Ping => builder.timeout(Duration::from_secs(5)),
    };
    if !uses_env_proxy(key.kind) {
        builder = builder.no_proxy();
    }
    pin_to(builder, &key.host, &key.ips)
        .build()
        .map_err(|e| e.to_string())
}

struct Lru<K, V> {
    capacity: usize,
    entries: Vec<(K, V)>,
}

impl<K: PartialEq, V: Clone> Lru<K, V> {
    const fn new(capacity: usize) -> Self {
        Self {
            capacity,
            entries: Vec::new(),
        }
    }

    fn get_or_try_insert<E>(
        &mut self,
        key: K,
        make: impl FnOnce(&K) -> Result<V, E>,
    ) -> Result<V, E> {
        let entry = match self.entries.iter().position(|(k, _)| *k == key) {
            Some(i) => self.entries.remove(i),
            None => {
                let value = make(&key)?;
                if self.entries.len() >= self.capacity {
                    self.entries.remove(0);
                }
                (key, value)
            }
        };
        let value = entry.1.clone();
        self.entries.push(entry);
        Ok(value)
    }
}

static CLIENTS: Mutex<Lru<ClientKey, reqwest::Client>> = Mutex::new(Lru::new(CLIENT_CACHE_SIZE));

fn client_for(key: ClientKey) -> Result<reqwest::Client, String> {
    CLIENTS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_or_try_insert(key, build_client)
}

fn sanitize_headers(headers: Option<HashMap<String, String>>) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    let Some(h) = headers else { return Ok(map) };
    for (k, v) in h {
        let lower = k.to_ascii_lowercase();
        if HEADER_BLOCKLIST.contains(&lower.as_str()) {
            return Err(format!("header not allowed: {k}"));
        }
        // CRLF injection: header value must not contain CR / LF / NUL.
        if v.as_bytes().iter().any(|b| matches!(b, 0 | b'\r' | b'\n')) {
            return Err(format!("header value contains control bytes: {k}"));
        }
        let name = HeaderName::from_bytes(k.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(&v).map_err(|e| e.to_string())?;
        map.insert(name, value);
    }
    Ok(map)
}

#[tauri::command]
pub async fn lm_ping(base_url: String) -> Result<u16, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("empty base url".into());
    }
    let probe = parse_url(&format!("{trimmed}/models"))?;
    let client = client_for(admit_url(&probe, true, Timeouts::Ping, &SystemDns).await?)?;

    // Any answer, a 3xx included, means the server is reachable.
    client
        .get(probe)
        .send()
        .await
        .map(|r| r.status().as_u16())
        .map_err(|e| e.to_string())
}
// AI HTTP proxy — bypasses webview CORS / Mixed-Content / PNA so local-network
// model servers (LM Studio, Ollama, vLLM) work in the production bundle.

#[derive(Debug, Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Debug)]
struct Hop {
    url: Url,
    method: Method,
    headers: HeaderMap,
    body: Option<Bytes>,
}

impl Hop {
    fn first(
        url: &str,
        method: &str,
        headers: Option<HashMap<String, String>>,
        body: Option<Vec<u8>>,
    ) -> Result<Self, String> {
        Ok(Self {
            url: parse_url(url)?,
            method: Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
            headers: sanitize_headers(headers)?,
            body: body.map(Bytes::from),
        })
    }
}

// reqwest 0.12's rules, but a credential strip sticks and also fires on a scheme
// change; no Referer, since the previous URL may carry an API key in its query.
fn next_hop(
    current: &Hop,
    status: StatusCode,
    location: Option<&HeaderValue>,
    followed: usize,
) -> Result<Option<Hop>, String> {
    let keeps_payload = match status {
        StatusCode::MOVED_PERMANENTLY | StatusCode::FOUND => current.method != Method::POST,
        StatusCode::TEMPORARY_REDIRECT | StatusCode::PERMANENT_REDIRECT => true,
        StatusCode::SEE_OTHER => false,
        _ => return Ok(None),
    };
    let Some(url) = location
        .and_then(|value| std::str::from_utf8(value.as_bytes()).ok())
        .and_then(|value| current.url.join(value).ok())
    else {
        return Ok(None);
    };
    if followed >= MAX_REDIRECTS {
        return Err("too many redirects".into());
    }
    let mut next = Hop {
        url,
        method: current.method.clone(),
        headers: current.headers.clone(),
        body: current.body.clone(),
    };
    if !keeps_payload {
        if next.method != Method::HEAD {
            next.method = Method::GET;
        }
        next.body = None;
        for name in PAYLOAD_HEADERS {
            next.headers.remove(name);
        }
    }
    if next.url.origin() != current.url.origin() {
        for name in CREDENTIAL_HEADERS {
            next.headers.remove(name);
        }
    }
    Ok(Some(next))
}

// reqwest would resolve a redirect target itself, unclassified and unpinned, so
// every hop passes admit_url and gets a client for its own address class.
async fn send_guarded(
    dns: &impl Dns,
    allow_private: bool,
    mut hop: Hop,
) -> Result<reqwest::Response, String> {
    let mut followed = 0;
    loop {
        let client = client_for(admit_url(&hop.url, allow_private, Timeouts::Ai, dns).await?)?;
        let mut request = client
            .request(hop.method.clone(), hop.url.clone())
            .headers(hop.headers.clone());
        if let Some(body) = &hop.body {
            request = request.body(body.clone());
        }
        let response = request.send().await.map_err(|e| e.to_string())?;
        match next_hop(
            &hop,
            response.status(),
            response.headers().get(LOCATION),
            followed,
        )? {
            Some(next) => hop = next,
            None => return Ok(response),
        }
        followed += 1;
    }
}

fn header_map_to_strings(headers: &HeaderMap) -> HashMap<String, String> {
    let mut out = HashMap::with_capacity(headers.len());
    for (k, v) in headers {
        if let Ok(s) = v.to_str() {
            out.insert(k.as_str().to_ascii_lowercase(), s.to_string());
        }
    }
    out
}

async fn read_response(response: reqwest::Response) -> Result<HttpResponse, String> {
    let status = response.status().as_u16();
    let headers = header_map_to_strings(response.headers());
    let body = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

#[tauri::command]
pub async fn ai_http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private_network: Option<bool>,
) -> Result<HttpResponse, String> {
    let hop = Hop::first(&url, &method, headers, body)?;
    let response = send_guarded(&SystemDns, allow_private_network.unwrap_or(false), hop).await?;
    read_response(response).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Headers {
        status: u16,
        headers: HashMap<String, String>,
    },
    Chunk {
        bytes: Vec<u8>,
    },
    End,
    Error {
        message: String,
    },
}

#[tauri::command]
pub async fn ai_http_stream(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private_network: Option<bool>,
    on_event: Channel<AiStreamEvent>,
) -> Result<(), String> {
    let allow_private = allow_private_network.unwrap_or(false);
    let result = stream_events(&on_event, &url, &method, headers, body, allow_private).await;
    if let Err(message) = &result {
        let _ = on_event.send(AiStreamEvent::Error {
            message: message.clone(),
        });
    }
    result
}

async fn stream_events(
    on_event: &Channel<AiStreamEvent>,
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private: bool,
) -> Result<(), String> {
    let hop = Hop::first(url, method, headers, body)?;
    let response = send_guarded(&SystemDns, allow_private, hop).await?;

    let _ = on_event.send(AiStreamEvent::Headers {
        status: response.status().as_u16(),
        headers: header_map_to_strings(response.headers()),
    });

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?.to_vec();
        if on_event.send(AiStreamEvent::Chunk { bytes }).is_err() {
            // Channel dropped (frontend aborted): stop streaming.
            return Ok(());
        }
    }

    let _ = on_event.send(AiStreamEvent::End);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;
    use tauri::ipc::InvokeResponseBody;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn shape(s: &str) -> Result<Host<String>, String> {
        check_url_shape(&parse_url(s)?).map(|host| host.to_owned())
    }

    fn host_of(s: &str) -> Host<String> {
        shape(s).unwrap()
    }

    struct FakeDns(&'static [(&'static str, &'static str)]);

    impl Dns for FakeDns {
        async fn lookup(&self, name: String) -> Result<Vec<IpAddr>, String> {
            Ok(self
                .0
                .iter()
                .filter(|(record, _)| *record == name)
                .map(|(_, ip)| ip.parse().unwrap())
                .collect())
        }
    }

    const ALIASES: FakeDns = FakeDns(&[
        ("loopback-alias.test", "127.0.0.1"),
        ("metadata-alias.test", "169.254.169.254"),
    ]);

    fn hop(method: &str, target: &str, headers: &[(&str, &str)], body: Option<&str>) -> Hop {
        let headers = headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        Hop::first(
            target,
            method,
            Some(headers),
            body.map(|b| b.as_bytes().to_vec()),
        )
        .unwrap()
    }

    fn follow(current: &Hop, status: u16, location: &str) -> Hop {
        let status = StatusCode::from_u16(status).unwrap();
        let location = HeaderValue::from_str(location).unwrap();
        next_hop(current, status, Some(&location), 0)
            .unwrap()
            .unwrap()
    }

    fn fetch(
        rt: &tokio::runtime::Runtime,
        allow_private: bool,
        start: Hop,
    ) -> Result<HttpResponse, String> {
        rt.block_on(async {
            read_response(send_guarded(&ALIASES, allow_private, start).await?).await
        })
    }

    fn read_request(stream: &mut TcpStream) -> String {
        let mut raw = Vec::new();
        let mut buf = [0u8; 512];
        let head_end = loop {
            if let Some(i) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                break i + 4;
            }
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                return String::from_utf8_lossy(&raw).into_owned();
            }
            raw.extend_from_slice(&buf[..n]);
        };
        let head = String::from_utf8_lossy(&raw[..head_end]).to_ascii_lowercase();
        let body_len = head
            .lines()
            .find_map(|line| line.strip_prefix("content-length:"))
            .map_or(0, |len| len.trim().parse::<usize>().unwrap());
        while raw.len() < head_end + body_len {
            let n = stream.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            raw.extend_from_slice(&buf[..n]);
        }
        String::from_utf8_lossy(&raw).into_owned()
    }

    fn serve(
        responses: impl FnOnce(u16) -> Vec<String> + Send + 'static,
    ) -> (u16, JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            responses(port)
                .into_iter()
                .map(|response| {
                    let (mut stream, _) = listener.accept().unwrap();
                    let request = read_request(&mut stream);
                    stream.write_all(response.as_bytes()).unwrap();
                    request
                })
                .collect()
        });
        (port, server)
    }

    fn redirect_to(name: &str, port: u16) -> String {
        format!(
            "HTTP/1.1 302 Found\r\nLocation: http://{name}:{port}/landed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    }

    const LANDED: &str = "HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nlanded";

    fn recording_channel() -> (Channel<AiStreamEvent>, Arc<Mutex<Vec<serde_json::Value>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&events);
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                sink.lock()
                    .unwrap()
                    .push(serde_json::from_str(&json).unwrap());
            }
            Ok(())
        });
        (channel, events)
    }

    #[test]
    fn metadata_ips_classified_as_blocked() {
        // AWS / Google / Azure all share the IPv4 169.254.169.254 link-local.
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))),
            IpKind::BlockedMetadata
        );
        // AWS IPv6 metadata
        assert_eq!(
            ip_kind("fd00:ec2::254".parse().unwrap()),
            IpKind::BlockedMetadata
        );
        // Any link-local IPv4 (169.254/16) — same network range, still blocked.
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1))),
            IpKind::BlockedMetadata
        );
        // IPv6 link-local fe80::/10
        assert_eq!(ip_kind("fe80::1".parse().unwrap()), IpKind::BlockedMetadata);
    }

    #[test]
    fn private_ips_classified_correctly() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))),
            IpKind::Private
        );
        // CGNAT 100.64/10
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1))),
            IpKind::Private
        );
        assert_eq!(ip_kind("fc00::1".parse().unwrap()), IpKind::Private);
    }

    #[test]
    fn loopback_classified_as_loopback() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))),
            IpKind::Loopback
        );
        assert_eq!(ip_kind("::1".parse().unwrap()), IpKind::Loopback);
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0))),
            IpKind::Loopback
        );
    }

    #[test]
    fn public_ips_classified_as_public() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))),
            IpKind::Public
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))),
            IpKind::Public
        );
    }

    #[test]
    fn embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard() {
        let rt = runtime();
        for (literal, kind) in [
            ("[::ffff:127.0.0.1]", IpKind::Loopback),
            ("[::ffff:169.254.169.254]", IpKind::BlockedMetadata),
            ("[::ffff:10.0.0.1]", IpKind::Private),
            ("[64:ff9b::7f00:1]", IpKind::Loopback),
            ("[2002:7f00:1::]", IpKind::Loopback),
            ("[::127.0.0.1]", IpKind::Loopback),
        ] {
            let host = host_of(&format!("http://{literal}/"));
            let (found, _) = rt
                .block_on(resolve_and_classify(&host, &SystemDns))
                .unwrap();
            assert_eq!(found, kind, "{literal}");
            let refused = rt.block_on(resolve_and_admit(&host, false, &SystemDns));
            assert!(refused.is_err(), "{literal} must need explicit opt-in");
            let opted_in = rt.block_on(resolve_and_admit(&host, true, &SystemDns));
            assert_eq!(
                opted_in.is_err(),
                kind == IpKind::BlockedMetadata,
                "{literal}: metadata stays blocked even with opt-in"
            );
        }
        let (kind, _) = rt
            .block_on(resolve_and_classify(
                &host_of("http://[::ffff:8.8.8.8]/"),
                &SystemDns,
            ))
            .unwrap();
        assert_eq!(kind, IpKind::Public);
    }

    #[test]
    fn dns_records_take_the_most_dangerous_class_in_any_order() {
        for (records, kind) in [
            (&["10.0.0.1", "127.0.0.1"][..], IpKind::Loopback),
            (&["127.0.0.1", "10.0.0.1"][..], IpKind::Loopback),
            (&["8.8.8.8", "fd00:ec2::254"][..], IpKind::BlockedMetadata),
        ] {
            let ips: Vec<IpAddr> = records.iter().map(|r| r.parse().unwrap()).collect();
            assert_eq!(worst_kind(&ips), Some(kind), "{records:?}");
        }
        assert_eq!(worst_kind(&[]), None);
    }

    #[test]
    fn every_hop_passes_the_same_address_check_as_the_first() {
        let rt = runtime();
        let admit = |target: &str, allow_private: bool| {
            rt.block_on(admit_url(
                &url(target),
                allow_private,
                Timeouts::Ai,
                &ALIASES,
            ))
        };
        let refused = admit("http://loopback-alias.test/", false).unwrap_err();
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        let admitted = admit("http://loopback-alias.test/", true).unwrap();
        assert_eq!(
            (admitted.kind, admitted.ips),
            (IpKind::Loopback, vec![IpAddr::from(Ipv4Addr::LOCALHOST)])
        );
        assert_eq!(
            admit("http://metadata-alias.test/", true).unwrap_err(),
            "host not allowed: metadata-alias.test"
        );
        assert_eq!(
            admit("ftp://loopback-alias.test/", true).unwrap_err(),
            "scheme not allowed: ftp"
        );
        for target in [
            "http://[::ffff:169.254.169.254]/",
            "http://[fd00:ec2::254]/",
        ] {
            let refused = admit(target, true).unwrap_err();
            assert!(refused.starts_with("host not allowed: "), "{target}");
        }
        let refused = admit("http://[::1]/", false).unwrap_err();
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        assert_eq!(admit("http://[::1]/", true).unwrap().kind, IpKind::Loopback);
    }

    #[test]
    fn a_redirect_to_another_name_on_loopback_is_followed_with_private_access() {
        let (port, server) =
            serve(|port| vec![redirect_to("loopback-alias.test", port), LANDED.to_string()]);
        let rt = runtime();
        let start = hop(
            "GET",
            &format!("http://127.0.0.1:{port}/"),
            &[("Authorization", "Bearer k")],
            None,
        );
        let resp = fetch(&rt, true, start).unwrap();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, b"landed");
        let requests = server.join().unwrap();
        assert!(
            requests[0].contains("authorization: Bearer k"),
            "{}",
            requests[0]
        );
        assert!(requests[1].starts_with("GET /landed "), "{}", requests[1]);
        assert!(
            requests[1].contains(&format!("host: loopback-alias.test:{port}")),
            "{}",
            requests[1]
        );
        assert!(!requests[1].contains("authorization"), "{}", requests[1]);
    }

    #[test]
    fn a_redirect_to_a_name_on_a_metadata_address_is_refused_even_with_private_access() {
        let (port, server) = serve(|port| vec![redirect_to("metadata-alias.test", port)]);
        let rt = runtime();
        let start = hop("GET", &format!("http://127.0.0.1:{port}/"), &[], None);
        assert_eq!(
            fetch(&rt, true, start).unwrap_err(),
            "host not allowed: metadata-alias.test"
        );
        assert_eq!(server.join().unwrap().len(), 1);
    }

    #[test]
    fn a_307_sends_the_method_and_body_again() {
        let (port, server) = serve(|_| {
            vec![
                "HTTP/1.1 307 Temporary Redirect\r\nLocation: /again\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
                LANDED.to_string(),
            ]
        });
        let rt = runtime();
        let body = r#"{"q":1}"#;
        let start = hop(
            "POST",
            &format!("http://127.0.0.1:{port}/"),
            &[("Content-Type", "application/json")],
            Some(body),
        );
        assert_eq!(fetch(&rt, true, start).unwrap().status, 200);
        let requests = server.join().unwrap();
        assert!(requests[1].starts_with("POST /again "), "{}", requests[1]);
        assert!(
            requests[1].contains("content-type: application/json"),
            "{}",
            requests[1]
        );
        assert!(requests[1].ends_with(body), "{}", requests[1]);
    }

    #[test]
    fn the_stream_follows_a_redirect_and_forwards_the_final_response() {
        let (port, server) = serve(|port| vec![redirect_to("127.0.0.1", port), LANDED.to_string()]);
        let rt = runtime();
        let (channel, events) = recording_channel();
        rt.block_on(ai_http_stream(
            format!("http://127.0.0.1:{port}/"),
            "GET".into(),
            None,
            None,
            Some(true),
            channel,
        ))
        .unwrap();
        let events = events.lock().unwrap();
        assert_eq!(events[0]["kind"], "headers");
        assert_eq!(events[0]["status"], 200);
        let body: Vec<u8> = events
            .iter()
            .filter(|event| event["kind"] == "chunk")
            .flat_map(|event| event["bytes"].as_array().unwrap().clone())
            .map(|byte| u8::try_from(byte.as_u64().unwrap()).unwrap())
            .collect();
        assert_eq!(body, b"landed");
        assert_eq!(events.last(), Some(&json!({ "kind": "end" })));
        server.join().unwrap();
    }

    #[test]
    fn a_refused_stream_reports_its_error_exactly_once() {
        let (port, server) = serve(|port| vec![redirect_to("169.254.169.254", port)]);
        let rt = runtime();
        let (channel, events) = recording_channel();
        let refused = rt
            .block_on(ai_http_stream(
                format!("http://127.0.0.1:{port}/"),
                "GET".into(),
                None,
                None,
                Some(true),
                channel,
            ))
            .unwrap_err();
        assert_eq!(refused, "host not allowed: 169.254.169.254");
        assert_eq!(
            *events.lock().unwrap(),
            vec![json!({ "kind": "error", "message": refused })]
        );
        server.join().unwrap();
    }

    #[test]
    fn lm_ping_reports_the_3xx_of_a_redirecting_server_as_reachable() {
        let (port, server) = serve(|port| vec![redirect_to("127.0.0.1", port)]);
        let rt = runtime();
        let status = rt.block_on(lm_ping(format!("http://127.0.0.1:{port}/")));
        assert_eq!(status.unwrap(), 302);
        let requests = server.join().unwrap();
        assert!(requests[0].starts_with("GET /models "), "{}", requests[0]);
    }

    #[test]
    fn redirects_rewrite_the_method_and_body_like_reqwest() {
        let json = [("Content-Type", "application/json")];
        let post = hop("POST", "http://127.0.0.1:1234/v1", &json, Some("{}"));
        for status in [301, 302, 303] {
            let next = follow(&post, status, "/v2");
            assert_eq!(next.method, Method::GET, "{status}");
            assert_eq!(next.body, None, "{status}");
            assert!(next.headers.get("content-type").is_none(), "{status}");
        }
        let put = hop("PUT", "http://127.0.0.1:1234/v1", &json, Some("{}"));
        for (start, status) in [
            (&post, 307),
            (&post, 308),
            (&put, 301),
            (&put, 302),
            (&put, 307),
        ] {
            let next = follow(start, status, "/v2");
            assert_eq!(next.method, start.method, "{status}");
            assert_eq!(next.body.as_deref(), Some(&b"{}"[..]), "{status}");
            assert_eq!(next.headers["content-type"], "application/json", "{status}");
        }
        assert_eq!(follow(&put, 303, "/v2").method, Method::GET);
        let head = hop("HEAD", "http://127.0.0.1:1234/v1", &[], None);
        assert_eq!(follow(&head, 303, "/v2").method, Method::HEAD);
    }

    #[test]
    fn credentials_are_dropped_once_the_origin_changes() {
        let headers = [
            ("Authorization", "Bearer k"),
            ("Cookie", "s=1"),
            ("X-Trace", "t"),
        ];
        let start = hop("GET", "https://api.example.com/v1", &headers, None);
        assert_eq!(
            follow(&start, 302, "/v2").headers["authorization"],
            "Bearer k"
        );
        for target in [
            "https://cdn.example.com/v1",
            "https://api.example.com:8443/v1",
            "http://api.example.com/v1",
        ] {
            let next = follow(&start, 302, target);
            assert!(next.headers.get("authorization").is_none(), "{target}");
            assert!(next.headers.get("cookie").is_none(), "{target}");
            assert_eq!(next.headers["x-trace"], "t", "{target}");
        }
        let same_port = hop("GET", "http://h.test:8080/", &headers, None);
        let upgraded = follow(&same_port, 307, "https://h.test:8080/");
        assert!(upgraded.headers.get("authorization").is_none());
        let away = follow(&start, 302, "https://cdn.example.com/a");
        let onward = follow(&away, 302, "/b");
        assert!(onward.headers.get("authorization").is_none());
    }

    #[test]
    fn the_eleventh_redirect_is_an_error_like_in_reqwest() {
        let start = hop("GET", "http://127.0.0.1:1234/", &[], None);
        let location = HeaderValue::from_static("/again");
        let next = next_hop(
            &start,
            StatusCode::FOUND,
            Some(&location),
            MAX_REDIRECTS - 1,
        );
        assert!(next.unwrap().is_some());
        let next = next_hop(&start, StatusCode::FOUND, Some(&location), MAX_REDIRECTS);
        assert_eq!(next.unwrap_err(), "too many redirects");
    }

    #[test]
    fn only_redirects_with_a_usable_location_are_followed() {
        let start = hop("GET", "http://127.0.0.1:1234/", &[], None);
        let location = HeaderValue::from_static("/again");
        for status in [200, 300, 304, 305] {
            let status = StatusCode::from_u16(status).unwrap();
            let next = next_hop(&start, status, Some(&location), 0);
            assert!(next.unwrap().is_none(), "{status}");
        }
        let broken = HeaderValue::from_static("http://[::1");
        assert!(next_hop(&start, StatusCode::FOUND, Some(&broken), 0)
            .unwrap()
            .is_none());
        assert!(next_hop(&start, StatusCode::FOUND, None, MAX_REDIRECTS)
            .unwrap()
            .is_none());
    }

    #[test]
    fn relative_locations_resolve_against_the_current_url() {
        let start = hop("GET", "http://127.0.0.1:1234/v1/chat?x=1", &[], None);
        for (location, expected) in [
            ("/v2/models", "http://127.0.0.1:1234/v2/models"),
            ("models", "http://127.0.0.1:1234/v1/models"),
            ("?page=2", "http://127.0.0.1:1234/v1/chat?page=2"),
            ("//loopback-alias.test/x", "http://loopback-alias.test/x"),
            (
                "https://loopback-alias.test/y",
                "https://loopback-alias.test/y",
            ),
        ] {
            assert_eq!(
                follow(&start, 302, location).url.as_str(),
                expected,
                "{location}"
            );
        }
    }

    #[test]
    fn the_client_cache_reuses_a_key_and_keeps_its_bound() {
        fn get(cache: &mut Lru<u32, u32>, builds: &mut u32, key: u32) -> u32 {
            cache
                .get_or_try_insert(key, |k| {
                    *builds += 1;
                    Ok::<_, String>(*builds * 100 + k)
                })
                .unwrap()
        }
        let mut cache = Lru::new(CLIENT_CACHE_SIZE);
        let mut builds = 0;
        let first = get(&mut cache, &mut builds, 0);
        assert_eq!(get(&mut cache, &mut builds, 0), first);
        assert_eq!(builds, 1);
        for key in 1..CLIENT_CACHE_SIZE as u32 {
            get(&mut cache, &mut builds, key);
        }
        assert_eq!(get(&mut cache, &mut builds, 0), first);
        get(&mut cache, &mut builds, CLIENT_CACHE_SIZE as u32);
        assert_eq!(cache.entries.len(), CLIENT_CACHE_SIZE);
        assert_eq!(builds, CLIENT_CACHE_SIZE as u32 + 1);
        assert_eq!(get(&mut cache, &mut builds, 0), first);
        get(&mut cache, &mut builds, 1);
        assert_eq!(
            builds,
            CLIENT_CACHE_SIZE as u32 + 2,
            "1 was the least recently used"
        );
        assert_eq!(cache.entries.len(), CLIENT_CACHE_SIZE);
    }

    #[test]
    fn only_public_targets_may_use_an_env_proxy() {
        assert!(uses_env_proxy(IpKind::Public));
        for kind in [IpKind::Private, IpKind::Loopback, IpKind::BlockedMetadata] {
            assert!(!uses_env_proxy(kind), "{kind:?}");
        }
    }

    #[test]
    fn ipv6_literal_urls_are_classified_instead_of_failing_dns() {
        let rt = runtime();
        let classify = |url: &str, allow_private: bool| {
            rt.block_on(resolve_and_admit(&host_of(url), allow_private, &SystemDns))
        };
        let refused = classify("http://[::ffff:127.0.0.1]:11434/", false).unwrap_err();
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        assert_eq!(
            classify("http://[::1]:11434/", true).unwrap(),
            (IpKind::Loopback, vec!["::1".parse::<IpAddr>().unwrap()])
        );
        let blocked = classify("http://[::ffff:169.254.169.254]/", true).unwrap_err();
        assert!(blocked.starts_with("host not allowed: "), "{blocked}");
    }

    #[test]
    fn the_url_shape_check_blocks_userinfo_and_metadata_hostnames() {
        // URLs with userinfo can confuse browsers / leak creds in redirects.
        assert!(shape("http://user:pass@example.com/").is_err());
        // Cloud metadata-by-name.
        assert!(shape("http://metadata.google.internal/").is_err());
        assert!(shape("http://metadata/").is_err());
        assert!(shape("http://metadata.azure.com/").is_err());
    }

    #[test]
    fn metadata_hostnames_stay_blocked_with_a_trailing_dot_or_capitals() {
        for target in [
            "http://metadata.google.internal./computeMetadata/v1/",
            "http://METADATA.Google.Internal./",
            "http://metadata./",
            "http://metadata.azure.com../",
        ] {
            let refused = shape(target).unwrap_err();
            assert!(
                refused.starts_with("host not allowed: "),
                "{target}: {refused}"
            );
        }
    }

    #[test]
    fn the_url_shape_check_rejects_non_http_schemes() {
        assert!(shape("ftp://example.com/").is_err());
        assert!(shape("file:///etc/passwd").is_err());
        assert!(shape("javascript:alert(1)").is_err());
    }

    #[test]
    fn sanitize_headers_blocks_crlf_injection() {
        let mut h = HashMap::new();
        h.insert("X-Foo".to_string(), "bar\r\nX-Evil: yes".to_string());
        assert!(sanitize_headers(Some(h)).is_err());
    }

    #[test]
    fn sanitize_headers_blocks_hop_by_hop_headers() {
        for hop in [
            "host",
            "content-length",
            "connection",
            "proxy-authorization",
        ] {
            let mut h = HashMap::new();
            h.insert(hop.to_string(), "value".to_string());
            assert!(
                sanitize_headers(Some(h)).is_err(),
                "expected {hop} to be rejected"
            );
        }
    }
}
