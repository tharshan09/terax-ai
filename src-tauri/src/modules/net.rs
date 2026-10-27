use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
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

fn is_blocked_host_name(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        host.as_str(),
        "metadata.google.internal" | "metadata" | "metadata.azure.com"
    )
}

/// Resolve `host` once and return both its safety classification and the
/// concrete IPs we resolved. Callers can pin reqwest to these IPs to defeat
/// DNS rebinding (where a second lookup returns a different address).
async fn resolve_and_classify(host: &Host<&str>) -> Result<(IpKind, Vec<IpAddr>), String> {
    let ips = match literal_ip(host) {
        Some(ip) => vec![ip],
        None => {
            let name = host.to_string();
            tokio::task::spawn_blocking(move || {
                (name.as_str(), 0u16)
                    .to_socket_addrs()
                    .map(|it| it.map(|a| a.ip()).collect::<Vec<_>>())
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("dns: {e}"))?
        }
    };
    let worst = ips
        .iter()
        .copied()
        .map(ip_kind)
        .reduce(IpKind::worse)
        .ok_or_else(|| "dns: no addresses".to_string())?;
    Ok((worst, ips))
}

fn literal_ip(host: &Host<&str>) -> Option<IpAddr> {
    match *host {
        Host::Ipv4(ip) => Some(IpAddr::V4(ip)),
        Host::Ipv6(ip) => Some(IpAddr::V6(ip)),
        Host::Domain(_) => None,
    }
}

/// The checks a request URL and every redirect target share before any lookup.
fn check_url_shape(url: &Url) -> Result<Host<&str>, String> {
    match url.scheme() {
        "http" | "https" => {}
        s => return Err(format!("scheme not allowed: {s}")),
    }
    if url.username() != "" || url.password().is_some() {
        return Err("userinfo in url is not allowed".into());
    }
    let host = url.host().ok_or_else(|| "missing host".to_string())?;
    if matches!(host, Host::Domain(name) if is_blocked_host_name(name)) {
        return Err(format!("host not allowed: {host}"));
    }
    Ok(host)
}

fn validate_url(url: &str, allow_private: bool) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    check_url_shape(&parsed)?;
    // The actual IP classification has to be async — caller does it.
    let _ = allow_private;
    Ok(parsed)
}

/// Classify the host AND return safe IPs to pin reqwest's resolver to.
/// Defeats DNS rebinding (second-lookup-returns-different-IP) by reusing
/// exactly the addresses that passed `ip_kind`.
async fn classify_and_collect_safe_ips(
    host: &Host<&str>,
    allow_private: bool,
) -> Result<Vec<IpAddr>, String> {
    let (worst, ips) = resolve_and_classify(host).await?;
    match worst {
        IpKind::BlockedMetadata => return Err(format!("host not allowed: {host}")),
        IpKind::Loopback | IpKind::Private if !allow_private => {
            return Err(format!(
                "host {host} resolves to a private/loopback address; this endpoint requires explicit opt-in",
            ));
        }
        _ => {}
    }
    let safe: Vec<IpAddr> = ips
        .into_iter()
        .filter(|ip| match ip_kind(*ip) {
            IpKind::BlockedMetadata => false,
            IpKind::Loopback | IpKind::Private => allow_private,
            IpKind::Public => true,
        })
        .collect();
    if safe.is_empty() {
        return Err(format!("host {host}: no safe IPs"));
    }
    Ok(safe)
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
    let parsed = validate_url(&probe, true)?;
    let host = parsed.host().ok_or_else(|| "missing host".to_string())?;
    let safe_ips = classify_and_collect_safe_ips(&host, true).await?;
    let host = host.to_string();

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none());
    let addrs: Vec<SocketAddr> = safe_ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
    builder = builder.resolve_to_addrs(&host, &addrs);
    let client = builder.build().map_err(|e| e.to_string())?;
    client
        .get(parsed)
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

#[derive(Debug, PartialEq, Eq)]
enum RedirectDecision {
    Follow,
    Stop,
    TooMany,
}

/// Without `allow_private` a redirect may not leave the pinned host, so a
/// public API cannot bounce a request onto an internal address.
fn redirect_decision(
    next: &Url,
    last_previous: Option<&Url>,
    previous_len: usize,
    allow_private: bool,
) -> RedirectDecision {
    if previous_len > 10 {
        return RedirectDecision::TooMany;
    }
    let Ok(host) = check_url_shape(next) else {
        return RedirectDecision::Stop;
    };
    if let Some(ip) = literal_ip(&host) {
        let kind = ip_kind(ip);
        if kind == IpKind::BlockedMetadata {
            return RedirectDecision::Stop;
        }
        if !allow_private && matches!(kind, IpKind::Loopback | IpKind::Private) {
            return RedirectDecision::Stop;
        }
    } else if !allow_private {
        if let Some(prev) = last_previous {
            if prev.host() != Some(host) {
                return RedirectDecision::Stop;
            }
        }
    }
    RedirectDecision::Follow
}

// Same rule as upstream 11343a1: with private access a redirect to another host
// name is followed without DNS classification, and reqwest resolves it unpinned.
fn redirect_policy(allow_private: bool) -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(move |attempt| {
        match redirect_decision(
            attempt.url(),
            attempt.previous().last(),
            attempt.previous().len(),
            allow_private,
        ) {
            RedirectDecision::Follow => attempt.follow(),
            RedirectDecision::Stop => attempt.stop(),
            RedirectDecision::TooMany => attempt.error("too many redirects"),
        }
    })
}

fn build_safe_client(
    allow_private: bool,
    pinned: &[(String, Vec<IpAddr>)],
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().connect_timeout(Duration::from_secs(10));
    // Pin reqwest's resolver to the IPs we just classified. Without this,
    // reqwest's own DNS lookup could return a different (private/metadata) IP
    // for the same hostname between classify and connect — classic DNS
    // rebinding attack. We pin port 0 because reqwest fills in the actual
    // port from the URL when wiring up the override map.
    for (host, ips) in pinned {
        let addrs: Vec<SocketAddr> = ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
        if !addrs.is_empty() {
            builder = builder.resolve_to_addrs(host, &addrs);
        }
    }
    builder
        .redirect(redirect_policy(allow_private))
        .build()
        .map_err(|e| e.to_string())
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
    let parsed = validate_url(&url, allow_private)?;
    let host = parsed.host().ok_or_else(|| "missing host".to_string())?;
    let safe_ips = classify_and_collect_safe_ips(&host, allow_private).await?;

    let client = build_safe_client(allow_private, &[(host.to_string(), safe_ips)])?;

    let req = build_request(&client, &method, parsed, headers, body)?;
    let resp = req.send().await.map_err(|e| e.to_string())?;

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
    let parsed = validate_url(url, allow_private)?;
    let host = parsed.host().ok_or_else(|| "missing host".to_string())?;
    let safe_ips = classify_and_collect_safe_ips(&host, allow_private).await?;

    let client = build_safe_client(allow_private, &[(host.to_string(), safe_ips)])?;

    let req = build_request(&client, method, parsed, headers, body)?;
    let resp = req.send().await.map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let headers = header_map_to_strings(resp.headers());
    let _ = on_event.send(AiStreamEvent::Headers { status, headers });

    let mut stream = resp.bytes_stream();
    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| e.to_string())?.to_vec();
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
    use std::net::{Ipv4Addr, Ipv6Addr};
    use std::sync::{Arc, Mutex};
    use tauri::ipc::InvokeResponseBody;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn literal_url(host: &str) -> Url {
        url(&format!("http://{host}/"))
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
    fn validate_url_blocks_userinfo_and_metadata_hostnames() {
        // URLs with userinfo can confuse browsers / leak creds in redirects.
        assert!(validate_url("http://user:pass@example.com/", true).is_err());
        // Cloud metadata-by-name.
        assert!(validate_url("http://metadata.google.internal/", true).is_err());
        assert!(validate_url("http://metadata/", true).is_err());
        assert!(validate_url("http://metadata.azure.com/", true).is_err());
    }

    #[test]
    fn metadata_hostnames_stay_blocked_with_a_trailing_dot_or_capitals() {
        for target in [
            "http://metadata.google.internal./computeMetadata/v1/",
            "http://METADATA.Google.Internal./",
            "http://metadata./",
            "http://metadata.azure.com../",
        ] {
            let refused = validate_url(target, true).unwrap_err();
            assert!(
                refused.starts_with("host not allowed: "),
                "{target}: {refused}"
            );
            assert_eq!(
                redirect_decision(&url(target), None, 1, true),
                RedirectDecision::Stop,
                "{target}"
            );
        }
    }

    #[test]
    fn validate_url_rejects_non_http_schemes() {
        assert!(validate_url("ftp://example.com/", true).is_err());
        assert!(validate_url("file:///etc/passwd", true).is_err());
        assert!(validate_url("javascript:alert(1)", true).is_err());
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

    #[test]
    fn special_ipv4_ranges_do_not_classify_as_public() {
        assert_eq!(ip_kind(IpAddr::V4(Ipv4Addr::UNSPECIFIED)), IpKind::Loopback);
        assert_eq!(ip_kind(IpAddr::V4(Ipv4Addr::BROADCAST)), IpKind::Loopback);
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(224, 0, 0, 1))),
            IpKind::Loopback
        );
    }

    #[test]
    fn private_range_boundaries_hold_on_ipv4() {
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(172, 31, 255, 255))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(172, 32, 0, 1))),
            IpKind::Public
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(100, 127, 255, 255))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(100, 128, 0, 1))),
            IpKind::Public
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(198, 18, 0, 1))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(198, 19, 255, 255))),
            IpKind::Private
        );
        assert_eq!(
            ip_kind(IpAddr::V4(Ipv4Addr::new(198, 20, 0, 1))),
            IpKind::Public
        );
    }

    #[test]
    fn ipv6_unique_local_and_multicast_are_not_public() {
        assert_eq!(ip_kind("fd12:3456::1".parse().unwrap()), IpKind::Private);
        assert_eq!(ip_kind("fc00::1".parse().unwrap()), IpKind::Private);
        assert_eq!(ip_kind("ff02::1".parse().unwrap()), IpKind::Loopback);
        assert_eq!(ip_kind("::".parse().unwrap()), IpKind::Loopback);
        assert_eq!(ip_kind("2606:4700::1111".parse().unwrap()), IpKind::Public);
    }

    #[test]
    fn blocked_host_name_match_is_case_insensitive_and_exact() {
        assert!(is_blocked_host_name("METADATA.google.internal"));
        assert!(!is_blocked_host_name("metadata.evil.internal"));
        assert!(!is_blocked_host_name("my-metadata"));
    }

    #[test]
    fn validate_url_requires_a_host() {
        // A URL that parses but carries no host must not slip through.
        assert!(validate_url("http://", true).is_err());
    }

    #[test]
    fn ipv6_literal_hosts_resolve_without_dns() {
        let rt = runtime();
        let loopback = literal_url("[::1]");
        let (kind, ips) = rt
            .block_on(resolve_and_classify(&loopback.host().unwrap()))
            .unwrap();
        assert_eq!(kind, IpKind::Loopback);
        assert_eq!(ips, vec![IpAddr::from(Ipv6Addr::LOCALHOST)]);
        let public = literal_url("[2606:4700::1111]");
        let (kind, _) = rt
            .block_on(resolve_and_classify(&public.host().unwrap()))
            .unwrap();
        assert_eq!(kind, IpKind::Public);
    }

    #[test]
    fn embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard() {
        let rt = runtime();
        for (host, kind) in [
            ("[::ffff:127.0.0.1]", IpKind::Loopback),
            ("[::ffff:169.254.169.254]", IpKind::BlockedMetadata),
            ("[::ffff:10.0.0.1]", IpKind::Private),
            ("[64:ff9b::7f00:1]", IpKind::Loopback),
            ("[2002:7f00:1::]", IpKind::Loopback),
            ("[::127.0.0.1]", IpKind::Loopback),
        ] {
            let target = literal_url(host);
            let parsed = target.host().unwrap();
            let (found, _) = rt.block_on(resolve_and_classify(&parsed)).unwrap();
            assert_eq!(found, kind, "{host}");
            let refused = rt.block_on(classify_and_collect_safe_ips(&parsed, false));
            assert!(refused.is_err(), "{host} must need explicit opt-in");
            let opted_in = rt.block_on(classify_and_collect_safe_ips(&parsed, true));
            assert_eq!(
                opted_in.is_err(),
                kind == IpKind::BlockedMetadata,
                "{host}: metadata stays blocked even with opt-in"
            );
        }
        let mapped = literal_url("[::ffff:8.8.8.8]");
        let (kind, _) = rt
            .block_on(resolve_and_classify(&mapped.host().unwrap()))
            .unwrap();
        assert_eq!(kind, IpKind::Public);
    }

    #[test]
    fn ipv6_literal_urls_are_classified_instead_of_failing_dns() {
        let rt = runtime();
        let request = |target: &str, allow_private: bool| {
            rt.block_on(ai_http_request(
                target.into(),
                "GET".into(),
                None,
                None,
                Some(allow_private),
            ))
            .unwrap_err()
        };
        let refused = request("http://[::ffff:127.0.0.1]:11434/", false);
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        let blocked = request("http://[::ffff:169.254.169.254]/", true);
        assert!(blocked.starts_with("host not allowed: "), "{blocked}");
        let parsed = validate_url("http://[::1]:11434/", true).unwrap();
        assert_eq!(
            rt.block_on(classify_and_collect_safe_ips(&parsed.host().unwrap(), true)),
            Ok(vec![IpAddr::from(Ipv6Addr::LOCALHOST)])
        );
    }

    #[test]
    fn a_failed_stream_reports_its_error_exactly_once() {
        let rt = runtime();
        for (target, method) in [
            ("http://[::ffff:169.254.169.254]/", "GET"),
            ("http://8.8.8.8/", "NOT A METHOD"),
        ] {
            let (channel, events) = recording_channel();
            let error = rt
                .block_on(ai_http_stream(
                    target.into(),
                    method.into(),
                    None,
                    None,
                    Some(true),
                    channel,
                ))
                .unwrap_err();
            assert_eq!(
                *events.lock().unwrap(),
                vec![json!({ "kind": "error", "message": error })],
                "{target}"
            );
        }
    }

    #[test]
    fn redirects_stay_on_the_pinned_host_unless_private_access_was_granted() {
        let from = url("https://api.example.com/v1");
        let same = url("https://api.example.com/v2");
        let other = url("https://evil.example.net/");
        assert_eq!(
            redirect_decision(&same, Some(&from), 1, false),
            RedirectDecision::Follow
        );
        assert_eq!(
            redirect_decision(&other, Some(&from), 1, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&other, Some(&from), 1, true),
            RedirectDecision::Follow
        );
    }

    #[test]
    fn redirects_never_reach_metadata_or_unsafe_schemes_or_userinfo() {
        let from = url("http://localhost:11434/");
        for target in [
            "http://169.254.169.254/latest",
            "http://[fe80::1]/",
            "http://metadata.google.internal/",
            "ftp://example.com/",
            "https://user:pw@example.com/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true),
                RedirectDecision::Stop,
                "{target}"
            );
        }
    }

    #[test]
    fn ipv6_literal_redirects_are_classified_not_mistaken_for_hostnames() {
        let from = url("https://api.example.com/");
        assert_eq!(
            redirect_decision(&url("http://[::1]:8080/"), Some(&from), 1, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[::1]:8080/"), Some(&from), 1, true),
            RedirectDecision::Follow
        );
        assert_eq!(
            redirect_decision(&url("https://[2606:4700::1111]/"), Some(&from), 1, false),
            RedirectDecision::Follow,
            "public IP literals are allowed; only the address class matters"
        );
    }

    #[test]
    fn bracketed_metadata_and_loopback_literals_follow_the_address_rule() {
        let from = url("http://localhost:11434/");
        for (target, allow_private, expected) in [
            (
                "http://[::ffff:169.254.169.254]/",
                true,
                RedirectDecision::Stop,
            ),
            ("http://[fd00:ec2::254]/", true, RedirectDecision::Stop),
            ("http://[::1]/", false, RedirectDecision::Stop),
            ("http://[::1]/", true, RedirectDecision::Follow),
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, allow_private),
                expected,
                "{target} with allow_private = {allow_private}"
            );
        }
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
                redirect_decision(&url(target), Some(&from), 1, false),
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
                redirect_decision(&url(target), Some(&from), 1, true),
                RedirectDecision::Stop,
                "{target} is metadata even with private access"
            );
        }
        for target in [
            "http://[::ffff:127.0.0.1]:11434/",
            "http://[::ffff:10.0.0.1]/",
        ] {
            assert_eq!(
                redirect_decision(&url(target), Some(&from), 1, true),
                RedirectDecision::Follow,
                "{target}"
            );
        }
        assert_eq!(
            redirect_decision(&url("https://[::ffff:8.8.8.8]/"), Some(&from), 1, false),
            RedirectDecision::Follow
        );
    }

    #[test]
    fn redirect_chains_are_bounded() {
        let u = url("https://api.example.com/");
        assert_eq!(
            redirect_decision(&u, Some(&u), 10, false),
            RedirectDecision::Follow
        );
        assert_eq!(
            redirect_decision(&u, Some(&u), 11, false),
            RedirectDecision::TooMany
        );
    }

    #[test]
    fn safe_clients_build_with_pinned_resolution() {
        let ips: Vec<IpAddr> = ["93.184.216.34", "2606:2800:220:1::1"]
            .iter()
            .map(|s| s.parse().unwrap())
            .collect();
        build_safe_client(false, &[("api.example.com".into(), ips)]).expect("public client");
        let loopback = vec![IpAddr::from(Ipv4Addr::LOCALHOST)];
        build_safe_client(true, &[("localhost".into(), loopback)]).expect("private client");
    }
}
