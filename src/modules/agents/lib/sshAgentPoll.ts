import type { Tab } from "@/modules/tabs";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";

/**
 * SSH agents emit no OSC hook markers (the remote bootstrap only forwards
 * OSC 7), so the per-tab activity indicator is derived from the Claude stats
 * file the statusLine wrapper writes on the host while Claude renders. This
 * module is the pure core: which leaves to poll, and how an observed stats
 * `ts` maps onto agentStore transitions. The polling component stays thin.
 */

export type SshAgentLeaf = {
  leafId: number;
  tabId: number;
  host: string;
  session: string;
};

export const SSH_AGENT_POLL_MS = 3000;

/** First-observation fast path: a wall-clock-fresh `ts` counts as working
 *  before any change has been observed. Kept short because host/local clock
 *  skew makes it unreliable; change detection takes over from the next poll. */
export const WORKING_FRESH_SECONDS = 6;

/** How long a working verdict survives without new evidence. Rides out a
 *  missed poll or a short statusLine gap without flapping the spinner. */
export const WORKING_HOLD_MS = 7000;

/** An agent that stopped writing this long ago is treated as gone: its store
 *  session is removed instead of lingering as idle forever. Matches the
 *  statusbar's stats staleness window. */
export const FORGET_AFTER_MS = 30 * 60 * 1000;

/** Every ssh+tmux leaf across all terminal tabs, cold (restored, unmounted)
 *  tabs included: their remote session may be live, and the indicator reads
 *  purely from tab state. Local tabs stay on the OSC detector path. */
export function collectSshAgentLeaves(tabs: Tab[]): SshAgentLeaf[] {
  const out: SshAgentLeaf[] = [];
  for (const tab of tabs) {
    if (tab.kind !== "terminal" || tab.workspace?.kind !== "ssh") continue;
    const host = tab.workspace.host;
    collectLeaves(tab.paneTree, tab.id, host, out);
  }
  return out;
}

function collectLeaves(
  node: PaneNode,
  tabId: number,
  host: string,
  out: SshAgentLeaf[],
): void {
  if (isLeaf(node)) {
    if (node.tmuxSession) {
      out.push({ leafId: node.id, tabId, host, session: node.tmuxSession });
    }
    return;
  }
  for (const child of node.children) collectLeaves(child, tabId, host, out);
}

/** Per-leaf observation state carried between polls. `lastTs` keeps the last
 *  non-null value so a vanished-then-rewritten file still registers as a
 *  change. `inStore` marks leaves whose agentStore session this poller owns. */
export type LeafAgentState = {
  lastTs: number | null;
  workingUntilMs: number;
  lastWorkingMs: number;
  inStore: boolean;
};

export type SshAgentAction =
  | { kind: "start"; leafId: number; tabId: number }
  | { kind: "status"; leafId: number; status: "working" | "idle" }
  | { kind: "finish"; leafId: number };

export type SshAgentPlan = {
  actions: SshAgentAction[];
  state: Map<number, LeafAgentState>;
};

/**
 * Decide agentStore transitions for one poll round. Working is evidenced by a
 * CHANGED `ts` between polls (immune to host clock skew, since the wrapper
 * only writes while Claude renders); a wall-clock-fresh `ts` bootstraps the
 * very first observation so a mid-run agent is picked up immediately. A leaf
 * that stops producing evidence drops to idle after the hold window and is
 * forgotten entirely after [`FORGET_AFTER_MS`] or when it leaves the tab tree.
 */
export function planSshAgentUpdates(
  leaves: SshAgentLeaf[],
  tsByLeaf: ReadonlyMap<number, number | null>,
  prev: ReadonlyMap<number, LeafAgentState>,
  nowMs: number,
): SshAgentPlan {
  const actions: SshAgentAction[] = [];
  const state = new Map<number, LeafAgentState>();
  const nowSec = nowMs / 1000;

  for (const leaf of leaves) {
    const ts = tsByLeaf.get(leaf.leafId) ?? null;
    const before = prev.get(leaf.leafId);

    const changed =
      ts !== null && before !== undefined && before.lastTs !== null
        ? ts !== before.lastTs
        : false;
    const firstFresh =
      before === undefined &&
      ts !== null &&
      Math.abs(nowSec - ts) < WORKING_FRESH_SECONDS;
    const evidence = changed || firstFresh;

    const next: LeafAgentState = {
      lastTs: ts ?? before?.lastTs ?? null,
      workingUntilMs: evidence
        ? nowMs + WORKING_HOLD_MS
        : (before?.workingUntilMs ?? 0),
      lastWorkingMs: evidence ? nowMs : (before?.lastWorkingMs ?? 0),
      inStore: before?.inStore ?? false,
    };

    const working = evidence || nowMs < next.workingUntilMs;
    if (working) {
      if (!next.inStore) {
        actions.push({ kind: "start", leafId: leaf.leafId, tabId: leaf.tabId });
        next.inStore = true;
      }
      actions.push({ kind: "status", leafId: leaf.leafId, status: "working" });
    } else if (next.inStore) {
      if (nowMs - next.lastWorkingMs > FORGET_AFTER_MS) {
        actions.push({ kind: "finish", leafId: leaf.leafId });
        continue;
      }
      actions.push({ kind: "status", leafId: leaf.leafId, status: "idle" });
    }
    state.set(leaf.leafId, next);
  }

  // Leaves that left the tab tree (tab closed, session unbound): release the
  // sessions this poller owns; plain observations are simply dropped.
  const enumerated = new Set(leaves.map((l) => l.leafId));
  for (const [leafId, before] of prev) {
    if (!enumerated.has(leafId) && before.inStore) {
      actions.push({ kind: "finish", leafId });
    }
  }

  return { actions, state };
}
