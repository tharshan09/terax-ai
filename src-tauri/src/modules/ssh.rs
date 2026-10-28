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
const REMOTE_PYTHON: &str = r#"import sys, os, json, tempfile, shutil, base64, functools, errno


def _natcmp(a, b):
    # Port of tree.rs natural_cmp so local and SSH explorers list identically:
    # case-insensitive; ASCII digit runs compare by value (shorter stripped
    # run first, then digits), leading zeros only break ties; anything else
    # compares by code point.
    a = a.lower(); b = b.lower(); ai = bi = 0
    while True:
        if ai >= len(a) and bi >= len(b):
            return 0
        if ai >= len(a):
            return -1
        if bi >= len(b):
            return 1
        ac = a[ai]; bc = b[bi]
        if "0" <= ac <= "9" and "0" <= bc <= "9":
            ae = ai
            while ae < len(a) and "0" <= a[ae] <= "9":
                ae += 1
            be = bi
            while be < len(b) and "0" <= b[be] <= "9":
                be += 1
            ar = a[ai:ae]; br = b[bi:be]
            an = ar.lstrip("0"); bn = br.lstrip("0")
            if len(an) != len(bn):
                return -1 if len(an) < len(bn) else 1
            if an != bn:
                return -1 if an < bn else 1
            if len(ar) != len(br):
                return -1 if len(ar) < len(br) else 1
            ai = ae; bi = be
        else:
            if ac != bc:
                return -1 if ac < bc else 1
            ai += 1; bi += 1


_natkey = functools.cmp_to_key(_natcmp)
from stat import S_ISDIR

MAX_READ = 10 * 1024 * 1024
MAX_ENTRIES = 100000
SEARCH_PRUNE = {"node_modules", ".git", "target", "dist", "build", ".next",
                ".turbo", ".cache", ".venv", "__pycache__"}
SEARCH_MAX_SCANNED = 500000
SEARCH_MAX_HITS = 2000
GREP_FILE_CAP = 5 * 1024 * 1024
# Mirror of copy.rs STAGING_PREFIX (pinned by a test): never listed or entered.
STAGING_PREFIX = ".terax-copy-"


def _staging(name):
    return name.startswith(STAGING_PREFIX)


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
            if _staging(e.name) or (e.name.startswith(".") and not show_hidden):
                continue
            if not _utf8_ok(e.name):
                continue
            ent = _entry(e)
            if ent is not None:
                out.append(ent)
            if len(out) >= MAX_ENTRIES:  # bound host memory + response size
                break
    rank = {"dir": 0, "symlink": 1, "file": 2}
    out.sort(key=lambda x: (rank[x["kind"]], _natkey(x["name"])))
    return out


def list_subdirs(req):
    path = os.path.expanduser(req["path"]); show_hidden = req.get("showHidden", False)
    out = []
    with os.scandir(path) as it:
        for e in it:
            if _staging(e.name) or (e.name.startswith(".") and not show_hidden):
                continue
            if not _utf8_ok(e.name):
                continue
            try:
                if e.is_dir(follow_symlinks=True):
                    out.append(e.name)
            except OSError:
                pass
    out.sort(key=_natkey)
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
    st = os.stat(path); size = st.st_size
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
    return {"kind": "text", "content": content, "size": size,
            "mtime": int(st.st_mtime * 1000)}


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
    # Copy uploads pass parents=False so a vanished destination is never recreated.
    if req.get("parents", True):
        os.makedirs(path, exist_ok=False)
    else:
        os.mkdir(path)
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


NO_HARDLINKS = (errno.ENOTSUP, errno.EOPNOTSUPP, errno.EPERM, errno.ENOSYS)


def _reserve_and_swap(src, dst, is_dir):
    # The exclusive placeholder makes the rename replace only our own empty
    # entry, never something another writer put at `dst` meanwhile.
    try:
        if is_dir:
            os.mkdir(dst)
        else:
            os.close(os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
    except FileExistsError:
        raise FileExistsError("already exists: " + dst)
    try:
        os.rename(src, dst)
    except BaseException:
        try:
            (os.rmdir if is_dir else os.unlink)(dst)
        except OSError:
            pass
        raise


def _place(src, dst):
    # A hardlink publishes a file without any replace window; folders and
    # hosts without hardlinks fall back to the reservation.
    if S_ISDIR(os.lstat(src).st_mode):
        _reserve_and_swap(src, dst, True)
        return
    try:
        os.link(src, dst)
    except FileExistsError:
        raise FileExistsError("already exists: " + dst)
    except OSError as ex:
        if ex.errno not in NO_HARDLINKS:
            raise
        _reserve_and_swap(src, dst, False)
        return
    try:
        os.unlink(src)
    except OSError:
        pass  # published; the staging cleanup removes the leftover link


def publish(req):
    src = os.path.expanduser(req["from"]); dst = os.path.expanduser(req["to"])
    _place(src, dst)
    # Cleanup rides on the publish run; only a staging dir is ever removed.
    staging = req.get("staging")
    if staging and _staging(os.path.basename(staging)):
        shutil.rmtree(os.path.expanduser(staging), ignore_errors=True)
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
        dirnames[:] = [d for d in dirnames if d not in SEARCH_PRUNE and not _staging(d)
                       and (show_hidden or not d.startswith("."))]
        entries = [(d, True) for d in dirnames] + [(f, False) for f in filenames]
        for name, is_dir in entries:
            if _staging(name) or (not show_hidden and name.startswith(".")):
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
        dirnames[:] = [d for d in dirnames if d not in SEARCH_PRUNE and not _staging(d)
                       and (show_hidden or not d.startswith("."))]
        for name in filenames:
            if _staging(name) or (not show_hidden and name.startswith(".")):
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
       "rename": rename, "delete": delete, "publish": publish,
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

/// Per-call budget for **background polls** over SSH (tmux pane-cwd, Claude
/// stats, the batched Claude read). Kept short so a *wedged* ControlMaster
/// (socket alive, remote command hung) can't pin a blocking-pool thread for
/// long — the poll fails after this and is simply retried next tick. For the
/// batched read the budget applies per remote exec (one exec per host per
/// tick), never as a fixed cap around a variable number of sessions.
pub const REMOTE_POLL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(6);

/// Per-call budget for **user-triggered remote FS reads** (`fs_read_dir`,
/// `fs_read_file`, `fs_canonicalize`, `fs_stat`). Generous, because a healthy
/// but slow transfer must not be truncated; it still bounds a wedged host so a
/// single open can't hang forever. Only the remote path carries this — local FS
/// ops get no kill-timeout (they just run off the main thread).
pub const REMOTE_FS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

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

/// Wait for a spawned `ssh` child, enforcing an optional per-call budget.
///
/// `Ok(Some(status))` — the child exited on its own. `Ok(None)` — the budget
/// elapsed first; the child has already been killed and reaped, so the caller
/// must surface a timeout error. `Err` — the wait itself failed.
///
/// This is the load-bearing anti-freeze primitive: with a `Some(_)` budget a
/// wedged remote command is reclaimed after `timeout` instead of blocking the
/// waiter forever. `None` preserves the historic "wait indefinitely" behavior
/// for callers that must not risk a mid-operation kill (remote mutations).
fn wait_child(
    child: &std::sync::Arc<shared_child::SharedChild>,
    timeout: Option<std::time::Duration>,
) -> Result<Option<std::process::ExitStatus>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let waiter = std::sync::Arc::clone(child);
    std::thread::spawn(move || {
        let _ = tx.send(waiter.wait());
    });
    match timeout {
        Some(dur) => match rx.recv_timeout(dur) {
            Ok(Ok(status)) => Ok(Some(status)),
            Ok(Err(e)) => Err(format!("ssh wait failed: {e}")),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // Reclaim the wedged process: kill, then reap so no zombie and
                // the reader threads see EOF on the now-closed pipes.
                let _ = child.kill();
                let _ = child.wait();
                Ok(None)
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                Err("ssh wait thread disconnected".to_string())
            }
        },
        None => match rx.recv() {
            Ok(Ok(status)) => Ok(Some(status)),
            Ok(Err(e)) => Err(format!("ssh wait failed: {e}")),
            Err(_) => Err("ssh wait thread disconnected".to_string()),
        },
    }
}

/// Loud, context-carrying error for a killed-on-budget remote call. `what`
/// identifies the work (a command preview or the fs op name); `host` and the
/// budget are always included so a poll failure is diagnosable in the log and
/// the frontend surfaces the same kind of string it already shows for other
/// SSH failures.
fn timed_out_msg(host: &str, what: &str, budget_secs: u64) -> String {
    format!(
        "SSH request to '{host}' timed out after {budget_secs}s (budget) and was killed: {what}"
    )
}

/// A copy batch stops on `Transport` (ssh itself or the connection failed) and
/// goes on after `Failed` (only this op failed on a reachable host).
#[derive(Debug)]
enum RemoteError {
    Transport(String),
    Failed(String),
}

impl From<RemoteError> for String {
    fn from(error: RemoteError) -> Self {
        match error {
            RemoteError::Transport(message) | RemoteError::Failed(message) => message,
        }
    }
}

/// Run one remote FS op and return its `data` value (or the remote error).
///
/// `timeout` bounds the whole ssh exec: `Some(_)` (the read commands pass
/// [`REMOTE_FS_TIMEOUT`]) kills a wedged host after the budget; `None` (remote
/// mutations) waits indefinitely as before, since killing mid-write is riskier
/// than blocking.
fn run_remote_json(
    host: &str,
    request: &serde_json::Value,
    timeout: Option<std::time::Duration>,
) -> Result<serde_json::Value, RemoteError> {
    let parsed = remote_envelope(host, request, timeout)?;
    if parsed.get("ok").and_then(serde_json::Value::as_bool) == Some(true) {
        Ok(parsed
            .get("data")
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    } else {
        Err(RemoteError::Failed(
            parsed
                .get("error")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown remote error")
                .to_string(),
        ))
    }
}

/// ssh reports its own failures (connect, auth, a dropped master) as 255; every
/// other status is the remote command's.
const SSH_OWN_FAILURE_EXIT: i32 = 255;
/// The remote shell's "command not found": the helper never ran, so no item can.
const COMMAND_NOT_FOUND_EXIT: i32 = 127;

fn exit_error(code: Option<i32>, stderr: &str) -> RemoteError {
    if let Some(message) = classify_ssh_error(stderr) {
        return RemoteError::Transport(message);
    }
    match code {
        Some(COMMAND_NOT_FOUND_EXIT) => RemoteError::Transport(if stderr.is_empty() {
            "the remote helper could not start: command not found on the host (exit 127)"
                .to_string()
        } else {
            format!("the remote helper could not start: {stderr}")
        }),
        Some(code) if code != SSH_OWN_FAILURE_EXIT => RemoteError::Failed(if stderr.is_empty() {
            format!("remote helper exited with status {code}")
        } else {
            format!("ssh: {stderr}")
        }),
        _ => RemoteError::Transport(if stderr.is_empty() {
            "ssh command failed".to_string()
        } else {
            format!("ssh: {stderr}")
        }),
    }
}

fn remote_envelope(
    host: &str,
    request: &serde_json::Value,
    timeout: Option<std::time::Duration>,
) -> Result<serde_json::Value, RemoteError> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use RemoteError::Transport;

    validate_ssh_host(host).map_err(Transport)?;
    note_connected_host(host);
    let request_json = serde_json::to_string(request).map_err(|e| Transport(e.to_string()))?;
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

    let child = std::sync::Arc::new(
        shared_child::SharedChild::spawn(&mut cmd)
            .map_err(|e| Transport(format!("ssh spawn failed: {e}")))?,
    );
    let missing = |pipe: &str| Transport(format!("no ssh {pipe}"));
    let mut stdin = child.take_stdin().ok_or_else(|| missing("stdin"))?;
    let mut stdout = child.take_stdout().ok_or_else(|| missing("stdout"))?;
    let mut stderr = child.take_stderr().ok_or_else(|| missing("stderr"))?;

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

    let status = match wait_child(&child, timeout).map_err(Transport)? {
        Some(status) => status,
        None => {
            // wait_child already killed + reaped the wedged process; the reader
            // threads will unblock on the closed pipes and we drop them.
            let budget = timeout.map(|d| d.as_secs()).unwrap_or(0);
            let op = request
                .get("op")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("?");
            log::warn!("run_remote_json: remote fs op '{op}' on '{host}' exceeded {budget}s budget; killed");
            return Err(Transport(timed_out_msg(host, op, budget)));
        }
    };
    let _ = writer.join();
    let (stdout_bytes, overflow) = out_reader.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, _) = err_reader.join().unwrap_or((Vec::new(), false));

    if !status.success() {
        let err = String::from_utf8_lossy(&stderr_bytes);
        return Err(exit_error(status.code(), err.trim()));
    }
    if overflow {
        return Err(Transport(
            "remote response exceeded the 16 MiB limit".to_string(),
        ));
    }
    // The embedded helper always prefixes its envelope with the sentinel, after
    // any login-shell banner/MOTD. Its absence means the helper never emitted a
    // response (crash, killed, or banner-only) — surface that clearly instead of
    // a misleading JSON parse error on the banner text.
    let json_bytes = match find_subslice(&stdout_bytes, TERAX_SENTINEL) {
        Some(i) => &stdout_bytes[i + TERAX_SENTINEL.len()..],
        None => {
            if stdout_bytes.is_empty() {
                return Err(Transport("no response from the remote helper".to_string()));
            }
            let preview = String::from_utf8_lossy(&stdout_bytes[..stdout_bytes.len().min(200)]);
            return Err(Transport(format!(
                "unexpected remote output (no response marker): {}",
                preview.trim()
            )));
        }
    };
    serde_json::from_slice(json_bytes).map_err(|e| Transport(format!("bad remote response: {e}")))
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
/// capturing stdout/stderr. Returns `Err` when ssh fails to spawn, or when a
/// `Some(_)` `timeout` budget elapses (the child is killed and a loud
/// context-carrying error returned); a non-zero remote exit is reported via
/// [`RemoteCapture::code`] so the caller decides whether it counts as an error
/// (tmux's "no server", for one, does not). Poll callers pass
/// [`REMOTE_POLL_TIMEOUT`]; `None` waits indefinitely (unchanged behavior).
pub fn run_remote_capture(
    host: &str,
    command: &str,
    timeout: Option<std::time::Duration>,
) -> Result<RemoteCapture, String> {
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

    let child = std::sync::Arc::new(
        shared_child::SharedChild::spawn(&mut cmd).map_err(|e| format!("ssh spawn failed: {e}"))?,
    );
    let mut stdout = child.take_stdout().ok_or("no ssh stdout")?;
    let mut stderr = child.take_stderr().ok_or("no ssh stderr")?;
    let out_reader = std::thread::spawn(move || read_capped(&mut stdout, MAX_REMOTE_STDOUT));
    let err_reader = std::thread::spawn(move || read_capped(&mut stderr, 64 * 1024));

    let status = match wait_child(&child, timeout)? {
        Some(status) => status,
        None => {
            let budget = timeout.map(|d| d.as_secs()).unwrap_or(0);
            let preview: String = command.chars().take(120).collect();
            log::warn!("run_remote_capture: '{command}' on '{host}' exceeded {budget}s budget; killed");
            return Err(timed_out_msg(host, &preview, budget));
        }
    };
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
        Some(REMOTE_FS_TIMEOUT),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad read_dir response: {e}"))
}

/// Remote `list_subdirs` for the cwd breadcrumb.
pub fn list_subdirs(host: &str, path: &str, show_hidden: bool) -> Result<Vec<String>, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "list_subdirs", "path": path, "showHidden": show_hidden }),
        // Out of W1 scope (breadcrumb helper, not one of the 7 async commands):
        // keep the historic wait-forever behavior rather than risk a regression.
        None,
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad list_subdirs response: {e}"))
}

/// Remote `realpath` (backs `fs_canonicalize` on SSH): resolves symlinks on
/// the host so a canonicalize-then-recheck guard sees the real target.
pub fn realpath(host: &str, path: &str) -> Result<String, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "realpath", "path": path }),
        Some(REMOTE_FS_TIMEOUT),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad realpath response: {e}"))
}

/// Remote `fs_read_file`.
pub fn read_file(host: &str, path: &str) -> Result<crate::modules::fs::file::ReadResult, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "read_file", "path": path }),
        Some(REMOTE_FS_TIMEOUT),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad read_file response: {e}"))
}

/// Remote `fs_write_file` (atomic tmp+rename on the host).
pub fn write_file(host: &str, path: &str, content: &str) -> Result<(), String> {
    // Mutations wait indefinitely (None): killing a write mid-flight is riskier
    // than blocking, and these are not among the W1 async commands.
    run_remote_json(
        host,
        &serde_json::json!({ "op": "write_file", "path": path, "content": content }),
        None,
    )?;
    Ok(())
}

/// Remote `fs_stat`.
pub fn stat(host: &str, path: &str) -> Result<crate::modules::fs::file::FileStat, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "stat", "path": path }),
        Some(REMOTE_FS_TIMEOUT),
    )?;
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
        // Debounced as-you-type over SSH: budget the remote call so a wedged
        // host can't pile up blocking-pool threads per keystroke.
        Some(REMOTE_FS_TIMEOUT),
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
        // Debounced as-you-type over SSH: budget the remote call so a wedged
        // host can't pile up blocking-pool threads per keystroke.
        Some(REMOTE_FS_TIMEOUT),
    )?;
    serde_json::from_value(data).map_err(|e| format!("bad grep response: {e}"))
}

/// Remote `fs_create_file` (atomic O_EXCL create; refuses to clobber).
pub fn create_file(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "create_file", "path": path }),
        None,
    )?;
    Ok(())
}

/// Remote `fs_create_dir` (creates parents; refuses if the leaf exists).
pub fn create_dir(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "create_dir", "path": path }),
        None,
    )?;
    Ok(())
}

/// Remote `fs_rename` (move; refuses to overwrite an existing target).
pub fn rename(host: &str, from: &str, to: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "rename", "from": from, "to": to }),
        None,
    )?;
    Ok(())
}

/// Remote `fs_delete` (recursive for dirs; unlinks symlinks without following).
pub fn delete(host: &str, path: &str) -> Result<(), String> {
    run_remote_json(
        host,
        &serde_json::json!({ "op": "delete", "path": path }),
        None,
    )?;
    Ok(())
}

type RemoteReply = Result<serde_json::Value, RemoteError>;

/// Runs one helper request for the copy path; tests swap in a stub transport.
type RemoteRun<'a> = dyn FnMut(&serde_json::Value, Option<std::time::Duration>) -> RemoteReply + 'a;

/// One remote step of an upload; `rel` is relative to the staged item.
#[cfg_attr(test, derive(Debug, PartialEq))]
enum Upload {
    Dir(String),
    File {
        src: std::path::PathBuf,
        rel: String,
        mode: Option<u32>,
    },
}

/// Walks the local source once before any remote call, so an item that cannot
/// be uploaded fails without touching the host. `check_source` judged the root.
fn plan_upload(
    src: &std::path::Path,
    rel: String,
    depth: usize,
    linked: bool,
    plan: &mut Vec<Upload>,
    registry: &crate::modules::workspace::WorkspaceRegistry,
) -> std::io::Result<()> {
    use crate::modules::fs::copy;
    copy::check_depth(depth)?;
    let meta = std::fs::symlink_metadata(src)?;
    if meta.is_dir() {
        plan.push(Upload::Dir(rel.clone()));
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_str().ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("non-UTF-8 filename under {}", src.display()),
                )
            })?;
            copy::guard_entry(registry, &entry, linked)?;
            let rel = format!("{rel}/{name}");
            plan_upload(&entry.path(), rel, depth + 1, linked, plan, registry)?;
        }
        return Ok(());
    }
    // The helper writes plain files only: a symlink uploads its target's bytes,
    // so every link is judged here, where the upload reads through it.
    let target = if meta.file_type().is_symlink() {
        copy::guard_read(registry, src)?;
        std::fs::metadata(src)?
    } else {
        meta
    };
    if target.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "folder symlinks cannot be copied to an SSH host",
        ));
    }
    if !target.is_file() {
        return Err(copy::unsupported_kind());
    }
    plan.push(Upload::File {
        src: src.to_path_buf(),
        rel,
        mode: file_mode(&target),
    });
    Ok(())
}

fn upload(run: &mut RemoteRun, plan: &[Upload], item: &str) -> Result<(), RemoteError> {
    for step in plan {
        let request = match step {
            Upload::Dir(rel) => serde_json::json!({
                "op": "create_dir", "path": format!("{item}{rel}"), "parents": false,
            }),
            Upload::File { src, rel, mode } => {
                let bytes = std::fs::read(src).map_err(|e| RemoteError::Failed(e.to_string()))?;
                serde_json::json!({
                    "op": "write_bytes", "path": format!("{item}{rel}"),
                    "b64": b64encode(&bytes), "mode": mode,
                })
            }
        };
        run(&request, None)?;
    }
    Ok(())
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

// Unique per call and random across processes; a clash only fails the item,
// because create_dir refuses an existing name.
fn staging_suffix() -> String {
    use std::hash::{BuildHasher, Hasher};
    let hasher = std::collections::hash_map::RandomState::new().build_hasher();
    format!("{:016x}", hasher.finish())
}

/// A lost connection rejects the batch only on the first item, before its
/// publish; later the result stays Ok so the explorer re-reads the destination.
pub fn copy(
    host: &str,
    sources: &[String],
    dest_dir: &str,
    rename_on_conflict: bool,
    registry: &crate::modules::workspace::WorkspaceRegistry,
) -> Result<crate::modules::fs::copy::CopyResult, String> {
    copy_with(
        &mut |request, timeout| run_remote_json(host, request, timeout),
        host,
        sources,
        dest_dir,
        rename_on_conflict,
        registry,
    )
}

const PUBLISH_LOST: &str = "connection lost while publishing; the item may already be in place";

/// How an SSH copy item failed. A connection lost during its publish leaves the
/// item's fate unknown, so it neither rejects the batch nor counts as created.
#[derive(Debug)]
enum ItemError {
    Remote(RemoteError),
    PublishLost(String),
}

impl From<RemoteError> for ItemError {
    fn from(error: RemoteError) -> Self {
        ItemError::Remote(error)
    }
}

fn copy_with(
    run: &mut RemoteRun,
    host: &str,
    sources: &[String],
    dest_dir: &str,
    rename_on_conflict: bool,
    registry: &crate::modules::workspace::WorkspaceRegistry,
) -> Result<crate::modules::fs::copy::CopyResult, String> {
    use crate::modules::fs::copy::{CopyFailure, CopyResult};
    let dest = dest_dir.trim_end_matches('/');
    let mut taken = listed_names(run, host, dest_dir);
    let mut result = CopyResult::default();
    let failure = |source: &String, message: &str| CopyFailure {
        source: source.clone(),
        message: message.to_string(),
    };
    for (index, source) in sources.iter().enumerate() {
        let item = copy_one(
            run,
            std::path::Path::new(source),
            dest,
            rename_on_conflict,
            &mut taken,
            registry,
        );
        match item {
            Ok(name) => result.created.push(format!("{dest}/{name}")),
            Err(ItemError::Remote(RemoteError::Failed(message))) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) failed: {message}");
                result.failed.push(failure(source, &message));
            }
            Err(ItemError::Remote(RemoteError::Transport(message))) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) aborted: {message}");
                if index == 0 {
                    return Err(message);
                }
                let rest = sources[index..].iter();
                result
                    .failed
                    .extend(rest.map(|source| failure(source, &message)));
                break;
            }
            Err(ItemError::PublishLost(message)) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) lost while publishing: {message}");
                result.failed.push(failure(source, PUBLISH_LOST));
                let rest = sources[index + 1..].iter();
                result
                    .failed
                    .extend(rest.map(|source| failure(source, &message)));
                break;
            }
        }
    }
    Ok(result)
}

/// Names already in `dest_dir`, only to skip doomed publish runs. Without a
/// listing every candidate is tried: the no-replace publish is the real check.
fn listed_names(
    run: &mut RemoteRun,
    host: &str,
    dest_dir: &str,
) -> std::collections::HashSet<String> {
    let request = serde_json::json!({ "op": "read_dir", "path": dest_dir, "showHidden": true });
    let listing = run(&request, Some(REMOTE_FS_TIMEOUT))
        .map_err(String::from)
        .and_then(|data| {
            serde_json::from_value::<Vec<crate::modules::fs::tree::DirEntry>>(data)
                .map_err(|e| format!("bad read_dir response: {e}"))
        });
    match listing {
        Ok(entries) => entries.into_iter().map(|entry| entry.name).collect(),
        Err(error) => {
            log::warn!("ssh copy: could not list {host}:{dest_dir}, trying every name: {error}");
            std::collections::HashSet::new()
        }
    }
}

// The remote landing gets no deny-list check, like a remote editor save.
fn copy_one(
    run: &mut RemoteRun,
    src: &std::path::Path,
    dest: &str,
    rename_on_conflict: bool,
    taken: &mut std::collections::HashSet<String>,
    registry: &crate::modules::workspace::WorkspaceRegistry,
) -> Result<String, ItemError> {
    use crate::modules::fs::copy;
    let failed = |error: std::io::Error| RemoteError::Failed(error.to_string());
    let source = copy::check_source(src, registry).map_err(failed)?;
    let name = source
        .name
        .to_str()
        .ok_or_else(|| RemoteError::Failed(format!("non-UTF-8 filename: {}", src.display())))?;
    if !rename_on_conflict && taken.contains(name) {
        return Err(failed(copy::already_exists(format!("{dest}/{name}"))).into());
    }
    let mut plan = Vec::new();
    plan_upload(src, String::new(), 0, source.linked, &mut plan, registry).map_err(failed)?;

    let staging = format!("{dest}/{}{}", copy::STAGING_PREFIX, staging_suffix());
    // A refused or lost create_dir leaves a name this run does not own, so it
    // returns here, before the cleanup below could delete someone else's dir.
    run(
        &serde_json::json!({ "op": "create_dir", "path": staging, "parents": false }),
        None,
    )?;
    let outcome = match upload(run, &plan, &format!("{staging}/{}", copy::STAGED_ITEM)) {
        Ok(()) => publish_staged(
            run,
            &staging,
            dest,
            name,
            source.is_dir,
            rename_on_conflict,
            taken,
        ),
        Err(error) => Err(error.into()),
    };
    // A successful publish already removed the staging dir; without a
    // connection the cleanup cannot run either, the rest stays hidden.
    if matches!(outcome, Err(ItemError::Remote(RemoteError::Failed(_)))) {
        if let Err(error) = run(
            &serde_json::json!({ "op": "delete", "path": staging }),
            None,
        ) {
            log::warn!(
                "ssh copy: could not remove staging {staging}: {}",
                String::from(error)
            );
        }
    }
    outcome
}

/// The listing only saves runs; a case-insensitive host refuses a case variant
/// in the no-replace publish itself, which moves on to the next candidate.
fn publish_staged(
    run: &mut RemoteRun,
    staging: &str,
    dest: &str,
    name: &str,
    is_dir: bool,
    rename_on_conflict: bool,
    taken: &mut std::collections::HashSet<String>,
) -> Result<String, ItemError> {
    use crate::modules::fs::copy;
    let staged = format!("{staging}/{}", copy::STAGED_ITEM);
    for candidate in copy::copy_candidates(std::ffi::OsStr::new(name), is_dir) {
        let candidate = candidate.to_string_lossy().into_owned();
        if rename_on_conflict && taken.contains(&candidate) {
            continue;
        }
        let request = serde_json::json!({
            "op": "publish", "from": staged, "to": format!("{dest}/{candidate}"),
            "staging": staging,
        });
        match run(&request, None) {
            Ok(_) => {
                taken.insert(candidate.clone());
                return Ok(candidate);
            }
            Err(RemoteError::Failed(message)) if message.starts_with("already exists: ") => {
                if !rename_on_conflict {
                    return Err(RemoteError::Failed(message).into());
                }
                taken.insert(candidate);
            }
            Err(RemoteError::Transport(message)) => return Err(ItemError::PublishLost(message)),
            Err(error) => return Err(error.into()),
        }
    }
    Err(RemoteError::Failed(copy::no_free_copy_name().to_string()).into())
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
        let data = [b'x'; 100];
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
        assert!(run_remote_capture("-oProxyCommand=evil", "echo hi", None).is_err());
        assert!(run_remote_capture("", "echo hi", None).is_err());
        assert!(run_remote_capture("bad host", "echo hi", None).is_err());
    }

    // Drives the real timeout primitive against a genuinely hung child (no DI
    // mock): a `sleep` that would run for 30s must be reclaimed after the short
    // budget. This is the load-bearing anti-freeze path — with a wedged SSH the
    // remote `ssh` process hangs exactly like this, and wait_child kills it.
    #[cfg(unix)]
    #[test]
    fn wait_child_kills_a_hung_child_after_the_budget() {
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};

        let mut cmd = Command::new("sleep");
        cmd.arg("30")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = std::sync::Arc::new(
            shared_child::SharedChild::spawn(&mut cmd).expect("spawn sleep"),
        );

        let started = Instant::now();
        let outcome = wait_child(&child, Some(Duration::from_millis(300)));
        let elapsed = started.elapsed();

        // Timed out → Ok(None), and it returned at ~the budget, not ~30s.
        assert!(
            matches!(outcome, Ok(None)),
            "expected a timeout outcome, got {outcome:?}"
        );
        assert!(
            elapsed < Duration::from_secs(5),
            "wait_child did not return promptly on timeout: {elapsed:?}"
        );
        // The child was actually killed + reaped inside wait_child: a second
        // wait returns immediately with no exit code (signal-terminated),
        // rather than blocking for the remaining ~30s.
        let status = child.wait().expect("second wait");
        assert!(
            status.code().is_none(),
            "expected a signal-terminated child, got {status:?}"
        );
    }

    // The healthy path is untouched: a fast child returns its real exit status
    // well within the budget (proves normal polls/reads aren't penalized).
    #[cfg(unix)]
    #[test]
    fn wait_child_returns_status_for_a_fast_child() {
        use std::process::{Command, Stdio};
        use std::time::Duration;

        let mut cmd = Command::new("true");
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = std::sync::Arc::new(
            shared_child::SharedChild::spawn(&mut cmd).expect("spawn true"),
        );
        let outcome = wait_child(&child, Some(Duration::from_secs(5)));
        match outcome {
            Ok(Some(status)) => assert!(status.success(), "expected success, got {status:?}"),
            other => panic!("expected Ok(Some(success)), got {other:?}"),
        }
    }

    // The timeout error is loud and carries the host, the budget, and a work
    // identifier — the three things needed to diagnose a killed poll/read.
    #[test]
    fn timed_out_msg_carries_host_budget_and_detail() {
        let m = timed_out_msg("litha-claude", "read_file", 30);
        assert!(m.contains("litha-claude"), "missing host: {m}");
        assert!(m.contains("30s"), "missing budget: {m}");
        assert!(m.contains("read_file"), "missing work detail: {m}");
        assert!(
            m.to_lowercase().contains("timed out") || m.to_lowercase().contains("budget"),
            "not clearly a timeout: {m}"
        );
    }

    /// Runs the embedded helper on the local python3, after an optional
    /// `prelude` that can stub os calls. `None` when python3 is absent.
    #[cfg(unix)]
    fn run_helper(prelude: &str, req: &serde_json::Value) -> Option<serde_json::Value> {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let python_ok = Command::new("python3")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !python_ok {
            return None;
        }
        let mut child = Command::new("python3")
            .arg("-c")
            .arg(format!("{prelude}{REMOTE_PYTHON}"))
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
        let i = find_subslice(&out.stdout, TERAX_SENTINEL).expect("sentinel present");
        Some(serde_json::from_slice(&out.stdout[i + TERAX_SENTINEL.len()..]).expect("json envelope"))
    }

    // Locks the FS-3 invariant: realpath must resolve a symlink to its real
    // target, because the canonicalize-then-recheck guards depend on it.
    #[cfg(unix)]
    #[test]
    fn embedded_helper_realpath_resolves_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("real.txt");
        std::fs::write(&target, b"x").unwrap();
        let link = dir.path().join("innocent.txt");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let req = serde_json::json!({ "op": "realpath", "path": link.to_string_lossy() });
        let Some(parsed) = run_helper("", &req) else {
            return;
        };
        assert_eq!(parsed["ok"], serde_json::Value::Bool(true));
        let resolved = parsed["data"].as_str().expect("string path");
        let expected = std::fs::canonicalize(&target).unwrap();
        assert_eq!(resolved, expected.to_string_lossy());
        assert_ne!(resolved, link.to_string_lossy(), "must not echo the link back");
    }

    #[test]
    fn helper_staging_prefix_mirrors_copy_rs() {
        let line = format!(
            "STAGING_PREFIX = \"{}\"\n",
            crate::modules::fs::copy::STAGING_PREFIX
        );
        assert!(REMOTE_PYTHON.contains(&line), "helper must pin {line:?}");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_listings_never_show_staging() {
        let dir = tempfile::tempdir().unwrap();
        for rel in [".terax-copy-x/report", ".hidden/report"] {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "needle\n").unwrap();
        }
        let root = dir.path().to_string_lossy().into_owned();
        let data = |req: serde_json::Value| {
            run_helper("", &req).map(|env| {
                assert_eq!(env["ok"], true, "{env}");
                env["data"].clone()
            })
        };
        let rels = |hits: &serde_json::Value| -> Vec<String> {
            hits.as_array()
                .unwrap()
                .iter()
                .map(|h| h["rel"].as_str().unwrap().to_string())
                .collect()
        };

        let Some(entries) =
            data(serde_json::json!({ "op": "read_dir", "path": root, "showHidden": true }))
        else {
            return;
        };
        let names: Vec<&str> = entries
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, [".hidden"]);
        let subdirs =
            data(serde_json::json!({ "op": "list_subdirs", "path": root, "showHidden": true }));
        assert_eq!(subdirs.unwrap(), serde_json::json!([".hidden"]));
        let search = data(serde_json::json!({
            "op": "search", "path": root, "query": "report", "showHidden": true,
        }))
        .unwrap();
        assert_eq!(rels(&search["hits"]), [".hidden/report"]);
        let grep = data(serde_json::json!({
            "op": "grep", "path": root, "pattern": "needle", "showHidden": true,
        }))
        .unwrap();
        assert_eq!(rels(&grep["hits"]), [".hidden/report"]);
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_never_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let p = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let stage = |rel: &str, body: &[u8]| {
            let path = dir.path().join(".terax-copy-s").join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, body).unwrap();
            path.to_string_lossy().into_owned()
        };
        let publish = |prelude: &str, from: &str, to: &str| {
            run_helper(
                prelude,
                &serde_json::json!({ "op": "publish", "from": from, "to": to }),
            )
        };
        let refused =
            |to: &str| serde_json::json!({ "ok": false, "error": format!("already exists: {to}") });
        let ok = serde_json::json!({ "ok": true, "data": true });

        let staged = stage("f1", b"new");
        let Some(env) = publish("", &staged, &p("free.txt")) else {
            return;
        };
        assert_eq!(env, ok);
        assert_eq!(std::fs::read(p("free.txt")).unwrap(), b"new");
        assert!(!std::path::Path::new(&staged).exists());

        std::fs::write(p("taken.txt"), b"old").unwrap();
        let staged = stage("f2", b"new");
        assert_eq!(
            publish("", &staged, &p("taken.txt")).unwrap(),
            refused(&p("taken.txt"))
        );
        assert_eq!(std::fs::read(p("taken.txt")).unwrap(), b"old");
        assert!(std::path::Path::new(&staged).exists());

        // A failing swap (folder into itself) must take its reservation back.
        let item = dir.path().join(".terax-copy-s/item");
        std::fs::create_dir(&item).unwrap();
        let inside = item.join("sub");
        let env = publish("", &item.to_string_lossy(), &inside.to_string_lossy()).unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(!inside.exists(), "reservation must be removed");
        assert_eq!(publish("", &item.to_string_lossy(), &p("folder")).unwrap(), ok);
        assert!(dir.path().join("folder").is_dir());
        assert!(!item.exists());
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_without_hardlinks_reserves_the_name_first() {
        // The rename stub refuses any target that is not an empty placeholder,
        // so a plain check-then-rename fallback fails this test.
        let without_links = |code: &str, rename_fails: bool| {
            let fail = if rename_fails { "True" } else { "False" };
            [
                "import os, errno".to_string(),
                format!("def _no_link(*a, **k): raise OSError(errno.{code}, 'no hardlinks')"),
                "os.link = _no_link".into(),
                "_rename = os.rename".into(),
                "def _onto_reservation(a, b):".into(),
                "    if os.path.islink(b) or not os.path.isfile(b) or os.path.getsize(b):".into(),
                "        raise OSError(errno.EIO, 'no reservation at ' + b)".into(),
                format!("    if {fail}: raise OSError(errno.EXDEV, 'swap failed')"),
                "    _rename(a, b)".into(),
                "os.rename = _onto_reservation".into(),
                String::new(),
            ]
            .join("\n")
        };
        let dir = tempfile::tempdir().unwrap();
        let p = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let stage = |rel: &str, body: &[u8]| {
            let path = dir.path().join(".terax-copy-s").join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, body).unwrap();
            path.to_string_lossy().into_owned()
        };
        let publish = |prelude: &str, from: &str, to: &str| {
            run_helper(
                prelude,
                &serde_json::json!({ "op": "publish", "from": from, "to": to }),
            )
        };
        std::fs::write(p("taken.txt"), b"old").unwrap();
        std::os::unix::fs::symlink(p("victim"), p("dangling.txt")).unwrap();

        for code in ["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"] {
            let prelude = without_links(code, false);
            let staged = stage(code, b"fallback");
            let to = p(&format!("{code}.txt"));
            let Some(env) = publish(&prelude, &staged, &to) else {
                return;
            };
            assert_eq!(
                env,
                serde_json::json!({ "ok": true, "data": true }),
                "{code}"
            );
            assert_eq!(std::fs::read(&to).unwrap(), b"fallback");
            assert!(!std::path::Path::new(&staged).exists());

            for taken in ["taken.txt", "dangling.txt"] {
                let staged = stage(code, b"new");
                let env = publish(&prelude, &staged, &p(taken)).unwrap();
                assert_eq!(
                    env["error"],
                    format!("already exists: {}", p(taken)),
                    "{code}"
                );
                assert!(std::path::Path::new(&staged).exists());
            }
        }
        assert_eq!(std::fs::read(p("taken.txt")).unwrap(), b"old");
        assert!(
            !dir.path().join("victim").exists(),
            "must not write through the link"
        );

        let staged = stage("swap", b"new");
        let env = publish(&without_links("ENOSYS", true), &staged, &p("swap.txt")).unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(
            !dir.path().join("swap.txt").exists(),
            "reservation must be removed"
        );
        assert!(std::path::Path::new(&staged).exists());
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_treats_case_variants_as_taken() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("A.txt"), b"old").unwrap();
        let insensitive = dir.path().join("a.txt").exists();
        let staged = dir.path().join(".terax-copy-s");
        std::fs::write(&staged, b"new").unwrap();
        let to = |name: &str| dir.path().join(name).to_string_lossy().into_owned();
        let publish = |name: &str| {
            run_helper(
                "",
                &serde_json::json!({
                    "op": "publish", "from": staged.to_string_lossy(), "to": to(name),
                }),
            )
        };
        let Some(env) = publish("a.txt") else {
            return;
        };
        if insensitive {
            assert_eq!(env["error"], format!("already exists: {}", to("a.txt")));
            assert_eq!(publish("a copy.txt").unwrap()["ok"], true);
        } else {
            assert_eq!(env["ok"], true);
        }
        assert_eq!(std::fs::read(dir.path().join("A.txt")).unwrap(), b"old");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_removes_its_staging_dir() {
        let dir = tempfile::tempdir().unwrap();
        let path = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let publish = |from: &str, to: &str, staging: &str| {
            run_helper(
                "",
                &serde_json::json!({
                    "op": "publish", "from": path(from), "to": path(to), "staging": path(staging),
                }),
            )
        };
        std::fs::create_dir_all(dir.path().join(".terax-copy-s/item/sub")).unwrap();
        std::fs::write(dir.path().join(".terax-copy-s/item/sub/x"), b"x").unwrap();
        std::fs::write(dir.path().join("taken"), b"old").unwrap();

        let Some(env) = publish(".terax-copy-s/item", "taken", ".terax-copy-s") else {
            return;
        };
        assert_eq!(env["error"], format!("already exists: {}", path("taken")));
        assert!(dir.path().join(".terax-copy-s/item/sub/x").exists());

        let env = publish(".terax-copy-s/item", "free", ".terax-copy-s").unwrap();
        assert_eq!(env, serde_json::json!({ "ok": true, "data": true }));
        assert!(dir.path().join("free/sub/x").exists());
        assert!(!dir.path().join(".terax-copy-s").exists());

        std::fs::create_dir_all(dir.path().join("keep/item")).unwrap();
        assert_eq!(publish("keep/item", "moved", "keep").unwrap()["ok"], true);
        assert!(
            dir.path().join("keep").is_dir(),
            "only a staging dir is removed"
        );

        let env = run_helper(
            "",
            &serde_json::json!({
                "op": "create_dir", "path": path("gone/.terax-copy-t"), "parents": false,
            }),
        )
        .unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(!dir.path().join("gone").exists());
    }

    /// Runs the SSH copy loop against `respond` instead of a host and returns
    /// the result with every request it sent.
    fn stub_copy(
        sources: &[String],
        mut respond: impl FnMut(&serde_json::Value) -> RemoteReply,
    ) -> (
        Result<crate::modules::fs::copy::CopyResult, String>,
        Vec<serde_json::Value>,
    ) {
        let mut requests = Vec::new();
        let result = copy_with(
            &mut |request, _| {
                requests.push(request.clone());
                respond(request)
            },
            "stub",
            sources,
            "/remote",
            true,
            &crate::modules::workspace::WorkspaceRegistry::default(),
        );
        (result, requests)
    }

    fn creates_staging(request: &serde_json::Value) -> bool {
        request["op"] == "create_dir"
            && request["path"].as_str().is_some_and(|path| {
                path.rsplit('/')
                    .next()
                    .is_some_and(crate::modules::fs::copy::is_staging_name)
            })
    }

    fn healthy(request: &serde_json::Value) -> RemoteReply {
        Ok(if request["op"] == "read_dir" {
            serde_json::json!([])
        } else {
            serde_json::json!(true)
        })
    }

    fn local_sources(dir: &std::path::Path, names: &[&str]) -> Vec<String> {
        names
            .iter()
            .map(|name| {
                let path = dir.join(name);
                std::fs::write(&path, name).unwrap();
                path.to_string_lossy().into_owned()
            })
            .collect()
    }

    fn failures(result: &crate::modules::fs::copy::CopyResult) -> Vec<(String, String)> {
        result
            .failed
            .iter()
            .map(|f| (f.source.clone(), f.message.clone()))
            .collect()
    }

    #[test]
    fn copy_keeps_landed_items_when_the_transport_drops() {
        const LOST: &str = "ssh: connection closed";
        fn drop_on_staging(nth: usize) -> impl FnMut(&serde_json::Value) -> RemoteReply {
            let mut stagings = 0;
            move |request| {
                if creates_staging(request) {
                    stagings += 1;
                    if stagings == nth {
                        return Err(RemoteError::Transport(LOST.into()));
                    }
                }
                healthy(request)
            }
        }
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt", "c.txt"]);

        let (result, _) = stub_copy(&sources, drop_on_staging(2));
        let result = result.unwrap();
        assert_eq!(result.created, ["/remote/a.txt"]);
        assert_eq!(
            failures(&result),
            [
                (sources[1].clone(), LOST.to_string()),
                (sources[2].clone(), LOST.to_string()),
            ]
        );

        let (result, requests) = stub_copy(&sources, drop_on_staging(1));
        assert_eq!(result.unwrap_err(), LOST);
        assert!(!requests.iter().any(|r| r["op"] == "publish"));

        let mixed = [
            "rel.txt".to_string(),
            sources[0].clone(),
            sources[1].clone(),
        ];
        let result = stub_copy(&mixed, drop_on_staging(1)).0.unwrap();
        assert!(result.created.is_empty());
        assert_eq!(
            failures(&result),
            [
                (
                    "rel.txt".to_string(),
                    "copy source must be absolute".to_string()
                ),
                (sources[0].clone(), LOST.to_string()),
                (sources[1].clone(), LOST.to_string()),
            ]
        );
    }

    #[test]
    fn copy_tries_every_name_when_the_listing_fails() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        let listings: [fn() -> RemoteReply; 3] = [
            || Err(RemoteError::Transport("SSH request timed out".into())),
            || Err(RemoteError::Failed("Permission denied".into())),
            || Ok(serde_json::json!("not a listing")),
        ];
        for listing in listings {
            let (result, requests) = stub_copy(&sources, |request| {
                if request["op"] == "read_dir" {
                    return listing();
                }
                if request["op"] == "publish" && request["to"] == "/remote/a.txt" {
                    return Err(RemoteError::Failed("already exists: /remote/a.txt".into()));
                }
                healthy(request)
            });
            let result = result.unwrap();
            assert_eq!(result.created, ["/remote/a copy.txt"]);
            assert!(result.failed.is_empty());
            let targets: Vec<&serde_json::Value> = requests
                .iter()
                .filter(|r| r["op"] == "publish")
                .map(|r| &r["to"])
                .collect();
            assert_eq!(targets, ["/remote/a.txt", "/remote/a copy.txt"]);
        }
    }

    fn listing(names: &[&str]) -> RemoteReply {
        Ok(names
            .iter()
            .map(|name| {
                serde_json::json!({
                    "name": name, "kind": "file", "size": 3, "mtime": 0, "gitignored": false,
                })
            })
            .collect())
    }

    fn publish_targets(requests: &[serde_json::Value]) -> Vec<&serde_json::Value> {
        requests
            .iter()
            .filter(|r| r["op"] == "publish")
            .map(|r| &r["to"])
            .collect()
    }

    #[test]
    fn copy_skips_listed_names_exactly_and_cleans_up_within_the_publish_run() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["readme.md"]);
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "read_dir" {
                return listing(&["README.md"]);
            }
            healthy(request)
        });
        assert_eq!(result.unwrap().created, ["/remote/readme.md"]);
        assert_eq!(publish_targets(&requests), ["/remote/readme.md"]);

        // A case-insensitive host refuses the variant in the publish itself.
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "read_dir" {
                return listing(&["README.md"]);
            }
            if request["op"] == "publish" && request["to"] == "/remote/readme.md" {
                return Err(RemoteError::Failed(
                    "already exists: /remote/readme.md".into(),
                ));
            }
            healthy(request)
        });
        assert_eq!(result.unwrap().created, ["/remote/readme copy.md"]);
        assert_eq!(
            publish_targets(&requests),
            ["/remote/readme.md", "/remote/readme copy.md"]
        );

        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "read_dir" {
                return listing(&["readme.md"]);
            }
            healthy(request)
        });
        assert_eq!(result.unwrap().created, ["/remote/readme copy.md"]);
        let publishes: Vec<&serde_json::Value> =
            requests.iter().filter(|r| r["op"] == "publish").collect();
        assert_eq!(publishes.len(), 1);
        assert_eq!(publishes[0]["to"], "/remote/readme copy.md");
        let staging = publishes[0]["staging"].as_str().unwrap();
        assert!(staging.starts_with("/remote/.terax-copy-"), "{staging}");
        assert_eq!(publishes[0]["from"], format!("{staging}/item"));
        assert!(!requests.iter().any(|r| r["op"] == "delete"));

        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "publish" {
                return Err(RemoteError::Failed("Permission denied".into()));
            }
            healthy(request)
        });
        assert_eq!(result.unwrap().failed[0].message, "Permission denied");
        let staging = requests
            .iter()
            .find(|r| creates_staging(r))
            .map(|r| r["path"].clone())
            .unwrap();
        let deletes: Vec<&serde_json::Value> = requests
            .iter()
            .filter(|r| r["op"] == "delete")
            .map(|r| &r["path"])
            .collect();
        assert_eq!(deletes, [&staging]);
    }

    #[test]
    fn a_staging_dir_this_run_did_not_create_is_never_deleted() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        let (result, requests) = stub_copy(&sources, |request| {
            if creates_staging(request) {
                let path = request["path"].as_str().unwrap();
                return Err(RemoteError::Failed(format!("already exists: {path}")));
            }
            healthy(request)
        });
        let result = result.unwrap();
        assert!(result.created.is_empty());
        assert!(
            result.failed[0]
                .message
                .starts_with("already exists: /remote/.terax-copy-"),
            "{:?}",
            result.failed
        );
        assert!(!requests
            .iter()
            .any(|r| r["op"] == "delete" || r["op"] == "write_bytes" || r["op"] == "publish"));
    }

    #[test]
    fn every_upload_folder_is_made_without_parents() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(src.path().join("pkg/a/b")).unwrap();
        std::fs::write(src.path().join("pkg/a/b/x.txt"), b"x").unwrap();
        let pkg = src.path().join("pkg").to_string_lossy().into_owned();
        let (result, requests) = stub_copy(&[pkg], healthy);
        assert_eq!(result.unwrap().created, ["/remote/pkg"]);
        let dirs: Vec<&serde_json::Value> = requests
            .iter()
            .filter(|r| r["op"] == "create_dir")
            .collect();
        let staging = dirs[0]["path"].as_str().unwrap();
        let paths: Vec<String> = dirs
            .iter()
            .map(|r| r["path"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            paths,
            [
                staging.to_string(),
                format!("{staging}/item"),
                format!("{staging}/item/a"),
                format!("{staging}/item/a/b"),
            ]
        );
        assert!(dirs.iter().all(|r| r["parents"] == false), "{dirs:?}");
    }

    #[test]
    fn only_ssh_failures_count_as_transport() {
        let transport =
            |code, stderr| matches!(exit_error(code, stderr), RemoteError::Transport(_));
        assert!(transport(Some(255), ""));
        assert!(transport(None, ""));
        assert!(transport(Some(127), "bash: python3: command not found"));
        assert!(transport(Some(127), "sh: python3: nicht gefunden"));
        match exit_error(Some(127), "") {
            RemoteError::Transport(message) => assert_eq!(
                message,
                "the remote helper could not start: command not found on the host (exit 127)"
            ),
            other => panic!("127 must stop the batch: {other:?}"),
        }
        assert!(transport(Some(1), "Permission denied (publickey)."));
        match exit_error(Some(137), "") {
            RemoteError::Failed(message) => {
                assert_eq!(message, "remote helper exited with status 137")
            }
            other => panic!("137 must fail only the item: {other:?}"),
        }
        assert!(matches!(
            exit_error(Some(1), "Traceback: MemoryError"),
            RemoteError::Failed(_)
        ));
    }

    #[test]
    fn a_helper_killed_on_one_item_does_not_stop_the_batch() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["big.bin", "b.txt"]);
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "write_bytes" && request["b64"] == b64encode(b"big.bin") {
                return Err(exit_error(Some(137), ""));
            }
            healthy(request)
        });
        let result = result.unwrap();
        assert_eq!(result.created, ["/remote/b.txt"]);
        assert_eq!(
            failures(&result),
            [(
                sources[0].clone(),
                "remote helper exited with status 137".to_string()
            )]
        );
        assert_eq!(requests.iter().filter(|r| r["op"] == "delete").count(), 1);
    }

    #[test]
    fn a_missing_remote_command_stops_the_batch_at_once() {
        const MISSING: &str = "the remote helper could not start: sh: 1: python: not found";
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt", "c.txt"]);

        let (result, requests) = stub_copy(&sources, |_| {
            Err(exit_error(Some(127), "sh: 1: python: not found"))
        });
        assert_eq!(result.unwrap_err(), MISSING);
        assert_eq!(requests.iter().filter(|r| creates_staging(r)).count(), 1);

        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "write_bytes" && request["b64"] == b64encode(b"b.txt") {
                return Err(exit_error(Some(127), "sh: 1: python: not found"));
            }
            healthy(request)
        });
        let result = result.unwrap();
        assert_eq!(result.created, ["/remote/a.txt"]);
        assert_eq!(
            failures(&result),
            [
                (sources[1].clone(), MISSING.to_string()),
                (sources[2].clone(), MISSING.to_string()),
            ]
        );
        assert_eq!(requests.iter().filter(|r| creates_staging(r)).count(), 2);
    }

    #[test]
    fn a_connection_lost_while_publishing_keeps_the_batch_ok() {
        const LOST: &str = "ssh: connection closed";
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt", "c.txt"]);
        for nth in [1, 2] {
            let mut publishes = 0;
            let (result, requests) = stub_copy(&sources, |request| {
                if request["op"] == "publish" {
                    publishes += 1;
                    if publishes == nth {
                        return Err(RemoteError::Transport(LOST.into()));
                    }
                }
                healthy(request)
            });
            let result = result.expect("a lost publish must not reject the batch");
            let landed: Vec<String> = ["a.txt", "b.txt"][..nth - 1]
                .iter()
                .map(|name| format!("/remote/{name}"))
                .collect();
            assert_eq!(result.created, landed);
            let mut expected = vec![(sources[nth - 1].clone(), PUBLISH_LOST.to_string())];
            expected.extend(sources[nth..].iter().map(|s| (s.clone(), LOST.to_string())));
            assert_eq!(failures(&result), expected);
            assert_eq!(requests.last().unwrap()["op"], "publish");
            assert!(!requests.iter().any(|r| r["op"] == "delete"));
        }
    }

    #[test]
    fn copy_uploads_what_the_editor_may_open_by_name() {
        let src = tempfile::tempdir().unwrap();
        let mut sources = local_sources(src.path(), &[".env", "id_ed25519"]);
        std::fs::create_dir_all(src.path().join("app/node_modules")).unwrap();
        std::fs::write(src.path().join("app/node_modules/x.pem"), b"pem").unwrap();
        sources.push(src.path().join("app").to_string_lossy().into_owned());

        let mut requests = Vec::new();
        let result = copy_with(
            &mut |request, _| {
                requests.push(request.clone());
                healthy(request)
            },
            "stub",
            &sources,
            "~/.ssh",
            true,
            &crate::modules::workspace::WorkspaceRegistry::default(),
        )
        .unwrap();
        assert!(result.failed.is_empty(), "{:?}", result.failed);
        assert_eq!(
            result.created,
            ["~/.ssh/.env", "~/.ssh/id_ed25519", "~/.ssh/app"]
        );
        let pem = |r: &serde_json::Value| {
            r["op"] == "write_bytes"
                && r["path"]
                    .as_str()
                    .unwrap()
                    .ends_with("/item/node_modules/x.pem")
        };
        assert!(requests.iter().any(pem));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_detour_to_a_secret_fails_before_any_upload() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(src.path().join("keys")).unwrap();
        std::fs::write(src.path().join("keys/id_ed25519"), b"PRIVATE").unwrap();
        std::fs::create_dir(src.path().join("pkg")).unwrap();
        std::fs::write(src.path().join("pkg/readme.md"), b"r").unwrap();
        std::os::unix::fs::symlink("../keys/id_ed25519", src.path().join("pkg/notes.txt")).unwrap();
        let pkg = src.path().join("pkg").to_string_lossy().into_owned();
        let ok = local_sources(src.path(), &["ok.txt"]).remove(0);

        let (result, requests) = stub_copy(&[pkg.clone(), ok], healthy);
        let result = result.unwrap();
        assert_eq!(result.created, ["/remote/ok.txt"]);
        assert_eq!(
            failures(&result),
            [(
                pkg,
                "refused: \"id_ed25519\" matches a sensitive-file pattern".to_string()
            )]
        );
        let stagings = requests.iter().filter(|r| creates_staging(r)).count();
        assert_eq!(stagings, 1, "only ok.txt may reach the host");
    }

    // The protected folder only shows up below the root, behind the linked parent.
    #[cfg(unix)]
    #[test]
    fn entries_below_a_linked_parent_keep_the_policy_check_over_ssh() {
        let tmp = tempfile::tempdir().unwrap();
        let base = std::fs::canonicalize(tmp.path()).unwrap();
        let roaming = base.join("home/AppData/Roaming");
        std::fs::create_dir_all(roaming.join("gcloud")).unwrap();
        std::fs::write(roaming.join("gcloud/access.db"), b"token").unwrap();
        std::os::unix::fs::symlink(base.join("home/AppData"), base.join("ad")).unwrap();
        let source = base.join("ad/Roaming").to_string_lossy().into_owned();

        let (result, requests) = stub_copy(std::slice::from_ref(&source), healthy);
        assert_eq!(
            failures(&result.unwrap()),
            [(
                source,
                "refused: path is inside a protected directory (appdata/roaming/gcloud)"
                    .to_string()
            )]
        );
        assert!(!requests.iter().any(creates_staging));
    }

    #[test]
    fn upload_plan_checks_depth_and_kinds_before_any_remote_call() {
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let plan_upload = |src: &std::path::Path, plan: &mut Vec<Upload>| {
            plan_upload(src, String::new(), 0, false, plan, &reg)
        };
        let src = tempfile::tempdir().unwrap();
        let nested = |name: &str, levels: usize| {
            let mut path = src.path().join(name);
            for _ in 0..levels {
                path.push("d");
            }
            std::fs::create_dir_all(&path).unwrap();
            src.path().join(name)
        };
        let ok = nested("ok", 128);
        let deep = nested("deep", 129);
        let mut plan = Vec::new();
        plan_upload(&ok, &mut plan).unwrap();
        assert_eq!(plan.len(), 129);
        assert_eq!(plan[0], Upload::Dir(String::new()));
        let err = plan_upload(&deep, &mut Vec::new()).unwrap_err();
        assert_eq!(err.to_string(), "folder nesting exceeds the copy limit");

        #[cfg(unix)]
        {
            let pkg = src.path().join("pkg");
            std::fs::create_dir_all(pkg.join("sub")).unwrap();
            std::fs::write(pkg.join("sub/a.txt"), b"a").unwrap();
            std::os::unix::fs::symlink("sub/a.txt", pkg.join("file-link")).unwrap();
            let mut plan = Vec::new();
            plan_upload(&pkg, &mut plan).unwrap();
            assert!(plan.iter().any(|step| matches!(
                step,
                Upload::File { rel, .. } if rel == "/file-link"
            )));
            std::os::unix::fs::symlink("sub", pkg.join("dir-link")).unwrap();
            let err = plan_upload(&pkg, &mut Vec::new()).unwrap_err();
            assert_eq!(
                err.to_string(),
                "folder symlinks cannot be copied to an SSH host"
            );
        }
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
        let local_path = |rel: &str| local.join(rel).to_string_lossy().into_owned();
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let uploaded = copy(
            &host,
            &[local_path("bin.dat"), local_path("d")],
            &base,
            true,
            &reg,
        )
        .expect("copy/upload");
        assert!(uploaded.failed.is_empty(), "{:?}", uploaded.failed);
        assert_eq!(
            uploaded.created,
            [format!("{base}/bin.dat"), format!("{base}/d")]
        );

        let entries = read_dir(&host, &base, true).expect("read_dir base");
        assert!(entries.iter().any(|e| e.name == "bin.dat"));
        assert!(entries.iter().any(|e| e.name == "d"));
        match read_file(&host, &format!("{base}/d/inner.txt")).expect("read inner") {
            crate::modules::fs::file::ReadResult::Text { content, .. } => {
                assert_eq!(content, "inner")
            }
            other => panic!("expected text, got {other:?}"),
        }

        // A clash never overwrites: refused without renaming, Finder name with it.
        let refused = copy(&host, &[local_path("bin.dat")], &base, false, &reg).expect("copy");
        assert!(refused.failed[0].message.contains("already exists"));
        create_file(&host, &format!("{base}/a.txt")).expect("create a.txt");
        std::fs::write(local.join("a.txt"), b"a").unwrap();
        #[cfg(unix)]
        {
            std::fs::create_dir_all(local.join("linked/sub")).unwrap();
            std::os::unix::fs::symlink("sub", local.join("linked/inner")).unwrap();
            let mixed = copy(
                &host,
                &[local_path("a.txt"), local_path("linked")],
                &base,
                true,
                &reg,
            )
            .expect("copy");
            assert_eq!(mixed.created, [format!("{base}/a copy.txt")]);
            assert_eq!(mixed.failed.len(), 1, "{:?}", mixed.failed);
            assert_eq!(mixed.failed[0].source, local_path("linked"));
        }
        let listing = run_remote_capture(&host, &format!("ls -A {base}"), None).expect("ls");
        assert!(
            !listing
                .stdout
                .contains(crate::modules::fs::copy::STAGING_PREFIX),
            "staging left behind: {}",
            listing.stdout
        );
        assert!(!listing.stdout.contains("linked"), "{}", listing.stdout);

        // delete is recursive — the whole tree is gone afterwards.
        delete(&host, &base).expect("delete tree");
        assert!(read_dir(&host, &base, false).is_err(), "tree must be gone");

        let _ = std::fs::remove_dir_all(&local);
    }
}
