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

/// Prefix that marks a tmux session as one this build manages (and may kill).
/// Both builds share one tmux server, so a variant gets a prefix that never
/// starts with the installed app's, nor the installed app's with the variant's.
/// Mirrored by `managedTmuxPrefix` in `src/modules/terminal/lib/managedTmux.ts`.
pub fn managed_tmux_prefix(suffix: Option<&str>) -> String {
    let Some(suffix) = suffix else {
        return "terax-rs-".to_string();
    };
    let clean: String = suffix
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect::<String>()
        .to_ascii_lowercase();
    // "terax-rs-rs-" would fall inside the installed app's namespace.
    let tag = if clean.is_empty() || clean == "rs" {
        "variant"
    } else {
        clean.as_str()
    };
    format!("terax-{tag}-rs-")
}

/// Handed to the webview before any page script runs, so the frontend never
/// has to guess which sessions are its own.
pub fn managed_tmux_init_script(prefix: &str) -> String {
    let literal = serde_json::to_string(prefix).unwrap_or_else(|_| "null".to_string());
    format!(
        "Object.defineProperty(globalThis,\"__TERAX_MANAGED_TMUX_PREFIX__\",{{value:{literal},writable:false,configurable:false}});"
    )
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

    #[derive(serde::Deserialize)]
    struct PrefixCase {
        suffix: Option<String>,
        prefix: String,
    }

    #[test]
    fn the_managed_tmux_prefix_matches_the_frontend_cases() {
        let cases: Vec<PrefixCase> = serde_json::from_str(include_str!(
            "../../../src/modules/terminal/lib/managedTmuxPrefix.cases.json"
        ))
        .unwrap();
        assert!(cases.iter().any(|c| c.suffix.is_none()));
        for case in &cases {
            assert_eq!(
                managed_tmux_prefix(case.suffix.as_deref()),
                case.prefix,
                "{:?}",
                case.suffix
            );
        }
    }

    #[test]
    fn the_installed_app_keeps_its_managed_tmux_prefix() {
        assert_eq!(managed_tmux_prefix(None), "terax-rs-");
        let variant = side_by_side_suffix("app.crynta.terax.dev");
        assert_eq!(managed_tmux_prefix(variant.as_deref()), "terax-dev-rs-");
    }

    #[test]
    fn variant_and_production_prefixes_never_contain_each_other() {
        let production = managed_tmux_prefix(None);
        let suffixes = [
            "dev",
            "rs",
            "RS",
            "rs-x",
            "rs-",
            "-rs",
            "r",
            "s",
            "x-rs",
            "-",
            "",
            "variant",
            "a-very-long-vari",
            "teraxbeta",
        ];
        for suffix in suffixes {
            let prefix = managed_tmux_prefix(Some(suffix));
            assert!(!prefix.starts_with(&production), "{suffix:?} -> {prefix}");
            assert!(!production.starts_with(&prefix), "{suffix:?} -> {prefix}");
            assert!(crate::modules::tmux::is_valid_session_name(&format!(
                "{prefix}abc"
            )));
        }
    }

    #[test]
    fn the_init_script_carries_the_prefix_as_a_json_string() {
        assert_eq!(
            managed_tmux_init_script("terax-rs-"),
            r#"Object.defineProperty(globalThis,"__TERAX_MANAGED_TMUX_PREFIX__",{value:"terax-rs-",writable:false,configurable:false});"#
        );
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
