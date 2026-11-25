//! Reading one request: the head through `httparse`, then the target split
//! into the secret and the relative path, decoded exactly once.

use percent_encoding::percent_decode_str;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Method {
    Get,
    Head,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Request {
    pub method: Method,
    /// Origin-form target as sent, still encoded.
    pub target: String,
}

/// Why a head is answered without content. Each answer has an empty body.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Reject {
    /// `400`: unreadable head, missing or repeated `Host`, a body, a target
    /// that is not a path.
    BadRequest,
    /// `405` with `Allow: GET, HEAD`.
    MethodNotAllowed,
    /// `421`: a `Host` other than the one spelling of this listener.
    MisdirectedRequest,
    /// `431`: more header lines than allowed (a head over the byte limit is
    /// refused by the listener before parsing).
    HeadersTooLarge,
}

impl Reject {
    pub(crate) fn status(self) -> u16 {
        match self {
            Self::BadRequest => 400,
            Self::MethodNotAllowed => 405,
            Self::MisdirectedRequest => 421,
            Self::HeadersTooLarge => 431,
        }
    }
}

/// Checks a complete head (VAL-1 to VAL-3) in this order: readable, exactly
/// one `Host` equal to `authority`, `GET` or `HEAD`, no body, a path target.
pub(crate) fn parse_request(head: &[u8], authority: &str, max_headers: usize) -> Result<Request, Reject> {
    let mut headers = vec![httparse::EMPTY_HEADER; max_headers];
    let mut req = httparse::Request::new(&mut headers);
    match req.parse(head) {
        Ok(httparse::Status::Complete(_)) => {}
        Ok(httparse::Status::Partial) => return Err(Reject::BadRequest),
        Err(httparse::Error::TooManyHeaders) => return Err(Reject::HeadersTooLarge),
        Err(_) => return Err(Reject::BadRequest),
    }
    let named = |name| named(req.headers, name);
    let mut hosts = named("host");
    let host = match (hosts.next(), hosts.next()) {
        (Some(host), None) => host.value,
        _ => return Err(Reject::BadRequest),
    };
    if host != authority.as_bytes() {
        return Err(Reject::MisdirectedRequest);
    }
    let method = match req.method {
        Some("GET") => Method::Get,
        Some("HEAD") => Method::Head,
        _ => return Err(Reject::MethodNotAllowed),
    };
    if named("transfer-encoding").next().is_some() {
        return Err(Reject::BadRequest);
    }
    if named("content-length").any(|h| h.value != b"0") {
        return Err(Reject::BadRequest);
    }
    let target = req.path.unwrap_or_default();
    if !target.starts_with('/') {
        return Err(Reject::BadRequest);
    }
    Ok(Request {
        method,
        target: target.to_string(),
    })
}

fn named<'h, 'b>(headers: &'h [httparse::Header<'b>], name: &'static str) -> impl Iterator<Item = &'h httparse::Header<'b>> {
    headers.iter().filter(move |h| h.name.eq_ignore_ascii_case(name))
}

/// The relative path of a request below the grant's folder.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Target {
    /// Decoded segments; never empty, `.`, `..`, nor holding `/`, `\` or a
    /// control character.
    pub segments: Vec<String>,
    /// The path ended in `/` (or was empty): the folder's `index.html`.
    pub folder: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TargetError {
    /// Missing or wrong secret, or `/{token}` without the slash: an empty
    /// `404` that says nothing about the file.
    NoGrant,
    /// The path itself is not acceptable: `404` "Not found".
    BadPath,
}

/// Splits `/{token}/{relpath}` (VAL-4, VAL-5). The query is cut off before
/// decoding, the secret is compared as sent, every segment is decoded once.
pub(crate) fn split_target(target: &str, token: &str) -> Result<Target, TargetError> {
    let path = target.split_once('?').map_or(target, |(path, _)| path);
    let rest = path.strip_prefix('/').ok_or(TargetError::NoGrant)?;
    let (given, rel) = rest.split_once('/').ok_or(TargetError::NoGrant)?;
    if !super::grant::token_matches(token, given) {
        return Err(TargetError::NoGrant);
    }
    if rel.is_empty() {
        return Ok(Target {
            segments: Vec::new(),
            folder: true,
        });
    }
    let raw: Vec<&str> = rel.split('/').collect();
    let folder = raw.last() == Some(&"");
    let raw = if folder { &raw[..raw.len() - 1] } else { &raw[..] };
    let segments = raw
        .iter()
        .map(|segment| decode_segment(segment))
        .collect::<Option<Vec<_>>>()
        .ok_or(TargetError::BadPath)?;
    Ok(Target { segments, folder })
}

fn decode_segment(raw: &str) -> Option<String> {
    let decoded = percent_decode_str(raw).decode_utf8().ok()?.into_owned();
    acceptable_segment(&decoded).then_some(decoded)
}

/// A decoded segment the server serves; the click holds entry names to it.
pub(crate) fn acceptable_segment(segment: &str) -> bool {
    if segment.is_empty() || segment == "." || segment == ".." {
        return false;
    }
    if segment.chars().any(|c| c == '/' || c == '\\' || c.is_control()) {
        return false;
    }
    // Windows reads `a:b` as a stream and drops trailing dots and spaces.
    !(cfg!(windows) && (segment.contains(':') || segment.ends_with(['.', ' '])))
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    const AUTH: &str = "127.0.0.1:4711";
    const T: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn head(lines: &[&str]) -> Vec<u8> {
        let mut text = lines.join("\r\n");
        text.push_str("\r\n\r\n");
        text.into_bytes()
    }

    fn get_with_host(host: &str) -> Vec<u8> {
        head(&["GET /t/a.html HTTP/1.1", &format!("Host: {host}")])
    }

    /// Sicherheitsmodell 5
    #[test]
    fn ac4_host_must_be_the_ip_with_this_port() {
        let cases: [(Vec<u8>, Result<(), Reject>); 6] = [
            (get_with_host("127.0.0.1:4711"), Ok(())),
            (get_with_host("evil.example"), Err(Reject::MisdirectedRequest)),
            (get_with_host("localhost:4711"), Err(Reject::MisdirectedRequest)),
            (get_with_host("127.0.0.1:4712"), Err(Reject::MisdirectedRequest)),
            (head(&["GET /t/a.html HTTP/1.1"]), Err(Reject::BadRequest)),
            (
                head(&["GET /t/a.html HTTP/1.1", "Host: 127.0.0.1:4711", "Host: 127.0.0.1:4711"]),
                Err(Reject::BadRequest),
            ),
        ];
        // The browser class and the frame class without fallback share the
        // authority `127.0.0.1:{port}`.
        for (raw, expected) in &cases {
            let got = parse_request(raw, AUTH, 64).map(|_| ());
            assert_eq!(&got, expected, "{}", String::from_utf8_lossy(raw));
        }
        assert_eq!(Reject::MisdirectedRequest.status(), 421);
        assert_eq!(Reject::BadRequest.status(), 400);
    }

    #[test]
    fn ac4_frame_with_fallback_accepts_only_localhost() {
        let auth = super::super::grant::HostName::Localhost.authority(4711);
        assert!(parse_request(&get_with_host("localhost:4711"), &auth, 64).is_ok());
        for host in ["127.0.0.1:4711", "evil.example", "LOCALHOST:4711", "localhost:4712"] {
            assert_eq!(
                parse_request(&get_with_host(host), &auth, 64),
                Err(Reject::MisdirectedRequest),
                "{host}"
            );
        }
    }

    /// Sicherheitsmodell 4
    #[test]
    fn ac5_only_get_and_head_without_a_body() {
        for method in ["POST", "PUT", "OPTIONS", "DELETE", "get"] {
            let raw = head(&[&format!("{method} /t/a.html HTTP/1.1"), "Host: 127.0.0.1:4711"]);
            assert_eq!(parse_request(&raw, AUTH, 64), Err(Reject::MethodNotAllowed), "{method}");
        }
        assert_eq!(Reject::MethodNotAllowed.status(), 405);
        let ok = parse_request(&head(&["HEAD /t/a.html HTTP/1.1", "Host: 127.0.0.1:4711"]), AUTH, 64);
        assert_eq!(ok.map(|r| r.method), Ok(Method::Head));
    }

    /// Sicherheitsmodell 23
    #[test]
    fn ac5_a_body_is_refused() {
        let length = head(&["GET /t/a.html HTTP/1.1", "Host: 127.0.0.1:4711", "Content-Length: 5"]);
        assert_eq!(parse_request(&length, AUTH, 64), Err(Reject::BadRequest));
        let chunked = head(&["GET /t/a.html HTTP/1.1", "Host: 127.0.0.1:4711", "Transfer-Encoding: chunked"]);
        assert_eq!(parse_request(&chunked, AUTH, 64), Err(Reject::BadRequest));
        let empty = head(&["GET /t/a.html HTTP/1.1", "Host: 127.0.0.1:4711", "Content-Length: 0"]);
        assert!(parse_request(&empty, AUTH, 64).is_ok());
    }

    #[test]
    fn ac5_too_many_header_lines_garbage_and_absolute_form() {
        let mut lines = vec!["GET /t/a.html HTTP/1.1".to_string(), "Host: 127.0.0.1:4711".to_string()];
        lines.extend((0..63).map(|i| format!("X-Fill-{i}: v")));
        let refs: Vec<&str> = lines.iter().map(String::as_str).collect();
        assert!(parse_request(&head(&refs), AUTH, 64).is_ok(), "64 lines are fine");
        lines.push("X-One-Too-Many: v".to_string());
        let refs: Vec<&str> = lines.iter().map(String::as_str).collect();
        assert_eq!(parse_request(&head(&refs), AUTH, 64), Err(Reject::HeadersTooLarge));
        assert_eq!(Reject::HeadersTooLarge.status(), 431);

        assert_eq!(parse_request(b"GARBAGE\r\n\r\n", AUTH, 64), Err(Reject::BadRequest));
        let absolute = head(&[&format!("GET http://127.0.0.1:4711/{T}/a.html HTTP/1.1"), "Host: 127.0.0.1:4711"]);
        assert_eq!(parse_request(&absolute, AUTH, 64), Err(Reject::BadRequest));
    }

    fn split(rel: &str) -> Result<Target, TargetError> {
        split_target(&format!("/{T}{rel}"), T)
    }

    fn file(segments: &[&str]) -> Result<Target, TargetError> {
        Ok(Target {
            segments: segments.iter().map(|s| s.to_string()).collect(),
            folder: false,
        })
    }

    fn folder(segments: &[&str]) -> Result<Target, TargetError> {
        Ok(Target {
            segments: segments.iter().map(|s| s.to_string()).collect(),
            folder: true,
        })
    }

    #[test]
    fn ac6_split_target_decodes_once_after_cutting_the_query() {
        assert_eq!(split("/a.html"), file(&["a.html"]));
        assert_eq!(split("/"), folder(&[]));
        assert_eq!(split("/sub/"), folder(&["sub"]));
        assert_eq!(split("/a.html?v=1"), file(&["a.html"]));
        assert_eq!(split("/a%3Fb.html"), file(&["a?b.html"]));
        assert_eq!(split("/Bericht%20M%C3%A4rz.html"), file(&["Bericht März.html"]));
        assert_eq!(split("/%252e%252e/x"), file(&["%2e%2e", "x"]));
    }

    /// Sicherheitsmodell 6
    #[test]
    fn ac7_split_target_refuses_bad_paths_with_not_found() {
        for rel in ["/sub%2Fy.png", "/../x", "/%2e%2e/x", "/./a", "/a//b", "/a%5Cb", "/a%00b"] {
            assert_eq!(split(rel), Err(TargetError::BadPath), "{rel}");
        }
        for rel in ["/%2E%2E/x", "/a\\b", "/%2e", "/a%0Ab", "/%FF.png"] {
            assert_eq!(split(rel), Err(TargetError::BadPath), "{rel}");
        }
    }

    /// Sicherheitsmodell 1
    /// Sicherheitsmodell 13
    #[test]
    fn ac7_split_target_refuses_a_wrong_or_missing_token_without_a_body() {
        let other = T.replace('0', "1");
        assert_eq!(split_target(&format!("/{other}/a.html"), T), Err(TargetError::NoGrant));
        assert_eq!(split_target("/a.html", T), Err(TargetError::NoGrant));
        assert_eq!(split_target(&format!("/{T}"), T), Err(TargetError::NoGrant));
        assert_eq!(split_target(&format!("/{T}?x=/"), T), Err(TargetError::NoGrant));
        assert_eq!(split_target("/", T), Err(TargetError::NoGrant));
        assert_eq!(split_target(&format!("//{T}/a.html"), T), Err(TargetError::NoGrant));
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(1000))]

        // Only the characters of the plan, drawn as the pieces that matter
        // (dots, encoded dots, slashes, backslashes) and as single
        // characters, so `..`, `%2e%2e`, `%2F`, `%252e` and broken `%`
        // sequences all come up.
        /// Sicherheitsmodell 6
        #[test]
        fn ac8_an_accepted_target_stays_below_root(rel in "(\\.|\\.\\.|%2[eEfF]|%25|2[eEfF]|%5[cC]|5[cC]|[/.%25eEfFcC\\\\a]){0,16}") {
            if let Ok(target) = split_target(&format!("/{T}/{rel}"), T) {
                for segment in &target.segments {
                    prop_assert!(segment != "." && segment != ".." && !segment.is_empty(), "{:?}", target);
                    prop_assert!(!segment.contains('/') && !segment.contains('\\'), "{:?}", target);
                    prop_assert!(!segment.chars().any(char::is_control), "{:?}", target);
                }
                let root = std::path::Path::new("/srv/root");
                let mut joined = root.to_path_buf();
                for segment in &target.segments {
                    joined.push(segment);
                }
                let mut depth = 0i32;
                for part in joined.strip_prefix(root).unwrap().components() {
                    match part {
                        std::path::Component::Normal(_) => depth += 1,
                        other => prop_assert!(false, "{:?} in {:?}", other, target),
                    }
                }
                prop_assert_eq!(depth as usize, target.segments.len());
                prop_assert!(joined.starts_with(root));
            }
        }

        // Beyond the plan's characters: pieces that decode to control
        // characters or to bytes that are no UTF-8, which must never be
        // accepted.
        #[test]
        fn ac8_control_characters_and_broken_utf8_are_never_accepted(rel in "(%00|%0[aA]|%1[fF]|%7[fF]|%[fF][fF]|%[cC]3|%[aA]4|%C2%8[05]|a|/|\\.){0,12}") {
            if let Ok(target) = split_target(&format!("/{T}/{rel}"), T) {
                for segment in &target.segments {
                    prop_assert!(!segment.chars().any(char::is_control), "{:?}", target);
                    prop_assert!(segment != "." && segment != ".." && !segment.is_empty(), "{:?}", target);
                }
            }
        }
    }
}
