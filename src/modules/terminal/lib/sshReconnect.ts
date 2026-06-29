import type { WorkspaceEnv } from "@/modules/workspace";

/**
 * True when a terminal's PTY exit should be treated as a dropped SSH
 * connection (keep the tab, offer a reconnect) rather than a clean shell exit
 * (close the tab as usual).
 *
 * An SSH terminal that exits non-zero didn't get a user `exit` — the
 * connection was lost (idle timeout, laptop sleep, network change; ssh itself
 * exits 255). The remote tmux session survives on the host regardless, so the
 * tab is kept and Enter respawns it (`ssh … tmux new-session -A`). Local/WSL
 * tabs, and any clean exit (code 0, e.g. the user typed `exit` or detached),
 * close exactly as before.
 */
export function isSshDisconnect(
  workspace: WorkspaceEnv | undefined,
  exitCode: number,
): boolean {
  return workspace?.kind === "ssh" && exitCode !== 0;
}
