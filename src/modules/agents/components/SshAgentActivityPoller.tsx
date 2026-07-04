import { useClaudeStatsStore } from "@/modules/statusbar/lib/claudeStatsStore";
import type { Tab } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
  agentFromPaneCommand,
  collectSshAgentLeaves,
  groupLeavesByHost,
  type LeafAgentState,
  planDepartedLeaves,
  planHostAgentUpdates,
  SSH_AGENT_POLL_MS,
  type SshAgentAction,
  type SshAgentLeaf,
} from "../lib/sshAgentPoll";
import { useAgentStore } from "../store/agentStore";

/**
 * Drives the per-tab activity indicator and the Mission Control roster for
 * agents tmux hides from the OSC detector: SSH tabs (one batched remote exec
 * per host per tick, riding the shared ControlMaster) and every local tmux
 * tab (one batched local read per tick). Feeds start/working/idle/finish into
 * agentStore keyed by leafId — presence (the pane's foreground command) keeps
 * an idle agent listed; a moving stats ts drives the spinner. Gated on the
 * Claude stats opt-in, which is what installs the statusLine wrapper (locally
 * and on connected hosts) in the first place. Renders nothing.
 *
 * Hosts are polled independently: a wedged host (socket alive but the command
 * hangs) only stalls its own leaves, never the others, and its own in-flight
 * guard stops a second exec from piling up behind it. A watchdog force-
 * releases a group whose exec blocks for too many ticks, so even that host's
 * own spinner cannot freeze until the SSH-level timeout bites.
 */
/** Consecutive blocked ticks (≈3s each) before a group's in-flight exec is
 *  declared wedged and force-released, so a hung remote command cannot freeze
 *  a "working" spinner indefinitely. Deliberately a poller-side watchdog: a
 *  timeout inside run_remote_capture would also cut off legitimately slow
 *  git/fs operations that share that path. */
const WATCHDOG_STUCK_TICKS = 10;

export function SshAgentActivityPoller({ tabs }: { tabs: Tab[] }) {
  const enabled = useClaudeStatsStore((s) => s.enabled) === true;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // All tracking is effect-local: a torn-down effect's late completion must
    // never release or mutate a successor effect's guards (a shared ref's
    // `finally` did exactly that on a rapid pref toggle).
    const state = new Map<number, LeafAgentState>();
    const inFlight = new Set<string>();
    // Watchdog bookkeeping per poll group: how many ticks its exec has been
    // blocking, and an epoch that invalidates a force-released exec's late
    // completion (the wedged invoke may still resolve minutes later).
    const stuckTicks = new Map<string, number>();
    const epochs = new Map<string, number>();

    const pollHost = async (groupKey: string, hostLeaves: SshAgentLeaf[]) => {
      if (inFlight.has(groupKey)) return;
      inFlight.add(groupKey);
      const epoch = epochs.get(groupKey) ?? 0;
      const fresh = () => (epochs.get(groupKey) ?? 0) === epoch;
      try {
        const { host, origin } = hostLeaves[0];
        const sessions = [...new Set(hostLeaves.map((l) => l.session))];
        let statuses: BatchStatus[];
        try {
          statuses =
            origin === "local-tmux"
              ? await invoke<BatchStatus[]>("claude_status_batch_local", {
                  tmuxSessions: sessions,
                })
              : await invoke<BatchStatus[]>("claude_status_batch", {
                  host,
                  tmuxSessions: sessions,
                });
        } catch {
          // An IPC failure says nothing about the host. Skip the round rather
          // than reporting "absent", which would finish every live agent row.
          return;
        }
        if (cancelled || !fresh()) return;
        const tsBySession = new Map(
          sessions.map((s, i) => [s, statuses[i]?.ts ?? null] as const),
        );
        const agentBySession = new Map(
          sessions.map(
            (s, i) =>
              [s, agentFromPaneCommand(statuses[i]?.paneCommand)] as const,
          ),
        );
        const tsByLeaf = new Map(
          hostLeaves.map((l) => [l.leafId, tsBySession.get(l.session) ?? null]),
        );
        const agentByLeaf = new Map(
          hostLeaves.map(
            (l) => [l.leafId, agentBySession.get(l.session) ?? null] as const,
          ),
        );
        const { actions, state: next } = planHostAgentUpdates(
          hostLeaves,
          tsByLeaf,
          agentByLeaf,
          state,
          Date.now(),
          oscOwnedLeaves(),
        );
        // Replace this host's slice of the tracking map: leaves the plan
        // dropped (released or relinquished to OSC) fall out.
        for (const l of hostLeaves) state.delete(l.leafId);
        for (const [leafId, s] of next) state.set(leafId, s);
        applyActions(actions);
      } finally {
        // After a watchdog force-release the slot may already belong to a new
        // exec; only the exec that still owns its epoch may free the guard.
        if (fresh()) inFlight.delete(groupKey);
      }
    };

    // A group whose exec has been blocking for WATCHDOG_STUCK_TICKS ticks is
    // wedged (socket alive, command hung): release its sessions so the spinner
    // dies with the host, bump the epoch so the hung exec's eventual return is
    // discarded, and free the guard so the next tick can try again.
    const releaseWedged = (groupKey: string, hostLeaves: SshAgentLeaf[]) => {
      epochs.set(groupKey, (epochs.get(groupKey) ?? 0) + 1);
      inFlight.delete(groupKey);
      stuckTicks.delete(groupKey);
      const finishes: SshAgentAction[] = [];
      for (const l of hostLeaves) {
        if (state.get(l.leafId)?.inStore) {
          finishes.push({ kind: "finish", leafId: l.leafId });
        }
        state.delete(l.leafId);
      }
      applyActions(finishes);
    };

    const tick = () => {
      if (cancelled || document.hidden) return;
      const leaves = collectSshAgentLeaves(tabsRef.current);
      const present = new Set(leaves.map((l) => l.leafId));
      applyActions(planDepartedLeaves(present, state));
      for (const leafId of [...state.keys()]) {
        if (!present.has(leafId)) state.delete(leafId);
      }
      for (const [groupKey, hostLeaves] of groupLeavesByHost(leaves)) {
        if (inFlight.has(groupKey)) {
          const blocked = (stuckTicks.get(groupKey) ?? 0) + 1;
          stuckTicks.set(groupKey, blocked);
          if (blocked >= WATCHDOG_STUCK_TICKS) {
            releaseWedged(groupKey, hostLeaves);
          }
          continue;
        }
        stuckTicks.delete(groupKey);
        void pollHost(groupKey, hostLeaves);
      }
    };

    tick();
    const timer = window.setInterval(tick, SSH_AGENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      // Toggle-off / unmount: release only the sessions this poller owns so no
      // tab keeps a frozen spinner and no OSC-owned session is disturbed.
      const store = useAgentStore.getState();
      for (const [leafId, s] of state) {
        if (s.inStore && pollerOwns(store.sessions[leafId]?.origin)) {
          store.finish(leafId);
        }
      }
      state.clear();
      inFlight.clear();
    };
  }, [enabled]);

  return null;
}

type BatchStatus = { ts: number | null; paneCommand?: string | null } | null;

/** Whether an agentStore session origin belongs to this poller (either
 *  flavor), as opposed to the richer OSC detector. */
function pollerOwns(origin: string | undefined): boolean {
  return origin === "ssh" || origin === "local-tmux";
}

/** Leaves the local OSC detector currently drives; the poller defers to them. */
function oscOwnedLeaves(): Set<number> {
  const owned = new Set<number>();
  for (const s of Object.values(useAgentStore.getState().sessions)) {
    if (s.origin === "osc") owned.add(s.leafId);
  }
  return owned;
}

function applyActions(actions: SshAgentAction[]): void {
  if (actions.length === 0) return;
  const store = useAgentStore.getState();
  for (const action of actions) {
    switch (action.kind) {
      case "start":
        store.start(action.leafId, action.tabId, action.agent, action.origin);
        break;
      case "working":
        store.setStatus(action.leafId, "working");
        break;
      case "idle":
        // Same ownership rule as finish: never touch an OSC-driven session.
        if (pollerOwns(store.sessions[action.leafId]?.origin)) {
          store.setStatus(action.leafId, "idle");
        }
        break;
      case "finish":
        // Never delete a session the OSC detector has since taken over.
        if (pollerOwns(store.sessions[action.leafId]?.origin)) {
          store.finish(action.leafId);
        }
        break;
    }
  }
}
