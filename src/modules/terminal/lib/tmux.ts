import { invoke } from "@tauri-apps/api/core";
import {
  currentWorkspaceEnv,
  LOCAL_WORKSPACE,
  type WorkspaceEnv,
} from "@/modules/workspace";

export type TmuxSession = {
  name: string;
  windows: number;
  attached: boolean;
  /** Unix seconds of the last attach, or null if never attached. */
  lastAttached: number | null;
  /** False when the name has characters Terax cannot safely attach; the
   *  switcher lists it but disables the attach actions. */
  attachable: boolean;
};

// Mirror of the Rust allowlist (src-tauri `is_valid_session_name`). The two must
// stay in lockstep: the backend rejects anything else as a hard error, so the UI
// only offers attach/create for names this accepts.
const SESSION_NAME = /^[A-Za-z0-9_-]+$/;

export function isValidSessionName(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("-") &&
    SESSION_NAME.test(trimmed)
  );
}

/** Coerce free-form input into an allowlist-safe session name: runs of
 *  disallowed characters (spaces, dots, ...) collapse to a single hyphen, then
 *  stray leading/trailing hyphens are trimmed. So "test 1" becomes "test-1".
 *  Returns "" when nothing usable remains. */
export function sanitizeSessionName(input: string): string {
  return input
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/** A short, allowlist-safe session name not already in `existing`. Used when the
 *  user opens "New session" without typing a name (blank is allowed). */
export function autoSessionName(existing: string[]): string {
  const taken = new Set(existing);
  for (let i = 1; i < 10000; i++) {
    const name = `s${i}`;
    if (!taken.has(name)) return name;
  }
  return `s${taken.size + 1}`;
}

/** Compact relative time ("now", "5m", "2h", "3d") for a unix-seconds instant.
 *  Returns "" for null. `nowMs` is injectable so it can be tested deterministically. */
export function relativeTime(
  unixSeconds: number | null,
  nowMs: number = Date.now(),
): string {
  if (unixSeconds == null) return "";
  const diff = Math.floor(nowMs / 1000) - unixSeconds;
  if (diff < 45) return "now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diff / 3600);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** List the tmux sessions on the workspace's host. Resolves to an empty list
 *  (never rejects) when no terminal to an SSH host is open yet. */
export function listTmuxSessions(
  workspace: WorkspaceEnv = currentWorkspaceEnv(),
): Promise<TmuxSession[]> {
  return invoke<TmuxSession[]>("tmux_list_sessions", { workspace });
}

/** Kill a tmux session on the workspace's host. Idempotent on the backend
 *  (an already-gone session resolves as success). Rejects on a real failure. */
export function killTmuxSession(
  workspace: WorkspaceEnv | undefined,
  name: string,
): Promise<void> {
  return invoke("tmux_kill_session", {
    workspace: workspace ?? currentWorkspaceEnv(),
    name,
  });
}

/** Rename a tmux session on the workspace's host. Rejects if the target name
 *  is already taken. */
export function renameTmuxSession(
  workspace: WorkspaceEnv | undefined,
  from: string,
  to: string,
): Promise<void> {
  return invoke("tmux_rename_session", {
    workspace: workspace ?? currentWorkspaceEnv(),
    from,
    to,
  });
}

/** Active-pane cwd of `session` on the workspace's host, used to follow `cd`
 *  under tmux (which swallows the inner shell's OSC 7). Resolves to "" (a
 *  silent skip for the poller) when no ControlMaster is open yet or the session
 *  is gone; rejects only on a real backend failure. */
export function tmuxPaneCwd(
  workspace: WorkspaceEnv | undefined,
  session: string,
): Promise<string> {
  return invoke<string>("tmux_pane_cwd", {
    workspace: workspace ?? currentWorkspaceEnv(),
    session,
  });
}

/** Whether a (possibly slow) tmux pane-cwd poll response still applies to the
 *  leaf/session the user is looking at. The async round-trip can resolve after
 *  the user switched tab, split, or reattached a different session; applying a
 *  stale path then would bleed one repo's cwd onto another. Compared against the
 *  live active terminal tab at resolution time. */
export function isCurrentTmuxTarget(
  current:
    | { id: number; activeLeafId?: number; tmuxSession?: string }
    | null
    | undefined,
  expected: { tabId: number; leafId: number; session: string },
): boolean {
  return (
    !!current &&
    current.id === expected.tabId &&
    current.activeLeafId === expected.leafId &&
    current.tmuxSession === expected.session
  );
}

/** The tmux-bound terminal leaf whose live `pane_current_path` the explorer and
 *  source-control should follow. */
export type TmuxPollTarget = {
  workspace: WorkspaceEnv;
  session: string;
  leafId: number;
  tabId: number;
};

type PollTab = {
  kind: string;
  id: number;
  workspace?: WorkspaceEnv;
  tmuxSession?: string;
  activeLeafId?: number | null;
};

/** Pick the terminal leaf the tmux pane-cwd poll should track. tmux swallows the
 *  inner shell's OSC 7, so a `cd` inside tmux only reaches us via
 *  `pane_current_path`; this is as true for local restart-safe tmux tabs as for
 *  SSH ones (a plain shell keeps its OSC 7 path, so it isn't polled). Prefers the
 *  active tmux terminal; failing that, only on an SSH workspace (where the cwd
 *  can't be recovered off a non-terminal tab) falls back to a background terminal
 *  on the ambient host so source-control / history don't snap back to "No
 *  repository". WSL is intentionally excluded (no managed-session path there). */
export function pickTmuxPollTarget(
  active: PollTab | null | undefined,
  tabs: readonly PollTab[],
  workspaceEnv: WorkspaceEnv,
): TmuxPollTarget | null {
  const fromTab = (t: PollTab | null | undefined): TmuxPollTarget | null => {
    if (t?.kind !== "terminal" || !t.tmuxSession || t.activeLeafId == null)
      return null;
    const workspace = t.workspace ?? LOCAL_WORKSPACE;
    if (workspace.kind !== "ssh" && workspace.kind !== "local") return null;
    return {
      workspace,
      session: t.tmuxSession,
      leafId: t.activeLeafId,
      tabId: t.id,
    };
  };
  const activeTarget = fromTab(active);
  if (activeTarget) return activeTarget;
  if (workspaceEnv.kind === "ssh") {
    const host = workspaceEnv.host;
    return (
      fromTab(
        tabs.find(
          (t) =>
            t.kind === "terminal" &&
            t.workspace?.kind === "ssh" &&
            t.workspace.host === host &&
            !!t.tmuxSession &&
            t.activeLeafId != null,
        ),
      ) ?? null
    );
  }
  return null;
}
