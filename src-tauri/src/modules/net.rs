use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{ClientBuilder, Method, Url};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use url::Host;

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

async fn lookup(name: String) -> Result<Vec<IpAddr>, String> {
    tokio::task::spawn_blocking(move || {
        (name.as_str(), 0u16)
            .to_socket_addrs()
            .map(|it| it.map(|a| a.ip()).collect())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("dns: {e}"))
}

/// Resolve `host` once and return both its safety classification and the
/// concrete IPs we resolved. Callers can pin reqwest to these IPs to defeat
/// DNS rebinding (where a second lookup returns a different address).
async fn resolve_and_classify(host: &Host<String>) -> Result<(IpKind, Vec<IpAddr>), String> {
    let ips = match host_ip(host) {
        Some(ip) => vec![ip],
        None => lookup(host.to_string()).await?,
    };
    let worst = worst_kind(&ips).ok_or("dns: no addresses")?;
    Ok((worst, ips))
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

fn validate_url(url: &str) -> Result<(Url, Host<String>), String> {
    let parsed = Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    let host = check_url_shape(&parsed)?.to_owned();
    Ok((parsed, host))
}

fn admit(host: &Host<impl AsRef<str>>, kind: IpKind, allow_private: bool) -> Result<(), String> {
    match kind {
        IpKind::BlockedMetadata => Err(format!("host not allowed: {host}")),
        IpKind::Loopback | IpKind::Private if !allow_private => Err(format!(
            "host {host} resolves to a private/loopback address; this endpoint requires explicit opt-in",
        )),
        _ => Ok(()),
    }
}

/// Classify the host AND return its class plus the safe IPs to pin reqwest's
/// resolver to. Defeats DNS rebinding (second-lookup-returns-different-IP) by
/// reusing exactly the addresses that passed `ip_kind`.
async fn classify_and_collect_safe_ips(
    host: &Host<String>,
    allow_private: bool,
) -> Result<(IpKind, Vec<IpAddr>), String> {
    let (worst, ips) = resolve_and_classify(host).await?;
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
    let probe = format!("{trimmed}/models");
    let (parsed, host) = validate_url(&probe)?;
    let (kind, safe_ips) = classify_and_collect_safe_ips(&host, true).await?;

    // Same client as the AI calls, so a redirect the AI calls refuse fails here too.
    let client = build_safe_client(true, &host, kind, &safe_ips)?;
    client
        .get(parsed)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map(|r| r.status().as_u16())
        .map_err(send_error)
}
// AI HTTP proxy — bypasses webview CORS / Mixed-Content / PNA so local-network
// model servers (LM Studio, Ollama, vLLM) work in the production bundle.

#[derive(Debug, Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

fn build_request(
    client: &reqwest::Client,
    method: &str,
    url: Url,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
) -> Result<reqwest::RequestBuilder, String> {
    let method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(method, url);
    let map = sanitize_headers(headers)?;
    req = req.headers(map);
    if let Some(b) = body {
        req = req.body(b);
    }
    Ok(req)
}

fn build_safe_client(
    allow_private: bool,
    host: &Host<String>,
    kind: IpKind,
    safe_ips: &[IpAddr],
) -> Result<reqwest::Client, String> {
    let via_proxy = uses_env_proxy(kind);
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(
            move |attempt| match redirect_decision(
                attempt.url(),
                attempt.previous().last(),
                attempt.previous().len(),
                allow_private,
                via_proxy,
            ) {
                RedirectDecision::Follow => attempt.follow(),
                RedirectDecision::Stop => {
                    let blocked = RedirectBlocked::new(attempt.url());
                    attempt.error(blocked)
                }
                RedirectDecision::TooMany => attempt.error("too many redirects"),
            },
        ));
    if !via_proxy {
        builder = builder.no_proxy();
    }
    pin_to(builder, host, safe_ips)
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug)]
struct RedirectBlocked(String);

impl RedirectBlocked {
    fn new(next: &Url) -> Self {
        Self(next.host_str().unwrap_or(next.as_str()).to_string())
    }
}

impl std::fmt::Display for RedirectBlocked {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "redirect to another host blocked: {}", self.0)
    }
}

impl std::error::Error for RedirectBlocked {}

// reqwest only says "error following redirect"; name the blocked host instead.
fn send_error(e: reqwest::Error) -> String {
    std::error::Error::source(&e)
        .and_then(|source| source.downcast_ref::<RedirectBlocked>())
        .map_or_else(|| e.to_string(), ToString::to_string)
}

#[derive(Debug, PartialEq, Eq)]
enum RedirectDecision {
    Follow,
    Stop,
    TooMany,
}

fn redirect_decision(
    next: &Url,
    last_previous: Option<&Url>,
    previous_len: usize,
    allow_private: bool,
    via_proxy: bool,
) -> RedirectDecision {
    if previous_len > 10 {
        return RedirectDecision::TooMany;
    }
    let Ok(host) = check_url_shape(next) else {
        return RedirectDecision::Stop;
    };
    let allowed = match host_ip(&host) {
        // A proxied client would send a hop to a local address through the proxy.
        Some(ip) => {
            let kind = ip_kind(ip);
            admit(&host, kind, allow_private).is_ok() && (!via_proxy || uses_env_proxy(kind))
        }
        // Fork deviation: reqwest resolves a new name itself, unclassified and
        // unpinned, so a hop to another name is stopped even with private access.
        None => last_previous.is_some_and(|prev| prev.host() == Some(host)),
    };
    if allowed {
        RedirectDecision::Follow
    } else {
        RedirectDecision::Stop
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

#[tauri::command]
pub async fn ai_http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
    allow_private_network: Option<bool>,
) -> Result<HttpResponse, String> {
    let allow_private = allow_private_network.unwrap_or(false);
    let (parsed, host) = validate_url(&url)?;
    let (kind, safe_ips) = classify_and_collect_safe_ips(&host, allow_private).await?;

    let client = build_safe_client(allow_private, &host, kind, &safe_ips)?;

    let req = build_request(&client, &method, parsed, headers, body)?;
    let resp = req.send().await.map_err(send_error)?;

    let status = resp.status().as_u16();
    let headers = header_map_to_strings(resp.headers());
    let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
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
    let (parsed, host) = match validate_url(&url) {
        Ok(v) => v,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let (kind, safe_ips) = match classify_and_collect_safe_ips(&host, allow_private).await {
        Ok(v) => v,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };

    let client = match build_safe_client(allow_private, &host, kind, &safe_ips) {
        Ok(c) => c,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };

    let req = match build_request(&client, &method, parsed, headers, body) {
        Ok(r) => r,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let message = send_error(e);
            let _ = on_event.send(AiStreamEvent::Error {
                message: message.clone(),
            });
            return Err(message);
        }
    };

    let status = resp.status().as_u16();
    let headers = header_map_to_strings(resp.headers());
    let _ = on_event.send(AiStreamEvent::Headers { status, headers });

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                let bytes: Bytes = chunk;
                if on_event
                    .send(AiStreamEvent::Chunk {
                        bytes: bytes.to_vec(),
                    })
                    .is_err()
                {
                    // Channel dropped (frontend aborted) — stop streaming.
                    return Ok(());
                }
            }
            Err(e) => {
                let _ = on_event.send(AiStreamEvent::Error {
                    message: e.to_string(),
                });
                return Err(e.to_string());
            }
        }
    }

    let _ = on_event.send(AiStreamEvent::End);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{Ipv4Addr, TcpListener};
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

    fn host_of(s: &str) -> Host<String> {
        validate_url(s).unwrap().1
    }

    fn serve(
        responses: impl FnOnce(u16) -> Vec<String> + Send + 'static,
    ) -> (u16, JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let mut heads = Vec::new();
            for response in responses(port) {
                let (mut stream, _) = listener.accept().unwrap();
                let mut head = Vec::new();
                let mut buf = [0u8; 512];
                while !head.windows(4).any(|w| w == b"\r\n\r\n") {
                    let n = stream.read(&mut buf).unwrap();
                    if n == 0 {
                        break;
                    }
                    head.extend_from_slice(&buf[..n]);
                }
                heads.push(String::from_utf8_lossy(&head).into_owned());
                stream.write_all(response.as_bytes()).unwrap();
            }
            heads
        });
        (port, server)
    }

    fn redirect_to(name: &str, port: u16) -> String {
        format!(
            "HTTP/1.1 302 Found\r\nLocation: http://{name}:{port}/landed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    }

    const LANDED: &str = "HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nlanded";

    fn loopback_client() -> reqwest::Client {
        build_safe_client(
            true,
            &host_of("http://127.0.0.1/"),
            IpKind::Loopback,
            &[Ipv4Addr::LOCALHOST.into()],
        )
        .unwrap()
    }

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
        assert_eq!(
            ip_kind("fe80::1".parse().unwrap()),
            IpKind::BlockedMetadata
        );
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
            let (found, _) = rt.block_on(resolve_and_classify(&host)).unwrap();
            assert_eq!(found, kind, "{literal}");
            let refused = rt.block_on(classify_and_collect_safe_ips(&host, false));
            assert!(refused.is_err(), "{literal} must need explicit opt-in");
            let opted_in = rt.block_on(classify_and_collect_safe_ips(&host, true));
            assert_eq!(
                opted_in.is_err(),
                kind == IpKind::BlockedMetadata,
                "{literal}: metadata stays blocked even with opt-in"
            );
        }
        let (kind, _) = rt
            .block_on(resolve_and_classify(&host_of("http://[::ffff:8.8.8.8]/")))
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
    fn a_redirect_to_another_name_fails_with_the_blocked_host_instead_of_the_3xx() {
        let (port, server) = serve(|port| vec![redirect_to("metadata-alias.test", port); 3]);
        let rt = runtime();
        let base = format!("http://127.0.0.1:{port}");
        let expected = "redirect to another host blocked: metadata-alias.test";

        let request = rt.block_on(ai_http_request(
            format!("{base}/"),
            "GET".into(),
            None,
            None,
            Some(true),
        ));
        assert_eq!(request.unwrap_err(), expected);

        let (channel, events) = recording_channel();
        let stream = rt.block_on(ai_http_stream(
            format!("{base}/"),
            "GET".into(),
            None,
            None,
            Some(true),
            channel,
        ));
        assert_eq!(stream.unwrap_err(), expected);
        assert_eq!(
            *events.lock().unwrap(),
            [serde_json::json!({ "kind": "error", "message": expected })]
        );

        assert_eq!(rt.block_on(lm_ping(base)).unwrap_err(), expected);
        let heads = server.join().unwrap();
        assert!(heads[2].starts_with("GET /models "), "{}", heads[2]);
    }

    #[test]
    fn only_public_targets_may_use_an_env_proxy() {
        assert!(uses_env_proxy(IpKind::Public));
        for kind in [IpKind::Private, IpKind::Loopback, IpKind::BlockedMetadata] {
            assert!(!uses_env_proxy(kind), "{kind:?}");
        }
    }

    #[test]
    fn the_client_follows_a_redirect_within_the_same_host() {
        let (port, server) = serve(|port| vec![redirect_to("127.0.0.1", port), LANDED.to_string()]);
        let rt = runtime();
        let resp = rt
            .block_on(
                loopback_client()
                    .get(format!("http://127.0.0.1:{port}/"))
                    .send(),
            )
            .unwrap();
        assert_eq!(resp.status(), 200);
        assert_eq!(rt.block_on(resp.text()).unwrap(), "landed");
        let heads = server.join().unwrap();
        assert!(heads[1].starts_with("GET /landed "), "{}", heads[1]);
    }

    #[test]
    fn ipv6_literal_urls_are_classified_instead_of_failing_dns() {
        let rt = runtime();
        let classify = |url: &str, allow_private: bool| {
            rt.block_on(classify_and_collect_safe_ips(&host_of(url), allow_private))
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
    fn redirects_to_internal_addresses_hidden_in_ipv6_are_stopped() {
        let from = url("https://api.example.com/");
        for target in [
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:10.0.0.1]/",
            "http://[::ffff:192.168.0.1]/",
            "http://[::ffff:169.254.169.254]/latest/meta-data",
            "http://[::127.0.0.1]/",
            "http://[64:ff9b::7f00:1]/",
            "http://[2002:7f00:1::]/",
            "http://[fe80::1]/",
            "http://[fc00::1]/",
            "http://[fd12:3456::1]/",
            "http://[fec0::1]/",
            "http://[ff02::1]/",
            "http://[::]/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, false, false),
                RedirectDecision::Stop,
                "{target}"
            );
        }
        for target in [
            "http://[::ffff:169.254.169.254]/",
            "http://[64:ff9b::a9fe:a9fe]/",
            "http://[2002:a9fe:a9fe::]/",
            "http://[fe80::1]/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true, false),
                RedirectDecision::Stop,
                "{target} is metadata even with private access"
            );
        }
        for target in [
            "http://[::ffff:127.0.0.1]:11434/",
            "http://[::ffff:10.0.0.1]/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true, false),
                RedirectDecision::Follow,
                "{target}"
            );
        }
        assert_eq!(
            redirect_decision(
                &url("https://[::ffff:8.8.8.8]/"),
                Some(&from),
                1,
                false,
                false
            ),
            RedirectDecision::Follow
        );
    }

    #[test]
    fn redirect_decision_keeps_metadata_blocked_and_gates_loopback_on_opt_in() {
        let from = url("https://api.example.com/");
        assert_eq!(
            redirect_decision(
                &url("http://[::ffff:169.254.169.254]/"),
                Some(&from),
                1,
                true,
                false
            ),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[fd00:ec2::254]/"), Some(&from), 1, true, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[::1]/"), Some(&from), 1, false, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[::1]/"), Some(&from), 1, true, false),
            RedirectDecision::Follow
        );
    }

    #[test]
    fn redirects_to_another_name_are_stopped_even_with_private_access() {
        let from = url("https://api.example.com/v1");
        for allow_private in [false, true] {
            assert_eq!(
                redirect_decision(
                    &url("https://api.example.com/v2"),
                    Some(&from),
                    1,
                    allow_private,
                    false
                ),
                RedirectDecision::Follow,
                "allow_private={allow_private}"
            );
            assert_eq!(
                redirect_decision(
                    &url("https://cdn.example.com/"),
                    Some(&from),
                    1,
                    allow_private,
                    false
                ),
                RedirectDecision::Stop,
                "allow_private={allow_private}"
            );
        }
        assert_eq!(
            redirect_decision(
                &url("https://cdn.example.com/"),
                Some(&from),
                11,
                true,
                false
            ),
            RedirectDecision::TooMany
        );
    }

    #[test]
    fn a_proxied_client_stops_hops_to_non_public_literals_even_with_private_access() {
        let from = url("https://api.example.com/");
        for target in [
            "http://127.0.0.1:11434/",
            "http://10.0.0.1/",
            "http://[::1]/",
            "http://[::ffff:192.168.0.1]/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true, true),
                RedirectDecision::Stop,
                "{target} via proxy"
            );
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true, false),
                RedirectDecision::Follow,
                "{target} without proxy"
            );
        }
        for target in [
            "https://8.8.8.8/",
            "https://[::ffff:8.8.8.8]/",
            "https://api.example.com/v2",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true, true),
                RedirectDecision::Follow,
                "{target}"
            );
        }
    }

    #[test]
    fn validate_url_blocks_userinfo_and_metadata_hostnames() {
        // URLs with userinfo can confuse browsers / leak creds in redirects.
        assert!(validate_url("http://user:pass@example.com/").is_err());
        // Cloud metadata-by-name.
        assert!(validate_url("http://metadata.google.internal/").is_err());
        assert!(validate_url("http://metadata/").is_err());
        assert!(validate_url("http://metadata.azure.com/").is_err());
    }

    #[test]
    fn metadata_hostnames_stay_blocked_with_a_trailing_dot_or_capitals() {
        for target in [
            "http://metadata.google.internal./computeMetadata/v1/",
            "http://METADATA.Google.Internal./",
            "http://metadata./",
            "http://metadata.azure.com../",
        ] {
            let refused = validate_url(target).unwrap_err();
            assert!(
                refused.starts_with("host not allowed: "),
                "{target}: {refused}"
            );
            assert_eq!(
                redirect_decision(
                    &url(target),
                    Some(&url("https://api.example.com/")),
                    1,
                    true,
                    false
                ),
                RedirectDecision::Stop,
                "{target}"
            );
        }
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        assert!(validate_url("ftp://example.com/").is_err());
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("javascript:alert(1)").is_err());
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
