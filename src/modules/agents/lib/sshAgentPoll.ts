import type { Tab } from "@/modules/tabs";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";

/**
 * SSH agents emit no OSC hook markers (the remote bootstrap only forwards
 * OSC 7), so the per-tab activity indicator is derived from the Claude stats
 * file the statusLine wrapper writes on the host while Claude renders. This
 * module is the pure core: which leaves to poll, and how observed stats
 * timestamps map onto agentStore transitions. The polling component stays thin.
 *
 * Working is inferred purely from a CHANGED `ts` between polls: the wrapper
 * only rewrites the file while Claude renders, so a moving `ts` means active
 * work. This is immune to host/local clock skew (no wall-clock comparison) and
 * cannot mistake a just-finished session for a live one. The cost is a short
 * warm-up: a genuinely working agent is picked up on the second non-null poll.
 * The indicator only ever shows working (spinner) or nothing; "needs input
 * over SSH" is a deliberate follow-up (the statusLine carries no such signal).
 */

export type SshAgentLeaf = {
  leafId: number;
  tabId: number;
  host: string;
  session: string;
};

export const SSH_AGENT_POLL_MS = 3000;

/** How long a working verdict survives without new evidence. Rides out a
 *  missed poll or a short statusLine render gap without flapping the spinner,
 *  then releases the session. */
export const WORKING_HOLD_MS = 7000;

/** Every ssh+tmux leaf across all terminal tabs, cold (restored, unmounted)
 *  tabs included: their remote session may be live, and the indicator reads
 *  purely from tab state. Local tabs stay on the OSC detector path. */
export function collectSshAgentLeaves(tabs: Tab[]): SshAgentLeaf[] {
  const out: SshAgentLeaf[] = [];
  for (const tab of tabs) {
    if (tab.kind !== "terminal" || tab.workspace?.kind !== "ssh") continue;
    collectLeaves(tab.paneTree, tab.id, tab.workspace.host, out);
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

/** Group leaves by host so each host is polled in one batched remote exec. */
export function groupLeavesByHost(
  leaves: SshAgentLeaf[],
): Map<string, SshAgentLeaf[]> {
  const byHost = new Map<string, SshAgentLeaf[]>();
  for (const leaf of leaves) {
    const group = byHost.get(leaf.host);
    if (group) group.push(leaf);
    else byHost.set(leaf.host, [leaf]);
  }
  return byHost;
}

/** Per-leaf observation state carried between polls. `lastTs` is the last
 *  non-null `ts` seen (retained across a vanished file so a rewrite still
 *  registers as a change); `inStore` marks a leaf whose agentStore session
 *  this poller owns. */
export type LeafAgentState = {
  lastTs: number | null;
  workingUntilMs: number;
  inStore: boolean;
};

export type SshAgentAction =
  | { kind: "start"; leafId: number; tabId: number }
  | { kind: "working"; leafId: number }
  | { kind: "finish"; leafId: number };

export type SshAgentPlan = {
  actions: SshAgentAction[];
  state: Map<number, LeafAgentState>;
};

/**
 * Plan agentStore transitions for one host's leaves in a single poll round.
 * `oscOwned` is the set of leaves the local OSC detector already drives (only
 * possible when a remote host has Claude hooks installed): the poller defers to
 * that richer path entirely and never touches those sessions. Returns the
 * COMPLETE next state for the passed leaves; a leaf omitted from `state` has
 * been released and its tracking dropped.
 */
export function planHostAgentUpdates(
  leaves: SshAgentLeaf[],
  tsByLeaf: ReadonlyMap<number, number | null>,
  prev: ReadonlyMap<number, LeafAgentState>,
  nowMs: number,
  oscOwned: ReadonlySet<number>,
): SshAgentPlan {
  const actions: SshAgentAction[] = [];
  const state = new Map<number, LeafAgentState>();

  for (const leaf of leaves) {
    const before = prev.get(leaf.leafId);

    // The OSC path owns this leaf: relinquish our tracking without finishing
    // its session (that would delete the OSC-owned entry).
    if (oscOwned.has(leaf.leafId)) continue;

    const ts = tsByLeaf.get(leaf.leafId) ?? null;
    const changed =
      ts !== null && before?.lastTs != null && ts !== before.lastTs;

    const workingUntilMs = changed
      ? nowMs + WORKING_HOLD_MS
      : (before?.workingUntilMs ?? 0);
    const working = nowMs < workingUntilMs;

    let inStore = before?.inStore ?? false;
    if (working) {
      if (!inStore) {
        actions.push({ kind: "start", leafId: leaf.leafId, tabId: leaf.tabId });
        inStore = true;
      }
      actions.push({ kind: "working", leafId: leaf.leafId });
    } else if (inStore) {
      actions.push({ kind: "finish", leafId: leaf.leafId });
      inStore = false;
    }

    state.set(leaf.leafId, {
      lastTs: ts ?? before?.lastTs ?? null,
      workingUntilMs,
      inStore,
    });
  }

  return { actions, state };
}

/** Finish actions for owned sessions whose leaf left the tab tree (tab closed,
 *  session unbound). Runs every tick with no I/O; the caller prunes departed
 *  entries from its state map afterwards. */
export function planDepartedLeaves(
  present: ReadonlySet<number>,
  prev: ReadonlyMap<number, LeafAgentState>,
): SshAgentAction[] {
  const actions: SshAgentAction[] = [];
  for (const [leafId, st] of prev) {
    if (st.inStore && !present.has(leafId)) {
      actions.push({ kind: "finish", leafId });
    }
  }
  return actions;
}
