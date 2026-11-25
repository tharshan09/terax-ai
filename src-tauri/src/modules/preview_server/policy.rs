//! What the preview server sends for a file: its media type and the response
//! headers per kind and grant class. A fixed list instead of a MIME guess, so
//! an unknown extension is never served as something that runs.

use super::grant::GrantClass;

/// Extensions a file needs to be opened in the browser (wave 1). The frontend
/// guard test reads this list from the source, so keep it one literal.
pub const ENTRY_EXTENSIONS: &[&str] = &[
    "html", "htm", "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf",
];

/// The running wave. Wave 2 adds Markdown entries, rendered by the server.
pub(crate) const WAVE: u8 = 1;

/// Markdown entries from wave 2 on; in wave 1 a `.md` file is only a raw
/// neighbour of an HTML page.
const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];

/// `frame-ancestors` on HTML of the `frame` class. Off means no CSP there.
/// UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
pub(crate) const FRAME_ANCESTORS: bool = true;

/// Inert kinds may neither run script nor load anything but images of their
/// own origin.
pub(crate) const INERT_CSP: &str =
    "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

/// HTML in the browser may run and load from its own grant, but no other site
/// may embed it.
const HTML_BROWSER_CSP: &str = "frame-ancestors 'self'";

/// The app origins that embed the in-app preview; the dev server only in a
/// debug build.
const APP_ORIGINS: &[&str] = &[
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
];
const DEV_ORIGIN: &str = "http://localhost:1420";

/// What a file is to the browser.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Art {
    Html,
    Script,
    /// Images, styles, data, fonts, raw text and anything unknown.
    Inert,
    /// Only after the check of the PDF magic bytes.
    Pdf,
    /// A Markdown entry rendered to HTML (wave 2).
    RenderedMarkdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Served {
    pub art: Art,
    pub mime: &'static str,
}

/// The kind of file a grant is made for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EntryKind {
    Html,
    Image,
    Pdf,
    Markdown,
}

/// Lower-cased extension of the last path segment, if it has one.
pub(crate) fn extension(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    base.rsplit_once('.')
        .filter(|(stem, ext)| !stem.is_empty() && !ext.is_empty())
        .map(|(_, ext)| ext.to_ascii_lowercase())
}

/// Kind of an entry file in `wave`, or `None` when it cannot be opened. An
/// extension added to `ENTRY_EXTENSIONS` without a kind here stays closed.
pub(crate) fn entry_kind(name: &str, wave: u8) -> Option<EntryKind> {
    let ext = extension(name)?;
    let ext = ext.as_str();
    if !ENTRY_EXTENSIONS.contains(&ext) {
        return (wave >= 2 && MARKDOWN_EXTENSIONS.contains(&ext)).then_some(EntryKind::Markdown);
    }
    match ext {
        "html" | "htm" => Some(EntryKind::Html),
        "pdf" => Some(EntryKind::Pdf),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "svg" => Some(EntryKind::Image),
        _ => None,
    }
}

/// Media type of a served file. `entry` is the grant's kind when the file is
/// the entry itself: then the kind decides the art (an image entry is inert,
/// a PDF entry needs the magic, a Markdown entry is rendered), the extension
/// only the image type.
pub(crate) fn served_type(name: &str, entry: Option<EntryKind>) -> Served {
    let by_name = served_by_name(name);
    match entry {
        None => by_name,
        Some(EntryKind::Html) => Served {
            art: Art::Html,
            mime: "text/html",
        },
        Some(EntryKind::Image) => Served {
            art: Art::Inert,
            mime: if by_name.mime.starts_with("image/") {
                by_name.mime
            } else {
                "application/octet-stream"
            },
        },
        Some(EntryKind::Pdf) => Served {
            art: Art::Pdf,
            mime: "application/pdf",
        },
        Some(EntryKind::Markdown) => Served {
            art: Art::RenderedMarkdown,
            mime: "text/html",
        },
    }
}

fn served_by_name(name: &str) -> Served {
    let inert = |mime| Served {
        art: Art::Inert,
        mime,
    };
    let Some(ext) = extension(name) else {
        return inert("application/octet-stream");
    };
    match ext.as_str() {
        "html" | "htm" => Served {
            art: Art::Html,
            mime: "text/html",
        },
        "js" | "mjs" => Served {
            art: Art::Script,
            mime: "text/javascript",
        },
        "pdf" => Served {
            art: Art::Pdf,
            mime: "application/pdf",
        },
        "css" => inert("text/css"),
        "json" | "map" => inert("application/json"),
        "txt" | "md" | "markdown" => inert("text/plain"),
        "csv" => inert("text/csv"),
        "svg" => inert("image/svg+xml"),
        "png" => inert("image/png"),
        "jpg" | "jpeg" => inert("image/jpeg"),
        "gif" => inert("image/gif"),
        "webp" => inert("image/webp"),
        "avif" => inert("image/avif"),
        "bmp" => inert("image/bmp"),
        "ico" => inert("image/x-icon"),
        "woff" => inert("font/woff"),
        "woff2" => inert("font/woff2"),
        "ttf" => inert("font/ttf"),
        "otf" => inert("font/otf"),
        "wasm" => inert("application/wasm"),
        _ => inert("application/octet-stream"),
    }
}

/// Plain-text error pages are inert like any other text.
pub(crate) const TEXT_PAGE: Served = Served {
    art: Art::Inert,
    mime: "text/plain; charset=utf-8",
};

fn frame_csp() -> String {
    let mut origins = APP_ORIGINS.to_vec();
    if cfg!(debug_assertions) {
        origins.push(DEV_ORIGIN);
    }
    format!("frame-ancestors {}", origins.join(" "))
}

/// The headers every answer carries, empty ones included.
pub(crate) fn common_headers() -> Vec<(&'static str, String)> {
    vec![
        ("X-Content-Type-Options", "nosniff".to_string()),
        ("Cache-Control", "no-store".to_string()),
        ("Referrer-Policy", "no-referrer".to_string()),
        ("Connection", "close".to_string()),
    ]
}

/// Headers of a `200` (or a text page) for `served` in `class`.
/// `frame_ancestors` is the switch `FRAME_ANCESTORS`, a parameter so both
/// variants of the M-C measurement are tested.
pub(crate) fn response_headers(
    served: Served,
    class: GrantClass,
    frame_ancestors: bool,
) -> Vec<(&'static str, String)> {
    let csp = match (served.art, class) {
        (Art::Html, GrantClass::Browser) => Some(HTML_BROWSER_CSP.to_string()),
        (Art::Html, GrantClass::Frame) => frame_ancestors.then(frame_csp),
        (Art::Script, GrantClass::Browser | GrantClass::Frame) => None,
        (Art::Inert | Art::Pdf | Art::RenderedMarkdown, GrantClass::Browser | GrantClass::Frame) => {
            Some(INERT_CSP.to_string())
        }
    };
    let mut headers = vec![("Content-Type", served.mime.to_string())];
    if let Some(csp) = csp {
        headers.push(("Content-Security-Policy", csp));
    }
    headers.extend(common_headers());
    headers
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header<'a>(headers: &'a [(&'static str, String)], name: &str) -> Option<&'a str> {
        let mut found = headers.iter().filter(|(n, _)| n.eq_ignore_ascii_case(name));
        let first = found.next().map(|(_, v)| v.as_str());
        assert!(found.next().is_none(), "{name} appears twice");
        first
    }

    #[test]
    fn ac9_served_type_follows_the_fixed_list() {
        let cases = [
            ("a.html", "text/html"),
            ("b.HTM", "text/html"),
            ("c.js", "text/javascript"),
            ("d.mjs", "text/javascript"),
            ("e.css", "text/css"),
            ("f.json", "application/json"),
            ("g.svg", "image/svg+xml"),
            ("h.PNG", "image/png"),
            ("i.woff2", "font/woff2"),
            ("j.wasm", "application/wasm"),
            ("k.md", "text/plain"),
            ("l.pdf", "application/pdf"),
            ("m.xyz", "application/octet-stream"),
            ("n", "application/octet-stream"),
        ];
        for (name, mime) in cases {
            assert_eq!(served_type(name, None).mime, mime, "{name}");
        }
        assert_eq!(served_type("k.md", None).art, Art::Inert);
        assert_eq!(served_type("g.svg", None).art, Art::Inert);
        assert_eq!(served_type("l.pdf", None).art, Art::Pdf);
        assert_eq!(served_type("a.html", None).art, Art::Html);
        assert_eq!(served_type("c.js", None).art, Art::Script);
    }

    #[test]
    fn ac9_only_entry_extensions_are_entries_in_wave_one() {
        for name in ["a.html", "b.HTM", "c.png", "d.jpg", "e.jpeg", "f.gif", "g.webp", "h.ico", "i.svg", "j.pdf"] {
            assert!(entry_kind(name, WAVE).is_some(), "{name}");
        }
        for name in ["k.md", "x.txt", "n", ".html", "a.js"] {
            assert_eq!(entry_kind(name, WAVE), None, "{name}");
        }
        assert_eq!(entry_kind("a.html", WAVE), Some(EntryKind::Html));
        assert_eq!(entry_kind("a.pdf", WAVE), Some(EntryKind::Pdf));
        assert_eq!(entry_kind("a.svg", WAVE), Some(EntryKind::Image));
        let kinds = [
            ("html", EntryKind::Html),
            ("htm", EntryKind::Html),
            ("png", EntryKind::Image),
            ("jpg", EntryKind::Image),
            ("jpeg", EntryKind::Image),
            ("gif", EntryKind::Image),
            ("webp", EntryKind::Image),
            ("ico", EntryKind::Image),
            ("svg", EntryKind::Image),
            ("pdf", EntryKind::Pdf),
        ];
        assert_eq!(kinds.len(), ENTRY_EXTENSIONS.len());
        for (ext, kind) in kinds {
            assert!(ENTRY_EXTENSIONS.contains(&ext), "{ext}");
            assert_eq!(entry_kind(&format!("x.{ext}"), WAVE), Some(kind), "{ext}");
            assert_eq!(entry_kind(&format!("x.{}", ext.to_uppercase()), WAVE), Some(kind), "{ext}");
        }
    }

    #[test]
    fn ac9_the_entry_is_served_by_its_kind() {
        assert_eq!(served_type("x.html", Some(EntryKind::Image)), Served { art: Art::Inert, mime: "application/octet-stream" });
        assert_eq!(served_type("x.svg", Some(EntryKind::Image)), Served { art: Art::Inert, mime: "image/svg+xml" });
        assert_eq!(served_type("x.html", Some(EntryKind::Pdf)), Served { art: Art::Pdf, mime: "application/pdf" });
        assert_eq!(served_type("x.htm", Some(EntryKind::Html)), Served { art: Art::Html, mime: "text/html" });
    }

    // Prepared for wave 2, unreachable in wave 1 (`md` is no entry there).
    #[test]
    fn ac9_markdown_entries_and_rendering_wait_for_wave_two() {
        assert_eq!(WAVE, 1);
        assert_eq!(entry_kind("n.md", 2), Some(EntryKind::Markdown));
        let rendered = served_type("n.md", Some(EntryKind::Markdown));
        assert_eq!(rendered, Served { art: Art::RenderedMarkdown, mime: "text/html" });
        let headers = response_headers(rendered, GrantClass::Browser, FRAME_ANCESTORS);
        assert_eq!(header(&headers, "Content-Security-Policy"), Some(INERT_CSP));
    }

    /// Sicherheitsmodell 15
    /// Sicherheitsmodell 17
    #[test]
    fn ac10_headers_per_kind_in_the_browser_class() {
        let html = response_headers(served_type("a.html", None), GrantClass::Browser, FRAME_ANCESTORS);
        assert_eq!(header(&html, "Content-Security-Policy"), Some("frame-ancestors 'self'"));
        assert!(!header(&html, "Content-Security-Policy").unwrap().contains("sandbox"));
        assert_eq!(header(&html, "Content-Type"), Some("text/html"));

        let script = response_headers(served_type("c.js", None), GrantClass::Browser, FRAME_ANCESTORS);
        assert_eq!(header(&script, "Content-Security-Policy"), None);

        let inert_csp = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
        for name in ["e.css", "g.svg", "h.png", "k.md", "m.xyz", "l.pdf"] {
            let headers = response_headers(served_type(name, None), GrantClass::Browser, FRAME_ANCESTORS);
            assert_eq!(header(&headers, "Content-Security-Policy"), Some(inert_csp), "{name}");
        }
    }

    #[test]
    fn ac10_headers_in_the_frame_class() {
        let mut origins = "frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost".to_string();
        if cfg!(debug_assertions) {
            origins.push_str(" http://localhost:1420");
        }
        let html = response_headers(served_type("a.html", None), GrantClass::Frame, true);
        assert_eq!(header(&html, "Content-Security-Policy"), Some(origins.as_str()));
        assert!(!header(&html, "Content-Security-Policy").unwrap().contains("sandbox"));

        let switched_off = response_headers(served_type("a.html", None), GrantClass::Frame, false);
        assert_eq!(header(&switched_off, "Content-Security-Policy"), None);

        let png_frame = response_headers(served_type("h.png", None), GrantClass::Frame, FRAME_ANCESTORS);
        let png_browser = response_headers(served_type("h.png", None), GrantClass::Browser, FRAME_ANCESTORS);
        assert_eq!(png_frame, png_browser);
    }

    /// Sicherheitsmodell 4
    /// Sicherheitsmodell 11
    #[test]
    fn ac10_every_kind_carries_the_common_headers_and_no_cors_or_cookies() {
        let names = ["a.html", "c.js", "e.css", "g.svg", "h.png", "k.md", "m.xyz", "l.pdf"];
        for class in [GrantClass::Browser, GrantClass::Frame] {
            for frame_ancestors in [true, false] {
                let mut all = names.map(|n| served_type(n, None)).to_vec();
                all.push(TEXT_PAGE);
                all.push(served_type("n.md", Some(EntryKind::Markdown)));
                for served in all {
                    let headers = response_headers(served, class, frame_ancestors);
                    let what = format!("{served:?} {class:?} {frame_ancestors}");
                    assert_eq!(header(&headers, "X-Content-Type-Options"), Some("nosniff"), "{what}");
                    assert_eq!(header(&headers, "Cache-Control"), Some("no-store"), "{what}");
                    assert_eq!(header(&headers, "Referrer-Policy"), Some("no-referrer"), "{what}");
                    assert_eq!(header(&headers, "Connection"), Some("close"), "{what}");
                    assert_eq!(header(&headers, "Content-Type"), Some(served.mime), "{what}");
                    for (name, _) in &headers {
                        let lower = name.to_ascii_lowercase();
                        assert!(!lower.starts_with("access-control-"), "{what}: {name}");
                        assert_ne!(lower, "set-cookie", "{what}");
                    }
                }
            }
        }
    }

    #[test]
    fn ac10_error_pages_are_inert_text() {
        let headers = response_headers(TEXT_PAGE, GrantClass::Browser, FRAME_ANCESTORS);
        assert_eq!(header(&headers, "Content-Type"), Some("text/plain; charset=utf-8"));
        assert_eq!(header(&headers, "Content-Security-Policy"), Some(INERT_CSP));
    }
}
