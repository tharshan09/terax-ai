import type { Tab } from "@/modules/tabs";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";

/**
 * Agents inside tmux emit no OSC hook markers Terax can see: over SSH the
 * remote bootstrap only forwards OSC 7, and a local tmux session's markers are
 * swallowed by tmux itself. For both, the per-tab activity indicator and the
 * Mission Control roster are derived from two signals riding one batched exec
 * per host: the Claude stats file the statusLine wrapper writes while Claude
 * renders, and the session's foreground pane command. This module is the pure
 * core: which leaves to poll, and how the observed signals map onto agentStore
 * transitions. The polling component stays thin.
 *
 * PRESENCE (pane command names a known agent) keeps a session in the store —
 * an idle Claude sitting at its prompt stays listed in Mission Control, it
 * just shows no spinner. WORKING is inferred purely from a CHANGED `ts`
 * between polls: the wrapper only rewrites the file while Claude renders, so
 * a moving `ts` means active work. This is immune to host/local clock skew
 * (no wall-clock comparison). A moving `ts` also keeps a session alive when
 * presence detection misses (unknown process name), so the spinner never
 * regresses below the old behavior. "needs input" detection for polled leaves
 * is a deliberate follow-up (neither signal carries it).
 */

/** Which poller flavor drives a leaf; doubles as the agentStore origin so the
 *  OSC detector and the poller never fight over one leaf. */
export type PollOrigin = "ssh" | "local-tmux";

export type SshAgentLeaf = {
  leafId: number;
  tabId: number;
  /** SSH host, or `local` for a managed local tmux leaf (display value only;
   *  polling groups key on origin+host, so a real host named "local" cannot
   *  collide). */
  host: string;
  session: string;
  origin: PollOrigin;
};

export const SSH_AGENT_POLL_MS = 3000;

/** How long a working verdict survives without new evidence. Rides out a
 *  missed poll or a short statusLine render gap without flapping the spinner,
 *  then releases the session. */
export const WORKING_HOLD_MS = 7000;

/** Every pollable leaf across all terminal tabs, cold (restored, unmounted)
 *  tabs included: their session may be live, and the indicator reads purely
 *  from tab state. SSH and local tabs contribute every tmux-bound leaf
 *  (managed or the user's own — tmux swallows OSC markers for both); a plain
 *  local tab stays on the OSC detector path. */
export function collectSshAgentLeaves(tabs: Tab[]): SshAgentLeaf[] {
  const out: SshAgentLeaf[] = [];
  for (const tab of tabs) {
    if (tab.kind !== "terminal") continue;
    if (tab.workspace?.kind === "ssh") {
      collectLeaves(tab.paneTree, tab.id, tab.workspace.host, "ssh", out);
    } else if (!tab.workspace || tab.workspace.kind === "local") {
      collectLeaves(tab.paneTree, tab.id, "local", "local-tmux", out);
    }
  }
  return out;
}

function collectLeaves(
  node: PaneNode,
  tabId: number,
  host: string,
  origin: PollOrigin,
  out: SshAgentLeaf[],
): void {
  if (isLeaf(node)) {
    const session = node.tmuxSession;
    if (session) {
      out.push({ leafId: node.id, tabId, host, session, origin });
    }
    return;
  }
  for (const child of node.children) {
    collectLeaves(child, tabId, host, origin, out);
  }
}

/** Known coding-agent CLIs by the foreground command tmux reports. Claude
 *  Code's CLI names its process after its own version ("2.1.201"), so a
 *  dotted version number IS the Claude signature. */
const AGENT_COMMANDS = new Set(["claude", "codex", "gemini", "aider"]);

export function agentFromPaneCommand(
  cmd: string | null | undefined,
): string | null {
  if (!cmd) return null;
  if (/^\d+\.\d+\.\d+/.test(cmd)) return "claude";
  return AGENT_COMMANDS.has(cmd) ? cmd : null;
}

/** Group leaves per poll target (origin + host) so each SSH host is polled in
 *  one batched remote exec and local managed leaves in one batched file read.
 *  Keying on origin too keeps an SSH host that happens to be named "local"
 *  from merging with the local group. */
export function groupLeavesByHost(
  leaves: SshAgentLeaf[],
): Map<string, SshAgentLeaf[]> {
  const byHost = new Map<string, SshAgentLeaf[]>();
  for (const leaf of leaves) {
    const key = `${leaf.origin}:${leaf.host}`;
    const group = byHost.get(key);
    if (group) group.push(leaf);
    else byHost.set(key, [leaf]);
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
  | {
      kind: "start";
      leafId: number;
      tabId: number;
      origin: PollOrigin;
      agent: string;
    }
  | { kind: "working"; leafId: number }
  | { kind: "idle"; leafId: number }
  | { kind: "finish"; leafId: number };

export type SshAgentPlan = {
  actions: SshAgentAction[];
  state: Map<number, LeafAgentState>;
};

/**
 * Plan agentStore transitions for one host's leaves in a single poll round.
 * `oscOwned` is the set of leaves the local OSC detector already drives (e.g. a
 * remote host with Claude hooks installed): the poller defers to that richer
 * path entirely and never touches those sessions. Returns the
 * COMPLETE next state for the passed leaves; a leaf omitted from `state` has
 * been released and its tracking dropped.
 */
export function planHostAgentUpdates(
  leaves: SshAgentLeaf[],
  tsByLeaf: ReadonlyMap<number, number | null>,
  agentByLeaf: ReadonlyMap<number, string | null>,
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

    const agent = agentByLeaf.get(leaf.leafId) ?? null;
    const ts = tsByLeaf.get(leaf.leafId) ?? null;
    const changed =
      ts !== null && before?.lastTs != null && ts !== before.lastTs;

    const workingUntilMs = changed
      ? nowMs + WORKING_HOLD_MS
      : (before?.workingUntilMs ?? 0);
    const working = nowMs < workingUntilMs;

    // Presence keeps the session alive (idle at worst); a moving ts keeps it
    // alive even when presence detection misses. Only both gone finishes it.
    let inStore = before?.inStore ?? false;
    if (agent !== null || working) {
      if (!inStore) {
        actions.push({
          kind: "start",
          leafId: leaf.leafId,
          tabId: leaf.tabId,
          origin: leaf.origin,
          agent: agent ?? "claude",
        });
        inStore = true;
      }
      actions.push(
        working
          ? { kind: "working", leafId: leaf.leafId }
          : { kind: "idle", leafId: leaf.leafId },
      );
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
