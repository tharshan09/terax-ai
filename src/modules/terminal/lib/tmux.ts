import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv, type WorkspaceEnv } from "@/modules/workspace";

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
