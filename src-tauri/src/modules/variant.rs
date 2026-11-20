//! Side-by-side builds (`pnpm tauri:build:dev-variant`) carry their own bundle
//! identifier. Everything keyed here stays apart from the installed app, whose
//! identifier keeps every path and behavior exactly as before.

pub const PRODUCTION_IDENTIFIER: &str = "app.crynta.terax";

const MAX_SUFFIX_LEN: usize = 16;

static SUFFIX: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();

/// Called once with the bundled identifier, before any window or command runs.
pub fn init(identifier: &str) {
    let _ = SUFFIX.set(side_by_side_suffix(identifier));
}

/// `None` for the installed app (and before `init`).
pub fn suffix() -> Option<&'static str> {
    SUFFIX.get().and_then(|suffix| suffix.as_deref())
}

pub fn is_side_by_side() -> bool {
    suffix().is_some()
}

/// Short on purpose: it lands in the SSH ControlPath, a socket path that
/// macOS caps at 104 bytes.
pub fn side_by_side_suffix(identifier: &str) -> Option<String> {
    if identifier == PRODUCTION_IDENTIFIER {
        return None;
    }
    let last = identifier.rsplit('.').next().unwrap_or_default();
    let clean: String = last
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(MAX_SUFFIX_LEN)
        .collect::<String>()
        .to_ascii_lowercase();
    Some(if clean.is_empty() {
        "variant".to_string()
    } else {
        clean
    })
}

pub fn scoped_name(base: &str, suffix: Option<&str>) -> String {
    match suffix {
        None => base.to_string(),
        Some(suffix) => format!("{base}-{suffix}"),
    }
}

/// The error a side-by-side build gives instead of changing shared state.
pub fn refused(what: &str) -> String {
    format!("{what} is left to the installed Terax in this side-by-side test build")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installed_app_keeps_its_names() {
        assert_eq!(side_by_side_suffix(PRODUCTION_IDENTIFIER), None);
        assert_eq!(scoped_name("ssh-control", None), "ssh-control");
        assert_eq!(scoped_name("shell-integration", None), "shell-integration");
    }

    #[test]
    fn another_identifier_gets_a_short_suffix_of_its_own() {
        assert_eq!(
            side_by_side_suffix("app.crynta.terax.dev").as_deref(),
            Some("dev")
        );
        assert_eq!(
            scoped_name("ssh-control", Some("dev")),
            "ssh-control-dev"
        );
        assert_eq!(
            side_by_side_suffix("com.example.Terax_Beta").as_deref(),
            Some("teraxbeta")
        );
        assert_eq!(
            side_by_side_suffix("app.crynta.terax.a-very-long-variant-name").as_deref(),
            Some("a-very-long-vari")
        );
        assert_eq!(side_by_side_suffix("app.").as_deref(), Some("variant"));
        assert_eq!(side_by_side_suffix("").as_deref(), Some("variant"));
    }

    #[test]
    fn the_bundled_configs_carry_the_expected_identifiers() {
        let identifier = |raw: &str| {
            let config: serde_json::Value = serde_json::from_str(raw).unwrap();
            config["identifier"].as_str().unwrap().to_string()
        };
        let installed = identifier(include_str!("../../tauri.conf.json"));
        let variant = identifier(include_str!("../../tauri.devvariant.conf.json"));
        assert_eq!(installed, PRODUCTION_IDENTIFIER);
        assert_eq!(side_by_side_suffix(&variant).as_deref(), Some("dev"));
    }

    #[test]
    fn a_path_separator_never_reaches_the_suffix() {
        for identifier in ["app.x/../y", "app.x\\y", "app.~"] {
            let suffix = side_by_side_suffix(identifier).unwrap();
            assert!(
                suffix.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
                "{suffix:?}"
            );
            assert!(!suffix.is_empty());
        }
    }
}
