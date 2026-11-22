//! Server ports forwarded to this machine over the host's shared ControlMaster
//! (`ssh -O forward`), bound to 127.0.0.1 and [::1] only. Forwards live in memory
//! and die with the master that holds them. A waiting forward does not count as a
//! client for ControlPersist, so a holder session keeps the master open while it
//! has one.

#![cfg_attr(not(unix), allow(dead_code))]

use crate::modules::ssh;
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

pub mod chrome;

// Prints once the session runs, so a refused or ended session is told apart
// from one that holds the master.
const HOLDER_COMMAND: &str = "echo ready; exec cat >/dev/null";
const MAX_BIND_ATTEMPTS: usize = 16;
const MUX_TIMEOUT: Duration = ssh::REMOTE_POLL_TIMEOUT;
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);
const UNSUPPORTED: &str =
    "port forwarding needs the shared SSH connection, which Terax has only on macOS and Linux";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ForwardStatus {
    Active,
    Disconnected,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForward {
    pub remote_port: u16,
    pub local_port: u16,
    pub status: ForwardStatus,
}

#[tauri::command]
pub async fn ssh_port_forward(host: String, remote_port: u32) -> Result<PortForward, String> {
    let remote = validate_request(&host, remote_port)?;
    blocking("ssh_port_forward", move || registry().forward(&host, remote)).await
}

#[tauri::command]
pub async fn ssh_port_stop(host: String, remote_port: u32) -> Result<(), String> {
    let remote = validate_request(&host, remote_port)?;
    blocking("ssh_port_stop", move || registry().stop(&host, remote)).await
}

#[tauri::command]
pub async fn ssh_port_list(host: String) -> Result<Vec<PortForward>, String> {
    ssh::validate_ssh_host(&host)?;
    blocking("ssh_port_list", move || registry().list(&host)).await
}

async fn blocking<T: Send + 'static>(
    what: &str,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    if !cfg!(unix) {
        return Err(UNSUPPORTED.to_string());
    }
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("{what} task failed: {e}"))?
}

pub fn validate_port(port: u32) -> Result<u16, String> {
    match u16::try_from(port) {
        Ok(port) if port != 0 => Ok(port),
        _ => Err(format!("invalid port: {port}")),
    }
}

fn validate_request(host: &str, port: u32) -> Result<u16, String> {
    ssh::validate_ssh_host(host)?;
    validate_port(port)
}

pub fn not_connected(host: &str) -> String {
    format!("not connected to {host}")
}

pub fn no_active_forward(host: &str, remote: u16) -> String {
    format!("no active forward of port {remote} on {host}")
}

fn no_free_port(from: u16) -> String {
    format!("no free port on this Mac from {from}")
}

/// WebKit may try `[::1]` first for `localhost`, so a forward binds both;
/// otherwise a Mac process that binds `[::1]` later would take the address over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Loopback {
    V4,
    V6,
}

const BOTH_LOOPBACKS: &[Loopback] = &[Loopback::V4, Loopback::V6];
const IPV4_ONLY: &[Loopback] = &[Loopback::V4];

impl Loopback {
    fn bind_host(self) -> &'static str {
        match self {
            Self::V4 => "127.0.0.1",
            Self::V6 => "[::1]",
        }
    }

    fn addr(self, port: u16) -> SocketAddr {
        match self {
            Self::V4 => SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
            Self::V6 => SocketAddr::from((Ipv6Addr::LOCALHOST, port)),
        }
    }
}

fn loopbacks(has_ipv6: bool) -> &'static [Loopback] {
    if has_ipv6 {
        BOTH_LOOPBACKS
    } else {
        IPV4_ONLY
    }
}

/// A machine with IPv6 disabled has no `[::1]`; nothing can take it over there.
fn has_ipv6_loopback() -> bool {
    std::net::TcpListener::bind((Ipv6Addr::LOCALHOST, 0)).is_ok()
}

fn forward_spec(family: Loopback, local: u16, remote: u16) -> String {
    format!("{}:{local}:localhost:{remote}", family.bind_host())
}

/// `ssh -O forward|cancel` against the control socket; never opens a connection.
fn mux_args(
    control: &[String],
    op: &str,
    family: Loopback,
    local: u16,
    remote: u16,
    host: &str,
) -> Vec<String> {
    let mut args = vec!["-o".to_string(), "BatchMode=yes".to_string()];
    args.extend(control.iter().cloned());
    args.extend([
        "-O".to_string(),
        op.to_string(),
        "-L".to_string(),
        forward_spec(family, local, remote),
        "--".to_string(),
        host.to_string(),
    ]);
    args
}

/// A session on the master that waits for its stdin to close. ssh keeps the
/// first value of an option, so these have to precede `control`.
/// `ProxyCommand=false`: without the master's socket ssh would quietly open a
/// direct connection of its own; this makes that attempt fail on the spot.
fn holder_args(control: &[String], host: &str) -> Vec<String> {
    let mut args: Vec<String> = [
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ControlMaster=no",
        "-o",
        "ProxyCommand=false",
    ]
    .map(String::from)
    .into();
    args.extend(control.iter().cloned());
    args.push("--".to_string());
    args.push(host.to_string());
    args.push(HOLDER_COMMAND.to_string());
    args
}

fn port_free(port: u16, families: &[Loopback], occupied: impl Fn(SocketAddr) -> bool) -> bool {
    families.iter().all(|family| !occupied(family.addr(port)))
}

fn next_free_port(from: u16, is_free: &mut impl FnMut(u16) -> bool) -> Option<u16> {
    (from..=u16::MAX).find(|&port| is_free(port))
}

#[derive(Debug, PartialEq)]
enum BindError {
    InUse,
    Failed(String),
}

/// Checking and binding race with other processes, so a bind that fails on a
/// port checked as free moves on to the next free one.
fn bind_first_free(
    remote: u16,
    mut is_free: impl FnMut(u16) -> bool,
    mut bind: impl FnMut(u16) -> Result<(), BindError>,
) -> Result<u16, String> {
    let mut from = remote;
    for _ in 0..MAX_BIND_ATTEMPTS {
        let port = next_free_port(from, &mut is_free).ok_or_else(|| no_free_port(remote))?;
        match bind(port) {
            Ok(()) => return Ok(port),
            Err(BindError::Failed(message)) => return Err(message),
            Err(BindError::InUse) if port == u16::MAX => return Err(no_free_port(remote)),
            Err(BindError::InUse) => from = port + 1,
        }
    }
    Err(format!("could not bind a port on this Mac from {remote}"))
}

/// One port on every family or on none: a family that fails takes back the
/// ones bound before it.
fn bind_all(
    port: u16,
    families: &[Loopback],
    mut bind: impl FnMut(Loopback, u16) -> Result<(), BindError>,
    mut unbind: impl FnMut(Loopback, u16),
) -> Result<(), BindError> {
    for (i, &family) in families.iter().enumerate() {
        if let Err(e) = bind(family, port) {
            for &bound in &families[..i] {
                unbind(bound, port);
            }
            return Err(e);
        }
    }
    Ok(())
}

fn first_line(stderr: &str) -> &str {
    stderr.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("")
}

fn master_gone(stderr: &str) -> bool {
    let s = stderr.to_ascii_lowercase();
    s.contains("control socket connect") || s.contains("no such file")
}

fn forward_outcome(code: Option<i32>, stderr: &str, host: &str) -> Result<(), BindError> {
    if code == Some(0) {
        return Ok(());
    }
    if stderr.to_ascii_lowercase().contains("port forwarding failed") {
        return Err(BindError::InUse);
    }
    if master_gone(stderr) {
        return Err(BindError::Failed(not_connected(host)));
    }
    Err(BindError::Failed(match first_line(stderr) {
        "" => format!("ssh -O forward failed (exit {code:?})"),
        line => format!("ssh -O forward failed: {line}"),
    }))
}

/// A gone master took its listener with it, so that counts as stopped.
fn cancel_outcome(code: Option<i32>, stderr: &str) -> Result<(), String> {
    if code == Some(0) || master_gone(stderr) {
        return Ok(());
    }
    Err(match first_line(stderr) {
        "" => format!("ssh -O cancel failed (exit {code:?})"),
        line => format!("ssh -O cancel failed: {line}"),
    })
}

fn status_of(owner: u32, live: Option<u32>) -> ForwardStatus {
    if live == Some(owner) {
        ForwardStatus::Active
    } else {
        ForwardStatus::Disconnected
    }
}

fn occupied_on_this_machine(addr: SocketAddr) -> bool {
    use std::io::ErrorKind;
    // std binds with SO_REUSEADDR, under which macOS lets a loopback bind share
    // a port with a wildcard listener; the connect catches that one.
    let bindable = match std::net::TcpListener::bind(addr) {
        Ok(_) => true,
        Err(e) => matches!(e.kind(), ErrorKind::AddrNotAvailable | ErrorKind::Unsupported),
    };
    !bindable || std::net::TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok()
}

fn holder_error(host: &str, reason: &str) -> String {
    format!("could not keep the connection to {host} open: {reason}")
}

struct Forward {
    local_port: u16,
    master_pid: u32,
    families: &'static [Loopback],
}

/// Dropping it closes the session's stdin and ends it; a crashed Terax closes
/// that pipe too, so the master then ends after ControlPersist.
struct Holder {
    child: Child,
    master_pid: u32,
    // Kept open so a late write from ssh never meets a closed pipe.
    _pipes: (Option<ChildStdout>, Option<ChildStderr>),
}

impl Holder {
    /// Returns once the session runs on the master. A session the server
    /// refuses (`MaxSessions`) or ends at once is an error, not a holder.
    fn spawn(control: &[String], host: &str, master_pid: u32) -> Result<Self, String> {
        let mut cmd = Command::new("ssh");
        cmd.args(holder_args(control, host))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        crate::modules::proc::hide_console(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| holder_error(host, &e.to_string()))?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut stdout = stdout;
            let started = stdout
                .as_mut()
                .is_some_and(|out| matches!(out.read(&mut [0u8; 1]), Ok(1)));
            let _ = tx.send((started, stdout));
        });
        let mut holder = Self {
            child,
            master_pid,
            _pipes: (None, stderr),
        };
        match rx.recv_timeout(MUX_TIMEOUT) {
            Ok((true, stdout)) => {
                holder._pipes.0 = stdout;
                Ok(holder)
            }
            Ok((false, _)) => {
                let status = holder.child.wait().ok().and_then(|s| s.code());
                let mut text = String::new();
                if let Some(err) = holder._pipes.1.take() {
                    let _ = err.take(4096).read_to_string(&mut text);
                }
                Err(holder_error(
                    host,
                    match first_line(&text) {
                        "" => format!("the session ended at once (exit {status:?})"),
                        line => line.to_string(),
                    }
                    .as_str(),
                ))
            }
            Err(_) => Err(holder_error(
                host,
                &format!("the session did not start within {}s", MUX_TIMEOUT.as_secs()),
            )),
        }
    }

    fn running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for Holder {
    fn drop(&mut self) {
        drop(self.child.stdin.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
struct HostForwards {
    forwards: BTreeMap<u16, Forward>,
    holder: Option<Holder>,
}

impl HostForwards {
    fn keep_open(&mut self, control: &[String], host: &str, live: u32) -> Result<(), String> {
        if let Some(holder) = self.holder.as_mut() {
            if holder.master_pid == live && holder.running() {
                return Ok(());
            }
        }
        self.holder = None;
        self.holder = Some(Holder::spawn(control, host, live)?);
        Ok(())
    }

    /// A holder that ended (server closed the session) is started again while
    /// the live master carries forwards; one for a gone master is dropped.
    fn reconcile_holder(&mut self, control: &[String], host: &str, live: Option<u32>) {
        let needed = live.filter(|&pid| self.forwards.values().any(|f| f.master_pid == pid));
        match needed {
            Some(pid) => {
                if let Err(e) = self.keep_open(control, host, pid) {
                    log::warn!("ssh_port_list {host}: {e}");
                }
            }
            None => self.holder = None,
        }
    }

    fn release_idle_holder(&mut self) {
        let idle = self.holder.as_ref().is_some_and(|holder| {
            !self
                .forwards
                .values()
                .any(|forward| forward.master_pid == holder.master_pid)
        });
        if idle {
            self.holder = None;
        }
    }

    fn view(&self, live: Option<u32>) -> Vec<PortForward> {
        self.forwards
            .iter()
            .map(|(&remote_port, forward)| PortForward {
                remote_port,
                local_port: forward.local_port,
                status: status_of(forward.master_pid, live),
            })
            .collect()
    }
}

type HostSlot = Arc<Mutex<HostForwards>>;

/// Forwards per host for one control dir. Calls for one host are serialized;
/// a wedged master of one host never blocks another. Entries stay once made,
/// so a call that waited on a host's lock never works on a detached entry.
pub struct Registry {
    control: Vec<String>,
    hosts: Mutex<HashMap<String, HostSlot>>,
}

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(|| Registry::new(ssh::control_args()))
}

fn lock_host(slot: &HostSlot) -> MutexGuard<'_, HostForwards> {
    slot.lock().unwrap_or_else(|e| e.into_inner())
}

impl Registry {
    pub fn new(control: Vec<String>) -> Self {
        Self {
            control,
            hosts: Mutex::new(HashMap::new()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, HostSlot>> {
        self.hosts.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn slot(&self, host: &str) -> Option<HostSlot> {
        self.lock().get(host).cloned()
    }

    fn slot_or_insert(&self, host: &str) -> HostSlot {
        Arc::clone(self.lock().entry(host.to_string()).or_default())
    }

    fn mux(
        &self,
        op: &str,
        family: Loopback,
        local: u16,
        remote: u16,
        host: &str,
    ) -> Result<(Option<i32>, String), String> {
        ssh::run_control_command(
            &mux_args(&self.control, op, family, local, remote, host),
            MUX_TIMEOUT,
        )
    }

    fn bind_one(&self, family: Loopback, local: u16, remote: u16, host: &str) -> Result<(), BindError> {
        match self.mux("forward", family, local, remote, host) {
            Ok((code, stderr)) => forward_outcome(code, &stderr, host),
            Err(e) => Err(BindError::Failed(e)),
        }
    }

    fn cancel_one(&self, family: Loopback, local: u16, remote: u16, host: &str) -> Result<(), String> {
        let (code, stderr) = self.mux("cancel", family, local, remote, host)?;
        cancel_outcome(code, &stderr)
    }

    /// Cancels every family even when one fails, and reports the first failure.
    fn cancel_all(&self, families: &[Loopback], local: u16, remote: u16, host: &str) -> Result<(), String> {
        let mut outcome = Ok(());
        for &family in families {
            let cancelled = self.cancel_one(family, local, remote, host);
            if outcome.is_ok() {
                outcome = cancelled;
            }
        }
        outcome
    }

    pub fn forward(&self, host: &str, remote: u16) -> Result<PortForward, String> {
        validate_request(host, u32::from(remote))?;
        let slot = self.slot_or_insert(host);
        let mut entry = lock_host(&slot);
        let live = ssh::master_pid_at(&self.control, host).ok_or_else(|| not_connected(host))?;
        if let Some(local_port) = entry
            .forwards
            .get(&remote)
            .filter(|existing| existing.master_pid == live)
            .map(|existing| existing.local_port)
        {
            // A list that found the master wedged dropped the holder; this heals it.
            entry.keep_open(&self.control, host, live)?;
            return Ok(PortForward {
                remote_port: remote,
                local_port,
                status: ForwardStatus::Active,
            });
        }
        // So that quitting Terax (disconnect_all) ends the master holding the forward.
        ssh::note_connected_host(host);
        let families = loopbacks(has_ipv6_loopback());
        let local = bind_first_free(
            remote,
            |port| port_free(port, families, occupied_on_this_machine),
            |port| {
                bind_all(
                    port,
                    families,
                    |family, port| self.bind_one(family, port, remote, host),
                    |family, port| {
                        let _ = self.cancel_one(family, port, remote, host);
                    },
                )
            },
        )?;
        let previous = entry.forwards.insert(
            remote,
            Forward {
                local_port: local,
                master_pid: live,
                families,
            },
        );
        if let Err(e) = entry.keep_open(&self.control, host, live) {
            match previous {
                Some(previous) => entry.forwards.insert(remote, previous),
                None => entry.forwards.remove(&remote),
            };
            entry.release_idle_holder();
            let _ = self.cancel_all(families, local, remote, host);
            return Err(e);
        }
        Ok(PortForward {
            remote_port: remote,
            local_port: local,
            status: ForwardStatus::Active,
        })
    }

    pub fn stop(&self, host: &str, remote: u16) -> Result<(), String> {
        validate_request(host, u32::from(remote))?;
        let Some(slot) = self.slot(host) else {
            return Ok(());
        };
        let mut entry = lock_host(&slot);
        let Some(forward) = entry.forwards.get(&remote) else {
            return Ok(());
        };
        if ssh::master_pid_at(&self.control, host) == Some(forward.master_pid) {
            self.cancel_all(forward.families, forward.local_port, remote, host)?;
        }
        entry.forwards.remove(&remote);
        entry.release_idle_holder();
        Ok(())
    }

    pub fn list(&self, host: &str) -> Result<Vec<PortForward>, String> {
        ssh::validate_ssh_host(host)?;
        let Some(slot) = self.slot(host) else {
            return Ok(Vec::new());
        };
        let mut entry = lock_host(&slot);
        if entry.forwards.is_empty() {
            entry.holder = None;
            return Ok(Vec::new());
        }
        let live = ssh::master_pid_at(&self.control, host);
        entry.reconcile_holder(&self.control, host, live);
        Ok(entry.view(live))
    }

    /// The Mac port of an active forward. The host's lock is held only to read
    /// the entry, so a slow master check never blocks a forward or a stop.
    pub fn active_local_port(&self, host: &str, remote: u16) -> Result<u16, String> {
        self.active_local_port_with(host, remote, ssh::master_pid_at)
    }

    fn active_local_port_with(
        &self,
        host: &str,
        remote: u16,
        live: impl FnOnce(&[String], &str) -> Option<u32>,
    ) -> Result<u16, String> {
        validate_request(host, u32::from(remote))?;
        let found = self.slot(host).and_then(|slot| {
            let entry = lock_host(&slot);
            entry
                .forwards
                .get(&remote)
                .map(|forward| (forward.local_port, forward.master_pid))
        });
        match found {
            Some((local, owner))
                if status_of(owner, live(&self.control, host)) == ForwardStatus::Active =>
            {
                Ok(local)
            }
            _ => Err(no_active_forward(host, remote)),
        }
    }

    #[cfg(test)]
    fn insert_for_test(&self, host: &str, remote: u16, local: u16, master_pid: u32) {
        let slot = self.slot_or_insert(host);
        lock_host(&slot).forwards.insert(
            remote,
            Forward {
                local_port: local,
                master_pid,
                families: BOTH_LOOPBACKS,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn control() -> Vec<String> {
        [
            "-o",
            "ControlMaster=auto",
            "-o",
            "ControlPersist=10m",
            "-o",
            "ControlPath=/c/%C",
        ]
        .map(String::from)
        .into()
    }

    #[test]
    fn ports_outside_1_to_65535_are_refused() {
        assert_eq!(validate_port(0), Err("invalid port: 0".to_string()));
        assert_eq!(validate_port(65536), Err("invalid port: 65536".to_string()));
        assert_eq!(validate_port(1), Ok(1));
        assert_eq!(validate_port(65535), Ok(65535));
    }

    #[test]
    fn a_bad_host_or_port_fails_before_any_ssh_call() {
        assert_eq!(
            validate_request("-oProxyCommand=x", 18080),
            ssh::validate_ssh_host("-oProxyCommand=x").map(|()| 0)
        );
        assert_eq!(validate_request("devbox", 0), Err("invalid port: 0".to_string()));
        let registry = Registry::new(vec!["-o".into(), "ControlPath=/nonexistent/%C".into()]);
        assert_eq!(
            registry.forward("devbox", 0),
            Err("invalid port: 0".to_string())
        );
        assert!(registry.forward("-oProxyCommand=x", 18080).is_err());
        assert!(registry.lock().is_empty());
    }

    #[test]
    fn a_port_counts_as_free_only_when_free_on_every_loopback_it_binds() {
        let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, 3000));
        let v6 = SocketAddr::from((Ipv6Addr::LOCALHOST, 3000));
        let taken = |set: Vec<SocketAddr>| move |addr: SocketAddr| set.contains(&addr);
        assert!(port_free(3000, BOTH_LOOPBACKS, taken(vec![])));
        assert!(!port_free(3000, BOTH_LOOPBACKS, taken(vec![v4])));
        assert!(!port_free(3000, BOTH_LOOPBACKS, taken(vec![v6])));
        assert!(port_free(3001, BOTH_LOOPBACKS, taken(vec![v4, v6])));
        assert!(port_free(3000, IPV4_ONLY, taken(vec![v6])));
        assert!(!port_free(3000, IPV4_ONLY, taken(vec![v4])));
    }

    #[test]
    fn without_an_ipv6_loopback_only_ipv4_is_bound() {
        assert_eq!(loopbacks(true), [Loopback::V4, Loopback::V6]);
        assert_eq!(loopbacks(false), [Loopback::V4]);
    }

    fn choose(remote: u16, taken: &[u16], bind_fails: &[u16]) -> Result<u16, String> {
        bind_first_free(
            remote,
            |port| !taken.contains(&port),
            |port| {
                if bind_fails.contains(&port) {
                    Err(BindError::InUse)
                } else {
                    Ok(())
                }
            },
        )
    }

    #[test]
    fn the_mac_port_is_the_server_port_or_the_next_free_one() {
        assert_eq!(choose(3000, &[], &[]), Ok(3000));
        assert_eq!(choose(3000, &[3000], &[]), Ok(3001));
        assert_eq!(choose(3000, &[3000, 3001, 3003], &[3002]), Ok(3004));
        assert_eq!(choose(3000, &[], &[3000]), Ok(3001));
    }

    #[test]
    fn no_free_port_up_to_65535_is_an_error() {
        let err = Err("no free port on this Mac from 65535".to_string());
        assert_eq!(choose(65535, &[65535], &[]), err);
        assert_eq!(choose(65535, &[], &[65535]), err);
        assert_eq!(
            choose(65534, &[65534, 65535], &[]),
            Err("no free port on this Mac from 65534".to_string())
        );
    }

    #[test]
    fn bind_retries_are_bounded_and_other_failures_stop_at_once() {
        let mut calls = 0;
        let result = bind_first_free(
            1000,
            |_| true,
            |_| {
                calls += 1;
                Err(BindError::InUse)
            },
        );
        assert_eq!(calls, MAX_BIND_ATTEMPTS);
        assert_eq!(
            result,
            Err("could not bind a port on this Mac from 1000".to_string())
        );
        let result = bind_first_free(
            1000,
            |_| true,
            |_| Err(BindError::Failed("not connected to devbox".into())),
        );
        assert_eq!(result, Err("not connected to devbox".to_string()));
    }

    #[test]
    fn a_failed_ipv6_bind_takes_back_ipv4_and_moves_to_the_next_port() {
        let bound = std::cell::RefCell::new(Vec::<(Loopback, u16)>::new());
        let result = bind_first_free(
            3000,
            |_| true,
            |port| {
                bind_all(
                    port,
                    BOTH_LOOPBACKS,
                    |family, port| {
                        if family == Loopback::V6 && port == 3000 {
                            return Err(BindError::InUse);
                        }
                        bound.borrow_mut().push((family, port));
                        Ok(())
                    },
                    |family, port| bound.borrow_mut().retain(|&b| b != (family, port)),
                )
            },
        );
        assert_eq!(result, Ok(3001));
        assert_eq!(
            bound.into_inner(),
            [(Loopback::V4, 3001), (Loopback::V6, 3001)]
        );
    }

    #[test]
    fn an_ipv4_only_bind_never_touches_ipv6() {
        let mut families = Vec::new();
        let result = bind_all(
            3000,
            IPV4_ONLY,
            |family, _| {
                families.push(family);
                Ok(())
            },
            |_, _| panic!("nothing to take back"),
        );
        assert_eq!(result, Ok(()));
        assert_eq!(families, [Loopback::V4]);
    }

    #[test]
    fn forwards_bind_both_loopbacks_explicitly_and_target_server_localhost() {
        let args = mux_args(&control(), "forward", Loopback::V4, 18081, 18080, "devbox");
        let tail = &args[args.len() - 6..];
        assert_eq!(
            tail,
            ["-O", "forward", "-L", "127.0.0.1:18081:localhost:18080", "--", "devbox"]
        );
        assert_eq!(&args[..2], ["-o", "BatchMode=yes"]);
        assert!(args.contains(&"ControlPath=/c/%C".to_string()));
        let v6 = mux_args(&control(), "forward", Loopback::V6, 18081, 18080, "devbox");
        assert_eq!(v6[v6.len() - 3], "[::1]:18081:localhost:18080");
        let cancel = mux_args(&control(), "cancel", Loopback::V4, 18081, 18080, "devbox");
        assert_eq!(cancel[cancel.len() - 5], "cancel");
    }

    #[test]
    fn the_holder_never_prompts_never_becomes_a_master_and_never_connects_itself() {
        let args = holder_args(&control(), "devbox");
        let pos = |needle: &str| args.iter().position(|a| a == needle).unwrap();
        assert!(pos("BatchMode=yes") < pos("ControlPath=/c/%C"));
        assert!(pos("ControlMaster=no") < pos("ControlMaster=auto"));
        assert!(pos("ProxyCommand=false") < pos("ControlPath=/c/%C"));
        assert_eq!(&args[args.len() - 3..], ["--", "devbox", HOLDER_COMMAND]);
        assert_eq!(args[0], "-T");
    }

    #[test]
    fn ssh_answers_map_to_bind_retry_or_a_clear_error() {
        assert_eq!(forward_outcome(Some(0), "", "devbox"), Ok(()));
        assert_eq!(
            forward_outcome(
                Some(255),
                "mux_client_forward: forwarding request failed: Port forwarding failed\n",
                "devbox"
            ),
            Err(BindError::InUse)
        );
        assert_eq!(
            forward_outcome(
                Some(255),
                "Control socket connect(/c/abc): No such file or directory\n",
                "devbox"
            ),
            Err(BindError::Failed("not connected to devbox".into()))
        );
        assert_eq!(
            forward_outcome(Some(255), "\nboom\n", "devbox"),
            Err(BindError::Failed("ssh -O forward failed: boom".into()))
        );
        assert_eq!(
            cancel_outcome(Some(0), "forwarding request failed: port not forwarded"),
            Ok(())
        );
        assert_eq!(
            cancel_outcome(Some(255), "Control socket connect(/c/abc): Connection refused"),
            Ok(())
        );
        assert!(cancel_outcome(Some(255), "boom").is_err());
    }

    #[test]
    fn a_forward_is_active_only_on_the_master_that_holds_it() {
        assert_eq!(status_of(42, Some(42)), ForwardStatus::Active);
        assert_eq!(status_of(42, Some(43)), ForwardStatus::Disconnected);
        assert_eq!(status_of(42, None), ForwardStatus::Disconnected);
    }

    #[test]
    fn forwards_serialize_for_the_frontend_in_port_order() {
        let mut entry = HostForwards::default();
        for (remote, local, pid) in [(18090, 18090, 7), (18080, 18081, 7), (3000, 3000, 6)] {
            entry.forwards.insert(
                remote,
                Forward {
                    local_port: local,
                    master_pid: pid,
                    families: BOTH_LOOPBACKS,
                },
            );
        }
        let json = serde_json::to_value(entry.view(Some(7))).unwrap();
        assert_eq!(
            json,
            serde_json::json!([
                {"remotePort": 3000, "localPort": 3000, "status": "disconnected"},
                {"remotePort": 18080, "localPort": 18081, "status": "active"},
                {"remotePort": 18090, "localPort": 18090, "status": "active"},
            ])
        );
    }

    #[test]
    fn without_a_master_nothing_is_listed_or_registered() {
        let registry = Registry::new(vec!["-o".into(), "ControlPath=/nonexistent/%C".into()]);
        assert_eq!(registry.list("devbox"), Ok(Vec::new()));
        assert_eq!(registry.stop("devbox", 18080), Ok(()));
        assert!(registry.lock().is_empty());
        assert_eq!(
            registry.forward("devbox", 18080),
            Err("not connected to devbox".to_string())
        );
        assert_eq!(registry.list("devbox"), Ok(Vec::new()));
    }
}

/// Real runs against an sshd; ignored in the normal suite. Start with
/// `TERAX_E2E_HOST=<ssh alias> cargo test --lib ports::e2e -- --ignored --test-threads=1 --nocapture`
/// (key auth without prompts, python3 on the server, server ports 18080/18090 and
/// local ports 18080 to 18082 free). More aliases for single tests:
/// `TERAX_E2E_HOST_B` (same server under another HostName, so its own master),
/// `TERAX_E2E_HOST_ONE_SESSION` (an sshd with `MaxSessions 1`), and
/// `TERAX_E2E_SSHD_LOG` (the server's sshd log, readable by the test user;
/// default `/var/log/sshd.log`).
#[cfg(all(test, unix))]
mod e2e {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Instant;

    fn env_alias(name: &str) -> String {
        std::env::var(name)
            .unwrap_or_else(|_| panic!("{name} names an ssh alias, see the module comment"))
    }

    fn host() -> String {
        env_alias("TERAX_E2E_HOST")
    }

    fn wait_until(budget: Duration, mut done: impl FnMut() -> bool) -> bool {
        let start = Instant::now();
        while start.elapsed() < budget {
            if done() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        done()
    }

    /// A terminal the way the app opens one (`ssh -tt` with the control args),
    /// running `remote` instead of a login shell. Its exit closes the master.
    struct Connection {
        control: Vec<String>,
        host: String,
        terminal: Child,
    }

    impl Connection {
        fn open(control: &[String], persist: Option<&str>, remote: &str) -> Self {
            Self::open_to(&host(), control, persist, remote)
        }

        fn open_to(host: &str, control: &[String], persist: Option<&str>, remote: &str) -> Self {
            let mut cmd = Command::new("ssh");
            cmd.arg("-tt");
            if let Some(persist) = persist {
                cmd.arg("-o").arg(format!("ControlPersist={persist}"));
            }
            let terminal = cmd
                .args(control)
                .arg(host)
                .arg(remote)
                .env("TERM", "xterm")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn ssh -tt");
            assert!(
                wait_until(Duration::from_secs(10), || {
                    ssh::master_pid_at(control, host).is_some()
                }),
                "master to {host} did not come up"
            );
            Self {
                control: control.to_vec(),
                host: host.to_string(),
                terminal,
            }
        }

        fn pid(&self) -> Option<u32> {
            ssh::master_pid_at(&self.control, &self.host)
        }

        fn exit_master(&self) {
            let _ = Command::new("ssh")
                .args(&self.control)
                .args(["-O", "exit", &self.host])
                .stderr(Stdio::null())
                .status();
        }
    }

    impl Drop for Connection {
        fn drop(&mut self) {
            self.exit_master();
            let _ = self.terminal.kill();
            let _ = self.terminal.wait();
        }
    }

    /// A shell command on the server over its own connection (no ControlPath),
    /// so it never counts as a client of a master under test.
    fn on_server(script: &str) -> Command {
        let mut cmd = Command::new("ssh");
        cmd.args(["-o", "BatchMode=yes", "-o", "ControlPath=none", &host(), script]);
        cmd
    }

    /// `python3 -m http.server` on the server's loopback.
    struct ServerPage(Child);

    impl ServerPage {
        fn start(port: u16) -> Self {
            let host = host();
            let script = format!(
                "d=/tmp/terax-e2e-page-{port}; mkdir -p $d && echo 'server page {port}' > $d/index.html \
                 && cd $d && exec python3 -m http.server {port} --bind 127.0.0.1"
            );
            let child = Command::new("ssh")
                .args(["-tt", "-o", "BatchMode=yes", "-o", "ControlPath=none", &host, &script])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn page server");
            let probe = format!(
                "python3 -c \"import socket; socket.create_connection(('127.0.0.1', {port}), 1)\""
            );
            assert!(
                wait_until(Duration::from_secs(10), || {
                    on_server(&probe)
                        .stderr(Stdio::null())
                        .status()
                        .is_ok_and(|s| s.success())
                }),
                "page server on {port} did not come up"
            );
            Self(child)
        }
    }

    impl Drop for ServerPage {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    fn get(addr: SocketAddr) -> Result<String, String> {
        let mut stream =
            TcpStream::connect_timeout(&addr, Duration::from_secs(2)).map_err(|e| e.to_string())?;
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| e.to_string())?;
        stream
            .write_all(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n")
            .map_err(|e| e.to_string())?;
        let mut response = String::new();
        stream.read_to_string(&mut response).map_err(|e| e.to_string())?;
        Ok(response
            .split("\r\n\r\n")
            .nth(1)
            .unwrap_or_default()
            .trim()
            .to_string())
    }

    fn v4(port: u16) -> SocketAddr {
        Loopback::V4.addr(port)
    }

    fn v6(port: u16) -> SocketAddr {
        Loopback::V6.addr(port)
    }

    fn page_at(addr: SocketAddr) -> String {
        get(addr).unwrap_or_else(|e| format!("error: {e}"))
    }

    fn page(port: u16) -> String {
        page_at(v4(port))
    }

    fn refuses(addr: SocketAddr) -> bool {
        matches!(
            TcpStream::connect_timeout(&addr, Duration::from_secs(1)),
            Err(e) if e.kind() == std::io::ErrorKind::ConnectionRefused
        )
    }

    fn bind_error(addr: SocketAddr) -> Option<std::io::ErrorKind> {
        std::net::TcpListener::bind(addr).err().map(|e| e.kind())
    }

    /// The address this machine uses toward the server: a non-loopback one.
    fn outward_address(host: &str) -> std::net::IpAddr {
        let out = Command::new("ssh").args(["-G", host]).output().expect("ssh -G");
        let config = String::from_utf8_lossy(&out.stdout);
        let value = |key: &str| {
            config
                .lines()
                .find_map(|l| l.strip_prefix(&format!("{key} ")).map(str::to_string))
                .unwrap_or_default()
        };
        let socket = std::net::UdpSocket::bind("0.0.0.0:0").expect("udp bind");
        socket
            .connect(format!("{}:{}", value("hostname"), value("port")))
            .expect("udp connect");
        socket.local_addr().expect("local addr").ip()
    }

    fn holder_pid(registry: &Registry, host: &str) -> Option<u32> {
        let slot = registry.slot(host)?;
        let mut entry = lock_host(&slot);
        let holder = entry.holder.as_mut()?;
        holder.running().then(|| holder.child.id())
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_forward_loads_the_page_on_both_loopbacks_only() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let ipv6 = has_ipv6_loopback();
        let first = registry.forward(&conn.host, 18080);
        println!("E2E IPv6 loopback here: {ipv6}; forward 18080 -> {first:?}");
        println!("E2E GET 127.0.0.1:18080 -> {:?}", page(18080));
        let again = registry.forward(&conn.host, 18080);
        println!("E2E forward 18080 again -> {again:?}");
        let gateway = Command::new("ssh").args(["-G", &conn.host]).output().unwrap();
        let gateway = String::from_utf8_lossy(&gateway.stdout)
            .lines()
            .find(|l| l.starts_with("gatewayports"))
            .unwrap_or_default()
            .to_string();
        let outward = outward_address(&conn.host);
        let lan = SocketAddr::new(outward, 18080);
        println!("E2E ssh -G: {gateway}; {lan} refuses: {}", refuses(lan));
        assert_eq!(
            first,
            Ok(PortForward {
                remote_port: 18080,
                local_port: 18080,
                status: ForwardStatus::Active
            })
        );
        assert_eq!(page(18080), "server page 18080");
        assert_eq!(again, first);
        assert!(!outward.is_loopback());
        assert!(refuses(lan));
        assert_eq!(registry.list(&conn.host).unwrap().len(), 1);
        if ipv6 {
            let late_v6 = bind_error(v6(18080));
            println!(
                "E2E GET [::1]:18080 -> {:?}; a later listener on [::1]:18080 -> {late_v6:?}",
                page_at(v6(18080))
            );
            assert_eq!(page_at(v6(18080)), "server page 18080");
            assert_eq!(late_v6, Some(std::io::ErrorKind::AddrInUse));
        } else {
            println!("E2E no IPv6 loopback: the forward binds 127.0.0.1 only");
        }
        assert_eq!(bind_error(v4(18080)), Some(std::io::ErrorKind::AddrInUse));
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_taken_mac_port_moves_to_the_next_free_one() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let foreign = std::net::TcpListener::bind(v4(18080)).unwrap();
        foreign.set_nonblocking(true).unwrap();
        let registry = Registry::new(control.clone());
        let result = registry.forward(&conn.host, 18080);
        println!("E2E 127.0.0.1:18080 taken by a foreign listener; forward -> {result:?}");
        println!("E2E GET 127.0.0.1:18081 -> {:?}", page(18081));
        let _probe = TcpStream::connect(v4(18080)).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let foreign_alive = foreign.accept().is_ok();
        println!("E2E foreign listener still accepts on 18080: {foreign_alive}");
        assert_eq!(result.map(|f| f.local_port), Ok(18081));
        assert_eq!(page(18081), "server page 18080");
        assert!(foreign_alive);
        registry.stop(&conn.host, 18080).unwrap();
        drop(foreign);

        match std::net::TcpListener::bind(v6(18080)) {
            Ok(only_v6) => {
                let result = registry.forward(&conn.host, 18080);
                println!(
                    "E2E [::1]:18080 taken (127.0.0.1:18080 free); forward -> {result:?}; GET [::1]:18081 -> {:?}",
                    page_at(v6(18081))
                );
                assert_eq!(result.map(|f| f.local_port), Ok(18081));
                assert_eq!(page_at(v6(18081)), "server page 18080");
                drop(only_v6);
            }
            Err(e) => println!("E2E no IPv6 loopback here ({e}); [::1] case skipped"),
        }
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_list_is_ordered_and_stop_frees_the_mac_port() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _a = ServerPage::start(18080);
        let _b = ServerPage::start(18090);
        let registry = Registry::new(control.clone());
        registry.forward(&conn.host, 18090).unwrap();
        registry.forward(&conn.host, 18080).unwrap();
        let before = registry.list(&conn.host).unwrap();
        println!("E2E list -> {before:?}");
        let stopped = registry.stop(&conn.host, 18080);
        let after = registry.list(&conn.host).unwrap();
        println!(
            "E2E stop 18080 -> {stopped:?}; list -> {after:?}; 127.0.0.1:18080 refuses: {}; [::1]:18080 refuses: {}",
            refuses(v4(18080)),
            refuses(v6(18080))
        );
        let rebind = (bind_error(v4(18080)), bind_error(v6(18080)));
        println!("E2E bind after stop (127.0.0.1, [::1]) -> errors {rebind:?}");
        let unknown = registry.stop(&conn.host, 12345);
        println!("E2E stop 12345 (never forwarded) -> {unknown:?}");
        println!("E2E GET 127.0.0.1:18090 -> {:?}", page(18090));
        let ports: Vec<u16> = before.iter().map(|f| f.remote_port).collect();
        assert_eq!(ports, [18080, 18090]);
        assert_eq!(stopped, Ok(()));
        assert_eq!(after.iter().map(|f| f.remote_port).collect::<Vec<_>>(), [18090]);
        assert!(refuses(v4(18080)));
        assert_eq!(rebind.0, None);
        if has_ipv6_loopback() {
            assert!(refuses(v6(18080)));
            assert_eq!(rebind.1, None);
        }
        assert_eq!(unknown, Ok(()));
        assert_eq!(page(18090), "server page 18090");
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_without_a_connection_forward_fails() {
        let control = ssh::control_args();
        let host = host();
        let _ = Command::new("ssh")
            .args(&control)
            .args(["-O", "exit", &host])
            .stderr(Stdio::null())
            .status();
        let registry = Registry::new(control);
        let result = registry.forward(&host, 18080);
        let list = registry.list(&host);
        println!("E2E no master: forward -> {result:?}; list -> {list:?}");
        assert_eq!(result, Err(format!("not connected to {host}")));
        assert_eq!(list, Ok(Vec::new()));
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_master_end_marks_forwards_disconnected_until_forwarded_again() {
        let control = ssh::control_args();
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let first = Connection::open(&control, None, "sleep 600");
        let host = first.host.clone();
        let old_pid = first.pid();
        println!("E2E forward on master {old_pid:?} -> {:?}", registry.forward(&host, 18080));
        drop(first);
        assert!(wait_until(Duration::from_secs(5), || {
            ssh::master_pid_at(&control, &host).is_none()
        }));
        let after_end = registry.list(&host).unwrap();
        println!("E2E master ended; list -> {after_end:?}");
        let second = Connection::open(&control, None, "sleep 600");
        let after_reconnect = registry.list(&host).unwrap();
        println!("E2E new master {:?}; list -> {after_reconnect:?}", second.pid());
        let again = registry.forward(&host, 18080);
        println!("E2E forward again -> {again:?}; GET -> {:?}", page(18080));
        assert_eq!(after_end[0].status, ForwardStatus::Disconnected);
        assert_eq!(after_reconnect[0].status, ForwardStatus::Disconnected);
        assert_eq!(again.map(|f| f.status), Ok(ForwardStatus::Active));
        assert_eq!(page(18080), "server page 18080");
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_forward_keeps_the_connection_after_the_last_session_ends() {
        const PERSIST: u64 = 3;
        let control = ssh::control_args();
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let mut conn = Connection::open(&control, Some(&PERSIST.to_string()), "sleep 2");
        let host = conn.host.clone();
        let pid = conn.pid();
        println!(
            "E2E master {pid:?} with ControlPersist={PERSIST}s; forward -> {:?}",
            registry.forward(&host, 18080)
        );
        let _ = conn.terminal.wait();
        let ended = Instant::now();
        println!("E2E terminal session ended");
        // Every -O check is a mux client and restarts the persist timer: probe once.
        std::thread::sleep(Duration::from_secs(2 * PERSIST + 1));
        let held = ssh::master_pid_at(&control, &host);
        println!(
            "E2E {:?}s after the session ended: master {held:?}; GET -> {:?}",
            ended.elapsed().as_secs(),
            page(18080)
        );
        assert_eq!(held, pid);
        assert_eq!(page(18080), "server page 18080");
        registry.stop(&host, 18080).unwrap();
        let stopped = Instant::now();
        std::thread::sleep(Duration::from_secs(PERSIST + 2));
        let after_stop = ssh::master_pid_at(&control, &host);
        println!(
            "E2E {:?}s after stopping the last forward: master {after_stop:?}",
            stopped.elapsed().as_secs()
        );
        assert_eq!(after_stop, None);
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_disconnect_all_ends_a_connection_held_by_a_forward() {
        let control = ssh::control_args();
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let mut conn = Connection::open(&control, None, "sleep 1");
        let host = conn.host.clone();
        println!("E2E forward -> {:?}", registry.forward(&host, 18080));
        let _ = conn.terminal.wait();
        println!("E2E terminal ended; master {:?}; GET -> {:?}", conn.pid(), page(18080));
        let holder = holder_pid(&registry, &host);
        ssh::disconnect_all();
        let gone = wait_until(Duration::from_secs(5), || {
            ssh::master_pid_at(&control, &host).is_none()
        });
        let holder_ended = wait_until(Duration::from_secs(5), || {
            holder_pid(&registry, &host).is_none()
        });
        let fresh = Registry::new(control.clone()).list(&host);
        println!(
            "E2E after disconnect_all: master gone {gone}; holder {holder:?} ended {holder_ended}; 127.0.0.1:18080 refuses {}; [::1]:18080 refuses {}; fresh registry lists {fresh:?}",
            refuses(v4(18080)),
            refuses(v6(18080))
        );
        assert!(holder.is_some());
        assert!(gone);
        assert!(holder_ended);
        assert!(refuses(v4(18080)));
        if has_ipv6_loopback() {
            assert!(refuses(v6(18080)));
        }
        assert_eq!(fresh, Ok(Vec::new()));
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_two_control_dirs_get_their_own_mac_ports() {
        let installed = ssh::control_args();
        let variant: Vec<String> = installed
            .iter()
            .map(|a| a.replace("/ssh-control/", "/ssh-control-dev/"))
            .collect();
        let dir = dirs::home_dir().unwrap().join(".terax").join("ssh-control-dev");
        std::fs::create_dir_all(&dir).unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let _page = ServerPage::start(18080);
        let a = Connection::open(&installed, None, "sleep 600");
        let b = Connection::open(&variant, None, "sleep 600");
        let host = a.host.clone();
        println!("E2E masters: installed {:?}, variant {:?}", a.pid(), b.pid());
        let reg_a = Registry::new(installed.clone());
        let reg_b = Registry::new(variant.clone());
        let fa = reg_a.forward(&host, 18080);
        let fb = reg_b.forward(&host, 18080);
        println!("E2E installed -> {fa:?}; variant -> {fb:?}");
        reg_a.stop(&host, 18080).unwrap();
        println!(
            "E2E installed stopped: 18080 refuses {}; variant GET 18081 -> {:?}; variant list -> {:?}",
            refuses(v4(18080)),
            page(18081),
            reg_b.list(&host)
        );
        assert_eq!(fa.map(|f| f.local_port), Ok(18080));
        assert_eq!(fb.map(|f| f.local_port), Ok(18081));
        assert!(refuses(v4(18080)));
        assert_eq!(page(18081), "server page 18080");
        drop(b);
        drop(a);
    }

    fn sshd_logins() -> usize {
        let log =
            std::env::var("TERAX_E2E_SSHD_LOG").unwrap_or_else(|_| "/var/log/sshd.log".into());
        let out = on_server(&format!("grep -c 'Accepted publickey' {log}"))
            .output()
            .expect("count sshd logins");
        String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse()
            .unwrap_or_else(|_| panic!("sshd log {log} not readable: {out:?}"))
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_the_holder_never_opens_a_connection_of_its_own() {
        let control = ssh::control_args();
        let host = host();
        let _ = Command::new("ssh")
            .args(&control)
            .args(["-O", "exit", &host])
            .stderr(Stdio::null())
            .status();
        assert!(wait_until(Duration::from_secs(5), || {
            ssh::master_pid_at(&control, &host).is_none()
        }));
        let before = sshd_logins();
        let started = Instant::now();
        let result = Holder::spawn(&control, &host, 1).map(|_| ());
        let took = started.elapsed();
        let after = sshd_logins();
        println!(
            "E2E no master: holder -> {result:?} in {took:?}; sshd logins {before} -> {after} (the second count is one login itself)"
        );
        assert!(result.is_err());
        assert_eq!(after, before + 1);
        assert_eq!(ssh::master_pid_at(&control, &host), None);
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_a_refused_holder_session_fails_the_forward() {
        let host = env_alias("TERAX_E2E_HOST_ONE_SESSION");
        let control = ssh::control_args();
        let conn = Connection::open_to(&host, &control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let result = registry.forward(&host, 18080);
        let list = registry.list(&host);
        println!(
            "E2E MaxSessions 1, one terminal on master {:?}: forward -> {result:?}; list -> {list:?}; 127.0.0.1:18080 refuses {}; [::1]:18080 refuses {}",
            conn.pid(),
            refuses(v4(18080)),
            refuses(v6(18080))
        );
        let err = result.unwrap_err();
        assert!(err.starts_with(&format!("could not keep the connection to {host} open: ")));
        assert_eq!(list, Ok(Vec::new()));
        assert!(refuses(v4(18080)));
        if has_ipv6_loopback() {
            assert!(refuses(v6(18080)));
        }
        assert_eq!(holder_pid(&registry, &host), None);
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_list_restarts_a_holder_that_ended() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        registry.forward(&conn.host, 18080).unwrap();
        let first = holder_pid(&registry, &conn.host);
        {
            let slot = registry.slot(&conn.host).unwrap();
            let mut entry = lock_host(&slot);
            let holder = entry.holder.as_mut().unwrap();
            let _ = holder.child.kill();
            let _ = holder.child.wait();
        }
        let ended = holder_pid(&registry, &conn.host);
        let list = registry.list(&conn.host);
        let second = holder_pid(&registry, &conn.host);
        println!(
            "E2E holder {first:?} killed (running: {ended:?}); list -> {list:?}; holder now {second:?}; GET -> {:?}",
            page(18080)
        );
        assert!(first.is_some());
        assert_eq!(ended, None);
        assert_eq!(list.map(|l| l[0].status), Ok(ForwardStatus::Active));
        assert!(second.is_some() && second != first);
        assert_eq!(page(18080), "server page 18080");
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_a_wedged_master_blocks_only_its_own_host() {
        let control = ssh::control_args();
        let other = env_alias("TERAX_E2E_HOST_B");
        let a = Connection::open(&control, None, "sleep 600");
        let b = Connection::open_to(&other, &control, None, "sleep 600");
        let _p = ServerPage::start(18080);
        let _q = ServerPage::start(18090);
        let registry = Arc::new(Registry::new(control.clone()));
        registry.forward(&a.host, 18080).unwrap();
        registry.forward(&other, 18090).unwrap();
        let wedged = a.pid().expect("master pid");
        assert!(b.pid().is_some_and(|pid| pid != wedged));
        let signal = |sig: &str| {
            Command::new("kill")
                .args([sig, &wedged.to_string()])
                .status()
                .expect("kill");
        };
        signal("-STOP");
        let started = Instant::now();
        let slow = {
            let registry = Arc::clone(&registry);
            let host = a.host.clone();
            std::thread::spawn(move || {
                let list = registry.list(&host);
                (list, started.elapsed())
            })
        };
        std::thread::sleep(Duration::from_millis(300));
        let quick_start = Instant::now();
        let quick = registry.list(&other);
        let quick_took = quick_start.elapsed();
        let (slow_list, slow_took) = slow.join().unwrap();
        signal("-CONT");
        println!(
            "E2E master {wedged} stopped: list({}) -> {slow_list:?} after {slow_took:?}; list({other}) -> {quick:?} after {quick_took:?}",
            a.host
        );
        assert!(quick_took < Duration::from_secs(3));
        assert_eq!(quick.map(|l| l[0].status), Ok(ForwardStatus::Active));
        assert!(slow_took < MUX_TIMEOUT + Duration::from_secs(3));
        assert_eq!(slow_list.map(|l| l[0].status), Ok(ForwardStatus::Disconnected));
    }
}
