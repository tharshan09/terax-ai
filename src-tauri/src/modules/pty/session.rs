use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, MasterPty, PtySize};
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, Manager};

use super::agent_detect::AgentDetector;
use super::da_filter::DaFilter;
use super::shell_init;
use crate::modules::workspace::WorkspaceEnv;

const AGENT_EVENT: &str = "terax:agent-signal";

// Flusher coalesces a short window after first-byte arrival so we send chunks,
// not single bytes. MAX_IDLE is only a safety net for missed signals.
const FLUSH_COALESCE: Duration = Duration::from_millis(4);
const FLUSH_MAX_IDLE: Duration = Duration::from_millis(50);
// A hidden leaf coalesces over a much larger window than a visible one, so a
// noisy background agent's output reaches the main thread in far fewer, bigger
// emits (~15/s per session instead of ~250/s) — a ~16x cut in main-thread
// callback rate. 64ms is 16x FLUSH_COALESCE and still under the ~100ms a tab
// switch would notice, so even if a visibility hint were ever lost the
// worst-case latency to screen stays imperceptible. Flush-on-visible normally
// makes a hidden->visible switch instant anyway. This only changes WHEN/HOW BIG
// a batch is emitted, never WHICH bytes arrive or their order.
const FLUSH_HIDDEN_COALESCE: Duration = Duration::from_millis(64);
const READ_BUF: usize = 16 * 1024;
// Cap on buffered-but-not-yet-flushed bytes. On overflow we discard the
// entire pending buffer and emit an SGR-reset + notice in its place.
// Dropping a partial prefix would slice a CSI sequence in half and corrupt
// xterm's screen state. 4 MiB is ~1000 full 80x24 screens.
const MAX_PENDING: usize = 4 * 1024 * 1024;
// Once the pending buffer grows past this, the reader wakes the flusher to cut
// its coalescing window short instead of letting a hidden leaf's 16x-larger
// window grow the backlog toward MAX_PENDING (which discards it). A flood then
// degrades to more/earlier emits — the same ~1 GiB/s drop ceiling as before the
// hidden window existed — rather than dropped output. A quarter of the cap
// leaves ample headroom for bytes that arrive between the signal and the take.
const FLUSH_FORCE_THRESHOLD: usize = MAX_PENDING / 4;
// Hard reset (ESC c) + dim notice. Written verbatim into the stream when
// we're forced to discard backlog.
const OVERFLOW_NOTICE: &[u8] =
    b"\x1bc\x1b[2m[terax: dropped output due to backpressure]\x1b[0m\r\n";

// Per-session flusher backpressure control. The frontend pushes on-screen state
// through `pty_set_visible`, which routes here; the flusher reads `visible` to
// size its coalescing window. Defaults to visible so a session that never
// receives a hint (or whose hint was lost/failed) behaves exactly as before —
// an on-screen session is never throttled by accident.
struct FlushControl {
    visible: AtomicBool,
    // Set by the reader when the pending buffer crosses FLUSH_FORCE_THRESHOLD;
    // consumed by `coalesce` to end the window early so a hidden leaf's backlog
    // can't grow toward the MAX_PENDING drop cap. A one-shot signal.
    force_flush: AtomicBool,
    // Guards the coalesce condvar. Held only for the brief predicate checks
    // between waits, never across the child's output path (that's the separate
    // `pending` mutex), so pushing visibility never contends with the reader.
    lock: Mutex<()>,
    cv: Condvar,
}

impl FlushControl {
    fn new() -> Self {
        Self {
            visible: AtomicBool::new(true),
            force_flush: AtomicBool::new(false),
            lock: Mutex::new(()),
            cv: Condvar::new(),
        }
    }

    // Push a visibility hint and wake the flusher's coalescing wait so a
    // hidden->visible flip flushes the pending backlog immediately (no
    // perceptible tab-switch latency) instead of waiting out the hidden window.
    fn set_visible(&self, visible: bool) {
        // Store under the lock the flusher checks under, so its predicate can't
        // miss the flip between its check and its wait (no lost wakeup).
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.visible.store(visible, Ordering::Release);
        self.cv.notify_one();
    }

    // Wake the flusher out of its coalescing wait without changing visibility
    // (used on child exit so the loop re-checks `done` promptly).
    fn wake(&self) {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.cv.notify_one();
    }

    // The reader calls this when the pending buffer crosses
    // FLUSH_FORCE_THRESHOLD: flag it and wake the coalescing wait so a hidden
    // window ends early instead of growing the backlog toward the drop cap.
    // Same lock+notify discipline as set_visible — the flag is stored and the
    // condvar notified under the same lock the flusher checks under, so its
    // predicate can't miss the flag between its check and its wait (no lost
    // wakeup). The flag persists until consumed, so even if this notify races a
    // flusher that isn't currently parked here, the next coalesce entry sees it.
    fn signal_force_flush(&self) {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.force_flush.store(true, Ordering::Release);
        self.cv.notify_one();
    }

    // Sleep out the coalescing window for the current visibility, returning
    // early if the leaf becomes visible (flush-on-visible) or the child exits.
    // A visible leaf uses the short FLUSH_COALESCE window; a hidden one uses the
    // much larger FLUSH_HIDDEN_COALESCE. This only changes WHEN/HOW BIG a batch
    // is, never WHICH bytes flush or their order — the caller takes the whole
    // pending buffer afterwards regardless.
    fn coalesce(&self, done: &AtomicBool) {
        let started_hidden = !self.visible.load(Ordering::Acquire);
        let window = if started_hidden {
            FLUSH_HIDDEN_COALESCE
        } else {
            FLUSH_COALESCE
        };
        let deadline = Instant::now() + window;
        let mut g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if done.load(Ordering::Acquire) {
                return;
            }
            // Only a hidden->visible transition cuts the window short; a leaf
            // that was already visible just serves out its short window.
            if started_hidden && self.visible.load(Ordering::Acquire) {
                return;
            }
            // Cap-aware early flush: the reader signalled the buffer is large,
            // so flush now rather than letting it grow toward MAX_PENDING.
            // swap consumes the one-shot flag (also catches a flag set before we
            // started coalescing, since this runs before the first wait).
            if self.force_flush.swap(false, Ordering::AcqRel) {
                return;
            }
            let now = Instant::now();
            if now >= deadline {
                return;
            }
            let (next, _) = self
                .cv
                .wait_timeout(g, deadline - now)
                .unwrap_or_else(|e| e.into_inner());
            g = next;
        }
    }
}

// Drives one PTY's flusher loop: wait for output, coalesce a
// visibility-dependent window, then hand the whole batched buffer to `emit` in
// arrival order. Extracted from the spawn closure so the coalescing/backpressure
// behavior is unit-testable without a real pty or IPC channel. `emit` returns
// Err when its sink is gone (the frontend closed the channel), ending the loop.
fn run_flusher(
    pending: &(Mutex<Vec<u8>>, Condvar),
    done: &AtomicBool,
    ctrl: &FlushControl,
    mut emit: impl FnMut(Vec<u8>) -> Result<(), ()>,
) {
    let (lock, cv) = pending;
    loop {
        {
            let mut g = lock.lock().unwrap_or_else(|e| e.into_inner());
            while g.is_empty() {
                if done.load(Ordering::Acquire) {
                    return;
                }
                let (next, _) = cv
                    .wait_timeout(g, FLUSH_MAX_IDLE)
                    .unwrap_or_else(|e| e.into_inner());
                g = next;
            }
        }
        // Coalesce a window so a burst flushes as one chunk. Hidden leaves
        // coalesce harder; a hidden->visible flip (or child exit) cuts it short.
        ctrl.coalesce(done);
        let chunk = std::mem::take(&mut *lock.lock().unwrap_or_else(|e| e.into_inner()));
        if chunk.is_empty() {
            continue;
        }
        if emit(chunk).is_err() {
            break;
        }
    }
}

// Append filtered PTY output to the pending buffer for the flusher. On overflow
// the whole backlog is discarded for an OVERFLOW_NOTICE (dropping a partial
// prefix would slice a CSI sequence and corrupt xterm) — returns how many bytes
// were dropped, for the reader's warn log. When the buffer crosses
// FLUSH_FORCE_THRESHOLD it signals the flusher to cut its coalescing window
// short, so a hidden leaf's larger window can't grow the backlog to the drop
// cap: a flood degrades to more/earlier emits, not lost output. Extracted from
// the reader loop so this exact append+signal path is unit-testable.
fn push_pending(
    pending: &(Mutex<Vec<u8>>, Condvar),
    ctrl: &FlushControl,
    bytes: &[u8],
) -> u64 {
    let (lock, cv) = pending;
    let mut dropped = 0u64;
    let (before, after) = {
        let mut g = lock.lock().unwrap_or_else(|e| e.into_inner());
        if g.len() + bytes.len() > MAX_PENDING {
            dropped = g.len() as u64;
            g.clear();
            g.extend_from_slice(OVERFLOW_NOTICE);
        }
        let before = g.len();
        g.extend_from_slice(bytes);
        let after = g.len();
        cv.notify_one();
        (before, after)
    };
    // Signal only on the crossing (once per fill), and after releasing the
    // pending lock so we never hold it across FlushControl's lock. Ordering is
    // always pending->control; nothing takes them the other way, so no deadlock.
    if before <= FLUSH_FORCE_THRESHOLD && after > FLUSH_FORCE_THRESHOLD {
        ctrl.signal_force_flush();
    }
    dropped
}

pub struct Session {
    // Field drop order is intentional. Rust drops fields top-to-bottom:
    //   1. `_job` — on Windows, closing the Job HANDLE fires
    //      KILL_ON_JOB_CLOSE, terminating the pwsh tree before the master
    //      pipe drops. Without this, ClosePseudoConsole in `master`'s Drop
    //      can block waiting for conhost to drain pending output, freezing
    //      the Tauri worker thread that triggered the close.
    //   2. `killer` — best-effort kill (redundant on Windows once Job
    //      closed, but harmless and required on Unix where there is no Job).
    //   3. `writer` — closes the input side of the master pipe.
    //   4. `master` — last; ClosePseudoConsole on Windows. By now the child
    //      is dead and conhost has nothing left to drain.
    #[cfg(windows)]
    _job: Option<super::job::PtyJob>,
    /// PID of the shell process. 0 means unknown; callers must skip checks when 0.
    pub shell_pid: u32,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    // Set by the waiter once the child exits, so pty_open can reap a shell
    // that died before it was registered.
    pub(super) exited: Arc<AtomicBool>,
    // Visibility-aware flusher backpressure. `pty_set_visible` routes here so a
    // hidden leaf's output is coalesced into fewer, bigger main-thread emits.
    flush_control: Arc<FlushControl>,
}

impl Session {
    /// Record whether the owning leaf is currently on screen. A hidden session
    /// coalesces output over a larger window; a hidden->visible flip flushes
    /// the backlog immediately. See `FlushControl`.
    pub(super) fn set_visible(&self, visible: bool) {
        self.flush_control.set_visible(visible);
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        // If the session Arc is dropped without an explicit pty_close (e.g.
        // frontend disconnected, window crashed, dev HMR), the reader/flusher
        // threads would otherwise stay alive forever holding the child. Kill
        // the child here so the reader hits EOF and the threads unwind.
        if let Ok(mut k) = self.killer.lock() {
            let _ = k.kill();
        }
    }
}
// Serializes ConPTY create and close: overlapping pseudoconsole lifecycle
// calls corrupt the new console so its shell never pumps output (issue #356).
#[cfg(windows)]
static CONPTY_LIFECYCLE_LOCK: Mutex<()> = Mutex::new(());

pub(super) fn drop_session(session: Arc<Session>) {
    #[cfg(windows)]
    let _guard = CONPTY_LIFECYCLE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    drop(session);
}

struct ChildKillGuard {
    killer: Option<Box<dyn ChildKiller + Send + Sync>>,
}

impl ChildKillGuard {
    fn new(killer: Box<dyn ChildKiller + Send + Sync>) -> Self {
        Self { killer: Some(killer) }
    }

    fn disarm(&mut self) {
        self.killer = None;
    }
}

impl Drop for ChildKillGuard {
    fn drop(&mut self) {
        if let Some(mut k) = self.killer.take() {
            let _ = k.kill();
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub fn spawn(
    id: u32,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    workspace: WorkspaceEnv,
    blocks: bool,
    shell: Option<String>,
    tmux_session: Option<String>,
    on_data: Channel<Response>,
    on_exit: Channel<i32>,
) -> Result<(Arc<Session>, PtySize), String> {
    #[cfg(windows)]
    let _spawn_guard = CONPTY_LIFECYCLE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd =
        shell_init::build_command(cwd, workspace, blocks, shell, tmux_session)?;
    // Lets a Claude Code statusLine wrapper attribute its stats to this exact
    // tab (see modules::claude). Set parallel to TERAX_TERMINAL so it crosses
    // the same boundaries; harmless over SSH (never reaches the remote host).
    cmd.env("TERAX_PTY_ID", id.to_string());
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    // Kill the child if any of the pipe setup below fails so the spawned shell
    // can't outlive an aborted pty_open.
    let mut guard = ChildKillGuard::new(child.clone_killer());
    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer: Arc<Mutex<Box<dyn Write + Send>>> = Arc::new(Mutex::new(
        pair.master.take_writer().map_err(|e| e.to_string())?,
    ));
    guard.disarm();

    let shell_pid = child.process_id().unwrap_or(0);

    #[cfg(windows)]
    let job = match child.process_id() {
        Some(pid) => match super::job::PtyJob::create_for(pid) {
            Ok(j) => Some(j),
            Err(e) => {
                log::warn!("pty job-object setup failed for pid={pid}: {e}");
                None
            }
        },
        None => None,
    };

    let exited = Arc::new(AtomicBool::new(false));
    let flush_control = Arc::new(FlushControl::new());

    let session = Arc::new(Session {
        #[cfg(windows)]
        _job: job,
        shell_pid,
        killer: Mutex::new(killer),
        writer: writer.clone(),
        master: Mutex::new(pair.master),
        exited: exited.clone(),
        flush_control: flush_control.clone(),
    });

    let pending: Arc<(Mutex<Vec<u8>>, Condvar)> = Arc::new((
        Mutex::new(Vec::with_capacity(READ_BUF)),
        Condvar::new(),
    ));
    let done = Arc::new(AtomicBool::new(false));
    let spawn_at = Instant::now();

    let first_byte = Arc::new(AtomicBool::new(false));

    let pending_r = pending.clone();
    let writer_for_da = writer.clone();
    let app_reader = app.clone();
    let first_byte_r = first_byte;
    let ctrl_r = flush_control.clone();
    let reader_thread = thread::Builder::new()
        .name("terax-pty-reader".into())
        .spawn(move || {
            let mut buf = [0u8; READ_BUF];
            let mut filtered: Vec<u8> = Vec::with_capacity(READ_BUF);
            let mut da_filter = DaFilter::new();
            let mut agent_detect = AgentDetector::new();
            let mut dropped_bytes: u64 = 0;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if !first_byte_r.load(Ordering::Relaxed) {
                            first_byte_r.store(true, Ordering::Release);
                            log::debug!("pty first byte after {}ms", spawn_at.elapsed().as_millis());
                        }
                        agent_detect.process(&buf[..n], |t| {
                            let _ = app_reader.emit(AGENT_EVENT, t.into_signal(id));
                        });
                        filtered.clear();
                        da_filter.process(&buf[..n], &mut filtered, |reply| {
                            if let Ok(mut w) = writer_for_da.lock() {
                                let _ = w.write_all(reply);
                            }
                        });
                        if filtered.is_empty() {
                            continue;
                        }
                        dropped_bytes += push_pending(&pending_r, &ctrl_r, &filtered);
                    }
                    Err(e) => {
                        log::debug!("pty reader ended: {e}");
                        break;
                    }
                }
            }
            agent_detect.finish(|t| {
                let _ = app_reader.emit(AGENT_EVENT, t.into_signal(id));
            });
            pending_r.1.notify_one();
            if dropped_bytes > 0 {
                log::warn!("pty backpressure: dropped {dropped_bytes} bytes (cap {MAX_PENDING})");
            }
        })
        .expect("spawn pty reader thread");

    let on_data_flush = on_data.clone();
    let pending_f = pending.clone();
    let done_f = done.clone();
    let ctrl_f = flush_control.clone();
    thread::Builder::new()
        .name("terax-pty-flusher".into())
        .spawn(move || {
            run_flusher(&pending_f, &done_f, &ctrl_f, |chunk| {
                on_data_flush.send(Response::new(chunk)).map_err(|e| {
                    log::debug!("pty flusher exiting, channel closed: {e}");
                })
            });
        })
        .expect("spawn pty flusher thread");

    let on_data_exit = on_data;
    let pending_e = pending;
    let done_e = done;
    let app_waiter = app;
    let exited_w = exited;
    let ctrl_e = flush_control;
    thread::Builder::new()
        .name("terax-pty-waiter".into())
        .spawn(move || {
            let code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(e) => {
                    log::warn!("pty child wait failed: {e}");
                    -1
                }
            };
            exited_w.store(true, Ordering::Release);
            // Wait for the reader to hit EOF before taking a final snapshot of
            // `pending`, so the last line of output never races the Exit event.
            #[cfg(windows)]
            {
                let deadline = Instant::now() + Duration::from_millis(50);
                while Instant::now() < deadline && !reader_thread.is_finished() {
                    thread::sleep(Duration::from_millis(5));
                }
            }
            #[cfg(not(windows))]
            if let Err(e) = reader_thread.join() {
                log::error!("pty reader thread panicked: {e:?}");
            }
            let (lock, cv) = &*pending_e;
            let tail = std::mem::take(&mut *lock.lock().unwrap_or_else(|e| e.into_inner()));
            if !tail.is_empty() {
                if let Err(e) = on_data_exit.send(Response::new(tail)) {
                    log::debug!("pty final-data send failed (channel closed): {e}");
                }
            }
            done_e.store(true, Ordering::Release);
            cv.notify_all();
            // The coalescing wait parks on a different condvar than `pending`'s,
            // so wake it too or the flusher lingers a full hidden window before
            // seeing `done`. The tail above is already delivered; this is only
            // for a prompt thread exit.
            ctrl_e.wake();
            if let Err(e) = on_exit.send(code) {
                log::debug!("pty exit send failed (channel closed): {e}");
            }
            if let Some(state) = app_waiter.try_state::<super::PtyState>() {
                if let Some(s) = state.take(id) {
                    drop_session(s);
                }
            }
        })
        .expect("spawn pty waiter thread");

    Ok((session, size))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use portable_pty::CommandBuilder;

    #[test]
    fn drop_kills_child_process() {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).expect("openpty");

        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.arg("-c");
        cmd.arg("sleep 30");
        let mut child = pair.slave.spawn_command(cmd).expect("spawn");
        drop(pair.slave);

        let killer = child.clone_killer();
        let writer: Arc<Mutex<Box<dyn Write + Send>>> =
            Arc::new(Mutex::new(pair.master.take_writer().expect("writer")));

        let session = Arc::new(Session {
            shell_pid: child.process_id().unwrap_or(0),
            killer: Mutex::new(killer),
            writer,
            master: Mutex::new(pair.master),
            exited: Arc::new(AtomicBool::new(false)),
            flush_control: Arc::new(FlushControl::new()),
        });

        assert!(
            child.try_wait().unwrap().is_none(),
            "child must be alive before drop",
        );

        drop(session);

        let deadline = Instant::now() + Duration::from_secs(2);
        let mut exited = false;
        while Instant::now() < deadline {
            if child.try_wait().unwrap().is_some() {
                exited = true;
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(exited, "child still running 2s after Session drop");
    }

    #[test]
    fn drop_session_succeeds_after_child_already_exited() {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).expect("openpty");

        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.arg("-c");
        cmd.arg("exit 0");
        let mut child = pair.slave.spawn_command(cmd).expect("spawn");
        drop(pair.slave);
        let _ = child.wait();

        let killer = child.clone_killer();
        let writer: Arc<Mutex<Box<dyn Write + Send>>> =
            Arc::new(Mutex::new(pair.master.take_writer().expect("writer")));

        let session = Arc::new(Session {
            shell_pid: 0,
            killer: Mutex::new(killer),
            writer,
            master: Mutex::new(pair.master),
            exited: Arc::new(AtomicBool::new(false)),
            flush_control: Arc::new(FlushControl::new()),
        });

        drop_session(session);
    }
}

// Visibility-aware backpressure: FlushControl window sizing, flush-on-visible,
// order preservation and emit-rate reduction. Platform-independent (no pty), so
// unlike the pty tests above these run everywhere.
#[cfg(test)]
mod flush_tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, AtomicUsize};

    // (d) A session that never received a visibility hint must behave exactly as
    // before — i.e. default to visible and use the short window.
    #[test]
    fn default_is_visible() {
        let ctrl = FlushControl::new();
        assert!(
            ctrl.visible.load(Ordering::Acquire),
            "a fresh session must default to visible so it is never throttled without a hint",
        );
    }

    // (a) A visible leaf coalesces only for the short window.
    #[test]
    fn coalesce_visible_uses_short_window() {
        let ctrl = FlushControl::new(); // default visible
        let done = AtomicBool::new(false);
        let t0 = Instant::now();
        ctrl.coalesce(&done);
        let elapsed = t0.elapsed();
        assert!(
            elapsed >= FLUSH_COALESCE,
            "visible window ended too early: {elapsed:?}",
        );
        assert!(
            elapsed < FLUSH_HIDDEN_COALESCE,
            "visible leaf coalesced for the hidden window: {elapsed:?}",
        );
    }

    // (a) A hidden leaf coalesces for the much larger window.
    #[test]
    fn coalesce_hidden_uses_large_window() {
        let ctrl = FlushControl::new();
        ctrl.set_visible(false);
        let done = AtomicBool::new(false);
        let t0 = Instant::now();
        ctrl.coalesce(&done);
        let elapsed = t0.elapsed();
        // Allow a little scheduling slack below the nominal window.
        assert!(
            elapsed >= FLUSH_HIDDEN_COALESCE - Duration::from_millis(8),
            "hidden window ended far too early: {elapsed:?}",
        );
    }

    // (b) A hidden->visible flip mid-window cuts the coalesce short so a tab
    // switch never sits on buffered output.
    #[test]
    fn flip_to_visible_cuts_hidden_window_short() {
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(false);
        let done = Arc::new(AtomicBool::new(false));
        let ctrl_t = ctrl.clone();
        let done_t = done.clone();
        let t0 = Instant::now();
        let h = thread::spawn(move || ctrl_t.coalesce(&done_t));
        // Let the flusher enter its hidden wait, then flip visible.
        thread::sleep(Duration::from_millis(10));
        ctrl.set_visible(true);
        h.join().unwrap();
        let elapsed = t0.elapsed();
        assert!(
            elapsed < FLUSH_HIDDEN_COALESCE,
            "flush-on-visible did not cut the hidden window short: {elapsed:?}",
        );
    }

    // Child exit must also break the coalesce promptly (used for a clean thread
    // exit) rather than waiting out the hidden window.
    #[test]
    fn done_cuts_window_short() {
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(false);
        let done = Arc::new(AtomicBool::new(false));
        let ctrl_t = ctrl.clone();
        let done_t = done.clone();
        let t0 = Instant::now();
        let h = thread::spawn(move || ctrl_t.coalesce(&done_t));
        thread::sleep(Duration::from_millis(10));
        done.store(true, Ordering::Release);
        ctrl.wake();
        h.join().unwrap();
        assert!(
            t0.elapsed() < FLUSH_HIDDEN_COALESCE,
            "child exit did not cut the coalesce short",
        );
    }

    // Feed sequential bytes through run_flusher, flipping visibility partway,
    // and assert every byte arrives exactly once and in order across the flip.
    // (c) Byte order / no loss across a visibility change.
    #[test]
    fn run_flusher_preserves_order_across_visibility_flip() {
        let pending: Arc<(Mutex<Vec<u8>>, Condvar)> =
            Arc::new((Mutex::new(Vec::new()), Condvar::new()));
        let done = Arc::new(AtomicBool::new(false));
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(false); // start hidden

        let out = Arc::new(Mutex::new(Vec::<u8>::new()));

        let pending_f = pending.clone();
        let done_f = done.clone();
        let ctrl_f = ctrl.clone();
        let out_f = out.clone();
        let flusher = thread::spawn(move || {
            run_flusher(&pending_f, &done_f, &ctrl_f, |chunk| {
                out_f
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .extend_from_slice(&chunk);
                Ok(())
            });
        });

        // Push 0..N one byte at a time; flip to visible halfway.
        let total: u16 = 256;
        for i in 0..total {
            {
                let (lock, cv) = &*pending;
                lock.lock().unwrap_or_else(|e| e.into_inner()).push(i as u8);
                cv.notify_one();
            }
            if i == total / 2 {
                ctrl.set_visible(true);
            }
            thread::sleep(Duration::from_millis(1));
        }
        // Give the flusher time to drain the last batch, then stop it.
        thread::sleep(FLUSH_HIDDEN_COALESCE + Duration::from_millis(30));
        done.store(true, Ordering::Release);
        {
            let (lock, cv) = &*pending;
            let _g = lock.lock().unwrap_or_else(|e| e.into_inner());
            cv.notify_all();
        }
        ctrl.wake();
        flusher.join().unwrap();

        let got = out.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let expected: Vec<u8> = (0..total).map(|i| i as u8).collect();
        assert_eq!(
            got, expected,
            "bytes must arrive exactly once, in order, across the visibility flip",
        );
    }

    // Count emits produced by feeding a steady byte stream for a fixed wall
    // time under a given visibility.
    fn count_emits_over(duration: Duration, visible: bool) -> u32 {
        let pending: Arc<(Mutex<Vec<u8>>, Condvar)> =
            Arc::new((Mutex::new(Vec::new()), Condvar::new()));
        let done = Arc::new(AtomicBool::new(false));
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(visible);
        let emits = Arc::new(AtomicU32::new(0));

        let pending_f = pending.clone();
        let done_f = done.clone();
        let ctrl_f = ctrl.clone();
        let emits_f = emits.clone();
        let flusher = thread::spawn(move || {
            run_flusher(&pending_f, &done_f, &ctrl_f, |_chunk| {
                emits_f.fetch_add(1, Ordering::Relaxed);
                Ok(())
            });
        });

        let start = Instant::now();
        while start.elapsed() < duration {
            {
                let (lock, cv) = &*pending;
                lock.lock().unwrap_or_else(|e| e.into_inner()).push(0);
                cv.notify_one();
            }
            thread::sleep(Duration::from_millis(1));
        }
        done.store(true, Ordering::Release);
        {
            let (lock, cv) = &*pending;
            let _g = lock.lock().unwrap_or_else(|e| e.into_inner());
            cv.notify_all();
        }
        ctrl.wake();
        flusher.join().unwrap();
        emits.load(Ordering::Relaxed)
    }

    // The whole point of the feature: for identical output a hidden leaf emits
    // to the main thread far less often than a visible one.
    #[test]
    fn hidden_emits_far_less_than_visible() {
        let dur = FLUSH_HIDDEN_COALESCE * 4;
        let visible = count_emits_over(dur, true);
        let hidden = count_emits_over(dur, false);
        assert!(
            hidden < visible,
            "hidden must emit fewer chunks than visible (hidden={hidden}, visible={visible})",
        );
        // With a 16x-larger window the reduction is dramatic, not marginal; a 3x
        // floor keeps the assertion robust against scheduling jitter.
        assert!(
            hidden * 3 <= visible,
            "hidden emit rate not meaningfully reduced (hidden={hidden}, visible={visible})",
        );
    }

    // A pending buffer that grew large signals the flusher to cut a hidden
    // window short (cap-aware early flush), like the visibility flip does.
    #[test]
    fn force_flush_cuts_hidden_window_short() {
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(false);
        let done = Arc::new(AtomicBool::new(false));
        let ctrl_t = ctrl.clone();
        let done_t = done.clone();
        let t0 = Instant::now();
        let h = thread::spawn(move || ctrl_t.coalesce(&done_t));
        thread::sleep(Duration::from_millis(10));
        ctrl.signal_force_flush();
        h.join().unwrap();
        assert!(
            t0.elapsed() < FLUSH_HIDDEN_COALESCE,
            "force-flush did not cut the hidden coalescing window short",
        );
    }

    // The hard AC: a fast writer on a HIDDEN leaf must not lose output. Drives
    // the real push_pending + run_flusher path (push_pending both discards on
    // overflow AND signals the early flush), floods several MiB while hidden,
    // and asserts no drop happened — every byte arrives and no OVERFLOW_NOTICE
    // (ESC 'c') appears — because early flush keeps the buffer below the cap.
    #[test]
    fn hidden_flood_stays_under_cap_without_loss() {
        let pending: Arc<(Mutex<Vec<u8>>, Condvar)> =
            Arc::new((Mutex::new(Vec::new()), Condvar::new()));
        let done = Arc::new(AtomicBool::new(false));
        let ctrl = Arc::new(FlushControl::new());
        ctrl.set_visible(false); // hidden: the 64ms window would otherwise grow the backlog

        let received = Arc::new(Mutex::new(Vec::<u8>::new()));
        let max_chunk = Arc::new(AtomicUsize::new(0));

        let pending_f = pending.clone();
        let done_f = done.clone();
        let ctrl_f = ctrl.clone();
        let received_f = received.clone();
        let max_chunk_f = max_chunk.clone();
        let flusher = thread::spawn(move || {
            run_flusher(&pending_f, &done_f, &ctrl_f, |chunk| {
                max_chunk_f.fetch_max(chunk.len(), Ordering::Relaxed);
                received_f
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .extend_from_slice(&chunk);
                Ok(())
            });
        });

        // Flood 8 MiB in 64-KiB blocks of a known non-ESC byte via the real
        // push_pending. A small yield each block lets the flusher drain between
        // threshold crossings, as a real pipe would pace the reader.
        let block = vec![0xABu8; 64 * 1024];
        let block_count = 128usize; // 8 MiB total, 2x the 4 MiB cap
        for _ in 0..block_count {
            push_pending(&pending, &ctrl, &block);
            thread::sleep(Duration::from_micros(50));
        }
        // Let the flusher drain the tail, then stop it.
        thread::sleep(Duration::from_millis(150));
        done.store(true, Ordering::Release);
        {
            let (lock, cv) = &*pending;
            let _g = lock.lock().unwrap_or_else(|e| e.into_inner());
            cv.notify_all();
        }
        ctrl.wake();
        flusher.join().unwrap();

        let got = received.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(
            got.len(),
            block_count * block.len(),
            "hidden flood lost output (got {} of {} bytes)",
            got.len(),
            block_count * block.len(),
        );
        assert!(
            !got.contains(&0x1b),
            "OVERFLOW_NOTICE present: the hidden buffer hit the drop cap",
        );
        assert!(
            max_chunk.load(Ordering::Relaxed) < MAX_PENDING,
            "a single chunk approached the drop cap ({} bytes); early flush failed",
            max_chunk.load(Ordering::Relaxed),
        );
    }
}
