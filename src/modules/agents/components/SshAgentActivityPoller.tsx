import { useClaudeStatsStore } from "@/modules/statusbar/lib/claudeStatsStore";
import type { Tab } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
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
 * Drives the per-tab activity indicator for SSH agents. Polls the Claude stats
 * files (one batched remote exec per host per tick, riding the shared
 * ControlMaster) and feeds working/finish into agentStore keyed by leafId.
 * Gated on the Claude stats opt-in, which is what installs the statusLine
 * wrapper on connected hosts in the first place. Renders nothing.
 *
 * Hosts are polled independently: a wedged host (socket alive but the command
 * hangs) only stalls its own leaves, never the others, and its own in-flight
 * guard stops a second exec from piling up behind it.
 */
export function SshAgentActivityPoller({ tabs }: { tabs: Tab[] }) {
  const enabled = useClaudeStatsStore((s) => s.enabled) === true;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const stateRef = useRef<Map<number, LeafAgentState>>(new Map());
  const inFlightHostsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const state = stateRef.current;
    const inFlight = inFlightHostsRef.current;

    const pollHost = async (host: string, hostLeaves: SshAgentLeaf[]) => {
      if (inFlight.has(host)) return;
      inFlight.add(host);
      try {
        const sessions = [...new Set(hostLeaves.map((l) => l.session))];
        let statuses: BatchStatus[] = [];
        try {
          statuses = await invoke<BatchStatus[]>("claude_status_batch", {
            host,
            tmuxSessions: sessions,
          });
        } catch {
          statuses = [];
        }
        if (cancelled) return;
        const tsBySession = new Map(
          sessions.map((s, i) => [s, statuses[i]?.ts ?? null] as const),
        );
        const tsByLeaf = new Map(
          hostLeaves.map((l) => [l.leafId, tsBySession.get(l.session) ?? null]),
        );
        const { actions, state: next } = planHostAgentUpdates(
          hostLeaves,
          tsByLeaf,
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
        inFlight.delete(host);
      }
    };

    const tick = () => {
      if (cancelled || document.hidden) return;
      const leaves = collectSshAgentLeaves(tabsRef.current);
      const present = new Set(leaves.map((l) => l.leafId));
      applyActions(planDepartedLeaves(present, state));
      for (const leafId of [...state.keys()]) {
        if (!present.has(leafId)) state.delete(leafId);
      }
      for (const [host, hostLeaves] of groupLeavesByHost(leaves)) {
        void pollHost(host, hostLeaves);
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
        if (s.inStore && store.sessions[leafId]?.origin === "ssh") {
          store.finish(leafId);
        }
      }
      state.clear();
      inFlight.clear();
    };
  }, [enabled]);

  return null;
}

type BatchStatus = { ts: number | null } | null;

/** Leaves the local OSC detector currently drives; the poller defers to them. */
function oscOwnedLeaves(): Set<number> {
  const owned = new Set<number>();
  for (const s of Object.values(useAgentStore.getState().sessions)) {
    if (s.origin !== "ssh") owned.add(s.leafId);
  }
  return owned;
}

function applyActions(actions: SshAgentAction[]): void {
  if (actions.length === 0) return;
  const store = useAgentStore.getState();
  for (const action of actions) {
    switch (action.kind) {
      case "start":
        store.start(action.leafId, action.tabId, "claude", "ssh");
        break;
      case "working":
        store.setStatus(action.leafId, "working");
        break;
      case "finish":
        // Never delete a session the OSC detector has since taken over.
        if (store.sessions[action.leafId]?.origin === "ssh") {
          store.finish(action.leafId);
        }
        break;
    }
  }
}
