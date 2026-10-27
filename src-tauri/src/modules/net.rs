use std::collections::HashMap;
use std::io;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use futures_util::StreamExt;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{ClientBuilder, Method, Url};
use serde::{Deserialize, Serialize};
use tauri::http::Uri;
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

type Lookup = fn(&str) -> io::Result<Vec<IpAddr>>;

fn system_lookup(host: &str) -> io::Result<Vec<IpAddr>> {
    Ok((host, 0u16).to_socket_addrs()?.map(|a| a.ip()).collect())
}

fn is_blocked_host_name(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        host.as_str(),
        "metadata.google.internal" | "metadata" | "metadata.azure.com"
    )
}

async fn blocking_lookup(name: &str, lookup: Lookup) -> Result<Vec<IpAddr>, String> {
    let name = name.to_owned();
    tokio::task::spawn_blocking(move || lookup(&name))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("dns: {e}"))
}

/// Resolve `host` once and return both its safety classification and the
/// concrete IPs we resolved. Callers can pin reqwest to these IPs to defeat
/// DNS rebinding (where a second lookup returns a different address).
async fn resolve_and_classify(
    host: &Host<&str>,
    lookup: Lookup,
) -> Result<(IpKind, Vec<IpAddr>), String> {
    let ips = match *host {
        Host::Ipv4(ip) => vec![IpAddr::V4(ip)],
        Host::Ipv6(ip) => vec![IpAddr::V6(ip)],
        Host::Domain(name) => blocking_lookup(name, lookup).await?,
    };
    let worst = ips
        .iter()
        .map(|ip| ip_kind(*ip))
        .max_by_key(|kind| kind.severity())
        .ok_or("dns: no addresses")?;
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

fn validate_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    check_url_shape(&parsed)?;
    Ok(parsed)
}

fn admit(host: &Host<&str>, kind: IpKind, allow_private: bool) -> Result<(), String> {
    match kind {
        IpKind::BlockedMetadata => Err(format!("host not allowed: {host}")),
        IpKind::Loopback | IpKind::Private if !allow_private => Err(format!(
            "host {host} resolves to a private/loopback address; this endpoint requires explicit opt-in",
        )),
        _ => Ok(()),
    }
}

/// Classify the host AND return safe IPs to pin reqwest's resolver to.
/// Defeats DNS rebinding (second-lookup-returns-different-IP) by reusing
/// exactly the addresses that passed `ip_kind`.
async fn classify_and_collect_safe_ips(
    host: &Host<&str>,
    allow_private: bool,
    lookup: Lookup,
) -> Result<Vec<IpAddr>, String> {
    let (worst, ips) = resolve_and_classify(host, lookup).await?;
    admit(host, worst, allow_private)?;
    Ok(ips)
}

// Redirect hops to another name get the target's classification.
struct GuardedResolver {
    allow_private: bool,
    lookup: Lookup,
}

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let (allow_private, lookup) = (self.allow_private, self.lookup);
        Box::pin(async move {
            let host = Host::Domain(name.as_str());
            let ips = classify_and_collect_safe_ips(&host, allow_private, lookup).await?;
            let addrs: Addrs = Box::new(ips.into_iter().map(|ip| SocketAddr::new(ip, 0)));
            Ok::<_, Box<dyn std::error::Error + Send + Sync>>(addrs)
        })
    }
}

// Reuse the classified addresses, not a second lookup; reqwest fills in port 0.
fn pin_to(builder: ClientBuilder, host: &Host<&str>, ips: &[IpAddr]) -> ClientBuilder {
    let Host::Domain(name) = *host else {
        return builder;
    };
    let addrs: Vec<SocketAddr> = ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
    builder.resolve_to_addrs(name, &addrs)
}

fn process_env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

#[derive(Debug, PartialEq, Eq)]
struct ProxyUrl {
    scheme: String,
    userinfo: Option<String>,
    host: String,
    port: u16,
}

impl ProxyUrl {
    fn at(&self, ip: IpAddr) -> String {
        let userinfo = self
            .userinfo
            .as_deref()
            .map(|u| format!("{u}@"))
            .unwrap_or_default();
        format!(
            "{}://{userinfo}{}",
            self.scheme,
            SocketAddr::new(ip, self.port)
        )
    }
}

struct EnvProxy {
    url: ProxyUrl,
    no_proxy: String,
}

// Behind a proxy the proxy resolves a public target itself, so rebinding there is
// not caught; loopback and private targets therefore never take the proxy.
fn proxy_route(
    target: &Url,
    safe_ips: &[IpAddr],
    var: impl Fn(&str) -> Option<String>,
) -> Option<EnvProxy> {
    if !safe_ips.iter().all(|ip| ip_kind(*ip) == IpKind::Public) {
        return None;
    }
    env_proxy_for(target, var)
}

// reqwest 0.12 (hyper-util Matcher::from_env): the first set name of a pair wins
// even when unusable, and only then does a scheme fall back to ALL_PROXY.
fn env_proxy_for(target: &Url, var: impl Fn(&str) -> Option<String>) -> Option<EnvProxy> {
    if var("REQUEST_METHOD").is_some() {
        return None;
    }
    let first = |names: [&str; 2]| names.into_iter().find_map(&var).unwrap_or_default();
    let no_proxy = first(["NO_PROXY", "no_proxy"]);
    if no_proxy_matches(&no_proxy, target.host_str()?) {
        return None;
    }
    let scheme_names = match target.scheme() {
        "http" => ["HTTP_PROXY", "http_proxy"],
        "https" => ["HTTPS_PROXY", "https_proxy"],
        _ => return None,
    };
    let url = parse_proxy_value(&first(scheme_names))
        .or_else(|| parse_proxy_value(&first(["ALL_PROXY", "all_proxy"])))?;
    Some(EnvProxy { url, no_proxy })
}

fn parse_proxy_value(value: &str) -> Option<ProxyUrl> {
    let uri: Uri = value.parse().ok()?;
    let scheme = match uri.scheme_str() {
        None => "http",
        Some(s @ ("http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h")) => s,
        Some(_) => return None,
    };
    let authority = uri.authority()?.as_str();
    let (userinfo, host_port) = match authority.split_once('@') {
        Some((userinfo, host_port)) => (Some(userinfo.to_owned()), host_port),
        None => (None, authority),
    };
    let proxy = Uri::builder()
        .scheme(scheme)
        .authority(host_port)
        .path_and_query("/")
        .build()
        .ok()?;
    let host = proxy.host()?.trim_start_matches('[').trim_end_matches(']');
    let port = proxy
        .port_u16()
        .unwrap_or(if scheme == "https" { 443 } else { 80 });
    Some(ProxyUrl {
        scheme: scheme.to_owned(),
        userinfo,
        host: host.to_owned(),
        port,
    })
}

fn no_proxy_matches(list: &str, host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let entries = list.split(',').map(str::trim).filter(|e| !e.is_empty());
    match host.parse::<IpAddr>() {
        Ok(ip) => entries
            .filter_map(no_proxy_net)
            .any(|net| net_contains(net, ip)),
        Err(_) => entries
            .filter(|e| no_proxy_net(e).is_none())
            .any(|e| no_proxy_domain_matches(e, host)),
    }
}

fn no_proxy_net(entry: &str) -> Option<(IpAddr, u8)> {
    let (addr, prefix) = match entry.split_once('/') {
        Some((addr, prefix)) if prefix.bytes().all(|b| b.is_ascii_digit()) => {
            (addr.parse::<IpAddr>().ok()?, Some(prefix.parse().ok()?))
        }
        Some(_) => return None,
        None => (entry.parse::<IpAddr>().ok()?, None),
    };
    let max = if addr.is_ipv4() { 32 } else { 128 };
    match prefix {
        Some(prefix) if prefix > max => None,
        prefix => Some((addr, prefix.unwrap_or(max))),
    }
}

fn net_contains((net, prefix): (IpAddr, u8), ip: IpAddr) -> bool {
    let (net, ip, bits) = match (net, ip) {
        (IpAddr::V4(n), IpAddr::V4(i)) => (u32::from(n).into(), u32::from(i).into(), 32),
        (IpAddr::V6(n), IpAddr::V6(i)) => (u128::from(n), u128::from(i), 128),
        _ => return false,
    };
    let mask = u128::MAX.checked_shl(bits - u32::from(prefix)).unwrap_or(0);
    net & mask == ip & mask
}

fn no_proxy_domain_matches(entry: &str, host: &str) -> bool {
    if entry.eq_ignore_ascii_case(host)
        || entry
            .strip_prefix('.')
            .is_some_and(|e| e.eq_ignore_ascii_case(host))
    {
        return true;
    }
    let split = host.len().saturating_sub(entry.len());
    if host
        .get(split..)
        .is_some_and(|s| s.eq_ignore_ascii_case(entry))
    {
        return entry.starts_with('.') || host[..split].ends_with('.');
    }
    entry == "*"
}

async fn route(
    builder: ClientBuilder,
    target: &Url,
    safe_ips: &[IpAddr],
    lookup: Lookup,
    var: impl Fn(&str) -> Option<String>,
) -> Result<ClientBuilder, String> {
    let builder = builder.no_proxy();
    let Some(EnvProxy { url, no_proxy }) = proxy_route(target, safe_ips, var) else {
        return Ok(builder);
    };
    let ip = match url.host.parse::<IpAddr>() {
        Ok(ip) => ip,
        Err(_) => *blocking_lookup(&url.host, lookup)
            .await
            .map_err(|e| format!("proxy {}: {e}", url.host))?
            .first()
            .ok_or_else(|| format!("proxy {}: no addresses", url.host))?,
    };
    let proxy = reqwest::Proxy::all(url.at(ip))
        .map_err(|e| e.to_string())?
        .no_proxy(reqwest::NoProxy::from_string(&no_proxy));
    Ok(builder.proxy(proxy))
}

async fn probe_client(
    target: &Url,
    ips: &[IpAddr],
    lookup: Lookup,
    var: impl Fn(&str) -> Option<String>,
) -> Result<reqwest::Client, String> {
    let host = target.host().ok_or_else(|| "missing host".to_string())?;
    let builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none());
    route(pin_to(builder, &host, ips), target, ips, lookup, var)
        .await?
        .build()
        .map_err(|e| e.to_string())
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
    let parsed = validate_url(&probe)?;
    let host = parsed.host().ok_or_else(|| "missing host".to_string())?;
    let safe_ips = classify_and_collect_safe_ips(&host, true, system_lookup).await?;

    probe_client(&parsed, &safe_ips, system_lookup, process_env)
        .await?
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

async fn safe_client(
    allow_private: bool,
    target: &Url,
    safe_ips: &[IpAddr],
    lookup: Lookup,
    var: impl Fn(&str) -> Option<String>,
) -> Result<reqwest::Client, String> {
    let host = target.host().ok_or_else(|| "missing host".to_string())?;
    let builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .dns_resolver(Arc::new(GuardedResolver {
            allow_private,
            lookup,
        }))
        .redirect(reqwest::redirect::Policy::custom(
            move |attempt| match redirect_decision(
                attempt.url(),
                attempt.previous().last(),
                attempt.previous().len(),
                allow_private,
            ) {
                RedirectDecision::Follow => attempt.follow(),
                RedirectDecision::Stop => attempt.stop(),
                RedirectDecision::TooMany => attempt.error("too many redirects"),
            },
        ));
    route(
        pin_to(builder, &host, safe_ips),
        target,
        safe_ips,
        lookup,
        var,
    )
    .await?
    .build()
    .map_err(|e| e.to_string())
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
) -> RedirectDecision {
    if previous_len > 10 {
        return RedirectDecision::TooMany;
    }
    let Ok(host) = check_url_shape(next) else {
        return RedirectDecision::Stop;
    };
    let allowed = match host {
        Host::Ipv4(ip) => admit(&host, ip_kind(ip.into()), allow_private).is_ok(),
        Host::Ipv6(ip) => admit(&host, ip_kind(ip.into()), allow_private).is_ok(),
        Host::Domain(_) => {
            allow_private || last_previous.is_none_or(|prev| prev.host().is_some_and(|h| h == host))
        }
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
    let parsed = validate_url(&url)?;
    let host = parsed.host().ok_or_else(|| "missing host".to_string())?;
    let safe_ips = classify_and_collect_safe_ips(&host, allow_private, system_lookup).await?;

    let client = safe_client(
        allow_private,
        &parsed,
        &safe_ips,
        system_lookup,
        process_env,
    )
    .await?;

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
    let parsed = match validate_url(&url) {
        Ok(p) => p,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let host = match parsed.host() {
        Some(h) => h,
        None => {
            let e = "missing host".to_string();
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };
    let safe_ips = match classify_and_collect_safe_ips(&host, allow_private, system_lookup).await {
        Ok(v) => v,
        Err(e) => {
            let _ = on_event.send(AiStreamEvent::Error { message: e.clone() });
            return Err(e);
        }
    };

    let client = match safe_client(
        allow_private,
        &parsed,
        &safe_ips,
        system_lookup,
        process_env,
    )
    .await
    {
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
            let _ = on_event.send(AiStreamEvent::Error {
                message: e.to_string(),
            });
            return Err(e.to_string());
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
    use std::thread::JoinHandle;

    fn no_dns(host: &str) -> io::Result<Vec<IpAddr>> {
        Err(io::Error::other(format!("{host} must not reach DNS")))
    }

    fn fake_dns(host: &str) -> io::Result<Vec<IpAddr>> {
        let records: &[&str] = match host {
            "metadata-alias.test" => &["169.254.169.254"],
            "loopback-alias.test" | "localhost" => &["127.0.0.1"],
            "private-then-loopback.test" => &["10.0.0.1", "127.0.0.1"],
            "loopback-then-private.test" => &["127.0.0.1", "10.0.0.1"],
            "public-and-metadata.test" => &["8.8.8.8", "fd00:ec2::254"],
            "public.test" => &["8.8.8.8"],
            _ => return Err(io::ErrorKind::NotFound.into()),
        };
        Ok(records.iter().map(|r| r.parse().unwrap()).collect())
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn error_chain(err: &dyn std::error::Error) -> String {
        let mut out = err.to_string();
        let mut source = err.source();
        while let Some(e) = source {
            out.push_str(": ");
            out.push_str(&e.to_string());
            source = e.source();
        }
        out
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

    fn no_env(_: &str) -> Option<String> {
        None
    }

    fn env(vars: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let vars: Vec<(String, String)> = vars
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        move |name| vars.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone())
    }

    fn client(
        rt: &tokio::runtime::Runtime,
        allow_private: bool,
        target: &str,
        ips: &[&str],
        var: impl Fn(&str) -> Option<String>,
    ) -> Result<reqwest::Client, String> {
        let ips: Vec<IpAddr> = ips.iter().map(|ip| ip.parse().unwrap()).collect();
        rt.block_on(safe_client(
            allow_private,
            &url(target),
            &ips,
            fake_dns,
            var,
        ))
    }

    fn loopback_client(rt: &tokio::runtime::Runtime) -> reqwest::Client {
        client(rt, true, "http://127.0.0.1/", &["127.0.0.1"], no_env).unwrap()
    }

    fn proxy_of(target: &str, ips: &[&str], vars: &[(&str, &str)]) -> Option<String> {
        let ips: Vec<IpAddr> = ips.iter().map(|ip| ip.parse().unwrap()).collect();
        proxy_route(&url(target), &ips, env(vars)).map(|p| {
            let ProxyUrl {
                scheme, host, port, ..
            } = p.url;
            format!("{scheme}://{host}:{port}")
        })
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
            let parsed = url(&format!("http://{literal}/"));
            let host = parsed.host().unwrap();
            let (found, _) = rt.block_on(resolve_and_classify(&host, no_dns)).unwrap();
            assert_eq!(found, kind, "{literal}");
            let refused = rt.block_on(classify_and_collect_safe_ips(&host, false, no_dns));
            assert!(refused.is_err(), "{literal} must need explicit opt-in");
            let opted_in = rt.block_on(classify_and_collect_safe_ips(&host, true, no_dns));
            assert_eq!(
                opted_in.is_err(),
                kind == IpKind::BlockedMetadata,
                "{literal}: metadata stays blocked even with opt-in"
            );
        }
        let parsed = url("http://[::ffff:8.8.8.8]/");
        let (kind, _) = rt
            .block_on(resolve_and_classify(&parsed.host().unwrap(), no_dns))
            .unwrap();
        assert_eq!(kind, IpKind::Public);
    }

    #[test]
    fn dns_records_take_the_most_dangerous_class_in_any_order() {
        let rt = runtime();
        for (name, kind) in [
            ("private-then-loopback.test", IpKind::Loopback),
            ("loopback-then-private.test", IpKind::Loopback),
            ("public-and-metadata.test", IpKind::BlockedMetadata),
        ] {
            let (found, ips) = rt
                .block_on(resolve_and_classify(&Host::Domain(name), fake_dns))
                .unwrap();
            assert_eq!(found, kind, "{name}");
            assert_eq!(ips.len(), 2, "{name}");
        }
    }

    #[test]
    fn guarded_resolver_classifies_every_name_it_resolves() {
        let rt = runtime();
        let resolve = |name: &str, allow_private: bool| {
            let resolver = GuardedResolver {
                allow_private,
                lookup: fake_dns,
            };
            rt.block_on(resolver.resolve(name.parse().unwrap()))
                .map(|addrs| addrs.collect::<Vec<_>>())
                .map_err(|e| e.to_string())
        };
        let blocked = resolve("metadata-alias.test", true).unwrap_err();
        assert_eq!(blocked, "host not allowed: metadata-alias.test");
        let refused = resolve("loopback-alias.test", false).unwrap_err();
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        assert_eq!(
            resolve("loopback-alias.test", true).unwrap(),
            vec![SocketAddr::new(Ipv4Addr::LOCALHOST.into(), 0)]
        );
    }

    #[test]
    fn redirect_to_a_name_with_a_metadata_record_is_refused_even_with_private_access() {
        let (port, server) = serve(|port| vec![redirect_to("metadata-alias.test", port)]);
        let rt = runtime();
        let err = rt
            .block_on(
                loopback_client(&rt)
                    .get(format!("http://127.0.0.1:{port}/"))
                    .send(),
            )
            .unwrap_err();
        let chain = error_chain(&err);
        assert!(
            chain.contains("host not allowed: metadata-alias.test"),
            "{chain}"
        );
        server.join().unwrap();
    }

    #[test]
    fn redirect_hops_to_another_name_resolve_through_the_guard() {
        let (port, server) =
            serve(|port| vec![redirect_to("loopback-alias.test", port), LANDED.to_string()]);
        let rt = runtime();
        let resp = rt
            .block_on(
                loopback_client(&rt)
                    .get(format!("http://127.0.0.1:{port}/"))
                    .send(),
            )
            .unwrap();
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.url().host_str(), Some("loopback-alias.test"));
        server.join().unwrap();
    }

    #[test]
    fn proxy_selection_follows_reqwest_precedence() {
        let https = "https://public.test/";
        let ips = &["8.8.8.8"];
        assert_eq!(
            proxy_of(
                https,
                ips,
                &[
                    ("HTTPS_PROXY", "http://upper.test:1"),
                    ("https_proxy", "http://lower.test:2"),
                    ("ALL_PROXY", "http://all.test:3"),
                ]
            ),
            Some("http://upper.test:1".into())
        );
        assert_eq!(
            proxy_of(https, ips, &[("https_proxy", "lower.test:2")]),
            Some("http://lower.test:2".into())
        );
        for invalid in ["ftp://upper.test:1", "", "/no-authority"] {
            assert_eq!(
                proxy_of(
                    https,
                    ips,
                    &[
                        ("HTTPS_PROXY", invalid),
                        ("https_proxy", "http://lower.test:2"),
                        ("ALL_PROXY", "http://all.test:3"),
                    ]
                ),
                Some("http://all.test:3".into()),
                "{invalid:?}: a set but unusable name falls back to ALL_PROXY, never to its lowercase twin"
            );
            assert_eq!(
                proxy_of(
                    https,
                    ips,
                    &[
                        ("HTTPS_PROXY", invalid),
                        ("https_proxy", "http://lower.test:2")
                    ]
                ),
                None,
                "{invalid:?}"
            );
        }
        assert_eq!(
            proxy_of(
                "http://public.test/",
                ips,
                &[
                    ("HTTPS_PROXY", "http://tls.test:1"),
                    ("all_proxy", "https://all.test")
                ]
            ),
            Some("https://all.test:443".into())
        );
        assert_eq!(
            proxy_of(
                https,
                ips,
                &[
                    ("HTTPS_PROXY", "http://upper.test:1"),
                    ("REQUEST_METHOD", "GET")
                ]
            ),
            None
        );
        assert_eq!(proxy_of(https, ips, &[]), None);
    }

    #[test]
    fn proxy_urls_keep_credentials_and_get_the_resolved_address() {
        let proxy = parse_proxy_value("http://us%40er:p%3Aw@Proxy.Test").unwrap();
        assert_eq!(proxy.userinfo.as_deref(), Some("us%40er:p%3Aw"));
        assert_eq!(proxy.port, 80);
        assert_eq!(
            proxy.at("10.0.0.1".parse().unwrap()),
            "http://us%40er:p%3Aw@10.0.0.1:80"
        );
        assert_eq!(
            parse_proxy_value("socks5h://[::1]:1080")
                .unwrap()
                .at("::1".parse().unwrap()),
            "socks5h://[::1]:1080"
        );
        assert_eq!(parse_proxy_value("gopher://proxy.test:70"), None);
    }

    #[test]
    fn no_proxy_exempts_targets_like_reqwest() {
        let proxy = ("HTTPS_PROXY", "http://proxy.test:3128");
        let via = Some("http://proxy.test:3128".to_string());
        for (no_proxy, target, expected) in [
            ("corp.test", "https://api.corp.test/", None),
            ("corp.test", "https://corp.test/", None),
            (".corp.test", "https://api.CORP.test/", None),
            ("corp.test", "https://notcorp.test/", via.clone()),
            (" a.test , corp.test ", "https://x.corp.test/", None),
            ("8.8.0.0/16", "https://8.8.8.8/", None),
            ("8.8.8.8", "https://8.8.8.8/", None),
            ("8.8.4.0/24", "https://8.8.8.8/", via.clone()),
            ("2001:db8::/32", "https://[2001:db8::1]/", None),
            ("*", "https://public.test/", None),
            ("*", "https://8.8.8.8/", via.clone()),
            ("", "https://public.test/", via.clone()),
        ] {
            let ip = if target.contains("2001:db8") {
                "2001:4860::1"
            } else {
                "8.8.8.8"
            };
            assert_eq!(
                proxy_of(target, &[ip], &[proxy, ("NO_PROXY", no_proxy)]),
                expected,
                "NO_PROXY={no_proxy:?} {target}"
            );
        }
        assert_eq!(
            proxy_of(
                "https://api.corp.test/",
                &["8.8.8.8"],
                &[proxy, ("no_proxy", "corp.test")]
            ),
            None
        );
        assert_eq!(
            proxy_of(
                "https://api.corp.test/",
                &["8.8.8.8"],
                &[proxy, ("NO_PROXY", ""), ("no_proxy", "corp.test")]
            ),
            via
        );
    }

    #[test]
    fn local_targets_go_direct_even_with_a_proxy_configured() {
        let proxy = [
            ("HTTP_PROXY", "http://unresolvable.test:3128"),
            ("ALL_PROXY", "http://unresolvable.test:3128"),
        ];
        for (target, ips) in [
            ("http://127.0.0.1/", &["127.0.0.1"][..]),
            ("http://localhost/", &["127.0.0.1"][..]),
            ("http://lan.test/", &["10.0.0.1"][..]),
            ("http://mixed.test/", &["8.8.8.8", "192.168.1.1"][..]),
        ] {
            assert_eq!(proxy_of(target, ips, &proxy), None, "{target}");
        }
        let rt = runtime();
        for name in ["127.0.0.1", "localhost"] {
            let (port, server) = serve(|_| vec![LANDED.to_string()]);
            let client = client(
                &rt,
                true,
                &format!("http://{name}/"),
                &["127.0.0.1"],
                env(&proxy),
            )
            .unwrap();
            let resp = rt
                .block_on(client.get(format!("http://{name}:{port}/")).send())
                .map_err(|e| error_chain(&e))
                .unwrap();
            assert_eq!(rt.block_on(resp.text()).unwrap(), "landed", "{name}");
            let heads = server.join().unwrap();
            assert!(heads[0].starts_with("GET / "), "{name}: {}", heads[0]);
        }
    }

    #[test]
    fn public_targets_reach_the_proxy_by_its_resolved_address() {
        let (port, server) = serve(|_| vec![LANDED.to_string()]);
        let rt = runtime();
        let proxy = format!("http://loopback-alias.test:{port}");
        let client = client(
            &rt,
            false,
            "http://public.test/",
            &["8.8.8.8"],
            env(&[("HTTP_PROXY", &proxy)]),
        )
        .unwrap();
        let resp = rt
            .block_on(client.get("http://public.test/v1").send())
            .map_err(|e| error_chain(&e))
            .unwrap();
        assert_eq!(rt.block_on(resp.text()).unwrap(), "landed");
        let heads = server.join().unwrap();
        assert!(
            heads[0].starts_with("GET http://public.test/v1 "),
            "{}",
            heads[0]
        );
    }

    #[test]
    fn redirect_to_the_proxy_name_resolving_to_metadata_is_refused() {
        let (port, server) = serve(|port| vec![redirect_to("metadata-alias.test", port)]);
        let rt = runtime();
        let proxy = format!("http://metadata-alias.test:{port}");
        let client = client(
            &rt,
            true,
            "http://127.0.0.1/",
            &["127.0.0.1"],
            env(&[("HTTP_PROXY", &proxy), ("ALL_PROXY", &proxy)]),
        )
        .unwrap();
        let err = rt
            .block_on(client.get(format!("http://127.0.0.1:{port}/")).send())
            .unwrap_err();
        let chain = error_chain(&err);
        assert!(
            chain.contains("host not allowed: metadata-alias.test"),
            "{chain}"
        );
        server.join().unwrap();
    }

    #[test]
    fn ipv6_literal_urls_are_classified_instead_of_failing_dns() {
        let rt = runtime();
        let classify = |url: &str, allow_private: bool| {
            let parsed = validate_url(url).unwrap();
            let host = parsed.host().unwrap();
            rt.block_on(classify_and_collect_safe_ips(&host, allow_private, no_dns))
        };
        let refused = classify("http://[::ffff:127.0.0.1]:11434/", false).unwrap_err();
        assert!(refused.contains("requires explicit opt-in"), "{refused}");
        assert_eq!(
            classify("http://[::1]:11434/", true).unwrap(),
            vec!["::1".parse::<IpAddr>().unwrap()]
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
    fn redirect_decision_keeps_metadata_blocked_and_gates_loopback_on_opt_in() {
        let from = url("https://api.example.com/");
        assert_eq!(
            redirect_decision(
                &url("http://[::ffff:169.254.169.254]/"),
                Some(&from),
                1,
                true
            ),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[fd00:ec2::254]/"), Some(&from), 1, true),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[::1]/"), Some(&from), 1, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("http://[::1]/"), Some(&from), 1, true),
            RedirectDecision::Follow
        );
    }

    #[test]
    fn redirects_to_another_name_need_private_access() {
        let from = url("https://api.example.com/v1");
        assert_eq!(
            redirect_decision(&url("https://api.example.com/v2"), Some(&from), 1, false),
            RedirectDecision::Follow
        );
        assert_eq!(
            redirect_decision(&url("https://cdn.example.com/"), Some(&from), 1, false),
            RedirectDecision::Stop
        );
        assert_eq!(
            redirect_decision(&url("https://cdn.example.com/"), Some(&from), 1, true),
            RedirectDecision::Follow
        );
        assert_eq!(
            redirect_decision(&url("https://cdn.example.com/"), Some(&from), 11, true),
            RedirectDecision::TooMany
        );
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
                    true
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
