import { ptyIdForLeaf } from "@/modules/terminal/lib/useTerminalSession";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export type ClaudeStatus = {
  model: string | null;
  contextPct: number | null;
  costUsd: number | null;
  ts: number | null;
};

const POLL_MS = 2000;
// statusLine refreshes while Claude renders; after this long with no write we
// treat the stats as gone (session exited or moved on).
const STALE_SECONDS = 60;

/**
 * Polls the per-tab Claude Code stats the statusLine wrapper writes, for the
 * active terminal tab. No-op (and no polling) unless `enabled` - so when no
 * Claude widget is shown, this costs nothing. Returns null when stale/absent.
 */
export function useClaudeStatus(
  activeLeafId: number | null,
  enabled: boolean,
): ClaudeStatus | null {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);

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
        const s = await invoke<ClaudeStatus | null>("claude_status", { ptyId });
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
  }, [activeLeafId, enabled]);

  return status;
}
