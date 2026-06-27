import { ptyIdForLeaf } from "@/modules/terminal/lib/useTerminalSession";
import type { WorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type ClaudeStatus = {
  model: string | null;
  modelId: string | null;
  contextPct: number | null;
  usedTokens: number | null;
  maxTokens: number | null;
  costUsd: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  ts: number | null;
};

const POLL_MS = 2000;
// The statusLine only writes while Claude RENDERS (i.e. when it's active); an
// idle-but-alive session (you're reading its output, or fiddling with the UI)
// stops writing, so a short window would wrongly hide a live session's stats.
// Keep them until a write is this old - long enough to ride out idle gaps,
// short enough that an exited session eventually clears. Switching tab/session
// re-keys the poll and clears stale stats immediately regardless.
const STALE_SECONDS = 30 * 60;

/**
 * Polls the per-tab Claude Code stats the statusLine wrapper writes, for the
 * active terminal tab. No-op (and no polling) unless `enabled` - so when no
 * Claude widget is shown, this costs nothing. Returns null when stale/absent.
 */
export function useClaudeStatus(
  activeLeafId: number | null,
  enabled: boolean,
  workspace?: WorkspaceEnv,
  tmuxSession?: string,
): ClaudeStatus | null {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  // Over SSH the stats live on the host keyed by tmux session; locally they live
  // in a per-PTY file. Primitive deps so the poll restarts only on a real change.
  const sshHost = workspace?.kind === "ssh" ? workspace.host : undefined;

  useEffect(() => {
    if (!enabled || activeLeafId === null) {
      setStatus(null);
      return;
    }
    let cancelled = false;

    const poll = async () => {
      const ptyId = ptyIdForLeaf(activeLeafId);
      if (ptyId === null) {
        if (!cancelled) setStatus(null);
        return;
      }
      try {
        const s = await invoke<ClaudeStatus | null>("claude_status", {
          ptyId,
          workspace: sshHost ? { kind: "ssh", host: sshHost } : undefined,
          tmuxSession,
        });
        if (cancelled) return;
        const fresh =
          s && (s.ts === null || Date.now() / 1000 - s.ts < STALE_SECONDS);
        setStatus(fresh ? s : null);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };

    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeLeafId, enabled, sshHost, tmuxSession]);

  return status;
}
