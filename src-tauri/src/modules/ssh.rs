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
    let dir = control_dir_path(
        dirs::home_dir().as_deref(),
        &std::env::temp_dir(),
        crate::modules::variant::suffix(),
    );
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    dir
}

/// A side-by-side build gets its own folder: sharing one would let it ride
/// the installed app's masters and `-O exit` them when it quits.
#[cfg_attr(not(unix), allow(dead_code))]
fn control_dir_path(
    home: Option<&std::path::Path>,
    temp: &std::path::Path,
    variant: Option<&str>,
) -> std::path::PathBuf {
    use crate::modules::variant::scoped_name;
    match home {
        Some(home) => home
            .join(".terax")
            .join(scoped_name("ssh-control", variant)),
        None => temp.join(scoped_name("terax-ssh-control", variant)),
    }
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
const REMOTE_PYTHON: &str = r#"import sys, os, json, tempfile, shutil, base64, functools, errno, time


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
from stat import S_IMODE, S_ISDIR, S_ISREG

MAX_READ = 10 * 1024 * 1024
MAX_ENTRIES = 100000
SEARCH_PRUNE = {"node_modules", ".git", "target", "dist", "build", ".next",
                ".turbo", ".cache", ".venv", "__pycache__"}
SEARCH_MAX_SCANNED = 500000
SEARCH_MAX_HITS = 2000
GREP_FILE_CAP = 5 * 1024 * 1024
# Mirror of copy.rs is_staging_name (pinned by tests): never listed or entered.
STAGING_PREFIX = ".terax-copy-"
STAGING_RANDOM_LEN = 8
_STAGING_TAIL = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_")


def _staging(name):
    tail = name[len(STAGING_PREFIX):]
    return (name.startswith(STAGING_PREFIX) and len(tail) == STAGING_RANDOM_LEN
            and all(c in _STAGING_TAIL for c in tail))


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


def exists(req):
    return os.path.lexists(os.path.expanduser(req["path"]))


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


READ_MISSING = "missing"
READ_NOT_REGULAR = "not_regular"
READ_TOO_LARGE = "too_large"
EXACT_UNSUPPORTED = "this host cannot open a file without following symlinks"
PATH_CHANGED = "the path changed while it was read"


class _Refused(ValueError):
    # A read_bytes refusal with a fixed kind; main adds the kind to the envelope
    # and the message stays the one read_bytes always gave.
    def __init__(self, kind, message):
        ValueError.__init__(self, message)
        self.kind = kind


def _open_exact(real):
    # Opens the resolved path one component at a time without following any
    # symlink: no component of `real` is a link when it is opened, and the file
    # was at `real` at that moment. A folder swapped for a link after realpath
    # is refused. Not caught: a folder moved after it was entered, and a folder
    # or file swapped for another real one (or a hard link); then whatever lies
    # at the path when it is opened is read. A host that cannot open this way
    # refuses.
    if not (os.open in os.supports_dir_fd and hasattr(os, "O_NOFOLLOW")
            and hasattr(os, "O_DIRECTORY")):
        raise ValueError(EXACT_UNSUPPORTED)
    parts = real.split("/")
    if parts[0] != "":
        raise ValueError("not an absolute path: " + real)
    walk = getattr(os, "O_PATH", os.O_RDONLY) | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open("/", walk)
    try:
        for name in parts[1:-1]:
            step = os.open(name, walk, dir_fd=fd)
            os.close(fd)
            fd = step
        return os.open(parts[-1], os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | os.O_NOFOLLOW,
                       dir_fd=fd)
    except FileNotFoundError as ex:
        raise _Refused(READ_MISSING, str(ex))
    except OSError as ex:
        # A link where realpath saw none: ELOOP, or ENOTDIR with O_DIRECTORY on Linux.
        if ex.errno in (errno.ELOOP, errno.ENOTDIR):
            raise ValueError(PATH_CHANGED)
        raise
    finally:
        os.close(fd)


def read_bytes(req):
    # Reads the resolved target and reports it, so the caller can refuse a
    # symlink to a secret; O_NONBLOCK keeps a FIFO swapped in from blocking.
    # With "exact" the open follows no link on the way (see _open_exact for
    # what that does and does not catch). The descriptor is checked before it
    # becomes a file object and closed on every refusal.
    path = os.path.expanduser(req["path"])
    limit = min(int(req.get("limit", MAX_READ)), MAX_READ)
    real = os.path.realpath(path)
    try:
        mode = os.stat(real).st_mode
    except FileNotFoundError as ex:
        raise _Refused(READ_MISSING, str(ex))
    if not S_ISREG(mode):
        raise _Refused(READ_NOT_REGULAR, "not a regular file: " + path)
    flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0)
    fd = _open_exact(real) if req.get("exact") else os.open(real, flags)
    try:
        st = os.fstat(fd)
        if not S_ISREG(st.st_mode):
            raise _Refused(READ_NOT_REGULAR, "not a regular file: " + path)
        if st.st_size > limit:
            raise _Refused(READ_TOO_LARGE, "file too large to preview: %d bytes (limit %d)"
                           % (st.st_size, limit))
        f = os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise
    with f:
        data = f.read(limit + 1)
    if len(data) > limit:
        raise _Refused(READ_TOO_LARGE, "file too large to preview (limit %d bytes)" % limit)
    return {"real": real, "b64": base64.b64encode(data).decode("ascii")}


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
    # Exact, unlike mkdir's umask-cut mode; a failure fails the folder, never widens it.
    if req.get("mode") is not None:
        os.chmod(path, req["mode"])
    return True


def mkstage(req):
    # mkdtemp picks a free name and creates it 0700 in one step; never the parent.
    return tempfile.mkdtemp(prefix=STAGING_PREFIX, dir=os.path.expanduser(req["path"]))


UPLOAD_KEEP_SECS = 7 * 24 * 3600


def prep_uploads(req):
    # Absolute, because a quoted pasted path is never tilde-expanded by the shell.
    path = os.path.join(os.path.expanduser("~"), ".terax", "uploads")
    if not os.path.isabs(path):
        raise ValueError("could not resolve the home directory")
    for d in (os.path.dirname(path), path):
        try:
            os.mkdir(d, 0o700)
        except FileExistsError:
            pass
    # A link here could aim the sweep below at files outside the folder.
    if not S_ISDIR(os.lstat(path).st_mode):
        raise NotADirectoryError("upload folder is not a plain folder: " + path)
    # Uploads keep their source mode, so owner-only access comes from the folder.
    os.chmod(path, 0o700)
    _sweep_uploads(path, time.time() - UPLOAD_KEEP_SECS)
    return path


def _sweep_uploads(path, cutoff):
    # Silent and best effort: what cannot go now goes on a later upload.
    try:
        entries = list(os.scandir(path))
    except OSError:
        return
    for e in entries:
        try:
            st = e.stat(follow_symlinks=False)
            if st.st_mtime >= cutoff:
                continue
            if S_ISDIR(st.st_mode):
                if _staging(e.name):
                    shutil.rmtree(os.path.join(path, e.name), ignore_errors=True)
                continue
            os.unlink(os.path.join(path, e.name))
        except OSError:
            pass


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


NO_HARDLINKS = (errno.ENOTSUP, errno.EOPNOTSUPP, errno.EPERM, errno.ENOSYS,
                errno.EXDEV, errno.EMLINK)
# SMB servers refuse a rename onto an existing folder with any of these.
FOLDER_SWAP_REFUSED = (errno.EEXIST, errno.ENOTEMPTY, errno.EACCES, errno.EPERM,
                       errno.EISDIR)


class _Taken(Exception):
    pass


class _Foreign(FileExistsError):
    pass


def _file_id(path):
    try:
        st = os.lstat(path)
    except OSError:
        return None
    return (st.st_dev, st.st_ino)


def _reserve_and_swap(src, dst, is_dir):
    # The exclusive placeholder aims the rename at our own empty entry; another
    # writer can still race in between, and cleanup then leaves what took its place.
    try:
        if is_dir:
            os.mkdir(dst)
        else:
            os.close(os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
    except FileExistsError:
        raise _Taken()
    claim = _file_id(dst)
    try:
        try:
            os.rename(src, dst)
        except OSError as ex:
            if not is_dir or ex.errno not in FOLDER_SWAP_REFUSED:
                raise
            # Another writer may have filled the claim since: never mix into or remove it.
            if os.listdir(dst):
                raise _Foreign("already exists: " + dst)
            _fill_claim(src, dst)
    except _Foreign:
        raise
    except BaseException:
        if _file_id(dst) == claim:
            try:
                (os.rmdir if is_dir else os.unlink)(dst)
            except OSError:
                pass
        raise


def _fill_claim(src, dst):
    # A failure takes back what moved, so the caller only removes an empty claim.
    try:
        os.chmod(dst, S_IMODE(os.lstat(src).st_mode))
    except OSError:
        pass
    moved = []
    try:
        for name in os.listdir(src):
            os.rename(os.path.join(src, name), os.path.join(dst, name))
            moved.append(os.path.join(dst, name))
    except BaseException:
        for path in reversed(moved):
            try:
                if os.path.isdir(path) and not os.path.islink(path):
                    shutil.rmtree(path)
                else:
                    os.unlink(path)
            except OSError:
                pass
        raise
    try:
        os.rmdir(src)
    except OSError:
        pass


def _place(src, dst):
    # A hardlink publishes a file without any replace window; folders and
    # hosts without hardlinks fall back to the reservation.
    if S_ISDIR(os.lstat(src).st_mode):
        _reserve_and_swap(src, dst, True)
        return
    try:
        os.link(src, dst)
    except FileExistsError:
        raise _Taken()
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
    # The first name not taken wins; only a claim moves on, so a failing swap
    # onto our own placeholder fails the item, as in copy.rs. None: all taken.
    src = os.path.expanduser(req["from"]); base = os.path.expanduser(req["dir"])
    for name in req["names"]:
        try:
            _place(src, base + name)
        except _Taken:
            continue
        # Cleanup rides on the publish run; only a staging dir is ever removed.
        staging = req.get("staging")
        if staging and _staging(os.path.basename(staging)):
            shutil.rmtree(os.path.expanduser(staging), ignore_errors=True)
        return name
    return None


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
       "exists": exists, "realpath": realpath, "read_file": read_file,
       "read_bytes": read_bytes, "write_file": write_file,
       "create_file": create_file, "create_dir": create_dir, "mkstage": mkstage,
       "prep_uploads": prep_uploads,
       "rename": rename, "delete": delete, "publish": publish,
       "write_bytes": write_bytes, "search": search, "grep": grep}


def main():
    try:
        req = json.loads(sys.stdin.read())
        data = OPS[req["op"]](req)
        out = json.dumps({"ok": True, "data": data})
    except Exception as ex:
        reply = {"ok": False, "error": str(ex)}
        if isinstance(ex, _Refused):
            reply["kind"] = ex.kind
        out = json.dumps(reply)
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

/// `None` on any malformed input, so a garbled reply never yields partial bytes.
fn b64decode(s: &str) -> Option<Vec<u8>> {
    fn sextet(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some(u32::from(c - b'A')),
            b'a'..=b'z' => Some(u32::from(c - b'a') + 26),
            b'0'..=b'9' => Some(u32::from(c - b'0') + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let bytes = s.as_bytes();
    if !bytes.len().is_multiple_of(4) {
        return None;
    }
    let quads = bytes.len() / 4;
    let mut out = Vec::with_capacity(quads * 3);
    for (i, quad) in bytes.chunks(4).enumerate() {
        let pad = quad.iter().rev().take_while(|&&c| c == b'=').count();
        if pad > 2 || (pad > 0 && i + 1 != quads) {
            return None;
        }
        let mut n = 0u32;
        for &c in &quad[..4 - pad] {
            n = (n << 6) | sextet(c)?;
        }
        n <<= 6 * pad as u32;
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Some(out)
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
/// `fs_read_file`, `fs_canonicalize`, `fs_stat`) and the control steps of a
/// copy (staging, folders, publish, cleanup). Generous, because a healthy
/// but slow transfer must not be truncated; it still bounds a wedged host so a
/// single open can't hang forever. Only the remote path carries this — local FS
/// ops get no kill-timeout (they just run off the main thread).
pub const REMOTE_FS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

// An upload write scales with its size on the wire, so a link doing 64 KiB/s
// finishes while a hung host frees the paste instead of holding it until restart.
const WRITE_BASE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const WRITE_TIMEOUT_PER_64_KIB: std::time::Duration = std::time::Duration::from_secs(1);
// The path, the keys and the mode around the base64 body of a write request.
const WRITE_REQUEST_OVERHEAD: usize = 4096;

fn write_timeout(file_len: usize) -> std::time::Duration {
    let wire = file_len
        .div_ceil(3)
        .saturating_mul(4)
        .saturating_add(WRITE_REQUEST_OVERHEAD);
    let chunks = u32::try_from(wire.div_ceil(64 * 1024)).unwrap_or(u32::MAX);
    WRITE_BASE_TIMEOUT + WRITE_TIMEOUT_PER_64_KIB * chunks
}

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
/// goes on after the others (only this op failed on a reachable host).
#[derive(Debug)]
enum RemoteError {
    Transport(String),
    Failed(String),
    /// The helper died by a signal before it answered: like `Failed` on a
    /// reachable host, but what the op already did is unknown.
    Killed(String),
    /// The step ran past its budget and was killed; the host may only be slow.
    TimedOut(String),
}

impl From<RemoteError> for String {
    fn from(error: RemoteError) -> Self {
        match error {
            RemoteError::Transport(message)
            | RemoteError::Failed(message)
            | RemoteError::Killed(message)
            | RemoteError::TimedOut(message) => message,
        }
    }
}

/// ssh reports its own failures (connect, auth, a dropped master) as 255; every
/// other status is the remote command's.
const SSH_OWN_FAILURE_EXIT: i32 = 255;
/// The remote shell's "command not found": the helper never ran, so no item can.
const COMMAND_NOT_FOUND_EXIT: i32 = 127;

/// Last stderr line, where Python puts a start failure (SyntaxError, ImportError).
/// A shell reporting a killed helper echoes our whole command; that line says nothing.
fn stderr_excerpt(stderr: &str) -> String {
    let line = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.contains(HELPER_DECODE));
    line.unwrap_or_default().chars().take(200).collect()
}

fn with_stderr(message: String, stderr: &str) -> String {
    match stderr_excerpt(stderr) {
        excerpt if excerpt.is_empty() => message,
        excerpt => format!("{message} (stderr: {excerpt})"),
    }
}

/// Only ssh's own exit reads stderr as an ssh message: a helper's stderr may
/// say "Permission denied" about a file, never about the login.
fn exit_error(code: Option<i32>, stderr: &str) -> RemoteError {
    let excerpt = stderr_excerpt(stderr);
    match code {
        Some(COMMAND_NOT_FOUND_EXIT) if stderr.contains("python3") => RemoteError::Transport(
            "python3 isn't installed on the host; the remote file browser requires it.".to_string(),
        ),
        // The helper answers every request with exit 0; below the signal range
        // it never ran here, so every item would fail the same way.
        Some(code @ 1..=COMMAND_NOT_FOUND_EXIT) => RemoteError::Transport(if excerpt.is_empty() {
            format!("the remote helper could not start (exit {code})")
        } else {
            format!("the remote helper could not start: {excerpt}")
        }),
        Some(code @ 128..SSH_OWN_FAILURE_EXIT) => RemoteError::Killed(with_stderr(
            format!("remote helper exited with status {code}"),
            stderr,
        )),
        _ => RemoteError::Transport(classify_ssh_error(stderr).unwrap_or_else(|| {
            if stderr.is_empty() {
                "ssh command failed".to_string()
            } else {
                format!("ssh: {stderr}")
            }
        })),
    }
}

const HELPER_DECODE: &str = "| base64 -d)";

// sh, bash and zsh exec a lone command, so a killed helper reaches ssh as exit-signal
// (255); a trailing `exit`, which fish parses too, keeps the shell to report 128+N.
fn shell_command(program: &str) -> String {
    format!("{program}; exit")
}

/// The helper as one shell-safe argument; it never changes, so it is encoded once.
fn remote_command() -> &'static str {
    static COMMAND: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    COMMAND.get_or_init(|| {
        let b64 = b64encode(REMOTE_PYTHON.as_bytes());
        shell_command(&format!("python3 -c \"$(printf %s {b64} {HELPER_DECODE}\""))
    })
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
    let exit = ssh_helper(host, request, timeout)?;
    read_envelope(exit.code, &exit.stdout, exit.overflow, &exit.stderr)
}

/// What one helper run left behind, before anyone reads its answer.
struct HelperExit {
    code: Option<i32>,
    stdout: Vec<u8>,
    overflow: bool,
    /// Trimmed.
    stderr: String,
}

/// A helper run as the typed reads take it from their executor.
type HelperRun = Result<HelperExit, RemoteError>;

/// The program a helper run starts, with arguments put before the ssh ones.
struct Launcher {
    program: &'static str,
    args: &'static [&'static str],
}

/// `ssh` and nothing else: the command every helper op runs in the app.
const SSH_LAUNCHER: Launcher = Launcher {
    program: "ssh",
    args: &[],
};

/// Every helper op over ssh: [`run_remote_helper`] with [`SSH_LAUNCHER`].
fn ssh_helper(
    host: &str,
    request: &serde_json::Value,
    timeout: Option<std::time::Duration>,
) -> HelperRun {
    run_remote_helper(&SSH_LAUNCHER, host, request, timeout)
}

/// The one exec behind every helper op; `timeout` goes straight to
/// `wait_child`. `Err` is `Transport` before an exit (host, spawn, pipes,
/// wait) or `TimedOut` once `timeout` killed it.
fn run_remote_helper(
    launcher: &Launcher,
    host: &str,
    request: &serde_json::Value,
    timeout: Option<std::time::Duration>,
) -> HelperRun {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use RemoteError::Transport;

    validate_ssh_host(host).map_err(Transport)?;
    note_connected_host(host);
    let request_json = serde_json::to_string(request).map_err(|e| Transport(e.to_string()))?;

    let mut cmd = Command::new(launcher.program);
    cmd.args(launcher.args)
        .arg("-T")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=10");
    for arg in control_args() {
        cmd.arg(arg);
    }
    cmd.arg(host)
        .arg(remote_command())
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
            return Err(RemoteError::TimedOut(timed_out_msg(host, op, budget)));
        }
    };
    let _ = writer.join();
    let (stdout_bytes, overflow) = out_reader.join().unwrap_or((Vec::new(), false));
    let (stderr_bytes, _) = err_reader.join().unwrap_or((Vec::new(), false));
    let stderr = String::from_utf8_lossy(&stderr_bytes);
    Ok(HelperExit {
        code: status.code(),
        stdout: stdout_bytes,
        overflow,
        stderr: stderr.trim().to_string(),
    })
}

/// An ssh failure is transport whatever reached stdout; on any other exit the
/// helper's answer stands, and only without one does the exit code decide.
fn read_envelope(
    code: Option<i32>,
    stdout: &[u8],
    overflow: bool,
    stderr: &str,
) -> Result<serde_json::Value, RemoteError> {
    if matches!(code, None | Some(SSH_OWN_FAILURE_EXIT)) {
        return Err(exit_error(code, stderr));
    }
    match helper_answer(stdout, overflow, stderr) {
        Err(RemoteError::Transport(_)) if code != Some(0) => Err(exit_error(code, stderr)),
        answer => answer,
    }
}

/// Only a sentinel-prefixed object with a boolean `ok` is the helper's answer;
/// its error fails the item, anything else is transport.
fn helper_answer(
    stdout: &[u8],
    overflow: bool,
    stderr: &str,
) -> Result<serde_json::Value, RemoteError> {
    use RemoteError::{Failed, Transport};
    if overflow {
        return Err(Transport(
            "remote response exceeded the 16 MiB limit".to_string(),
        ));
    }
    let no_answer = |message: String| Transport(with_stderr(message, stderr));
    // The sentinel follows any login-shell banner/MOTD; without it the helper
    // never answered, so the banner text is no JSON error to parse.
    let json_bytes = match find_subslice(stdout, TERAX_SENTINEL) {
        Some(i) => &stdout[i + TERAX_SENTINEL.len()..],
        None if stdout.is_empty() => {
            return Err(no_answer("no response from the remote helper".to_string()))
        }
        None => {
            let preview = String::from_utf8_lossy(&stdout[..stdout.len().min(200)]);
            return Err(no_answer(format!(
                "unexpected remote output (no response marker): {}",
                preview.trim()
            )));
        }
    };
    let mut envelope: serde_json::Value = serde_json::from_slice(json_bytes)
        .map_err(|e| no_answer(format!("bad remote response: {e}")))?;
    match envelope.get("ok").and_then(serde_json::Value::as_bool) {
        Some(true) => Ok(envelope
            .get_mut("data")
            .map(serde_json::Value::take)
            .unwrap_or(serde_json::Value::Null)),
        Some(false) => Err(Failed(
            envelope
                .get("error")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown remote error")
                .to_string(),
        )),
        None => Err(no_answer(
            "bad remote response: no ok field in the reply".to_string(),
        )),
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
/// local control socket (`ssh -O check`), so it never opens a fresh connection
/// or prompts; a wedged master counts as not alive after
/// [`REMOTE_POLL_TIMEOUT`]. Always false where ControlMaster is unavailable
/// (non-unix).
pub fn master_alive(host: &str) -> bool {
    master_pid(host).is_some()
}

/// The live master's pid, which tells one connection to `host` from the next
/// one (port forwards die with the master that holds them). Same probe as
/// [`master_alive`].
pub fn master_pid(host: &str) -> Option<u32> {
    master_pid_at(&control_args(), host)
}

/// [`master_pid`] for an explicit set of control args (another control dir).
pub fn master_pid_at(control: &[String], host: &str) -> Option<u32> {
    if validate_ssh_host(host).is_err() {
        return None;
    }
    #[cfg(unix)]
    {
        let mut args = control.to_vec();
        args.extend(["-O".to_string(), "check".to_string(), host.to_string()]);
        match run_control_command(&args, REMOTE_POLL_TIMEOUT) {
            Ok((Some(0), stderr)) => parse_master_pid(&stderr),
            Ok(_) => None,
            Err(e) => {
                log::warn!("ssh -O check {host}: {e}");
                None
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = control;
        None
    }
}

/// `ssh` with `args` that only talk to the local control socket (`-O ...`),
/// within `timeout`: a stopped or wedged master would otherwise block the
/// caller for good. Returns the exit code and stderr.
#[cfg_attr(not(unix), allow(dead_code))]
pub(crate) fn run_control_command(
    args: &[String],
    timeout: std::time::Duration,
) -> Result<(Option<i32>, String), String> {
    use std::process::{Command, Stdio};
    let mut cmd = Command::new("ssh");
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    crate::modules::proc::hide_console(&mut cmd);
    let child = std::sync::Arc::new(
        shared_child::SharedChild::spawn(&mut cmd).map_err(|e| format!("ssh spawn failed: {e}"))?,
    );
    let mut stderr = child.take_stderr().ok_or("no ssh stderr")?;
    let reader = std::thread::spawn(move || read_capped(&mut stderr, 64 * 1024).0);
    let status = wait_child(&child, Some(timeout))?.ok_or_else(|| {
        format!(
            "ssh -O did not answer within {}s and was killed",
            timeout.as_secs()
        )
    })?;
    let stderr = reader.join().unwrap_or_default();
    Ok((status.code(), String::from_utf8_lossy(&stderr).into_owned()))
}

/// `ssh -O check` answers `Master running (pid=1234)` on stderr.
#[cfg_attr(not(unix), allow(dead_code))]
fn parse_master_pid(stderr: &str) -> Option<u32> {
    let rest = &stderr[stderr.find("(pid=")? + "(pid=".len()..];
    rest[..rest.find(')')?].parse().ok()
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

pub struct RemoteFileBytes {
    pub resolved_path: String,
    pub bytes: Vec<u8>,
}

/// Refused host-side above `limit`, so an oversized file never crosses the wire.
pub fn read_bytes(
    host: &str,
    path: &str,
    limit: u64,
    expected_size: Option<u64>,
) -> Result<RemoteFileBytes, String> {
    let data = run_remote_json(
        host,
        &serde_json::json!({ "op": "read_bytes", "path": path, "limit": limit }),
        Some(read_bytes_timeout(limit, expected_size)),
    )?;
    parse_read_bytes(data)
}

// Budgeted like an upload of the reply's size: a known size keeps a stuck read
// of a small icon short, an unknown one budgets for the cap.
fn read_bytes_timeout(limit: u64, expected_size: Option<u64>) -> std::time::Duration {
    let size = expected_size.map_or(limit, |size| size.min(limit));
    write_timeout(usize::try_from(size).unwrap_or(usize::MAX)).max(REMOTE_FS_TIMEOUT)
}

fn parse_read_bytes(data: serde_json::Value) -> Result<RemoteFileBytes, String> {
    #[derive(serde::Deserialize)]
    struct Reply {
        real: String,
        b64: String,
    }
    let reply: Reply =
        serde_json::from_value(data).map_err(|e| format!("bad read_bytes response: {e}"))?;
    let bytes = b64decode(&reply.b64)
        .ok_or_else(|| "bad read_bytes response: invalid base64".to_string())?;
    Ok(RemoteFileBytes {
        resolved_path: reply.real,
        bytes,
    })
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

/// Failure kind of a typed remote read; `read_bytes` keeps its text error.
/// `Missing`, `NotRegularFile` and `TooLarge` come from the fixed kind the
/// helper puts in its envelope. The texts of the other three are the host's
/// or ssh's own words (paths and errors of the host, ssh's stderr) or this
/// module's messages (the refused session, the hints of
/// `classify_ssh_error`, the timeout, a helper killed by a signal, a reply
/// that does not parse, a target that is not exact, the two fixed reasons
/// of the helper's exact open); always without control, line separator or
/// direction characters and cut to 300 characters.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteReadError {
    Unreachable(String),
    TimedOut(String),
    Failed(String),
    Missing,
    NotRegularFile,
    TooLarge,
}

/// Fixed kinds of a `read_bytes` refusal; each matches the helper's
/// `READ_*` line (pinned by test).
const READ_MISSING: &str = "missing";
const READ_NOT_REGULAR: &str = "not_regular";
const READ_TOO_LARGE: &str = "too_large";

/// Reason for a session the server refused, in place of the login hint
/// `classify_ssh_error` gives for the `Permission denied` ssh prints after.
const SESSION_REFUSED: &str = "the SSH server refused another session (MaxSessions limit)";

/// Longest host or ssh text a typed error carries.
const MAX_REASON_CHARS: usize = 300;

/// The one test for a refused session, used by the typed reads only.
fn session_refused(stderr: &str) -> Option<&'static str> {
    stderr
        .to_ascii_lowercase()
        .contains("session open refused by peer")
        .then_some(SESSION_REFUSED)
}

/// Characters that could break a log line or reorder a toast: controls, the
/// line and paragraph separators and the invisible format and direction marks.
fn unsafe_in_reason(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{061C}'
                | '\u{200B}'..='\u{200F}'
                | '\u{2028}'..='\u{202E}'
                | '\u{2066}'..='\u{2069}'
                | '\u{FEFF}'
        )
}

/// The host's text with each unsafe character turned into a space, cut short.
fn host_reason(text: &str) -> String {
    let flat: String = text
        .chars()
        .map(|c| if unsafe_in_reason(c) { ' ' } else { c })
        .take(MAX_REASON_CHARS)
        .collect();
    flat.trim().to_string()
}

fn read_error(error: RemoteError) -> RemoteReadError {
    match error {
        RemoteError::Transport(message) => RemoteReadError::Unreachable(host_reason(&message)),
        RemoteError::TimedOut(message) => RemoteReadError::TimedOut(host_reason(&message)),
        RemoteError::Failed(message) => RemoteReadError::Failed(host_reason(&message)),
        RemoteError::Killed(message) => RemoteReadError::Failed(host_reason(&message)),
    }
}

/// The fixed kind of a helper error envelope, if it carries one.
fn refusal_kind(stdout: &[u8]) -> Option<RemoteReadError> {
    let at = find_subslice(stdout, TERAX_SENTINEL)? + TERAX_SENTINEL.len();
    let envelope: serde_json::Value = serde_json::from_slice(&stdout[at..]).ok()?;
    match envelope.get("kind")?.as_str()? {
        READ_MISSING => Some(RemoteReadError::Missing),
        READ_NOT_REGULAR => Some(RemoteReadError::NotRegularFile),
        READ_TOO_LARGE => Some(RemoteReadError::TooLarge),
        _unknown_kind => None,
    }
}

/// The sorting all three typed reads share: a refused session first, then the
/// answer as `read_envelope` reads it, with the helper's fixed kind kept.
fn typed_answer(exit: HelperRun) -> Result<serde_json::Value, RemoteReadError> {
    let exit = exit.map_err(read_error)?;
    if matches!(exit.code, None | Some(SSH_OWN_FAILURE_EXIT)) {
        if let Some(reason) = session_refused(&exit.stderr) {
            return Err(RemoteReadError::Unreachable(reason.to_string()));
        }
    }
    match read_envelope(exit.code, &exit.stdout, exit.overflow, &exit.stderr) {
        Ok(data) => Ok(data),
        Err(RemoteError::Failed(message)) => Err(refusal_kind(&exit.stdout)
            .unwrap_or_else(|| read_error(RemoteError::Failed(message)))),
        Err(other) => Err(read_error(other)),
    }
}

/// A reported target must be absolute without a `.`, `..` or empty segment
/// (`/` itself has none).
fn exact_target(path: String) -> Result<String, RemoteReadError> {
    let exact = path == "/"
        || (path.starts_with('/')
            && path[1..].split('/').all(|segment| !matches!(segment, "" | "." | "..")));
    if exact {
        Ok(path)
    } else {
        Err(RemoteReadError::Failed(
            "the host reported a path that is not absolute and normalized".to_string(),
        ))
    }
}

/// `read_bytes` with the failure kind kept. The request asks for the exact
/// open (`_open_exact` in the helper), and `budget` alone bounds the `ssh`
/// call: once it runs out the process is killed and the result is `TimedOut`.
pub fn read_bytes_typed(
    host: &str,
    path: &str,
    limit: u64,
    budget: std::time::Duration,
) -> Result<RemoteFileBytes, RemoteReadError> {
    read_bytes_typed_with(host, path, limit, budget, ssh_helper)
}

fn read_bytes_typed_with(
    host: &str,
    path: &str,
    limit: u64,
    budget: std::time::Duration,
    run: impl FnOnce(&str, &serde_json::Value, Option<std::time::Duration>) -> HelperRun,
) -> Result<RemoteFileBytes, RemoteReadError> {
    let request =
        serde_json::json!({ "op": "read_bytes", "path": path, "limit": limit, "exact": true });
    read_bytes_answer(run(host, &request, Some(budget)))
}

fn read_bytes_answer(exit: HelperRun) -> Result<RemoteFileBytes, RemoteReadError> {
    let file =
        parse_read_bytes(typed_answer(exit)?).map_err(|e| read_error(RemoteError::Failed(e)))?;
    Ok(RemoteFileBytes {
        resolved_path: exact_target(file.resolved_path)?,
        bytes: file.bytes,
    })
}

/// `realpath` with the failure kind kept, on the budget of `realpath`.
pub fn realpath_typed(host: &str, path: &str) -> Result<String, RemoteReadError> {
    realpath_typed_with(host, path, ssh_helper)
}

fn realpath_typed_with(
    host: &str,
    path: &str,
    run: impl FnOnce(&str, &serde_json::Value, Option<std::time::Duration>) -> HelperRun,
) -> Result<String, RemoteReadError> {
    let request = serde_json::json!({ "op": "realpath", "path": path });
    realpath_answer(run(host, &request, Some(REMOTE_FS_TIMEOUT)))
}

fn realpath_answer(exit: HelperRun) -> Result<String, RemoteReadError> {
    let real: String = serde_json::from_value(typed_answer(exit)?)
        .map_err(|e| read_error(RemoteError::Failed(format!("bad realpath response: {e}"))))?;
    exact_target(real)
}

/// `stat` with the failure kind kept, on the budget of `stat`.
pub fn stat_typed(
    host: &str,
    path: &str,
) -> Result<crate::modules::fs::file::FileStat, RemoteReadError> {
    stat_typed_with(host, path, ssh_helper)
}

fn stat_typed_with(
    host: &str,
    path: &str,
    run: impl FnOnce(&str, &serde_json::Value, Option<std::time::Duration>) -> HelperRun,
) -> Result<crate::modules::fs::file::FileStat, RemoteReadError> {
    let request = serde_json::json!({ "op": "stat", "path": path });
    stat_answer(run(host, &request, Some(REMOTE_FS_TIMEOUT)))
}

fn stat_answer(exit: HelperRun) -> Result<crate::modules::fs::file::FileStat, RemoteReadError> {
    serde_json::from_value(typed_answer(exit)?)
        .map_err(|e| read_error(RemoteError::Failed(format!("bad stat response: {e}"))))
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

const UPLOAD_DIR_TAIL: &str = "/.terax/uploads";

/// The terminal upload folder on `host`, resolved to an absolute path, owner
/// only, swept of what is older than 7 days. Uploads themselves go through `fs_copy`.
#[tauri::command]
pub async fn ssh_prepare_upload_dir(host: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_upload_dir(&host))
        .await
        .map_err(|e| format!("ssh_prepare_upload_dir task failed: {e}"))?
}

fn prepare_upload_dir(host: &str) -> Result<String, String> {
    validate_ssh_host(host)?;
    prepare_upload_dir_with(&mut |request, timeout| run_remote_json(host, request, timeout))
}

fn prepare_upload_dir_with(run: &mut RemoteRun) -> Result<String, String> {
    let data = run(&serde_json::json!({ "op": "prep_uploads" }), Some(REMOTE_FS_TIMEOUT))?;
    match data.as_str() {
        Some(path) if path.starts_with('/') && path.ends_with(UPLOAD_DIR_TAIL) => {
            Ok(path.to_string())
        }
        _ => Err(format!("bad prep_uploads response: {data}")),
    }
}

type RemoteReply = Result<serde_json::Value, RemoteError>;

/// The copy path's transport, so tests can swap in a stub.
type RemoteRun<'a> = dyn FnMut(&serde_json::Value, Option<std::time::Duration>) -> RemoteReply + 'a;

/// `rel` is relative to the staged item.
#[cfg_attr(test, derive(Debug, PartialEq))]
enum Upload {
    Dir {
        rel: String,
        mode: Option<u32>,
    },
    File {
        src: std::path::PathBuf,
        rel: String,
        mode: Option<u32>,
        /// Planned as a link, so the read follows it to the judged target.
        link: bool,
    },
}

/// Walks the local source once before any remote call, so an item that cannot
/// be uploaded fails without touching the host. `check_source` judged a plain root.
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
        plan.push(Upload::Dir {
            rel: rel.clone(),
            mode: file_mode(&meta).map(copy::dir_mode),
        });
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            if !copy::is_copyable(entry.file_type()?) || copy::is_staging_entry(&entry) {
                continue;
            }
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
    let link = meta.file_type().is_symlink();
    let target = if link {
        copy::guard_link(src, depth == 0)?;
        std::fs::metadata(src).map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => broken_symlink(src, &rel),
            _ => error,
        })?
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
        link,
    });
    Ok(())
}

fn broken_symlink(src: &std::path::Path, rel: &str) -> std::io::Error {
    let entry = match rel.strip_prefix('/') {
        Some(rel) => rel.to_string(),
        None => src.file_name().map_or_else(
            || src.display().to_string(),
            |name| name.to_string_lossy().into_owned(),
        ),
    };
    std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("broken symlink: {entry}"),
    )
}

// A killed step only leaves a half-written item in the hidden staging.
fn upload(run: &mut RemoteRun, plan: &[Upload], item: &str) -> Result<(), RemoteError> {
    for step in plan {
        let (request, budget) = match step {
            Upload::Dir { rel, mode } => (
                serde_json::json!({
                    "op": "create_dir", "path": format!("{item}{rel}"), "parents": false,
                    "mode": mode,
                }),
                Some(REMOTE_FS_TIMEOUT),
            ),
            Upload::File {
                src,
                rel,
                mode,
                link,
            } => {
                let bytes =
                    read_planned(src, *link).map_err(|e| RemoteError::Failed(e.to_string()))?;
                let request = serde_json::json!({
                    "op": "write_bytes", "path": format!("{item}{rel}"),
                    "b64": b64encode(&bytes), "mode": mode,
                });
                (request, Some(write_timeout(bytes.len())))
            }
        };
        run(&request, budget)?;
    }
    Ok(())
}

#[cfg(unix)]
fn read_planned(src: &std::path::Path, link: bool) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    crate::modules::fs::copy::open_planned(src, link)?.read_to_end(&mut bytes)?;
    Ok(bytes)
}

#[cfg(not(unix))]
fn read_planned(src: &std::path::Path, _link: bool) -> std::io::Result<Vec<u8>> {
    std::fs::read(src)
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

/// `dest` itself is never created; the name check guards the cleanup's
/// recursive delete.
fn make_staging(run: &mut RemoteRun, dest: &str) -> Result<String, RemoteError> {
    let request = serde_json::json!({ "op": "mkstage", "path": format!("{dest}/") });
    let data = run(&request, Some(REMOTE_FS_TIMEOUT))?;
    match data.as_str() {
        Some(path)
            if path
                .rsplit('/')
                .next()
                .is_some_and(crate::modules::fs::copy::is_staging_name) =>
        {
            Ok(path.to_string())
        }
        _ => Err(RemoteError::Failed(format!("bad mkstage response: {data}"))),
    }
}

/// A lost connection rejects the batch only on the first item; later the result
/// stays Ok with `aborted` set, so the explorer can still show what landed.
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

const PUBLISH_LOST: &str = "connection lost while publishing";
const PUBLISH_KILLED: &str = "remote helper stopped while publishing";
const PUBLISH_TIMED_OUT: &str = "publishing timed out";

/// A publish cut off leaves its item's fate unknown, so it neither rejects the
/// batch nor counts as created. Only a lost connection also stops the batch.
#[derive(Debug)]
enum ItemError {
    Remote(RemoteError),
    PublishLost(String),
    /// `reason` is the item's message, `cause` what the step reported.
    PublishCutOff {
        reason: &'static str,
        cause: String,
    },
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
    use crate::modules::fs::copy::{created_path, CopyFailure, CopyResult};
    let dest = dest_dir.trim_end_matches('/');
    let mut result = CopyResult::default();
    let failure = |source: &String, message: &str| CopyFailure {
        source: source.clone(),
        message: message.to_string(),
        maybe_placed: false,
    };
    let maybe_placed = |source: &String, message: &str| CopyFailure {
        maybe_placed: true,
        ..failure(source, message)
    };
    let abort = |result: &mut CopyResult, rest: &[String], message: String| {
        let failures = rest.iter().map(|source| failure(source, &message));
        result.failed.extend(failures);
        result.aborted = Some(message);
    };
    for (index, source) in sources.iter().enumerate() {
        let item = copy_one(
            run,
            std::path::Path::new(source),
            dest,
            rename_on_conflict,
            registry,
        );
        let rest = &sources[index + 1..];
        match item {
            Ok(name) => result.created.push(created_path(dest_dir, &name)),
            Err(ItemError::Remote(RemoteError::Failed(message) | RemoteError::Killed(message))) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) failed: {message}");
                result.failed.push(failure(source, &message));
            }
            // The budget allows 64 KiB/s on the wire, so a timeout most likely
            // means a hung host: the item fails and the rest is not tried.
            Err(ItemError::Remote(RemoteError::TimedOut(message))) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) timed out: {message}");
                result.failed.push(failure(source, &message));
                abort(&mut result, rest, message);
                break;
            }
            Err(ItemError::Remote(RemoteError::Transport(message))) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) aborted: {message}");
                if index == 0 {
                    return Err(message);
                }
                abort(&mut result, &sources[index..], message);
                break;
            }
            Err(ItemError::PublishLost(message)) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) lost while publishing: {message}");
                result.failed.push(maybe_placed(source, PUBLISH_LOST));
                abort(&mut result, rest, message);
                break;
            }
            Err(ItemError::PublishCutOff { reason, cause }) => {
                log::warn!("ssh copy({source} -> {host}:{dest}) {reason}: {cause}");
                result.failed.push(maybe_placed(source, reason));
                if reason == PUBLISH_TIMED_OUT {
                    abort(&mut result, rest, cause);
                    break;
                }
            }
        }
    }
    Ok(result)
}

/// A block per run keeps a long clash to few round trips and a small request.
const NAMES_PER_PUBLISH: usize = 64;

// The remote landing gets no deny-list check, like a remote editor save.
fn copy_one(
    run: &mut RemoteRun,
    src: &std::path::Path,
    dest: &str,
    rename_on_conflict: bool,
    registry: &crate::modules::workspace::WorkspaceRegistry,
) -> Result<String, ItemError> {
    use crate::modules::fs::copy;
    let failed = |error: std::io::Error| RemoteError::Failed(error.to_string());
    let source = copy::check_source(src, registry).map_err(failed)?;
    let name = source
        .name
        .to_str()
        .ok_or_else(|| RemoteError::Failed(format!("non-UTF-8 filename: {}", src.display())))?;
    let mut plan = Vec::new();
    plan_upload(src, String::new(), 0, source.linked, &mut plan, registry).map_err(failed)?;
    // Without renaming a taken name fails anyway: one probe spares the upload.
    // It is only a shortcut; the no-replace publish stays the real guard.
    if !rename_on_conflict {
        let target = format!("{dest}/{name}");
        let probe = serde_json::json!({ "op": "exists", "path": target });
        if let Ok(serde_json::Value::Bool(true)) = run(&probe, Some(REMOTE_FS_TIMEOUT)) {
            return Err(RemoteError::Failed(copy::already_exists(&target).to_string()).into());
        }
    }

    // Without a staging dir of its own the item returns here, before any cleanup.
    let staging = make_staging(run, dest)?;
    let outcome = match upload(run, &plan, &format!("{staging}/{}", copy::STAGED_ITEM)) {
        Ok(()) => publish_staged(run, &staging, dest, name, source.is_dir, rename_on_conflict),
        Err(error) => Err(error.into()),
    };
    // Only a helper that finished or died lets go of the staging; after a lost
    // connection or a timeout the rest stays hidden. A placed item has left it.
    if matches!(
        outcome,
        Err(
            ItemError::Remote(RemoteError::Failed(_) | RemoteError::Killed(_))
                | ItemError::PublishCutOff {
                    reason: PUBLISH_KILLED,
                    ..
                }
        )
    ) {
        if let Err(error) = run(
            &serde_json::json!({ "op": "delete", "path": staging }),
            Some(REMOTE_FS_TIMEOUT),
        ) {
            log::warn!(
                "ssh copy: could not remove staging {staging}: {}",
                String::from(error)
            );
        }
    }
    outcome
}

/// The helper claims each name without replacing, so a case-insensitive host
/// refuses a case variant itself and the run moves on to the next name.
fn publish_staged(
    run: &mut RemoteRun,
    staging: &str,
    dest: &str,
    name: &str,
    is_dir: bool,
    rename_on_conflict: bool,
) -> Result<String, ItemError> {
    use crate::modules::fs::copy;
    let staged = format!("{staging}/{}", copy::STAGED_ITEM);
    let tries = if rename_on_conflict { usize::MAX } else { 1 };
    let mut candidates = copy::copy_candidates(std::ffi::OsStr::new(name), is_dir)
        .take(tries)
        .map(|candidate| candidate.to_string_lossy().into_owned());
    loop {
        let block: Vec<String> = candidates.by_ref().take(NAMES_PER_PUBLISH).collect();
        if block.is_empty() {
            return Err(RemoteError::Failed(copy::no_free_copy_name().to_string()).into());
        }
        let request = serde_json::json!({
            "op": "publish", "from": staged, "dir": format!("{dest}/"), "names": block,
            "staging": staging,
        });
        match run(&request, Some(REMOTE_FS_TIMEOUT)) {
            Ok(serde_json::Value::String(used)) if block.contains(&used) => return Ok(used),
            Ok(serde_json::Value::Null) if rename_on_conflict => {}
            Ok(serde_json::Value::Null) => {
                let taken = copy::already_exists(format!("{dest}/{name}"));
                return Err(RemoteError::Failed(taken.to_string()).into());
            }
            Ok(other) => {
                return Err(RemoteError::Failed(format!("bad publish response: {other}")).into())
            }
            Err(RemoteError::Transport(message)) => return Err(ItemError::PublishLost(message)),
            // A helper killed mid-publish may already have placed the item.
            Err(RemoteError::Killed(cause)) => {
                let reason = PUBLISH_KILLED;
                return Err(ItemError::PublishCutOff { reason, cause });
            }
            Err(RemoteError::TimedOut(cause)) => {
                let reason = PUBLISH_TIMED_OUT;
                return Err(ItemError::PublishCutOff { reason, cause });
            }
            Err(error) => return Err(error.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_pid_is_read_from_the_check_answer() {
        assert_eq!(parse_master_pid("Master running (pid=667)\r\n"), Some(667));
        assert_eq!(parse_master_pid("Master running (pid=)\r\n"), None);
        assert_eq!(parse_master_pid("Control socket connect(/x): No such file"), None);
        assert_eq!(parse_master_pid(""), None);
    }

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
    fn the_installed_app_keeps_its_control_dir_and_a_variant_gets_its_own() {
        use std::path::Path;
        let home = Some(Path::new("/Users/u"));
        let temp = Path::new("/tmp");
        assert_eq!(
            control_dir_path(home, temp, None),
            Path::new("/Users/u/.terax/ssh-control")
        );
        assert_eq!(
            control_dir_path(None, temp, None),
            Path::new("/tmp/terax-ssh-control")
        );
        assert_eq!(
            control_dir_path(home, temp, Some("dev")),
            Path::new("/Users/u/.terax/ssh-control-dev")
        );
        assert_eq!(
            control_dir_path(None, temp, Some("dev")),
            Path::new("/tmp/terax-ssh-control-dev")
        );
        let production = crate::modules::variant::side_by_side_suffix(
            crate::modules::variant::PRODUCTION_IDENTIFIER,
        );
        assert_eq!(
            control_dir_path(home, temp, production.as_deref()),
            Path::new("/Users/u/.terax/ssh-control")
        );
    }

    #[cfg(unix)]
    #[test]
    fn control_args_point_at_the_installed_apps_folder_by_default() {
        let expected = format!(
            "ControlPath={}/%C",
            control_dir_path(
                dirs::home_dir().as_deref(),
                &std::env::temp_dir(),
                None
            )
            .display()
        );
        assert!(control_args().contains(&expected), "{expected}");
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
    fn b64decode_inverts_b64encode_for_every_padding() {
        let data: Vec<u8> = (0..=255u8).chain([0, 0xff, 0x89]).collect();
        for len in 0..data.len() {
            let chunk = &data[..len];
            assert_eq!(b64decode(&b64encode(chunk)).as_deref(), Some(chunk), "len {len}");
        }
    }

    #[test]
    fn b64decode_rejects_malformed_input() {
        for bad in ["Zg", "Zg=", "Z===", "Zg==Zg==", "Zm9v\n", "Zm-v", "Z=9v", "Zm9v===="] {
            assert_eq!(b64decode(bad), None, "{bad:?}");
        }
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

    /// `None` without a local python3, so a test skips instead of failing.
    #[cfg(unix)]
    fn helper_output(
        prelude: &str,
        req: &serde_json::Value,
    ) -> Option<(Option<i32>, Vec<u8>, String)> {
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
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn python3");
        // A helper that cannot start may exit before it reads the request.
        let _ = child
            .stdin
            .take()
            .unwrap()
            .write_all(req.to_string().as_bytes());
        let out = child.wait_with_output().expect("helper output");
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Some((out.status.code(), out.stdout, stderr))
    }

    /// The `prelude` can stub os calls; `None` without a local python3.
    #[cfg(unix)]
    fn run_helper(prelude: &str, req: &serde_json::Value) -> Option<serde_json::Value> {
        let (code, stdout, stderr) = helper_output(prelude, req)?;
        assert_eq!(code, Some(0), "{stderr}");
        let i = find_subslice(&stdout, TERAX_SENTINEL).expect("sentinel present");
        Some(serde_json::from_slice(&stdout[i + TERAX_SENTINEL.len()..]).expect("json envelope"))
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

    #[cfg(unix)]
    #[test]
    fn embedded_helper_read_bytes_returns_exact_bytes_within_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("photo.png");
        let bytes: Vec<u8> = [0x89, b'P', b'N', b'G', 0, 0xff, 0x0a].repeat(40);
        std::fs::write(&png, &bytes).unwrap();
        let path = png.to_string_lossy();

        let req = serde_json::json!({ "op": "read_bytes", "path": path, "limit": bytes.len() });
        let Some(env) = run_helper("", &req) else {
            return;
        };
        assert_eq!(env["ok"], serde_json::Value::Bool(true), "{env}");
        let file = parse_read_bytes(env["data"].clone()).expect("read_bytes reply");
        assert_eq!(file.bytes, bytes);
        let canonical = std::fs::canonicalize(&png).unwrap();
        assert_eq!(file.resolved_path, canonical.to_string_lossy());

        let over = serde_json::json!({ "op": "read_bytes", "path": path, "limit": bytes.len() - 1 });
        let env = run_helper("", &over).unwrap();
        assert_eq!(env["ok"], serde_json::Value::Bool(false));
        assert!(env["error"].as_str().unwrap().contains("too large"), "{env}");

        let folder = serde_json::json!({ "op": "read_bytes", "path": dir.path().to_string_lossy() });
        let env = run_helper("", &folder).unwrap();
        assert_eq!(env["ok"], serde_json::Value::Bool(false));
        assert!(env["error"].as_str().unwrap().contains("not a regular file"), "{env}");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_read_bytes_reports_the_symlink_target() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join(".ssh")).unwrap();
        std::fs::create_dir(dir.path().join("repo")).unwrap();
        let key = dir.path().join(".ssh/id_ed25519");
        std::fs::write(&key, b"PRIVATE KEY").unwrap();
        let shot = dir.path().join("repo/shot.png");
        std::os::unix::fs::symlink(&key, &shot).unwrap();

        let req = serde_json::json!({ "op": "read_bytes", "path": shot.to_string_lossy() });
        let Some(env) = run_helper("", &req) else {
            return;
        };
        assert_eq!(env["ok"], serde_json::Value::Bool(true), "{env}");
        let file = parse_read_bytes(env["data"].clone()).expect("read_bytes reply");
        let target = std::fs::canonicalize(&key).unwrap();
        assert_eq!(file.resolved_path, target.to_string_lossy());
        assert_ne!(file.resolved_path, shot.to_string_lossy());
        assert!(
            crate::modules::fs::guard::check_read_str(&file.resolved_path).is_err(),
            "the reported target must be what the deny-list sees: {}",
            file.resolved_path
        );
    }

    #[test]
    fn read_bytes_reply_rejects_a_missing_target_or_bad_base64() {
        let missing = serde_json::json!({ "b64": "Zm9v" });
        assert!(parse_read_bytes(missing).is_err());
        let garbled = serde_json::json!({ "real": "/x/a.png", "b64": "Zm9" });
        assert!(parse_read_bytes(garbled).is_err());
        let ok = parse_read_bytes(serde_json::json!({ "real": "/x/a.png", "b64": "Zm9v" }))
            .unwrap();
        assert_eq!((ok.resolved_path.as_str(), ok.bytes.as_slice()), ("/x/a.png", &b"foo"[..]));
    }

    #[test]
    fn the_largest_read_bytes_reply_fits_under_the_stdout_cap() {
        let cap = crate::modules::fs::file::MAX_READ_BYTES;
        assert!(
            REMOTE_PYTHON.contains(&format!("\nMAX_READ = {} * 1024 * 1024\n", cap >> 20)),
            "the helper cap must match MAX_READ_BYTES"
        );
        // A PATH_MAX `real` escaped at 6 bytes per byte (\uXXXX), plus keys and sentinel.
        let path = 4096 * 6;
        let envelope = TERAX_SENTINEL.len() + r#"{"ok": true, "data": {"real": "", "b64": ""}}"#.len();
        let b64 = b64encode(&vec![0; usize::try_from(cap).unwrap()]).len();
        let reply = b64 + path + envelope;
        assert!(reply < MAX_REMOTE_STDOUT, "{reply} >= {MAX_REMOTE_STDOUT}");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_read_bytes_clamps_the_limit_to_the_cap() {
        let cap = usize::try_from(crate::modules::fs::file::MAX_READ_BYTES).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let over = dir.path().join("over.png");
        std::fs::write(&over, vec![0u8; cap + 1]).unwrap();
        let req = serde_json::json!({
            "op": "read_bytes", "path": over.to_string_lossy(), "limit": cap * 2,
        });
        let Some(env) = run_helper("", &req) else {
            return;
        };
        assert_eq!(env["ok"], serde_json::Value::Bool(false));
        assert!(env["error"].as_str().unwrap().contains("too large"), "{env}");

        let full = dir.path().join("full.png");
        std::fs::write(&full, vec![0u8; cap]).unwrap();
        let req = serde_json::json!({ "op": "read_bytes", "path": full.to_string_lossy() });
        let (code, stdout, stderr) = helper_output("", &req).unwrap();
        assert_eq!(code, Some(0), "{stderr}");
        assert!(stdout.len() < MAX_REMOTE_STDOUT, "{} bytes", stdout.len());
        let i = find_subslice(&stdout, TERAX_SENTINEL).expect("sentinel present");
        let env: serde_json::Value = serde_json::from_slice(&stdout[i + TERAX_SENTINEL.len()..]).unwrap();
        assert_eq!(env["ok"], serde_json::Value::Bool(true));
        assert_eq!(parse_read_bytes(env["data"].clone()).unwrap().bytes.len(), cap);
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_read_bytes_refuses_a_swapped_in_fifo_without_blocking() {
        use std::os::unix::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let fifo = dir.path().join("pipe.png");
        let c_path = std::ffi::CString::new(fifo.to_string_lossy().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c_path.as_ptr(), 0o600) }, 0);
        // The stat still sees a regular file, as if the FIFO replaced it after.
        let prelude = [
            "import os",
            "_stat = os.stat",
            "class _Regular: st_mode = 0o100600; st_size = 0",
            "os.stat = lambda p, *a, **k: _Regular() if str(p).endswith('pipe.png') else _stat(p, *a, **k)",
            "",
        ]
        .join("\n");
        // A blocked open is released by a writer after 3 s, so a regression fails, not hangs.
        let writer_path = fifo.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            let _ = std::fs::OpenOptions::new()
                .write(true)
                .custom_flags(libc::O_NONBLOCK)
                .open(writer_path);
        });

        let started = std::time::Instant::now();
        let req = serde_json::json!({ "op": "read_bytes", "path": fifo.to_string_lossy() });
        let Some(env) = run_helper(&prelude, &req) else {
            return;
        };
        assert!(started.elapsed() < std::time::Duration::from_secs(3), "the open blocked");
        assert_eq!(env["ok"], serde_json::Value::Bool(false));
        assert!(env["error"].as_str().unwrap().contains("not a regular file"), "{env}");
    }

    #[test]
    fn read_bytes_budgets_for_the_known_size_and_falls_back_to_the_cap() {
        let cap = 10 * 1024 * 1024;
        let secs = |size: Option<u64>| read_bytes_timeout(cap, size).as_secs();
        assert_eq!(secs(Some(4096)), 31);
        assert_eq!(secs(Some(1024 * 1024)), write_timeout(1024 * 1024).as_secs());
        assert_eq!(secs(None), 30 + 214);
        assert_eq!(secs(Some(cap * 4)), 30 + 214);
        for size in [None, Some(0), Some(1), Some(cap)] {
            assert!(read_bytes_timeout(cap, size) >= REMOTE_FS_TIMEOUT, "{size:?}");
        }
    }

    #[test]
    fn helper_staging_rule_mirrors_copy_rs() {
        use crate::modules::fs::copy::{STAGING_PREFIX, STAGING_RANDOM_LEN};
        for line in [
            format!("STAGING_PREFIX = \"{STAGING_PREFIX}\"\n"),
            format!("STAGING_RANDOM_LEN = {STAGING_RANDOM_LEN}\n"),
        ] {
            assert!(REMOTE_PYTHON.contains(&line), "helper must pin {line:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_hides_exactly_what_copy_rs_calls_staging() {
        use crate::modules::fs::copy::{is_staging_name, staging_dir_in};
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let mkstage = serde_json::json!({ "op": "mkstage", "path": format!("{root}/") });
        let Some(made) = run_helper("", &mkstage) else {
            return;
        };
        let from_helper = std::path::PathBuf::from(made["data"].as_str().unwrap());
        let from_tempfile = staging_dir_in(dir.path()).unwrap();
        for made in [from_helper.as_path(), from_tempfile.path()] {
            let name = made.file_name().unwrap().to_str().unwrap();
            assert!(is_staging_name(name), "{name}");
        }
        for name in [
            ".terax-copy-a1B2c3D4",
            ".terax-copy-k2_9xq0a",
            ".terax-copy-notes.md",
            ".terax-copy-backup",
            ".terax-copy-",
            ".terax-copy-abcdefg",
            ".terax-copy-abcdefghi",
            ".terax-copy-ab-cd-ef",
            ".terax-copy-\u{e4}bcdefg",
            ".terax-copyright.md",
            "x.terax-copy-abcdefgh",
        ] {
            std::fs::create_dir(dir.path().join(name)).unwrap();
        }
        let listed = run_helper(
            "",
            &serde_json::json!({ "op": "read_dir", "path": root, "showHidden": true }),
        )
        .unwrap();
        let listed: Vec<&str> = listed["data"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        let on_disk: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(on_disk.len(), 13);
        for name in &on_disk {
            assert_eq!(
                listed.contains(&name.as_str()),
                !is_staging_name(name),
                "{name}: {listed:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_mkstage_makes_a_private_staging_dir_in_place() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let mkstage = |dest: &std::path::Path| {
            run_helper(
                "",
                &serde_json::json!({ "op": "mkstage", "path": format!("{}/", dest.display()) }),
            )
        };
        let Some(env) = mkstage(dir.path()) else {
            return;
        };
        assert_eq!(env["ok"], true, "{env}");
        let staging = std::path::PathBuf::from(env["data"].as_str().unwrap());
        assert_eq!(
            std::fs::canonicalize(staging.parent().unwrap()).unwrap(),
            std::fs::canonicalize(dir.path()).unwrap()
        );
        let name = staging.file_name().unwrap().to_str().unwrap();
        assert!(crate::modules::fs::copy::is_staging_name(name), "{name}");
        let meta = std::fs::metadata(&staging).unwrap();
        assert!(meta.is_dir());
        assert_eq!(meta.permissions().mode() & 0o777, 0o700);
        assert_ne!(mkstage(dir.path()).unwrap()["data"], env["data"]);

        let gone = dir.path().join("gone");
        let env = mkstage(&gone).unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(!gone.exists(), "the destination is never created");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_listings_never_show_staging() {
        let dir = tempfile::tempdir().unwrap();
        for rel in [".terax-copy-x9Kq2_Lm/report", ".hidden/report"] {
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
    fn publish_request(from: &str, dir: &str, names: &[&str]) -> serde_json::Value {
        serde_json::json!({ "op": "publish", "from": from, "dir": dir, "names": names })
    }

    #[cfg(unix)]
    fn used(name: &str) -> serde_json::Value {
        serde_json::json!({ "ok": true, "data": name })
    }

    #[cfg(unix)]
    fn all_taken() -> serde_json::Value {
        serde_json::json!({ "ok": true, "data": null })
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_never_replaces() {
        let dir = tempfile::tempdir().unwrap();
        let p = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let base = format!("{}/", dir.path().display());
        let stage = |rel: &str, body: &[u8]| {
            let path = dir.path().join(".terax-copy-s5Vd3_Jf").join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, body).unwrap();
            path.to_string_lossy().into_owned()
        };
        let publish =
            |from: &str, names: &[&str]| run_helper("", &publish_request(from, &base, names));

        let staged = stage("f1", b"new");
        let Some(env) = publish(&staged, &["free.txt"]) else {
            return;
        };
        assert_eq!(env, used("free.txt"));
        assert_eq!(std::fs::read(p("free.txt")).unwrap(), b"new");
        assert!(!std::path::Path::new(&staged).exists());

        std::fs::write(p("taken.txt"), b"old").unwrap();
        let staged = stage("f2", b"new");
        assert_eq!(publish(&staged, &["taken.txt"]).unwrap(), all_taken());
        assert_eq!(std::fs::read(p("taken.txt")).unwrap(), b"old");
        assert!(std::path::Path::new(&staged).exists());

        // A failing swap (folder into itself) takes its reservation back and
        // tries no further name.
        let item = dir.path().join(".terax-copy-s5Vd3_Jf/item");
        std::fs::create_dir(&item).unwrap();
        let inside = format!("{}/", item.display());
        let env = run_helper(
            "",
            &publish_request(&item.to_string_lossy(), &inside, &["sub", "sub copy"]),
        )
        .unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(!item.join("sub").exists(), "reservation must be removed");
        assert!(!item.join("sub copy").exists(), "{env}");
        assert_eq!(
            publish(&item.to_string_lossy(), &["folder"]).unwrap(),
            used("folder")
        );
        assert!(dir.path().join("folder").is_dir());
        assert!(!item.exists());
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_takes_the_first_free_name_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let base = format!("{}/", dir.path().display());
        let staging = dir.path().join(".terax-copy-s5Vd3_Jf");
        std::fs::create_dir(&staging).unwrap();
        for taken in ["a.txt", "a copy.txt", "a copy 3.txt"] {
            std::fs::write(dir.path().join(taken), taken).unwrap();
        }
        std::fs::create_dir(dir.path().join("v")).unwrap();
        let staged = staging.join("a.txt");
        std::fs::write(&staged, b"new").unwrap();
        let names = ["a.txt", "a copy.txt", "a copy 2.txt", "a copy 3.txt"];
        let Some(env) = run_helper(
            "",
            &publish_request(&staged.to_string_lossy(), &base, &names),
        ) else {
            return;
        };
        assert_eq!(env, used("a copy 2.txt"));
        assert_eq!(
            std::fs::read(dir.path().join("a copy 2.txt")).unwrap(),
            b"new"
        );
        for taken in ["a.txt", "a copy.txt", "a copy 3.txt"] {
            assert_eq!(
                std::fs::read(dir.path().join(taken)).unwrap(),
                taken.as_bytes()
            );
        }

        let folder = staging.join("v");
        std::fs::create_dir(&folder).unwrap();
        std::fs::write(folder.join("x"), b"x").unwrap();
        let folder = folder.to_string_lossy().into_owned();
        let env = run_helper("", &publish_request(&folder, &base, &["v", "a.txt"])).unwrap();
        assert_eq!(env, all_taken());
        assert!(std::path::Path::new(&folder).join("x").exists());
        let env = run_helper("", &publish_request(&folder, &base, &["v", "v copy"])).unwrap();
        assert_eq!(env, used("v copy"));
        assert_eq!(std::fs::read(dir.path().join("v copy/x")).unwrap(), b"x");
        assert!(std::fs::read_dir(dir.path().join("v"))
            .unwrap()
            .next()
            .is_none());
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
                format!("    if {fail}: raise OSError(errno.EEXIST, 'swap failed')"),
                "    _rename(a, b)".into(),
                "os.rename = _onto_reservation".into(),
                String::new(),
            ]
            .join("\n")
        };
        let dir = tempfile::tempdir().unwrap();
        let p = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let base = format!("{}/", dir.path().display());
        let stage = |rel: &str, body: &[u8]| {
            let path = dir.path().join(".terax-copy-s5Vd3_Jf").join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, body).unwrap();
            path.to_string_lossy().into_owned()
        };
        let publish = |prelude: &str, from: &str, names: &[&str]| {
            run_helper(prelude, &publish_request(from, &base, names))
        };
        std::fs::write(p("taken.txt"), b"old").unwrap();
        std::os::unix::fs::symlink(p("victim"), p("dangling.txt")).unwrap();

        for code in [
            "EPERM",
            "ENOTSUP",
            "EOPNOTSUPP",
            "ENOSYS",
            "EXDEV",
            "EMLINK",
        ] {
            let prelude = without_links(code, false);
            let staged = stage(code, b"fallback");
            let name = format!("{code}.txt");
            let Some(env) = publish(&prelude, &staged, &["taken.txt", "dangling.txt", &name])
            else {
                return;
            };
            assert_eq!(env, used(&name), "{code}");
            assert_eq!(std::fs::read(p(&name)).unwrap(), b"fallback");
            assert!(!std::path::Path::new(&staged).exists());

            for taken in ["taken.txt", "dangling.txt"] {
                let staged = stage(code, b"new");
                let env = publish(&prelude, &staged, &[taken]).unwrap();
                assert_eq!(env, all_taken(), "{code}");
                assert!(std::path::Path::new(&staged).exists());
            }
        }
        assert_eq!(std::fs::read(p("taken.txt")).unwrap(), b"old");
        assert!(
            !dir.path().join("victim").exists(),
            "must not write through the link"
        );

        // EEXIST from the swap onto our own placeholder is no taken name.
        let staged = stage("swap", b"new");
        let env = publish(
            &without_links("ENOSYS", true),
            &staged,
            &["swap.txt", "swap copy.txt"],
        )
        .unwrap();
        assert_eq!(env["ok"], false, "{env}");
        for name in ["swap.txt", "swap copy.txt"] {
            assert!(!dir.path().join(name).exists(), "{name}");
        }
        assert!(std::path::Path::new(&staged).exists());
    }

    // The rename stub refuses any folder target, as SMB does, and can break
    // the move of one entry to show the fill taken back.
    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_fills_a_claimed_folder_entry_by_entry() {
        use std::os::unix::fs::PermissionsExt;
        let smb = |breaks: &str| {
            [
                "import os, errno".to_string(),
                "_rename = os.rename".into(),
                "def _smb(a, b):".into(),
                "    if os.path.isdir(b): raise OSError(errno.EEXIST, 'File exists')".into(),
                format!("    if os.path.basename(a) == {breaks:?}: raise OSError(errno.EIO, 'io')"),
                "    _rename(a, b)".into(),
                "os.rename = _smb".into(),
                String::new(),
            ]
            .join("\n")
        };
        let dir = tempfile::tempdir().unwrap();
        let base = format!("{}/", dir.path().display());
        let stage = |staging: &str| {
            let item = dir.path().join(staging).join("item");
            std::fs::create_dir_all(item.join("sub")).unwrap();
            std::fs::write(item.join("a.txt"), b"a").unwrap();
            std::fs::write(item.join("sub/b.txt"), b"b").unwrap();
            std::fs::set_permissions(&item, std::fs::Permissions::from_mode(0o750)).unwrap();
            item.to_string_lossy().into_owned()
        };
        let publish = |prelude: &str, item: &str, names: &[&str], staging: &str| {
            let mut request = publish_request(item, &base, names);
            let staging = dir.path().join(staging);
            request["staging"] = staging.to_string_lossy().into_owned().into();
            run_helper(prelude, &request)
        };

        let item = stage(".terax-copy-s5Vd3_Jf");
        let Some(env) = publish(&smb(""), &item, &["v"], ".terax-copy-s5Vd3_Jf") else {
            return;
        };
        assert_eq!(env, used("v"));
        let v = dir.path().join("v");
        assert_eq!(std::fs::read(v.join("a.txt")).unwrap(), b"a");
        assert_eq!(std::fs::read(v.join("sub/b.txt")).unwrap(), b"b");
        let mode = std::fs::metadata(&v).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o750);
        assert!(!dir.path().join(".terax-copy-s5Vd3_Jf").exists());

        let item = stage(".terax-copy-k2_9xq0a");
        let env = publish(&smb("sub"), &item, &["v", "v copy"], ".terax-copy-k2_9xq0a").unwrap();
        assert_eq!(env["ok"], false, "{env}");
        assert!(!dir.path().join("v copy").exists(), "the claim is removed");
        let mut kept: Vec<String> = std::fs::read_dir(&v)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        kept.sort();
        assert_eq!(kept, ["a.txt", "sub"]);
        assert!(std::path::Path::new(&item).join("sub/b.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_leaves_a_claim_another_writer_filled_alone() {
        let intruder = [
            "import os, errno",
            "def _intruder(a, b):",
            "    if os.path.isdir(b):",
            "        with open(os.path.join(b, 'theirs.txt'), 'w') as f: f.write('theirs')",
            "    raise OSError(errno.EEXIST, 'File exists')",
            "os.rename = _intruder",
            "",
        ]
        .join("\n");
        let dir = tempfile::tempdir().unwrap();
        let item = dir.path().join(".terax-copy-s5Vd3_Jf/item");
        std::fs::create_dir_all(&item).unwrap();
        std::fs::write(item.join("a.txt"), b"ours").unwrap();
        let request = publish_request(
            &item.to_string_lossy(),
            &format!("{}/", dir.path().display()),
            &["v", "v copy"],
        );
        let Some(env) = run_helper(&intruder, &request) else {
            return;
        };
        let v = dir.path().join("v");
        assert_eq!(env["error"], format!("already exists: {}", v.display()));
        assert_eq!(std::fs::read(v.join("theirs.txt")).unwrap(), b"theirs");
        assert!(
            !dir.path().join("v copy").exists(),
            "no further name is tried"
        );
        assert_eq!(std::fs::read(item.join("a.txt")).unwrap(), b"ours");
    }

    // The swap stub puts another writer's entry where our placeholder was,
    // then fails; the cleanup must leave theirs.
    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_leaves_what_replaced_its_placeholder() {
        let prelude = [
            "import os, errno",
            "def _no_link(*a, **k): raise OSError(errno.ENOSYS, 'no hardlinks')",
            "os.link = _no_link",
            "_rename = os.rename",
            "def _replaced(a, b):",
            "    theirs = b + '.theirs'",
            "    if os.path.isdir(a): os.mkdir(theirs)",
            "    else:",
            "        with open(theirs, 'w') as f: f.write('theirs')",
            "    _rename(theirs, b)",
            "    raise OSError(errno.EIO, 'swap failed')",
            "os.rename = _replaced",
            "",
        ]
        .join("\n");
        let dir = tempfile::tempdir().unwrap();
        let base = format!("{}/", dir.path().display());
        let staging = dir.path().join(".terax-copy-s5Vd3_Jf");
        std::fs::create_dir_all(staging.join("folder")).unwrap();
        std::fs::write(staging.join("file"), b"ours").unwrap();
        for (staged, name) in [("file", "f.txt"), ("folder", "d")] {
            let from = staging.join(staged).to_string_lossy().into_owned();
            let Some(env) = run_helper(&prelude, &publish_request(&from, &base, &[name])) else {
                return;
            };
            assert_eq!(env["ok"], false, "{env}");
            let target = dir.path().join(name);
            assert!(target.exists(), "{name}: the replacement was removed");
            if name == "f.txt" {
                assert_eq!(std::fs::read(&target).unwrap(), b"theirs");
            }
            assert!(staging.join(staged).exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_treats_case_variants_as_taken() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("A.txt"), b"old").unwrap();
        let insensitive = dir.path().join("a.txt").exists();
        let staged = dir.path().join(".terax-copy-s5Vd3_Jf");
        std::fs::write(&staged, b"new").unwrap();
        let request = publish_request(
            &staged.to_string_lossy(),
            &format!("{}/", dir.path().display()),
            &["a.txt", "a copy.txt"],
        );
        let Some(env) = run_helper("", &request) else {
            return;
        };
        let expected = if insensitive { "a copy.txt" } else { "a.txt" };
        assert_eq!(env, used(expected));
        assert_eq!(std::fs::read(dir.path().join(expected)).unwrap(), b"new");
        assert_eq!(std::fs::read(dir.path().join("A.txt")).unwrap(), b"old");
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_publish_removes_its_staging_dir() {
        let dir = tempfile::tempdir().unwrap();
        let path = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let base = format!("{}/", dir.path().display());
        let publish = |from: &str, names: &[&str], staging: &str| {
            let mut request = publish_request(&path(from), &base, names);
            request["staging"] = path(staging).into();
            run_helper("", &request)
        };
        std::fs::create_dir_all(dir.path().join(".terax-copy-s5Vd3_Jf/item/sub")).unwrap();
        std::fs::write(dir.path().join(".terax-copy-s5Vd3_Jf/item/sub/x"), b"x").unwrap();
        std::fs::write(dir.path().join("taken"), b"old").unwrap();

        let Some(env) = publish(
            ".terax-copy-s5Vd3_Jf/item",
            &["taken"],
            ".terax-copy-s5Vd3_Jf",
        ) else {
            return;
        };
        assert_eq!(env, all_taken());
        assert!(dir.path().join(".terax-copy-s5Vd3_Jf/item/sub/x").exists());

        let env = publish(
            ".terax-copy-s5Vd3_Jf/item",
            &["taken", "free"],
            ".terax-copy-s5Vd3_Jf",
        )
        .unwrap();
        assert_eq!(env, used("free"));
        assert!(dir.path().join("free/sub/x").exists());
        assert!(!dir.path().join(".terax-copy-s5Vd3_Jf").exists());

        std::fs::create_dir_all(dir.path().join("keep/item")).unwrap();
        assert_eq!(
            publish("keep/item", &["moved"], "keep").unwrap(),
            used("moved")
        );
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

    #[cfg(unix)]
    #[test]
    fn embedded_helper_create_dir_sets_the_exact_mode() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = |rel: &str| dir.path().join(rel).to_string_lossy().into_owned();
        let create = |rel: &str, mode: u32| {
            run_helper(
                "import os\nos.umask(0o022)\n",
                &serde_json::json!({
                    "op": "create_dir", "path": path(rel), "parents": false, "mode": mode,
                }),
            )
        };
        let mode = |rel: &str| std::fs::metadata(path(rel)).unwrap().permissions().mode() & 0o777;
        let Some(env) = create("private", 0o700) else {
            return;
        };
        assert_eq!(env["ok"], true, "{env}");
        assert_eq!(mode("private"), 0o700);
        assert_eq!(create("shared", 0o775).unwrap()["ok"], true);
        assert_eq!(mode("shared"), 0o775, "the umask must not cut the mode");
    }

    /// Runs `prepare_upload_dir_with` against the real helper with `HOME` set to
    /// `home`; `None` without a local python3.
    #[cfg(unix)]
    fn prepare_with_helper(home: &std::path::Path) -> Option<Result<String, String>> {
        let prelude = format!(
            "import os\nos.umask(0o022)\nos.environ[\"HOME\"] = {}\n",
            serde_json::json!(home.to_string_lossy())
        );
        let mut skipped = false;
        let result = prepare_upload_dir_with(&mut |request, _| {
            let Some(envelope) = run_helper(&prelude, request) else {
                skipped = true;
                return Err(RemoteError::Transport("no local python3".into()));
            };
            if envelope["ok"] == true {
                Ok(envelope["data"].clone())
            } else {
                let error = envelope["error"].as_str().unwrap_or_default();
                Err(RemoteError::Failed(error.to_string()))
            }
        });
        (!skipped).then_some(result)
    }

    #[cfg(unix)]
    fn mode_of(path: &std::path::Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        std::fs::symlink_metadata(path).unwrap().permissions().mode() & 0o777
    }

    #[cfg(unix)]
    fn age_days(path: &std::path::Path, days: u64) {
        let then = std::time::SystemTime::now() - std::time::Duration::from_secs(days * 86_400);
        std::fs::File::open(path).unwrap().set_modified(then).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn upload_dir_is_made_owner_only_and_returned_absolute() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("u");
        std::fs::create_dir(&home).unwrap();
        let Some(result) = prepare_with_helper(&home) else {
            return;
        };
        let path = result.unwrap();
        let expected = home.join(".terax/uploads");
        assert_eq!(path, expected.to_string_lossy());
        assert!(path.starts_with('/') && !path.contains('~'), "{path}");
        assert!(expected.is_dir());
        assert_eq!(mode_of(&expected), 0o700);
        assert_eq!(mode_of(&home.join(".terax")), 0o700);
    }

    #[cfg(unix)]
    #[test]
    fn an_existing_upload_dir_is_narrowed_to_owner_only_and_keeps_recent_files() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("u");
        let uploads = home.join(".terax/uploads");
        std::fs::create_dir_all(&uploads).unwrap();
        std::fs::set_permissions(&uploads, std::fs::Permissions::from_mode(0o755)).unwrap();
        let recent = uploads.join("gestern.png");
        std::fs::write(&recent, b"png").unwrap();
        age_days(&recent, 1);
        let Some(result) = prepare_with_helper(&home) else {
            return;
        };
        assert_eq!(result.unwrap(), uploads.to_string_lossy());
        assert_eq!(mode_of(&uploads), 0o700);
        assert_eq!(std::fs::read(&recent).unwrap(), b"png");
    }

    #[cfg(unix)]
    #[test]
    fn the_sweep_removes_only_week_old_entries_of_the_upload_dir() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("u");
        let terax = home.join(".terax");
        let uploads = terax.join("uploads");
        let project = home.join("projekt");
        std::fs::create_dir_all(&uploads).unwrap();
        std::fs::create_dir(&project).unwrap();
        let file = |path: std::path::PathBuf, days: u64| {
            std::fs::write(&path, b"x").unwrap();
            age_days(&path, days);
            path
        };
        let old = file(uploads.join("alt.png"), 8);
        let young = file(uploads.join("neu.png"), 6);
        let beside = file(terax.join("alt.txt"), 8);
        let elsewhere = file(project.join("alt.txt"), 8);
        let link = uploads.join("link.png");
        std::os::unix::fs::symlink(&elsewhere, &link).unwrap();
        let stale_link = std::process::Command::new("touch")
            .args(["-h", "-d", "8 days ago"])
            .arg(&link)
            .status()
            .is_ok_and(|status| status.success());
        let stage = |tail: &str| {
            uploads.join(format!("{}{tail}", crate::modules::fs::copy::STAGING_PREFIX))
        };
        let stale_stage = stage("ab12CD34");
        let fresh_stage = stage("ef56GH78");
        let folder = uploads.join("ordner");
        for dir in [&stale_stage, &fresh_stage, &folder] {
            std::fs::create_dir(dir).unwrap();
            std::fs::write(dir.join("item"), b"x").unwrap();
        }
        age_days(&stale_stage, 8);
        age_days(&folder, 8);

        let Some(result) = prepare_with_helper(&home) else {
            return;
        };
        assert_eq!(result.unwrap(), uploads.to_string_lossy(), "only the path, no report");
        assert!(!old.exists());
        assert!(young.exists() && beside.exists() && elsewhere.exists());
        if stale_link {
            assert!(std::fs::symlink_metadata(&link).is_err(), "the old link goes");
        }
        assert_eq!(std::fs::read(&elsewhere).unwrap(), b"x", "never its target");
        assert!(!stale_stage.exists(), "an abandoned staging dir goes");
        assert!(fresh_stage.join("item").exists());
        assert!(folder.join("item").exists(), "other folders are never removed");
    }

    #[cfg(unix)]
    #[test]
    fn an_unwritable_home_fails_with_the_hosts_reason() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("u");
        std::fs::create_dir(&home).unwrap();
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o500)).unwrap();
        // Root writes anyway, so the refusal cannot be staged there.
        let root_user = std::fs::create_dir(home.join("probe")).is_ok();
        let result = prepare_with_helper(&home);
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o700)).unwrap();
        let Some(result) = result else {
            return;
        };
        if root_user {
            return;
        }
        let error = result.unwrap_err();
        assert!(error.contains("Permission denied"), "{error}");
        assert!(!home.join(".terax").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_upload_dir_is_refused_and_its_target_left_alone() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("u");
        let elsewhere = root.path().join("elsewhere");
        std::fs::create_dir_all(home.join(".terax")).unwrap();
        std::fs::create_dir(&elsewhere).unwrap();
        std::fs::set_permissions(&elsewhere, std::fs::Permissions::from_mode(0o755)).unwrap();
        let old = elsewhere.join("alt.png");
        std::fs::write(&old, b"x").unwrap();
        age_days(&old, 8);
        std::os::unix::fs::symlink(&elsewhere, home.join(".terax/uploads")).unwrap();
        let Some(result) = prepare_with_helper(&home) else {
            return;
        };
        let error = result.unwrap_err();
        assert!(error.contains("not a plain folder"), "{error}");
        assert!(old.exists());
        assert_eq!(mode_of(&elsewhere), 0o755);
    }

    #[test]
    fn the_upload_dir_reply_must_be_absolute_and_budgeted() {
        let reply = |data: serde_json::Value| {
            let mut budgets = Vec::new();
            let result = prepare_upload_dir_with(&mut |request, timeout| {
                assert_eq!(request["op"], "prep_uploads");
                budgets.push(timeout);
                Ok(data.clone())
            });
            assert_eq!(budgets, [Some(REMOTE_FS_TIMEOUT)]);
            result
        };
        assert_eq!(
            reply(serde_json::json!("/home/u/.terax/uploads")).unwrap(),
            "/home/u/.terax/uploads"
        );
        for bad in [
            serde_json::json!("~/.terax/uploads"),
            serde_json::json!("home/u/.terax/uploads"),
            serde_json::json!("/home/u"),
            serde_json::json!(true),
        ] {
            let error = reply(bad.clone()).unwrap_err();
            assert!(error.starts_with("bad prep_uploads response"), "{bad}: {error}");
        }
        let refused = prepare_upload_dir_with(&mut |_, _| {
            Err(RemoteError::Failed("[Errno 13] Permission denied: '/home/u/.terax'".into()))
        });
        assert_eq!(refused.unwrap_err(), "[Errno 13] Permission denied: '/home/u/.terax'");
        assert!(prepare_upload_dir("-oProxyCommand=x").is_err());
    }

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
        request["op"] == "mkstage"
    }

    fn healthy(request: &serde_json::Value) -> RemoteReply {
        Ok(match request["op"].as_str() {
            Some("publish") => request["names"][0].clone(),
            Some("exists") => serde_json::json!(false),
            Some("mkstage") => serde_json::json!(format!(
                "{}{}stub_9Xk",
                request["path"].as_str().unwrap(),
                crate::modules::fs::copy::STAGING_PREFIX
            )),
            _ => serde_json::json!(true),
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
    fn created_paths_keep_the_destination_as_passed() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        let result = copy_with(
            &mut |request, _| healthy(request),
            "stub",
            &sources,
            "C:/x",
            true,
            &crate::modules::workspace::WorkspaceRegistry::default(),
        )
        .unwrap();
        assert_eq!(result.created, ["C:/x/a.txt"]);
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
        assert_eq!(result.aborted.as_deref(), Some(LOST));

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
        assert_eq!(result.aborted.as_deref(), Some(LOST));
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

    fn publish_into(taken: &[&str], request: &serde_json::Value) -> Option<RemoteReply> {
        if request["op"] != "publish" {
            return None;
        }
        let names = request["names"].as_array().unwrap();
        let free = names
            .iter()
            .find(|name| !taken.contains(&name.as_str().unwrap()));
        Some(Ok(free.cloned().unwrap_or(serde_json::Value::Null)))
    }

    fn publishes(requests: &[serde_json::Value]) -> Vec<&serde_json::Value> {
        requests.iter().filter(|r| r["op"] == "publish").collect()
    }

    fn deletes(requests: &[serde_json::Value]) -> Vec<&serde_json::Value> {
        requests
            .iter()
            .filter(|r| r["op"] == "delete")
            .map(|r| &r["path"])
            .collect()
    }

    #[test]
    fn a_clash_moves_on_inside_one_publish_run() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt"]);
        let (result, requests) = stub_copy(&sources, |request| {
            publish_into(&["a.txt", "a copy.txt"], request).unwrap_or_else(|| healthy(request))
        });
        assert_eq!(
            result.unwrap().created,
            ["/remote/a copy 2.txt", "/remote/b.txt"]
        );
        let runs = publishes(&requests);
        assert_eq!(runs.len(), 2);
        let names = runs[0]["names"].as_array().unwrap();
        assert_eq!(names.len(), NAMES_PER_PUBLISH);
        assert_eq!(names[..3], ["a.txt", "a copy.txt", "a copy 2.txt"]);
        assert_eq!(names[NAMES_PER_PUBLISH - 1], "a copy 63.txt");
        assert_eq!(runs[0]["dir"], "/remote/");
        let staging = runs[0]["staging"].as_str().unwrap();
        assert!(staging.starts_with("/remote/.terax-copy-"), "{staging}");
        assert_eq!(runs[0]["from"], format!("{staging}/item"));
        assert!(deletes(&requests).is_empty());
    }

    #[test]
    fn a_block_without_a_free_name_moves_on_to_the_next() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        let mut runs = 0;
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "publish" {
                runs += 1;
                if runs == 1 {
                    return Ok(serde_json::Value::Null);
                }
            }
            healthy(request)
        });
        assert_eq!(result.unwrap().created, ["/remote/a copy 64.txt"]);
        let runs = publishes(&requests);
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[1]["names"][0], "a copy 64.txt");
        assert_eq!(runs[1]["staging"], runs[0]["staging"]);
    }

    #[test]
    fn every_block_taken_fails_the_item_with_no_free_copy_name() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt"]);
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "publish" {
                return Ok(serde_json::Value::Null);
            }
            healthy(request)
        });
        let result = result.unwrap();
        assert!(result.created.is_empty());
        let no_free = crate::modules::fs::copy::no_free_copy_name().to_string();
        assert_eq!(
            failures(&result),
            [
                (sources[0].clone(), no_free.clone()),
                (sources[1].clone(), no_free),
            ]
        );
        let names = crate::modules::fs::copy::copy_candidates(std::ffi::OsStr::new("a.txt"), false);
        let blocks = names.count().div_ceil(NAMES_PER_PUBLISH);
        let runs = publishes(&requests);
        assert_eq!(runs.len(), 2 * blocks);
        let last = runs[blocks - 1]["names"].as_array().unwrap();
        assert_eq!(last.last().unwrap(), "a copy 10000.txt");
        assert_eq!(runs[blocks]["names"][0], "b.txt");
        assert_eq!(deletes(&requests).len(), 2);
    }

    #[test]
    fn without_renaming_a_taken_name_fails_before_any_upload() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt"]);
        let mut requests = Vec::new();
        let result = copy_with(
            &mut |request, _| {
                requests.push(request.clone());
                if request["op"] == "exists" {
                    return Ok(serde_json::json!(request["path"] == "/remote/a.txt"));
                }
                healthy(request)
            },
            "stub",
            &sources,
            "/remote",
            false,
            &crate::modules::workspace::WorkspaceRegistry::default(),
        )
        .unwrap();
        assert_eq!(result.created, ["/remote/b.txt"]);
        assert_eq!(
            failures(&result),
            [(
                sources[0].clone(),
                "already exists: /remote/a.txt".to_string()
            )]
        );
        let ops: Vec<(&str, &str)> = requests
            .iter()
            .take(2)
            .map(|r| (r["op"].as_str().unwrap(), r["path"].as_str().unwrap()))
            .collect();
        assert_eq!(
            ops,
            [("exists", "/remote/a.txt"), ("exists", "/remote/b.txt")]
        );
        assert!(!requests
            .iter()
            .any(|r| r["op"] == "write_bytes" && r["b64"] == b64encode(b"a.txt")));
        assert_eq!(requests.iter().filter(|r| creates_staging(r)).count(), 1);

        let (_, requests) = stub_copy(&sources, healthy);
        assert!(!requests.iter().any(|r| r["op"] == "exists"));
    }

    #[cfg(unix)]
    #[test]
    fn embedded_helper_exists_counts_a_dangling_link() {
        let dir = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink("gone", dir.path().join("dead")).unwrap();
        let probe = |name: &str| {
            let path = dir.path().join(name).to_string_lossy().into_owned();
            run_helper("", &serde_json::json!({ "op": "exists", "path": path }))
        };
        let Some(env) = probe("dead") else {
            return;
        };
        assert_eq!(env["data"], true);
        assert_eq!(probe("free").unwrap()["data"], false);
    }

    #[test]
    fn a_publish_failure_without_renaming_or_a_free_name_fails_the_item() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let mut requests = Vec::new();
        let result = copy_with(
            &mut |request, _| {
                requests.push(request.clone());
                publish_into(&["a.txt"], request).unwrap_or_else(|| healthy(request))
            },
            "stub",
            &sources,
            "/remote",
            false,
            &reg,
        )
        .unwrap();
        assert_eq!(
            failures(&result),
            [(
                sources[0].clone(),
                "already exists: /remote/a.txt".to_string()
            )]
        );
        let runs = publishes(&requests);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0]["names"], serde_json::json!(["a.txt"]));
        assert_eq!(deletes(&requests), [&runs[0]["staging"]]);

        type Reply = fn() -> RemoteReply;
        let replies: [(Reply, &str); 2] = [
            (
                || Err(RemoteError::Failed("Permission denied".into())),
                "Permission denied",
            ),
            (
                || Ok(serde_json::json!("elsewhere.txt")),
                "bad publish response: \"elsewhere.txt\"",
            ),
        ];
        for (reply, message) in replies {
            let (result, requests) = stub_copy(&sources, |request| {
                if request["op"] == "publish" {
                    return reply();
                }
                healthy(request)
            });
            assert_eq!(
                failures(&result.unwrap()),
                [(sources[0].clone(), message.to_string())]
            );
            assert_eq!(publishes(&requests).len(), 1);
            assert_eq!(
                deletes(&requests),
                [&serde_json::json!("/remote/.terax-copy-stub_9Xk")]
            );
        }
    }

    #[test]
    fn a_staging_dir_this_run_did_not_create_is_never_deleted() {
        const GONE: &str = "[Errno 2] No such file or directory: '/remote/.terax-copy-x'";
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt"]);
        type Reply = fn() -> RemoteReply;
        let replies: [(Reply, &str); 2] = [
            (|| Err(RemoteError::Failed(GONE.into())), GONE),
            (
                || Ok(serde_json::json!("/remote")),
                "bad mkstage response: \"/remote\"",
            ),
        ];
        for (reply, message) in replies {
            let (result, requests) = stub_copy(&sources, |request| {
                if creates_staging(request) {
                    return reply();
                }
                healthy(request)
            });
            let result = result.unwrap();
            assert!(result.created.is_empty());
            assert_eq!(
                failures(&result),
                [(sources[0].clone(), message.to_string())]
            );
            assert!(!requests
                .iter()
                .any(|r| r["op"] == "delete" || r["op"] == "write_bytes" || r["op"] == "publish"));
        }
    }

    #[test]
    fn every_upload_folder_is_made_without_parents() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(src.path().join("pkg/a/b")).unwrap();
        std::fs::write(src.path().join("pkg/a/b/x.txt"), b"x").unwrap();
        let pkg = src.path().join("pkg").to_string_lossy().into_owned();
        let (result, requests) = stub_copy(&[pkg], healthy);
        assert_eq!(result.unwrap().created, ["/remote/pkg"]);
        let stagings: Vec<&serde_json::Value> =
            requests.iter().filter(|r| creates_staging(r)).collect();
        assert_eq!(stagings.len(), 1);
        assert_eq!(stagings[0]["path"], "/remote/");
        let dirs: Vec<&serde_json::Value> = requests
            .iter()
            .filter(|r| r["op"] == "create_dir")
            .collect();
        let staging = "/remote/.terax-copy-stub_9Xk";
        let paths: Vec<String> = dirs
            .iter()
            .map(|r| r["path"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(
            paths,
            [
                format!("{staging}/item"),
                format!("{staging}/item/a"),
                format!("{staging}/item/a/b"),
            ]
        );
        assert!(dirs.iter().all(|r| r["parents"] == false), "{dirs:?}");
    }

    #[cfg(unix)]
    #[test]
    fn upload_folders_carry_the_source_mode_and_owner_access() {
        use std::os::unix::fs::PermissionsExt;
        let src = tempfile::tempdir().unwrap();
        let pkg = src.path().join("pkg");
        std::fs::create_dir_all(pkg.join("locked")).unwrap();
        let set = |path: &std::path::Path, mode: u32| {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
        };
        set(&pkg.join("locked"), 0o555);
        set(&pkg, 0o700);
        let (result, requests) = stub_copy(&[pkg.to_string_lossy().into_owned()], healthy);
        set(&pkg.join("locked"), 0o755);
        assert_eq!(result.unwrap().created, ["/remote/pkg"]);
        let modes: Vec<Option<u64>> = requests
            .iter()
            .filter(|r| r["op"] == "create_dir")
            .map(|r| r["mode"].as_u64())
            .collect();
        assert_eq!(modes, [Some(0o700), Some(0o755)]);
    }

    #[test]
    fn a_write_gets_thirty_seconds_plus_one_per_64_kib_of_its_request() {
        let secs = |file_len: usize| write_timeout(file_len).as_secs();
        assert_eq!(secs(0), 31);
        assert_eq!(secs(45_000), 31);
        assert_eq!(secs(49_152), 32);
        assert_eq!(secs(64 * 1024), 32);
        assert_eq!(secs(10 * 1024 * 1024), 30 + 214);

        let path = format!("/remote/.terax-copy-stub_9Xk/item/{}", "d/".repeat(500));
        for file_len in [0, 1, 1000, 49_152, 65_536, 300_000] {
            let request = serde_json::json!({
                "op": "write_bytes", "path": path,
                "b64": b64encode(&vec![0xff; file_len]), "mode": 0o644,
            });
            let wire = serde_json::to_string(&request).unwrap().len() as u64;
            let room = (secs(file_len) - WRITE_BASE_TIMEOUT.as_secs()) * 64 * 1024;
            assert!(
                wire <= room,
                "{file_len}: {wire} bytes on the wire, {room} budgeted"
            );
        }
    }

    #[test]
    fn control_steps_run_on_a_fixed_budget_and_writes_on_a_sized_one() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir(src.path().join("pkg")).unwrap();
        std::fs::write(src.path().join("pkg/a.txt"), b"a").unwrap();
        let pkg = src.path().join("pkg").to_string_lossy().into_owned();
        let mut budgets = Vec::new();
        let result = copy_with(
            &mut |request, timeout| {
                budgets.push((request["op"].as_str().unwrap().to_string(), timeout));
                if request["op"] == "publish" {
                    return Err(RemoteError::Failed("Permission denied".into()));
                }
                healthy(request)
            },
            "stub",
            &[pkg],
            "/remote",
            true,
            &crate::modules::workspace::WorkspaceRegistry::default(),
        )
        .unwrap();
        assert_eq!(result.failed[0].message, "Permission denied");
        let control = Some(REMOTE_FS_TIMEOUT);
        let expected = [
            ("mkstage", control),
            ("create_dir", control),
            ("write_bytes", Some(write_timeout(1))),
            ("publish", control),
            ("delete", control),
        ];
        let expected: Vec<(String, _)> = expected
            .into_iter()
            .map(|(op, budget)| (op.to_string(), budget))
            .collect();
        assert_eq!(budgets, expected);
    }

    #[test]
    fn the_remote_shell_stays_the_parent_of_the_helper() {
        let command = remote_command();
        assert!(
            command.starts_with("python3 -c \"$(printf %s "),
            "{command}"
        );
        assert!(command.ends_with(" | base64 -d)\"; exit"), "{command}");

        let echo = format!("bash: line 1: 4242 Killed: 9  {command}");
        match exit_error(Some(137), &format!("MemoryError\n{echo}")) {
            RemoteError::Killed(message) => assert_eq!(
                message,
                "remote helper exited with status 137 (stderr: MemoryError)"
            ),
            other => panic!("137 is a killed helper: {other:?}"),
        }
    }

    // A signal must come back as 128+N from the shell, not kill the shell
    // itself, in every login shell the host may run.
    #[cfg(unix)]
    #[test]
    fn a_killed_program_returns_128_plus_the_signal_through_each_shell() {
        use std::os::unix::process::ExitStatusExt;
        let python_ok = std::process::Command::new("python3")
            .arg("--version")
            .output()
            .is_ok_and(|o| o.status.success());
        if !python_ok {
            return;
        }
        let killed =
            shell_command("python3 -c 'import os, signal; os.kill(os.getpid(), signal.SIGKILL)'");
        let shells = [
            "/bin/sh",
            "/bin/bash",
            "/bin/zsh",
            "/bin/dash",
            "/usr/bin/fish",
            "/opt/homebrew/bin/fish",
            "/usr/local/bin/fish",
        ];
        for shell in shells {
            if !std::path::Path::new(shell).exists() {
                continue;
            }
            let status = std::process::Command::new(shell)
                .arg("-c")
                .arg(&killed)
                .stderr(std::process::Stdio::null())
                .status()
                .unwrap();
            assert_eq!(status.signal(), None, "{shell} was replaced by the helper");
            assert_eq!(status.code(), Some(137), "{shell}");
        }
    }

    #[test]
    fn ssh_and_start_failures_count_as_transport() {
        let transport =
            |code, stderr| matches!(exit_error(code, stderr), RemoteError::Transport(_));
        assert!(transport(Some(255), ""));
        assert!(transport(Some(255), "Killed: 9"));
        assert!(transport(None, ""));
        assert!(transport(Some(127), "bash: python3: command not found"));
        assert!(transport(Some(127), "sh: python3: nicht gefunden"));
        match exit_error(Some(127), "") {
            RemoteError::Transport(message) => {
                assert_eq!(message, "the remote helper could not start (exit 127)")
            }
            other => panic!("127 must stop the batch: {other:?}"),
        }
        assert!(transport(Some(1), "Permission denied (publickey)."));
        match exit_error(Some(137), "") {
            RemoteError::Killed(message) => {
                assert_eq!(message, "remote helper exited with status 137")
            }
            other => panic!("137 must fail only the item: {other:?}"),
        }
        match exit_error(Some(1), "Traceback (most recent call last):\nMemoryError") {
            RemoteError::Transport(message) => {
                assert_eq!(message, "the remote helper could not start: MemoryError")
            }
            other => panic!("exit 1 without an answer must stop the batch: {other:?}"),
        }
        match exit_error(Some(127), "bash: python3: command not found") {
            RemoteError::Transport(message) => assert_eq!(
                message,
                "python3 isn't installed on the host; the remote file browser requires it."
            ),
            other => panic!("a missing python3 must stop the batch: {other:?}"),
        }
    }

    #[test]
    fn only_ssh_itself_reads_stderr_as_an_ssh_failure() {
        let denied = "PermissionError: [Errno 13] Permission denied: '/srv/x'";
        let answered =
            br#"__TERAX_JSON__{"ok": false, "error": "[Errno 13] Permission denied: '/srv/x'"}"#;
        match read_envelope(Some(1), answered, false, denied) {
            Err(RemoteError::Failed(message)) => {
                assert_eq!(message, "[Errno 13] Permission denied: '/srv/x'")
            }
            other => panic!("an answered error must fail only the item: {other:?}"),
        }
        match read_envelope(Some(137), b"", false, "Permission denied") {
            Err(RemoteError::Killed(message)) => assert_eq!(
                message,
                "remote helper exited with status 137 (stderr: Permission denied)"
            ),
            other => panic!("137 must fail only the item: {other:?}"),
        }
        match read_envelope(Some(255), answered, false, "Permission denied (publickey).") {
            Err(RemoteError::Transport(message)) => {
                assert!(
                    message.starts_with("SSH authentication failed"),
                    "{message}"
                )
            }
            other => panic!("255 is ssh's own failure: {other:?}"),
        }
    }

    #[test]
    fn an_item_failure_quotes_only_the_last_stderr_line() {
        let stderr = format!(
            "{}\nTraceback (most recent call last):\nKilled",
            "x".repeat(4096)
        );
        match exit_error(Some(143), &stderr) {
            RemoteError::Killed(message) => assert_eq!(
                message,
                "remote helper exited with status 143 (stderr: Killed)"
            ),
            other => panic!("143 must fail only the item: {other:?}"),
        }
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
        assert_eq!(result.aborted, None);
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

    // An old interpreter fails before main(), so no item gets an answer.
    #[cfg(unix)]
    #[test]
    fn a_helper_that_cannot_start_stops_the_batch_with_its_stderr() {
        let stat = serde_json::json!({ "op": "stat", "path": "/terax/no/such/path" });
        let Some(syntax) = helper_output("def (\n", &stat) else {
            return;
        };
        let reply = |(code, stdout, stderr): &(Option<i32>, Vec<u8>, String)| {
            read_envelope(*code, stdout, false, stderr)
        };
        let start_failure = |output| match reply(output) {
            Err(RemoteError::Transport(message)) => message,
            other => panic!("a start failure must stop the batch: {other:?}"),
        };
        let message = start_failure(&syntax);
        assert!(
            message.starts_with("the remote helper could not start: SyntaxError"),
            "{message}"
        );
        let missing = helper_output("import terax_no_such_module\n", &stat).unwrap();
        let import = start_failure(&missing);
        assert!(import.contains("terax_no_such_module"), "{import}");

        let answered = helper_output("", &stat).unwrap();
        assert!(matches!(reply(&answered), Err(RemoteError::Failed(_))));
        let unmarked = (Some(0), b"motd only".to_vec(), "ImportError: x".to_string());
        assert_eq!(
            start_failure(&unmarked),
            "unexpected remote output (no response marker): motd only (stderr: ImportError: x)"
        );
        let shapeless = (Some(0), b"__TERAX_JSON__[1]".to_vec(), String::new());
        assert!(matches!(reply(&shapeless), Err(RemoteError::Transport(_))));

        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt"]);
        let (result, requests) = stub_copy(&sources, |_| reply(&syntax));
        assert_eq!(result.unwrap_err(), message);
        assert_eq!(requests.len(), 1);
        assert!(creates_staging(&requests[0]));
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
            let placed: Vec<bool> = result.failed.iter().map(|f| f.maybe_placed).collect();
            let mut flags = vec![true];
            flags.resize(expected.len(), false);
            assert_eq!(placed, flags);
            assert_eq!(result.aborted.as_deref(), Some(LOST));
            assert_eq!(requests.last().unwrap()["op"], "publish");
            assert!(!requests.iter().any(|r| r["op"] == "delete"));
        }
    }

    #[test]
    fn a_helper_killed_while_publishing_leaves_only_that_item_fate_unknown() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt"]);
        let mut publishes_seen = 0;
        let (result, requests) = stub_copy(&sources, |request| {
            if request["op"] == "publish" {
                publishes_seen += 1;
                if publishes_seen == 1 {
                    return Err(exit_error(Some(137), ""));
                }
            }
            healthy(request)
        });
        let result = result.expect("a killed publish must not reject the batch");
        assert_eq!(result.created, ["/remote/b.txt"]);
        assert_eq!(
            failures(&result),
            [(sources[0].clone(), PUBLISH_KILLED.to_string())]
        );
        assert!(result.failed[0].maybe_placed);
        assert_eq!(result.aborted, None);
        assert_eq!(publishes(&requests).len(), 2);
        // The staging is gone either way: a placed item already left it.
        assert_eq!(
            deletes(&requests),
            [&serde_json::json!("/remote/.terax-copy-stub_9Xk")]
        );
    }

    #[test]
    fn a_step_past_its_budget_fails_its_item_and_stops_the_batch() {
        let src = tempfile::tempdir().unwrap();
        let sources = local_sources(src.path(), &["a.txt", "b.txt", "c.txt"]);
        for op in ["mkstage", "write_bytes", "publish"] {
            let timed_out = timed_out_msg("stub", op, 30);
            let mut seen = 0;
            let (result, requests) = stub_copy(&sources, |request| {
                if request["op"] == op {
                    seen += 1;
                    if seen == 2 {
                        return Err(RemoteError::TimedOut(timed_out.clone()));
                    }
                }
                healthy(request)
            });
            let result = result.expect("a slow step must not reject the batch");
            assert_eq!(result.created, ["/remote/a.txt"], "{op}");
            assert_eq!(result.aborted.as_deref(), Some(timed_out.as_str()), "{op}");
            let first = match op {
                "publish" => PUBLISH_TIMED_OUT.to_string(),
                _ => timed_out.clone(),
            };
            assert_eq!(
                failures(&result),
                [
                    (sources[1].clone(), first),
                    (sources[2].clone(), timed_out.clone()),
                ],
                "{op}"
            );
            let placed: Vec<bool> = result.failed.iter().map(|f| f.maybe_placed).collect();
            assert_eq!(placed, [op == "publish", false], "{op}");
            // The helper may still be at work, so its staging is left alone.
            assert!(deletes(&requests).is_empty(), "{op}");
            assert_eq!(requests.iter().filter(|r| creates_staging(r)).count(), 2);
        }
    }

    #[test]
    fn a_failure_is_sent_with_its_maybe_placed_flag_in_camel_case() {
        let failure = crate::modules::fs::copy::CopyFailure {
            source: "/x/a.txt".into(),
            message: PUBLISH_KILLED.into(),
            maybe_placed: true,
        };
        assert_eq!(
            serde_json::to_value(&failure).unwrap(),
            serde_json::json!({
                "source": "/x/a.txt", "message": PUBLISH_KILLED, "maybePlaced": true,
            })
        );
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

    #[cfg(unix)]
    #[test]
    fn a_file_swapped_for_a_link_after_planning_fails_without_an_upload() {
        let src = tempfile::tempdir().unwrap();
        let pkg = src.path().join("pkg");
        std::fs::create_dir(&pkg).unwrap();
        std::fs::write(pkg.join("a.txt"), b"a").unwrap();
        std::fs::write(src.path().join("secret"), b"s").unwrap();
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let mut plan = Vec::new();
        plan_upload(&pkg, String::new(), 0, false, &mut plan, &reg).unwrap();
        std::fs::remove_file(pkg.join("a.txt")).unwrap();
        std::os::unix::fs::symlink(src.path().join("secret"), pkg.join("a.txt")).unwrap();

        let mut requests = Vec::new();
        let result = upload(
            &mut |request, _| {
                requests.push(request.clone());
                healthy(request)
            },
            &plan,
            "/remote/.terax-copy-stub_9Xk/item",
        );
        let changed = crate::modules::fs::copy::changed_since_plan().to_string();
        assert!(matches!(result, Err(RemoteError::Failed(m)) if m == changed));
        assert!(!requests.iter().any(|r| r["op"] == "write_bytes"));
    }

    #[cfg(unix)]
    #[test]
    fn a_secret_named_link_in_an_uploaded_folder_is_judged_by_its_target() {
        let src = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(src.path().join("keys")).unwrap();
        std::fs::write(src.path().join("keys/id_ed25519"), b"PRIVATE").unwrap();
        std::fs::write(src.path().join("settings.txt"), b"x=1").unwrap();
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let plan = |root: &std::path::Path| {
            let mut plan = Vec::new();
            plan_upload(root, String::new(), 0, false, &mut plan, &reg).map(|()| plan)
        };
        let folder = |name: &str, target: &str| {
            let pkg = src.path().join(name);
            std::fs::create_dir(&pkg).unwrap();
            std::os::unix::fs::symlink(src.path().join(target), pkg.join(".env")).unwrap();
            pkg
        };

        let err = plan(&folder("leaks", "keys/id_ed25519")).unwrap_err();
        assert_eq!(
            err.to_string(),
            "refused: \"id_ed25519\" matches a sensitive-file pattern"
        );
        let planned = plan(&folder("plain", "settings.txt")).unwrap();
        assert!(planned
            .iter()
            .any(|step| matches!(step, Upload::File { rel, .. } if rel == "/.env")));

        // A link the user named directly keeps the editor's trusted open.
        let named = src.path().join(".env");
        std::os::unix::fs::symlink(src.path().join("keys/id_ed25519"), &named).unwrap();
        assert!(plan(&named).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn links_in_an_uploaded_folder_may_lead_outside_the_workspace() {
        let ws = tempfile::tempdir().unwrap();
        let opt = tempfile::tempdir().unwrap();
        std::fs::write(opt.path().join("python3.12"), b"#!").unwrap();
        let bin = ws.path().join("proj/.venv/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::os::unix::fs::symlink(opt.path().join("python3.12"), bin.join("python")).unwrap();
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        reg.authorize(ws.path()).unwrap();

        let mut plan = Vec::new();
        plan_upload(
            &ws.path().join("proj"),
            String::new(),
            0,
            false,
            &mut plan,
            &reg,
        )
        .expect("a link out of the workspace is no refusal");
        assert!(plan.iter().any(|step| matches!(
            step,
            Upload::File { rel, .. } if rel == "/.venv/bin/python"
        )));
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
        assert!(matches!(&plan[0], Upload::Dir { rel, .. } if rel.is_empty()));
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

    #[cfg(unix)]
    #[test]
    fn sockets_and_fifos_inside_an_uploaded_folder_are_left_out() {
        let src = tempfile::tempdir().unwrap();
        let pkg = src.path().join("pkg");
        std::fs::create_dir(&pkg).unwrap();
        std::fs::write(pkg.join("a.txt"), b"a").unwrap();
        let _socket = std::os::unix::net::UnixListener::bind(pkg.join("socket")).unwrap();
        let fifo = std::ffi::CString::new(pkg.join("pipe").to_string_lossy().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        let reg = crate::modules::workspace::WorkspaceRegistry::default();

        let mut plan = Vec::new();
        plan_upload(&pkg, String::new(), 0, false, &mut plan, &reg).unwrap();
        let rels: Vec<&str> = plan
            .iter()
            .map(|step| match step {
                Upload::Dir { rel, .. } | Upload::File { rel, .. } => rel.as_str(),
            })
            .collect();
        assert_eq!(rels, ["", "/a.txt"]);

        let (result, _) = stub_copy(&[pkg.join("pipe").to_string_lossy().into_owned()], healthy);
        assert_eq!(
            result.unwrap().failed[0].message,
            "only files, folders and symbolic links can be copied"
        );
    }

    #[test]
    fn a_leftover_staging_dir_in_an_uploaded_folder_is_left_out() {
        let src = tempfile::tempdir().unwrap();
        let pkg = src.path().join("pkg");
        std::fs::create_dir_all(pkg.join(".terax-copy-x9Kq2_Lm/item")).unwrap();
        std::fs::write(pkg.join(".terax-copy-x9Kq2_Lm/item/half"), b"h").unwrap();
        std::fs::write(pkg.join("a.txt"), b"a").unwrap();
        let reg = crate::modules::workspace::WorkspaceRegistry::default();
        let mut plan = Vec::new();
        plan_upload(&pkg, String::new(), 0, false, &mut plan, &reg).unwrap();
        let rels: Vec<&str> = plan
            .iter()
            .map(|step| match step {
                Upload::Dir { rel, .. } | Upload::File { rel, .. } => rel.as_str(),
            })
            .collect();
        assert_eq!(rels, ["", "/a.txt"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_fails_its_item_naming_the_entry() {
        let src = tempfile::tempdir().unwrap();
        let pkg = src.path().join("pkg");
        std::fs::create_dir_all(pkg.join("sub")).unwrap();
        std::fs::write(pkg.join("a.txt"), b"a").unwrap();
        std::os::unix::fs::symlink("gone.txt", pkg.join("sub/dead")).unwrap();
        let lone = src.path().join("lone-link");
        std::os::unix::fs::symlink("gone.txt", &lone).unwrap();
        let [pkg, lone] = [pkg, lone].map(|p| p.to_string_lossy().into_owned());
        let ok = local_sources(src.path(), &["ok.txt"]).remove(0);

        let (result, requests) = stub_copy(&[pkg.clone(), lone.clone(), ok], healthy);
        let result = result.unwrap();
        assert_eq!(result.created, ["/remote/ok.txt"]);
        assert_eq!(
            failures(&result),
            [
                (pkg, "broken symlink: sub/dead".to_string()),
                (lone, "broken symlink: lone-link".to_string()),
            ]
        );
        assert_eq!(requests.iter().filter(|r| creates_staging(r)).count(), 1);
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

    // Typed remote reads (slice 02). Helper envelopes are written out with the
    // literal sentinel, so a renamed TERAX_SENTINEL does not move both sides.

    fn exit(code: Option<i32>, stdout: &str, stderr: &str) -> HelperRun {
        Ok(HelperExit {
            code,
            stdout: stdout.as_bytes().to_vec(),
            overflow: false,
            stderr: stderr.to_string(),
        })
    }

    fn answer(envelope: &str) -> String {
        format!("__TERAX_JSON__{envelope}")
    }

    const FOO_AT_A_PNG: &str = r#"{"ok": true, "data": {"real": "/srv/p/a.png", "b64": "Zm9v"}}"#;
    const CONNECTION_REFUSED: &str = "ssh: connect to host devbox port 22: Connection refused";
    const REFUSED_SESSION: &str = "mux_client_request_session: session request failed: \
                                   Session open refused by peer\nPermission denied (publickey).";

    fn failed(text: &str) -> Option<RemoteReadError> {
        Some(RemoteReadError::Failed(text.to_string()))
    }

    fn bytes_of(result: Result<RemoteFileBytes, RemoteReadError>) -> RemoteFileBytes {
        match result {
            Ok(file) => file,
            Err(error) => panic!("expected the bytes, got {error:?}"),
        }
    }

    /// The typed read run against the local helper, through the same request
    /// and the same decoding as `read_bytes_typed`; `None` without python3,
    /// like the other helper tests. Also returns the raw envelope.
    #[cfg(unix)]
    fn typed_read_here(
        prelude: &str,
        path: &std::path::Path,
        limit: u64,
    ) -> Option<(Result<RemoteFileBytes, RemoteReadError>, String)> {
        let mut envelope = None;
        let budget = std::time::Duration::from_secs(60);
        let run_here = |_: &str, request: &serde_json::Value, _: Option<_>| -> HelperRun {
            let (code, stdout, stderr) = helper_output(prelude, request)
                .ok_or_else(|| RemoteError::Transport("no local python3".to_string()))?;
            envelope = Some(String::from_utf8_lossy(&stdout).into_owned());
            Ok(HelperExit {
                code,
                stdout,
                overflow: false,
                stderr,
            })
        };
        let path = path.to_string_lossy();
        let result = read_bytes_typed_with("devbox", &path, limit, budget, run_here);
        Some((result, envelope?))
    }

    /// A path as a Python string literal (JSON quoting is valid Python).
    #[cfg(unix)]
    fn py_str(path: &std::path::Path) -> String {
        serde_json::to_string(&path.to_string_lossy()).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn ac1_the_helpers_refusals_decode_to_missing_not_regular_and_too_large() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.png");
        std::fs::write(&big, vec![7u8; 64]).unwrap();

        let Some((missing, envelope)) = typed_read_here("", &dir.path().join("gone.png"), 1024)
        else {
            return;
        };
        assert_eq!(missing.err(), Some(RemoteReadError::Missing));
        assert!(envelope.contains(r#""kind": "missing""#), "{envelope}");

        let (folder, envelope) = typed_read_here("", dir.path(), 1024).unwrap();
        assert_eq!(folder.err(), Some(RemoteReadError::NotRegularFile));
        assert!(envelope.contains(r#""kind": "not_regular""#), "{envelope}");

        let (large, envelope) = typed_read_here("", &big, 63).unwrap();
        assert_eq!(large.err(), Some(RemoteReadError::TooLarge));
        assert!(envelope.contains(r#""kind": "too_large""#), "{envelope}");
        assert!(!envelope.contains("b64"), "refused before the transfer: {envelope}");

        let (fits, _) = typed_read_here("", &big, 64).unwrap();
        let file = bytes_of(fits);
        assert_eq!(file.bytes, vec![7u8; 64]);
        assert_eq!(file.resolved_path, std::fs::canonicalize(&big).unwrap().to_string_lossy());
    }

    // Disposition 5: the editor's read keeps every error text; the kind only rides along.
    #[cfg(unix)]
    #[test]
    fn the_editor_read_keeps_its_error_texts_now_that_kinds_ride_along() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let gone = root.join("gone.png");
        let big = root.join("big.png");
        std::fs::write(&big, vec![7u8; 64]).unwrap();
        let cases = [
            (
                gone.clone(),
                1024,
                format!("[Errno 2] No such file or directory: '{}'", gone.display()),
            ),
            (root.clone(), 1024, format!("not a regular file: {}", root.display())),
            (big, 63, "file too large to preview: 64 bytes (limit 63)".to_string()),
        ];
        for (path, limit, text) in cases {
            let path = path.to_string_lossy();
            let req = serde_json::json!({ "op": "read_bytes", "path": path, "limit": limit });
            let Some((code, stdout, stderr)) = helper_output("", &req) else {
                return;
            };
            let reply = read_envelope(code, &stdout, false, &stderr).err().map(String::from);
            assert_eq!(reply, Some(text));
        }
    }

    /// Kinds whose `READ_*` definition line is missing from `helper`.
    fn kinds_missing_from(helper: &str) -> Vec<&'static str> {
        [
            ("READ_MISSING", READ_MISSING),
            ("READ_NOT_REGULAR", READ_NOT_REGULAR),
            ("READ_TOO_LARGE", READ_TOO_LARGE),
        ]
        .into_iter()
        .filter(|(name, kind)| !helper.contains(&format!("\n{name} = \"{kind}\"\n")))
        .map(|(_, kind)| kind)
        .collect()
    }

    #[test]
    fn ac2_each_read_kind_stands_once_in_the_helper() {
        assert_eq!(
            [READ_MISSING, READ_NOT_REGULAR, READ_TOO_LARGE],
            ["missing", "not_regular", "too_large"]
        );
        assert_eq!(kinds_missing_from(REMOTE_PYTHON), Vec::<&str>::new());
        for kind in ["missing", "not_regular", "too_large"] {
            assert_eq!(REMOTE_PYTHON.matches(&format!("\"{kind}\"")).count(), 1, "{kind}");
        }
        // Red counter-probe: the same checker on a copy with `not_regular` renamed.
        let renamed = REMOTE_PYTHON.replace("\"not_regular\"", "\"not_a_file\"");
        assert_eq!(kinds_missing_from(&renamed), vec!["not_regular"]);
    }

    #[test]
    fn ac3_the_typed_answer_sorts_exit_code_stdout_and_stderr() {
        assert_eq!(
            read_bytes_answer(exit(Some(255), "", CONNECTION_REFUSED)).err(),
            Some(RemoteReadError::Unreachable(
                "Connection refused — the host isn't accepting SSH on that address/port."
                    .to_string()
            ))
        );
        let late = RemoteError::TimedOut(timed_out_msg("devbox", "read_bytes", 60));
        assert_eq!(
            read_bytes_answer(Err(late)).err(),
            Some(RemoteReadError::TimedOut(
                "SSH request to 'devbox' timed out after 60s (budget) and was killed: read_bytes"
                    .to_string()
            ))
        );
        assert_eq!(
            read_bytes_answer(exit(Some(137), "", "")).err(),
            failed("remote helper exited with status 137")
        );
        let boom = answer(r#"{"ok": false, "error": "boom"}"#);
        assert_eq!(read_bytes_answer(exit(Some(0), &boom, "")).err(), failed("boom"));
        let file = bytes_of(read_bytes_answer(exit(Some(0), &answer(FOO_AT_A_PNG), "")));
        assert_eq!(
            (file.resolved_path.as_str(), file.bytes.as_slice()),
            ("/srv/p/a.png", &b"foo"[..])
        );
        // ssh that never started is unreachable too.
        let spawn =
            RemoteError::Transport("ssh spawn failed: No such file or directory".to_string());
        assert_eq!(
            read_bytes_answer(Err(spawn)).err(),
            Some(RemoteReadError::Unreachable(
                "ssh spawn failed: No such file or directory".to_string()
            ))
        );
    }

    #[test]
    fn a_helper_error_with_an_unknown_kind_stays_failed_with_its_text() {
        let odd = answer(r#"{"ok": false, "error": "nope", "kind": "gone"}"#);
        assert_eq!(read_bytes_answer(exit(Some(0), &odd, "")).err(), failed("nope"));
    }

    #[test]
    fn typed_reasons_carry_no_control_characters_and_stay_short() {
        assert_eq!(
            read_error(RemoteError::Failed("line one\nline\ttwo\u{1b}[31m".to_string())),
            RemoteReadError::Failed("line one line two [31m".to_string())
        );
        assert_eq!(
            read_error(RemoteError::Transport("x".repeat(1000))),
            RemoteReadError::Unreachable("x".repeat(300))
        );
    }

    fn refused_session(
        _: &str,
        _: &serde_json::Value,
        _: Option<std::time::Duration>,
    ) -> HelperRun {
        exit(Some(255), "", REFUSED_SESSION)
    }

    #[test]
    fn ac4_a_refused_session_names_the_session_limit_in_all_three_reads() {
        let budget = std::time::Duration::from_secs(60);
        let expected = Some(RemoteReadError::Unreachable(
            "the SSH server refused another session (MaxSessions limit)".to_string(),
        ));
        let read = read_bytes_typed_with("devbox", "/srv/p/a.png", 1024, budget, refused_session);
        for (read, got) in [
            ("read_bytes_typed", read.err()),
            ("realpath_typed", realpath_typed_with("devbox", "/srv/p", refused_session).err()),
            ("stat_typed", stat_typed_with("devbox", "/srv/p/a.png", refused_session).err()),
        ] {
            assert_eq!(got, expected, "{read}");
            assert!(!format!("{got:?}").contains("open a terminal"), "{read}");
        }
        // Every other caller keeps the login hint for the same stderr.
        let hint = classify_ssh_error(REFUSED_SESSION).expect("a hint");
        assert!(hint.contains("open a terminal to this host first"), "{hint}");
        let editor = read_envelope(Some(255), b"", false, REFUSED_SESSION)
            .err()
            .map(String::from)
            .expect("an error");
        assert!(editor.contains("open a terminal to this host first"), "{editor}");
        // Only ssh's own exit counts: a helper that answered keeps its answer.
        let answered = read_bytes_answer(exit(Some(0), &answer(FOO_AT_A_PNG), REFUSED_SESSION));
        assert!(answered.is_ok());
    }

    // PD-01 / OB-22: the budget the typed read hands its executor is what
    // `run_remote_helper` passes to `wait_child` in production.
    #[test]
    fn ac5_the_typed_read_hands_its_own_budget_to_the_ssh_call() {
        use std::time::Duration;
        for budget in [Duration::from_secs(60), Duration::from_millis(1500)] {
            let mut seen = None;
            let record = |host: &str, request: &serde_json::Value, timeout: Option<Duration>| {
                seen = Some((host.to_string(), request.clone(), timeout));
                exit(Some(0), &answer(FOO_AT_A_PNG), "")
            };
            let result = read_bytes_typed_with("devbox", "/srv/p/a.png", 10485760, budget, record);
            assert!(result.is_ok());
            let (host, request, timeout) = seen.expect("one helper run");
            assert_eq!(host, "devbox");
            let expected = serde_json::json!({
                "op": "read_bytes", "path": "/srv/p/a.png", "limit": 10485760, "exact": true,
            });
            assert_eq!(request, expected);
            assert_eq!(timeout, Some(budget));
        }
        // The editor's budget for the same limit, which the typed read must not take.
        assert_eq!(read_bytes_timeout(10485760, None), Duration::from_secs(244));
    }

    // The runtime test below runs `run_remote_helper` with a stand-in program.
    // What no test can run without a real ssh are the one-line hops to it: the
    // public typed reads, `ssh_helper` and the launcher they use. This pins
    // that they hand over their arguments unchanged and start plain `ssh`.
    #[test]
    fn ac5_the_public_typed_reads_delegate_their_arguments_unchanged() {
        // A checkout with CRLF line ends must not change what this test sees.
        let source = include_str!("ssh.rs").replace("\r\n", "\n");
        let code = source.split("#[cfg(test)]\nmod tests {").next().unwrap();
        let code: String = code.chars().filter(|c| !c.is_whitespace()).collect();
        for body in [
            "{read_bytes_typed_with(host,path,limit,budget,ssh_helper)}",
            "{realpath_typed_with(host,path,ssh_helper)}",
            "{stat_typed_with(host,path,ssh_helper)}",
            "->HelperRun{run_remote_helper(&SSH_LAUNCHER,host,request,timeout)}",
            "letexit=ssh_helper(host,request,timeout)?;",
            "constSSH_LAUNCHER:Launcher=Launcher{program:\"ssh\",args:&[],};",
            "letmutcmd=Command::new(launcher.program);cmd.args(launcher.args).arg(\"-T\")",
        ] {
            assert_eq!(code.matches(body).count(), 1, "{body}");
        }
    }

    /// Stands in for ssh: the ssh arguments become `$1…` of the script, which
    /// ignores them and never answers.
    #[cfg(unix)]
    const HUNG_LAUNCHER: Launcher = Launcher {
        program: "sh",
        args: &["-c", "exec sleep 30", "sh"],
    };

    // The production body of `run_remote_helper`, from its budget to
    // `wait_child`, with a program that never answers: only the budget handed
    // to the typed read can end it, long before the program would.
    #[cfg(unix)]
    #[test]
    fn ac5_a_hung_helper_run_is_killed_when_the_typed_budget_runs_out() {
        use std::time::{Duration, Instant};
        let run = |host: &str, request: &serde_json::Value, timeout: Option<Duration>| {
            run_remote_helper(&HUNG_LAUNCHER, host, request, timeout)
        };
        let started = Instant::now();
        let budget = Duration::from_millis(300);
        let result = read_bytes_typed_with("devbox", "/srv/p/a.png", 10485760, budget, run);
        let elapsed = started.elapsed();
        assert_eq!(
            result.err(),
            Some(RemoteReadError::TimedOut(
                "SSH request to 'devbox' timed out after 0s (budget) and was killed: read_bytes"
                    .to_string()
            ))
        );
        assert!(elapsed < Duration::from_secs(10), "took {elapsed:?}");
    }

    #[test]
    fn ac10_realpath_and_stat_answers_and_their_budget() {
        assert_eq!(
            realpath_answer(exit(Some(0), &answer(r#"{"ok": true, "data": "/srv/p/a.html"}"#), "")),
            Ok("/srv/p/a.html".to_string())
        );
        let stat = r#"{"ok": true, "data": {"size": 2048, "mtime": 1, "kind": "file"}}"#;
        let stat = match stat_answer(exit(Some(0), &answer(stat), "")) {
            Ok(stat) => stat,
            Err(error) => panic!("expected a stat, got {error:?}"),
        };
        assert_eq!(stat.size, 2048);
        assert!(matches!(stat.kind, crate::modules::fs::file::StatKind::File));

        let enoent = answer(r#"{"ok": false, "error": "[Errno 2] No such file or directory"}"#);
        assert_eq!(
            realpath_answer(exit(Some(0), &enoent, "")).err(),
            failed("[Errno 2] No such file or directory")
        );
        assert_eq!(
            stat_answer(exit(Some(0), &enoent, "")).err(),
            failed("[Errno 2] No such file or directory")
        );
        let unreachable =
            |error: Option<RemoteReadError>| matches!(error, Some(RemoteReadError::Unreachable(_)));
        assert!(unreachable(realpath_answer(exit(Some(255), "", CONNECTION_REFUSED)).err()));
        assert!(unreachable(stat_answer(exit(Some(255), "", CONNECTION_REFUSED)).err()));

        let mut seen = Vec::new();
        let _ = realpath_typed_with("devbox", "/srv/p/a.html", |_, request, timeout| {
            seen.push((request.clone(), timeout));
            exit(Some(0), &answer(r#"{"ok": true, "data": "/srv/p/a.html"}"#), "")
        });
        let _ = stat_typed_with("devbox", "/srv/p/a.html", |_, request, timeout| {
            seen.push((request.clone(), timeout));
            exit(Some(0), &answer(r#"{"ok": false, "error": "x"}"#), "")
        });
        let thirty = Some(std::time::Duration::from_secs(30));
        assert_eq!(
            seen,
            [
                (serde_json::json!({ "op": "realpath", "path": "/srv/p/a.html" }), thirty),
                (serde_json::json!({ "op": "stat", "path": "/srv/p/a.html" }), thirty),
            ]
        );
    }

    // OB-21: only an absolute, normalized target leaves the typed reads.
    #[test]
    fn typed_reads_refuse_a_reported_target_that_is_not_exact() {
        let refused = failed("the host reported a path that is not absolute and normalized");
        for real in ["srv/p/a.png", "/srv/./a.png", "/srv/../a.png", "/srv//a.png", "/srv/p/", ""] {
            let bytes = serde_json::json!({ "ok": true, "data": { "real": real, "b64": "Zm9v" } });
            let bytes = read_bytes_answer(exit(Some(0), &answer(&bytes.to_string()), ""));
            assert_eq!(bytes.err(), refused, "read_bytes_typed {real:?}");
            let path = serde_json::json!({ "ok": true, "data": real });
            let path = realpath_answer(exit(Some(0), &answer(&path.to_string()), ""));
            assert_eq!(path.err(), refused, "realpath_typed {real:?}");
        }
        for real in ["/", "/srv/p/a.png", "/srv/p/.hidden", "/srv/p/a..b"] {
            let path = serde_json::json!({ "ok": true, "data": real });
            assert_eq!(
                realpath_answer(exit(Some(0), &answer(&path.to_string()), "")),
                Ok(real.to_string())
            );
        }
    }

    // OB-20: after realpath, a folder on the way becomes a link to a folder
    // outside; the exact open must not follow it.
    #[cfg(unix)]
    #[test]
    fn the_typed_read_never_returns_bytes_from_a_folder_swapped_for_a_link() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let sub = root.join("shared/sub");
        let outside = root.join("outside/sub");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(sub.join("a.png"), b"INSIDE").unwrap();
        std::fs::write(outside.join("a.png"), b"SECRET").unwrap();
        let prelude = format!(
            "import os\n\
             _realpath = os.path.realpath\n\
             def _swap(p, *a, **k):\n    \
                 r = _realpath(p, *a, **k)\n    \
                 os.rename({sub}, {sub} + '.was')\n    \
                 os.symlink({outside}, {sub})\n    \
                 return r\n\
             os.path.realpath = _swap\n",
            sub = py_str(&sub),
            outside = py_str(&outside),
        );
        let Some((result, envelope)) = typed_read_here(&prelude, &sub.join("a.png"), 1024) else {
            return;
        };
        assert!(
            std::fs::symlink_metadata(&sub).unwrap().file_type().is_symlink(),
            "the swap must have happened"
        );
        assert!(!envelope.contains(&b64encode(b"SECRET")), "{envelope}");
        assert_eq!(result.err(), failed("the path changed while it was read"));
    }

    #[cfg(unix)]
    #[test]
    fn the_typed_read_resolves_links_the_request_itself_names() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        std::fs::create_dir(root.join("real")).unwrap();
        std::fs::write(root.join("real/a.png"), b"foo").unwrap();
        std::os::unix::fs::symlink(root.join("real"), root.join("link")).unwrap();
        let Some((result, _)) = typed_read_here("", &root.join("link/a.png"), 1024) else {
            return;
        };
        let file = bytes_of(result);
        assert_eq!(file.bytes, b"foo");
        assert_eq!(file.resolved_path, root.join("real/a.png").to_string_lossy());
    }

    #[cfg(unix)]
    #[test]
    fn a_host_without_dir_fd_refuses_the_typed_read_and_keeps_the_editor_read() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.png");
        std::fs::write(&file, b"foo").unwrap();
        let prelude = "import os\nos.supports_dir_fd = set()\n";
        let Some((typed, _)) = typed_read_here(prelude, &file, 1024) else {
            return;
        };
        assert_eq!(typed.err(), failed("this host cannot open a file without following symlinks"));
        let path = file.to_string_lossy();
        let req = serde_json::json!({ "op": "read_bytes", "path": path, "limit": 1024 });
        let env = run_helper(prelude, &req).unwrap();
        assert_eq!(env["ok"], serde_json::Value::Bool(true), "{env}");
        assert_eq!(parse_read_bytes(env["data"].clone()).unwrap().bytes, b"foo");
    }

    // The exact open walks with O_PATH on Linux, so a folder the user may only
    // pass through still reads, as it does for the editor.
    #[cfg(target_os = "linux")]
    #[test]
    fn the_typed_read_passes_a_search_only_folder_on_linux() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::write(locked.join("a.png"), b"foo").unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o100)).unwrap();
        let read = typed_read_here("", &locked.join("a.png"), 1024);
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o700)).unwrap();
        let Some((result, _)) = read else {
            return;
        };
        assert_eq!(bytes_of(result).bytes, b"foo");
    }

    #[test]
    fn typed_reasons_turn_separators_and_direction_marks_into_spaces() {
        let text = "a\u{2028}b\u{2029}c\u{202E}d\u{200B}e\u{2066}f\u{061C}g\u{FEFF}h\u{200F}i\u{202A}j\u{2069}k";
        assert_eq!(
            read_error(RemoteError::Failed(text.to_string())),
            RemoteReadError::Failed("a b c d e f g h i j k".to_string())
        );
        assert_eq!(host_reason("Größe ä € 日本"), "Größe ä € 日本");
    }

    // A folder that turns up at the last step after the check is refused as
    // not regular, and no descriptor stays open, with and without the exact open.
    #[cfg(unix)]
    #[test]
    fn a_folder_swapped_in_after_the_check_is_not_regular_and_leaks_no_descriptor() {
        let dir = tempfile::tempdir().unwrap();
        let folder = std::fs::canonicalize(dir.path()).unwrap().join("folder");
        std::fs::create_dir(&folder).unwrap();
        let prelude = [
            "import os, sys, atexit",
            "_stat = os.stat",
            "class _Regular: st_mode = 0o100600; st_size = 0",
            "os.stat = lambda p, *a, **k: _Regular() if str(p).endswith('folder') else _stat(p, *a, **k)",
            "_open = os.open",
            "_fds = []",
            "def _track(*a, **k):",
            "    fd = _open(*a, **k)",
            "    _fds.append(fd)",
            "    return fd",
            "os.open = _track",
            "os.supports_dir_fd = os.supports_dir_fd | {_track}",
            "def _left():",
            "    n = 0",
            "    for fd in set(_fds):",
            "        try:",
            "            os.fstat(fd)",
            "            n += 1",
            "        except OSError:",
            "            pass",
            "    sys.stderr.write('open fds: %d' % n)",
            "atexit.register(_left)",
            "",
        ]
        .join("\n");
        for exact in [true, false] {
            let path = folder.to_string_lossy();
            let req = serde_json::json!({ "op": "read_bytes", "path": path, "exact": exact });
            let Some((code, stdout, stderr)) = helper_output(&prelude, &req) else {
                return;
            };
            assert!(stderr.ends_with("open fds: 0"), "exact {exact}: {stderr}");
            let exit = Ok(HelperExit {
                code,
                stdout,
                overflow: false,
                stderr,
            });
            assert_eq!(
                read_bytes_answer(exit).err(),
                Some(RemoteReadError::NotRegularFile),
                "exact {exact}"
            );
        }
    }
}
