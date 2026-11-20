//! Server ports forwarded to this machine over the host's shared ControlMaster
//! (`ssh -O forward`), bound to 127.0.0.1 only. Forwards live in memory and die
//! with the master that holds them. A waiting forward does not count as a client
//! for ControlPersist, so a holder session keeps the master open while it has one.

#![cfg_attr(not(unix), allow(dead_code))]

use crate::modules::ssh;
use std::collections::{BTreeMap, HashMap};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Duration;

const BIND_ADDRESS: &str = "127.0.0.1";
const HOLDER_COMMAND: &str = "cat >/dev/null";
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

fn no_free_port(from: u16) -> String {
    format!("no free port on this Mac from {from}")
}

fn forward_spec(local: u16, remote: u16) -> String {
    format!("{BIND_ADDRESS}:{local}:localhost:{remote}")
}

/// `ssh -O forward|cancel` against the control socket; never opens a connection.
fn mux_args(control: &[String], op: &str, local: u16, remote: u16, host: &str) -> Vec<String> {
    let mut args = vec!["-o".to_string(), "BatchMode=yes".to_string()];
    args.extend(control.iter().cloned());
    args.extend([
        "-O".to_string(),
        op.to_string(),
        "-L".to_string(),
        forward_spec(local, remote),
        host.to_string(),
    ]);
    args
}

/// A session on the master that waits for its stdin to close. ssh keeps the
/// first value of an option, so `ControlMaster=no` has to precede `control`.
fn holder_args(control: &[String], host: &str) -> Vec<String> {
    let mut args: Vec<String> = [
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ControlMaster=no",
    ]
    .map(String::from)
    .into();
    args.extend(control.iter().cloned());
    args.push(host.to_string());
    args.push(HOLDER_COMMAND.to_string());
    args
}

/// Free means free on both loopbacks: WebKit may try `[::1]` first for `localhost`.
fn port_free(port: u16, occupied: impl Fn(SocketAddr) -> bool) -> bool {
    [
        SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        SocketAddr::from((Ipv6Addr::LOCALHOST, port)),
    ]
    .into_iter()
    .all(|addr| !occupied(addr))
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

fn run_ssh(args: &[String]) -> Result<(Option<i32>, String), String> {
    use std::io::Read;
    let mut cmd = Command::new("ssh");
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    let child = std::sync::Arc::new(
        shared_child::SharedChild::spawn(&mut cmd).map_err(|e| format!("ssh spawn failed: {e}"))?,
    );
    let stderr = child.take_stderr().ok_or("no ssh stderr")?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stderr.take(64 * 1024).read_to_end(&mut buf);
        String::from_utf8_lossy(&buf).into_owned()
    });
    let status = ssh::wait_child(&child, Some(MUX_TIMEOUT))?.ok_or_else(|| {
        format!("ssh -O did not answer within {}s and was killed", MUX_TIMEOUT.as_secs())
    })?;
    Ok((status.code(), reader.join().unwrap_or_default()))
}

struct Forward {
    local_port: u16,
    master_pid: u32,
}

/// Dropping it closes the session's stdin and ends it; a crashed Terax closes
/// that pipe too, so the master then ends after ControlPersist.
struct Holder {
    child: Child,
    master_pid: u32,
}

impl Holder {
    fn spawn(control: &[String], host: &str, master_pid: u32) -> Result<Self, String> {
        let mut cmd = Command::new("ssh");
        cmd.args(holder_args(control, host))
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        crate::modules::proc::hide_console(&mut cmd);
        let child = cmd
            .spawn()
            .map_err(|e| format!("could not keep the connection to {host} open: {e}"))?;
        Ok(Self { child, master_pid })
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
        self.holder = Some(Holder::spawn(control, host, live)?);
        Ok(())
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

/// Forwards per host for one control dir. Calls are serialized: each is a few
/// local-socket round trips.
pub struct Registry {
    control: Vec<String>,
    hosts: Mutex<HashMap<String, HostForwards>>,
}

fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(|| Registry::new(ssh::control_args()))
}

impl Registry {
    pub fn new(control: Vec<String>) -> Self {
        Self {
            control,
            hosts: Mutex::new(HashMap::new()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, HostForwards>> {
        self.hosts.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn mux(
        &self,
        op: &str,
        local: u16,
        remote: u16,
        host: &str,
    ) -> Result<(Option<i32>, String), String> {
        run_ssh(&mux_args(&self.control, op, local, remote, host))
    }

    pub fn forward(&self, host: &str, remote: u16) -> Result<PortForward, String> {
        validate_request(host, u32::from(remote))?;
        let mut hosts = self.lock();
        let live = ssh::master_pid_at(&self.control, host).ok_or_else(|| not_connected(host))?;
        if let Some(existing) = hosts.get(host).and_then(|entry| entry.forwards.get(&remote)) {
            if existing.master_pid == live {
                return Ok(PortForward {
                    remote_port: remote,
                    local_port: existing.local_port,
                    status: ForwardStatus::Active,
                });
            }
        }
        // So that quitting Terax (disconnect_all) ends the master holding the forward.
        ssh::note_connected_host(host);
        let local = bind_first_free(
            remote,
            |port| port_free(port, occupied_on_this_machine),
            |port| match self.mux("forward", port, remote, host) {
                Ok((code, stderr)) => forward_outcome(code, &stderr, host),
                Err(e) => Err(BindError::Failed(e)),
            },
        )?;
        let entry = hosts.entry(host.to_string()).or_default();
        entry.forwards.insert(
            remote,
            Forward {
                local_port: local,
                master_pid: live,
            },
        );
        if let Err(e) = entry.keep_open(&self.control, host, live) {
            entry.forwards.remove(&remote);
            entry.release_idle_holder();
            if entry.forwards.is_empty() {
                hosts.remove(host);
            }
            let _ = self.mux("cancel", local, remote, host);
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
        let mut hosts = self.lock();
        let Some(entry) = hosts.get_mut(host) else {
            return Ok(());
        };
        let Some(forward) = entry.forwards.get(&remote) else {
            return Ok(());
        };
        if ssh::master_pid_at(&self.control, host) == Some(forward.master_pid) {
            let (code, stderr) = self.mux("cancel", forward.local_port, remote, host)?;
            cancel_outcome(code, &stderr)?;
        }
        entry.forwards.remove(&remote);
        entry.release_idle_holder();
        if entry.forwards.is_empty() {
            hosts.remove(host);
        }
        Ok(())
    }

    pub fn list(&self, host: &str) -> Result<Vec<PortForward>, String> {
        ssh::validate_ssh_host(host)?;
        let mut hosts = self.lock();
        let Some(entry) = hosts.get_mut(host) else {
            return Ok(Vec::new());
        };
        let live = ssh::master_pid_at(&self.control, host);
        if entry.holder.as_ref().is_some_and(|h| Some(h.master_pid) != live) {
            entry.holder = None;
        }
        Ok(entry.view(live))
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
    fn a_port_counts_as_free_only_when_free_on_both_loopbacks() {
        let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, 3000));
        let v6 = SocketAddr::from((Ipv6Addr::LOCALHOST, 3000));
        let taken = |set: Vec<SocketAddr>| move |addr: SocketAddr| set.contains(&addr);
        assert!(port_free(3000, taken(vec![])));
        assert!(!port_free(3000, taken(vec![v4])));
        assert!(!port_free(3000, taken(vec![v6])));
        assert!(port_free(3001, taken(vec![v4, v6])));
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
    fn forwards_bind_loopback_explicitly_and_target_server_localhost() {
        let args = mux_args(&control(), "forward", 18081, 18080, "devbox");
        let tail = &args[args.len() - 5..];
        assert_eq!(
            tail,
            ["-O", "forward", "-L", "127.0.0.1:18081:localhost:18080", "devbox"]
        );
        assert_eq!(&args[..2], ["-o", "BatchMode=yes"]);
        assert!(args.contains(&"ControlPath=/c/%C".to_string()));
        let cancel = mux_args(&control(), "cancel", 18081, 18080, "devbox");
        assert_eq!(cancel[cancel.len() - 4], "cancel");
    }

    #[test]
    fn the_holder_never_prompts_and_never_becomes_a_master() {
        let args = holder_args(&control(), "devbox");
        let pos = |needle: &str| args.iter().position(|a| a == needle).unwrap();
        assert!(pos("BatchMode=yes") < pos("ControlPath=/c/%C"));
        assert!(pos("ControlMaster=no") < pos("ControlMaster=auto"));
        assert_eq!(&args[args.len() - 2..], ["devbox", HOLDER_COMMAND]);
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
    }
}

/// Real runs against an sshd; ignored in the normal suite. Start with
/// `TERAX_E2E_HOST=<ssh alias> cargo test --lib ports::e2e -- --ignored --test-threads=1 --nocapture`
/// (key auth without prompts, python3 on the server, server ports 18080/18090 and
/// local ports 18080 to 18082 free).
#[cfg(all(test, unix))]
mod e2e {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Instant;

    fn host() -> String {
        std::env::var("TERAX_E2E_HOST")
            .expect("TERAX_E2E_HOST names an ssh alias with a reachable sshd")
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
            let host = host();
            let mut cmd = Command::new("ssh");
            cmd.arg("-tt");
            if let Some(persist) = persist {
                cmd.arg("-o").arg(format!("ControlPersist={persist}"));
            }
            let terminal = cmd
                .args(control)
                .arg(&host)
                .arg(remote)
                .env("TERM", "xterm")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn ssh -tt");
            assert!(
                wait_until(Duration::from_secs(10), || {
                    ssh::master_pid_at(control, &host).is_some()
                }),
                "master to {host} did not come up"
            );
            Self {
                control: control.to_vec(),
                host,
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

    /// `python3 -m http.server` on the server's loopback, over its own connection
    /// (no ControlPath), so it never counts as a client of the master under test.
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
                    Command::new("ssh")
                        .args(["-o", "BatchMode=yes", "-o", "ControlPath=none", &host, &probe])
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

    fn get(port: u16) -> Result<String, String> {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
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

    fn refuses(addr: SocketAddr) -> bool {
        matches!(
            TcpStream::connect_timeout(&addr, Duration::from_secs(1)),
            Err(e) if e.kind() == std::io::ErrorKind::ConnectionRefused
        )
    }

    fn page(port: u16) -> String {
        get(port).unwrap_or_else(|e| format!("error: {e}"))
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

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_forward_loads_the_page_on_loopback_only() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let registry = Registry::new(control.clone());
        let first = registry.forward(&conn.host, 18080);
        println!("E2E forward 18080 -> {first:?}");
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
        let v6 = SocketAddr::from((Ipv6Addr::LOCALHOST, 18080));
        let lan = SocketAddr::new(outward, 18080);
        println!("E2E ssh -G: {gateway}");
        println!("E2E {lan} refuses: {}; {v6} refuses: {}", refuses(lan), refuses(v6));
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
    }

    #[test]
    #[ignore = "needs an sshd, see the module comment"]
    fn e2e_taken_mac_port_moves_to_the_next_free_one() {
        let control = ssh::control_args();
        let conn = Connection::open(&control, None, "sleep 600");
        let _page = ServerPage::start(18080);
        let foreign = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 18080)).unwrap();
        foreign.set_nonblocking(true).unwrap();
        let registry = Registry::new(control.clone());
        let result = registry.forward(&conn.host, 18080);
        println!("E2E 127.0.0.1:18080 taken by a foreign listener; forward -> {result:?}");
        println!("E2E GET 127.0.0.1:18081 -> {:?}", page(18081));
        let _probe = TcpStream::connect((Ipv4Addr::LOCALHOST, 18080)).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let foreign_alive = foreign.accept().is_ok();
        println!("E2E foreign listener still accepts on 18080: {foreign_alive}");
        assert_eq!(result.map(|f| f.local_port), Ok(18081));
        assert_eq!(page(18081), "server page 18080");
        assert!(foreign_alive);
        registry.stop(&conn.host, 18080).unwrap();
        drop(foreign);

        match std::net::TcpListener::bind((Ipv6Addr::LOCALHOST, 18080)) {
            Ok(only_v6) => {
                let result = registry.forward(&conn.host, 18080);
                println!("E2E [::1]:18080 taken (127.0.0.1:18080 free); forward -> {result:?}");
                assert_eq!(result.map(|f| f.local_port), Ok(18081));
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
        let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, 18080));
        println!(
            "E2E stop 18080 -> {stopped:?}; list -> {after:?}; 127.0.0.1:18080 refuses: {}",
            refuses(v4)
        );
        let unknown = registry.stop(&conn.host, 12345);
        println!("E2E stop 12345 (never forwarded) -> {unknown:?}");
        println!("E2E GET 127.0.0.1:18090 -> {:?}", page(18090));
        let ports: Vec<u16> = before.iter().map(|f| f.remote_port).collect();
        assert_eq!(ports, [18080, 18090]);
        assert_eq!(stopped, Ok(()));
        assert_eq!(after.iter().map(|f| f.remote_port).collect::<Vec<_>>(), [18090]);
        assert!(refuses(v4));
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
        ssh::disconnect_all();
        let gone = wait_until(Duration::from_secs(5), || {
            ssh::master_pid_at(&control, &host).is_none()
        });
        let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, 18080));
        let holder_ended = wait_until(Duration::from_secs(5), || {
            let mut hosts = registry.lock();
            let entry = hosts.get_mut(&host).unwrap();
            !entry.holder.as_mut().unwrap().running()
        });
        let fresh = Registry::new(control.clone()).list(&host);
        println!(
            "E2E after disconnect_all: master gone {gone}; holder ended {holder_ended}; 127.0.0.1:18080 refuses {}; fresh registry lists {fresh:?}",
            refuses(v4)
        );
        assert!(gone);
        assert!(holder_ended);
        assert!(refuses(v4));
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
        let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, 18080));
        println!(
            "E2E installed stopped: 18080 refuses {}; variant GET 18081 -> {:?}; variant list -> {:?}",
            refuses(v4),
            page(18081),
            reg_b.list(&host)
        );
        assert_eq!(fa.map(|f| f.local_port), Ok(18080));
        assert_eq!(fb.map(|f| f.local_port), Ok(18081));
        assert!(refuses(v4));
        assert_eq!(page(18081), "server page 18080");
        drop(b);
        drop(a);
    }
}
