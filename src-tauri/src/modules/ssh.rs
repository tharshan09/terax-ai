//! Minimal SSH support for remote workspaces.
//!
//! The transport is the system `ssh` binary — no Rust SSH crate — so auth
//! flows entirely through the user's existing `~/.ssh/config`, ssh-agent and
//! `known_hosts`. This module (1) enumerates connectable hosts from
//! `~/.ssh/config`, (2) supplies the OpenSSH connection-multiplexing args
//! shared by the remote terminal and these FS ops, and (3) runs a small
//! embedded `python3` helper on the host for structured filesystem access.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshHost {
    pub host: String,
    pub host_name: Option<String>,
    pub user: Option<String>,
}

/// List `Host` aliases from `~/.ssh/config`. Wildcard / negated patterns are
/// skipped — they're matching rules, not connectable hosts. Returns an empty
/// list when there's no config (never an error: an absent config is normal).
#[tauri::command]
pub fn ssh_list_hosts() -> Vec<SshHost> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    match std::fs::read_to_string(home.join(".ssh").join("config")) {
        Ok(content) => parse_ssh_hosts(&content),
        Err(_) => Vec::new(),
    }
}

fn parse_ssh_hosts(content: &str) -> Vec<SshHost> {
    let mut hosts: Vec<SshHost> = Vec::new();
    // Indices into `hosts` for the aliases the current `Host` line declared, so
    // a following HostName / User applies to all of them.
    let mut current: Vec<usize> = Vec::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").to_ascii_lowercase();
        let val = parts.next().unwrap_or("").trim();
        match key.as_str() {
            "host" => {
                current.clear();
                for pat in val.split_whitespace() {
                    if pat.contains('*') || pat.contains('?') || pat.starts_with('!') {
                        continue;
                    }
                    current.push(hosts.len());
                    hosts.push(SshHost {
                        host: pat.to_string(),
                        host_name: None,
                        user: None,
                    });
                }
            }
            "hostname" if !val.is_empty() => {
                for &i in &current {
                    hosts[i].host_name = Some(val.to_string());
                }
            }
            "user" if !val.is_empty() => {
                for &i in &current {
                    hosts[i].user = Some(val.to_string());
                }
            }
            _ => {}
        }
    }
    hosts
}

/// Reject hosts that could inject `ssh` options or break argument parsing.
/// Aliases come from our own config parse today, but callers may pass arbitrary
/// strings later, so this stays the single chokepoint.
pub fn validate_ssh_host(host: &str) -> Result<(), String> {
    if host.is_empty() || host.starts_with('-') {
        return Err(format!("invalid ssh host: {host:?}"));
    }
    if host.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(format!("invalid ssh host: {host:?}"));
    }
    Ok(())
}

/// OpenSSH args enabling connection multiplexing so the terminal and filesystem
/// calls share one authenticated TCP session. Unix-only — the ControlMaster
/// socket has no Windows equivalent; elsewhere we just set the host-key policy.
pub fn control_args() -> Vec<String> {
    #[cfg(unix)]
    {
        let dir = control_dir();
        vec![
            // `ask`, not `accept-new`: the interactive terminal (ssh -tt)
            // prompts for an unknown host key in the PTY so the user verifies
            // the fingerprint. The BatchMode FS path then fails fast on an
            // unknown host instead of silently trusting it (closes the
            // MITM-on-first-connect window), reusing the key once the terminal
            // has accepted it.
            "-o".into(),
            "StrictHostKeyChecking=ask".into(),
            // Override any `RemoteCommand` set in ~/.ssh/config for this host —
            // otherwise our own remote command (the shell bootstrap / python
            // helper) collides with it ("Cannot execute command-line and
            // remote command").
            "-o".into(),
            "RemoteCommand=none".into(),
            // Keep idle connections alive. A background terminal tab whose
            // connection sits idle would otherwise be dropped by the server,
            // NAT or a firewall; ssh then exits and the tab is auto-closed
            // (handleLeafExit), looking as if the session "closed itself".
            // The remote tmux session survives regardless — this just stops
            // the local tab from disappearing. ~90s (3 × 30s) to detect a
            // genuinely dead link, without ever prompting.
            "-o".into(),
            "ServerAliveInterval=30".into(),
            "-o".into(),
            "ServerAliveCountMax=3".into(),
            "-o".into(),
            "ControlMaster=auto".into(),
            "-o".into(),
            "ControlPersist=10m".into(),
            "-o".into(),
            format!("ControlPath={}/%C", dir.display()),
        ]
    }
    #[cfg(not(unix))]
    {
        vec![
            // See the unix arm: `ask` so the terminal prompts for unknown hosts
            // rather than silently trusting them on first connect.
            "-o".into(),
            "StrictHostKeyChecking=ask".into(),
            "-o".into(),
            "RemoteCommand=none".into(),
            // See the unix arm: keep idle connections alive so a background
            // tab's connection isn't dropped (which would auto-close the tab).
            "-o".into(),
            "ServerAliveInterval=30".into(),
            "-o".into(),
            "ServerAliveCountMax=3".into(),
        ]
    }
}

/// `~/.terax/ssh-control`, created 0700 (it holds connection sockets). Falls
/// back to a temp dir when there's no home directory.
#[cfg(unix)]
fn control_dir() -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let dir = dirs::home_dir()
        .map(|h| h.join(".terax").join("ssh-control"))
        .unwrap_or_else(|| std::env::temp_dir().join("terax-ssh-control"));
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    dir
}

// Hosts we've opened a multiplexed connection to this session, so we can tear
// down their lingering ControlMaster sockets on quit (ControlPersist would
// otherwise keep them alive ~10min after the app exits).
static CONNECTED_HOSTS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
    std::sync::OnceLock::new();

fn connected_hosts() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    CONNECTED_HOSTS.get_or_init(|| std::sync::Mutex::new(std::collections::HashSet::new()))
}

/// Record that we've opened (or reused) a multiplexed connection to `host`.
/// Called from both the terminal spawn and the filesystem path.
pub fn note_connected_host(host: &str) {
    if let Ok(mut set) = connected_hosts().lock() {
        set.insert(host.to_string());
    }
}

/// Best-effort teardown of every ControlMaster opened this session. Called on
/// app exit so sockets don't linger for ControlPersist's lifetime. `-O exit`
/// only talks to the local control socket, so it returns promptly even when the
/// remote is unreachable.
pub fn disconnect_all() {
    let hosts: Vec<String> = match connected_hosts().lock() {
        Ok(set) => set.iter().cloned().collect(),
        Err(_) => return,
    };
    for host in hosts {
        if validate_ssh_host(&host).is_err() {
            continue;
        }
        let mut cmd = std::process::Command::new("ssh");
        for arg in control_args() {
            cmd.arg(arg);
        }
        cmd.arg("-O").arg("exit").arg(&host);
        let _ = cmd.output();
    }
}

// ---------------------------------------------------------------------------
// Remote filesystem over ssh
//
// Structured FS ops run a small embedded python3 helper on the remote host.
// The helper program is base64-encoded into the ssh command (`python3 -c
// "$(printf %s <b64> | base64 -d)"`) and the JSON request is streamed over
// stdin — so request size is unbounded (file writes of any length work) and
// there's no shell quoting/injection surface. Responses are a one-line
// `{"ok":bool,"data"|"error":…}` envelope. Connection reuse rides the
// terminal's ControlMaster socket. Requires `python3` on the host.
// ---------------------------------------------------------------------------

/// Embedded remote helper. Reads its JSON request from stdin; emits one JSON
/// envelope on stdout. Mirrors the local fs semantics (symlink-follow,
/// dirs-first sort, 10 MB read cap, atomic write) so callers are
/// local/remote-blind.
const REMOTE_PYTHON: &str = r#"import sys, os, json, tempfile, shutil, base64
from stat import S_ISDIR

MAX_READ = 10 * 1024 * 1024
MAX_ENTRIES = 100000
SEARCH_PRUNE = {"node_modules", ".git", "target", "dist", "build", ".next",
                ".turbo", ".cache", ".venv", "__pycache__"}
SEARCH_MAX_SCANNED = 500000
SEARCH_MAX_HITS = 2000
GREP_FILE_CAP = 5 * 1024 * 1024


def _utf8_ok(name):
    # os.scandir surrogate-escapes undecodable bytes; such names can't round-trip
    # through JSON and would make serde reject the whole listing. Drop them, like
    # the local read_dir drops names that fail to_str().
    try:
        name.encode("utf-8")
        return True
    except UnicodeEncodeError:
        return False


def _entry(e):
    try:
        st = e.stat(follow_symlinks=True)
        kind = "dir" if e.is_dir(follow_symlinks=True) else "file"
    except OSError:
        try:
            st = e.stat(follow_symlinks=False)
        except OSError:
            return None
        kind = "symlink"
    return {"name": e.name, "kind": kind, "size": st.st_size,
            "mtime": int(st.st_mtime * 1000), "gitignored": False}


def read_dir(req):
    path = os.path.expanduser(req["path"]); show_hidden = req.get("showHidden", False)
    out = []
    with os.scandir(path) as it:
        for e in it:
            if e.name.startswith(".") and not show_hidden:
                continue
            if not _utf8_ok(e.name):
                continue
            ent = _entry(e)
            if ent is not None:
                out.append(ent)
            if len(out) >= MAX_ENTRIES:  # bound host memory + response size
                break
    rank = {"dir": 0, "symlink": 1, "file": 2}
    out.sort(key=lambda x: (rank[x["kind"]], x["name"].lower()))
    return out


def list_subdirs(req):
    path = os.path.expanduser(req["path"]); show_hidden = req.get("showHidden", False)
    out = []
    with os.scandir(path) as it:
        for e in it:
            if e.name.startswith(".") and not show_hidden:
                continue
            if not _utf8_ok(e.name):
                continue
            try:
                if e.is_dir(follow_symlinks=True):
                    out.append(e.name)
            except OSError:
                pass
    out.sort(key=str.lower)
    return out


def stat(req):
    path = os.path.expanduser(req["path"])
    st = os.stat(path, follow_symlinks=True)
    kind = "dir" if os.path.isdir(path) else "file"
    return {"size": st.st_size, "mtime": int(st.st_mtime * 1000), "kind": kind}


def realpath(req):
    # Resolve symlinks host-side. canonicalize-then-recheck guards depend on
    # seeing the real target; without this op they were a no-op over SSH.
    return os.path.realpath(os.path.expanduser(req["path"]))


def read_file(req):
    path = os.path.expanduser(req["path"]); limit = req.get("limit", MAX_READ)
    size = os.stat(path).st_size
    if size > limit:
        return {"kind": "toolarge", "size": size, "limit": limit}
    with open(path, "rb") as f:
        data = f.read()
    if b"\x00" in data[:8192]:
        return {"kind": "binary", "size": size}
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError:
        return {"kind": "binary", "size": size}
    return {"kind": "text", "content": content, "size": size}


def write_file(req):
    path = os.path.expanduser(req["path"]); content = req["content"]
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        try:
            os.chmod(tmp, os.stat(path).st_mode)
        except OSError:
            # New file: mkstemp created it 0600. Use the normal default (0666
            # minus the umask, typically 0644) so a freshly-saved remote file
            # isn't locked to owner-only.
            umask = os.umask(0)
            os.umask(umask)
            os.chmod(tmp, 0o666 & ~umask)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return True


def create_file(req):
    path = os.path.expanduser(req["path"])
    if os.path.lexists(path):
        raise FileExistsError("already exists: " + path)
    # O_EXCL is the real atomic gate (the check above is just for a clean error);
    # normalize the race-window failure to the same message.
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        raise FileExistsError("already exists: " + path)
    os.close(fd)
    return True


def create_dir(req):
    path = os.path.expanduser(req["path"])
    if os.path.exists(path):
        raise FileExistsError("already exists: " + path)
    # Parents are created as needed (mirrors local create_dir_all + exists check).
    os.makedirs(path, exist_ok=False)
    return True


def rename(req):
    src = os.path.expanduser(req["from"]); dst = os.path.expanduser(req["to"])
    if not os.path.lexists(src):
        raise FileNotFoundError("not found: " + src)
    # lexists so a symlink (even dangling) at the destination is never silently
    # clobbered — os.rename would otherwise replace it.
    if os.path.lexists(dst):
        raise FileExistsError("already exists: " + dst)
    os.rename(src, dst)
    return True


def delete(req):
    path = os.path.expanduser(req["path"])
    # lstat: a symlink to a directory must be unlinked, never recursed into.
    st = os.lstat(path)
    if S_ISDIR(st.st_mode):
        shutil.rmtree(path)
    else:
        os.remove(path)
    return True


def exists(req):
    return os.path.lexists(os.path.expanduser(req["path"]))


def write_bytes(req):
    # Binary-safe write for uploads: content arrives base64-encoded so arbitrary
    # bytes survive the JSON envelope. Atomic tmp+rename like write_file; refuses
    # to clobber (uploads never overwrite — matches local fs_copy).
    path = os.path.expanduser(req["path"]); data = base64.b64decode(req["b64"])
    mode = req.get("mode")
    if os.path.lexists(path):
        raise FileExistsError("already exists: " + path)
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=d)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        # chmod the temp BEFORE the rename so the file appears atomically with
        # its final mode (best-effort, no post-replace race). mkstemp made it
        # 0600; restore the source's perms when known.
        if mode is not None:
            try:
                os.chmod(tmp, mode)
            except OSError:
                pass
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return True


def _subseq(needle, hay):
    # Case-insensitive subsequence test: the coarse prefilter that mirrors
    # nucleo's fuzzy matchability. The Rust side re-ranks with the real matcher,
    # so this only decides which candidates cross the wire.
    it = iter(hay)
    return all(c in it for c in needle)


def search(req):
    root = os.path.expanduser(req["path"]); query = req.get("query", "").strip()
    show_hidden = req.get("showHidden", False); limit = req.get("limit", 200)
    if not query:
        return {"hits": [], "truncated": False}
    needle = query.lower()
    base = root.rstrip("/") + "/"
    hits = []; scanned = 0; truncated = False
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune heavy dirs + hidden dirs in place so os.walk doesn't descend.
        dirnames[:] = [d for d in dirnames if d not in SEARCH_PRUNE
                       and (show_hidden or not d.startswith("."))]
        entries = [(d, True) for d in dirnames] + [(f, False) for f in filenames]
        for name, is_dir in entries:
            if not show_hidden and name.startswith("."):
                continue
            scanned += 1
            if scanned > SEARCH_MAX_SCANNED:
                truncated = True; break
            full = os.path.join(dirpath, name)
            rel = full[len(base):] if full.startswith(base) else name
            if _subseq(needle, rel.lower()):
                hits.append({"path": full, "rel": rel, "name": name,
                             "is_dir": is_dir})
                if len(hits) >= SEARCH_MAX_HITS:
                    truncated = True; break
        if truncated:
            break
    return {"hits": hits, "truncated": truncated}


def grep(req):
    root = os.path.expanduser(req["path"]); pattern = req.get("pattern", "")
    show_hidden = req.get("showHidden", False); limit = req.get("limit", 200)
    if not pattern:
        return {"hits": [], "truncated": False, "files_scanned": 0}
    # Smart-case literal match, mirroring the local interactive grep (escaped
    # literal + case_smart): case-insensitive unless the pattern has uppercase.
    has_upper = any(c.isupper() for c in pattern)
    needle = pattern if has_upper else pattern.lower()
    base = root.rstrip("/") + "/"
    hits = []; scanned = 0; files = 0; truncated = False
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SEARCH_PRUNE
                       and (show_hidden or not d.startswith("."))]
        for name in filenames:
            if not show_hidden and name.startswith("."):
                continue
            scanned += 1
            if scanned > SEARCH_MAX_SCANNED:
                truncated = True; break
            full = os.path.join(dirpath, name)
            try:
                if os.path.getsize(full) > GREP_FILE_CAP:
                    continue
                with open(full, "rb") as f:
                    raw = f.read()
            except OSError:
                continue
            if b"\x00" in raw[:8192]:
                continue
            try:
                content = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue
            files += 1
            rel = full[len(base):] if full.startswith(base) else name
            for i, line in enumerate(content.split("\n"), 1):
                hay = line if has_upper else line.lower()
                if needle in hay:
                    hits.append({"path": full, "rel": rel, "line": i,
                                 "text": line[:500]})
                    if len(hits) >= limit:
                        truncated = True; break
            if truncated:
                break
        if truncated:
            break
    return {"hits": hits, "truncated": truncated, "files_scanned": files}


OPS = {"read_dir": read_dir, "list_subdirs": list_subdirs, "stat": stat,
       "realpath": realpath, "read_file": read_file, "write_file": write_file,
       "create_file": create_file, "create_dir": create_dir,
       "rename": rename, "delete": delete, "exists": exists,
       "write_bytes": write_bytes, "search": search, "grep": grep}


def main():
    try:
        req = json.loads(sys.stdin.read())
        data = OPS[req["op"]](req)
        out = json.dumps({"ok": True, "data": data})
    except Exception as ex:
        out = json.dumps({"ok": False, "error": str(ex)})
    # Prefix a sentinel so the caller can skip any login-shell banner/MOTD that
    # printed to stdout before us (exit code stays 0, so we can't rely on stderr).
    sys.stdout.write("__TERAX_JSON__" + out)


main()
"#;

/// Standard base64 (no line wrapping). Used to ship the helper program through
/// the ssh command line shell-safely; no crate dependency needed.
fn b64encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

/// Sentinel the remote helper prints right before its JSON envelope so we can
/// skip any login-shell banner/MOTD that landed on stdout first. Must match the
/// literal in REMOTE_PYTHON's `main`.
const TERAX_SENTINEL: &[u8] = b"__TERAX_JSON__";

/// Hard cap on one remote response. A pathological directory could otherwise
/// stream unbounded JSON and exhaust memory on this side.
const MAX_REMOTE_STDOUT: usize = 16 * 1024 * 1024;

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Drain `r` up to `cap` bytes; the bool reports truncation. Reading continues
/// past the cap (discarding) so the child never blocks on a full pipe.
fn read_capped<R: std::io::Read>(r: &mut R, cap: usize) -> (Vec<u8>, bool) {
    let mut out: Vec<u8> = Vec::new();
    let mut buf = [0u8; 64 * 1024];
    let mut truncated = false;
    loop {
        match r.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if out.len() < cap {
                    let take = (cap - out.len()).min(n);
                    out.extend_from_slice(&buf[..take]);
                    if take < n {
                        truncated = true;
                    }
                } else {
                    truncated = true;
                }
            }
            Err(_) => break,
        }
    }
    (out, truncated)
}

/// Map raw `ssh` stderr to a short, actionable message. Returns `None` to fall
/// back to the raw text. The FS path runs with `BatchMode=yes` (it must never
/// hang on a prompt), so on a passphrase/agentless host that hasn't been
/// connected yet it fails with "Permission denied (publickey)" — the fix is to
/// open the terminal first (it can prompt), which establishes the shared
/// ControlMaster the FS ops then ride.
fn classify_ssh_error(stderr: &str) -> Option<String> {
    let s = stderr.to_ascii_lowercase();
    if s.contains("permission denied")
        || s.contains("authentication failed")
        || s.contains("no such identity")
        || s.contains("too many authentication failures")
    {
        return Some(
            "SSH authentication failed — open a terminal to this host first so it can prompt for \
             your key passphrase, then retry."
                .to_string(),
        );
    }
    if s.contains("host key verification failed")
        || s.contains("remote host identification has changed")
    {
        return Some(
            "Host key verification failed — the server's key changed or isn't trusted. Resolve it \
             in a terminal (e.g. ssh-keygen -R <host>) and reconnect."
                .to_string(),
        );
    }
    if s.contains("could not resolve hostname")
        || s.contains("name or service not known")
        || s.contains("nodename nor servname")
    {
        return Some("Could not resolve the host — check the hostname in ~/.ssh/config.".to_string());
    }
    if s.contains("connection refused") {
        return Some(
            "Connection refused — the host isn't accepting SSH on that address/port.".to_string(),
        );
    }
    if s.contains("timed out") {
        return Some("Connection timed out — the host is unreachable.".to_string());
    }
    if s.contains("python3") && s.contains("not found") {
        return Some(
            "python3 isn't installed on the host — the remote file browser requires it.".to_string(),
        );
    }
    None
}

/// Run one remote FS op and return its `data` value (or the remote error).
fn run_remote_json(host: &str, request: &serde_json::Value) -> Result<serde_json::Value, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    validate_ssh_host(host)?;
    note_connected_host(host);
    let request_json = serde_json::to_string(request).map_err(|e| e.to_string())?;
    let b64 = b64encode(REMOTE_PYTHON.as_bytes());
    let remote_cmd = format!("python3 -c \"$(printf %s {b64} | base64 -d)\"");

    let mut cmd = Command::new("ssh");
    cmd.arg("-T")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=10");
    for arg in control_args() {
        cmd.arg(arg);
    }
    cmd.arg(host)
        .arg(remote_cmd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("ssh spawn failed: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no ssh stdin")?;
    let mut stdout = child.stdout.take().ok_or("no ssh stdout")?;
    let mut stderr = child.stderr.take().ok_or("no ssh stderr")?;

    // Write the request and drain both pipes on separate threads. The helper
    // reads all of stdin before emitting anything, but doing the I/O
    // concurrently avoids any pipe-buffer deadlock on large uploads.
    let req_bytes = request_json.into_bytes();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(&req_bytes);
        // Dropping stdin closes the pipe → EOF for the remote's sys.stdin.read().
    });
    let out_reader = std::thread::spawn(move || read_capped(&mut stdout, MAX_REMOTE_STDOUT));
    let err_reader = std::thread::spawn(move || read_capped(&mut stderr, 64 * 1024));

    let status = child.wait().map_err(|e| format!("ssh wait failed: {e}"))?;
    let _ = writer.join();
    let (stdout_bytes, overflow) = out_reader.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, _) = err_reader.join().unwrap_or((Vec::new(), false));

    if !status.success() {
        let err = String::from_utf8_lossy(&stderr_bytes);
        let err = err.trim();
        if let Some(msg) = classify_ssh_error(err) {
            return Err(msg);
        }
        return Err(if err.is_empty() {
            "ssh command failed".to_string()
        } else {
            format!("ssh: {err}")
        });
    }
    if overflow {
        return Err("remote response exceeded the 16 MiB limit".to_string());
    }
    // The embedded helper always prefixes its envelope with the sentinel, after
    // any login-shell banner/MOTD. Its absence means the helper never emitted a
    // response (crash, killed, or banner-only) — surface that clearly instead of
    // a misleading JSON parse error on the banner text.
    let json_bytes = match find_subslice(&stdout_bytes, TERAX_SENTINEL) {
        Some(i) => &stdout_bytes[i + TERAX_SENTINEL.len()..],
        None => {
            if stdout_bytes.is_empty() {
                return Err("no response from the remote helper".to_string());
            }
            let preview = String::from_utf8_lossy(&stdout_bytes[..stdout_bytes.len().min(200)]);
            return Err(format!(
                "unexpected remote output (no response marker): {}",
                preview.trim()
            ));
        }
    };
    let parsed: serde_json::Value =
        serde_json::from_slice(json_bytes).map_err(|e| format!("bad remote response: {e}"))?;
    if parsed.get("ok").and_then(serde_json::Value::as_bool) == Some(true) {
        Ok(parsed
            .get("data")
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    } else {
        Err(parsed
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown remote error")
            .to_string())
    }
}

// ---------------------------------------------------------------------------
// Generic remote command execution (text, no stdin)
//
// A lighter sibling of run_remote_json for cheap remote queries (e.g.
// `tmux list-sessions`): no request body, captures stdout/stderr, and reports
// the remote exit code so callers can interpret tool-specific "non-error"
// failures themselves. Rides the same ControlMaster socket.
// ---------------------------------------------------------------------------

/// Captured result of a remote command. `code` is the remote command's exit
/// status (ssh forwards it), or `None` when it was killed by a signal.
pub struct RemoteCapture {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// True if a multiplexed ControlMaster to `host` is live. Talks only to the
/// local control socket (`ssh -O check`), so it returns instantly and never
/// opens a fresh connection or prompts. Always false where ControlMaster is
/// unavailable (non-unix).
pub fn master_alive(host: &str) -> bool {
    if validate_ssh_host(host).is_err() {
        return false;
    }
    #[cfg(unix)]
    {
        let mut cmd = std::process::Command::new("ssh");
        for arg in control_args() {
            cmd.arg(arg);
        }
        cmd.arg("-O").arg("check").arg(host);
        crate::modules::proc::hide_console(&mut cmd);
        matches!(cmd.output(), Ok(out) if out.status.success())
    }
    #[cfg(not(unix))]
    {
        false
    }
}

/// Run `command` on `host` over the shared ControlMaster (BatchMode, no stdin),
/// capturing stdout/stderr. Returns `Err` only when ssh fails to spawn; a
/// non-zero remote exit is reported via [`RemoteCapture::code`] so the caller
/// decides whether it counts as an error (tmux's "no server", for one, does
/// not).
pub fn run_remote_capture(host: &str, command: &str) -> Result<RemoteCapture, String> {
    use std::process::{Command, Stdio};

    validate_ssh_host(host)?;
    note_connected_host(host);

    let mut cmd = Command::new("ssh");
    cmd.arg("-T")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=10")
        // Reuse-only: a background query must never spin up a fresh persistent
        // master. ssh takes the FIRST value of an option, so this has to precede
        // the ControlMaster=auto that control_args() supplies.
        .arg("-o")
        .arg("ControlMaster=no");
    for arg in control_args() {
        cmd.arg(arg);
    }
    cmd.arg(host)
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("ssh spawn failed: {e}"))?;
    let mut stdout = child.stdout.take().ok_or("no ssh stdout")?;
    let mut stderr = child.stderr.take().ok_or("no ssh stderr")?;
    let out_reader = std::thread::spawn(move || read_capped(&mut stdout, MAX_REMOTE_STDOUT));
    let err_reader = std::thread::spawn(move || read_capped(&mut stderr, 64 * 1024));

    let status = child.wait().map_err(|e| format!("ssh wait failed: {e}"))?;
    let (stdout_bytes, _) = out_reader.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, _) = err_reader.join().unwrap_or((Vec::new(), false));

    Ok(RemoteCapture {
        code: status.code(),
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
    })
}

/// Remote `fs_read_dir`. Returns the same [`DirEntry`](crate::modules::fs::tree::DirEntry)
/// shape as the local path, so the explorer doesn't know it's remote.
pub fn read_dir(
    host: &str,
    path: &str,
    show_hidden: bool,
) -> Result<Vec<crate::modules::fs::tree::DirEntry>, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "read_dir", "path": path, "showHidden": show_hidden }),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad read_dir response: {e}"))
}

/// Remote `list_subdirs` for the cwd breadcrumb.
pub fn list_subdirs(host: &str, path: &str, show_hidden: bool) -> Result<Vec<String>, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "list_subdirs", "path": path, "showHidden": show_hidden }),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad list_subdirs response: {e}"))
}

/// Remote `realpath` (backs `fs_canonicalize` on SSH): resolves symlinks on
/// the host so a canonicalize-then-recheck guard sees the real target.
pub fn realpath(host: &str, path: &str) -> Result<String, String> {
    let data = run_remote_json(host, &serde_json::json!({ "op": "realpath", "path": path }))?;
    serde_json::from_value(data).map_err(|e| format!("bad realpath response: {e}"))
}

/// Remote `fs_read_file`.
pub fn read_file(host: &str, path: &str) -> Result<crate::modules::fs::file::ReadResult, String> {
    let data = run_remote_json(host, &serde_json::json!({ "op": "read_file", "path": path }))?;
    serde_json::from_value(data).map_err(|e| format!("bad read_file response: {e}"))
}

/// Remote `fs_write_file` (atomic tmp+rename on the host).
pub fn write_file(host: &str, path: &str, content: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "write_file", "path": path, "content": content }),
    )?;
    Ok(())
}

/// Remote `fs_stat`.
pub fn stat(host: &str, path: &str) -> Result<crate::modules::fs::file::FileStat, String> {
    let data = run_remote_json(host, &serde_json::json!({ "op": "stat", "path": path }))?;
    serde_json::from_value(data).map_err(|e| format!("bad stat response: {e}"))
}

/// Remote `fs_search`. The host helper walks + subsequence-prefilters; we
/// fuzzy-rank the returned candidates locally so ordering matches the local
/// path exactly.
pub fn search(
    host: &str,
    root: &str,
    query: &str,
    limit: usize,
    show_hidden: bool,
) -> Result<crate::modules::fs::search::SearchResult, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({
            "op": "search", "path": root, "query": query,
            "limit": limit, "showHidden": show_hidden,
        }),
    )?;
    crate::modules::fs::search::rank_remote_hits(data, query, limit)
}

/// Remote content search (`fs_grep_interactive`). The host helper walks + greps
/// with a smart-case literal match, mirroring the local escaped-literal search.
/// No server-side supersession over SSH — the caller debounces + drops stale
/// responses.
pub fn grep(
    host: &str,
    root: &str,
    pattern: &str,
    limit: usize,
) -> Result<crate::modules::fs::grep::GrepResponse, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({
            "op": "grep", "path": root, "pattern": pattern, "limit": limit,
        }),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad grep response: {e}"))
}

/// Remote `fs_create_file` (atomic O_EXCL create; refuses to clobber).
pub fn create_file(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(host, &serde_json::json!({ "op": "create_file", "path": path }))?;
    Ok(())
}

/// Remote `fs_create_dir` (creates parents; refuses if the leaf exists).
pub fn create_dir(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(host, &serde_json::json!({ "op": "create_dir", "path": path }))?;
    Ok(())
}

/// Remote `fs_rename` (move; refuses to overwrite an existing target).
pub fn rename(host: &str, from: &str, to: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "rename", "from": from, "to": to }),
    )?;
    Ok(())
}

/// Remote `fs_delete` (recursive for dirs; unlinks symlinks without following).
pub fn delete(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(host, &serde_json::json!({ "op": "delete", "path": path }))?;
    Ok(())
}

/// True if `path` exists on the host (symlink-aware; does not follow).
fn remote_exists(host: &str, path: &str) -> Result<bool, String> {
    let data = run_remote_json(host, &serde_json::json!({ "op": "exists", "path": path }))?;
    Ok(data.as_bool().unwrap_or(false))
}

/// Binary-safe remote write (base64 over the wire), atomic on the host. `mode`
/// is applied after the rename when present, preserving the source's perms.
fn write_bytes(host: &str, path: &str, bytes: &[u8], mode: Option<u32>) -> Result<(), String> {
    let b64 = b64encode(bytes);
    run_remote_json(
        host,
        &serde_json::json!({ "op": "write_bytes", "path": path, "b64": b64, "mode": mode }),
    )?;
    Ok(())
}

/// Recursively upload one local path to `target` on the host. Dirs are created
/// (failing if `target` already exists); files are streamed as bytes.
fn upload_recursive(host: &str, src: &std::path::Path, target: &str) -> Result<(), String> {
    let meta = std::fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        create_dir(host, target)?;
        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            let name = name
                .to_str()
                .ok_or_else(|| format!("non-UTF-8 filename under {}", src.display()))?;
            let child = format!("{}/{name}", target.trim_end_matches('/'));
            upload_recursive(host, &entry.path(), &child)?;
        }
        Ok(())
    } else {
        let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
        write_bytes(host, target, &bytes, file_mode(&meta))
    }
}

#[cfg(unix)]
fn file_mode(meta: &std::fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    Some(meta.permissions().mode() & 0o777)
}

#[cfg(not(unix))]
fn file_mode(_meta: &std::fs::Metadata) -> Option<u32> {
    None
}

/// Remote `fs_copy`: upload local `sources` into the remote `dest_dir`,
/// recursively. Mirrors local fs_copy — refuses to overwrite an existing
/// top-level entry; nested entries land in freshly created dirs.
pub fn copy(host: &str, sources: &[String], dest_dir: &str) -> Result<(), String> {
    let dest = dest_dir.trim_end_matches('/');
    for source in sources {
        let src = std::path::Path::new(source);
        let name = src
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("invalid source: {source}"))?;
        let target = format!("{dest}/{name}");
        if remote_exists(host, &target)? {
            return Err(format!("already exists: {target}"));
        }
        upload_recursive(host, src, &target)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_args_prompt_instead_of_trusting_unknown_host_keys() {
        let args = control_args();
        assert!(
            args.iter().any(|a| a == "StrictHostKeyChecking=ask"),
            "host-key policy must be `ask` so the terminal prompts: {args:?}"
        );
        assert!(
            !args.iter().any(|a| a.contains("accept-new")),
            "`accept-new` silently trusts unknown hosts (MITM on first connect): {args:?}"
        );
    }

    #[test]
    fn parses_aliases_and_skips_wildcards() {
        let cfg = "\
# comment
Host alpha beta
    HostName example.com
    User deploy

Host *.internal
    User ignored

Host !secret prod
    HostName prod.example.com
";
        let hosts = parse_ssh_hosts(cfg);
        let names: Vec<&str> = hosts.iter().map(|h| h.host.as_str()).collect();
        assert_eq!(names, vec!["alpha", "beta", "prod"]);
        assert_eq!(hosts[0].host_name.as_deref(), Some("example.com"));
        assert_eq!(hosts[0].user.as_deref(), Some("deploy"));
        assert_eq!(hosts[1].user.as_deref(), Some("deploy"));
        assert_eq!(hosts[2].host_name.as_deref(), Some("prod.example.com"));
    }

    #[test]
    fn rejects_option_injection_hosts() {
        assert!(validate_ssh_host("-oProxyCommand=evil").is_err());
        assert!(validate_ssh_host("bad host").is_err());
        assert!(validate_ssh_host("").is_err());
        assert!(validate_ssh_host("prod").is_ok());
        assert!(validate_ssh_host("deploy@example.com").is_ok());
    }

    #[test]
    fn b64encode_matches_known_vectors() {
        assert_eq!(b64encode(b""), "");
        assert_eq!(b64encode(b"f"), "Zg==");
        assert_eq!(b64encode(b"fo"), "Zm8=");
        assert_eq!(b64encode(b"foo"), "Zm9v");
        assert_eq!(b64encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn extracts_json_after_sentinel_skipping_preamble() {
        let stdout = b"motd banner\nWelcome back\n__TERAX_JSON__{\"ok\":true,\"data\":1}";
        let idx = find_subslice(stdout, TERAX_SENTINEL).expect("sentinel present");
        assert_eq!(&stdout[idx + TERAX_SENTINEL.len()..], b"{\"ok\":true,\"data\":1}");
        assert!(find_subslice(b"no marker here", TERAX_SENTINEL).is_none());
    }

    #[test]
    fn read_capped_truncates_beyond_cap() {
        let data = vec![b'x'; 100];
        let (out, truncated) = read_capped(&mut &data[..], 10);
        assert_eq!(out.len(), 10);
        assert!(truncated);
        let (out2, trunc2) = read_capped(&mut &data[..], 1000);
        assert_eq!(out2.len(), 100);
        assert!(!trunc2);
    }

    #[test]
    fn classifies_actionable_ssh_errors() {
        assert!(classify_ssh_error("Permission denied (publickey).")
            .unwrap()
            .contains("open a terminal"));
        assert!(classify_ssh_error("Host key verification failed.")
            .unwrap()
            .contains("Host key"));
        assert!(classify_ssh_error("ssh: Could not resolve hostname foo")
            .unwrap()
            .contains("resolve"));
        assert!(classify_ssh_error("connect to host x port 22: Connection refused")
            .unwrap()
            .contains("refused"));
        assert!(classify_ssh_error("bash: python3: command not found")
            .unwrap()
            .contains("python3"));
        assert!(classify_ssh_error("some unrelated noise").is_none());
    }

    #[test]
    fn master_alive_rejects_unsafe_hosts() {
        // Rejected at the validation gate before any process spawn.
        assert!(!master_alive("-oProxyCommand=evil"));
        assert!(!master_alive(""));
        assert!(!master_alive("bad host"));
    }

    #[test]
    fn master_alive_false_without_a_live_socket() {
        // `ssh -O check` talks only to the (absent) local control socket and
        // fails fast, so a syntactically-valid host with no master needs no
        // network and must report not-alive.
        assert!(!master_alive("terax-no-such-host-zzz"));
    }

    #[test]
    fn run_remote_capture_rejects_unsafe_hosts() {
        assert!(run_remote_capture("-oProxyCommand=evil", "echo hi").is_err());
        assert!(run_remote_capture("", "echo hi").is_err());
        assert!(run_remote_capture("bad host", "echo hi").is_err());
    }

    // Runs the embedded helper against the local python3 (skipped when absent)
    // and locks the FS-3 invariant: realpath must resolve a symlink to its
    // real target, because the canonicalize-then-recheck guards depend on it.
    #[cfg(unix)]
    #[test]
    fn embedded_helper_realpath_resolves_symlinks() {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let python_ok = Command::new("python3")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !python_ok {
            return;
        }

        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("real.txt");
        std::fs::write(&target, b"x").unwrap();
        let link = dir.path().join("innocent.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let req = serde_json::json!({ "op": "realpath", "path": link.to_string_lossy() });
        let mut child = Command::new("python3")
            .arg("-c")
            .arg(REMOTE_PYTHON)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("spawn python3");
        child
            .stdin
            .take()
            .unwrap()
            .write_all(req.to_string().as_bytes())
            .unwrap();
        let out = child.wait_with_output().expect("helper output");
        assert!(out.status.success());

        let stdout = out.stdout;
        let i = find_subslice(&stdout, TERAX_SENTINEL).expect("sentinel present");
        let parsed: serde_json::Value =
            serde_json::from_slice(&stdout[i + TERAX_SENTINEL.len()..]).expect("json envelope");
        assert_eq!(parsed["ok"], serde_json::Value::Bool(true));
        let resolved = parsed["data"].as_str().expect("string path");
        let expected = std::fs::canonicalize(&target).unwrap();
        assert_eq!(resolved, expected.to_string_lossy());
        assert_ne!(resolved, link.to_string_lossy(), "must not echo the link back");
    }

    // End-to-end check of the real ssh + python helper path. No-op unless
    // TERAX_SSH_TEST_HOST is set, so it's safe in CI; run locally with e.g.
    // `TERAX_SSH_TEST_HOST=litha-claude cargo test --lib remote_fs_smoke -- --nocapture`.
    #[test]
    fn remote_fs_smoke() {
        let Ok(host) = std::env::var("TERAX_SSH_TEST_HOST") else {
            return;
        };
        let entries = read_dir(&host, "/", false).expect("remote read_dir failed");
        assert!(entries.iter().any(|e| e.name == "etc"));
        // "~" must expand to the remote home (so the explorer can seed it).
        read_dir(&host, "~", false).expect("remote read_dir(~) failed");
        // realpath backs fs_canonicalize on SSH; "~" must come back absolute.
        let rp = realpath(&host, "~").expect("remote realpath failed");
        assert!(rp.starts_with('/'), "expected absolute path, got {rp}");
        let subdirs = list_subdirs(&host, "/", false).expect("remote list_subdirs failed");
        assert!(subdirs.iter().any(|d| d == "home"));

        // Write → read → verify round-trip in /tmp.
        let path = "/tmp/.terax_smoke_test";
        let body = "hello terax äöü\nline2\n";
        write_file(&host, path, body).expect("remote write_file failed");
        match read_file(&host, path).expect("remote read_file failed") {
            crate::modules::fs::file::ReadResult::Text { content, .. } => {
                assert_eq!(content, body)
            }
            other => panic!("expected text, got {other:?}"),
        }
    }

    // End-to-end check of the remote mutation + upload ops. No-op unless
    // TERAX_SSH_TEST_HOST is set. Run with e.g.
    // `TERAX_SSH_TEST_HOST=litha-claude cargo test --lib remote_mutations_smoke -- --nocapture`.
    #[test]
    fn remote_mutations_smoke() {
        let Ok(host) = std::env::var("TERAX_SSH_TEST_HOST") else {
            return;
        };
        let base = format!("/tmp/.terax_mut_{}", std::process::id());
        let _ = delete(&host, &base); // clean any leftover

        // create_dir (with parents) + create_file, and clobber refusal.
        create_dir(&host, &format!("{base}/sub")).expect("create_dir");
        let f = format!("{base}/sub/a.txt");
        create_file(&host, &f).expect("create_file");
        assert!(create_file(&host, &f).is_err(), "create_file must not clobber");

        // write + rename within the tree, and missing-source refusal.
        write_file(&host, &f, "data-äöü\n").expect("write_file");
        let g = format!("{base}/sub/b.txt");
        rename(&host, &f, &g).expect("rename");
        assert!(rename(&host, &f, &g).is_err(), "rename of missing src must fail");

        // Upload a local binary file + a dir tree (binary-safe base64 path).
        let local = std::env::temp_dir().join(format!("terax_up_{}", std::process::id()));
        std::fs::create_dir_all(local.join("d")).unwrap();
        std::fs::write(local.join("bin.dat"), [0u8, 1, 2, 255, 254]).unwrap();
        std::fs::write(local.join("d/inner.txt"), b"inner").unwrap();
        copy(
            &host,
            &[
                local.join("bin.dat").to_string_lossy().into_owned(),
                local.join("d").to_string_lossy().into_owned(),
            ],
            &base,
        )
        .expect("copy/upload");

        let entries = read_dir(&host, &base, true).expect("read_dir base");
        assert!(entries.iter().any(|e| e.name == "bin.dat"));
        assert!(entries.iter().any(|e| e.name == "d"));
        match read_file(&host, &format!("{base}/d/inner.txt")).expect("read inner") {
            crate::modules::fs::file::ReadResult::Text { content, .. } => {
                assert_eq!(content, "inner")
            }
            other => panic!("expected text, got {other:?}"),
        }

        // Upload must refuse to overwrite an existing top-level target.
        assert!(
            copy(
                &host,
                &[local.join("bin.dat").to_string_lossy().into_owned()],
                &base,
            )
            .is_err(),
            "upload must not clobber"
        );

        // delete is recursive — the whole tree is gone afterwards.
        delete(&host, &base).expect("delete tree");
        assert!(read_dir(&host, &base, false).is_err(), "tree must be gone");

        let _ = std::fs::remove_dir_all(&local);
    }
}
