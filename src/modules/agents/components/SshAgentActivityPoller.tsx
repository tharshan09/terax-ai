import { useClaudeStatsStore } from "@/modules/statusbar/lib/claudeStatsStore";
import type { Tab } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import {
  collectSshAgentLeaves,
  type LeafAgentState,
  planSshAgentUpdates,
  SSH_AGENT_POLL_MS,
  type SshAgentAction,
  type SshAgentLeaf,
} from "../lib/sshAgentPoll";
import { useAgentStore } from "../store/agentStore";

/**
 * Drives the per-tab activity indicator for SSH agents. Polls the Claude
 * stats files (one batched remote exec per host per tick, riding the shared
 * ControlMaster) and feeds working/idle into agentStore keyed by leafId.
 * Gated on the Claude stats opt-in, which is what installs the statusLine
 * wrapper on connected hosts in the first place. Renders nothing.
 */
export function SshAgentActivityPoller({ tabs }: { tabs: Tab[] }) {
  const enabled = useClaudeStatsStore((s) => s.enabled) === true;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const stateRef = useRef<Map<number, LeafAgentState>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const leaves = collectSshAgentLeaves(tabsRef.current);
        const tsByLeaf = await pollHosts(leaves);
        if (cancelled) return;
        const { actions, state } = planSshAgentUpdates(
          leaves,
          tsByLeaf,
          stateRef.current,
          Date.now(),
        );
        stateRef.current = state;
        applyActions(actions);
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), SSH_AGENT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      // Toggle-off / unmount: release the sessions this poller owns so no
      // tab keeps a frozen spinner.
      const store = useAgentStore.getState();
      for (const [leafId, s] of stateRef.current) {
        if (s.inStore) store.finish(leafId);
      }
      stateRef.current = new Map();
    };
  }, [enabled]);

  return null;
}

type BatchStatus = { ts: number | null } | null;

/** One `claude_status_batch` per host, in parallel; a failed host reads as
 *  all-absent so the plan degrades to idle instead of throwing. */
async function pollHosts(
  leaves: SshAgentLeaf[],
): Promise<Map<number, number | null>> {
  const byHost = new Map<string, SshAgentLeaf[]>();
  for (const leaf of leaves) {
    const group = byHost.get(leaf.host);
    if (group) group.push(leaf);
    else byHost.set(leaf.host, [leaf]);
  }

  const tsByLeaf = new Map<number, number | null>();
  await Promise.all(
    [...byHost].map(async ([host, hostLeaves]) => {
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
      const tsBySession = new Map(
        sessions.map((s, i) => [s, statuses[i]?.ts ?? null] as const),
      );
      for (const leaf of hostLeaves) {
        tsByLeaf.set(leaf.leafId, tsBySession.get(leaf.session) ?? null);
      }
    }),
  );
  return tsByLeaf;
}

function applyActions(actions: SshAgentAction[]): void {
  if (actions.length === 0) return;
  const store = useAgentStore.getState();
  for (const action of actions) {
    switch (action.kind) {
      case "start":
        store.start(action.leafId, action.tabId, "claude");
        break;
      case "status":
        store.setStatus(action.leafId, action.status);
        break;
      case "finish":
        store.finish(action.leafId);
        break;
    }
  }
}
