//! A grant: one link to one file (and, for HTML, its folder) with its own
//! secret and its own listener. Pure rules only; the state lives in `mod.rs`.

use std::sync::Arc;

use tokio::sync::Semaphore;

use super::policy::EntryKind;
use super::source::{parent, within};

/// Who loads the link: the default browser, or the in-app preview `iframe`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum GrantClass {
    Browser,
    Frame,
}

/// Where the files of a grant are read. The SSH host comes only from here.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Location {
    Local,
    Ssh { host: String },
}

/// The name a link uses for the loopback, and the only `Host` it accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HostName {
    Ip,
    /// UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
    Localhost,
}

impl HostName {
    pub(crate) fn authority(self, port: u16) -> String {
        match self {
            Self::Ip => format!("127.0.0.1:{port}"),
            Self::Localhost => format!("localhost:{port}"),
        }
    }
}

pub(crate) struct Grant {
    pub token: String,
    pub class: GrantClass,
    pub location: Location,
    /// Resolved path of the entry file, `/`-separated.
    pub entry: String,
    /// Resolved folder the grant reaches into; `None` = only the entry file.
    pub root: Option<String>,
    pub kind: EntryKind,
    pub host_name: HostName,
    pub port: u16,
    /// Open connections of this grant (SEC-12), shared by all its listeners.
    pub connections: Arc<Semaphore>,
    /// The addresses its listeners are bound to.
    #[cfg(test)]
    pub addrs: Vec<std::net::SocketAddr>,
}

impl Grant {
    /// File name of the entry, as the link names it.
    pub(crate) fn entry_name(&self) -> &str {
        basename(&self.entry)
    }
}

pub(crate) fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// 256 bits from the operating system, as 64 lower-case hex digits.
pub(crate) fn new_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| format!("no randomness from the OS: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Compares every byte of both texts, also after a difference, so the time
/// taken does not tell how much of a guess was right.
pub(crate) fn token_matches(expected: &str, given: &str) -> bool {
    let (a, b) = (expected.as_bytes(), given.as_bytes());
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        diff |= usize::from(x ^ y);
    }
    diff == 0
}

/// The folder an entry may reach: HTML (and Markdown from wave 2) reach the
/// folder of the resolved entry with its subfolders; images and PDFs only the
/// file. A folder that is the file system root, the home or above the home
/// gives only the file, and so does every entry when the home is unknown
/// (`None`): the home rule cannot be checked then. `entry` and `home` are
/// resolved the same way.
pub(crate) fn grant_scope(entry: &str, home: Option<&str>, kind: EntryKind) -> Option<String> {
    match kind {
        EntryKind::Html | EntryKind::Markdown => {}
        EntryKind::Image | EntryKind::Pdf => return None,
    }
    let folder = parent(entry)?;
    if is_fs_root(folder) {
        return None;
    }
    let home = home?;
    if within(home, folder) {
        return None;
    }
    Some(folder.to_string())
}

/// `/`, empty, or a bare Windows drive such as `C:`.
fn is_fs_root(folder: &str) -> bool {
    !folder.trim_end_matches('/').contains('/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac1_tokens_are_64_hex_digits_and_differ() {
        let a = new_token().unwrap();
        let b = new_token().unwrap();
        for t in [&a, &b] {
            assert_eq!(t.len(), 64, "{t}");
            assert!(t.bytes().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f')), "{t}");
        }
        assert_ne!(a, b);
    }

    /// Sicherheitsmodell 1
    #[test]
    fn ac1_token_matches_only_the_exact_token() {
        let t = new_token().unwrap();
        assert!(token_matches(&t, &t));
        for i in 0..64 {
            let mut changed = t.clone().into_bytes();
            changed[i] = if changed[i] == b'0' { b'1' } else { b'0' };
            let changed = String::from_utf8(changed).unwrap();
            assert!(!token_matches(&t, &changed), "position {i}");
            assert!(!token_matches(&changed, &t), "position {i}, swapped");
        }
        assert!(!token_matches(&t, &t[..63]));
        assert!(!token_matches(&t, &format!("{t}0")));
        assert!(!token_matches(&t, ""));
    }

    // Deliberately stricter than `asset_dir_target` in `fs/asset.rs`, which
    // only refuses the root and the home itself: a folder above the home
    // (here `/home`) also gives only the file (SEC-2).
    /// Sicherheitsmodell 10
    #[test]
    fn ac2_grant_scope_table() {
        let home = Some("/home/u");
        let cases = [
            ("/home/u/p/a.html", EntryKind::Html, Some("/home/u/p")),
            ("/home/u/a.html", EntryKind::Html, None),
            ("/a.html", EntryKind::Html, None),
            ("/home/a.html", EntryKind::Html, None),
            ("/home/u/p/b.png", EntryKind::Image, None),
            ("/home/u/p/c.pdf", EntryKind::Pdf, None),
            ("/home/u/p/n.md", EntryKind::Markdown, Some("/home/u/p")),
        ];
        for (entry, kind, scope) in cases {
            assert_eq!(grant_scope(entry, home, kind).as_deref(), scope, "{entry}");
        }
    }

    #[test]
    fn ac2_grant_scope_compares_whole_segments() {
        // `/home/u2` is beside the home `/home/u`, not above it.
        assert_eq!(
            grant_scope("/home/u2/p.html", Some("/home/u"), EntryKind::Html).as_deref(),
            Some("/home/u2")
        );
        assert_eq!(grant_scope("C:/a.html", Some("C:/Users/u"), EntryKind::Html), None);
        assert_eq!(grant_scope("/srv/p/a.html", Some("/home/u"), EntryKind::Html).as_deref(), Some("/srv/p"));
    }

    #[test]
    fn ac2_without_a_known_home_only_the_file() {
        for kind in [EntryKind::Html, EntryKind::Markdown, EntryKind::Image, EntryKind::Pdf] {
            assert_eq!(grant_scope("/srv/p/a.html", None, kind), None, "{kind:?}");
        }
    }
}
