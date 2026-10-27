//! Shared AI-proxy clients. The pinned IPs are part of the key, so a host that re-resolves
//! gets a new client and no request reaches an address that was not classified for it.

use std::net::{IpAddr, SocketAddr};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use super::redirect_policy;

pub const IDLE_TTL: Duration = Duration::from_secs(90);
/// Distinct hosts kept warm; a handful of providers plus local servers.
pub const MAX_CLIENTS: usize = 8;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Profile {
    /// Provider calls: long-lived streaming responses, bounded redirects.
    Stream,
    /// Local-model reachability probe: short timeout, no redirects.
    Ping,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ClientKey {
    profile: Profile,
    host: String,
    ips: Vec<IpAddr>,
    allow_private: bool,
}

impl ClientKey {
    pub fn new(profile: Profile, host: &str, ips: &[IpAddr], allow_private: bool) -> Self {
        let mut ips = ips.to_vec();
        ips.sort_unstable();
        ips.dedup();
        Self {
            profile,
            host: host.to_ascii_lowercase(),
            ips,
            allow_private,
        }
    }
}

struct Entry<C> {
    key: ClientKey,
    client: C,
    last_used: Instant,
}

/// Generic over the client so the eviction rules are testable without sockets.
pub struct ClientCache<C> {
    entries: Vec<Entry<C>>,
}

impl<C: Clone> Default for ClientCache<C> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
        }
    }
}

impl<C: Clone> ClientCache<C> {
    pub fn get(&mut self, key: &ClientKey, now: Instant) -> Option<C> {
        self.entries
            .retain(|entry| now.saturating_duration_since(entry.last_used) < IDLE_TTL);
        let entry = self.entries.iter_mut().find(|entry| &entry.key == key)?;
        entry.last_used = now;
        Some(entry.client.clone())
    }

    /// Stores `client` unless a concurrent caller cached one for `key` first; returns the kept one.
    pub fn insert(&mut self, key: ClientKey, client: C, now: Instant) -> C {
        if let Some(existing) = self.get(&key, now) {
            return existing;
        }
        while self.entries.len() >= MAX_CLIENTS {
            let oldest = self
                .entries
                .iter()
                .enumerate()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(i, _)| i)
                .unwrap_or(0);
            self.entries.swap_remove(oldest);
        }
        self.entries.push(Entry {
            key,
            client: client.clone(),
            last_used: now,
        });
        client
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

static CLIENTS: OnceLock<Mutex<ClientCache<reqwest::Client>>> = OnceLock::new();

fn build_client(key: &ClientKey) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().connect_timeout(Duration::from_secs(10));
    // Pinned so reqwest's own lookup cannot swap in a private or metadata address
    // between classify and connect; port 0 is replaced by the URL's port.
    if !key.ips.is_empty() {
        let addrs: Vec<SocketAddr> = key.ips.iter().map(|ip| SocketAddr::new(*ip, 0)).collect();
        builder = builder.resolve_to_addrs(&key.host, &addrs);
    }
    builder = match key.profile {
        Profile::Stream => builder
            .redirect(redirect_policy(key.allow_private))
            .pool_idle_timeout(IDLE_TTL)
            .pool_max_idle_per_host(2),
        Profile::Ping => builder
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none()),
    };
    builder.build().map_err(|e| e.to_string())
}

/// A client pinned to `ips` for `host`, reused while that exact set is current.
pub fn client_for(
    profile: Profile,
    host: &str,
    ips: &[IpAddr],
    allow_private: bool,
) -> Result<reqwest::Client, String> {
    let key = ClientKey::new(profile, host, ips, allow_private);
    let cache = CLIENTS.get_or_init(|| Mutex::new(ClientCache::default()));
    let lock = || cache.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(client) = lock().get(&key, Instant::now()) {
        return Ok(client);
    }
    // Built unlocked so assembling the TLS config does not stall other hosts' requests.
    let client = build_client(&key)?;
    Ok(lock().insert(key, client, Instant::now()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn key(host: &str, ips: &[&str], allow_private: bool) -> ClientKey {
        let ips: Vec<IpAddr> = ips.iter().map(|s| ip(s)).collect();
        ClientKey::new(Profile::Stream, host, &ips, allow_private)
    }

    #[test]
    fn identical_destinations_share_a_client() {
        let mut cache = ClientCache::<u32>::default();
        let now = Instant::now();
        let k = key("api.example.com", &["1.1.1.1"], false);
        assert_eq!(cache.get(&k, now), None);
        assert_eq!(cache.insert(k.clone(), 7, now), 7);
        for _ in 0..3 {
            assert_eq!(cache.get(&k, now), Some(7));
        }
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn a_client_cached_while_another_was_built_wins() {
        let mut cache = ClientCache::<u32>::default();
        let now = Instant::now();
        let k = key("api.example.com", &["1.1.1.1"], false);
        assert_eq!(cache.insert(k.clone(), 1, now), 1);
        assert_eq!(cache.insert(k.clone(), 2, now), 1);
        assert_eq!(cache.get(&k, now), Some(1));
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn pinned_addresses_are_part_of_the_key_so_rebinding_cannot_reuse_a_client() {
        let a = key("api.example.com", &["1.1.1.1"], false);
        let rebound = key("api.example.com", &["169.254.169.254"], false);
        assert_ne!(a, rebound);
        let mut cache = ClientCache::<u32>::default();
        let now = Instant::now();
        cache.insert(a, 1, now);
        assert_eq!(cache.get(&rebound, now), None);
        assert_eq!(cache.insert(rebound, 2, now), 2);
    }

    #[test]
    fn address_order_and_host_case_do_not_split_the_cache() {
        assert_eq!(
            key("API.Example.com", &["1.1.1.1", "8.8.8.8"], false),
            key("api.example.com", &["8.8.8.8", "1.1.1.1", "1.1.1.1"], false)
        );
    }

    #[test]
    fn private_opt_in_and_profile_are_part_of_the_key() {
        assert_ne!(
            key("localhost", &["127.0.0.1"], true),
            key("localhost", &["127.0.0.1"], false)
        );
        let ips = [ip("127.0.0.1")];
        assert_ne!(
            ClientKey::new(Profile::Stream, "localhost", &ips, true),
            ClientKey::new(Profile::Ping, "localhost", &ips, true)
        );
    }

    #[test]
    fn idle_clients_expire() {
        let mut cache = ClientCache::<u32>::default();
        let now = Instant::now();
        let k = key("a.example.com", &["1.1.1.1"], false);
        cache.insert(k.clone(), 1, now);
        let touched = now + IDLE_TTL - Duration::from_secs(1);
        assert_eq!(cache.get(&k, touched), Some(1));
        assert_eq!(
            cache.get(&k, touched + IDLE_TTL + Duration::from_secs(1)),
            None,
            "use refreshes the TTL; a full idle period expires it"
        );
        assert!(cache.is_empty());
    }

    #[test]
    fn the_cache_is_bounded_and_evicts_the_least_recently_used() {
        let mut cache = ClientCache::<usize>::default();
        let now = Instant::now();
        for i in 0..(MAX_CLIENTS + 3) {
            let k = key(&format!("h{i}.example.com"), &["1.1.1.1"], false);
            cache.insert(k, i, now + Duration::from_secs(i as u64));
        }
        assert_eq!(cache.len(), MAX_CLIENTS);
        let later = now + Duration::from_secs(20);
        let oldest = key("h0.example.com", &["1.1.1.1"], false);
        assert_eq!(
            cache.get(&oldest, later),
            None,
            "the oldest entry was evicted"
        );
        let newest = key(
            &format!("h{}.example.com", MAX_CLIENTS + 2),
            &["1.1.1.1"],
            false,
        );
        assert_eq!(cache.get(&newest, later), Some(MAX_CLIENTS + 2));
    }

    #[test]
    fn real_clients_build_with_pinned_resolution() {
        let k = key(
            "api.example.com",
            &["93.184.216.34", "2606:2800:220:1::1"],
            false,
        );
        build_client(&k).expect("stream client");
        let ping = ClientKey::new(Profile::Ping, "localhost", &[ip("127.0.0.1")], true);
        build_client(&ping).expect("ping client");
    }
}
